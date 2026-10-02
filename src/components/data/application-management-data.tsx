"use client";

import { ChevronIcon, ClassesLoadingPlaceholders, DetailSection, ImageCropModal, PhotoIcon, ProgramFaqSection, ProgramHero, ProgramPaymentOptionsDisplay, ProgramScheduleOptionsDisplay, TrackPayInFullPriceCaption, TrackPriceNumber, TrackPricingDealCaption, TrashIcon, applyLinkedSessionsToTracks, formatDurationDate, getCurrentAccessToken, invalidateProgramCaches, mediaType, mosqueProgramsQueryKey, programPayInFullDurationMonths, programPaymentOptions, programStatusBadgeToneClass, scheduleRowFromProgramSession, scheduleSessionLines, scheduleSummary, scheduleTimeOptions, startOfToday, titleCase, trackCapacityBadge, trackPriceLine, trackPricingDeal, trackSelectionRuleText } from "@/components/data/program-builder-shared";
import type { Mosque, PaymentType, Profile, Program, ProgramBuilderStatus, ProgramDetails, ProgramFaq, ProgramMedia, ProgramSession, ProgramTrack, ProgramTrackSession } from "@/components/data/program-builder-shared";
import { loadStudentActivity, type StudentActivity } from "@/lib/student-activity";
import Link from "@/components/layout/workspace-link";
import { ApplicationDecisionModal, ApplicationReviewOverlay, type ApplicationRow } from "@/components/data/application-review";
import { useSearchParams } from "next/navigation";
import { useWorkspacePathname as usePathname, useWorkspaceRouter as useRouter } from "@/components/layout/workspace-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/data/empty-state";
import { DirectorySkeleton, GenericLoadingState, QuietPageLoadingState } from "@/components/data/data-loading";
import { EditorToast, queueEditorToast, readQueuedEditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { getCachedMosqueChrome, getCachedProfileSummary, getCachedSessionSnapshot, getCachedUserAccess, loadCachedSession, loadCachedUserAccess, loadMosqueChrome, performClientLogout, setCachedProfileName, setCachedProfileSummary, subscribeCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import { clearPrivatePage, invalidatePrivateSnapshots, invalidateQuery, invalidateQueryPrefix, loadPrivateSnapshot, operationalSnapshotKey, prefetchQuery, readPrivatePage, useCachedQuery, writePrivatePage } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  applicationNeedsAction,
  applicationStatusTone,
  getApplicationPaymentStatus,
  getApplicationRowActions,
  getApplicationRowStatusLabel,
  getApplicationStatus,
  isPaymentStatusMeaningful,
  paymentStatusTone,
  PAYMENT_STATUS_LABELS,
  type ApplicationRowAction,
  type ApplicationStatus as RequestApplicationStatus,
} from "@/lib/programs/applications";
import { ChevronRightIcon, DefaultProfileIcon, EnrollmentRequest, ParentDisplay, ProgramFinanceAuditEvent, ProgramSubscription, SearchIcon, StudentDisplay, applicationListedPrice, applicationPaymentPlanLabel, formatFinanceDate, resolveRequestTrack } from "@/components/data/application-management-shared";

export function ProgramApplicationsData({ slug, programId, mode = "teacher" }: { slug: string; programId: string; mode?: "teacher" | "admin" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cacheKey = `applications:${slug}:${programId}:${mode}:${getCachedSessionSnapshot()?.user.id ?? "unresolved"}`;
  const [initialPage] = useState(() => readPrivatePage<CachedApplicationsPage>(cacheKey));
  const [program, setProgram] = useState<Program | null>(initialPage?.program ?? null);
  const [rows, setRows] = useState<ApplicationRow[]>(initialPage?.rows ?? []);
  const [auditEvents, setAuditEvents] = useState<ProgramFinanceAuditEvent[]>(initialPage?.auditEvents ?? []);
  const [search, setSearch] = useState(searchParams.get("studentId") ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payStatusFilter, setPayStatusFilter] = useState("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tracks, setTracks] = useState<ProgramTrack[]>(initialPage?.tracks ?? []);
  const [detailsTarget, setDetailsTarget] = useState<ApplicationRow | null>(null);
  const [trackSwitchRequests, setTrackSwitchRequests] = useState<ProgramTrackSwitchRequestWithContext[]>(initialPage?.switchRequests ?? []);
  const [switchRequestBusyId, setSwitchRequestBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [canDecide, setCanDecide] = useState(initialPage?.canDecide ?? true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadApplications();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, slug, mode]);

  useEffect(() => {
    const studentId = searchParams.get("studentId");
    if (!studentId || detailsTarget || !rows.length) return;
    const row = rows.find((item) => item.request.student_profile_id === studentId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (row) setDetailsTarget(row);
  }, [detailsTarget, rows, searchParams]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const requestId = searchParams.get("requestId");
    if (!requestId) {
      return;
    }
    const timeout = window.setTimeout(() => {
      const match = rows.find((row) => row.request.id === requestId);
      if (match) {
        setDetailsTarget(match);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loading, rows, searchParams]);

  // One RPC call instead of mosque -> program -> can_manage_program check -> [6-way batch] ->
  // profiles, as six sequential stages. Reuses the existing can_manage_program() permission
  // check server-side rather than a separate round-trip for it.
  async function loadApplications() {
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
        operationalSnapshotKey("applications", slug, programId, userId),
        async () => {
          const result = await supabase.rpc("get_program_applications_snapshot", { p_slug: slug, p_program_id: programId });
          if (result.error) throw result.error;
          return result.data;
        },
        Boolean(program),
      );
    } catch (error) {
      setError(friendlyErrorMessage(error, "Could not load applications."));
      setLoading(false);
      return;
    }

    const snapshot = data as unknown as {
      error: string | null;
      program: Program | null;
      canView: boolean;
      canDecide: boolean;
      requests: EnrollmentRequest[];
      tracks: ProgramTrack[];
      subscriptions: ProgramSubscription[];
      auditEvents: ProgramFinanceAuditEvent[];
      switchRequests: ProgramTrackSwitchRequestRow[];
      requestTrackLinks: Array<{ enrollment_request_id: string; program_track_id: string }>;
      profiles: Profile[];
    } | null;

    if (!snapshot || !snapshot.program) {
      setError(snapshot?.error ?? "Class not found.");
      setLoading(false);
      return;
    }

    if (!snapshot.canView) {
      clearPrivatePage(`applications:${slug}:${programId}:${mode}:${userId}`);
      setProgram(snapshot.program);
      setRows([]);
      setAuditEvents([]);
      setError("You don't have permission to view applications for this class.");
      setLoading(false);
      return;
    }

    setCanDecide(Boolean(snapshot.canDecide));

    const programRow = snapshot.program;
    const requestRows = snapshot.requests ?? [];
    const trackRows = snapshot.tracks ?? [];
    const subscriptionRows = snapshot.subscriptions ?? [];
    const auditRows = snapshot.auditEvents ?? [];
    const switchRows = snapshot.switchRequests ?? [];
    const requestTrackLinkRows = snapshot.requestTrackLinks ?? [];
    const profileRows = snapshot.profiles ?? [];

    const requestTrackIdsByRequestId = new Map<string, string[]>();
    for (const linkRow of requestTrackLinkRows) {
      requestTrackIdsByRequestId.set(linkRow.enrollment_request_id, [...(requestTrackIdsByRequestId.get(linkRow.enrollment_request_id) ?? []), linkRow.program_track_id]);
    }

    setProgram(programRow);
    setTracks(trackRows);
    const mappedRows = requestRows.map((request) => ({
        request,
        student: profileRows.find((profile) => profile.id === request.student_profile_id) as StudentDisplay | null,
        parent: request.parent_profile_id ? (profileRows.find((profile) => profile.id === request.parent_profile_id) as ParentDisplay | undefined) ?? null : null,
        track: resolveRequestTrack(request, requestTrackIdsByRequestId, trackRows),
        subscription: subscriptionRows.find((subscription) => subscription.student_profile_id === request.student_profile_id) ?? null,
        approver: request.reviewed_by ? (profileRows.find((profile) => profile.id === request.reviewed_by) as Profile | undefined) ?? null : null,
      }));
    setRows(mappedRows);
    setAuditEvents(auditRows);
    const mappedSwitchRequests = switchRows.map((request) => ({
        ...request,
        program: programRow,
        student: profileRows.find((profile) => profile.id === request.student_profile_id) as StudentDisplay | null,
      }));
    setTrackSwitchRequests(mappedSwitchRequests);
    writePrivatePage<CachedApplicationsPage>(`applications:${slug}:${programId}:${mode}:${userId}`, {
      program: programRow, rows: mappedRows, tracks: trackRows, auditEvents: auditRows,
      switchRequests: mappedSwitchRequests, canDecide: Boolean(snapshot.canDecide),
    });
    setLoading(false);
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = getApplicationStatus(row.request);
      const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
      const plan = applicationPaymentPlanLabel(row, program);
      if (needsActionOnly && !applicationNeedsAction(status)) {
        return false;
      }
      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }
      if (payStatusFilter !== "all" && payStatus !== payStatusFilter) {
        return false;
      }
      if (trackFilter !== "all" && (row.request.program_track_id ?? "none") !== trackFilter) {
        return false;
      }
      if (planFilter !== "all" && plan.toLowerCase() !== planFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [row.request.student_profile_id, row.student?.full_name, row.parent?.full_name, row.student?.email, row.parent?.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [needsActionOnly, payStatusFilter, planFilter, program, rows, search, statusFilter, trackFilter]);

  const countByStatus = (status: RequestApplicationStatus) => rows.filter((row) => getApplicationStatus(row.request) === status).length;
  const approvedRows = rows.filter((row) => getApplicationStatus(row.request) === "approved_confirmation_required");
  const waitingConfirmationCount = approvedRows.filter((row) => {
    const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
    return payStatus === "not_required" || payStatus === "waived";
  }).length;
  const waitingPaymentCount = approvedRows.length - waitingConfirmationCount;
  const tracksById = Object.fromEntries(tracks.map((track) => [track.id, track]));
  const pendingSwitchRequests = trackSwitchRequests.filter((request) => request.status === "pending");

  async function decideTrackSwitchRequest(requestId: string, decision: "approved" | "rejected") {
    setSwitchRequestBusyId(requestId);
    const supabase = createSupabaseBrowserClient();
    const { error: decisionError } = await supabase.rpc(decision === "approved" ? "approve_track_switch_request" : "reject_track_switch_request", {
      target_request_id: requestId,
    });
    setSwitchRequestBusyId(null);
    if (decisionError) {
      setToast({ tone: "error", message: friendlyErrorMessage(decisionError, "Could not process this request.") });
      return;
    }
    setToast({ tone: "success", message: decision === "approved" ? "Switch approved." : "Switch rejected." });
    void loadApplications();
  }

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  if (error && !program) {
    return <EmptyState title="Could not load applications" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This class could not be loaded." />;
  }

  if (error?.startsWith("You don't have permission")) {
    return <EmptyState title="Applications unavailable" text={error} />;
  }

  return (
    <section className="space-y-5 bg-white px-4 pb-28 pt-4 text-[#26323A]">
      {error ? <p role="status" className="rounded-xl bg-[#FFF6E8] px-4 py-3 text-sm text-[#79521B]">Could not refresh applications. Showing the last loaded records.</p> : null}
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="rounded-[28px] bg-[#17624F] p-5 text-white shadow-[0_18px_45px_rgba(23,98,79,0.22)]">
        <h2 className="mt-2 text-2xl font-semibold leading-7">{program.title}</h2>
        <div className="mt-5 grid grid-cols-3 gap-4 text-center sm:grid-cols-6">
          <FinanceSummaryFigure value={countByStatus("pending_review").toString()} label="Pending Review" />
          <FinanceSummaryFigure value={waitingConfirmationCount.toString()} label="Waiting Confirmation" />
          <FinanceSummaryFigure value={waitingPaymentCount.toString()} label="Waiting Payment" />
          <FinanceSummaryFigure value={countByStatus("waitlisted").toString()} label="Waitlisted" />
          <FinanceSummaryFigure value={countByStatus("rejected").toString()} label="Rejected" />
          <FinanceSummaryFigure value={countByStatus("completed_enrolled").toString()} label="Completed" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-[#6B747B] sm:min-w-[220px]">
            <SearchIcon />
            <input aria-label="Search applications" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#26323A] outline-none" />
          {search ? <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="h-8 w-8 shrink-0 rounded-full text-lg hover:bg-black/5">×</button> : null}
          </label>
          <button
            type="button"
            onClick={() => setNeedsActionOnly((current) => !current)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] border px-3 text-sm font-semibold transition-colors",
              needsActionOnly ? "border-[#2F8FB3] bg-[#EAF5F9] text-[#2F8FB3]" : "border-[#D6DCE0] bg-white text-[#6B747B] hover:bg-[#F8FAFB]",
            )}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", needsActionOnly ? "bg-[#2F8FB3]" : "bg-[#D6DCE0]")} />
            <span className="sm:hidden">Action</span>
            <span className="hidden sm:inline">Needs Action</span>
          </button>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#52616A] transition-colors", filtersOpen && "bg-[#DDF2EB] text-[#17624F]")} aria-label={filtersOpen ? "Close application filters" : "Open application filters"} aria-expanded={filtersOpen}>
            <FilterSlidersIcon />
          </button>
        </div>
        {filtersOpen ? <div className="divide-y divide-[#EEF2F4] rounded-[16px] border border-[#DDE5E9] bg-white px-3">
          <CompactFinanceSelect
            label="Application status"
            value={statusFilter}
            options={["pending_review", "waitlisted", "rejected", "approved_confirmation_required", "completed_enrolled", "cancelled"]}
            labels={{
              pending_review: "Pending Review",
              waitlisted: "Waitlisted",
              rejected: "Rejected",
              approved_confirmation_required: "Approved",
              completed_enrolled: "Completed / Enrolled",
              cancelled: "Cancelled",
            }}
            onChange={setStatusFilter}
          />
          <CompactFinanceSelect
            label="Payment status"
            value={payStatusFilter}
            options={["not_required", "waived", "paid_externally", "payment_required", "checkout_pending", "paid", "active_subscription", "past_due", "failed", "ended"]}
            labels={{
              not_required: "Not required",
              waived: "Waived",
              paid_externally: "Paid Externally",
              payment_required: "Payment required",
              checkout_pending: "Awaiting payment",
              paid: "Paid",
              active_subscription: "Subscription active",
              past_due: "Past due",
              failed: "Failed",
              ended: "Ended",
            }}
            onChange={setPayStatusFilter}
          />
          {tracks.length ? (
            <CompactFinanceSelect
              label="Track"
              value={trackFilter}
              options={tracks.map((track) => track.id)}
              labels={Object.fromEntries(tracks.map((track) => [track.id, track.name]))}
              onChange={setTrackFilter}
            />
          ) : null}
          <CompactFinanceSelect
            label="Payment plan"
            value={planFilter}
            options={["free", "monthly subscription", program.is_ongoing ? "annual subscription" : "pay in full", "waived", "paid externally"]}
            labels={{ "pay in full": "Pay in Full", "annual subscription": "Annual subscription" }}
            onChange={setPlanFilter}
          />
        </div> : null}
      </div>

      <div className="flex items-center justify-between px-1 text-sm font-semibold text-[#6B747B]">
        <span>Showing {filteredRows.length} of {rows.length} applications</span>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-[#E1E8EC] bg-white shadow-[0_14px_38px_rgba(38,50,58,0.08)]">
        <div className="overflow-x-auto">
          <table className="min-w-[1240px] w-full text-left text-sm">
            <thead className="bg-[#F7FAFB] text-[11px] font-semibold uppercase tracking-wide text-[#7B858C]">
              <tr>
                {["Applicant / Student", "Parent / Guardian", "Track / Schedule", "Payment Plan", "Listed Price", "Application Status", "Payment Status", "Submitted", "Actions"].map((column) => (
                  <th key={column} className="px-4 py-3">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F4]">
              {filteredRows.map((row) => {
                const status = getApplicationStatus(row.request);
                const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
                const needsAction = applicationNeedsAction(status);
                return (
                  <tr
                    key={row.request.id}
                    tabIndex={0}
                    onPointerEnter={() => { void loadStudentActivity(programId, row.request.student_profile_id, "application").catch(() => undefined); }}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setDetailsTarget(row); } }}
                    onClick={() => setDetailsTarget(row)}
                    className={cn("cursor-pointer align-middle transition-colors hover:bg-[#F7FAFB]", needsAction ? "bg-[#EEF7FA]" : "")}
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[#26323A]">{row.student?.full_name || "Student"}</p>
                      <p className="mt-0.5 text-xs text-[#7B858C]">{row.parent ? "Child Student" : "Adult Student"}{row.student?.age ? ` · Age ${row.student.age}` : ""}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[#26323A]">{row.parent?.full_name || "Self"}</p>
                      <p className="mt-0.5 text-xs text-[#7B858C]">{row.parent?.email || "---"}</p>
                    </td>
                    <td className="px-4 py-4 text-[#52616A]">{row.track ? row.track.name : "—"}</td>
                    <td className="px-4 py-4 font-semibold text-[#52616A]">{applicationPaymentPlanLabel(row, program)}</td>
                    <td className="px-4 py-4 font-semibold text-[#26323A]">{applicationListedPrice(row, program)}</td>
                    <td className="px-4 py-4">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(applicationStatusTone(status)))}>
                        {getApplicationRowStatusLabel(status, payStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {isPaymentStatusMeaningful(row.request, program) ? (
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(paymentStatusTone(payStatus)))}>
                          {PAYMENT_STATUS_LABELS[payStatus]}
                        </span>
                      ) : (
                        <span className="text-[#9AA4AA]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[#52616A]">{formatFinanceDate(row.request.requested_at)}</td>
                    <td className="px-4 py-4">
                      <ChevronRightIcon />
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-semibold text-[#7B858C]">No matching applications.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {pendingSwitchRequests.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#26323A]">Pending Switch Requests</h2>
            <span className="rounded-full bg-[#EEF6F7] px-2.5 py-1 text-xs font-semibold text-[#17624F]">{pendingSwitchRequests.length}</span>
          </div>
          <div className="space-y-2">
            {pendingSwitchRequests.map((request) => (
              <TrackSwitchRequestCard
                key={request.id}
                request={request}
                tracksById={tracksById}
                busy={switchRequestBusyId === request.id}
                onApprove={canDecide ? () => void decideTrackSwitchRequest(request.id, "approved") : undefined}
                onReject={canDecide ? () => void decideTrackSwitchRequest(request.id, "rejected") : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Link href={`${mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`}/${programId}/applications/audit`} className="inline-flex min-h-11 items-center rounded-full bg-[#EEF6F7] px-4 text-sm font-semibold text-[#17624F]">
        View audit trail{auditEvents.length ? ` (${auditEvents.length})` : ""}
      </Link>

      {detailsTarget ? (
        <ApplicationReviewOverlay
          programId={programId}
          slug={slug}
          mode={mode}
          requestId={detailsTarget.request.id}
          initialRow={detailsTarget}
          initialProgram={program ?? undefined}
          canDecide={canDecide}
          onClose={() => {
            setDetailsTarget(null);
            if (searchParams.get("from") === "students") {
              router.replace(`${pathname.replace(/\/applications$/, "")}/students`, { scroll: false });
              return;
            }
            if (searchParams.has("studentId")) {
              const nextParams = new URLSearchParams(searchParams.toString());
              nextParams.delete("studentId");
              const query = nextParams.toString();
              router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
            }
          }}
          onChanged={loadApplications}
        />
      ) : null}
    </section>
  );
}

function TrackSwitchRequestCard({
  request,
  tracksById,
  reviewed = false,
  busy = false,
  onApprove,
  onReject,
}: {
  request: ProgramTrackSwitchRequestWithContext;
  tracksById: Record<string, ProgramTrack>;
  reviewed?: boolean;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const studentName = request.student?.full_name?.trim() || "Student";
  const fromNames = (request.from_track_ids ?? []).map((id) => tracksById[id]?.name || "Untitled track").join(", ") || "—";
  const toNames = (request.to_track_ids ?? []).map((id) => tracksById[id]?.name || "Untitled track").join(", ") || "—";
  const statusLabel = request.status.charAt(0).toUpperCase() + request.status.slice(1);

  return (
    <article className={cn("overflow-hidden rounded-[22px] border border-[#E1E8EC] bg-white shadow-[0_10px_24px_rgba(38,50,58,0.07)]", reviewed ? "opacity-70" : "")}>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-2 px-3 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#2F8FB3]" aria-hidden>
          <DefaultProfileIcon className="h-5 w-5" compact />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-5 text-[#26323A]">{studentName}</h3>
          <p className="mt-0.5 truncate text-xs leading-4 text-[#6B747B]">{request.program?.title ?? "Class"} · Schedule switch request</p>
        </div>
        {reviewed ? (
          <span className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold", request.status === "approved" ? "bg-[#EAF8EF] text-[#258A43]" : "bg-[#FDEDEA] text-[#C83F31]")}>
            {statusLabel}
          </span>
        ) : null}
        <ChevronIcon expanded={expanded} />
      </button>
      {expanded ? (
        <div className="border-t border-[#E6ECEF] bg-[#F8FAFB] px-5 py-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Switching from</dt>
            <dd className="text-[#26323A]">{fromNames}</dd>
            <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Switching to</dt>
            <dd className="text-[#26323A]">{toNames}</dd>
          </dl>
          {!reviewed && (onApprove || onReject) ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={onApprove} disabled={busy} className="min-h-10 rounded-[9px] bg-[#E2F6E8] px-2 text-xs font-semibold text-[#258A43] transition-colors hover:bg-[#D4F0DD] disabled:opacity-60">
                Accept
              </button>
              <button type="button" onClick={onReject} disabled={busy} className="min-h-10 rounded-[9px] bg-[#FCE8E4] px-2 text-xs font-semibold text-[#C83F31] transition-colors hover:bg-[#F9D8D1] disabled:opacity-60">
                Reject
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

type ProgramTrackSwitchRequestWithContext = ProgramTrackSwitchRequestRow & {
  program?: Program | null;
  student?: StudentDisplay | null;
};

type ProgramTrackSwitchRequestRow = Database["public"]["Tables"]["program_track_switch_requests"]["Row"];

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

function FinanceSummaryFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold leading-none text-white md:text-4xl">{value}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">{label}</p>
    </div>
  );
}

type CachedApplicationsPage = {
  program: Program;
  rows: ApplicationRow[];
  tracks: ProgramTrack[];
  auditEvents: ProgramFinanceAuditEvent[];
  switchRequests: ProgramTrackSwitchRequestWithContext[];
  canDecide: boolean;
};
