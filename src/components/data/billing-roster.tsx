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
type Filter = "attention" | "current" | "all";
const filters: Array<[Filter, string]> = [["attention", "Needs attention"], ["current", "In order"], ["all", "Everyone"]];
const matchesFilter = (group: BillingCheck["group"], filter: Filter) => filter === "all" || (filter === "attention" ? group !== "current" : group === "current");
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
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortByParent, setSortByParent] = useState(false);
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
  const date = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
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
  const scoped = entries.filter(({ row }) => !activeOnly || row.enrollment.status === "active");
  const visible = scoped.filter(({ row, check }) => matchesFilter(check.group, filter) && `${row.student?.full_name ?? ""} ${row.parent?.full_name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      // Show confirmed unpaid bills before uncertain records, without mixing the reasons.
      if (filter === "attention" && a.check.group !== b.check.group) return a.check.group === "attention" ? -1 : 1;
      return ((sortByParent ? a.row.parent?.full_name : null) || a.row.student?.full_name || "Student").localeCompare((sortByParent ? b.row.parent?.full_name : null) || b.row.student?.full_name || "Student");
    });
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([refetch(), onRefreshRows()]); } finally { setRefreshing(false); }
  }
  function standing(check: BillingCheck) {
    return <div className="min-w-0 space-y-1.5">
      <p className={cn("font-semibold", check.group === "attention" ? "text-[#B42318]" : check.group === "current" ? "text-[#17624F]" : "text-[#845A1E]")}>{check.label}</p>
      {check.bills.map(bill => <p key={bill.id} className="text-sm leading-5 text-[#52616A]"><strong className="font-semibold text-[#26323A]">{money(bill.amountCents, bill.currency)} unpaid</strong> · {period(bill.periodStart, bill.periodEnd)}<br /><span className="text-xs">Due {date(bill.dueAt)}</span></p>)}
      <p className="max-w-md text-xs leading-5 text-[#657178]">{check.explanation}</p>
    </div>;
  }
  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Payment status for {monthLabel}</h2><p className="mt-1 text-sm leading-5 text-[#657178]">See who is in order and who needs attention. Earlier unpaid bills stay visible, even when this month is paid.</p></div>
      <button type="button" disabled={refreshing || checking} onClick={() => void refresh()} className="press-feedback min-h-11 shrink-0 rounded-lg border border-[#CCD7D3] px-3 text-sm font-semibold text-[#17624F] disabled:opacity-50">{refreshing ? "Checking…" : "Refresh"}</button>
    </div>
    {checking ? <p role="status" className="py-8 text-sm text-[#657178]">Checking payment records with Stripe…</p> : <>
      <p role="status" className="text-xs text-[#657178]">{error || checkFailure ? "Could not check payments. Linked subscriptions appear under Needs attention until a refresh succeeds. This does not confirm money is owed." : data ? `Checked ${new Date(data.checkedAt).toLocaleString("en-CA", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Payment records could not be verified."}</p>
      <div className="grid grid-cols-3 gap-x-2 border-b border-[#DCE3E0] sm:gap-x-4" aria-label="Payment standing">
        {filters.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={cn("press-feedback flex min-h-12 flex-wrap items-center justify-between gap-1 border-b-2 px-1 text-sm", filter === value ? "border-[#17624F] font-semibold text-[#17624F]" : "border-transparent text-[#657178]")}><span>{label}</span><span className="tabular-nums">{scoped.filter(entry => matchesFilter(entry.check.group, value)).length}</span></button>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Search student or parent" placeholder="Search student or parent" value={search} onChange={event => setSearch(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#D6DCE0] bg-white px-3 text-sm focus-visible:outline-[#17624F]" />
        <select aria-label="Sort payment list" value={sortByParent ? "parent" : "student"} onChange={event => setSortByParent(event.target.value === "parent")} className="min-h-11 rounded-lg border border-[#D6DCE0] bg-white px-2 text-sm"><option value="student">Student name</option><option value="parent">Parent name</option></select>
      </div>
      <label className="flex min-h-10 w-fit items-center gap-2 text-sm text-[#52616A]"><input type="checkbox" checked={activeOnly} onChange={event => setActiveOnly(event.target.checked)} />Active students only</label>
      <div className="divide-y divide-[#DFE6E2] border-y border-[#DFE6E2]">
        {visible.map(({ row, check }) => <button key={row.enrollment.id} type="button" onClick={() => onOpenStudent(row, check)} className="press-feedback grid w-full gap-3 py-4 text-left hover:bg-[#F7F9F8] focus-visible:outline-[#17624F] md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] md:gap-5">
          <div className="min-w-0"><p className="break-words font-semibold">{row.student?.full_name || "Student"}</p>{row.parent?.full_name ? <p className="mt-1 break-words text-sm text-[#657178]">Parent: {row.parent.full_name}</p> : null}<p className="mt-1 text-xs text-[#657178]">{row.enrollment.status !== "active" ? `${row.enrollment.status} · ` : ""}{row.paymentTerms?.payment_type === "monthly" || row.subscription?.payment_type === "monthly" ? `${money(row.paymentTerms?.amount_cents ?? row.subscription?.amount_cents ?? 0, row.paymentTerms?.currency ?? row.subscription?.currency)} / month` : row.paymentTerms?.payment_type === "annual" ? "Annual" : "Payment arrangement"}</p></div>
          {standing(check)}
          <div className="space-y-1 text-xs leading-5 text-[#657178]">{check.lastPaymentAt ? <p>Last paid: {money(check.lastPaymentAmountCents ?? 0, check.currency)} · {date(check.lastPaymentAt)}</p> : null}{check.nextPaymentAt ? <p>Next payment: {date(check.nextPaymentAt)}</p> : null}<p className="font-semibold text-[#17624F] underline underline-offset-2">Student file →</p></div>
        </button>)}
        {!visible.length ? <p className="py-8 text-sm text-[#657178]">{search || activeOnly ? "No matching students." : filter === "attention" ? "No outstanding bills or records needing review were found in the checked list." : "No students in this group."}</p> : null}
      </div>
      <div className="space-y-2 text-xs leading-5 text-[#657178]"><p>Not enrolled yet? Approved students who have not completed registration are in Applications → Waiting Payment.</p><p>This checks linked Stripe subscriptions and recorded payment arrangements. Unbilled historical fees cannot be inferred from payment history. Refunds do not automatically create a new amount owing.</p></div>
    </>}
  </div>;
}
