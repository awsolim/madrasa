"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApplicantDetailsDrawer,
  applicantRowFromRequest,
  callApplicationAction,
  formatFinanceDate,
  resolveRequestTrack,
  StudentAnnouncementCard,
  StudentNoteBubble,
  type ApplicantApplicationRow,
} from "@/components/data/supabase-public-sections";
import { EditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { EmptyState } from "@/components/data/empty-state";
import { FloatingInboxTabs, InboxLoadingPanel, InboxSection } from "@/components/data/inbox-shared";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { friendlyErrorMessage } from "@/lib/errors";
import { buildAnnouncementThreads, buildNoteThreads } from "@/lib/messages/threads";
import {
  fetchNotificationState,
  markNotificationsSeen,
  revertOptimisticKeys,
  studentRequestNotificationKey,
  studentRequestRequiresAction,
  studentRequestShouldNotify,
  studentWithdrawalNotificationKey,
} from "@/lib/notifications/inbox";
import {
  getApplicationPaymentStatus,
  getApplicationRowStatusLabel,
  getApplicationStatus,
} from "@/lib/programs/applications";
import { isCurrentEnrollmentStatus } from "@/lib/programs/enrollment-status";
import { fetchParentChildren } from "@/lib/programs/family";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProgramTrack = Database["public"]["Tables"]["program_tracks"]["Row"];
type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];
type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];
type WithdrawalRequest = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];
type AnnouncementReceipt = Database["public"]["Tables"]["program_announcement_receipts"]["Row"];
type ProgramStudentNote = Database["public"]["Tables"]["program_student_notes"]["Row"];
type StudentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type">;
type ParentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url">;

type RequestWithContext = EnrollmentRequest & {
  program?: Program | null;
  student?: StudentDisplay | null;
  parent?: ParentDisplay | null;
  approver?: Profile | null;
  track?: ProgramTrack | null;
  subscription?: ProgramSubscription | null;
};
type WithdrawalRequestWithContext = WithdrawalRequest & {
  program?: Program | null;
  student?: StudentDisplay | null;
  parent?: ParentDisplay | null;
  subscription?: ProgramSubscription | null;
};
type AnnouncementWithContext = Database["public"]["Tables"]["program_announcements"]["Row"] & {
  program?: Program | null;
  author?: Profile | null;
  receipt?: AnnouncementReceipt | null;
};
type StudentNoteWithContext = ProgramStudentNote & {
  program?: Program | null;
  student?: StudentDisplay | null;
  recipient?: Profile | null;
  author?: Profile | null;
};
type EnrollmentTrackSelection = Pick<Enrollment, "id" | "program_id" | "student_profile_id" | "program_track_id" | "created_at" | "status">;
type StudentInboxThread =
  | { kind: "announcements"; programId: string; programTitle?: string | null }
  | { kind: "notes"; programId: string; studentId: string; programTitle?: string | null; studentName?: string | null };

const ANNOUNCEMENT_THREAD_PAGE_SIZE = 25;
const NOTE_THREAD_PAGE_SIZE = 25;

function timeAgo(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function DefaultProfileIcon({ className = "h-6 w-6", compact = false }: { className?: string; compact?: boolean } = {}) {
  const icon = (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c1-3.2 3.2-5 6.5-5s5.5 1.8 6.5 5" />
    </svg>
  );

  if (compact) {
    return icon;
  }

  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#2F8FB3]" aria-hidden>
      {icon}
    </span>
  );
}

function MiniEmpty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#D6DCE0] px-4 py-6 text-center text-sm text-[#6B747B]">{text}</div>;
}

function getAnnouncementTargetTrackIds(announcement: Pick<AnnouncementWithContext, "target_program_track_ids">) {
  return announcement.target_program_track_ids ?? [];
}

function getEnrollmentTrackIdsByProgram(enrollments: EnrollmentTrackSelection[], enrollmentTrackRows: Array<{ enrollment_id: string; program_track_id: string }>) {
  const trackIdsByEnrollmentId = new Map<string, string[]>();
  for (const row of enrollmentTrackRows) {
    trackIdsByEnrollmentId.set(row.enrollment_id, [...(trackIdsByEnrollmentId.get(row.enrollment_id) ?? []), row.program_track_id]);
  }

  const trackIdsByProgramId = new Map<string, Set<string>>();
  for (const enrollment of enrollments) {
    const selectedTrackIds = [
      ...(trackIdsByEnrollmentId.get(enrollment.id) ?? []),
      ...(enrollment.program_track_id ? [enrollment.program_track_id] : []),
    ].filter((trackId, index, all) => all.indexOf(trackId) === index);

    const programTrackIds = trackIdsByProgramId.get(enrollment.program_id) ?? new Set<string>();
    for (const trackId of selectedTrackIds) {
      programTrackIds.add(trackId);
    }
    trackIdsByProgramId.set(enrollment.program_id, programTrackIds);
  }

  return trackIdsByProgramId;
}

/** Earliest enrollment created_at per program, across all target students — the "join date" cutoff before which an announcement shouldn't count as new. Mirrors getEnrollmentTrackIdsByProgram's "any child counts" merge for parents with multiple children in the same program. */
function getEnrollmentJoinDatesByProgram(enrollments: Array<Pick<EnrollmentTrackSelection, "program_id" | "created_at">>) {
  const joinDateByProgramId = new Map<string, string>();
  for (const enrollment of enrollments) {
    const existing = joinDateByProgramId.get(enrollment.program_id);
    if (!existing || Date.parse(enrollment.created_at) < Date.parse(existing)) {
      joinDateByProgramId.set(enrollment.program_id, enrollment.created_at);
    }
  }
  return joinDateByProgramId;
}

function isAnnouncementVisibleForEnrollment(
  announcement: Pick<AnnouncementWithContext, "target_program_track_ids" | "created_at">,
  enrolledTrackIds: Set<string> | undefined,
  joinedAt?: string,
) {
  if (joinedAt && Date.parse(announcement.created_at) < Date.parse(joinedAt)) {
    return false;
  }
  const targetTrackIds = getAnnouncementTargetTrackIds(announcement);
  if (targetTrackIds.length === 0) {
    return true;
  }
  if (!enrolledTrackIds || enrolledTrackIds.size === 0) {
    return true;
  }
  return targetTrackIds.some((trackId) => enrolledTrackIds.has(trackId));
}

function ConfirmStudentRescindModal({
  request,
  busy,
  mode = "rescind",
  onCancel,
  onConfirm,
}: {
  request: RequestWithContext;
  busy: boolean;
  mode?: "rescind" | "cancel_registration";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onCancel);
  useHideMobileChromeWhileMounted();
  const isCancelRegistration = mode === "cancel_registration";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-xl font-semibold">{isCancelRegistration ? "Cancel registration?" : "Rescind application?"}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          {isCancelRegistration
            ? `This will cancel the approved registration for ${request.student?.full_name ?? "this student"} in ${request.program?.title ?? "this class"}.`
            : `This will cancel the pending application for ${request.student?.full_name ?? "this student"} in ${request.program?.title ?? "this class"}.`}
        </p>
        <div className="mt-6 grid gap-2">
          <button type="button" onClick={onConfirm} disabled={busy} className="min-h-11 rounded-[8px] bg-[#26323A] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? (isCancelRegistration ? "Cancelling..." : "Rescinding...") : isCancelRegistration ? "Cancel registration" : "Rescind application"}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-[8px] bg-[#EEF3F5] px-4 text-sm font-semibold text-[#52616A] disabled:opacity-60">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ClearAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="px-1.5 py-1 text-xs font-semibold text-[#6B747B] underline-offset-2 transition-colors hover:text-[#26323A] hover:underline">
      Clear all
    </button>
  );
}

function IconActionButton({
  label,
  tone,
  onClick,
  href,
  disabled = false,
}: {
  label: string;
  tone: "success" | "danger" | "info";
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const className =
    tone === "success"
      ? "border-[#2E6E52] bg-[#2E6E52] text-white shadow-[0_6px_14px_rgba(46,110,82,0.18)] hover:bg-[#265D45]"
      : tone === "danger"
        ? "border-[#C83F31] bg-[#C83F31] text-white shadow-[0_6px_14px_rgba(200,63,49,0.18)] hover:bg-[#B6372C]"
        : "border-[#BFDDEC] bg-[#E7F3F8] text-[#257B9C] hover:bg-[#DDEEF6]";
  if (href) {
    return (
      <Link href={href} className={cn("inline-flex min-h-9 items-center justify-center rounded-[5px] border px-3 text-xs font-semibold transition-colors", className)}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("inline-flex min-h-9 items-center justify-center rounded-[5px] border px-3 text-xs font-semibold transition-colors disabled:opacity-60", className)}>
      {label}
    </button>
  );
}

function studentRequestStatusLabel(request: RequestWithContext) {
  if (request.status === "cancelled" && request.reviewed_by) {
    return "Removed";
  }

  const status = getApplicationStatus(request);
  const paymentStatus = getApplicationPaymentStatus(request, request.program, null);
  return getApplicationRowStatusLabel(status, paymentStatus);
}

function StudentRequestCard({
  request,
  viewHref,
  onDismiss,
  onViewApplication,
  viewClassHref,
  unread = false,
}: {
  request: RequestWithContext;
  viewHref?: string;
  onDismiss?: () => void;
  onViewApplication?: () => void;
  viewClassHref?: string;
  unread?: boolean;
}) {
  const statusLabel = studentRequestStatusLabel(request);
  const statusTime = request.reviewed_at ?? request.requested_at;
  const childName = request.parent_profile_id ? request.student?.full_name?.trim() : null;
  const clickable = Boolean(onViewApplication);
  const needsConfirmation = Boolean(onViewApplication && request.status === "approved" && !request.admission_completed_at);
  const reviewedMessage = request.review_note ?? request.decision_note;
  const message =
    request.status === "pending"
      ? null
      : reviewedMessage ??
        (needsConfirmation
          ? "Your teacher approved this request. Complete registration to activate the class."
          : request.status === "approved"
            ? request.payment_bypassed
              ? "You have been admitted."
              : "Your request was approved."
            : request.status === "waitlisted"
              ? "You have been waitlisted and will be notified once a spot is available."
              : request.status === "cancelled"
                ? `You were removed from ${request.program?.title ?? "this class"}.`
                : null);
  return (
    <article
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onViewApplication}
      onKeyDown={(event) => {
        if (!onViewApplication || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }
        event.preventDefault();
        onViewApplication();
      }}
      className={cn(
        "rounded-xl border border-[#E1E8EC] bg-white p-3",
        clickable && "cursor-pointer transition hover:border-[#BBD5DE] hover:bg-[#FBFDFE] focus:outline-none focus:ring-2 focus:ring-[#2F8FB3] focus:ring-offset-2",
        (needsConfirmation || request.payment_bypassed) && "border-[#CFE8D6] bg-[#FBFEFC]",
        request.status === "waitlisted" && "border-[#FFE3A3] bg-[#FFFDF7]",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-4 h-2.5 w-2.5 shrink-0 rounded-full", unread ? "bg-[#2F8FB3]" : "bg-transparent")} aria-hidden />
        <DefaultProfileIcon />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-5 text-[#26323A]">{request.program?.title ?? "Class request"}</h3>
              <p className="mt-0.5 text-xs text-[#6B747B]">
                {childName ? `${childName} • ` : ""}
                {statusLabel} • {timeAgo(statusTime)}
              </p>
            </div>
            {onDismiss ? (
              <button type="button" onClick={(event) => { event.stopPropagation(); onDismiss(); }} className="-mr-1 -mt-1 p-1 text-[#C83F31] transition-colors hover:text-[#9D2E23]" aria-label="Clear notification">
                <XIcon />
              </button>
            ) : null}
          </div>
          {message ? <p className="mt-2 text-sm leading-5 text-[#26323A]">{message}</p> : null}
          {viewClassHref ? (
            <Link
              href={viewClassHref}
              onClick={(event) => event.stopPropagation()}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-[6px] bg-[#17624F] px-4 text-sm font-semibold !text-white transition-colors hover:bg-[#124F40]"
            >
              View Class
            </Link>
          ) : null}
        </div>
        {viewHref ? <IconActionButton label="View" tone="info" href={viewHref} /> : null}
      </div>
    </article>
  );
}

function StudentWithdrawalStatusCard({ request, onDismiss, onOpen, unread = false }: { request: WithdrawalRequestWithContext; onDismiss?: () => void; onOpen?: () => void; unread?: boolean }) {
  const statusTime = request.reviewed_at ?? request.requested_at;
  const studentName = request.student?.full_name?.trim();
  const statusLabel = request.status === "approved" ? "Withdrawal approved" : request.status === "rejected" ? "Withdrawal rejected" : "Withdrawal pending";
  const message =
    request.decision_note ??
    (request.status === "approved"
      ? "The student was removed from this class immediately."
      : request.status === "rejected"
        ? "The student remains enrolled in this class."
        : "The teacher will review this withdrawal request.");

  return (
    <article className={cn("rounded-xl border border-[#E1E8EC] bg-white p-3", request.status === "approved" && "border-[#CFE8D6] bg-[#FBFEFC]", request.status === "rejected" && "border-[#F2D5CF] bg-[#FFFDFC]")}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-4 h-2.5 w-2.5 shrink-0 rounded-full", unread ? "bg-[#2F8FB3]" : "bg-transparent")} aria-hidden />
        <DefaultProfileIcon />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-5 text-[#26323A]">{request.program?.title ?? "Withdrawal request"}</h3>
              <p className="mt-0.5 text-xs text-[#6B747B]">
                {studentName ? `${studentName} • ` : ""}
                {statusLabel} • {timeAgo(statusTime)}
              </p>
            </div>
            {onDismiss ? (
              <button type="button" onClick={onDismiss} className="-mr-1 -mt-1 p-1 text-[#C83F31] transition-colors hover:text-[#9D2E23]" aria-label="Clear notification">
                <XIcon />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-5 text-[#26323A]">{message}</p>
          {request.reason ? <p className="mt-2 text-xs leading-5 text-[#6B747B]">Reason: {request.reason}</p> : null}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="mt-3 inline-flex min-h-9 items-center justify-center rounded-[6px] border border-[#CBD5D9] bg-white px-4 text-xs font-semibold text-[#26323A] transition-colors hover:bg-[#F5F8F9]"
            >
              View
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function StudentRemovalDetailsDrawer({ request, onClose }: { request: RequestWithContext; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useHideMobileChromeWhileMounted();
  const studentName = request.student?.full_name?.trim() || "Student";
  const actorName = request.approver?.full_name?.trim() || request.approver?.email?.trim() || "Program staff";
  const removedAt = request.reviewed_at ?? request.requested_at;
  const message = request.review_note?.trim() || request.decision_note?.trim() || `${studentName} was removed from ${request.program?.title ?? "this class"}.`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="max-h-[86vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 text-[#26323A] shadow-[0_-18px_60px_rgba(38,50,58,0.22)] outline-none">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#DDE5E9]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Class Removal</p>
            <h2 className="mt-1 text-xl font-semibold">{studentName} was removed</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F6F7] text-[#26323A]" aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div className="mt-5 space-y-4 rounded-[18px] bg-[#F7FAFB] p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Class</p>
            <p className="mt-1 font-semibold">{request.program?.title ?? "Class"}</p>
          </div>
          {request.track ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Track</p>
              <p className="mt-1 font-semibold">{request.track.name}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Removed By</p>
              <p className="mt-1 font-semibold">{actorName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Removed On</p>
              <p className="mt-1 font-semibold">{formatFinanceDate(removedAt)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">What Changed</p>
            <p className="mt-1 text-sm leading-6">
              This class will no longer appear in {request.parent_profile_id ? `${studentName}'s` : "your"} schedule, attendance, or active classes list.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StudentWithdrawalDetailsDrawer({ request, onClose }: { request: WithdrawalRequestWithContext; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useHideMobileChromeWhileMounted();
  const statusLabel = request.status === "approved" ? "Withdrawal approved" : request.status === "rejected" ? "Withdrawal rejected" : "Withdrawal pending";
  const studentName = request.student?.full_name?.trim() || "Student";
  const message =
    request.decision_note ??
    (request.status === "approved"
      ? `${studentName} was removed from ${request.program?.title ?? "this class"}.`
      : request.status === "rejected"
        ? `${studentName} remains enrolled in ${request.program?.title ?? "this class"}.`
        : "The teacher will review this withdrawal request.");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="max-h-[86vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 text-[#26323A] shadow-[0_-18px_60px_rgba(38,50,58,0.22)] outline-none">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#DDE5E9]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Application Update</p>
            <h2 className="mt-1 text-xl font-semibold">{statusLabel}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F6F7] text-[#26323A]" aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div className="mt-5 space-y-3 rounded-[18px] bg-[#F7FAFB] p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Class</p>
            <p className="mt-1 font-semibold">{request.program?.title ?? "Class"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Student</p>
            <p className="mt-1 font-semibold">{studentName}</p>
          </div>
          {request.reason ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Request Reason</p>
              <p className="mt-1 text-sm leading-6">{request.reason}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Details</p>
            <p className="mt-1 text-sm leading-6">{message}</p>
          </div>
          <p className="text-xs font-semibold text-[#7B858C]">{formatFinanceDate(request.reviewed_at ?? request.requested_at)}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProtectedPaidApplicationClearModal({
  count,
  mode,
  onCancel,
}: {
  count: number;
  mode: "single" | "all";
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF3D6] text-[#9A6400]">
          <span className="text-2xl font-semibold">!</span>
        </div>
        <h2 className="mt-4 text-xl font-semibold">Action required</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          {mode === "all" && count > 1
            ? `${count} items still require an action.`
            : "This item still requires an action."} Complete or cancel the action before clearing it from the inbox.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-[6px] bg-[#17624F] px-4 text-sm font-semibold text-white">
            Keep message
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentResultModal({ status, slug, onClose }: { status: "success" | "cancelled"; slug: string; onClose: () => void }) {
  const isSuccess = status === "success";
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <div
          className={cn(
            "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
            isSuccess ? "bg-[#EAF8EF] text-[#2E6E52]" : "bg-[#FCE8E4] text-[#C83F31]",
          )}
        >
          {isSuccess ? <CheckIcon /> : <XIcon />}
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[#26323A]">{isSuccess ? "Registration complete" : "Payment cancelled"}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          {isSuccess ? "Your payment went through. Your class should now appear in Classes." : "No payment was completed. You can return here when you are ready."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {isSuccess ? (
            <Link href={`/m/${slug}/portal/classes`} className="inline-flex min-h-11 items-center justify-center rounded-[6px] bg-[#2E6E52] px-4 text-sm font-semibold !text-white no-underline">
              Go to Classes
            </Link>
          ) : null}
          <button type="button" onClick={onClose} className="min-h-11 rounded-[6px] px-4 text-sm font-semibold text-[#6B747B]">
            {isSuccess ? "Stay in inbox" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentConfirmingModal() {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#E7F3F8] border-t-[#2F8FB3]" />
        <h2 className="mt-4 text-xl font-semibold text-[#26323A]">Finishing registration</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">Payment succeeded. We are adding the class to your account.</p>
      </div>
    </div>
  );
}

function StudentInboxThreadList({
  threads,
  emptyText,
}: {
  threads: Array<{ id: string; title: string; subtitle: string; meta: string; unreadCount: number; onClick: () => void }>;
  emptyText: string;
}) {
  if (!threads.length) {
    return (
      <div className="rounded-[18px] bg-[#F7FAFB] px-4 py-6 text-center text-sm font-medium leading-6 text-[#6B747B]">
        {emptyText}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_28px_rgba(38,50,58,0.07)] ring-1 ring-[#E4EAEE]">
      <div className="divide-y divide-[#EEF2F4]">
        {threads.map((thread) => {
          const unread = thread.unreadCount > 0;
          return (
            <button key={thread.id} type="button" onClick={thread.onClick} className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-[#F7FAFB]">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", unread ? "bg-[#2F8FB3]" : "bg-transparent")} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[15px] leading-5", unread ? "font-semibold text-[#26323A]" : "font-medium text-[#52616A]")}>{thread.title}</span>
                <span className="mt-1 block truncate text-sm text-[#6B747B]">{thread.subtitle}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-[#8A949B]">{thread.meta}</span>
                {unread ? <span className="mt-1 inline-flex rounded-full bg-[#E7F3F8] px-2 py-0.5 text-xs font-semibold text-[#2F8FB3]">{thread.unreadCount}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StudentInboxThreadView({
  thread,
  announcements,
  notes,
  hasOlderAnnouncements = false,
  loadingOlderAnnouncements = false,
  onLoadOlderAnnouncements,
  hasOlderNotes = false,
  loadingOlderNotes = false,
  onLoadOlderNotes,
  onBack,
}: {
  thread: StudentInboxThread;
  announcements: AnnouncementWithContext[];
  notes: StudentNoteWithContext[];
  hasOlderAnnouncements?: boolean;
  loadingOlderAnnouncements?: boolean;
  onLoadOlderAnnouncements?: () => void;
  hasOlderNotes?: boolean;
  loadingOlderNotes?: boolean;
  onLoadOlderNotes?: () => void;
  onBack: () => void;
}) {
  const threadAnnouncements = thread.kind === "announcements"
    ? announcements
        .filter((announcement) => announcement.program_id === thread.programId)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    : [];
  const threadNotes = thread.kind === "notes"
    ? notes
        .filter((note) => note.program_id === thread.programId && note.student_profile_id === thread.studentId)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    : [];
  const title = thread.kind === "announcements"
    ? threadAnnouncements[0]?.program?.title ?? thread.programTitle ?? "Announcements"
    : threadNotes[0]?.program?.title ?? thread.programTitle ?? "Notes";
  const subtitle = thread.kind === "notes" ? `Student notes for ${threadNotes[0]?.student?.full_name ?? thread.studentName ?? "student"}` : "Class announcements";

  return (
    <section className="overflow-hidden rounded-[24px] bg-[#F7FAFB] shadow-[0_12px_28px_rgba(38,50,58,0.07)] ring-1 ring-[#E4EAEE]">
      <div className="flex items-center gap-3 border-b border-[#E1E8EC] bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF3F5] text-[#26323A] transition active:scale-90 active:bg-[#E1E8EC]" aria-label="Back to inbox">
          <ChevronLeftIcon />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-[#26323A]">{title}</h2>
          <p className="truncate text-sm text-[#6B747B]">{subtitle}</p>
        </div>
      </div>
      <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
        {thread.kind === "announcements" ? (
          threadAnnouncements.length ? (
            <>
              {threadAnnouncements.map((announcement) => <StudentAnnouncementCard key={announcement.id} announcement={announcement} />)}
              {hasOlderAnnouncements ? (
                <button
                  type="button"
                  onClick={onLoadOlderAnnouncements}
                  disabled={loadingOlderAnnouncements}
                  className="mx-auto flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#2F8FB3] shadow-[0_6px_18px_rgba(38,50,58,0.06)] ring-1 ring-[#DDE7EC] transition-colors hover:bg-[#F5FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingOlderAnnouncements ? "Loading older..." : "Load older"}
                </button>
              ) : null}
            </>
          ) : (
            <MiniEmpty text="No announcements in this thread." />
          )
        ) : threadNotes.length ? (
          <>
            {threadNotes.map((note) => <StudentNoteBubble key={note.id} note={note} viewer="recipient" />)}
            {hasOlderNotes ? (
              <button
                type="button"
                onClick={onLoadOlderNotes}
                disabled={loadingOlderNotes}
                className="mx-auto flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#2F8FB3] shadow-[0_6px_18px_rgba(38,50,58,0.06)] ring-1 ring-[#DDE7EC] transition-colors hover:bg-[#F5FAFC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingOlderNotes ? "Loading older..." : "Load older"}
              </button>
            ) : null}
          </>
        ) : (
          <MiniEmpty text="No notes in this thread." />
        )}
      </div>
    </section>
  );
}

export function InboxAnnouncementsData({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [announcements, setAnnouncements] = useState<AnnouncementWithContext[]>([]);
  const [enrolledProgramsForInbox, setEnrolledProgramsForInbox] = useState<Program[]>([]);
  const [noteStudentsByProgramId, setNoteStudentsByProgramId] = useState<Record<string, StudentDisplay[]>>({});
  const [notes, setNotes] = useState<StudentNoteWithContext[]>([]);
  const [requests, setRequests] = useState<RequestWithContext[]>([]);
  const [studentWithdrawals, setStudentWithdrawals] = useState<WithdrawalRequestWithContext[]>([]);
  const initialInboxTab = searchParams.get("tab");
  const [tab, setTab] = useState<"announcements" | "notes" | "requests">(initialInboxTab === "notes" || initialInboxTab === "requests" ? initialInboxTab : "announcements");
  const [selectedThread, setSelectedThread] = useState<StudentInboxThread | null>(null);
  const [selectedNoteProgramId, setSelectedNoteProgramId] = useState<string | null>(null);
  const [inboxAccountType, setInboxAccountType] = useState<string | null>(null);
  const [announcementTrackIdsByProgramId, setAnnouncementTrackIdsByProgramId] = useState<Record<string, string[]>>({});
  const [announcementJoinDateByProgramId, setAnnouncementJoinDateByProgramId] = useState<Record<string, string>>({});
  const [announcementThreadExhausted, setAnnouncementThreadExhausted] = useState<Record<string, boolean>>({});
  const [announcementThreadLoadingOlder, setAnnouncementThreadLoadingOlder] = useState<Record<string, boolean>>({});
  const [noteThreadExhausted, setNoteThreadExhausted] = useState<Record<string, boolean>>({});
  const [noteThreadLoadingOlder, setNoteThreadLoadingOlder] = useState<Record<string, boolean>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [seenRequestIds, setSeenRequestIds] = useState<Set<string>>(new Set());
  const [paymentNotice, setPaymentNotice] = useState<"success" | "cancelled" | null>(null);
  const [protectedClear, setProtectedClear] = useState<{ mode: "single" | "all"; requestIds: string[]; count: number } | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [applicationDetailsRow, setApplicationDetailsRow] = useState<ApplicantApplicationRow | null>(null);
  const [removalDetailsRow, setRemovalDetailsRow] = useState<RequestWithContext | null>(null);
  const [withdrawalDetailsRow, setWithdrawalDetailsRow] = useState<WithdrawalRequestWithContext | null>(null);
  const [rescindTarget, setRescindTarget] = useState<ApplicantApplicationRow | null>(null);
  const [rescindBusy, setRescindBusy] = useState(false);
  const [cancelRegistrationTarget, setCancelRegistrationTarget] = useState<ApplicantApplicationRow | null>(null);
  const [cancelRegistrationBusy, setCancelRegistrationBusy] = useState(false);
  const [paymentConfirming, setPaymentConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inboxDeepLinkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const payment = searchParams.get("payment");
    const checkoutSessionId = searchParams.get("session_id");
    if (payment === "success" || payment === "cancelled") {
      router.replace(`/m/${slug}/portal/announcements`);
      if (payment === "success") {
        void confirmCheckoutPayment(checkoutSessionId);
      } else {
        setPaymentNotice("cancelled");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams, slug]);

  async function confirmCheckoutPayment(checkoutSessionId: string | null) {
    if (!checkoutSessionId) {
      setError("Payment succeeded, but Stripe did not return a checkout session.");
      return;
    }

    setPaymentConfirming(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setPaymentConfirming(false);
      setError("Payment succeeded. Please sign in again to finish registration.");
      return;
    }

    const response = await fetch("/api/stripe/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ checkoutSessionId }),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    setPaymentConfirming(false);

    if (!response.ok || !payload.ok) {
      setError(payload.error ?? "Payment succeeded, but registration could not be completed.");
      return;
    }

    setPaymentNotice("success");
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    await loadInbox();
  }

  async function loadInbox() {
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setCurrentUserId(null);
      setSeenRequestIds(new Set());
      setAnnouncements([]);
      setEnrolledProgramsForInbox([]);
      setNoteStudentsByProgramId({});
      setInboxAccountType(null);
      setAnnouncementTrackIdsByProgramId({});
      setAnnouncementThreadExhausted({});
      setAnnouncementThreadLoadingOlder({});
      setNoteThreadExhausted({});
      setNoteThreadLoadingOlder({});
      setNotes([]);
      setRequests([]);
      setStudentWithdrawals([]);
      setLoading(false);
      return;
    }

    setCurrentUserId(userId);
    const { seen: initialSeenRequestIds } = await fetchNotificationState(userId);
    setSeenRequestIds(initialSeenRequestIds);

    const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
    if (!mosque) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type").eq("id", userId).maybeSingle();
    setInboxAccountType(profile?.account_type ?? null);
    const isParent = profile?.account_type === "parent";
    const { children } = isParent ? await fetchParentChildren(supabase, slug, userId, mosque.id) : { children: [] as StudentDisplay[] };
    const targetStudentIds = isParent ? children.map((child) => child.id) : [userId];

    const [{ data: enrollments }, { data: requestRows, error: requestError }, { data: withdrawalRows, error: withdrawalError }] = await Promise.all([
      targetStudentIds.length
        ? supabase.from("enrollments").select("id, program_id, student_profile_id, program_track_id, created_at, status").in("student_profile_id", targetStudentIds)
        : Promise.resolve({ data: [] as EnrollmentTrackSelection[] }),
      isParent
        ? supabase
            .from("enrollment_requests")
            .select("*")
            .eq("mosque_id", mosque.id)
            .eq("parent_profile_id", userId)
            .is("student_dismissed_at", null)
            .order("requested_at", { ascending: false })
        : supabase
            .from("enrollment_requests")
            .select("*")
            .eq("mosque_id", mosque.id)
            .eq("student_profile_id", userId)
            .is("student_dismissed_at", null)
            .order("requested_at", { ascending: false }),
      isParent
        ? supabase
            .from("withdrawal_requests")
            .select("*")
            .eq("mosque_id", mosque.id)
            .or(`parent_profile_id.eq.${userId},requested_by.eq.${userId}`)
            .is("student_dismissed_at", null)
            .order("requested_at", { ascending: false })
        : supabase
            .from("withdrawal_requests")
            .select("*")
            .eq("mosque_id", mosque.id)
            .eq("student_profile_id", userId)
            .is("student_dismissed_at", null)
            .order("requested_at", { ascending: false }),
    ]);

    if (requestError || withdrawalError) {
      setLoading(false);
      setError(requestError?.message ?? withdrawalError?.message ?? "Could not load inbox.");
      return;
    }

    const enrollmentRows = ((enrollments ?? []) as EnrollmentTrackSelection[]).filter((enrollment) => isCurrentEnrollmentStatus(enrollment.status));
    const enrollmentIds = enrollmentRows.map((enrollment) => enrollment.id);
    const { data: enrollmentTrackRows } = enrollmentIds.length
      ? await supabase.from("enrollment_tracks").select("enrollment_id, program_track_id").in("enrollment_id", enrollmentIds)
      : { data: [] as Array<{ enrollment_id: string; program_track_id: string }> };
    const enrolledTrackIdsByProgramId = getEnrollmentTrackIdsByProgram(enrollmentRows, enrollmentTrackRows ?? []);
    setAnnouncementTrackIdsByProgramId(
      Object.fromEntries(Array.from(enrolledTrackIdsByProgramId.entries()).map(([programId, trackIds]) => [programId, Array.from(trackIds)])),
    );
    const enrolledJoinDatesByProgramId = getEnrollmentJoinDatesByProgram(enrollmentRows);
    setAnnouncementJoinDateByProgramId(Object.fromEntries(enrolledJoinDatesByProgramId.entries()));

    const enrolledProgramIds = enrollmentRows.map((enrollment) => enrollment.program_id);
    const noteThreadKeys = Array.from(new Set(enrollmentRows.map((enrollment) => `${enrollment.program_id}:${enrollment.student_profile_id}`)));
    const noteQueries = await Promise.all(
      noteThreadKeys.map(async (key) => {
        const [programId, studentId] = key.split(":");
        const { data: rows, error: noteError } = await supabase
          .from("program_student_notes")
          .select("*")
          .eq("program_id", programId)
          .eq("student_profile_id", studentId)
          .order("created_at", { ascending: false })
          .limit(NOTE_THREAD_PAGE_SIZE);
        return { key, rows: rows ?? [], error: noteError };
      }),
    );
    const noteError = noteQueries.find((result) => result.error)?.error;
    if (noteError) {
      setLoading(false);
      setError(friendlyErrorMessage(noteError, "Could not load your notes."));
      return;
    }
    setNoteThreadExhausted(Object.fromEntries(noteQueries.map((result) => [result.key, result.rows.length < NOTE_THREAD_PAGE_SIZE])));
    setNoteThreadLoadingOlder({});
    const noteRows = noteQueries.flatMap((result) => result.rows);
    const requestProgramIds = (requestRows ?? []).map((request) => request.program_id);
    const withdrawalProgramIds = (withdrawalRows ?? []).map((request) => request.program_id);
    const noteProgramIds = noteRows.map((note) => note.program_id);
    const knownProgramIds = Array.from(new Set([...enrolledProgramIds, ...requestProgramIds, ...withdrawalProgramIds, ...noteProgramIds]));
    const requestStudentIds = Array.from(new Set((requestRows ?? []).map((request) => request.student_profile_id)));
    const withdrawalStudentIds = Array.from(new Set((withdrawalRows ?? []).map((request) => request.student_profile_id)));
    const noteStudentIds = Array.from(new Set(noteRows.map((note) => note.student_profile_id)));
    const requestIds = (requestRows ?? []).map((request) => request.id);
    const requestParentIds = Array.from(new Set((requestRows ?? []).map((request) => request.parent_profile_id).filter(Boolean))) as string[];
    const requestReviewerIds = Array.from(new Set((requestRows ?? []).map((request) => request.reviewed_by).filter(Boolean))) as string[];
    const [{ data: programs }, { data: requestStudents }, { data: noteStudents }, { data: requestParents }, { data: requestReviewers }, { data: requestTrackLinkRows }, { data: programTrackRows }, { data: requestSubscriptions }] = await Promise.all([
      knownProgramIds.length ? supabase.from("programs").select("*").in("id", knownProgramIds) : Promise.resolve({ data: [] as Program[] }),
      [...requestStudentIds, ...withdrawalStudentIds].length
        ? supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type").in("id", Array.from(new Set([...requestStudentIds, ...withdrawalStudentIds])))
        : Promise.resolve({ data: [] as StudentDisplay[] }),
      noteStudentIds.length
        ? supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type").in("id", noteStudentIds)
        : Promise.resolve({ data: [] as StudentDisplay[] }),
      requestParentIds.length ? supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url").in("id", requestParentIds) : Promise.resolve({ data: [] as ParentDisplay[] }),
      requestReviewerIds.length ? supabase.from("profiles").select("*").in("id", requestReviewerIds) : Promise.resolve({ data: [] as Profile[] }),
      requestIds.length ? supabase.from("enrollment_request_tracks").select("enrollment_request_id, program_track_id").in("enrollment_request_id", requestIds) : Promise.resolve({ data: [] as Array<{ enrollment_request_id: string; program_track_id: string }> }),
      knownProgramIds.length ? supabase.from("program_tracks").select("*").in("program_id", knownProgramIds).eq("is_active", true).order("sort_order", { ascending: true }) : Promise.resolve({ data: [] as ProgramTrack[] }),
      requestStudentIds.length ? supabase.from("program_subscriptions").select("*").in("program_id", knownProgramIds).in("student_profile_id", requestStudentIds) : Promise.resolve({ data: [] as ProgramSubscription[] }),
    ]);
    const requestTrackIdsByRequestId = new Map<string, string[]>();
    for (const linkRow of requestTrackLinkRows ?? []) {
      requestTrackIdsByRequestId.set(linkRow.enrollment_request_id, [...(requestTrackIdsByRequestId.get(linkRow.enrollment_request_id) ?? []), linkRow.program_track_id]);
    }
    const childProfiles = isParent ? [...children, ...((requestStudents ?? []) as StudentDisplay[])] : ((requestStudents ?? []) as StudentDisplay[]);
    const enrolledProgramSet = new Set(enrolledProgramIds);
    setEnrolledProgramsForInbox((programs ?? []).filter((program) => enrolledProgramSet.has(program.id)));
    const studentProfilesForNotes = isParent ? childProfiles : ([...(profile ? [{ id: userId, account_type: profile.account_type } as StudentDisplay] : []), ...((noteStudents ?? []) as StudentDisplay[])] as StudentDisplay[]);
    const nextNoteStudentsByProgramId: Record<string, StudentDisplay[]> = {};
    for (const enrollment of enrollmentRows) {
      const student = studentProfilesForNotes.find((item) => item.id === enrollment.student_profile_id);
      if (!student) {
        continue;
      }
      nextNoteStudentsByProgramId[enrollment.program_id] = [
        ...(nextNoteStudentsByProgramId[enrollment.program_id] ?? []).filter((item) => item.id !== student.id),
        student,
      ];
    }
    setNoteStudentsByProgramId(nextNoteStudentsByProgramId);

    setRequests(
      (requestRows ?? []).map((request) => ({
        ...request,
        program: (programs ?? []).find((program) => program.id === request.program_id) ?? null,
        student: childProfiles.find((student) => student.id === request.student_profile_id) ?? null,
        parent: request.parent_profile_id ? ((requestParents ?? []).find((parent) => parent.id === request.parent_profile_id) as ParentDisplay | undefined) ?? null : null,
        approver: request.reviewed_by ? ((requestReviewers ?? []).find((reviewer) => reviewer.id === request.reviewed_by) as Profile | undefined) ?? null : null,
        track: resolveRequestTrack(request, requestTrackIdsByRequestId, programTrackRows ?? []),
        subscription: (requestSubscriptions ?? []).find((subscription) => subscription.program_id === request.program_id && subscription.student_profile_id === request.student_profile_id) ?? null,
      })),
    );
    setStudentWithdrawals(
      (withdrawalRows ?? []).map((request) => ({
        ...request,
        program: (programs ?? []).find((program) => program.id === request.program_id) ?? null,
        student: childProfiles.find((student) => student.id === request.student_profile_id) ?? null,
      })),
    );

    const noteAuthorIds = Array.from(new Set(noteRows.map((note) => note.author_profile_id)));
    const noteRecipientIds = Array.from(new Set(noteRows.map((note) => note.recipient_profile_id)));
    const [{ data: noteAuthors }, { data: noteRecipients }] = await Promise.all([
      noteAuthorIds.length ? supabase.from("profiles").select("*").in("id", noteAuthorIds) : Promise.resolve({ data: [] as Profile[] }),
      noteRecipientIds.length ? supabase.from("profiles").select("*").in("id", noteRecipientIds) : Promise.resolve({ data: [] as Profile[] }),
    ]);
    const studentProfiles = [...childProfiles, ...((noteStudents ?? []) as StudentDisplay[])];
    setNotes(
      noteRows.map((note) => ({
        ...note,
        program: (programs ?? []).find((program) => program.id === note.program_id) ?? null,
        student: studentProfiles.find((student) => student.id === note.student_profile_id) ?? null,
        recipient: (noteRecipients ?? []).find((recipient) => recipient.id === note.recipient_profile_id) ?? null,
        author: (noteAuthors ?? []).find((author) => author.id === note.author_profile_id) ?? null,
      })),
    );

    if (enrolledProgramIds.length === 0) {
      setAnnouncements([]);
      setEnrolledProgramsForInbox([]);
      setNoteStudentsByProgramId({});
      setAnnouncementThreadExhausted({});
      setAnnouncementThreadLoadingOlder({});
      setNoteThreadExhausted({});
      setNoteThreadLoadingOlder({});
      setLoading(false);
      return;
    }

    const announcementQueries = await Promise.all(
      Array.from(new Set(enrolledProgramIds)).map(async (programId) => {
        const { data: rows, error: queryError } = await supabase
          .from("program_announcements")
          .select("*")
          .eq("program_id", programId)
          .order("created_at", { ascending: false })
          .limit(ANNOUNCEMENT_THREAD_PAGE_SIZE);
        return { programId, rows: rows ?? [], error: queryError };
      }),
    );
    const queryError = announcementQueries.find((result) => result.error)?.error;
    if (queryError) {
      setLoading(false);
      setError(friendlyErrorMessage(queryError, "Could not load your announcements."));
      return;
    }
    setAnnouncementThreadExhausted(
      Object.fromEntries(announcementQueries.map((result) => [result.programId, result.rows.length < ANNOUNCEMENT_THREAD_PAGE_SIZE])),
    );
    setAnnouncementThreadLoadingOlder({});

    const announcementRows = announcementQueries.flatMap((result) => result.rows);
    const announcementIds = announcementRows.map((announcement) => announcement.id);
    const authorIds = Array.from(new Set(announcementRows.map((announcement) => announcement.author_profile_id).filter(Boolean)));
    const [{ data: authors }, { data: receipts }] = await Promise.all([
      authorIds.length ? supabase.from("profiles").select("*").in("id", authorIds) : Promise.resolve({ data: [] as Profile[] }),
      announcementIds.length
        ? supabase.from("program_announcement_receipts").select("*").eq("profile_id", userId).in("announcement_id", announcementIds)
        : Promise.resolve({ data: [] as AnnouncementReceipt[] }),
    ]);

    const visibleAnnouncements = announcementRows
      .map((announcement) => ({
        ...announcement,
        program: (programs ?? []).find((program) => program.id === announcement.program_id) ?? null,
        author: (authors ?? []).find((author) => author.id === announcement.author_profile_id) ?? null,
        receipt: (receipts ?? []).find((receipt) => receipt.announcement_id === announcement.id) ?? null,
      }))
      .filter((announcement) => isAnnouncementVisibleForEnrollment(announcement, enrolledTrackIdsByProgramId.get(announcement.program_id), enrolledJoinDatesByProgramId.get(announcement.program_id)))
      .filter((announcement) => !announcement.receipt?.dismissed_at);

    setAnnouncements(visibleAnnouncements);
    setLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadInbox();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function dismissRequests(requestIds: string[]) {
    if (!requestIds.length) {
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error: dismissError } = await supabase
      .from("enrollment_requests")
      .update({ student_dismissed_at: new Date().toISOString() })
      .in("id", requestIds);
    if (dismissError) {
      setError(dismissError.message);
      return;
    }
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    await loadInbox();
  }

  async function dismissWithdrawalRequests(requestIds: string[]) {
    if (!requestIds.length) {
      return;
    }
    const { error: dismissError } = await createSupabaseBrowserClient()
      .from("withdrawal_requests")
      .update({ student_dismissed_at: new Date().toISOString() })
      .in("id", requestIds);
    if (dismissError) {
      setError(dismissError.message);
      return;
    }
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    await loadInbox();
  }

  async function dismissRequest(requestId: string) {
    const request = requests.find((item) => item.id === requestId);
    if (request && studentRequestRequiresAction(request)) {
      setProtectedClear({ mode: "single", requestIds: [requestId], count: 1 });
      return;
    }
    await dismissRequests([requestId]);
  }

  async function confirmCancelRegistrationFromApplication() {
    if (!cancelRegistrationTarget?.program) {
      return;
    }
    setCancelRegistrationBusy(true);
    const result = await callApplicationAction(cancelRegistrationTarget.program.id, cancelRegistrationTarget.request.id, "cancel-registration", {});
    setCancelRegistrationBusy(false);
    if (!result.ok) {
      setToast({ tone: "error", message: result.error });
      return;
    }
    setToast({ tone: "success", message: "Registration cancelled." });
    setCancelRegistrationTarget(null);
    setApplicationDetailsRow(null);
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    await loadInbox();
  }

  async function confirmRescindApplicationFromInbox() {
    if (!rescindTarget) {
      return;
    }
    setRescindBusy(true);
    const { error: rescindError } = await createSupabaseBrowserClient()
      .from("enrollment_requests")
      .update({ status: "cancelled", student_dismissed_at: new Date().toISOString() })
      .eq("id", rescindTarget.request.id);
    if (rescindError) {
      setRescindBusy(false);
      setToast({ tone: "error", message: rescindError.message });
      return;
    }
    setRescindTarget(null);
    setApplicationDetailsRow(null);
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    await loadInbox();
    setRescindBusy(false);
    setToast({ tone: "success", message: "Application rescinded." });
  }

  async function clearAllReturnedRequests() {
    const actionRequiredRequests = returnedRequests.filter((request) => studentRequestRequiresAction(request));
    const returnedRequestIds = returnedRequests.filter((request) => !studentRequestRequiresAction(request)).map((request) => request.id);
    const returnedWithdrawalIds = returnedWithdrawals.map((request) => request.id);
    if (!returnedRequestIds.length && !returnedWithdrawalIds.length) {
      if (actionRequiredRequests.length) {
        setProtectedClear({ mode: "all", requestIds: actionRequiredRequests.map((request) => request.id), count: actionRequiredRequests.length });
      }
      return;
    }

    await dismissRequests(returnedRequestIds);
    await dismissWithdrawalRequests(returnedWithdrawalIds);
    if (actionRequiredRequests.length) {
      setToast({ tone: "success", message: "Cleared completed items. Action-required items were kept." });
    }
  }

  const pendingRequests = requests.filter((request) => request.status === "pending");
  const returnedRequests = requests.filter((request) => request.status !== "pending");
  const pendingWithdrawals = studentWithdrawals.filter((request) => request.status === "pending");
  const returnedWithdrawals = studentWithdrawals.filter((request) => request.status !== "pending");
  const unseenRequestCount =
    requests.filter((request) => studentRequestShouldNotify(request) && (studentRequestRequiresAction(request) || !seenRequestIds.has(studentRequestNotificationKey(request)))).length +
    studentWithdrawals.filter((request) => !seenRequestIds.has(studentWithdrawalNotificationKey(request))).length;
  const announcementThreads = buildAnnouncementThreads(announcements, enrolledProgramsForInbox);
  const noteThreads = buildNoteThreads(notes);
  const noteThreadByKey = new Map(noteThreads.map((thread) => [`${thread.programId}:${thread.studentId}`, thread]));
  const isParentInbox = inboxAccountType === "parent";
  const noteProgramThreads = enrolledProgramsForInbox
    .filter((program) => (noteStudentsByProgramId[program.id] ?? []).length > 0)
    .map((program) => {
      const childThreads = noteStudentsByProgramId[program.id] ?? [];
      const unreadCount = childThreads.reduce((sum, student) => sum + (noteThreadByKey.get(`${program.id}:${student.id}`)?.unreadCount ?? 0), 0);
      const latest = childThreads
        .map((student) => noteThreadByKey.get(`${program.id}:${student.id}`)?.latest)
        .filter(Boolean)
        .sort((a, b) => Date.parse(b!.created_at) - Date.parse(a!.created_at))[0] ?? null;
      return { program, childThreads, unreadCount, latest };
    });
  const selectedNoteProgram = selectedNoteProgramId ? enrolledProgramsForInbox.find((program) => program.id === selectedNoteProgramId) ?? null : null;
  const selectedNoteStudents = selectedNoteProgramId ? noteStudentsByProgramId[selectedNoteProgramId] ?? [] : [];
  const unreadAnnouncementCount = announcements.filter((announcement) => !announcement.receipt?.read_at).length;
  const unreadNoteCount = notes.filter((note) => !note.seen_at).length;

  function markRequestsSeenOptimistically(keys: string[]) {
    if (!keys.length) {
      return;
    }
    setSeenRequestIds((current) => new Set([...current, ...keys]));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    void markNotificationsSeen(currentUserId, keys).then((ok) => {
      if (!ok) {
        revertOptimisticKeys(setSeenRequestIds, keys);
        window.dispatchEvent(new Event("tareeqah:notifications-changed"));
      }
    });
  }

  function changeTab(nextTab: "announcements" | "notes" | "requests") {
    setTab(nextTab);
    setSelectedThread(null);
    setSelectedNoteProgramId(null);
  }

  function viewRequestFromInbox(request: RequestWithContext) {
    if (!studentRequestRequiresAction(request)) {
      markRequestsSeenOptimistically([studentRequestNotificationKey(request)]);
    }
    if (request.status === "cancelled" && request.reviewed_by) {
      setRemovalDetailsRow(request);
      return;
    }
    setApplicationDetailsRow(applicantRowFromRequest(request));
  }

  function viewWithdrawalFromInbox(request: WithdrawalRequestWithContext) {
    markRequestsSeenOptimistically([studentWithdrawalNotificationKey(request)]);
    setWithdrawalDetailsRow(request);
  }

  useEffect(() => {
    if (loading || selectedThread) {
      return;
    }

    const requestedTab = searchParams.get("tab");
    const programId = searchParams.get("programId");
    if (requestedTab !== "announcements" && requestedTab !== "notes" && requestedTab !== "requests") {
      return;
    }

    const key = `${requestedTab}:${programId ?? ""}`;
    if (inboxDeepLinkHandledRef.current === key) {
      return;
    }

    inboxDeepLinkHandledRef.current = key;
    changeTab(requestedTab);
    if (requestedTab === "announcements" && programId) {
      void openThread({ kind: "announcements", programId });
    }
    if (requestedTab === "notes" && programId) {
      const targetNote = notes.find((note) => note.program_id === programId);
      if (targetNote) {
        void openThread({ kind: "notes", programId, studentId: targetNote.student_profile_id });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, loading, notes, searchParams, selectedThread]);

  async function openThread(thread: StudentInboxThread) {
    setSelectedThread(thread);
    const supabase = createSupabaseBrowserClient();
    const now = new Date().toISOString();

    if (thread.kind === "announcements" && currentUserId) {
      const threadAnnouncements = announcements.filter((announcement) => announcement.program_id === thread.programId && !announcement.receipt?.read_at);
      if (threadAnnouncements.length) {
        const { error: receiptError } = await supabase.from("program_announcement_receipts").upsert(
          threadAnnouncements.map((announcement) => ({
            announcement_id: announcement.id,
            profile_id: currentUserId,
            read_at: now,
            dismissed_at: null,
            updated_at: now,
          })),
          { onConflict: "announcement_id,profile_id" },
        );
        if (receiptError) {
          console.error("Failed to persist announcement read state:", receiptError.message);
        } else {
          setAnnouncements((current) =>
            current.map((announcement) =>
              announcement.program_id === thread.programId
                ? {
                    ...announcement,
                    receipt: {
                      id: announcement.receipt?.id ?? `local-${announcement.id}`,
                      announcement_id: announcement.id,
                      profile_id: currentUserId,
                      read_at: now,
                      dismissed_at: null,
                      created_at: announcement.receipt?.created_at ?? now,
                      updated_at: now,
                    },
                  }
                : announcement,
            ),
          );
        }
      }
    }

    if (thread.kind === "notes") {
      const unreadIds = notes.filter((note) => note.program_id === thread.programId && note.student_profile_id === thread.studentId && !note.seen_at).map((note) => note.id);
      if (unreadIds.length) {
        const { error: notesError } = await supabase.rpc("mark_program_student_notes_seen", { note_ids: unreadIds });
        if (notesError) {
          console.error("Failed to persist note seen state:", notesError.message);
        } else {
          setNotes((current) =>
            current.map((note) => (unreadIds.includes(note.id) ? { ...note, seen_at: now, seen_by: currentUserId, updated_at: now } : note)),
          );
        }
      }
    }

    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }

  async function loadOlderAnnouncements(programId: string) {
    if (!currentUserId || announcementThreadLoadingOlder[programId] || announcementThreadExhausted[programId]) {
      return;
    }

    const currentProgramAnnouncements = announcements
      .filter((announcement) => announcement.program_id === programId)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const oldestLoadedAt = currentProgramAnnouncements[0]?.created_at;
    if (!oldestLoadedAt) {
      return;
    }

    setAnnouncementThreadLoadingOlder((current) => ({ ...current, [programId]: true }));
    const supabase = createSupabaseBrowserClient();
    const { data: olderRows, error: olderError } = await supabase
      .from("program_announcements")
      .select("*")
      .eq("program_id", programId)
      .lt("created_at", oldestLoadedAt)
      .order("created_at", { ascending: false })
      .limit(ANNOUNCEMENT_THREAD_PAGE_SIZE);

    if (olderError) {
      setAnnouncementThreadLoadingOlder((current) => ({ ...current, [programId]: false }));
      setError(olderError.message);
      return;
    }

    const announcementIds = (olderRows ?? []).map((announcement) => announcement.id);
    const authorIds = Array.from(new Set((olderRows ?? []).map((announcement) => announcement.author_profile_id).filter(Boolean)));
    const [{ data: authors }, { data: receipts }] = await Promise.all([
      authorIds.length ? supabase.from("profiles").select("*").in("id", authorIds) : Promise.resolve({ data: [] as Profile[] }),
      announcementIds.length
        ? supabase.from("program_announcement_receipts").select("*").eq("profile_id", currentUserId).in("announcement_id", announcementIds)
        : Promise.resolve({ data: [] as AnnouncementReceipt[] }),
    ]);

    const enrolledTrackIds = new Set(announcementTrackIdsByProgramId[programId] ?? []);
    const joinedAt = announcementJoinDateByProgramId[programId];
    const program = enrolledProgramsForInbox.find((item) => item.id === programId) ?? null;
    const now = new Date().toISOString();
    const visibleOlderAnnouncements = (olderRows ?? [])
      .map((announcement) => ({
        ...announcement,
        program,
        author: (authors ?? []).find((author) => author.id === announcement.author_profile_id) ?? null,
        receipt: (receipts ?? []).find((receipt) => receipt.announcement_id === announcement.id) ?? null,
      }))
      .filter((announcement) => isAnnouncementVisibleForEnrollment(announcement, enrolledTrackIds, joinedAt))
      .filter((announcement) => !announcement.receipt?.dismissed_at)
      .map((announcement) => ({
        ...announcement,
        receipt: {
          id: announcement.receipt?.id ?? `local-${announcement.id}`,
          announcement_id: announcement.id,
          profile_id: currentUserId,
          read_at: now,
          dismissed_at: null,
          created_at: announcement.receipt?.created_at ?? now,
          updated_at: now,
        },
      }));

    let olderReceiptsPersisted = true;
    if (visibleOlderAnnouncements.length) {
      const { error: olderReceiptError } = await supabase.from("program_announcement_receipts").upsert(
        visibleOlderAnnouncements.map((announcement) => ({
          announcement_id: announcement.id,
          profile_id: currentUserId,
          read_at: now,
          dismissed_at: null,
          updated_at: now,
        })),
        { onConflict: "announcement_id,profile_id" },
      );
      if (olderReceiptError) {
        console.error("Failed to persist announcement read state:", olderReceiptError.message);
        olderReceiptsPersisted = false;
      }
    }

    setAnnouncements((current) => {
      const existingIds = new Set(current.map((announcement) => announcement.id));
      const incoming = visibleOlderAnnouncements.filter((announcement) => !existingIds.has(announcement.id));
      return [...current, ...(olderReceiptsPersisted ? incoming : incoming.map((announcement) => ({ ...announcement, receipt: null })))];
    });
    setAnnouncementThreadExhausted((current) => ({
      ...current,
      [programId]: (olderRows ?? []).length < ANNOUNCEMENT_THREAD_PAGE_SIZE,
    }));
    setAnnouncementThreadLoadingOlder((current) => ({ ...current, [programId]: false }));
  }

  async function loadOlderNotes(programId: string, studentId: string) {
    const threadKey = `${programId}:${studentId}`;
    if (!currentUserId || noteThreadLoadingOlder[threadKey] || noteThreadExhausted[threadKey]) {
      return;
    }

    const currentThreadNotes = notes
      .filter((note) => note.program_id === programId && note.student_profile_id === studentId)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const oldestLoadedAt = currentThreadNotes[0]?.created_at;
    if (!oldestLoadedAt) {
      return;
    }

    setNoteThreadLoadingOlder((current) => ({ ...current, [threadKey]: true }));
    const supabase = createSupabaseBrowserClient();
    const { data: olderRows, error: olderError } = await supabase
      .from("program_student_notes")
      .select("*")
      .eq("program_id", programId)
      .eq("student_profile_id", studentId)
      .lt("created_at", oldestLoadedAt)
      .order("created_at", { ascending: false })
      .limit(NOTE_THREAD_PAGE_SIZE);

    if (olderError) {
      setNoteThreadLoadingOlder((current) => ({ ...current, [threadKey]: false }));
      setError(olderError.message);
      return;
    }

    const authorIds = Array.from(new Set((olderRows ?? []).map((note) => note.author_profile_id)));
    const recipientIds = Array.from(new Set((olderRows ?? []).map((note) => note.recipient_profile_id)));
    const [{ data: authors }, { data: recipients }] = await Promise.all([
      authorIds.length ? supabase.from("profiles").select("*").in("id", authorIds) : Promise.resolve({ data: [] as Profile[] }),
      recipientIds.length ? supabase.from("profiles").select("*").in("id", recipientIds) : Promise.resolve({ data: [] as Profile[] }),
    ]);

    const now = new Date().toISOString();
    const olderNoteIds = (olderRows ?? []).filter((note) => !note.seen_at).map((note) => note.id);
    let olderNotesPersisted = true;
    if (olderNoteIds.length) {
      const { error: notesRpcError } = await supabase.rpc("mark_program_student_notes_seen", { note_ids: olderNoteIds });
      if (notesRpcError) {
        console.error("Failed to persist note seen state:", notesRpcError.message);
        olderNotesPersisted = false;
      }
    }

    const program = enrolledProgramsForInbox.find((item) => item.id === programId) ?? null;
    const student = notes.find((note) => note.program_id === programId && note.student_profile_id === studentId)?.student ?? null;
    const visibleOlderNotes = (olderRows ?? []).map((note) => ({
      ...note,
      program,
      student,
      recipient: (recipients ?? []).find((recipient) => recipient.id === note.recipient_profile_id) ?? null,
      author: (authors ?? []).find((author) => author.id === note.author_profile_id) ?? null,
      seen_at: olderNotesPersisted ? note.seen_at ?? now : note.seen_at,
      seen_by: olderNotesPersisted ? note.seen_by ?? currentUserId : note.seen_by,
      updated_at: now,
    }));

    setNotes((current) => {
      const existingIds = new Set(current.map((note) => note.id));
      return [...current, ...visibleOlderNotes.filter((note) => !existingIds.has(note.id))];
    });
    setNoteThreadExhausted((current) => ({ ...current, [threadKey]: (olderRows ?? []).length < NOTE_THREAD_PAGE_SIZE }));
    setNoteThreadLoadingOlder((current) => ({ ...current, [threadKey]: false }));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }

  return (
    <div className="bg-[var(--workspace)]">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="md:hidden">
        <FloatingInboxTabs
          tabs={[
            { id: "announcements", label: "Announcements", badge: unreadAnnouncementCount },
            { id: "notes", label: "Notes", badge: unreadNoteCount },
            { id: "requests", label: "Applications", badge: unseenRequestCount },
          ]}
          value={tab}
          onChange={(value) => changeTab(value as "announcements" | "notes" | "requests")}
        />
      </div>
      <div className="space-y-4 p-4">
        {error ? (
          <EmptyState title="Could not load inbox" text={error} onRetry={() => window.location.reload()} />
        ) : loading ? (
          <InboxLoadingPanel label={tab === "announcements" ? "Loading announcements" : tab === "notes" ? "Loading notes" : "Loading applications"} />
        ) : selectedThread ? (
          <StudentInboxThreadView
            thread={selectedThread}
            announcements={announcements}
            notes={notes}
            hasOlderAnnouncements={selectedThread.kind === "announcements" ? !announcementThreadExhausted[selectedThread.programId] : false}
            loadingOlderAnnouncements={selectedThread.kind === "announcements" ? Boolean(announcementThreadLoadingOlder[selectedThread.programId]) : false}
            onLoadOlderAnnouncements={selectedThread.kind === "announcements" ? () => void loadOlderAnnouncements(selectedThread.programId) : undefined}
            hasOlderNotes={selectedThread.kind === "notes" ? !noteThreadExhausted[`${selectedThread.programId}:${selectedThread.studentId}`] : false}
            loadingOlderNotes={selectedThread.kind === "notes" ? Boolean(noteThreadLoadingOlder[`${selectedThread.programId}:${selectedThread.studentId}`]) : false}
            onLoadOlderNotes={selectedThread.kind === "notes" ? () => void loadOlderNotes(selectedThread.programId, selectedThread.studentId) : undefined}
            onBack={() => setSelectedThread(null)}
          />
        ) : tab === "announcements" ? (
          <StudentInboxThreadList
            emptyText="Class announcements will appear here."
            threads={announcementThreads.map((thread) => ({
              id: thread.programId,
              title: thread.program?.title ?? "Class announcement",
              subtitle: thread.latest ? `${thread.latest.author?.full_name ?? "Teacher"} - ${thread.latest.message}` : "No announcements yet",
              meta: thread.latest ? timeAgo(thread.latest.created_at) : "",
              unreadCount: thread.unreadCount,
              onClick: () => void openThread({ kind: "announcements", programId: thread.programId }),
            }))}
          />
        ) : tab === "notes" ? (
          isParentInbox && !selectedNoteProgramId ? (
            <StudentInboxThreadList
              emptyText="Teacher notes, homework, feedback, and progress updates will appear here."
              threads={noteProgramThreads.map(({ program, childThreads, unreadCount, latest }) => ({
                id: program.id,
                title: program.title,
                subtitle: childThreads.length === 1 ? "Notes for 1 child" : `Notes for ${childThreads.length} children`,
                meta: latest ? timeAgo(latest.created_at) : "",
                unreadCount,
                onClick: () => setSelectedNoteProgramId(program.id),
              }))}
            />
          ) : selectedNoteProgramId ? (
            <div className="space-y-3">
              <button type="button" onClick={() => setSelectedNoteProgramId(null)} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#2F8FB3] ring-1 ring-[#DDE7EC]">
                <ChevronLeftIcon /> Classes
              </button>
              <StudentInboxThreadList
                emptyText="No student note feeds are available for this class."
                threads={selectedNoteStudents.map((student) => {
                  const thread = noteThreadByKey.get(`${selectedNoteProgramId}:${student.id}`);
                  return {
                    id: `${selectedNoteProgramId}-${student.id}`,
                    title: student.full_name?.trim() || "Student",
                    subtitle: thread?.latest ? `${thread.latest.author?.full_name ?? "Teacher"} - ${thread.latest.message}` : `Notes for ${selectedNoteProgram?.title ?? "this class"}`,
                    meta: thread?.latest ? timeAgo(thread.latest.created_at) : "",
                    unreadCount: thread?.unreadCount ?? 0,
                    onClick: () => void openThread({ kind: "notes", programId: selectedNoteProgramId, studentId: student.id, programTitle: selectedNoteProgram?.title ?? null, studentName: student.full_name ?? null }),
                  };
                })}
              />
            </div>
          ) : (
            <StudentInboxThreadList
              emptyText="Teacher notes, homework, feedback, and progress updates will appear here."
              threads={noteProgramThreads.flatMap(({ program, childThreads }) =>
                childThreads.map((student) => {
                  const thread = noteThreadByKey.get(`${program.id}:${student.id}`);
                  return {
                    id: `${program.id}-${student.id}`,
                    title: program.title,
                    subtitle: thread?.latest ? `${thread.latest.author?.full_name ?? "Teacher"} - ${thread.latest.message}` : `Notes for ${student.full_name?.trim() || "you"}`,
                    meta: thread?.latest ? timeAgo(thread.latest.created_at) : student.full_name?.trim() || "",
                    unreadCount: thread?.unreadCount ?? 0,
                    onClick: () => void openThread({ kind: "notes", programId: program.id, studentId: student.id, programTitle: program.title, studentName: student.full_name ?? null }),
                  };
                }),
              )}
            />
          )
        ) : (
          <>
            <InboxSection title="Pending" count={pendingRequests.length + pendingWithdrawals.length}>
              {pendingRequests.length || pendingWithdrawals.length ? (
                <>
                  {pendingRequests.map((request) => (
                    <StudentRequestCard key={request.id} request={request} unread={studentRequestShouldNotify(request) && (studentRequestRequiresAction(request) || !seenRequestIds.has(studentRequestNotificationKey(request)))} onViewApplication={() => viewRequestFromInbox(request)} />
                  ))}
                  {pendingWithdrawals.map((request) => (
                    <StudentWithdrawalStatusCard key={request.id} request={request} unread={!seenRequestIds.has(studentWithdrawalNotificationKey(request))} onOpen={() => viewWithdrawalFromInbox(request)} />
                  ))}
                </>
              ) : (
                <MiniEmpty text="No pending requests." />
              )}
            </InboxSection>
            <InboxSection title="Returned" count={returnedRequests.length + returnedWithdrawals.length} action={returnedRequests.length || returnedWithdrawals.length ? <ClearAllButton onClick={clearAllReturnedRequests} /> : null}>
              {returnedRequests.length || returnedWithdrawals.length ? (
                <>
                  {returnedRequests.map((request) => (
                    <StudentRequestCard
                      key={request.id}
                      request={request}
                      unread={studentRequestShouldNotify(request) && (studentRequestRequiresAction(request) || !seenRequestIds.has(studentRequestNotificationKey(request)))}
                      onViewApplication={request.status === "approved" && request.admission_completed_at ? undefined : () => viewRequestFromInbox(request)}
                      viewClassHref={request.status === "approved" && request.admission_completed_at ? `/m/${slug}/portal/classes/${request.program_id}` : undefined}
                      onDismiss={() => dismissRequest(request.id)}
                    />
                  ))}
                  {returnedWithdrawals.map((request) => (
                    <StudentWithdrawalStatusCard key={request.id} request={request} unread={!seenRequestIds.has(studentWithdrawalNotificationKey(request))} onOpen={() => viewWithdrawalFromInbox(request)} onDismiss={() => dismissWithdrawalRequests([request.id])} />
                  ))}
                </>
              ) : (
                <MiniEmpty text="Accepted or rejected requests will appear here." />
              )}
            </InboxSection>
          </>
        )}
      </div>
      {paymentNotice ? (
        <PaymentResultModal
          status={paymentNotice}
          slug={slug}
          onClose={() => {
            setPaymentNotice(null);
            window.dispatchEvent(new Event("tareeqah:notifications-changed"));
            void loadInbox();
          }}
        />
      ) : null}
      {paymentConfirming ? <PaymentConfirmingModal /> : null}
      {applicationDetailsRow ? (
        <ApplicantDetailsDrawer
          row={applicationDetailsRow}
          slug={slug}
          returnTo={`/m/${slug}/portal/announcements`}
          onClose={() => setApplicationDetailsRow(null)}
          onRescind={() => setRescindTarget(applicationDetailsRow)}
          onCancelRegistration={() => setCancelRegistrationTarget(applicationDetailsRow)}
        />
      ) : null}
      {removalDetailsRow ? (
        <StudentRemovalDetailsDrawer request={removalDetailsRow} onClose={() => setRemovalDetailsRow(null)} />
      ) : null}
      {cancelRegistrationTarget ? (
        <ConfirmStudentRescindModal
          mode="cancel_registration"
          request={{ ...cancelRegistrationTarget.request, student: cancelRegistrationTarget.student, parent: cancelRegistrationTarget.request.parent_profile_id ? cancelRegistrationTarget.parent ?? null : null, program: cancelRegistrationTarget.program, track: cancelRegistrationTarget.track }}
          busy={cancelRegistrationBusy}
          onCancel={() => {
            if (!cancelRegistrationBusy) {
              setCancelRegistrationTarget(null);
            }
          }}
          onConfirm={() => void confirmCancelRegistrationFromApplication()}
        />
      ) : null}
      {rescindTarget ? (
        <ConfirmStudentRescindModal
          request={{ ...rescindTarget.request, student: rescindTarget.student, parent: rescindTarget.request.parent_profile_id ? rescindTarget.parent ?? null : null, program: rescindTarget.program, track: rescindTarget.track }}
          busy={rescindBusy}
          onCancel={() => {
            if (!rescindBusy) {
              setRescindTarget(null);
            }
          }}
          onConfirm={() => void confirmRescindApplicationFromInbox()}
        />
      ) : null}
      {withdrawalDetailsRow ? (
        <StudentWithdrawalDetailsDrawer request={withdrawalDetailsRow} onClose={() => setWithdrawalDetailsRow(null)} />
      ) : null}
      {protectedClear ? (
        <ProtectedPaidApplicationClearModal
          count={protectedClear.count}
          mode={protectedClear.mode}
          onCancel={() => setProtectedClear(null)}
        />
      ) : null}
    </div>
  );
}
