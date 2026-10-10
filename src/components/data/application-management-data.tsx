"use client";

import { ChevronIcon, programStatusBadgeToneClass, titleCase } from "@/components/data/program-builder-shared";
import type { Profile, Program, ProgramTrack } from "@/components/data/program-builder-shared";
import { loadStudentActivity } from "@/lib/student-activity";
import Link from "@/components/layout/workspace-link";
import { ApplicationReviewOverlay, type ApplicationRow } from "@/components/data/application-review";
import { useSearchParams } from "next/navigation";
import { useWorkspacePathname as usePathname, useWorkspaceRouter as useRouter } from "@/components/layout/workspace-navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/data/empty-state";
import { DirectorySkeleton } from "@/components/data/data-loading";
import { EditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { getCachedSessionSnapshot, loadCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import { clearPrivatePage, loadPrivateSnapshot, operationalSnapshotKey, readPrivatePage, writePrivatePage } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  applicationNeedsAction,
  applicationStatusTone,
  getApplicationPaymentStatus,
  getApplicationRowStatusLabel,
  getApplicationStatus,
  type ApplicationStatus as RequestApplicationStatus,
} from "@/lib/programs/applications";
import { ChevronRightIcon, DefaultProfileIcon, EnrollmentRequest, ParentDisplay, ProgramFinanceAuditEvent, ProgramSubscription, SearchIcon, StudentDisplay, formatFinanceDate, resolveRequestTrack } from "@/components/data/application-management-shared";

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
  const [trackFilter, setTrackFilter] = useState("all");
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
  const [reminderBusy, setReminderBusy] = useState<string | null>(null);
  const [reminderTarget, setReminderTarget] = useState<"all" | string | null>(null);
  const [remindedToday, setRemindedToday] = useState<Set<string>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return new Set((initialPage?.auditEvents ?? []).filter((event) => {
      const metadata = event.metadata as Record<string, unknown> | null;
      return event.event_type === "application_payment_reminder_sent" && event.created_at.slice(0, 10) === today && Number(metadata?.sent ?? 0) > 0 && typeof metadata?.enrollmentRequestId === "string";
    }).map((event) => String((event.metadata as Record<string, unknown>).enrollmentRequestId)));
  });

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
      if (needsActionOnly && !applicationNeedsAction(status)) {
        return false;
      }
      const waitingForPayment = status === "approved_confirmation_required" && ["payment_required", "checkout_pending"].includes(payStatus);
      const waitingForConfirmation = status === "approved_confirmation_required" && !waitingForPayment;
      if (statusFilter !== "all" && statusFilter !== status && !(statusFilter === "waiting_payment" && waitingForPayment) && !(statusFilter === "waiting_confirmation" && waitingForConfirmation) && !(statusFilter === "closed" && ["rejected", "cancelled"].includes(status))) {
        return false;
      }
      if (trackFilter !== "all" && (row.request.program_track_id ?? "none") !== trackFilter) {
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
  }, [needsActionOnly, program, rows, search, statusFilter, trackFilter]);

  const countByStatus = (status: RequestApplicationStatus) => rows.filter((row) => getApplicationStatus(row.request) === status).length;
  const approvedRows = rows.filter((row) => getApplicationStatus(row.request) === "approved_confirmation_required");
  const waitingConfirmationCount = approvedRows.filter((row) => {
    const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
    return !["payment_required", "checkout_pending"].includes(payStatus);
  }).length;
  const waitingPaymentRows = approvedRows.filter((row) => ["payment_required", "checkout_pending"].includes(getApplicationPaymentStatus(row.request, program, row.subscription)));
  const waitingPaymentCount = waitingPaymentRows.length;
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

  async function sendPaymentReminder(requestId: string | undefined, message: string) {
    setReminderBusy(requestId ?? "all");
    try {
      const session = await loadCachedSession();
      const token = session?.access_token;
      if (!token) throw new Error("Log in required.");
      const response = await fetch(`/api/programs/${programId}/applications/payment-reminders`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...(requestId ? { requestId } : {}), message }),
      });
      const result = await response.json() as { error?: string; applications?: number; sent?: number; skipped?: number; failed?: number; reasons?: string[]; requestIds?: string[] };
      if (!response.ok) throw new Error(result.error || "Could not send the payment reminder.");
      const sent = result.sent ?? 0;
      const toastMessage = sent > 0
        ? requestId
          ? "Payment reminder sent."
          : `Payment reminders sent for ${result.applications ?? 0} applications.`
        : result.reasons?.length
          ? `No email was sent: ${result.reasons.join(" ")}`
          : "No email was sent. It may have already been sent today, or no recipient email is available.";
      setToast({ tone: sent > 0 ? "success" : "error", message: toastMessage });
      if (sent > 0) setRemindedToday((current) => new Set([...current, ...(result.requestIds ?? [])]));
      return true;
    } catch (reminderError) {
      setToast({ tone: "error", message: friendlyErrorMessage(reminderError, "Could not send the payment reminder.") });
      return false;
    } finally {
      setReminderBusy(null);
    }
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
            label="Stage"
            value={statusFilter}
            options={["pending_review", "waiting_payment", "waiting_confirmation", "waitlisted", "completed_enrolled", "closed"]}
            labels={{
              pending_review: "Pending Review",
              waiting_payment: "Waiting Payment",
              waiting_confirmation: "Waiting Confirmation",
              waitlisted: "Waitlisted",
              completed_enrolled: "Completed / Enrolled",
              closed: "Rejected / Cancelled",
            }}
            onChange={setStatusFilter}
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
        </div> : null}
      </div>

      {canDecide && waitingPaymentCount > 0 ? (
        <div className="flex items-center justify-between gap-3 border-y border-[#E7ECEF] px-1 py-2.5">
          <p className="text-xs font-medium text-[#6B747B]">{waitingPaymentCount} waiting for payment</p>
          <button type="button" disabled={reminderBusy !== null} onClick={() => setReminderTarget("all")} className="min-h-9 shrink-0 rounded-full bg-[#17624F] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#125240] disabled:opacity-60">
            {reminderBusy === "all" ? "Sending…" : "Send reminders"}
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-1 text-sm font-semibold text-[#6B747B]">
        <span>Showing {filteredRows.length} of {rows.length} applications</span>
      </div>

      <div className="space-y-2 md:hidden">
        {filteredRows.map((row) => {
          const status = getApplicationStatus(row.request);
          const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
          return (
            <article key={row.request.id} className="overflow-hidden rounded-[16px] border border-[#E1E8EC] bg-white">
              <button type="button" onClick={() => setDetailsTarget(row)} onPointerEnter={() => { void loadStudentActivity(programId, row.request.student_profile_id, "application").catch(() => undefined); }} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#17624F]" aria-hidden><DefaultProfileIcon className="h-5 w-5" compact /></span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-semibold leading-5 text-[#26323A]">{row.student?.full_name || "Student"}</span>
                  <span className="mt-1 block text-xs leading-4 text-[#6B747B]">{row.track?.name || "No track"}{row.parent ? ` · ${row.parent.full_name || "Parent"}` : ""}</span>
                  <span className={cn("mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4", programStatusBadgeToneClass(applicationStatusTone(status)))}>{getApplicationRowStatusLabel(status, payStatus)}</span>
                </span>
                <span className="mt-2"><ChevronRightIcon /></span>
              </button>
            </article>
          );
        })}
        {!filteredRows.length ? <div className="rounded-[18px] border border-[#E1E8EC] bg-white px-4 py-10 text-center text-sm font-semibold text-[#7B858C]">No matching applications.</div> : null}
      </div>

      <div className="hidden overflow-hidden rounded-[20px] border border-[#E1E8EC] bg-white md:block">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-[#F7FAFB] text-[11px] font-semibold uppercase tracking-wide text-[#7B858C]">
              <tr>
                <th className="w-[31%] px-4 py-3">Student</th>
                <th className="w-[23%] px-4 py-3">Track</th>
                <th className="w-[26%] px-4 py-3">Status</th>
                <th className="w-[14%] px-4 py-3">Submitted</th>
                <th className="w-[6%] px-3 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F4]">
              {filteredRows.map((row) => {
                const status = getApplicationStatus(row.request);
                const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
                return (
                  <tr
                    key={row.request.id}
                    tabIndex={0}
                    onPointerEnter={() => { void loadStudentActivity(programId, row.request.student_profile_id, "application").catch(() => undefined); }}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setDetailsTarget(row); } }}
                    onClick={() => setDetailsTarget(row)}
                    className="cursor-pointer align-middle transition-colors hover:bg-[#F7FAFB]"
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[#26323A]">{row.student?.full_name || "Student"}</p>
                      <p className="mt-0.5 truncate text-xs text-[#7B858C]">{row.parent ? row.parent.full_name || "Parent" : "Adult student"}</p>
                    </td>
                    <td className="truncate px-4 py-4 text-[#52616A]">{row.track ? row.track.name : "—"}</td>
                    <td className="px-4 py-4">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(applicationStatusTone(status)))}>
                        {getApplicationRowStatusLabel(status, payStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[#52616A]">{formatFinanceDate(row.request.requested_at)}</td>
                    <td className="px-3 py-4">
                      <ChevronRightIcon />
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-[#7B858C]">No matching applications.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
          onSendPaymentReminder={() => setReminderTarget(detailsTarget.request.id)}
          paymentReminderBusy={reminderBusy === detailsTarget.request.id}
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
      {reminderTarget ? (
        <PaymentReminderConfirmModal
          programTitle={program.title}
          rows={reminderTarget === "all" ? waitingPaymentRows : waitingPaymentRows.filter((row) => row.request.id === reminderTarget)}
          remindedToday={remindedToday}
          busy={reminderBusy !== null}
          onClose={() => { if (reminderBusy === null) setReminderTarget(null); }}
          onConfirm={async (message) => {
            const completed = await sendPaymentReminder(reminderTarget === "all" ? undefined : reminderTarget, message);
            if (completed) setReminderTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

function PaymentReminderConfirmModal({ programTitle, rows, remindedToday, busy, onClose, onConfirm }: { programTitle: string; rows: ApplicationRow[]; remindedToday: Set<string>; busy: boolean; onClose: () => void; onConfirm: (message: string) => Promise<void> | void }) {
  const [message, setMessage] = useState(`Your application to ${programTitle} has been approved and is waiting for payment. Complete payment in Madrasa to finish registration and activate enrollment.`);
  const recipients = rows.map((row) => ({
    requestId: row.request.id,
    student: row.student?.full_name || "Student",
    emails: Array.from(new Set([row.parent?.email, row.student?.email].filter((email): email is string => Boolean(email?.trim())).map((email) => email.trim().toLowerCase()))),
  }));
  const sendable = recipients.filter((recipient) => !remindedToday.has(recipient.requestId) && recipient.emails.length > 0);

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/40 px-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="payment-reminder-title" className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-[24px] bg-white text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.24)]">
        <div className="border-b border-[#E7ECEF] px-5 py-4">
          <h2 id="payment-reminder-title" className="text-lg font-semibold">Send payment reminder{rows.length === 1 ? "" : "s"}</h2>
          <p className="mt-1 text-sm text-[#6B747B]">Review the recipients and message before sending.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Recipients</h3>
            <div className="mt-2 divide-y divide-[#EEF2F4] rounded-[14px] border border-[#E1E8EC] px-3">
              {recipients.map((recipient) => <div key={recipient.requestId} className="py-2.5">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{recipient.student}</p>{remindedToday.has(recipient.requestId) ? <span className="shrink-0 rounded-full bg-[#EEF3F5] px-2 py-1 text-[10px] font-semibold text-[#6B747B]">Sent today</span> : null}</div>
                <p className="mt-1 break-all text-xs text-[#6B747B]">{recipient.emails.join(", ") || "No email address available"}</p>
              </div>)}
            </div>
          </section>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Email message</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} rows={5} className="mt-2 w-full resize-none rounded-[14px] border border-[#C9D3D7] px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#17624F]" />
          </label>
          {sendable.length === 0 ? <p className="rounded-[12px] bg-[#F4F7F8] px-3 py-2.5 text-xs font-medium text-[#52616A]">No new emails can be sent. Each available recipient was already emailed today, or has no email address.</p> : <p className="text-xs text-[#6B747B]">This will send to {sendable.length} application{sendable.length === 1 ? "" : "s"}. A reminder can only be sent once per application each day.</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#E7ECEF] px-5 py-4">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B] disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || sendable.length === 0 || !message.trim()} onClick={() => void onConfirm(message.trim())} className="min-h-10 rounded-[11px] bg-[#17624F] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : `Send ${sendable.length || ""} reminder${sendable.length === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </div>
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
