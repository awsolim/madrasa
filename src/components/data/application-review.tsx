"use client";

import Link from "next/link";
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
  programPaymentOptions,
  programStatusBadgeToneClass,
  scheduleSummary,
} from "@/components/data/supabase-public-sections";
import { useModalFocusTrap } from "@/hooks/use-modal-behavior";
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
type ProgramFinanceAuditEvent = Database["public"]["Tables"]["program_finance_audit_events"]["Row"];
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

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
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
  onClose,
  onChanged,
}: {
  programId: string;
  slug: string;
  mode: "teacher" | "admin";
  requestId: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [program, setProgram] = useState<Program | null>(null);
  const [row, setRow] = useState<ApplicationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionAction, setDecisionAction] = useState<"approved" | "waitlisted" | "rejected" | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [changePriceOpen, setChangePriceOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel_approval" | "reopen" | null>(null);
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
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowserClient();
      const [{ data: programRow }, { data: request, error: requestError }, { data: trackLinkRows }] = await Promise.all([
        supabase.from("programs").select("*").eq("id", programId).maybeSingle(),
        supabase.from("enrollment_requests").select("*").eq("id", requestId).maybeSingle(),
        supabase.from("enrollment_request_tracks").select("program_track_id").eq("enrollment_request_id", requestId),
      ]);
      if (cancelled) {
        return;
      }
      if (requestError || !request || !programRow) {
        setError(requestError?.message ?? "Application not found.");
        setLoading(false);
        return;
      }

      const linkedTrackIds = (trackLinkRows ?? []).map((linkRow) => linkRow.program_track_id);
      const primaryTrackId = request.program_track_id ?? linkedTrackIds[0] ?? null;
      let trackRow: ProgramTrack | null = null;
      let nextTrackEnrolledCount: number | null = null;
      if (primaryTrackId) {
        const trackResult = await supabase.from("program_tracks").select("*").eq("id", primaryTrackId).maybeSingle();
        trackRow = trackResult.data ?? null;
        const { data: activeEnrollments } = await supabase.from("enrollments").select("id").eq("program_id", programId).eq("status", "active");
        const activeEnrollmentIds = (activeEnrollments ?? []).map((enrollment) => enrollment.id);
        nextTrackEnrolledCount = activeEnrollmentIds.length
          ? (await supabase.from("enrollment_tracks").select("enrollment_id").eq("program_track_id", primaryTrackId).in("enrollment_id", activeEnrollmentIds)).data?.length ?? 0
          : 0;
      }
      const { data: subscriptionRow } = await supabase
        .from("program_subscriptions")
        .select("*")
        .eq("program_id", programId)
        .eq("student_profile_id", request.student_profile_id)
        .maybeSingle();
      const profileIds = Array.from(new Set([request.student_profile_id, request.parent_profile_id, request.reviewed_by].filter(Boolean))) as string[];
      const { data: profileRows } = profileIds.length
        ? await supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type").in("id", profileIds)
        : { data: [] as StudentDisplay[] };

      if (cancelled) {
        return;
      }
      setProgram(programRow);
      setRow({
        request,
        student: (profileRows ?? []).find((profile) => profile.id === request.student_profile_id) as StudentDisplay | null,
        parent: request.parent_profile_id ? ((profileRows ?? []).find((profile) => profile.id === request.parent_profile_id) as ParentDisplay | undefined) ?? null : null,
        track: trackRow,
        subscription: subscriptionRow ?? null,
        approver: request.reviewed_by ? ((profileRows ?? []).find((profile) => profile.id === request.reviewed_by) as Profile | undefined) ?? null : null,
      });
      setTrackEnrolledCount(nextTrackEnrolledCount);
      setLoading(false);
    }

    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [programId, requestId]);

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
      <ApplicationDetailsDrawer row={row} program={program} slug={slug} mode={mode} trackEnrolledCount={trackEnrolledCount} onClose={onClose} onAction={handleAction} />
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
    </>
  );
}

function ApplicationDetailsDrawer({
  row,
  program,
  slug,
  mode,
  trackEnrolledCount = null,
  onClose,
  onAction,
}: {
  row: ApplicationRow;
  program: Program;
  slug: string;
  mode: "teacher" | "admin";
  trackEnrolledCount?: number | null;
  onClose: () => void;
  onAction: (action: ApplicationRowAction) => void;
}) {
  const [studentEvents, setStudentEvents] = useState<ProgramFinanceAuditEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setEventsLoading(true);
      const supabase = createSupabaseBrowserClient();
      void supabase
        .from("program_finance_audit_events")
        .select("*")
        .eq("program_id", program.id)
        .eq("student_profile_id", row.request.student_profile_id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => {
          if (cancelled) {
            return;
          }
          setStudentEvents(data ?? []);
          setEventsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [program.id, row.request.student_profile_id]);

  const status = getApplicationStatus(row.request);
  const payStatus = getApplicationPaymentStatus(row.request, program, row.subscription);
  const basePath = mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
  const availableActions = getApplicationRowActions(status).filter((action) => action !== "view");
  const decisionActions = availableActions.filter((action): action is "approve" | "waitlist" | "reject" => action === "approve" || action === "waitlist" || action === "reject");
  const secondaryActions = availableActions.filter((action) => action !== "approve" && action !== "waitlist" && action !== "reject");

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="flex h-full w-full max-w-md flex-col bg-white text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <div className="flex shrink-0 items-center justify-between border-b border-[#EEF2F4] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
            <h2 className="mt-0.5 text-base font-semibold">{row.student?.full_name || "Student"}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F6] text-[#26323A] hover:bg-[#E3ECEF]">
            <XIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Application status</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", programStatusBadgeToneClass(applicationStatusTone(status)))}>
                {getApplicationRowStatusLabel(status, payStatus)}
              </span>
            </div>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[#26323A]">Applicant Information</h3>
              <div className="grid gap-1 rounded-[12px] border border-[#E1E8EC] bg-[#FAFCFC] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Student type</span>
                  <span className="font-semibold">{row.parent ? "Child Student" : "Adult Student"}</span>
                </div>
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
              ) : !studentEvents?.length ? (
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
                      <p className="mt-0.5 text-[11px] text-[#7B858C]">{formatFinanceDate(event.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {availableActions.length ? (
          <div className="shrink-0 space-y-2 border-t border-[#EEF2F4] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {decisionActions.length ? (
              <div className={cn("grid gap-2", decisionActions.length === 3 ? "grid-cols-3" : decisionActions.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                {decisionActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => onAction(action)}
                    className={cn(
                      "min-h-9 rounded-[9px] px-2 text-xs font-semibold transition-colors",
                      action === "approve"
                        ? "bg-[#E2F6E8] text-[#258A43] hover:bg-[#D4F0DD]"
                        : action === "waitlist"
                          ? "bg-[#FFF4D6] text-[#8A6418] hover:bg-[#FFE9A8]"
                          : "bg-[#FCE8E4] text-[#C83F31] hover:bg-[#F9D8D1]",
                    )}
                  >
                    {APPLICATION_ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            ) : null}
            {secondaryActions.length ? (
              <div className="space-y-2">
                {secondaryActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => onAction(action)}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-center gap-2 rounded-[9px] px-3 text-xs font-semibold transition-colors",
                      action === "change_price"
                        ? "bg-[#E7F3F8] text-[#257B9C] hover:bg-[#DDEEF6]"
                        : action === "cancel_approval"
                          ? "bg-[#FFF4D6] text-[#8A6418] hover:bg-[#FFE9A8]"
                          : "border border-[#D6DCE0] bg-white text-[#26323A] hover:bg-[#F7FAFB]",
                    )}
                  >
                    {action === "copy_confirmation_link" ? <CopyIcon /> : null}
                    {APPLICATION_ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {status === "completed_enrolled" ? (
          <div className="shrink-0 border-t border-[#EEF2F4] px-4 py-3">
            <Link href={`${basePath}/${program.id}/students?from=applications&studentId=${row.request.student_profile_id}`} className="text-xs font-semibold text-[#17624F] hover:underline">
              View student in class list →
            </Link>
          </div>
        ) : null}
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
  const isAnnual = row.request.payment_type === "annual";
  const [paymentType, setPaymentType] = useState<"monthly" | "annual">(isAnnual ? "annual" : "monthly");
  const initialCents = isAnnual
    ? row.request.approved_price_annual_cents ?? program.price_annual_cents ?? 0
    : row.request.approved_price_monthly_cents ?? program.price_monthly_cents ?? 0;
  const [price, setPrice] = useState((initialCents / 100).toFixed(2).replace(/\.00$/, ""));
  const [bypassPayment, setBypassPayment] = useState(row.request.payment_bypassed);
  const [bypassExternal, setBypassExternal] = useState(row.request.payment_bypass_external);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paymentOptions = programPaymentOptions(program);
  const allowedTypes = paymentOptions.length ? paymentOptions.map((option) => option.type) : (["monthly"] as PaymentType[]);

  async function handleSave() {
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
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
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
                    onClick={() => setPaymentType(type)}
                    className={cn("px-3 text-xs font-semibold disabled:opacity-60", paymentType === type ? "bg-[#17624F] text-white" : "bg-white text-[#52616A]")}
                  >
                    {type === "monthly" ? "Monthly" : "Pay in Full"}
                  </button>
                ))}
              </div>
            ) : null}
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
              onClick={handleSave}
              className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Saving..." : bypassPayment ? "Save" : "Save Price"}
            </button>
          </div>
        </div>
      </div>
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
  const requestedPaymentType = target.request.payment_type === "annual" ? "annual" : "monthly";
  const programOptions = target.request.program ? programPaymentOptions(target.request.program) : [];
  const allowedPaymentTypes = programOptions.length ? programOptions.map((option) => option.type) : (["monthly"] as PaymentType[]);
  const billingMode = allowedPaymentTypes.includes(requestedPaymentType) ? requestedPaymentType : allowedPaymentTypes[0] ?? "monthly";
  const defaultPriceCents = requestEffectivePriceCents(billingMode, target.request);
  const defaultPrice = (defaultPriceCents / 100).toFixed(2).replace(/\.00$/, "");
  const [price, setPrice] = useState(defaultPrice === "0" ? "" : defaultPrice);
  const [bypassPayment, setBypassPayment] = useState(false);
  const [bypassExternal, setBypassExternal] = useState(false);
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
                  <p className="mt-1 text-sm font-semibold text-[#26323A]">{billingMode === "monthly" ? "Monthly" : "Pay in Full"}</p>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{billingMode === "monthly" ? "Monthly price" : "Pay in Full price"}</span>
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
          <button type="button" onClick={submit} disabled={busy} className="min-h-10 rounded-[10px] bg-[#17624F] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Working..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
