
"use client";

import {
  FinanceActionModal,
  FinanceDetailsDrawer,
  FinanceAddNoteModal,
  formatFinanceDate,
  formatFinanceShortDate,
  hasCurrentPaymentBypass,
  type FinanceActionEndpoint,
} from "@/components/data/student-record-file";
export { FinanceActionModal, FinanceDetailsDrawer, FinanceAddNoteModal } from "@/components/data/student-record-file";
import { selectCurrentPaymentTerms } from "@/lib/current-payment-terms";
import { loadStudentActivity } from "@/lib/student-activity";
import Link from "@/components/layout/workspace-link";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useWorkspacePathname as usePathname, useWorkspaceRouter as useRouter } from "@/components/layout/workspace-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/data/empty-state";
import { DirectorySkeleton } from "@/components/data/data-loading";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { getCachedSessionSnapshot, loadCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import { clearPrivatePage, invalidatePrivateSnapshots, loadPrivateSnapshot, operationalSnapshotKey, readPrivatePage, writePrivatePage } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { formatCurrencyAmount, formatPrice } from "@/lib/programs/display";

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


type FinanceEnrollmentRow = {
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


async function callFinanceAction<T = Record<string, unknown>>(
  programId: string,
  endpoint: FinanceActionEndpoint,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, error: "Please sign in again to continue." };
  }

  const run = async () => {
    const response = await fetch(`/api/programs/${programId}/finance/${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not complete this request.");
    return result;
  };
  try {
    const data = endpoint === "payment-history"
      ? await loadPrivateSnapshot(`payment-history:${programId}:${payload.studentProfileId}:${sessionData.session!.user.id}`, run)
      : await run();
    if (endpoint !== "payment-history") {
      invalidatePrivateSnapshots(`payment-history:${programId}:`);
      invalidatePrivateSnapshots(`student-activity:${programId}:`);
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not load or update this record. Please try again." };
  }
}


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
  transactions?: Array<{ id: string; studentProfileId: string; studentName: string | null; amountCents: number; currency: string; paidAt: string; receiptUrl: string | null }>;
};


export function ProgramFinancesData({ slug, programId, mode = "teacher" }: { slug: string; programId: string; mode?: "teacher" | "admin" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cacheKey = `finances:${slug}:${programId}:${mode}:${getCachedSessionSnapshot()?.user.id ?? "unresolved"}`;
  const [initialPage] = useState(() => readPrivatePage<CachedFinancesPage>(cacheKey));
  const [program, setProgram] = useState<Program | null>(initialPage?.program ?? null);
  const [rows, setRows] = useState<FinanceEnrollmentRow[]>(initialPage?.rows ?? []);
  const [auditEvents, setAuditEvents] = useState<ProgramFinanceAuditEvent[]>(initialPage?.auditEvents ?? []);
  const [, setAuditActorsById] = useState<Record<string, Profile>>(initialPage?.auditActorsById ?? {});
  const [view, setView] = useState<"overview" | "billing" | "transactions">("overview");
  const [analytics, setAnalytics] = useState<ProgramFinanceAnalytics | null>(null);
  const [search, setSearch] = useState(searchParams.get("studentId") ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [payStatusFilter, setPayStatusFilter] = useState("all");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ row: FinanceEnrollmentRow; action: FinanceAction } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<FinanceEnrollmentRow | null>(null);
  const [noteTarget, setNoteTarget] = useState<FinanceEnrollmentRow | null>(null);
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
    try {
      data = await loadPrivateSnapshot(
        operationalSnapshotKey("finances", slug, programId, userId),
        async () => {
          const result = await supabase.rpc("get_program_finances_snapshot", { p_slug: slug, p_program_id: programId });
          if (result.error) throw result.error;
          return result.data;
        },
        Boolean(program),
      );
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
      setAuditEvents([]);
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
    setAuditEvents(auditRows);
    const actorsById = Object.fromEntries(profileRows.filter((profile) => auditActorIds.includes(profile.id)).map((profile) => [profile.id, profile]));
    setAuditActorsById(actorsById);
    const analyticsResult = await supabase.rpc("get_program_finance_analytics", { p_program_id: programId });
    if (!analyticsResult.error) {
      const nextAnalytics = analyticsResult.data as unknown as ProgramFinanceAnalytics & { hasAccess?: boolean };
      if (nextAnalytics?.hasAccess !== false) setAnalytics(nextAnalytics);
    }
    writePrivatePage<CachedFinancesPage>(`finances:${slug}:${programId}:${mode}:${userId}`, {
      program: programRow, rows: mappedRows, auditEvents: auditRows, auditActorsById: actorsById,
    });
    setLoading(false);
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = financeStatus(row);
      const payment = financePaymentType(row, program);
      const studentType = financeStudentType(row);
      const gender = normalizeGender(row.student?.gender ?? null);
      const payStatus = financePaymentStatus(row, program);
      const subStatus = financeSubscriptionStatus(row);
      if (statusFilter !== "all" && status.toLowerCase() !== statusFilter) {
        return false;
      }
      if (paymentFilter !== "all" && payment.toLowerCase() !== paymentFilter) {
        return false;
      }
      if (typeFilter !== "all" && studentType !== typeFilter) {
        return false;
      }
      if (genderFilter !== "all" && gender !== genderFilter) {
        return false;
      }
      if (payStatusFilter !== "all" && payStatus.toLowerCase() !== payStatusFilter) {
        return false;
      }
      if (subStatusFilter !== "all" && subStatus.toLowerCase() !== subStatusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [row.enrollment.student_profile_id, row.student?.full_name, row.parent?.full_name, row.student?.email, row.parent?.email, payment, status, payStatus, subStatus]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    }).sort((left, right) =>
      (left.student?.full_name ?? left.student?.email ?? "Student").localeCompare(
        right.student?.full_name ?? right.student?.email ?? "Student",
        undefined,
        { sensitivity: "base" },
      ),
    );
  }, [genderFilter, payStatusFilter, paymentFilter, program, rows, search, statusFilter, subStatusFilter, typeFilter]);

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
      <div className="rounded-[28px] bg-[#17624F] p-5 text-white shadow-[0_18px_45px_rgba(23,98,79,0.22)]">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="mt-0 text-2xl font-semibold leading-7">{program.title}</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <FinanceSummaryFigure value={rows.length.toString()} label="Total records" />
            <FinanceSummaryFigure value={activeRows.length.toString()} label="Active students" />
            <FinanceSummaryFigure value={formatCurrencyAmount(estimatedMonthlyCents)} label="Expected monthly" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
      <div className="grid min-w-0 flex-1 grid-cols-3 rounded-full bg-[#EEF3F2] p-1 md:max-w-lg">
        {([['overview', 'Overview'], ['billing', 'Billing'], ['transactions', 'Transactions']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setView(value)} className={cn("h-10 rounded-full text-sm font-semibold transition", view === value ? "bg-white text-[#17624F] shadow-sm" : "text-[#657178]")}>{label}</button>
        ))}
      </div>
        <Link href={`${mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`}/${programId}/exports`} className="inline-flex h-10 shrink-0 items-center rounded-full border border-[#C7D6D1] bg-white px-4 text-sm font-semibold text-[#17624F] hover:bg-[#F5F9F7]">Export</Link>
      </div>

      {view === "overview" ? <ProgramFinanceOverview analytics={analytics} fallbackProjectedMonthlyCents={estimatedMonthlyCents} /> : view === "transactions" ? <ProgramFinanceTransactions transactions={analytics?.transactions ?? []} onOpenStudent={(studentProfileId) => { const row = rows.find((item) => item.enrollment.student_profile_id === studentProfileId); if (row) setDetailsTarget(row); }} /> : null}

      {view === "billing" ? <>

      <div className="flex items-center gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-[#6B747B] md:max-w-xl">
          <SearchIcon />
          <input aria-label="Search finance records" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#26323A] outline-none" />
          {search ? <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="h-8 w-8 shrink-0 rounded-full text-lg hover:bg-black/5">×</button> : null}
        </label>
        <button type="button" onClick={() => setFiltersOpen((open) => !open)} className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#52616A] transition-colors", filtersOpen && "bg-[#DDF2EB] text-[#17624F]")} aria-label={filtersOpen ? "Close finance filters" : "Open finance filters"} aria-expanded={filtersOpen}>
          <FilterSlidersIcon />
        </button>
      </div>
      {filtersOpen ? (
        <div className="divide-y divide-[#EEF2F4] rounded-[16px] border border-[#DDE5E9] bg-white px-3">
          <CompactFinanceSelect label="Enrollment" value={statusFilter} options={["active", "kicked", "withdrawn"]} onChange={setStatusFilter} />
          <CompactFinanceSelect label="Payment status" value={payStatusFilter} options={["paid", "awaiting payment", "no payment required", "waived", "paid externally", "past due", "payment failed", "checkout sent", "needs billing decision"]} onChange={setPayStatusFilter} />
          <CompactFinanceSelect label="Subscription" value={subStatusFilter} options={["n/a", "setup pending", "active", "paused", "ending", "past due", "payment failed", "ended"]} labels={{ "n/a": "N/A" }} onChange={setSubStatusFilter} />
          <CompactFinanceSelect label="Payment type" value={paymentFilter} options={["waived", "paid externally", "monthly", program?.is_ongoing ? "annual subscription" : "pay in full"]} labels={{ "pay in full": "Pay in Full", "annual subscription": "Annual Subscription" }} onChange={setPaymentFilter} />
          <CompactFinanceSelect label="Type" value={typeFilter} options={["adult", "child"]} labels={{ adult: "Adult student", child: "Child student" }} onChange={setTypeFilter} />
          <CompactFinanceSelect label="Gender" value={genderFilter} options={["male", "female"]} labels={{ male: "Brothers", female: "Sisters" }} onChange={setGenderFilter} />
        </div>
      ) : null}

      <div className="flex items-center justify-between px-1 text-sm font-semibold text-[#6B747B]">
        <span>Showing {filteredRows.length} of {rows.length} records</span>
      </div>

      <div className="grid gap-3 md:hidden">
        {filteredRows.map((row) => (
          <button key={row.enrollment.id} type="button" onClick={() => setDetailsTarget(row)} className="rounded-[18px] border border-[#DFE7E5] bg-white p-4 text-left shadow-[0_8px_22px_rgba(38,50,58,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-semibold text-[#26323A]">{row.student?.full_name || "Student"}</p>{row.parent?.full_name ? <p className="mt-0.5 truncate text-xs text-[#7B858C]">Parent: {row.parent.full_name}</p> : null}<p className="mt-1 text-xs text-[#6B747B]">{financePaymentType(row, program)} · {financePrice(row, program)}</p></div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financeSubscriptionStatus(row))))}>{financeSubscriptionStatus(row)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#EEF2F4] pt-3 text-xs"><div><p className="text-[#7B858C]">Payment</p><p className="mt-1 font-semibold text-[#52616A]">{financePaymentStatus(row, program)}</p></div><div><p className="text-[#7B858C]">Next billing</p><p className="mt-1 font-semibold text-[#52616A]">{financeNextBillingLabel(row)}</p></div></div>
          </button>
        ))}
        {!filteredRows.length ? <p className="rounded-[18px] border border-[#DFE7E5] px-4 py-10 text-center text-sm font-semibold text-[#7B858C]">No matching billing records.</p> : null}
      </div>

      <div className="hidden overflow-hidden rounded-[24px] border border-[#E1E8EC] bg-white shadow-[0_14px_38px_rgba(38,50,58,0.08)] md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full text-left text-sm">
            <thead className="bg-[#F7FAFB] text-[11px] font-semibold uppercase tracking-wide text-[#7B858C]">
              <tr>
                {["Student", "Payment plan", "Price", "Enrollment", "Payment", "Subscription", "Current period", "Next billing"].map((column) => (
                  <th key={column} className="px-4 py-3">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F4]">
              {filteredRows.map((row) => (
                <tr onPointerEnter={() => { void loadStudentActivity(programId, row.enrollment.student_profile_id, "finance").catch(() => undefined); void callFinanceAction(programId, "payment-history", { studentProfileId: row.enrollment.student_profile_id }); }} key={row.enrollment.id} className="cursor-pointer align-middle hover:bg-[#F8FAFB]" tabIndex={0} aria-label={`Open finance file for ${row.student?.full_name ?? "student"}`} onClick={() => setDetailsTarget(row)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setDetailsTarget(row); } }}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-[#26323A]">{row.student?.full_name || "Student"}</p>
                    <p className="mt-0.5 text-xs text-[#7B858C]">{row.parent?.full_name ? `Parent: ${row.parent.full_name}` : financeStudentSubtitle(row)}</p>
                  </td>
                  <td className="px-4 py-4 font-semibold text-[#52616A]">{financePaymentType(row, program)}</td>
                  <td className="px-4 py-4 font-semibold text-[#26323A]">{financePrice(row, program)}</td>
                  <td className="px-4 py-4">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financeStatus(row))))}>
                      {financeStatus(row)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financePaymentStatus(row, program))))}>
                      {financePaymentStatus(row, program)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financeSubscriptionStatus(row))))}>
                      {financeSubscriptionStatus(row)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-[#52616A]">{financeCurrentPeriodLabel(row)}</td>
                  <td className="px-4 py-4 text-[#52616A]">{financeNextBillingLabel(row)}</td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-[#7B858C]">No matching billing records.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Link href={`${mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`}/${programId}/finances/audit`} className="inline-flex min-h-11 items-center rounded-full bg-[#EEF6F7] px-4 text-sm font-semibold text-[#17624F]">
        View audit trail{auditEvents.length ? ` (${auditEvents.length})` : ""}
      </Link>
      </> : null}

      {detailsTarget ? (
        <FinanceDetailsDrawer
          row={detailsTarget}
          program={program}
          initialTab={searchParams.get("from") === "students" ? "overview" : "finances"}
          childDialogOpen={Boolean(actionTarget || noteTarget || removeTarget)}
          onClose={() => {
            setDetailsTarget(null);
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
            if (action === "add_note") setNoteTarget(row);
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

      {noteTarget ? (
        <FinanceAddNoteModal
          row={noteTarget}
          program={program}
          onClose={() => {
            setNoteTarget(null);
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


function ProgramFinanceTransactions({ transactions, onOpenStudent }: { transactions: NonNullable<ProgramFinanceAnalytics["transactions"]>; onOpenStudent: (studentProfileId: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = transactions.filter((transaction) => !query.trim() || `${transaction.studentName ?? ""} ${transaction.amountCents} ${transaction.paidAt}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="space-y-4"><label className="flex min-h-11 items-center gap-2 rounded-[14px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-[#6B747B] md:max-w-xl"><SearchIcon /><input aria-label="Search transactions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student or payment" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#26323A] outline-none" />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="h-8 w-8 rounded-full text-lg hover:bg-black/5">×</button> : null}</label><div className="overflow-x-auto rounded-[20px] border border-[#DFE7E5]"><table className="min-w-[620px] w-full text-left text-sm"><thead className="bg-[#F5F8F7] text-xs uppercase text-[#657178]"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Receipt</th></tr></thead><tbody className="divide-y divide-[#EDF1F0]">{filtered.map((transaction) => <tr key={transaction.id} role="button" tabIndex={0} onClick={() => onOpenStudent(transaction.studentProfileId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenStudent(transaction.studentProfileId); } }} className="cursor-pointer transition hover:bg-[#F5F9F8] focus-visible:bg-[#F5F9F8] focus-visible:outline-none"><td className="px-4 py-3 font-semibold">{transaction.studentName || "Student"}</td><td className="px-4 py-3 text-[#657178]">{new Date(transaction.paidAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrencyAmount(transaction.amountCents)}</td><td className="px-4 py-3">{transaction.receiptUrl ? <a href={transaction.receiptUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="font-semibold text-[#17624F]">Open receipt</a> : <span className="text-[#9AA3A8]">—</span>}</td></tr>)}{!filtered.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-[#657178]">No matching transactions.</td></tr> : null}</tbody></table></div></div>;
}


function FinanceSummaryFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold leading-none text-white md:text-4xl">{value}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">{label}</p>
    </div>
  );
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


function CompactFinanceSelect({ label, value, options, labels = {}, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 py-1 text-sm font-semibold text-[#52616A]">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-44 max-w-[58%] rounded-[9px] border border-[#D6DCE0] bg-[#F8FAFB] px-2 text-xs font-semibold text-[#26323A] outline-none">
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{labels[option] ?? titleCase(option)}</option>)}
      </select>
    </label>
  );
}


function FilterSlidersIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h3M11 17h9"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>;
}


function financePrice(row: FinanceEnrollmentRow, program: Program | null) {
  if (hasCurrentPaymentBypass(row)) {
    return row.request?.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_waived) {
    return "Waived";
  }
  if (row.paymentTerms) {
    if (row.paymentTerms.payment_type === "free") {
      return "Free";
    }
    if (row.paymentTerms.payment_type === "waived") {
      return "Waived";
    }
    const amount = formatPrice(row.paymentTerms.amount_cents);
    return row.paymentTerms.payment_type === "monthly" ? `${amount}/month` : amount;
  }
  if ((row.subscription?.payment_type ?? row.request?.payment_type) === "annual") {
    return formatPrice(row.request?.approved_price_annual_cents ?? program?.price_annual_cents ?? null);
  }
  return formatPrice(row.request?.approved_price_monthly_cents ?? program?.price_monthly_cents ?? null);
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


function financeStudentType(row: FinanceEnrollmentRow) {
  return row.parent ? "child" : "adult";
}


function financeSubscriptionStatus(row: FinanceEnrollmentRow) {
  if (hasCurrentPaymentBypass(row) && !row.subscription?.stripe_subscription_id) {
    return "N/A";
  }
  if (row.subscription?.stripe_subscription_id) {
    const stripeStatus = row.subscription.status?.toLowerCase();
    if (stripeStatus === "incomplete" || stripeStatus === "checkout_started") return "Setup pending";
    if (stripeStatus === "trialing") return "Trial";
    if (stripeStatus === "paused") return "Paused";
    if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
      return "Past due";
    }
    if (!hasActiveRecurringSubscription(row.subscription)) {
      return "Ended";
    }
    if (row.subscription.payment_paused) {
      return "Paused";
    }
    return row.subscription.cancel_at_period_end ? "Ending" : "Active";
  }
  if (row.paymentTerms) {
    if (!["monthly", "annual"].includes(row.paymentTerms.payment_type)) {
      return "N/A";
    }
  }
  if (!row.subscription?.stripe_subscription_id) {
    const localStatus = row.subscription?.status?.toLowerCase();
    if (localStatus === "active") return "Active";
    if (localStatus === "trialing") return "Trial";
    if (localStatus === "past_due") return "Past due";
    if (localStatus === "unpaid") return "Unpaid";
    if (localStatus === "paid") return "Completed";
    if (localStatus === "checkout_started") return "Setup pending";
    if (row.paymentTerms?.status === "checkout_pending" || row.paymentTerms?.status === "payment_required") {
      return "Setup pending";
    }
    if (row.paymentTerms?.status === "past_due") {
      return "Past due";
    }
    if (row.paymentTerms?.status === "failed") {
      return "Payment failed";
    }
    if (row.paymentTerms && ["ended", "cancelled", "superseded"].includes(row.paymentTerms.status)) {
      return "Ended";
    }
    if (financeStatus(row) === "Active" && ["monthly", "annual"].includes(row.paymentTerms?.payment_type ?? "")) return "Active";
    return "N/A";
  }
  return "N/A";
}


function financePaymentStatus(row: FinanceEnrollmentRow, program: Program | null) {
  if (hasCurrentPaymentBypass(row)) {
    return row.request?.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_paused || row.subscription?.status === "paused") return "Paused";
  if (row.subscription?.status === "trialing") return "Trial — not charged";
  if (row.subscription?.status === "incomplete") return "Awaiting payment";
  if (row.subscription?.status === "checkout_started") return "Checkout sent";
  if (row.subscription?.payment_waived) {
    return "Waived";
  }
  if (row.paymentTerms) {
    const stripeStatus = row.subscription?.status?.toLowerCase();
    if (["monthly", "annual"].includes(row.paymentTerms.payment_type) && row.subscription?.stripe_subscription_id && hasActiveRecurringSubscription(row.subscription)) {
      if (stripeStatus === "past_due") {
        return "Past due";
      }
      if (stripeStatus === "unpaid") {
        return "Payment failed";
      }
      return "Paid";
    }
    switch (row.paymentTerms.status) {
      case "payment_required":
        return "Awaiting payment";
      case "checkout_pending":
        return "Checkout sent";
      case "active":
        if (row.paymentTerms.payment_type === "waived") return "Waived";
        if (row.subscription?.status === "trialing") return "Trial";
        if (row.subscription?.status === "active") return "Current";
        return ["monthly", "annual", "pay_in_full"].includes(row.paymentTerms.payment_type) ? "Registration completed" : "No payment required";
      case "paid":
        return "Paid";
      case "waived":
        return "Waived";
      case "past_due":
        return "Past due";
      case "failed":
        return "Payment failed";
      case "ended":
      case "cancelled":
      case "superseded":
        return "Ended";
      default:
        return "Needs billing decision";
    }
  }
  if (!program?.is_paid) {
    return "No payment required";
  }
  const stripeStatus = row.subscription?.status?.toLowerCase();
  if (stripeStatus === "past_due") {
    return "Past due";
  }
  if (stripeStatus === "unpaid") {
    return "Payment failed";
  }
  if (stripeStatus === "checkout_started") {
    return "Checkout sent";
  }
  if (row.subscription?.stripe_subscription_id && hasActiveRecurringSubscription(row.subscription)) {
    return "Paid";
  }
  if (row.subscription?.stripe_subscription_id) {
    return "Needs billing decision";
  }
  if (row.request?.approved_price_monthly_cents || row.request?.approved_price_annual_cents || program.price_monthly_cents || program.price_annual_cents) {
    return "Awaiting payment";
  }
  return "Needs billing decision";
}


function financeBadgeTone(label: string): "neutral" | "positive" | "warning" | "danger" {
  const value = label.toLowerCase();
  if (["active", "paid"].includes(value)) {
    return "positive";
  }
  if (["paused", "ending", "awaiting payment", "checkout sent", "setup pending"].includes(value)) {
    return "warning";
  }
  if (["kicked", "past due", "payment failed", "needs billing decision"].includes(value)) {
    return "danger";
  }
  return "neutral";
}


function financeCurrentPeriodLabel(row: FinanceEnrollmentRow) {
  if (!row.subscription?.stripe_subscription_id && row.paymentTerms?.current_period_start && row.paymentTerms.current_period_end) {
    return `${formatFinanceDate(row.paymentTerms.current_period_start)} – ${formatFinanceDate(row.paymentTerms.current_period_end)}`;
  }
  if (!row.subscription?.current_period_start || !row.subscription.current_period_end) {
    return "—";
  }
  return `${formatFinanceDate(row.subscription.current_period_start)} – ${formatFinanceDate(row.subscription.current_period_end)}`;
}


function financeNextBillingLabel(row: FinanceEnrollmentRow) {
  const subscription = row.subscription;
  if (row.paymentTerms && !["monthly", "annual"].includes(row.paymentTerms.payment_type)) {
    return row.paymentTerms.payment_type === "pay_in_full" ? "Paid once" : "—";
  }
  if (!subscription?.stripe_subscription_id || !hasActiveRecurringSubscription(subscription)) {
    if (row.paymentTerms?.current_period_end && ["ended", "cancelled"].includes(row.paymentTerms.status)) {
      return `Ended ${formatFinanceShortDate(row.paymentTerms.current_period_end)}`;
    }
    return "—";
  }
  if (subscription.payment_paused) {
    return subscription.payment_paused_until ? `Resumes ${formatFinanceShortDate(subscription.payment_paused_until)}` : "Paused indefinitely";
  }
  if (!subscription.current_period_end) {
    return "—";
  }
  return subscription.cancel_at_period_end ? `Ends on ${formatFinanceShortDate(subscription.current_period_end)}` : `Next billing: ${formatFinanceShortDate(subscription.current_period_end)}`;
}


function hasActiveRecurringSubscription(subscription: ProgramSubscription | null | undefined) {
  if (!subscription?.stripe_subscription_id) {
    return false;
  }
  const status = subscription.status?.toLowerCase();
  return !["canceled", "cancelled", "incomplete_expired"].includes(status);
}


function financeStudentSubtitle(row: FinanceEnrollmentRow) {
  if (financeStudentType(row) === "child") {
    return "Child Student";
  }
  return row.student?.email || "Adult Student";
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


function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}


function normalizeGender(gender: string | null) {
  const normalized = gender?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["male", "boy", "boys", "brother", "brothers"].includes(normalized)) {
    return "male";
  }
  if (["female", "girl", "girls", "sister", "sisters"].includes(normalized)) {
    return "female";
  }
  return normalized;
}
