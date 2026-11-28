"use client";

import { useMemo, useState } from "react";
import { hasCurrentPaymentBypass } from "@/components/data/student-record-file";
import type { FinanceEnrollmentRow } from "@/components/data/program-finances-data";
import type { BillingCheck } from "@/lib/finance/billing-check";
import type { Database } from "@/lib/supabase/types";
import { getCachedSessionSnapshot, loadCachedSession } from "@/lib/client-cache";
import { useCachedQuery } from "@/lib/query-cache";
import { useRefreshOnReturn } from "@/hooks/use-refresh-on-return";
import { cn } from "@/lib/utils";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type CheckResponse = { checks: Record<string, BillingCheck>; checkedAt: string };
type Filter = "attention" | "current";
const filters: Array<[Filter, string]> = [["current", "In order"], ["attention", "Needs attention"]];
const matchesFilter = (group: BillingCheck["group"], filter: Filter) => filter === "attention" ? group !== "current" : group === "current";
const money = (amount: number, currency = "cad") => new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);

function localCheck(row: FinanceEnrollmentRow, program: Program): BillingCheck {
  const base = { bills: [], checkedAt: "" };
  if (hasCurrentPaymentBypass(row) || row.subscription?.payment_waived || row.paymentTerms?.payment_type === "waived") {
    const external = row.request?.payment_bypass_external;
    return { ...base, group: "current", label: external ? "Paid externally" : "Waived", explanation: external ? "Staff recorded payment outside the app." : "Staff waived tuition under the current payment arrangement." };
  }
  if (row.paymentTerms?.payment_type === "free" || !program.is_paid) return { ...base, group: "current", label: "Free", explanation: "No payment is required." };
  if (row.paymentTerms?.status === "paid" && ["pay_in_full", "one_time"].includes(row.paymentTerms.payment_type)) return { ...base, group: "current", label: "Paid in full", explanation: "The approved one-time payment is recorded as settled." };
  return { ...base, group: "review", label: "Setup / records need review", explanation: "No linked recurring subscription or settled payment confirms this arrangement. Open the student file to review it; no overdue amount has been assumed." };
}

export function BillingRoster({ program, rows, onOpenStudent, onRefreshRows }: {
  program: Program; rows: FinanceEnrollmentRow[]; onOpenStudent: (row: FinanceEnrollmentRow, check: BillingCheck) => void; onRefreshRows: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [checkFailure, setCheckFailure] = useState<string | null>(null);
  const viewerId = getCachedSessionSnapshot()?.user.id;
  const { data, error, refetch } = useCachedQuery<CheckResponse>(viewerId ? `billing-check:${program.id}:${viewerId}` : null, async () => {
    try {
      const session = await loadCachedSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(`/api/programs/${program.id}/finance/billing-check`, { method: "POST", headers: { authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check payments.");
      setCheckFailure(null);
      return result as CheckResponse;
    } catch (error) {
      setCheckFailure("Payment checks could not be refreshed.");
      throw error;
    }
  }, { persist: false });
  useRefreshOnReturn(true, refetch);
  const checking = !data && !error;
  const timezone = program.schedule_timezone || "UTC";
  const asOf = data?.checkedAt ?? new Date().toISOString();
  const monthLabel = new Date(asOf).toLocaleDateString("en-CA", { timeZone: timezone, month: "long", year: "numeric" });
  const monthName = new Date(asOf).toLocaleDateString("en-CA", { timeZone: timezone, month: "long" });
  const date = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: timezone, month: "short", day: "numeric" });
  const period = (start: string, end: string) => {
    const endInclusive = new Date(new Date(end).getTime() - 1).toISOString();
    const month = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: timezone, month: "long", year: "numeric" });
    const parts = (value: string) => {
      const fields = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(value));
      const n = (type: string) => Number(fields.find(field => field.type === type)?.value);
      return { day: n("day"), month: n("year") * 12 + n("month") };
    };
    const first = parts(start), last = parts(end);
    if (first.day === 1 && last.day === 1 && last.month - first.month === 1) return month(start);
    return month(start) === month(endInclusive) ? month(start) : `${date(start)} – ${date(endInclusive)}`;
  };
  const entries = useMemo(() => rows.map(row => {
    const live = checkFailure ? undefined : data?.checks[row.enrollment.student_profile_id];
    let check: BillingCheck = row.subscription?.stripe_subscription_id
      ? live ?? { group: "review", label: "Could not verify", explanation: "The linked Stripe subscription has not been checked. Refresh before treating this student as in order.", bills: [], checkedAt: "" }
      : localCheck(row, program);
    const coverage = check.settledPeriod;
    const checkedTime = new Date(asOf).getTime();
    if (coverage && new Date(coverage.start).getTime() <= checkedTime && new Date(coverage.end).getTime() > checkedTime) {
      const coverageMonth = new Date(coverage.start).toLocaleDateString("en-CA", { timeZone: timezone, month: "long", year: "numeric" });
      // Before the 9 am renewal on the first, the previous month's paid period
      // is still current. It must not become a claim that the new month is paid.
      const awaitingRenewal = program.monthly_billing_anchor === "first_of_month" && coverage.interval !== "year" && coverageMonth !== monthLabel;
      const summary = awaitingRenewal ? "Next payment upcoming" : coverage.kind === "adjusted" ? `Nothing due for ${monthName} — bill adjusted`
        : coverage.interval === "year" ? "Covered by annual payment" : program.monthly_billing_anchor === "first_of_month" ? `${monthName} paid` : "Current billing period paid";
      const explanation = awaitingRenewal ? "The previous billing period is settled. The next payment is not due yet." : check.explanation;
      check = { ...check, label: check.group === "current" ? summary : check.label, explanation: check.group === "current" ? explanation : `${summary}. ${check.explanation}` };
    }
    return { row, check };
  }), [asOf, checkFailure, data, monthLabel, monthName, program, rows, timezone]);
  const visible = entries.filter(({ row, check }) => matchesFilter(check.group, filter) && `${row.student?.full_name ?? ""} ${row.parent?.full_name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      // Show confirmed unpaid bills before uncertain records, without mixing the reasons.
      if (filter === "attention" && a.check.group !== b.check.group) return a.check.group === "attention" ? -1 : 1;
      return (a.row.student?.full_name || "Student").localeCompare(b.row.student?.full_name || "Student");
    });
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([refetch(), onRefreshRows()]); } finally { setRefreshing(false); }
  }
  function status(check: BillingCheck) {
    if (check.bills.length) {
      const currency = check.bills[0].currency;
      const sameCurrency = check.bills.every(bill => bill.currency === currency);
      return {
        label: sameCurrency ? money(check.bills.reduce((sum, bill) => sum + bill.amountCents, 0), currency) + " unpaid" : check.bills.length + " unpaid bills",
        detail: check.bills.length === 1 ? period(check.bills[0].periodStart, check.bills[0].periodEnd) : check.bills.length + " bills",
      };
    }
    if (check.group !== "current") return { label: "Check payment", detail: "Not verified" };
    if (check.label === "Covered by annual payment") return { label: "Paid", detail: "Annual" };
    if (check.label.includes("bill adjusted")) return { label: "Nothing due", detail: "" };
    if (/upcoming|not.*due|Nothing due yet/i.test(check.label)) return { label: "Not due yet", detail: check.nextPaymentAt ? "Due " + date(check.nextPaymentAt) : "" };
    if (/paid|Up to date/i.test(check.label) && check.label !== "Paid externally") return { label: "Paid", detail: "" };
    return { label: check.label, detail: "" };
  }
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{monthLabel}</h2>
      <button type="button" disabled={refreshing || checking} onClick={() => void refresh()} aria-label={refreshing ? "Refreshing payments" : "Refresh payments"} title={data ? "Last checked " + new Date(data.checkedAt).toLocaleString("en-CA", { timeZone: timezone }) : "Refresh payments"} className="press-feedback flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F2] focus-visible:outline-2 focus-visible:outline-[#17624F] disabled:opacity-40">
        <svg viewBox="0 0 24 24" className={cn("h-5 w-5", refreshing && "animate-spin")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.6-2L20 9M4 15l2.3 3A7 7 0 0 0 17.9 16" /></svg>
      </button>
    </div>
    <div className="grid grid-cols-2 border-b border-[#DCE3E0]" aria-label="Payment standing">
      {filters.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={cn("press-feedback flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-sm", filter === value ? "border-[#17624F] font-semibold text-[#17624F]" : "border-transparent text-[#657178]")}><span>{label}</span><span className="tabular-nums">{checking ? "—" : entries.filter(entry => matchesFilter(entry.check.group, value)).length}</span></button>)}
    </div>
    <input aria-label="Search student or parent" placeholder="Search student or parent" value={search} onChange={event => setSearch(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-sm focus-visible:outline-[#17624F]" />
    {error || checkFailure ? <p role="status" className="text-sm text-[#845A1E]">Couldn’t refresh payments. Try again.</p> : null}
    {checking ? <p role="status" className="py-8 text-center text-sm text-[#657178]">Checking payments…</p> : <div className="divide-y divide-[#E3E8E6]">
      {visible.map(({ row, check }) => {
        const summary = status(check);
        return <button key={row.enrollment.id} type="button" onClick={() => onOpenStudent(row, check)} className="press-feedback grid min-h-[76px] w-full grid-cols-[minmax(0,1fr)_auto_12px] items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-[#F7F9F8] focus-visible:outline-2 focus-visible:outline-[#17624F] md:gap-6 md:px-3">
          <span className="min-w-0"><span className="block break-words text-sm font-semibold">{row.student?.full_name || "Student"}</span>{row.parent?.full_name ? <span className="mt-1 block break-words text-xs text-[#657178]">Parent: {row.parent.full_name}</span> : null}{row.enrollment.status !== "active" ? <span className="mt-1 block text-xs capitalize text-[#657178]">{row.enrollment.status}</span> : null}</span>
          <span className="max-w-[145px] text-right"><span className={cn("block text-sm font-semibold", check.group === "attention" ? "text-[#B42318]" : check.group === "current" ? "text-[#17624F]" : "text-[#845A1E]")}>{summary.label}</span>{summary.detail ? <span className="mt-1 block text-xs text-[#657178]">{summary.detail}</span> : null}</span>
          <svg viewBox="0 0 16 16" className="h-4 w-3 text-[#8B9992]" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden><path d="m6 3 5 5-5 5" /></svg>
        </button>;
      })}
      {!visible.length ? <p className="py-8 text-center text-sm text-[#657178]">{search ? "No matching students." : !entries.length ? "No enrolled students." : filter === "attention" ? "Everyone checked is in order." : "No students in this list."}</p> : null}
    </div>}
  </div>;
}
