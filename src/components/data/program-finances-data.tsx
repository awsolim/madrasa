
"use client";

import {
  FinanceActionModal,
  FinanceDetailsDrawer,
  hasCurrentPaymentBypass,
} from "@/components/data/student-record-file";
export { FinanceActionModal, FinanceDetailsDrawer } from "@/components/data/student-record-file";
import { selectCurrentPaymentTerms } from "@/lib/current-payment-terms";
import Link from "@/components/layout/workspace-link";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useWorkspacePathname as usePathname, useWorkspaceRouter as useRouter } from "@/components/layout/workspace-navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/data/empty-state";
import { DurableReceiptLink } from "@/components/data/durable-receipt-link";
import { BillingRoster } from "@/components/data/billing-roster";
import type { BillingCheck } from "@/lib/finance/billing-check";
import { DirectorySkeleton } from "@/components/data/data-loading";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { getCachedSessionSnapshot, loadCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import { clearPrivatePage, invalidatePrivateSnapshots, invalidateQueryPrefix, loadPrivateSnapshot, operationalSnapshotKey, readPrivatePage, useCachedQuery, writePrivatePage } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/programs/display";

type Program = Database["public"]["Tables"]["programs"]["Row"];

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];

type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];

type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];

type ProgramPaymentTerms = Database["public"]["Tables"]["program_payment_terms"]["Row"];

type ProgramFinanceAuditEvent = Database["public"]["Tables"]["program_finance_audit_events"]["Row"];

type StudentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type">;

type ParentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url">;


export function programStatusBadgeToneClass(tone: "neutral" | "positive" | "warning" | "danger") {
  switch (tone) {
    case "positive":
      return "bg-[#E3F5EE] text-[#228763]";
    case "warning":
      return "bg-[#FFF7E6] text-[#8A5A00]";
    case "danger":
      return "bg-[#FDEDEA] text-[#C83F31]";
    default:
      return "bg-[#EEF3F5] text-[#52616A]";
  }
}


export type FinanceEnrollmentRow = {
  enrollment: Enrollment;
  student: StudentDisplay | null;
  parent: ParentDisplay | null;
  approver: Profile | null;
  request: EnrollmentRequest | null;
  subscription: ProgramSubscription | null;
  paymentTerms: ProgramPaymentTerms | null;
  paymentTermsHistory: ProgramPaymentTerms[];
};


type FinanceAction = "waive" | "change_price" | "end_subscription";


type CachedFinancesPage = {
  program: Program;
  rows: FinanceEnrollmentRow[];
  auditEvents: ProgramFinanceAuditEvent[];
  auditActorsById: Record<string, Profile>;
};


type ProgramFinanceAnalytics = {
  totalCollectedCents: number;
  paymentRecordCount: number;
  collectedThisMonthCents: number;
  projectedMonthlyCents: number;
  activePaidSubscriptions: number;
  activeStudents: number;
  pendingApplications: number;
  waitlistedStudents: number;
  needsAttention: number;
  waivedStudents: number;
  monthlyRevenue: Array<{ month: string; amountCents: number }>;
  launchedAt?: string | null;
  reportingEndsAt?: string | null;
};


export function ProgramFinancesData({ slug, programId, mode = "teacher" }: { slug: string; programId: string; mode?: "teacher" | "admin" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cacheKey = `finances:${slug}:${programId}:${mode}:${getCachedSessionSnapshot()?.user.id ?? "unresolved"}`;
  const [initialPage] = useState(() => readPrivatePage<CachedFinancesPage>(cacheKey));
  const [program, setProgram] = useState<Program | null>(initialPage?.program ?? null);
  const [rows, setRows] = useState<FinanceEnrollmentRow[]>(initialPage?.rows ?? []);
  const [, setAuditActorsById] = useState<Record<string, Profile>>(initialPage?.auditActorsById ?? {});
  const [view, setView] = useState<"overview" | "billing" | "transactions">("overview");
  const [analytics, setAnalytics] = useState<ProgramFinanceAnalytics | null>(null);
  const [actionTarget, setActionTarget] = useState<{ row: FinanceEnrollmentRow; action: FinanceAction } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<FinanceEnrollmentRow | null>(null);
  const [detailsBillingCheck, setDetailsBillingCheck] = useState<BillingCheck | undefined>();
  const [removeTarget, setRemoveTarget] = useState<FinanceEnrollmentRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadFinanceRows();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, slug, mode]);

  useEffect(() => {
    const studentId = searchParams.get("studentId");
    if (!studentId || detailsTarget || !rows.length) return;
    const row = rows.find((item) => item.enrollment.student_profile_id === studentId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (row) setDetailsTarget(row);
  }, [detailsTarget, rows, searchParams]);

  // One RPC call instead of mosque+profile -> program -> [membership+director-assignment
  // access check] -> [5-way batch] -> parent_child_links -> profiles, as seven sequential
  // stages.
  async function loadFinanceRows() {
    if (!program) setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const session = await loadCachedSession();
    const userId = session?.user.id ?? null;
    if (!userId) {
      setError("Log in required.");
      setLoading(false);
      return;
    }

    let data: unknown;
    let overview: ProgramFinanceAnalytics;
    try {
      const snapshotPromise = loadPrivateSnapshot(
        operationalSnapshotKey("finances", slug, programId, userId),
        async () => {
          const result = await supabase.rpc("get_program_finances_snapshot", { p_slug: slug, p_program_id: programId });
          if (result.error) throw result.error;
          return result.data;
        },
        Boolean(program),
      );
      const [snapshotData, analyticsResult] = await Promise.all([
        snapshotPromise,
        supabase.rpc("get_program_finance_overview", { p_program_id: programId }),
      ]);
      if (analyticsResult.error) throw analyticsResult.error;
      data = snapshotData;
      overview = analyticsResult.data as unknown as ProgramFinanceAnalytics;
    } catch (error) {
      setError(friendlyErrorMessage(error, "Could not load enrollments."));
      setLoading(false);
      return;
    }

    const snapshot = data as unknown as {
      error: string | null;
      program: Program | null;
      hasAccess: boolean;
      enrollments: Enrollment[];
      requests: EnrollmentRequest[];
      subscriptions: ProgramSubscription[];
      paymentTerms: ProgramPaymentTerms[];
      auditEvents: ProgramFinanceAuditEvent[];
      links: Array<{ child_profile_id: string; parent_profile_id: string }>;
      profiles: Profile[];
    } | null;

    if (!snapshot || !snapshot.program) {
      setError(snapshot?.error ?? "Masjid not found.");
      setLoading(false);
      return;
    }

    if (!snapshot.hasAccess) {
      clearPrivatePage(`finances:${slug}:${programId}:${mode}:${userId}`);
      setProgram(snapshot.program);
      setRows([]);
      setAuditActorsById({});
      setError("Finance access has not been enabled for this class.");
      setLoading(false);
      return;
    }

    const programRow = snapshot.program;
    const enrollmentRows = snapshot.enrollments ?? [];
    const requestRows = snapshot.requests ?? [];
    const subscriptionRows = snapshot.subscriptions ?? [];
    const paymentTermsRows = snapshot.paymentTerms ?? [];
    const auditRows = snapshot.auditEvents ?? [];
    const linkRows = snapshot.links ?? [];
    const profileRows = snapshot.profiles ?? [];
    const auditActorIds = Array.from(new Set(auditRows.map((event) => event.actor_profile_id).filter(Boolean) as string[]));

    setProgram(programRow);
    const mappedRows = enrollmentRows.map((enrollment) => {
        const subscription = subscriptionRows.find((item) => item.student_profile_id === enrollment.student_profile_id) ?? null;
        const request = requestRows.find((item) => item.id === subscription?.enrollment_request_id) ?? requestRows.find((item) => item.student_profile_id === enrollment.student_profile_id && item.status === "approved") ?? requestRows.find((item) => item.student_profile_id === enrollment.student_profile_id) ?? null;
        const paymentTermsHistory = paymentTermsRows.filter((terms) => terms.student_profile_id === enrollment.student_profile_id);
        const paymentTerms = selectCurrentPaymentTerms(paymentTermsHistory, request, subscription);
        const parentId =
          paymentTerms?.parent_profile_id ??
          request?.parent_profile_id ??
          subscription?.parent_profile_id ??
          linkRows.find((link) => link.child_profile_id === enrollment.student_profile_id)?.parent_profile_id ??
          null;
        return {
          enrollment,
          request,
          subscription,
          paymentTerms,
          paymentTermsHistory,
          student: profileRows.find((profile) => profile.id === enrollment.student_profile_id) as StudentDisplay | null,
          approver: request?.reviewed_by ? (profileRows.find((profile) => profile.id === request.reviewed_by) as Profile | undefined) ?? null : null,
          parent: parentId ? (profileRows.find((profile) => profile.id === parentId) as ParentDisplay | undefined) ?? null : null,
        };
      });
    setRows(mappedRows);
    const actorsById = Object.fromEntries(profileRows.filter((profile) => auditActorIds.includes(profile.id)).map((profile) => [profile.id, profile]));
    setAuditActorsById(actorsById);
    setAnalytics(overview);
    writePrivatePage<CachedFinancesPage>(`finances:${slug}:${programId}:${mode}:${userId}`, {
      program: programRow, rows: mappedRows, auditEvents: auditRows, auditActorsById: actorsById,
    });
    setLoading(false);
  }

  const activeRows = rows.filter((row) => financeStatus(row) === "Active");
  const estimatedMonthlyCents = analytics?.projectedMonthlyCents ?? activeRows.reduce((sum, row) => sum + financeMonthlyAmountCents(row, program), 0);

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  if (error && !program) {
    return <EmptyState title="Could not load finances" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This class could not be loaded." />;
  }

  if (error?.startsWith("Finance access has not been enabled")) {
    return <EmptyState title="Finance access unavailable" text={error} />;
  }

  return (
    <section className="space-y-5 bg-white px-4 pb-28 pt-4 text-[#26323A]">
      {error ? <p role="status" className="rounded-xl bg-[#FFF6E8] px-4 py-3 text-sm text-[#79521B]">Could not refresh finances. Showing the last loaded records.</p> : null}
      <div className="flex items-center gap-3">
      <div className="grid min-w-0 flex-1 grid-cols-3 rounded-full bg-[#EEF3F2] p-1 md:max-w-lg">
        {([['overview', 'Overview'], ['billing', 'Billing'], ['transactions', 'Transactions']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setView(value)} className={cn("h-10 rounded-full text-sm font-semibold transition", view === value ? "bg-white text-[#17624F] shadow-sm" : "text-[#657178]")}>{label}</button>
        ))}
      </div>
        <Link href={`${mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`}/${programId}/exports?type=finance_summary`} className="inline-flex h-10 shrink-0 items-center rounded-full border border-[#C7D6D1] bg-white px-4 text-sm font-semibold text-[#17624F] hover:bg-[#F5F9F7]">Export</Link>
      </div>

      {view === "overview" ? (analytics ? <ProgramFinanceOverview analytics={analytics} fallbackProjectedMonthlyCents={estimatedMonthlyCents} /> : <div className="min-h-64" aria-label="Loading finance overview" aria-busy="true" />) : view === "transactions" ? <ProgramFinanceTransactions programId={programId} key={programId} onOpenStudent={(studentProfileId) => { const row = rows.find((item) => item.enrollment.student_profile_id === studentProfileId); if (row) setDetailsTarget(row); }} /> : null}

      {view === "billing" ? <BillingRoster program={program} rows={rows} onOpenStudent={(row, check) => { setDetailsTarget(row); setDetailsBillingCheck(check); }} onRefreshRows={loadFinanceRows} /> : null}

      {detailsTarget ? (
        <FinanceDetailsDrawer
          row={detailsTarget}
          program={program}
          billingCheck={detailsBillingCheck}
          initialTab={searchParams.get("from") === "students" ? "overview" : "finances"}
          childDialogOpen={Boolean(actionTarget || removeTarget)}
          onClose={() => {
            setDetailsTarget(null);
            setDetailsBillingCheck(undefined);
            if (searchParams.get("from") === "students") {
              router.replace(`${pathname.replace(/\/finances$/, "")}/students`, { scroll: false });
              return;
            }
            if (searchParams.has("studentId")) {
              const nextParams = new URLSearchParams(searchParams.toString());
              nextParams.delete("studentId");
              const query = nextParams.toString();
              router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
            }
          }}
          onAction={(action) => {
            const row = detailsTarget;
            if (action === "add_note") {
              const basePath = pathname.replace(/\/finances$/, "");
              router.push(`${basePath}/students/${row.enrollment.student_profile_id}/notes`);
            }
            else if (action === "remove_student") { setRemoveError(null); setRemoveTarget(row); }
            else setActionTarget({ row, action });
          }}
        />
      ) : null}

      {actionTarget ? (
        <FinanceActionModal
          row={actionTarget.row}
          action={actionTarget.action}
          program={program}
          onClose={() => {
            setActionTarget(null);
          }}
          onSuccess={() => void loadFinanceRows()}
        />
      ) : null}

      {removeTarget ? <ConfirmStudentRemovalModal row={removeTarget} program={program} busy={removeBusy} error={removeError} onClose={() => { if (!removeBusy) setRemoveTarget(null); }} onConfirm={async () => {
        setRemoveBusy(true);
        setRemoveError(null);
        const token = (await loadCachedSession())?.access_token;
        const response = await fetch(`/api/programs/${program.id}/students/${removeTarget.enrollment.student_profile_id}/remove`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({}) });
        const result = await response.json().catch(() => ({})) as { error?: string };
        setRemoveBusy(false);
        if (!response.ok) { setRemoveError(result.error ?? "Could not remove this student."); return; }
        setRemoveTarget(null);
        setDetailsTarget(null);
        invalidatePrivateSnapshots(`students:${slug}:${programId}:`);
        invalidatePrivateSnapshots(`finances:${slug}:${programId}:`);
        await loadFinanceRows();
      }} /> : null}
    </section>
  );
}



function ProgramFinanceOverview({ analytics, fallbackProjectedMonthlyCents }: {
  analytics: ProgramFinanceAnalytics | null;
  fallbackProjectedMonthlyCents: number;
}) {
  const [reportingNow] = useState(() => new Date());
  const launchYear = Number((analytics?.launchedAt ?? "").slice(0, 4)) || reportingNow.getFullYear();
  const currentYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric" }).format(reportingNow));
  const reportingEndYear = Number((analytics?.reportingEndsAt ?? "").slice(0, 4)) || currentYear;
  const availableYears = Array.from({ length: Math.max(1, reportingEndYear - launchYear + 1) }, (_, index) => launchYear + index);
  const [selectedYear, setSelectedYear] = useState(reportingEndYear);
  const [selectedHalf, setSelectedHalf] = useState<"first" | "second">("second");
  const [chartView, setChartView] = useState<"graph" | "table">("graph");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!availableYears.includes(selectedYear)) setSelectedYear(reportingEndYear);
  }, [availableYears, reportingEndYear, selectedYear]);
  const months = analytics?.monthlyRevenue ?? [];
  const yearMonths = Array.from({ length: 12 }, (_, index) => {
    const key = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
    return months.find((month) => month.month === key) ?? { month: key, amountCents: 0 };
  });
  const visibleMonths = selectedHalf === "first" ? yearMonths.slice(0, 6) : yearMonths.slice(6, 12);
  const visibleMaxRevenue = Math.max(1, ...visibleMonths.map((month) => month.amountCents));
  const paidStudents = analytics?.activePaidSubscriptions ?? 0;
  const projected = analytics?.projectedMonthlyCents ?? fallbackProjectedMonthlyCents;
  const average = paidStudents ? Math.round(projected / paidStudents) : 0;
  const edmontonDateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit" }).formatToParts(reportingNow);
  const currentMonthKey = `${edmontonDateParts.find((part) => part.type === "year")?.value}-${edmontonDateParts.find((part) => part.type === "month")?.value}`;
  const collectedThisMonthCents = months.find((month) => month.month === currentMonthKey)?.amountCents ?? analytics?.collectedThisMonthCents ?? 0;
  // A new class with no subscriptions and no payments has a valid $0 ledger. Only
  // flag synchronization when billing exists but its payment history is absent.
  const historyAvailable = Boolean(
    analytics && (
      analytics.activePaidSubscriptions === 0
      || analytics.paymentRecordCount > 0
      || analytics.totalCollectedCents > 0
      || analytics.monthlyRevenue.some((month) => month.amountCents > 0)
    )
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FinanceMetric label="Total collected" value={historyAvailable ? formatCurrencyAmount(analytics!.totalCollectedCents) : "Not available"} note={historyAvailable ? "Recorded payments" : "Payment history needs synchronization"} />
        <FinanceMetric label="This month" value={historyAvailable ? formatCurrencyAmount(collectedThisMonthCents) : "Not available"} note={historyAvailable ? "Collected revenue" : "Payment history needs synchronization"} />
        <FinanceMetric label="Expected monthly" value={formatCurrencyAmount(projected)} note="Active recurring plans" />
        <FinanceMetric label="Average per student" value={formatCurrencyAmount(average)} note="Per paid subscription" />
      </div>

      <section className="rounded-[22px] border border-[#DFE7E5] bg-white p-4 md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="font-semibold text-[#26323A]">Revenue collected</h3><p className="mt-1 text-xs text-[#718078]">Successful recorded payments during {selectedYear}</p>{analytics?.launchedAt ? <p className="mt-2 text-xs font-semibold text-[#52616A]">Program launched {new Date(`${analytics.launchedAt.slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}</p> : null}</div>
            <div className="flex flex-wrap items-center gap-2"><select aria-label="Revenue year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="h-9 rounded-full border border-[#D8E1DF] bg-white px-3 text-sm font-semibold text-[#26323A]">{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select><select aria-label="Six month range" value={selectedHalf} onChange={(event) => setSelectedHalf(event.target.value as "first" | "second")} className="h-9 rounded-full border border-[#D8E1DF] bg-white px-3 text-sm font-semibold text-[#26323A]"><option value="first">Jan–Jun</option><option value="second">Jul–Dec</option></select><div className="flex rounded-full bg-[#EEF3F2] p-0.5">{([['graph', 'Graph'], ['table', 'Table']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setChartView(value)} className={cn("h-8 rounded-full px-3 text-xs font-semibold", chartView === value ? "bg-white text-[#17624F] shadow-sm" : "text-[#657178]")}>{label}</button>)}</div></div>
          </div>
          {historyAvailable && chartView === "graph" ? (
            <div className="mt-7 pb-1" aria-label="Monthly collected revenue line chart">
              <svg viewBox="0 0 420 250" className="h-[230px] w-full" role="img">
                <polyline fill="none" stroke="#2A8069" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={visibleMonths.map((month, index) => { const x = 35 + index * 70; const y = 190 - (month.amountCents / visibleMaxRevenue) * 140; return `${x},${y}`; }).join(" ")} />
                {visibleMonths.map((month, index) => {
                  const x = 35 + index * 70;
                  const y = 190 - (month.amountCents / visibleMaxRevenue) * 140;
                  return <g key={month.month}><circle cx={x} cy={y} r="4.5" fill="#17624F" /><text x={x} y={Math.max(22, y - 11)} textAnchor="middle" className="fill-[#26323A] text-[13px] font-semibold">{formatCurrencyAmount(month.amountCents)}</text><text x={x} y="232" textAnchor="middle" className="fill-[#7B858C] text-[12px] font-semibold uppercase">{new Date(`${month.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</text></g>;
                })}
              </svg>
            </div>
          ) : historyAvailable ? <div className="mt-5 overflow-hidden rounded-[16px] border border-[#E3E9E7]"><table className="w-full text-left text-sm"><thead className="bg-[#F5F8F7] text-xs uppercase text-[#657178]"><tr><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Collected</th></tr></thead><tbody className="divide-y divide-[#EDF1F0]">{visibleMonths.map((month) => <tr key={month.month}><td className="px-4 py-3 font-medium">{new Date(`${month.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long" })}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrencyAmount(month.amountCents)}</td></tr>)}</tbody></table></div> : (
            <div className="mt-6 rounded-[16px] bg-[#FFF6E8] px-4 py-4 text-sm text-[#79521B]"><p className="font-semibold">Payment history needs synchronization</p><p className="mt-1">Existing Stripe payments have not been fully copied into the reporting ledger yet.</p></div>
          )}
      </section>
    </div>
  );
}


function FinanceMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-[20px] border border-[#DFE7E5] bg-[#F7FAF9] p-4"><p className="text-xs font-semibold text-[#657178]">{label}</p><p className="mt-2 text-xl font-semibold text-[#26323A] md:text-2xl">{value}</p><p className="mt-1 text-[11px] text-[#7B858C]">{note}</p></div>;
}


type TransactionPage = {
  total: number;
  entries: Array<{ id: string; studentProfileId: string; studentName: string; parentName: string | null; amountCents: number; currency: string; paidAt: string }>;
};

function ProgramFinanceTransactions({ programId, onOpenStudent }: {
  programId: string;
  onOpenStudent: (studentProfileId: string) => void;
}) {
  const pageSize = 50;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setOffset(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const userId = getCachedSessionSnapshot()?.user.id;
  const key = userId ? `finance-transactions:${programId}:${userId}:${search}:${offset}` : null;
  const { data, error, refetch } = useCachedQuery<TransactionPage>(key, async () => {
    const result = await createSupabaseBrowserClient().rpc("get_program_finance_transactions", {
      p_program_id: programId, p_search: search, p_offset: offset, p_limit: pageSize,
    });
    if (result.error) throw result.error;
    return result.data as unknown as TransactionPage;
  }, { persist: false });
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      invalidateQueryPrefix(`finance-transactions:${programId}:${userId}:`);
      await refetch();
    } finally { setRefreshing(false); }
  }
  return <div className="space-y-4">
    {error ? <p role="alert" className="text-sm text-[#B42318]">{error}</p> : null}
    <div className="flex items-center gap-2 md:max-w-2xl"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-[#6B747B]"><SearchIcon /><input aria-label="Search transactions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#26323A] outline-none" />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="h-8 w-8 rounded-full text-lg hover:bg-black/5">×</button> : null}</label><button type="button" onClick={() => { void refresh(); }} disabled={refreshing} aria-busy={refreshing} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border border-[#D6DCE0] bg-white px-3 text-xs font-semibold text-[#52616A] hover:bg-[#F7FAFB]" aria-label="Refresh transactions"><span aria-hidden="true">↻</span><span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span></button></div>
    <div className="overflow-hidden rounded-[20px] border border-[#DFE7E5]"><table className="w-full table-fixed text-left text-sm">
      <thead className="bg-[#F5F8F7] text-xs uppercase text-[#657178]"><tr><th className="w-[44%] px-3 py-3 md:px-4">Student</th><th className="w-[27%] px-2 py-3 md:px-4">Date</th><th className="w-[29%] px-3 py-3 text-right md:px-4">Amount</th></tr></thead>
      <tbody className="divide-y divide-[#EDF1F0]">{(data?.entries ?? []).map((transaction) => <tr key={transaction.id} role="button" tabIndex={0} onClick={() => onOpenStudent(transaction.studentProfileId)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenStudent(transaction.studentProfileId); } }} className="cursor-pointer transition hover:bg-[#F5F9F8] focus-visible:bg-[#F5F9F8] focus-visible:outline-none">
        <td className="break-words px-3 py-4 md:px-4"><p className="font-semibold">{transaction.studentName}</p>{transaction.parentName ? <p className="mt-1 text-xs text-[#657178]">{transaction.parentName}</p> : null}</td>
        <td className="px-2 py-4 text-xs text-[#657178] md:px-4 md:text-sm">{new Date(transaction.paidAt).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton" })}</td>
        <td className="px-3 py-4 text-right md:px-4"><p className={cn("break-words font-semibold tabular-nums", transaction.amountCents < 0 && "text-[#B42318]")}>{new Intl.NumberFormat("en-CA", { style: "currency", currency: transaction.currency.toUpperCase() }).format(transaction.amountCents / 100)}</p>{transaction.amountCents < 0 ? <p className="mt-1 text-xs text-[#B42318]">Refund</p> : <DurableReceiptLink programId={programId} paymentId={transaction.id} className="mt-1 text-xs" />}</td>
      </tr>)}{!data && !error ? <tr><td colSpan={3} className="px-4 py-10 text-center text-[#657178]" aria-busy="true">Loading transactions…</td></tr> : data && !data.entries.length ? <tr><td colSpan={3} className="px-4 py-10 text-center text-[#657178]">No matching transactions.</td></tr> : null}</tbody>
    </table></div>
    {data && data.total > pageSize ? <div className="flex items-center justify-between text-sm text-[#52616A]">
      <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))} className="min-h-11 px-3 font-semibold disabled:opacity-40">Previous</button>
      <span>{offset + 1}–{Math.min(offset + pageSize, data.total)} of {data.total}</span>
      <button type="button" disabled={offset + pageSize >= data.total} onClick={() => setOffset(offset + pageSize)} className="min-h-11 px-3 font-semibold disabled:opacity-40">Next</button>
    </div> : null}
  </div>;
}


function ConfirmStudentRemovalModal({ row, program, busy, error, onClose, onConfirm }: { row: FinanceEnrollmentRow; program: Program; busy: boolean; error: string | null; onClose: () => void; onConfirm: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useHideMobileChromeWhileMounted();
  const activeSubscription = hasActiveRecurringSubscription(row.subscription);
  return createPortal(<div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/40 px-5 backdrop-blur-sm">
    <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[24px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.24)] outline-none">
      <h2 className="text-lg font-semibold">Remove from class?</h2>
      <p className="mt-2 text-sm leading-6 text-[#66747C]">{activeSubscription ? `${row.student?.full_name || "This student"} has an active subscription. End it before removing the enrollment.` : `${row.student?.full_name || "This student"} will be removed from ${program.title}. Their application, payments, notes, and history will be preserved.`}</p>
      {error ? <p className="mt-3 text-sm font-semibold text-[#B42318]">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" disabled={busy} onClick={onClose} className="min-h-10 px-3 text-sm font-semibold text-[#66747C]">Cancel</button>
        <button type="button" disabled={busy || activeSubscription} onClick={onConfirm} className="min-h-10 rounded-[10px] bg-[#B42318] px-4 text-sm font-semibold text-white disabled:opacity-45">{busy ? "Removing..." : "Remove student"}</button>
      </div>
    </div>
  </div>, document.body);
}


const TERMINAL_PAYMENT_TERM_STATUSES = new Set(["superseded", "cancelled", "ended"]);


function financePaymentType(row: FinanceEnrollmentRow, program: Program | null) {
  // Legacy waivers updated the reviewed application but did not supersede its
  // earlier paid terms. The explicit final review decision wins in that case.
  if (hasCurrentPaymentBypass(row)) {
    return row.request?.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_waived) {
    return "Waived";
  }
  if (row.paymentTerms) {
    if (row.paymentTerms.payment_type === "pay_in_full" || row.paymentTerms.payment_type === "annual") {
      return row.paymentTerms.payment_type === "annual" && program?.is_ongoing ? "Annual Subscription" : "Pay in Full";
    }
    if (row.paymentTerms.payment_type === "monthly") {
      return "Monthly";
    }
    if (row.paymentTerms.payment_type === "waived") {
      return "Waived";
    }
    return "Free";
  }
  if (!program?.is_paid) {
    return "Free";
  }
  return (row.subscription?.payment_type ?? row.request?.payment_type) === "annual" ? (program?.is_ongoing ? "Annual Subscription" : "Pay in Full") : "Monthly";
}


function financeStatus(row: FinanceEnrollmentRow) {
  const status = row.enrollment.status || "active";
  if (status === "kicked") {
    return "Kicked";
  }
  if (status === "withdrawn") {
    return "Withdrawn";
  }
  return "Active";
}


function hasActiveRecurringSubscription(subscription: ProgramSubscription | null | undefined) {
  return Boolean(subscription?.stripe_subscription_id && !["canceled", "cancelled", "incomplete_expired", "ended"].includes(subscription.status?.toLowerCase() ?? ""));
}


function financeMonthlyAmountCents(row: FinanceEnrollmentRow, program: Program | null) {
  if (row.request?.payment_bypassed || row.subscription?.payment_waived) {
    return 0;
  }
  if (row.paymentTerms) {
    if (row.paymentTerms.payment_type !== "monthly" || TERMINAL_PAYMENT_TERM_STATUSES.has(row.paymentTerms.status)) {
      return 0;
    }
    return row.paymentTerms.amount_cents ?? 0;
  }
  if (!program?.is_paid || row.request?.payment_bypassed) {
    return 0;
  }
  if (financePaymentType(row, program).toLowerCase() !== "monthly") {
    return 0;
  }
  return row.request?.approved_price_monthly_cents ?? program.price_monthly_cents ?? 0;
}


function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}
