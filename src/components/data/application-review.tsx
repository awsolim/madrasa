"use client";
import { loadCachedSession } from "@/lib/client-cache";
import { loadPrivateSnapshot, operationalSnapshotKey } from "@/lib/query-cache";
import { loadStudentActivity, type StudentActivity } from "@/lib/student-activity";

import Link from "@/components/layout/workspace-link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { EmptyState } from "@/components/data/empty-state";
import { InboxLoadingPanel } from "@/components/data/inbox-shared";
import {
  applicationListedPrice,
  applicationPaymentPlanLabel,
  annualDealText,
  callApplicationAction,
  displayAge,
  formatFinanceDate,
  paymentTypeLabel,
  programPaymentOptions,
  programStatusBadgeToneClass,
  scheduleSummary,
} from "@/components/data/supabase-public-sections";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { StudentRecordAction } from "@/components/data/student-record-actions";
import { useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { friendlyErrorMessage } from "@/lib/errors";
import {
  applicationStatusTone,
  getApplicationPaymentStatus,
  getApplicationRowActions,
  getApplicationRowStatusLabel,
  getApplicationStatus,
  isPaymentStatusMeaningful,
  paymentStatusTone,
  PAYMENT_STATUS_LABELS,
  type ApplicationRowAction,
} from "@/lib/programs/applications";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProgramTrack = Database["public"]["Tables"]["program_tracks"]["Row"];
type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];
type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];
type StudentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type">;
type ParentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url">;
type PaymentType = "monthly" | "annual";
type RequestWithContext = EnrollmentRequest & {
  program?: Program | null;
  student?: StudentDisplay | null;
  parent?: ParentDisplay | null;
  approver?: Profile | null;
  track?: ProgramTrack | null;
  subscription?: ProgramSubscription | null;
};

export type ApplicationRow = {
  request: EnrollmentRequest;
  student: StudentDisplay | null;
  parent: ParentDisplay | null;
  track: ProgramTrack | null;
  subscription: ProgramSubscription | null;
  approver: Profile | null;
};

const APPLICATION_ACTION_LABELS: Record<ApplicationRowAction, string> = {
  view: "View Application",
  approve: "Approve",
  waitlist: "Waitlist",
  reject: "Reject",
  cancel_approval: "Undo Approval",
  change_price: "Change Approved Price",
  copy_confirmation_link: "Copy registration link",
  reopen: "Reopen Application",
  delete_permanently: "Permanently Remove Application",
};

function requestEffectivePriceCents(paymentType: PaymentType, request: RequestWithContext) {
  const useOverride = request.track?.pricing_override_enabled;
  if (paymentType === "annual") {
    return request.approved_price_annual_cents ?? (useOverride ? request.track?.price_annual_cents : request.program?.price_annual_cents) ?? 0;
  }
  return request.approved_price_monthly_cents ?? (useOverride ? request.track?.price_monthly_cents : request.program?.price_monthly_cents) ?? 0;
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}

/**
 * Self-contained "open an application on top of whatever page you're on" overlay.
 * Independently loads the one enrollment_request by id (rather than requiring the
 * caller's full rows array), so it can be mounted from the Applications table AND the
 * Inbox without either needing to know about the other. Owns its own decision/change-price
 * /confirm-action modal state; on any successful action it awaits the caller's onChanged
 * (so the underlying list re-fetches and the item is already reclassified as "past") before
 * closing, matching the existing per-row action wiring in ProgramApplicationsData.
 */
export function ApplicationReviewOverlay({
  programId,
  slug,
  mode,
  requestId,
  initialRow, initialProgram,
  canDecide = true,
  onClose,
  onChanged,
}: {
  programId: string;
  slug: string;
  mode: "teacher" | "admin";
  requestId: string;
  initialRow?: ApplicationRow;
  initialProgram?: Program;
  canDecide?: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [program, setProgram] = useState<Program | null>(initialProgram ?? null);
  const [row, setRow] = useState<ApplicationRow | null>(initialRow ?? null);
  const [loading, setLoading] = useState(!initialRow || !initialProgram);
  const [error, setError] = useState<string | null>(null);
  const [decisionAction, setDecisionAction] = useState<"approved" | "waitlisted" | "rejected" | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [changePriceOpen, setChangePriceOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel_approval" | "reopen" | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [closing, setClosing] = useState(false);
  const [trackEnrolledCount, setTrackEnrolledCount] = useState<number | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: false } }));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        let nextProgram = initialProgram;
        let nextRow = initialRow;
        if (!nextProgram || !nextRow) {
          const session = await loadCachedSession();
          if (!session) throw new Error("Please sign in again.");
          const snapshot = await loadPrivateSnapshot(operationalSnapshotKey("applications", slug, programId, session.user.id), async () => {
            const result = await supabase.rpc("get_program_applications_snapshot", { p_slug: slug, p_program_id: programId });
            if (result.error) throw result.error;
            return result.data;
          }) as unknown as { canView: boolean; program: Program; requests: EnrollmentRequest[]; tracks: ProgramTrack[]; subscriptions: ProgramSubscription[]; profiles: Profile[]; requestTrackLinks: { enrollment_request_id: string; program_track_id: string }[] };
          if (!snapshot.canView) throw new Error("You do not have access to this application.");
          const request = snapshot.requests.find((item) => item.id === requestId);
          if (!request) throw new Error("Application not found.");
          const trackId = request.program_track_id ?? snapshot.requestTrackLinks?.find((item) => item.enrollment_request_id === requestId)?.program_track_id;
          nextProgram = snapshot.program;
          nextRow = {
            request,
            student: snapshot.profiles.find((item) => item.id === request.student_profile_id) ?? null,
            parent: snapshot.profiles.find((item) => item.id === request.parent_profile_id) ?? null,
            approver: snapshot.profiles.find((item) => item.id === request.reviewed_by) ?? null,
            subscription: snapshot.subscriptions.find((item) => item.student_profile_id === request.student_profile_id) ?? null,
            track: snapshot.tracks.find((item) => item.id === trackId) ?? null,
          };
        }
        if (cancelled) return;
        setProgram(nextProgram);
        setRow(nextRow);
        setLoading(false);
        // Capacity is supplementary; never hold the applicant file behind it.
        if (nextRow.track) {
          const { data: enrollments, error } = await supabase.from("enrollments").select("id").eq("program_id", programId).eq("status", "active");
          if (error || cancelled) return;
          if (!enrollments?.length) { setTrackEnrolledCount(0); return; }
          const result = await supabase.from("enrollment_tracks").select("enrollment_id").eq("program_track_id", nextRow.track.id).in("enrollment_id", enrollments.map((item) => item.id));
          if (!cancelled && !result.error) setTrackEnrolledCount(result.data?.length ?? 0);
        }
      } catch (error) {
        if (!cancelled) { setError(friendlyErrorMessage(error, "Could not load application.")); setLoading(false); }
      }
    }

    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [programId, requestId, slug, initialRow, initialProgram]);

  async function handleCopyConfirmationLink() {
    const url = `${window.location.origin}/m/${slug}/registration/${requestId}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ tone: "success", message: "Registration confirmation link copied." });
    } catch {
      setToast({ tone: "error", message: "Could not copy link." });
    }
  }

  function handleAction(action: ApplicationRowAction) {
    if (action === "approve") {
      setDecisionAction("approved");
      return;
    }
    if (action === "waitlist") {
      setDecisionAction("waitlisted");
      return;
    }
    if (action === "reject") {
      setDecisionAction("rejected");
      return;
    }
    if (action === "cancel_approval" || action === "reopen") {
      setConfirmAction(action);
      return;
    }
    if (action === "delete_permanently") {
      setDeleteConfirmOpen(true);
      return;
    }
    if (action === "change_price") {
      setChangePriceOpen(true);
      return;
    }
    if (action === "copy_confirmation_link") {
      void handleCopyConfirmationLink();
    }
  }

  async function closeAfterChange() {
    setClosing(true);
    onClose();
    await onChanged();
  }

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 z-[2147483647] flex justify-end bg-[#26323A]/35 backdrop-blur-sm">
        <div className="flex h-full w-full max-w-md items-center justify-center bg-white">
          <InboxLoadingPanel label="Loading application" />
        </div>
      </div>,
      document.body,
    );
  }

  if (error || !program || !row) {
    return createPortal(
      <div className="fixed inset-0 z-[2147483647] flex justify-end bg-[#26323A]/35 backdrop-blur-sm">
        <div className="flex h-full w-full max-w-md flex-col bg-white p-5">
          <button type="button" onClick={onClose} className="self-end text-sm font-semibold text-[#6B747B]">
            Close
          </button>
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title="Could not load application" text={error ?? "This application could not be found."} />
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <>
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <ApplicationDetailsDrawer row={row} program={program} slug={slug} mode={mode} trackEnrolledCount={trackEnrolledCount} canDecide={canDecide} onClose={onClose} onAction={handleAction} />
      {decisionAction ? (
        <ApplicationDecisionModal
          target={{ request: { ...row.request, program, student: row.student, parent: row.parent, track: row.track }, action: decisionAction }}
          busy={decisionBusy || closing}
          onClose={() => {
            if (!decisionBusy) {
              setDecisionAction(null);
            }
          }}
          onSubmit={async (options) => {
            setDecisionBusy(true);
            const endpoint = decisionAction === "approved" ? "approve" : decisionAction === "waitlisted" ? "waitlist" : "reject";
            const result = await callApplicationAction(programId, requestId, endpoint, options);
            setDecisionBusy(false);
            if (!result.ok) {
              setToast({ tone: "error", message: result.error });
              return;
            }
            setDecisionAction(null);
            void closeAfterChange();
          }}
        />
      ) : null}
      {changePriceOpen ? (
        <ApplicationChangePriceModal
          row={row}
          program={program}
          onClose={() => setChangePriceOpen(false)}
          onSuccess={() => {
            setChangePriceOpen(false);
            void closeAfterChange();
          }}
        />
      ) : null}
      {confirmAction ? (
        <ApplicationConfirmActionModal
          row={row}
          action={confirmAction}
          program={program}
          onClose={() => setConfirmAction(null)}
          onSuccess={() => {
            setConfirmAction(null);
            void closeAfterChange();
          }}
        />
      ) : null}
      {deleteConfirmOpen ? (
        <ApplicationDeleteConfirmModal
          row={row}
          program={program}
          onClose={() => setDeleteConfirmOpen(false)}
          onSuccess={() => {
            setDeleteConfirmOpen(false);
            void closeAfterChange();
          }}
        />
      ) : null}
    </>
  );
}

function ApplicationDetailsDrawer({
  row,
  program,
  slug,
  mode,
  trackEnrolledCount = null,
  canDecide = true,
  onClose,
  onAction,
}: {
  row: ApplicationRow;
  program: Program;
  slug: string;
  mode: "teacher" | "admin";
  trackEnrolledCount?: number | null;
  canDecide?: boolean;
  onClose: () => void;
  onAction: (action: ApplicationRowAction) => void;
}) {
  const [activeTab, setActiveTab] = useState<"application" | "actions">("application");
  const [studentEvents, setStudentEvents] = useState<StudentActivity[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setEventsLoading(true);
      void loadStudentActivity(program.id, row.request.student_profile_id, "application").then((events) => {
        if (!cancelled) { setStudentEvents(events); setEventsError(null); }
      }).catch((error) => { if (!cancelled) setEventsError(error instanceof Error ? error.message : "Activity could not be loaded. Close and reopen to retry."); }).finally(() => { if (!cancelled) setEventsLoading(false); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [program.id, row.request.student_profile_id]);

  const status = getApplicationStatus(row.request);
  const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
  const basePath = mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
  const availableActions = canDecide ? getApplicationRowActions(status).filter((action) => action !== "view") : [];
  const recordActions: StudentRecordAction[] = [...availableActions.map((action): StudentRecordAction => ({
    id: action,
    label: APPLICATION_ACTION_LABELS[action],
    tone: action === "approve" ? "positive" : action === "reject" || action === "delete_permanently" ? "danger" : action === "waitlist" || action === "cancel_approval" ? "warning" : "default",
  })), ...(status === "completed_enrolled" ? [{ id: "manage_enrollment", label: "Manage student enrollment" } satisfies StudentRecordAction] : [])];

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-white text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <div className="flex shrink-0 items-center justify-between border-b border-[#EEF2F4] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
            <h2 className="mt-0.5 text-base font-semibold">{row.student?.full_name || "Student"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F6] text-[#26323A] hover:bg-[#E3ECEF]">
            <XIcon />
          </button>
        </div>

        <div className="shrink-0 border-b border-[#EEF2F4] px-4 py-2">
          <div className="grid grid-cols-2 rounded-[11px] bg-[#F1F5F6] p-1" role="tablist" aria-label="Application file sections">
            <button type="button" role="tab" aria-selected={activeTab === "application"} onClick={() => setActiveTab("application")} className={cn("min-h-9 rounded-[8px] px-3 text-xs font-semibold transition-colors", activeTab === "application" ? "bg-white text-[#26323A] shadow-sm" : "text-[#6B747B]")}>Application</button>
            <button type="button" role="tab" aria-selected={activeTab === "actions"} onClick={() => setActiveTab("actions")} className={cn("min-h-9 rounded-[8px] px-3 text-xs font-semibold transition-colors", activeTab === "actions" ? "bg-white text-[#26323A] shadow-sm" : "text-[#6B747B]")}>Actions</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {activeTab === "application" ? <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Application status</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", programStatusBadgeToneClass(applicationStatusTone(status)))}>
                {getApplicationRowStatusLabel(status, payStatus)}
              </span>
            </div>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[#26323A]">Applicant Information</h3>
              <div className="grid gap-1 rounded-[12px] border border-[#E1E8EC] bg-[#FAFCFC] p-2.5">
                {row.parent ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Child</span>
                      <span className="font-semibold">{row.student?.full_name || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Child Age</span>
                      <span className="font-semibold">{displayAge(row.student)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Gender</span>
                      <span className="font-semibold">{row.student?.gender || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Parent</span>
                      <span className="font-semibold">{row.parent.full_name || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Parent Email</span>
                      <span className="font-semibold">{row.parent.email || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Parent Phone</span>
                      <span className="font-semibold">{row.parent.phone_number || "—"}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Student</span>
                      <span className="font-semibold">{row.student?.full_name || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Email</span>
                      <span className="font-semibold">{row.student?.email || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Phone</span>
                      <span className="font-semibold">{row.student?.phone_number || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Age</span>
                      <span className="font-semibold">{displayAge(row.student)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B747B]">Gender</span>
                      <span className="font-semibold">{row.student?.gender || "—"}</span>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[#26323A]">Program Details</h3>
              <div className="grid gap-1 rounded-[12px] border border-[#E1E8EC] bg-[#FAFCFC] p-2.5">
                {isPaymentStatusMeaningful(row.request, program) ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Payment status</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", programStatusBadgeToneClass(paymentStatusTone(payStatus)))}>
                      {PAYMENT_STATUS_LABELS[payStatus]}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Track/Schedule</span>
                  <span className="font-semibold">{row.track ? row.track.name : "—"}</span>
                </div>
                {row.track ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Schedule</span>
                    <span className="font-semibold">{scheduleSummary(row.track.schedule, null).full}</span>
                  </div>
                ) : null}
                {row.track?.capacity != null ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Track capacity</span>
                    <span className={cn("font-semibold", trackEnrolledCount != null && trackEnrolledCount >= row.track.capacity ? "text-[#C0392B]" : "text-[#26323A]")}>
                      {trackEnrolledCount ?? "—"} / {row.track.capacity}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Location</span>
                  <span className="font-semibold">{row.track?.location || program.location || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Payment plan</span>
                  <span className="font-semibold">{applicationPaymentPlanLabel(row, program)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Listed price</span>
                  <span className="font-semibold">{applicationListedPrice(row, program)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Submitted</span>
                  <span className="font-semibold">{formatFinanceDate(row.request.requested_at)}</span>
                </div>
                {row.request.reviewed_at ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Reviewed</span>
                    <span className="font-semibold">
                      {formatFinanceDate(row.request.reviewed_at)} by {row.approver?.full_name || row.approver?.email || "staff"}
                    </span>
                  </div>
                ) : null}
                {row.request.decision_note ? (
                  <div className="pt-1">
                    <p className="text-[#6B747B]">Decision note</p>
                    <p className="mt-0.5 font-semibold">{row.request.decision_note}</p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[#26323A]">Audit Trail</h3>
              {eventsLoading ? (
                <div className="rounded-[12px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-2.5 font-semibold text-[#6B747B]">Loading activity...</div>
              ) : eventsError ? <p role="alert" className="text-sm text-red-700">{eventsError}</p> : !studentEvents?.length ? (
                <div className="rounded-[12px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-2.5 font-semibold text-[#6B747B]">No activity for this application yet.</div>
              ) : (
                <div className="divide-y divide-[#EEF2F4]">
                  {studentEvents.map((event) => (
                    <div key={event.id} className="py-2">
                      <div className="flex items-center gap-2">
                        {event.event_type === "manual_note" ? (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", programStatusBadgeToneClass("neutral"))}>Note</span>
                        ) : null}
                        <p className="font-semibold text-[#26323A]">{event.summary}</p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#7B858C]">{formatFinanceDate(event.created_at)} · {event.actor_name}</p>
                      {event.context ? <p className="mt-0.5 text-[11px] font-medium text-[#52616A]">{event.context}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div> : <div className="divide-y divide-[#E7ECEF]">
            {recordActions.length ? recordActions.map((action) => action.id === "manage_enrollment" ? (
              <Link key={action.id} href={`${basePath}/${program.id}/students?from=applications&studentSearch=${row.request.student_profile_id}`} className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-[10px] px-2 text-left text-[#26323A] transition-colors hover:bg-[#F4F7F8] active:bg-[#EAF0F2]">
                <span className="text-sm font-semibold">{action.label}</span><span aria-hidden="true" className="text-lg text-[#9AA6AC]">›</span>
              </Link>
            ) : (
              <button key={action.id} type="button" onClick={() => onAction(action.id as ApplicationRowAction)} className={cn("group flex min-h-14 w-full items-center justify-between gap-4 rounded-[10px] px-2 text-left transition-colors hover:bg-[#F4F7F8] active:bg-[#EAF0F2]", action.tone === "danger" ? "text-[#B42318]" : action.tone === "warning" ? "text-[#8A5A12]" : action.tone === "positive" ? "text-[#17624F]" : "text-[#26323A]")}>
                <span className="text-sm font-semibold">{action.label}</span><span aria-hidden="true" className="text-lg text-[#9AA6AC]">›</span>
              </button>
            )) : <p className="py-6 text-center text-sm text-[#6B747B]">No actions are available for this application.</p>}
          </div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApplicationChangePriceModal({
  row,
  program,
  onClose,
  onSuccess,
}: {
  row: ApplicationRow;
  program: Program;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const requestedPaymentType: PaymentType = row.request.payment_type === "annual" ? "annual" : "monthly";
  const [paymentType, setPaymentType] = useState<PaymentType>(requestedPaymentType);
  const initialCents = requestedPaymentType === "annual"
    ? row.request.approved_price_annual_cents ?? program.price_annual_cents ?? 0
    : row.request.approved_price_monthly_cents ?? program.price_monthly_cents ?? 0;
  const [price, setPrice] = useState((initialCents / 100).toFixed(2).replace(/\.00$/, ""));
  const [bypassPayment, setBypassPayment] = useState(row.request.payment_bypassed);
  const [bypassExternal, setBypassExternal] = useState(row.request.payment_bypass_external);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPlanMismatch, setConfirmPlanMismatch] = useState(false);

  const paymentOptions = programPaymentOptions(program);
  // Always include the applicant's actual plan even if the program's live pricing config has
  // since changed — the toggle must never silently hide what they were approved under.
  const allowedTypes = Array.from(new Set([requestedPaymentType, ...(paymentOptions.length ? paymentOptions.map((option) => option.type) : (["monthly"] as PaymentType[]))]));

  function selectPaymentType(type: PaymentType) {
    setPaymentType(type);
    const cents = type === "annual"
      ? row.request.approved_price_annual_cents ?? program.price_annual_cents ?? 0
      : row.request.approved_price_monthly_cents ?? program.price_monthly_cents ?? 0;
    setPrice((cents / 100).toFixed(2).replace(/\.00$/, ""));
  }

  function handleSaveClick() {
    if (!bypassPayment && paymentType !== requestedPaymentType) {
      setConfirmPlanMismatch(true);
      return;
    }
    void performSave();
  }

  async function performSave() {
    setError(null);
    if (bypassPayment) {
      setBusy(true);
      const result = await callApplicationAction(program.id, row.request.id, "waive", {
        external: bypassExternal,
        note: note.trim() || undefined,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess();
      onClose();
      return;
    }

    const cents = Math.round(parseFloat(price) * 100);
    if (!cents || Number.isNaN(cents) || cents < 50) {
      setError("Enter a valid price.");
      return;
    }
    setBusy(true);
    const result = await callApplicationAction(program.id, row.request.id, "change-price", {
      paymentType,
      priceMonthlyCents: paymentType === "monthly" ? cents : null,
      priceAnnualCents: paymentType === "annual" ? cents : null,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
        <h2 className="mt-1 text-xl font-semibold">Change Approved Price</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          {row.student?.full_name || "Student"} - Updates the price shown on Registration Confirmation. Already-completed payments are unaffected.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#26323A]">
          <input type="checkbox" checked={bypassPayment} onChange={(event) => setBypassPayment(event.target.checked)} disabled={busy} />
          Bypass payment process
        </label>

        {bypassPayment ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setBypassExternal(false)}
              className={cn(
                "min-h-10 rounded-[9px] px-2 text-xs font-semibold transition-colors disabled:opacity-60",
                !bypassExternal ? "bg-[#EEF3F5] text-[#26323A]" : "bg-white text-[#6B747B] ring-1 ring-inset ring-[#D6DCE0]",
              )}
            >
              No Payment
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setBypassExternal(true)}
              className={cn(
                "min-h-10 rounded-[9px] px-2 text-xs font-semibold transition-colors disabled:opacity-60",
                bypassExternal ? "bg-[#E2F6E8] text-[#258A43]" : "bg-white text-[#6B747B] ring-1 ring-inset ring-[#D6DCE0]",
              )}
            >
              Paid externally
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={busy}
                inputMode="decimal"
                className="h-11 rounded-[10px] border border-[#B9C3C8] px-3 text-sm font-semibold outline-none focus:border-[#2F8FB3] disabled:opacity-60"
              />
              {allowedTypes.length > 1 ? (
                <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#D6DCE0]">
                  {allowedTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      disabled={busy}
                      onClick={() => selectPaymentType(type)}
                      className={cn("px-3 text-xs font-semibold disabled:opacity-60", paymentType === type ? "bg-[#17624F] text-white" : "bg-white text-[#52616A]")}
                    >
                      {paymentTypeLabel(type, program)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="text-xs font-medium text-[#7B858C]">
              Applicant requested {paymentTypeLabel(requestedPaymentType, program)}.{paymentType !== requestedPaymentType ? " You are changing this plan." : ""}
            </p>
          </div>
        )}

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Internal note (optional)"
          className="mt-3 w-full rounded-[14px] border border-[#B9C3C8] px-3 py-2 text-sm font-semibold outline-none focus:border-[#2F8FB3] disabled:opacity-60"
        />

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs font-semibold text-[#C0392B]">{error ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B] disabled:opacity-50">Close</button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveClick}
              className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Saving..." : bypassPayment ? "Save" : "Save Price"}
            </button>
          </div>
        </div>
      </div>
      {confirmPlanMismatch ? (
        <ConfirmModal
          title="This isn't the plan the applicant requested"
          text={`${row.student?.full_name || "This student"} requested ${paymentTypeLabel(requestedPaymentType, program)}. You're about to set this to ${paymentTypeLabel(paymentType, program)} instead. Continue?`}
          confirmLabel="Yes, continue"
          onConfirm={() => {
            setConfirmPlanMismatch(false);
            void performSave();
          }}
          onCancel={() => setConfirmPlanMismatch(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function ApplicationConfirmActionModal({
  row,
  action,
  program,
  onClose,
  onSuccess,
}: {
  row: ApplicationRow;
  action: "cancel_approval" | "reopen";
  program: Program;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = {
    cancel_approval: {
      title: "Undo Approval",
      text: "This moves the application back to pending review. It does not affect any active enrollment.",
      endpoint: "cancel-approval" as const,
      confirmLabel: "Undo Approval",
    },
    reopen: {
      title: "Reopen Application",
      text: "This moves the rejected application back to pending review.",
      endpoint: "reopen" as const,
      confirmLabel: "Reopen Application",
    },
  }[action];

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await callApplicationAction(program.id, row.request.id, config.endpoint, {
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
        <h2 className="mt-1 text-xl font-semibold">{config.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">{row.student?.full_name || "Student"} - {config.text}</p>

        {action !== "reopen" ? (
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
            rows={3}
            placeholder="Internal note (optional)"
            className="mt-4 w-full rounded-[14px] border border-[#B9C3C8] px-3 py-2 text-sm font-semibold outline-none focus:border-[#2F8FB3] disabled:opacity-60"
          />
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs font-semibold text-[#C0392B]">{error ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B] disabled:opacity-50">Close</button>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Saving..." : config.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApplicationDeleteConfirmModal({
  row,
  program,
  onClose,
  onSuccess,
}: {
  row: ApplicationRow;
  program: Program;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await callApplicationAction(program.id, row.request.id, "delete", {});
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
        <h2 className="mt-1 text-xl font-semibold text-[#C83F31]">Permanently Remove Application</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          This permanently deletes {row.student?.full_name || "this student"}&apos;s application to {program.title}. This cannot be undone and the application will no longer appear in this list.
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs font-semibold text-[#C0392B]">{error ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B] disabled:opacity-50">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="min-h-10 rounded-[10px] bg-[#C83F31] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Deleting..." : "Delete Permanently"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ApplicationDecisionModal({
  target,
  busy = false,
  onClose,
  onSubmit,
}: {
  target: { request: RequestWithContext; action: "approved" | "waitlisted" | "rejected" };
  busy?: boolean;
  onClose: () => void;
  onSubmit: (options: { paymentType?: PaymentType; priceMonthlyCents?: number | null; priceAnnualCents?: number | null; paymentBypassed?: boolean; paymentBypassedExternal?: boolean; note?: string | null }) => void;
}) {
  const requestedPaymentType: PaymentType = target.request.payment_type === "annual" ? "annual" : "monthly";
  const programOptions = target.request.program ? programPaymentOptions(target.request.program) : [];
  const otherPaymentType: PaymentType = requestedPaymentType === "monthly" ? "annual" : "monthly";
  const canSwitchPlan = programOptions.some((option) => option.type === otherPaymentType);
  const [billingMode, setBillingMode] = useState<PaymentType>(requestedPaymentType);
  const [price, setPrice] = useState(() => {
    const cents = requestEffectivePriceCents(requestedPaymentType, target.request);
    const formatted = (cents / 100).toFixed(2).replace(/\.00$/, "");
    return formatted === "0" ? "" : formatted;
  });
  const [bypassPayment, setBypassPayment] = useState(false);
  const [bypassExternal, setBypassExternal] = useState(false);
  const [confirmPlanMismatch, setConfirmPlanMismatch] = useState(false);
  const studentName = target.request.student?.full_name?.trim() || "this student";
  const title = target.action === "approved" ? "Accept application" : target.action === "waitlisted" ? "Waitlist application" : "Reject application";
  const defaultNote =
    target.action === "waitlisted"
      ? "You have been waitlisted. We will notify you once a spot becomes available."
      : target.action === "rejected"
        ? "Your application was not accepted at this time."
        : bypassPayment
          ? "Your application was accepted and you have been admitted. Payment By-passed."
          : "Your application was accepted. Complete checkout to activate enrollment.";
  const [note, setNote] = useState(defaultNote);

  function selectBillingMode(type: PaymentType) {
    setBillingMode(type);
    const cents = requestEffectivePriceCents(type, target.request);
    const formatted = (cents / 100).toFixed(2).replace(/\.00$/, "");
    setPrice(formatted === "0" ? "" : formatted);
  }

  function submit() {
    const numericPrice = Math.max(0, Math.round(Number(price || "0") * 100));
    onSubmit({
      paymentBypassed: target.action === "approved" ? bypassPayment : false,
      paymentBypassedExternal: target.action === "approved" && bypassPayment ? bypassExternal : false,
      paymentType: billingMode,
      priceMonthlyCents: target.action === "approved" && !bypassPayment && billingMode === "monthly" ? numericPrice : null,
      priceAnnualCents: target.action === "approved" && !bypassPayment && billingMode === "annual" ? numericPrice : null,
      note: note.trim() || defaultNote,
    });
  }

  function handleConfirmClick() {
    if (target.action === "approved" && !bypassPayment && billingMode !== requestedPaymentType) {
      setConfirmPlanMismatch(true);
      return;
    }
    submit();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{target.request.program?.title ?? "Class application"}</p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">{studentName}</p>

        {target.action === "approved" ? (
          <div className="mt-5 space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-[#26323A]">
              <input
                type="checkbox"
                checked={bypassPayment}
                onChange={(event) => {
                  setBypassPayment(event.target.checked);
                  if (!event.target.checked) {
                    setBypassExternal(false);
                  }
                }}
              />
              Bypass payment process
            </label>
            {bypassPayment ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBypassExternal(false)}
                  className={cn(
                    "min-h-10 rounded-[9px] px-2 text-xs font-semibold transition-colors",
                    !bypassExternal ? "bg-[#EEF3F5] text-[#26323A]" : "bg-white text-[#6B747B] ring-1 ring-inset ring-[#D6DCE0]",
                  )}
                >
                  No Payment
                </button>
                <button
                  type="button"
                  onClick={() => setBypassExternal(true)}
                  className={cn(
                    "min-h-10 rounded-[9px] px-2 text-xs font-semibold transition-colors",
                    bypassExternal ? "bg-[#E2F6E8] text-[#258A43]" : "bg-white text-[#6B747B] ring-1 ring-inset ring-[#D6DCE0]",
                  )}
                >
                  Paid externally
                </button>
              </div>
            ) : null}
            {!bypassPayment ? (
              <>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Payment plan chosen by applicant</span>
                  <p className="mt-1 text-sm font-semibold text-[#26323A]">{target.request.program ? paymentTypeLabel(requestedPaymentType, target.request.program) : requestedPaymentType}</p>
                </div>
                {canSwitchPlan && target.request.program ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#D6DCE0]">
                      {[requestedPaymentType, otherPaymentType].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => selectBillingMode(type)}
                          className={cn("px-3 py-2 text-xs font-semibold transition-colors", billingMode === type ? "bg-[#17624F] text-white" : "bg-white text-[#52616A]")}
                        >
                          {paymentTypeLabel(type, target.request.program!)}
                        </button>
                      ))}
                    </div>
                    {billingMode !== requestedPaymentType ? (
                      <p className="text-xs font-medium text-[#C0392B]">This is not what the applicant requested.</p>
                    ) : null}
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{billingMode === "monthly" ? "Monthly price" : target.request.program?.is_ongoing ? "Annual subscription price" : "Pay in Full price"}</span>
                  <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" className="mt-1 h-11 w-full rounded-[10px] border border-[#B9C3C8] px-3 text-sm font-semibold outline-none focus:border-[#2F8FB3]" />
                </label>
                {billingMode === "annual" && target.request.program ? <p className="text-xs leading-5 text-[#7B858C]">{annualDealText(target.request.program)}</p> : null}
              </>
            ) : null}
          </div>
        ) : null}

        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Message</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 min-h-28 w-full resize-none rounded-[14px] border border-[#B9C3C8] px-3 py-2 text-sm leading-6 outline-none focus:border-[#2F8FB3]"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B] disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleConfirmClick} disabled={busy} className="min-h-10 rounded-[10px] bg-[#17624F] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Working..." : "Confirm"}
          </button>
        </div>
      </div>
      {confirmPlanMismatch && target.request.program ? (
        <ConfirmModal
          title="This isn't the plan the applicant requested"
          text={`${studentName} requested ${paymentTypeLabel(requestedPaymentType, target.request.program)}. You're about to approve this as ${paymentTypeLabel(billingMode, target.request.program)} instead. Continue?`}
          confirmLabel="Yes, continue"
          onConfirm={() => {
            setConfirmPlanMismatch(false);
            submit();
          }}
          onCancel={() => setConfirmPlanMismatch(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
