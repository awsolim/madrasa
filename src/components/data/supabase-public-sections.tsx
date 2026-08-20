"use client";

import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ApplicationDecisionModal, ApplicationReviewOverlay, type ApplicationRow } from "@/components/data/application-review";
import { ChildrenManager } from "@/components/data/children-manager";
import { TransitionLink } from "@/components/layout/transition-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SetStateAction, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/data/empty-state";
import { DirectorySkeleton, GenericLoadingState } from "@/components/data/data-loading";
import { EditorToast, queueEditorToast, readQueuedEditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { FloatingInboxTabs, InboxLoadingPanel, InboxSection, MiniEmpty, NotificationBadge } from "@/components/data/inbox-shared";
import { InstallDemoTabs } from "@/components/pwa/install-demo-tabs";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FlatLink } from "@/components/ui/flat-button";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { useStudentNotificationCounts, useTeacherNotificationCounts } from "@/hooks/use-notification-counts";
import { getAccountLabel, getDefaultLandingHref, loadUserAccessByMosqueSlug } from "@/lib/authz";
import { getCachedMosqueChrome, getCachedProfileSummary, getCachedSessionSnapshot, getCachedUserAccess, loadCachedSession, loadCachedUserAccess, loadMosqueChrome, performClientLogout, setCachedProfileName, setCachedProfileSummary, subscribeCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import { attachmentDisplayName, attachmentMetaLabel, formatAttachmentSize, normalizeMessageAttachments, type MessageAttachment } from "@/lib/messages/attachments";
import { buildAnnouncementThreads, buildNoteThreads } from "@/lib/messages/threads";
import { detectMobilePlatform, isStandalone } from "@/lib/pwa/install";
import { invalidateQuery, invalidateQueryPrefix, prefetchQuery, useCachedQuery } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { deriveLifecycleStatus, getApplicationButtonState, getProgramPrimaryCta, getProgramStatusBadges, isPubliclyListed, toProgramStatusFields, validateProgramStatusCombination, type ApplicationStatus as ProgramApplicationStatus, type LifecycleStatus as ProgramLifecycleStatus, type PublicationStatus as ProgramPublicationStatus, type ProgramStatusFields } from "@/lib/programs/status";
import {
  dayFromSessionDate,
  dayKey,
  formatClockLabel,
  formatDayAbbreviation,
  formatScheduleRange,
  normalizeScheduleDay,
  normalizeScheduleTime,
  parseProgramSchedule,
  rosterSessionKey,
  scheduleDayOptions,
  scheduleLabel,
  scheduleRowKey,
  scheduleRowsToJson,
  sortScheduleRows,
  type ProgramScheduleRow,
  uniqueScheduleRows,
  weekdayName,
} from "@/lib/programs/schedule";
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
import { getApplicantPrimaryAction, isApplicationActionRequired } from "@/lib/programs/applicant-actions";
import { attendanceHistoryHref, attendanceMarkHref } from "@/lib/programs/attendance";
import {
  fetchNotificationState,
  markNotificationsDismissed,
  markNotificationsSeen,
  revertOptimisticKeys,
  studentRequestNotificationKey,
  studentRequestRequiresAction,
  studentRequestShouldNotify,
  studentWithdrawalNotificationKey,
  teacherInstructorNotificationKey,
  teacherRequestNotificationKey,
  teacherRequestShouldBeUnread,
  type InstructorLifecycleNotification,
  type NotificationCounts,
} from "@/lib/notifications/inbox";
import {
  formatAgeRange,
  formatCurrencyAmount,
  formatDateOnly,
  formatFullDate,
  formatGender,
  formatPrice,
  formatShortDate,
  formatStudentDetailGender,
} from "@/lib/programs/display";
import { isCurrentEnrollmentStatus } from "@/lib/programs/enrollment-status";
import { fetchParentChildren } from "@/lib/programs/family";

type Mosque = Database["public"]["Tables"]["mosques"]["Row"];
type Program = Database["public"]["Tables"]["programs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProgramDetails = Database["public"]["Tables"]["program_details"]["Row"];
type ProgramOutcome = Database["public"]["Tables"]["program_outcomes"]["Row"];
type ProgramFaq = Database["public"]["Tables"]["program_faqs"]["Row"];
type ProgramContentSection = Database["public"]["Tables"]["program_content_sections"]["Row"];
type ProgramMedia = Database["public"]["Tables"]["program_media"]["Row"];
type ProgramTrack = Database["public"]["Tables"]["program_tracks"]["Row"];
type ProgramSession = Database["public"]["Tables"]["program_sessions"]["Row"];
type ProgramTrackSession = Database["public"]["Tables"]["program_track_sessions"]["Row"];
type ProgramStudentNote = Database["public"]["Tables"]["program_student_notes"]["Row"];
type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];
type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];
type WithdrawalRequest = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
type MosqueMembership = Database["public"]["Tables"]["mosque_memberships"]["Row"];
type ProgramTeacher = Database["public"]["Tables"]["program_teachers"]["Row"];
type ProgramInstructorEvent = Database["public"]["Tables"]["program_instructor_events"]["Row"];
type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];
type ProgramPaymentTerms = Database["public"]["Tables"]["program_payment_terms"]["Row"];
type ProgramFinanceAuditEvent = Database["public"]["Tables"]["program_finance_audit_events"]["Row"];
type AnnouncementReceipt = Database["public"]["Tables"]["program_announcement_receipts"]["Row"];
type ProgramSessionCancellation = Database["public"]["Tables"]["program_session_cancellations"]["Row"];
type ProgramAttendanceRecord = Database["public"]["Tables"]["program_attendance_records"]["Row"];
type ProgramTrackSwitchRequestRow = Database["public"]["Tables"]["program_track_switch_requests"]["Row"];
type ProgramTrackSwitchRequestWithContext = ProgramTrackSwitchRequestRow & {
  program?: Program | null;
  student?: StudentDisplay | null;
};
type TeacherDisplay = Pick<Profile, "id" | "full_name" | "avatar_url" | "teacher_credentials" | "teacher_whatsapp_number">;
type StudentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type">;
type ParentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url">;
type DirectorOption = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "teacher_credentials" | "teacher_whatsapp_number">;

type ProgramWithTeacher = Program & {
  teacher?: TeacherDisplay | null;
  coverDirectorDisplayName?: string | null;
  coverDirectorVisibility?: string;
};

type TeacherProgramRole = "director" | "instructor";
type PaymentType = "monthly" | "annual";
type ProgramEditorMediaRow = { id: string; url: string; title: string; mediaType: string; file?: File | null; previewUrl?: string };
type ProgramEditorFaqRow = { id: string; question: string; answer: string };
type ProgramEditorContentSectionRow = { id: string; title: string; description: string; durationText: string };
type ProgramEditorTrackRow = {
  id: string;
  name: string;
  sessions: ProgramScheduleRow[];
  location?: string;
  room?: string;
  capacity?: string;
  pricingOverrideEnabled?: boolean;
  priceMonthly?: string;
  priceAnnual?: string;
  eligibilityOverrideEnabled?: boolean;
  ageMin?: string;
  ageMax?: string;
  genderOverride?: string;
  eligibilityComment?: string;
};
type ProgramEditorTransferRule = { id: string; fromTrackId: string; toTrackId: string };
type ProgramBuilderStep = "basics" | "public" | "schedule" | "pricing" | "review";
type ProgramBuilderStatus = {
  internalName: string;
  summary: string;
  category: string;
  programType: "recurring" | "event";
  publicationStatus: ProgramPublicationStatus;
  applicationStatus: ProgramApplicationStatus;
  lifecycleStatus: ProgramLifecycleStatus;
  applicationMode: "application_required" | "open_enrollment" | "invite_only" | "hidden_private";
  acceptingApplications: boolean;
  applicationOpenAt: string;
  applicationCloseAt: string;
  waitlistEnabled: boolean;
  capacityBehavior: "manual_review" | "close_when_full" | "allow_waitlist";
  defaultCapacity: string;
  durationType: "ongoing" | "fixed_months";
  startNow: boolean;
  startDate: string;
  endDate: string;
  durationMonths: string;
  schedulePattern: "weekly" | "custom_dates";
  registrationDeadline: string;
  location: string;
  room: string;
  roomArea: string;
  paymentKind: "free" | "tareeqah";
  billingStartBehavior: "on_payment" | "program_start";
  billingEndBehavior: "manual_cancel" | "program_end" | "fixed_months";
  billingDurationMonths: string;
  allowCustomPrices: boolean;
  allowWaivedPayments: boolean;
  manualPaymentNote: string;
  financialAssistanceNote: string;
  receiptNote: string;
  taxReceiptPolicy: "not_applicable" | "admin_review_required" | "eligible_confirmed";
  trackSwitchPolicy: "disabled" | "request_only" | "allowed";
  trackSwitchAllowAll: boolean;
  contactEmail: string;
  contactPhone: string;
  coverPriceLabelEnabled: boolean;
  coverPriceLabel: string;
};

type AnnouncementWithContext = Database["public"]["Tables"]["program_announcements"]["Row"] & {
  program?: Program | null;
  author?: Profile | null;
  receipt?: AnnouncementReceipt | null;
};

const programBuilderSteps: Array<{ id: ProgramBuilderStep; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "public", label: "Public Page" },
  { id: "schedule", label: "Schedule" },
  { id: "pricing", label: "Pricing" },
  { id: "review", label: "Review" },
];

function scrollBuilderToTop() {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}

function defaultBuilderStatus(): ProgramBuilderStatus {
  return {
    internalName: "",
    summary: "",
    category: "",
    programType: "recurring",
    publicationStatus: "draft",
    applicationStatus: "accepting",
    lifecycleStatus: "upcoming",
    applicationMode: "application_required",
    acceptingApplications: true,
    applicationOpenAt: "",
    applicationCloseAt: "",
    waitlistEnabled: true,
    capacityBehavior: "manual_review",
    defaultCapacity: "",
    durationType: "ongoing",
    startNow: false,
    startDate: "",
    endDate: "",
    durationMonths: "10",
    schedulePattern: "weekly",
    registrationDeadline: "",
    location: "",
    room: "",
    roomArea: "",
    paymentKind: "free",
    billingStartBehavior: "on_payment",
    billingEndBehavior: "fixed_months",
    billingDurationMonths: "",
    allowCustomPrices: true,
    allowWaivedPayments: true,
    manualPaymentNote: "",
    financialAssistanceNote: "Financial assistance or custom payment arrangements may be available. Please apply and contact the class Director for details.",
    receiptNote: "Receipt eligibility may depend on class type and masjid policy. Please contact administration for details.",
    taxReceiptPolicy: "not_applicable",
    trackSwitchPolicy: "disabled",
    trackSwitchAllowAll: false,
    contactEmail: "",
    contactPhone: "",
    coverPriceLabelEnabled: true,
    coverPriceLabel: "",
  };
}

function defaultProgramBuilderColumns(): Pick<Program,
  | "internal_name"
  | "summary"
  | "category"
  | "program_type"
  | "publication_status"
  | "application_status"
  | "lifecycle_status"
  | "application_mode"
  | "accepting_applications"
  | "application_open_at"
  | "application_close_at"
  | "waitlist_enabled"
  | "capacity_behavior"
  | "default_capacity"
  | "duration_type"
  | "start_now"
  | "start_date"
  | "end_date"
  | "duration_months"
  | "is_ongoing"
  | "schedule_pattern"
  | "registration_deadline_at"
  | "location"
  | "room"
  | "room_area"
  | "payment_kind"
  | "billing_start_behavior"
  | "billing_end_behavior"
  | "billing_duration_months"
  | "allow_custom_prices"
  | "allow_waived_payments"
  | "manual_payment_note"
  | "financial_assistance_note"
  | "receipt_note"
  | "tax_receipt_policy"
  | "track_switch_policy"
  | "track_switch_allow_all"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "cover_price_label_enabled"
  | "cover_price_label"
> {
  const defaults = defaultBuilderStatus();
  return {
    internal_name: null,
    summary: null,
    category: null,
    program_type: defaults.programType,
    publication_status: defaults.publicationStatus,
    application_status: defaults.applicationStatus,
    lifecycle_status: defaults.lifecycleStatus,
    application_mode: defaults.applicationMode,
    accepting_applications: defaults.acceptingApplications,
    application_open_at: null,
    application_close_at: null,
    waitlist_enabled: defaults.waitlistEnabled,
    capacity_behavior: defaults.capacityBehavior,
    default_capacity: null,
    duration_type: defaults.durationType,
    start_now: defaults.startNow,
    start_date: null,
    end_date: null,
    duration_months: Number(defaults.durationMonths),
    is_ongoing: defaults.durationType === "ongoing",
    schedule_pattern: defaults.schedulePattern,
    registration_deadline_at: null,
    location: null,
    room: null,
    room_area: null,
    payment_kind: defaults.paymentKind,
    billing_start_behavior: defaults.billingStartBehavior,
    billing_end_behavior: defaults.billingEndBehavior,
    billing_duration_months: Number(defaults.billingDurationMonths || "10"),
    allow_custom_prices: true,
    allow_waived_payments: true,
    manual_payment_note: null,
    financial_assistance_note: defaults.financialAssistanceNote,
    receipt_note: defaults.receiptNote,
    tax_receipt_policy: defaults.taxReceiptPolicy,
    track_switch_policy: defaults.trackSwitchPolicy,
    track_switch_allow_all: defaults.trackSwitchAllowAll,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    cover_price_label_enabled: defaults.coverPriceLabelEnabled,
    cover_price_label: null,
  };
}

function programAlreadyStarted(program: Program | null) {
  if (!program) {
    return false;
  }
  if (program.start_now) {
    return true;
  }
  if (program.lifecycle_status === "active" || program.lifecycle_status === "completed") {
    return true;
  }
  if (!program.start_date) {
    return false;
  }
  return new Date(`${program.start_date}T00:00:00`).getTime() < startOfToday().getTime();
}

function defaultProgramTrackBuilderColumns(): Pick<ProgramTrack, "gender_override" | "age_min" | "age_max" | "location" | "room" | "capacity" | "pricing_override_enabled" | "price_monthly_cents" | "price_annual_cents" | "eligibility_comment"> {
  return {
    gender_override: null,
    age_min: null,
    age_max: null,
    location: null,
    room: null,
    capacity: null,
    pricing_override_enabled: false,
    price_monthly_cents: null,
    price_annual_cents: null,
    eligibility_comment: null,
  };
}

function trackEligibilityOverrideColumns(track: ProgramEditorTrackRow) {
  return {
    gender_override: track.eligibilityOverrideEnabled ? track.genderOverride || "all" : null,
    age_min: track.eligibilityOverrideEnabled && track.ageMin ? Number(track.ageMin) : null,
    age_max: track.eligibilityOverrideEnabled && track.ageMax ? Number(track.ageMax) : null,
    eligibility_comment: track.eligibilityOverrideEnabled ? track.eligibilityComment?.trim() || null : null,
  };
}

function formatRequiredLabel(label: string, required?: boolean) {
  return (
    <>
      {label}
      {required ? <span className="ml-1 text-[#C83F31]" aria-hidden>*</span> : null}
    </>
  );
}

function estimateEndMonth(startDate: string, months: string) {
  const count = Number(months || "0");
  if (!startDate || !Number.isFinite(count) || count <= 0) {
    return "";
  }
  const date = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setMonth(date.getMonth() + Math.round(count));
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function monthsBetweenDates(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) {
    return null;
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(1, months);
}

/**
 * Suggested number of monthly billing cycles for a fixed-duration program. monthsBetweenDates
 * counts exact calendar-month boundaries crossed, which systematically undercounts a range like
 * Sep 1 -> Jun 30 as 9 (not the "10 months of school" a director actually means) since the end
 * date never quite reaches the 10th boundary. This rounds the leftover days after the last whole
 * month instead, so >=20 leftover days counts as another billing cycle. This is the value shown
 * (read-only) as the program's billing-cycle count, never the calendar duration shown elsewhere
 * (that stays exact, driven by monthsBetweenDates/start_date/end_date directly).
 */
function estimateBillingMonths(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) {
    return null;
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const monthMark = new Date(start);
  monthMark.setMonth(monthMark.getMonth() + months);
  let leftoverDays = Math.round((end.getTime() - monthMark.getTime()) / 86400000);
  if (leftoverDays < 0) {
    months -= 1;
    monthMark.setMonth(monthMark.getMonth() - 1);
    leftoverDays = Math.round((end.getTime() - monthMark.getTime()) / 86400000);
  }
  if (leftoverDays >= 20) {
    months += 1;
  }
  return Math.max(1, months);
}

function formatMonthlyCycle(priceText: string, monthsText: string) {
  const monthly = Number(priceText || "0");
  const months = Number(monthsText || "0");
  if (!monthly || !months) {
    return "";
  }
  return `$${monthly.toFixed(2)} x ${months} months = $${(monthly * months).toFixed(2)} CAD for one cycle.`;
}

function formatAnnualSavings(priceText: string, annualText: string, monthsText: string) {
  const monthly = Number(priceText || "0");
  const annual = Number(annualText || "0");
  const months = Number(monthsText || "0");
  if (!monthly || !annual || !months) {
    return "";
  }
  const monthlyTotal = monthly * months;
  const diff = Math.abs(monthlyTotal - annual);
  if (annual < monthlyTotal) {
    return `One-time saves $${diff.toFixed(2)} CAD compared with monthly.`;
  }
  if (annual > monthlyTotal) {
    return `Monthly saves $${diff.toFixed(2)} CAD compared with one-time.`;
  }
  return "Monthly and one-time totals match.";
}

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
type TeacherInboxTab = "requests" | "other";
type TeacherInboxSortMode = "newest" | "unread";
type TrackSelectionMode = "exact" | "minimum" | "maximum";

type MosqueProgramsSnapshot = {
  mosque: Mosque;
  programs: ProgramWithTeacher[];
};

type StudentNoteWithContext = ProgramStudentNote & {
  program?: Program | null;
  student?: StudentDisplay | null;
  recipient?: Profile | null;
  author?: Profile | null;
};

type StudentInboxThread =
  | { kind: "announcements"; programId: string; programTitle?: string | null }
  | { kind: "notes"; programId: string; studentId: string; programTitle?: string | null; studentName?: string | null };
type ProgramScheduleSource = (Program | ProgramWithTeacher) & { scheduleTracks?: ProgramTrack[] };
type EnrollmentTrackSelection = Pick<Enrollment, "id" | "program_id" | "student_profile_id" | "program_track_id" | "created_at" | "status">;

function getAnnouncementTargetTrackIds(announcement: Pick<AnnouncementWithContext, "target_program_track_ids">) {
  return announcement.target_program_track_ids ?? [];
}

/**
 * Resolves a single display track for an enrollment_request. Multi-track selections are
 * stored in the enrollment_request_tracks join table (not the legacy program_track_id column),
 * so callers that only checked program_track_id showed a blank "—" for those requests.
 */
export function resolveRequestTrack(
  request: Pick<EnrollmentRequest, "id" | "program_track_id">,
  requestTrackIdsByRequestId: Map<string, string[]>,
  tracks: ProgramTrack[],
): ProgramTrack | null {
  const primaryTrackId = request.program_track_id ?? requestTrackIdsByRequestId.get(request.id)?.[0] ?? null;
  return primaryTrackId ? tracks.find((track) => track.id === primaryTrackId) ?? null : null;
}


export function announcementTargetValue(programId: string, trackId: string | null) {
  return `${programId}:${trackId ?? "all"}`;
}

export function parseAnnouncementTargetValue(value: string) {
  const [programId, trackId] = value.split(":");
  return { programId: programId ?? "", trackId: trackId && trackId !== "all" ? trackId : null };
}

export function announcementTargetLabel(program: Pick<Program, "title">, track: ProgramTrack | null) {
  return track ? `${program.title} - ${track.name}` : `${program.title} - All Tracks`;
}

async function getCurrentAccessToken() {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

type ApplicationActionEndpoint = "approve" | "waitlist" | "reject" | "cancel-approval" | "change-price" | "waive" | "note" | "confirm" | "reopen" | "cancel-registration";

export async function callApplicationAction<T = Record<string, unknown>>(
  programId: string,
  requestId: string,
  endpoint: ApplicationActionEndpoint,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = await getCurrentAccessToken();
  if (!token) {
    return { ok: false, error: "Please sign in again to continue." };
  }

  const response = await fetch(`/api/programs/${programId}/applications/${requestId}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    return { ok: false, error: result.error ?? "Something went wrong." };
  }
  return { ok: true, data: result };
}

function queueEnrollmentRequestSubmittedEmails(requestIds: string[]) {
  if (requestIds.length === 0) {
    return;
  }

  void (async () => {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return;
    }

    await fetch("/api/email/enrollment-request-submitted", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ requestIds }),
    });
  })().catch(() => null);
}

function queueEnrollmentRequestReviewedEmail(requestId: string) {
  void (async () => {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return;
    }

    await fetch("/api/email/enrollment-request-reviewed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ requestId }),
    });
  })().catch(() => null);
}

function notifyNoteSent(programId: string, noteId: string) {
  void (async () => {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return;
    }

    await fetch(`/api/programs/${programId}/notes/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ noteId }),
    });
  })().catch(() => null);
}

export function notifyAnnouncementPosted(programId: string, announcementId: string) {
  void (async () => {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return;
    }

    await fetch(`/api/programs/${programId}/announcements/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ announcementId }),
    });
  })().catch(() => null);
}

async function uploadMessageAttachment(programId: string, file: File): Promise<{ attachment?: MessageAttachment; error?: string }> {
  const token = await getCurrentAccessToken();
  if (!token) {
    return { error: "Log in required." };
  }
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/programs/${programId}/message-attachments/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const result = (await response.json().catch(() => ({}))) as { attachment?: MessageAttachment; error?: string };
  if (!response.ok || !result.attachment) {
    return { error: result.error ?? "Could not upload attachment." };
  }
  return { attachment: result.attachment };
}

function formatRecordingDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function notifyInstructorEvent(programId: string, eventType: "joined" | "resigned") {
  void (async () => {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return;
    }

    await fetch(`/api/programs/${programId}/instructors/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ eventType }),
    });
  })().catch(() => null);
}

function notifyWithdrawalRequested(programId: string, studentProfileId: string) {
  void (async () => {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return;
    }

    await fetch("/api/withdrawal-requests/notify-created", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ programId, studentProfileId }),
    });
  })().catch(() => null);
}

export function MosqueDirectoryRows() {
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase
      .from("mosques")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data, error: queryError }) => {
        setLoading(false);
        if (queryError) {
          setError(friendlyErrorMessage(queryError, "Could not load masjids."));
          return;
        }
        setMosques(data ?? []);
      });
  }, []);

  if (loading) {
    return <DirectorySkeleton layout="classes" />;
  }

  if (error) {
    return <EmptyState title="Could not load masjids" text={error} onRetry={() => window.location.reload()} />;
  }

  if (mosques.length === 0) {
    return <EmptyState title="No masjids yet" text="Masjids added in Supabase will appear here." />;
  }

  return (
    <>
      {mosques.map((mosque) => (
        <div key={mosque.id} className="flex min-h-20 items-center gap-3 border-b border-[#D6DCE0] px-4 py-3 last:border-b-0">
          <Logo src={mosque.logo_url} name={mosque.name} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium text-[#26323A]">{mosqueSlugLabel(mosque)}</h2>
          </div>
          <FlatLink href={`/m/${mosque.slug}`} variant="primary" className="shrink-0">
            Open
          </FlatLink>
        </div>
      ))}
    </>
  );
}

export function PublicMasjidData({ slug }: { slug: string }) {
  return <StudentHomeData slug={slug} />;
}

export function StudentHomeData({ slug }: { slug: string }) {
  const { programs, enrolledProgramIds, programOwnerLabels, programOwnerLabelsByTrackId, programTracksByProgramId, accountType, viewerProfiles, loading, enrollmentLoading, error } = useStudentPrograms(slug);
  const { rows: applicationRows, loading: applicationsLoading } = useApplicantApplications(slug);
  const { announcementCount, noteCount, requestCount, actionRequired } = useStudentNotificationCounts(slug);

  if (loading || enrollmentLoading || applicationsLoading) {
    return <HomeLoadingState />;
  }

  if (error) {
    return <EmptyState title="Could not load masjid" text={error} onRetry={() => window.location.reload()} />;
  }

  const enrolledPrograms = programs
    .filter((program) => enrolledProgramIds.includes(program.id))
    .map((program) => ({
      ...program,
      scheduleTracks: programTracksByProgramId[program.id],
    }));

  const hasActionRequired = actionRequired || applicationRows.some((row) => isApplicationActionRequired(getApplicationStatus(row.request)));
  const hasAttention = announcementCount + noteCount > 0;

  return (
    <section className="space-y-5 bg-[var(--workspace)] p-4">
      <AddToHomeScreenNudge slug={slug} settingsHref={`/m/${slug}/portal/account`} />
      {hasActionRequired ? (
        <HomeNotification
          tone="active"
          title="Action Required"
          text="Your inbox contains notifications requiring immediate action."
          href={`/m/${slug}/portal/announcements`}
        />
      ) : hasAttention || requestCount > 0 ? (
        <HomeNotification
          tone="active"
          title="Attention"
          text="Your inbox contains new messages."
          href={`/m/${slug}/portal/announcements`}
        />
      ) : null}
      <HomeSectionTitle title="Upcoming" />
      {enrolledPrograms.length === 0 ? (
        <EmptyState title="You are not enrolled in any classes" text="Your next lesson will appear here after enrollment." />
      ) : (
        <HomeUpcomingRows programs={enrolledPrograms} ownerLabelsByProgramId={programOwnerLabels} ownerLabelsByTrackId={programOwnerLabelsByTrackId} />
      )}
    </section>
  );
}

export function PublicProgramsData({ slug, detailReturnTo }: { slug: string; detailReturnTo?: string }) {
  const router = useRouter();
  const { mosque, programs, loading, error } = useMosquePrograms(slug);
  const [checkingSignedInRedirect, setCheckingSignedInRedirect] = useState(true);

  useEffect(() => {
    if (loading || error || !programs.length) {
      return;
    }
    let cancelled = false;
    // Warm the detail-page cache for the first handful of visible cards, so tapping into one
    // from this list renders instantly instead of paying the full fetch on the next page.
    loadCachedSession().then((session) => {
      if (cancelled) {
        return;
      }
      const userId = session?.user.id ?? null;
      for (const program of programs.slice(0, 6)) {
        prefetchQuery(`program-detail:${slug}:${program.id}:public:${userId ?? "guest"}`, () => fetchProgramDetailSnapshot(slug, program.id, "public", userId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loading, error, programs, slug]);

  useEffect(() => {
    let active = true;
    async function redirectSignedInAccounts() {
      const session = await loadCachedSession();
      if (!active) {
        return;
      }
      if (!session?.user.id) {
        setCheckingSignedInRedirect(false);
        return;
      }
      const access = await loadUserAccessByMosqueSlug(slug);
      if (!active) {
        return;
      }
      const landing = getDefaultLandingHref(slug, access);
      router.replace(access.accountType?.toLowerCase() === "teacher" ? `${landing}/classes` : access.accountType?.toLowerCase() === "admin" ? `${landing}/programs` : `${landing}/classes`);
    }

    void redirectSignedInAccounts();
    return () => {
      active = false;
    };
  }, [router, slug]);

  if (checkingSignedInRedirect || loading) {
    return <DirectorySkeleton layout="classes" />;
  }

  if (error) {
    return <EmptyState title="Could not load classes" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!mosque) {
    return <EmptyState title="Masjid not found" text="Classes could not be loaded for this masjid." />;
  }

  return <ProgramCardGrid programs={programs} mosqueSlug={mosque.slug} emptyText="No classes are available at this masjid yet." detailReturnTo={detailReturnTo} />;
}

type ProgramDetailSnapshot = {
  mosque: Mosque | null;
  program: ProgramWithTeacher | null;
  details: ProgramDetails | null;
  outcomes: ProgramOutcome[];
  contentSections: ProgramContentSection[];
  faqs: ProgramFaq[];
  mediaItems: ProgramMedia[];
  tracks: ProgramTrack[];
  accountType: string | null;
  childStatuses: Record<string, { enrolled: boolean; requestStatus: string | null }>;
  requestStatus: string | null;
  isEnrolled: boolean;
  isStaffForProgram: boolean;
  enrolledCount: number | null;
  enrolledCountByTrackId: Record<string, number>;
  error: string | null;
};

const emptyProgramDetailSnapshot: ProgramDetailSnapshot = {
  mosque: null,
  program: null,
  details: null,
  outcomes: [],
  contentSections: [],
  faqs: [],
  mediaItems: [],
  tracks: [],
  accountType: null,
  childStatuses: {},
  requestStatus: null,
  isEnrolled: false,
  isStaffForProgram: false,
  enrolledCount: null,
  enrolledCountByTrackId: {},
  error: null,
};

// A single RPC round-trip instead of the sequential mosque -> program -> teacher -> [7-way
// batch] -> [5-way user batch] -> parent batch chain this used to run client-side -- each of
// those steps depended on the previous one's result, so under real network latency (not the
// ~0ms of local dev) they added up to multiple seconds. The RPC (get_program_detail_snapshot,
// security invoker) runs the same lookups server-side under the same RLS the client queries
// were already subject to, and returns everything in one response. userId is unused here --
// the RPC derives the caller's identity from auth.uid() itself rather than trusting a
// client-supplied id -- but stays in the signature since it's also used to key the query cache.
async function fetchProgramDetailSnapshot(
  slug: string,
  programId: string,
  section: "public" | "portal" | "teacher",
  userId: string | null,
): Promise<ProgramDetailSnapshot> {
  void userId;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_program_detail_snapshot", {
    p_slug: slug,
    p_program_id: programId,
    p_section: section,
  });

  if (error) {
    return { ...emptyProgramDetailSnapshot, error: error.message };
  }

  const snapshot = data as unknown as Partial<ProgramDetailSnapshot> | null;
  if (!snapshot) {
    return emptyProgramDetailSnapshot;
  }

  return {
    mosque: snapshot.mosque ?? null,
    program: snapshot.program ?? null,
    details: snapshot.details ?? null,
    outcomes: snapshot.outcomes ?? [],
    contentSections: snapshot.contentSections ?? [],
    faqs: snapshot.faqs ?? [],
    mediaItems: snapshot.mediaItems ?? [],
    tracks: snapshot.tracks ?? [],
    accountType: snapshot.accountType ?? null,
    childStatuses: snapshot.childStatuses ?? {},
    requestStatus: snapshot.requestStatus ?? null,
    isEnrolled: Boolean(snapshot.isEnrolled),
    isStaffForProgram: Boolean(snapshot.isStaffForProgram),
    enrolledCount: snapshot.enrolledCount ?? null,
    enrolledCountByTrackId: snapshot.enrolledCountByTrackId ?? {},
    error: snapshot.error ?? null,
  };
}

// Prefers the OS share sheet (same one used for "Add to Home Screen") so a teacher on
// their phone can send the link straight into WhatsApp/Messages/etc.; falls back to a
// clipboard copy anywhere the Web Share API isn't available (most desktop browsers).
async function shareProgramLink(slug: string, programId: string, title: string, setToast: Dispatch<SetStateAction<EditorToastState | null>>) {
  const url = `${window.location.origin}/m/${slug}/programs/${programId}`;

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      // User cancelled the share sheet or it failed silently -- no toast needed either way.
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    setToast({ tone: "success", message: "Link copied to clipboard." });
  } catch {
    setToast({ tone: "error", message: "Could not copy the link." });
  }
}

export function ProgramDetailData({ slug, programId, section = "public" }: { slug: string; programId: string; section?: "public" | "portal" | "teacher" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [program, setProgram] = useState<ProgramWithTeacher | null>(null);
  const [details, setDetails] = useState<ProgramDetails | null>(null);
  const [outcomes, setOutcomes] = useState<ProgramOutcome[]>([]);
  const [contentSections, setContentSections] = useState<ProgramContentSection[]>([]);
  const [faqs, setFaqs] = useState<ProgramFaq[]>([]);
  const [mediaItems, setMediaItems] = useState<ProgramMedia[]>([]);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [childStatuses, setChildStatuses] = useState<Record<string, { enrolled: boolean; requestStatus: string | null }>>({});
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isStaffForProgram, setIsStaffForProgram] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);
  const [enrolledCountByTrackId, setEnrolledCountByTrackId] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    loadCachedSession().then((session) => {
      setIsSignedIn(Boolean(session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const [programDetailSession, setProgramDetailSession] = useState<ReturnType<typeof getCachedSessionSnapshot>>(() => getCachedSessionSnapshot());
  useEffect(() => {
    let cancelled = false;
    loadCachedSession().then((nextSession) => {
      if (!cancelled) {
        setProgramDetailSession(nextSession);
      }
    });
    const unsubscribe = subscribeCachedSession((nextSession) => {
      setProgramDetailSession(nextSession);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const programDetailUserId = programDetailSession?.user.id ?? null;
  const programDetailKey =
    programDetailSession === undefined ? null : `program-detail:${slug}:${programId}:${section}:${programDetailUserId ?? "guest"}`;
  const { data: programDetailSnapshot, loading: programDetailQueryLoading } = useCachedQuery(programDetailKey, () =>
    fetchProgramDetailSnapshot(slug, programId, section, programDetailUserId),
  );

  useEffect(() => {
    if (!programDetailSnapshot) {
      return;
    }
    setMosque(programDetailSnapshot.mosque);
    setProgram(programDetailSnapshot.program);
    setDetails(programDetailSnapshot.details);
    setOutcomes(programDetailSnapshot.outcomes);
    setContentSections(programDetailSnapshot.contentSections);
    setFaqs(programDetailSnapshot.faqs);
    setMediaItems(programDetailSnapshot.mediaItems);
    setTracks(programDetailSnapshot.tracks);
    setAccountType(programDetailSnapshot.accountType);
    setChildStatuses(programDetailSnapshot.childStatuses);
    setRequestStatus(programDetailSnapshot.requestStatus);
    setIsEnrolled(programDetailSnapshot.isEnrolled);
    setIsStaffForProgram(programDetailSnapshot.isStaffForProgram);
    setEnrolledCount(programDetailSnapshot.enrolledCount);
    setEnrolledCountByTrackId(programDetailSnapshot.enrolledCountByTrackId);
    setError(programDetailSnapshot.error);
    setLoading(false);
  }, [programDetailSnapshot]);

  useEffect(() => {
    setLoading(programDetailQueryLoading);
  }, [programDetailQueryLoading]);

  if (loading) {
    return <ProgramDetailLoadingState />;
  }

  if (error) {
    return <EmptyState title="Could not load class" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!mosque || !program) {
    return <EmptyState title="Class not found" text="This class may no longer be available." />;
  }

  const teacherName = details?.instructor_display_name?.trim() || program.teacher?.full_name || "Teacher to be announced";
  const isTeacherContext = section === "teacher";
  const teacherCredentials = details?.instructor_credentials?.trim() ?? "";
  const age = formatAgeRange(program.age_range_text);
  const gender = formatGender(program.audience_gender);
  const schedule = scheduleSummary(program.schedule, program.schedule_notes);
  const primaryTrack = tracks[0] ?? null;
  const locationName = primaryTrack?.location?.trim() || program.location?.trim() || "";
  const locationRoom = primaryTrack?.room?.trim() || program.room?.trim() || "";
  const locationDisplay = locationName ? `${locationName}${locationRoom ? `, ${locationRoom}` : ""}` : "Location will be announced";
  const durationDisplay = program.is_ongoing
    ? program.start_date
      ? `${formatDurationDate(program.start_date)} · Ongoing`
      : "Ongoing"
    : program.start_date && program.end_date
      ? `${formatDurationDate(program.start_date)} – ${formatDurationDate(program.end_date)}`
      : program.start_date
        ? `Starts ${formatDurationDate(program.start_date)}`
        : "Schedule to be announced";
  const billingDurationMonths = program.is_ongoing ? null : programPayInFullDurationMonths(program);
  const registrationState = programRegistrationLabel(program);
  const registrationIsOpen = registrationState.label === "Registration open";
  const registrationDeadlineText = registrationIsOpen
    ? program.registration_deadline_at
      ? `Registration deadline: ${formatFinanceShortDate(program.registration_deadline_at)}`
      : "No registration deadline"
    : "";
  const learningIntro = details?.learning_intro?.trim() ?? "";
  const learningOutcomes = outcomes.map((item) => item.text);
  const hasLearningSection = Boolean(learningIntro) || learningOutcomes.length > 0;
  const descriptionText = program.description?.trim() ?? "";
  const contactPhone = program.contact_phone?.trim() || details?.instructor_contact_phone?.trim() || program.teacher?.teacher_whatsapp_number?.trim() || "";
  const contactEmail = program.contact_email?.trim() ?? "";
  const publicInfoRows = [
    { title: "Topics Covered", body: details?.topics_intro?.trim() ?? "" },
    { title: "Requirements", body: details?.requirements_text?.trim() ?? "" },
    { title: "Policies", body: details?.policies_text?.trim() ?? "" },
  ].filter((row) => row.body);
  const classContent = contentSections;
  const hasContentSection = classContent.length > 0;
  const galleryItems = mediaItems;
  const hasMediaSection = galleryItems.length > 0;
  const viewerHasActiveEnrollment =
    isEnrolled || (accountType === "parent" && Object.values(childStatuses).some((status) => status.enrolled));

  // Capacity is strictly track-specific: a track only counts as full against its
  // own capacity/enrolled-count, and the whole program only reads as full once
  // every track is full (a track with no capacity limit set is never full).
  const capacityFull = tracks.length
    ? tracks.every((track) => track.capacity != null && (enrolledCountByTrackId[track.id] ?? 0) >= track.capacity)
    : program.default_capacity != null && enrolledCount != null && enrolledCount >= program.default_capacity;
  const waitlistAllowed = program.capacity_behavior === "allow_waitlist";

  const applyHref = `/m/${slug}/programs/${programId}/apply`;
  const viewEnrollmentHref = `/m/${slug}/portal/classes`;
  const completePaymentHref = `/m/${slug}/portal/announcements`;
  const detailQuery = searchParams.toString();
  const detailReturnHref = `${pathname}${detailQuery ? `?${detailQuery}` : ""}`;
  const loginHref = `/m/${slug}/login?returnTo=${encodeURIComponent(detailReturnHref)}`;
  const primaryCta = getProgramPrimaryCta({
    fields: toProgramStatusFields(program),
    isSignedIn,
    isEnrolled,
    requestStatus,
    paymentDue: requestStatus === "approved" && !isEnrolled,
    capacityFull,
    waitlistAllowed,
    applyHref,
    viewEnrollmentHref,
    completePaymentHref,
    loginHref,
  });

  return (
    <div className="bg-[var(--workspace)] p-4">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
          <ProgramHero program={program} />
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#17624F]">
              <span>{mosqueSlugLabel(mosque)}</span>
              <span aria-hidden>•</span>
              <span>{age}</span>
              <span aria-hidden>•</span>
              <span>{gender}</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold leading-8 text-[#26323A]">{program.title}</h1>
              {descriptionText ? <p className="mt-2 text-sm leading-7 text-[#52616A]">{descriptionText}</p> : null}
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="space-y-5">
            {hasLearningSection ? (
              <DetailSection title={details?.learning_title?.trim() || "What You Will Learn"}>
                {learningIntro ? <p className="text-sm leading-7 text-[#52616A]">{learningIntro}</p> : null}
                {learningOutcomes.length > 0 ? (
                  <div className={cn("grid gap-3 sm:grid-cols-2", learningIntro ? "mt-5" : "")}>
                    {learningOutcomes.map((item) => (
                      <div key={item} className="flex gap-3 text-sm text-[#26323A]">
                        <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E3F5EE] text-xs font-semibold text-[#228763]">✓</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </DetailSection>
            ) : null}

            {hasContentSection ? (
              <DetailSection title="Class Content">
                <div className="divide-y divide-[#E6ECEF]">
                  {classContent.map((row, index) => (
                    <div key={row.title} className="flex min-h-14 items-center gap-3 py-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0F8FB] text-xs font-medium text-[#2F8FB3]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#26323A]">{row.title}</p>
                        <p className="text-xs text-[#6B747B]">{contentDescription(row)}</p>
                      </div>
                      <span className="rounded-full bg-[#EAF7F1] px-2 py-1 text-xs text-[#228763]">{contentDuration(row)}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            ) : null}

            {publicInfoRows.length ? (
              <DetailSection title="Class Details">
                <div className="divide-y divide-[#E6ECEF]">
                  {publicInfoRows.map((row) => (
                    <div key={row.title} className="py-3 first:pt-0 last:pb-0">
                      <h3 className="text-sm font-semibold text-[#26323A]">{row.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-[#52616A]">{row.body}</p>
                    </div>
                  ))}
                </div>
              </DetailSection>
            ) : null}

            {hasMediaSection ? <ProgramMediaGallery items={galleryItems} /> : null}
          </div>

          <div className="space-y-4 lg:sticky lg:top-24">
            <aside className="rounded-2xl border border-[#C8DCE2] bg-white p-4 shadow-[0_14px_34px_rgba(38,50,58,0.10)]">
              <p className="text-lg font-semibold text-[#26323A]">Program Details</p>
              <div className="mt-3 divide-y divide-[#E6ECEF]">
                <ProgramDetailFact label="Age" value={age} />
                <ProgramDetailFact label="Gender" value={gender} />
                <ProgramDetailFact label="Duration" value={durationDisplay} />
                <ProgramDetailFact label="Location" value={locationDisplay} />
                {program.room_area?.trim() ? <ProgramDetailFact label="Room / Area" value={program.room_area.trim()} /> : null}
                {registrationDeadlineText ? (
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className="text-[#6B747B]">Registration deadline</dt>
                    <dd className={cn("max-w-[55%] text-right font-semibold", program.registration_deadline_at ? "text-[#C0392B]" : "text-[#7B858C]")}>
                      {program.registration_deadline_at ? formatFinanceShortDate(program.registration_deadline_at) : "No registration deadline"}
                    </dd>
                  </div>
                ) : null}
              </div>

              {program.publication_status === "hidden" ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#8A6418]">
                  <span aria-hidden>🔒</span> Private class — shared by direct link only
                </p>
              ) : null}
            </aside>

            <section className="rounded-2xl border border-[#C8DCE2] bg-white p-4 shadow-[0_14px_34px_rgba(38,50,58,0.10)]">
              <p className="text-lg font-semibold text-[#26323A]">Schedule and Pricing</p>
              {program.tax_receipt_policy && program.tax_receipt_policy !== "not_applicable" ? (
                <p className="mt-2 border-l-2 border-[#17624F] pl-3 text-xs leading-5 text-[#52616A]">
                  {program.tax_receipt_policy === "eligible_confirmed"
                    ? `Payments for this class are eligible for an official charitable tax receipt issued by ${mosque.name}.`
                    : `Receipt eligibility is reviewed by ${mosque.name} administration for this class.`}
                </p>
              ) : null}
              <ProgramScheduleOptionsDisplay tracks={tracks} program={program} fallbackSchedule={schedule.full} enrolledCountByTrackId={enrolledCountByTrackId} />
              <ProgramPaymentOptionsDisplay program={program} tracks={tracks} />
             

              <div className="mt-4 border-t border-[#E6ECEF] pt-4">
                {isTeacherContext || isStaffForProgram ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => void shareProgramLink(slug, programId, program.title, setToast)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#17624F] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(23,98,79,0.2)] md:w-auto md:px-10"
                    >
                      <ShareLinkIcon className="h-4 w-4" />
                      Share Class Link
                    </button>
                  </div>
                ) : accountType === "admin" ? (
                  <div className="mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-[#EEF6F8] px-4 text-sm font-semibold text-[#2F6F83] ring-1 ring-[#CFE2E8] md:w-auto md:px-10">
                    Admin Account
                  </div>
                ) : accountType === "teacher" ? (
                  <div className="mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-[#EEF6F8] px-4 text-sm font-semibold text-[#2F6F83] ring-1 ring-[#CFE2E8] md:w-auto md:px-10">
                    Teacher Account
                  </div>
                ) : primaryCta.kind === "pill" ? (
                  <div
                    className={cn(
                      "mt-2 flex min-h-12 w-full items-center justify-center rounded-full px-4 text-sm font-semibold ring-1 md:w-auto md:px-10",
                      primaryCta.tone === "positive"
                        ? "bg-[#E8F7F2] text-[#17624F] ring-[#B9E4D7]"
                        : primaryCta.tone === "warning"
                          ? "bg-[#FFF7E6] text-[#8A5A00] ring-[#F3D28A]"
                          : "bg-[#F6F8F9] text-[#52616A] ring-[#DDE6EA]",
                    )}
                  >
                    {primaryCta.label}
                  </div>
                ) : primaryCta.kind === "disabled" ? (
                  <div className="mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-[#F6F8F9] px-4 text-center text-sm font-semibold text-[#52616A] ring-1 ring-[#DDE6EA] md:w-auto md:px-10">
                    {primaryCta.label}
                  </div>
                ) : (
                  <Link
                    href={primaryCta.href}
                    className="mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold !text-white shadow-[0_10px_22px_rgba(36,139,114,0.24)] transition-colors hover:bg-[#17624F] md:w-auto md:px-10"
                  >
                    {primaryCta.label}
                  </Link>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] bg-[#17624F] p-4 text-white shadow-[0_16px_34px_rgba(23,98,79,0.20)]">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Program Director</p>
              <div className="mt-4 flex flex-col items-center gap-3 text-center">
                <Avatar src={program.teacher?.avatar_url ?? null} name={teacherName} />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-white">{teacherName}</h2>
                </div>
              </div>
              {teacherCredentials ? <p className="mt-4 text-center text-sm leading-7 text-white/82">{teacherCredentials}</p> : null}
              {contactPhone || contactEmail ? (
                <div className="mt-5 space-y-2 rounded-lg bg-white/10 px-4 py-3 text-sm ring-1 ring-white/20">
                  {contactPhone ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/70">Phone</span>
                      <span className="font-semibold text-white">{contactPhone}</span>
                    </div>
                  ) : null}
                  {contactEmail ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/70">Email</span>
                      <span className="font-semibold text-white">{contactEmail}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            {faqs.length ? <ProgramFaqSection faqs={faqs} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type ProgramApplyDetailSnapshot = {
  mosque: Mosque | null;
  program: Program | null;
  tracks: ProgramTrack[];
  enrolledCountByTrackId: Record<string, number>;
  accountType: string | null;
  selfProfile: StudentDisplay | null;
  parentChildren: StudentDisplay[];
  childStatuses: Record<string, { enrolled: boolean; requestStatus: string | null }>;
  requestStatus: string | null;
  isEnrolled: boolean;
  error: string | null;
};

const emptyProgramApplyDetailSnapshot: ProgramApplyDetailSnapshot = {
  mosque: null,
  program: null,
  tracks: [],
  enrolledCountByTrackId: {},
  accountType: null,
  selfProfile: null,
  parentChildren: [],
  childStatuses: {},
  requestStatus: null,
  isEnrolled: false,
  error: null,
};

// One RPC call instead of mosque -> program -> tracks -> active-enrollments ->
// enrollment_tracks -> [user-scoped batch] -> [parent-scoped batch], as up to eight
// sequential stages for a parent account. Same shape as get_program_detail_snapshot, applied
// to the apply-flow's own fetch.
async function fetchProgramApplyDetail(slug: string, programId: string, userId: string | null): Promise<ProgramApplyDetailSnapshot> {
  void userId;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_program_apply_snapshot", { p_slug: slug, p_program_id: programId });
  if (error) {
    return { ...emptyProgramApplyDetailSnapshot, error: error.message };
  }

  const snapshot = data as unknown as Partial<ProgramApplyDetailSnapshot & { children: StudentDisplay[] }> | null;
  if (!snapshot) {
    return emptyProgramApplyDetailSnapshot;
  }

  return {
    mosque: snapshot.mosque ?? null,
    program: snapshot.program ?? null,
    tracks: snapshot.tracks ?? [],
    enrolledCountByTrackId: snapshot.enrolledCountByTrackId ?? {},
    accountType: snapshot.accountType ?? null,
    selfProfile: snapshot.selfProfile ?? null,
    parentChildren: snapshot.children ?? [],
    childStatuses: snapshot.childStatuses ?? {},
    requestStatus: snapshot.requestStatus ?? null,
    isEnrolled: Boolean(snapshot.isEnrolled),
    error: snapshot.error ?? null,
  };
}

export function ProgramApplyData({ slug, programId }: { slug: string; programId: string }) {
  const router = useRouter();
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [enrolledCountByTrackId, setEnrolledCountByTrackId] = useState<Record<string, number>>({});
  const [accountType, setAccountType] = useState<string | null>(null);
  const [selfProfile, setSelfProfile] = useState<StudentDisplay | null>(null);
  const [parentChildren, setParentChildren] = useState<StudentDisplay[]>([]);
  const [childStatuses, setChildStatuses] = useState<Record<string, { enrolled: boolean; requestStatus: string | null }>>({});
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType>("monthly");
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [applySession, setApplySession] = useState<ReturnType<typeof getCachedSessionSnapshot>>(() => getCachedSessionSnapshot());
  useEffect(() => {
    let cancelled = false;
    loadCachedSession().then((nextSession) => {
      if (!cancelled) {
        setApplySession(nextSession);
      }
    });
    const unsubscribe = subscribeCachedSession((nextSession) => {
      setApplySession(nextSession);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const isSignedIn = Boolean(applySession);
  const currentUserId = applySession?.user.id ?? null;
  const applyKey = applySession === undefined ? null : `program-apply:${slug}:${programId}:${currentUserId ?? "guest"}`;
  const { data: applySnapshot, loading: applyQueryLoading } = useCachedQuery(applyKey, () => fetchProgramApplyDetail(slug, programId, currentUserId));

  const hasAppliedDefaultsRef = useRef(false);
  useEffect(() => {
    if (!applySnapshot) {
      return;
    }
    setMosque(applySnapshot.mosque);
    setProgram(applySnapshot.program);
    setTracks(applySnapshot.tracks);
    setEnrolledCountByTrackId(applySnapshot.enrolledCountByTrackId);
    setAccountType(applySnapshot.accountType);
    setSelfProfile(applySnapshot.selfProfile);
    setParentChildren(applySnapshot.parentChildren);
    setChildStatuses(applySnapshot.childStatuses);
    setRequestStatus(applySnapshot.requestStatus);
    setIsEnrolled(applySnapshot.isEnrolled);
    setError(applySnapshot.error);
    setLoading(false);

    // Only seed the user's track/payment-type selection from the fetched defaults on the
    // first successful load — a later background revalidation (e.g. while the student is
    // mid-form) must never clobber a selection they've already made.
    if (!hasAppliedDefaultsRef.current && applySnapshot.program) {
      hasAppliedDefaultsRef.current = true;
      setSelectedTrackIds(applySnapshot.tracks[0]?.id ? [applySnapshot.tracks[0].id] : []);
      setSelectedPaymentType(programOfferedPaymentTypes(applySnapshot.program)[0] ?? "monthly");
    }
  }, [applySnapshot]);

  useEffect(() => {
    setLoading(applyQueryLoading);
  }, [applyQueryLoading]);

  useEffect(() => {
    if (!loading && !error && mosque && program && !isSignedIn) {
      const returnTo = `/m/${slug}/programs/${programId}/apply`;
      router.replace(`/m/${slug}/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [loading, error, mosque, program, isSignedIn, router, slug, programId]);

  if (loading) {
    return <ProgramDetailLoadingState />;
  }

  if (error) {
    return <EmptyState title="Could not load application" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!mosque || !program) {
    return <EmptyState title="Class not found" text="This class may no longer be available." />;
  }

  const programHref = `/m/${slug}/programs/${programId}`;

  if (!isSignedIn) {
    return <ProgramDetailLoadingState />;
  }

  const applicationState = getApplicationButtonState(toProgramStatusFields(program));
  const canApply = applicationState.type === "open" || applicationState.type === "waitlist";
  const parentApplicantProfiles = accountType === "parent" ? [selfProfile, ...parentChildren].filter((profile): profile is StudentDisplay => Boolean(profile?.id)) : [];
  const parentApplicantStatuses =
    accountType === "parent" && currentUserId
      ? {
          ...childStatuses,
          [currentUserId]: { enrolled: isEnrolled, requestStatus },
        }
      : childStatuses;
  const selfEligibility = accountType === "student" ? isProfileEligibleForProgram(selfProfile, program) : { eligible: true, reason: null };

  async function submitApplication() {
    if (!currentUserId || !mosque || !program) {
      return;
    }
    setSubmitBusy(true);
    setSubmitError(null);

    if (!canApply) {
      setSubmitError(applicationState.label);
      setSubmitBusy(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const submittedAt = new Date().toISOString();
    const trackValidation = validateTrackSelection(program, tracks, selectedTrackIds);
    if (!trackValidation.valid) {
      setSubmitError(trackValidation.message);
      setSubmitBusy(false);
      return;
    }
    const primaryTrackId = selectedTrackIds[0] ?? null;

    if (accountType === "teacher") {
      setSubmitError("Teacher accounts cannot apply to classes.");
      setSubmitBusy(false);
      return;
    }

    if (accountType === "parent") {
      const requestableStudentIds = selectedChildIds.filter((studentId) => {
        const status = parentApplicantStatuses[studentId];
        const applicant = studentId === currentUserId ? selfProfile : parentChildren.find((item) => item.id === studentId);
        return Boolean(applicant) && isProfileEligibleForProgram(applicant, program).eligible && !status?.enrolled && status?.requestStatus !== "pending" && status?.requestStatus !== "waitlisted";
      });

      if (requestableStudentIds.length === 0) {
        setSubmitError("Select at least one eligible student who is not already enrolled, pending review, or waitlisted.");
        setSubmitBusy(false);
        return;
      }

      const { data: parentRequestRows, error: parentInsertError } = await supabase
        .from("enrollment_requests")
        .upsert(
          requestableStudentIds.map((studentId) => ({
            mosque_id: mosque.id,
            program_id: program.id,
            program_track_id: primaryTrackId,
            student_profile_id: studentId,
            parent_profile_id: studentId === currentUserId ? null : currentUserId,
            status: "pending",
            requested_at: submittedAt,
            reviewed_by: null,
            reviewed_at: null,
            review_note: null,
            decision_note: null,
            payment_type: selectedPaymentType,
            approved_price_monthly_cents: null,
            approved_price_annual_cents: null,
            payment_bypassed: false,
            admission_completed_at: null,
            student_dismissed_at: null,
            teacher_dismissed_at: null,
          })),
          { onConflict: "program_id,student_profile_id" },
        )
        .select("id, student_profile_id");

      if (parentInsertError) {
        setSubmitError(parentInsertError.message);
        setSubmitBusy(false);
        return;
      }
      const parentRequestIds = (parentRequestRows ?? []).map((row) => row.id);
      if (parentRequestIds.length) {
        const { error: timestampError } = await supabase.from("enrollment_requests").update({ requested_at: submittedAt, teacher_dismissed_at: null }).in("id", parentRequestIds);
        if (timestampError) {
          setSubmitError(timestampError.message);
          setSubmitBusy(false);
          return;
        }
      }
      const trackWriteError = await replaceEnrollmentRequestTracks(
        supabase,
        parentRequestIds,
        selectedTrackIds,
      );
      if (trackWriteError) {
        setSubmitError(trackWriteError);
        setSubmitBusy(false);
        return;
      }

      queueEnrollmentRequestSubmittedEmails(parentRequestIds);
      invalidateQuery(`student-applications:${slug}:${currentUserId}`);
      invalidateQueryPrefix(`program-detail:${slug}:${programId}:`);
      window.dispatchEvent(new Event("tareeqah:notifications-changed"));
      if (applyKey) {
        invalidateQuery(applyKey);
      }
      setSubmittedCount(requestableStudentIds.length);
      setSubmitted(true);
      setSubmitBusy(false);
      return;
    }

    const eligibility = isProfileEligibleForProgram(selfProfile, program);
    if (!eligibility.eligible) {
      setSubmitError(eligibility.reason ?? "This class is not available for this profile.");
      setSubmitBusy(false);
      return;
    }

    const { data: requestRows, error: insertError } = await supabase
      .from("enrollment_requests")
      .upsert(
        {
          mosque_id: mosque.id,
          program_id: program.id,
          program_track_id: primaryTrackId,
          student_profile_id: currentUserId,
          parent_profile_id: null,
          status: "pending",
          requested_at: submittedAt,
          reviewed_by: null,
          reviewed_at: null,
          review_note: null,
          decision_note: null,
          payment_type: selectedPaymentType,
          approved_price_monthly_cents: null,
          approved_price_annual_cents: null,
          payment_bypassed: false,
          admission_completed_at: null,
          student_dismissed_at: null,
          teacher_dismissed_at: null,
        },
        { onConflict: "program_id,student_profile_id" },
      )
      .select("id");

    if (insertError) {
      setSubmitError(insertError.message);
      setSubmitBusy(false);
      return;
    }
    const requestIds = (requestRows ?? []).map((row) => row.id);
    if (requestIds.length) {
      const { error: timestampError } = await supabase.from("enrollment_requests").update({ requested_at: submittedAt, teacher_dismissed_at: null }).in("id", requestIds);
      if (timestampError) {
        setSubmitError(timestampError.message);
        setSubmitBusy(false);
        return;
      }
    }
    const trackWriteError = await replaceEnrollmentRequestTracks(supabase, requestIds, selectedTrackIds);
    if (trackWriteError) {
      setSubmitError(trackWriteError);
      setSubmitBusy(false);
      return;
    }

    queueEnrollmentRequestSubmittedEmails(requestIds);
    invalidateQuery(`student-applications:${slug}:${currentUserId}`);
    invalidateQueryPrefix(`program-detail:${slug}:${programId}:`);
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    if (applyKey) {
      invalidateQuery(applyKey);
    }
    setSubmittedCount(1);
    setSubmitted(true);
    setSubmitBusy(false);
  }

  if (submitted) {
    return (
      <div className="bg-[var(--workspace)] p-4">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-[28px] bg-white p-6 text-center shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F7F2] text-2xl text-[#17624F]">✓</div>
            <h1 className="mt-4 text-xl font-semibold text-[#26323A]">Application submitted</h1>
            <p className="mt-2 text-sm leading-6 text-[#52616A]">
              {submittedCount > 1 ? `${submittedCount} applications have` : "Your application has"} been sent to {program.title}. Administration will review your application, and you can track its status from your inbox.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href={programHref} className="flex min-h-11 items-center justify-center rounded-full border border-[#D6DCE0] px-5 text-sm font-semibold text-[#26323A]">
                Back to Program
              </Link>
              <Link href={`/m/${slug}/portal/classes?tab=applications`} className="flex min-h-11 items-center justify-center rounded-full bg-[#17624F] px-5 text-sm font-semibold !text-white">
                My Applications
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const blockedMessage = isEnrolled
    ? "You're already enrolled in this class."
    : requestStatus === "pending"
      ? "Your application is pending review."
      : requestStatus === "waitlisted"
        ? "You're on the waitlist for this class."
        : accountType === "student" && !selfEligibility.eligible
          ? (selfEligibility.reason ?? "This class is not available for this profile.")
          : !canApply
            ? applicationState.label
            : null;

  const offeredPaymentTypes = programOfferedPaymentTypes(program);
  const selectedTracks = tracks.filter((track) => selectedTrackIds.includes(track.id));
  const selectedTrackNames = selectedTracks.map((track) => track.name).join(", ");
  const summaryPrice = tracks.length > 0 ? trackPriceLine(selectedTracks[0] ?? null, program, selectedPaymentType) : trackPriceLine(null, program, selectedPaymentType);

  return (
    <div className="bg-[var(--workspace)] p-4">
      <div className="mx-auto max-w-xl space-y-5">
        <section className="rounded-[24px] bg-white p-4 shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
          <div className="flex items-center gap-3">
            {program.thumbnail_url ? (
              <img src={program.thumbnail_url} alt="" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-[#EEF6F7] text-[#17624F]">📘</div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{mosqueSlugLabel(mosque)}</p>
              <h1 className="truncate text-lg font-semibold text-[#26323A]">{program.title}</h1>
            </div>
          </div>
        </section>

        {blockedMessage ? (
          <section className="rounded-[24px] bg-white p-5 text-sm leading-6 text-[#52616A] shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
            {blockedMessage}
          </section>
        ) : accountType === "teacher" ? (
          <section className="rounded-[24px] bg-white p-5 text-sm leading-6 text-[#52616A] shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
            Teacher accounts cannot apply to classes.
          </section>
        ) : (
          <>
            {accountType === "parent" ? (
              <DetailSection title="Choose student">
                <ChildEnrollmentSelector
                  program={program}
                  childrenProfiles={parentApplicantProfiles}
                  statuses={parentApplicantStatuses}
                  selfProfileId={currentUserId}
                  selectedChildIds={selectedChildIds}
                  onToggle={(childId) =>
                    setSelectedChildIds((current) => (current.includes(childId) ? current.filter((id) => id !== childId) : [...current, childId]))
                  }
                />
              </DetailSection>
            ) : null}

            {offeredPaymentTypes.length > 1 ? (
              <DetailSection title="Choose payment plan">
                <ProgramPaymentOptionSelector program={program} selectedPaymentType={selectedPaymentType} onChange={setSelectedPaymentType} />
              </DetailSection>
            ) : null}

            {tracks.length > 0 ? (
              <DetailSection title="Choose schedule">
                <ProgramTrackSelector
                  tracks={tracks}
                  selectedTrackIds={selectedTrackIds}
                  program={program}
                  enrolledCountByTrackId={enrolledCountByTrackId}
                  selectedPaymentType={selectedPaymentType}
                  onToggle={(trackId) => setSelectedTrackIds((current) => nextProgramTrackSelection(program, tracks, current, trackId))}
                />
              </DetailSection>
            ) : program.is_paid ? (
              <DetailSection title="Price">
                <div className="flex flex-col items-end gap-1 text-right">
                  <TrackPriceNumber price={trackPriceLine(null, program, selectedPaymentType, { bareLabel: true })} />
                  <TrackPricingDealCaption track={null} program={program} paymentType={selectedPaymentType} />
                  <TrackPayInFullPriceCaption track={null} program={program} />
                </div>
              </DetailSection>
            ) : null}

            {program.is_paid || tracks.length > 0 ? (
              <DetailSection title="Summary">
                <div className="grid gap-2 rounded-[14px] bg-[#F7FAFB] p-3 text-sm ring-1 ring-[#E6ECEF]">
                  {tracks.length > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#6B747B]">Schedule</span>
                      <span className="font-semibold text-[#26323A]">{selectedTrackNames || "No schedule selected yet"}</span>
                    </div>
                  ) : null}
                  {program.is_paid ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#6B747B]">Payment plan</span>
                      <span className="font-semibold text-[#26323A]">{summaryPrice?.label ?? "—"}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#6B747B]">Start date</span>
                    <span className="font-semibold text-[#26323A]">{formatApplicationSummaryStartDate(program)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#6B747B]">End date</span>
                    <span className="font-semibold text-[#26323A]">
                      {program.is_ongoing || !program.end_date ? "Ongoing until further notice" : formatFinanceShortDate(program.end_date)}
                    </span>
                  </div>
                </div>
              </DetailSection>
            ) : null}

            <DetailSection title="Review & Submit">
              <p className="text-sm leading-6 text-[#52616A]">
                Administration will review your application after you submit it. You&apos;ll be notified once a decision is made.
              </p>
              {submitError ? <p className="mt-3 text-sm font-semibold text-[#C0392B]">{submitError}</p> : null}
              <button
                type="button"
                onClick={submitApplication}
                disabled={submitBusy || (accountType === "parent" && selectedChildIds.length === 0)}
                className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold !text-white shadow-[0_10px_22px_rgba(36,139,114,0.24)] transition-colors hover:bg-[#17624F] disabled:opacity-60 md:w-auto md:px-10"
              >
                {submitBusy ? "Submitting..." : "Submit Application"}
              </button>
            </DetailSection>
          </>
        )}
      </div>
    </div>
  );
}

type ConfirmationState = "payment_required_monthly" | "payment_required_annual" | "payment_required_annual_subscription" | "no_payment_required" | "completed" | "blocked";

function getConfirmationState(request: EnrollmentRequest, program: Program): ConfirmationState {
  if (request.admission_completed_at) {
    return "completed";
  }
  if (request.status !== "approved") {
    return "blocked";
  }
  if (!program.is_paid || request.payment_bypassed) {
    return "no_payment_required";
  }
  if (request.payment_type !== "annual") {
    return "payment_required_monthly";
  }
  // An ongoing program's "annual" is a recurring yearly subscription, not the one-time
  // pay-in-full lump sum a fixed-duration program's "annual" is — see payment-terms.ts.
  return program.is_ongoing ? "payment_required_annual_subscription" : "payment_required_annual";
}

export function RegistrationConfirmationData({ slug, requestId }: { slug: string; requestId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [request, setRequest] = useState<EnrollmentRequest | null>(null);
  const [track, setTrack] = useState<ProgramTrack | null>(null);
  const [student, setStudent] = useState<Pick<Profile, "id" | "full_name" | "email"> | null>(null);
  const [parent, setParent] = useState<Pick<Profile, "id" | "full_name" | "email"> | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmedResult, setConfirmedResult] = useState<"success" | "cancelled" | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelModalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(cancelModalRef, cancelModalOpen, () => setCancelModalOpen(false));

  // One RPC call instead of mosque -> request -> can_manage_program check -> [program+track+
  // student+parent batch], as four sequential stages. Reuses the existing can_manage_program()
  // permission check server-side.
  async function loadRegistration() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const session = await loadCachedSession();
    const userId = session?.user.id ?? null;
    if (!userId) {
      const returnTo = `/m/${slug}/registration/${requestId}`;
      router.replace(`/m/${slug}/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    const { data, error } = await supabase.rpc("get_registration_confirmation_snapshot", { p_slug: slug, p_request_id: requestId });
    if (error) {
      setError(friendlyErrorMessage(error, "This registration could not be found."));
      setLoading(false);
      return;
    }

    const snapshot = data as unknown as {
      error: string | null;
      mosque: Mosque | null;
      request: EnrollmentRequest | null;
      program: Program | null;
      track: ProgramTrack | null;
      student: Pick<Profile, "id" | "full_name" | "email"> | null;
      parent: Pick<Profile, "id" | "full_name" | "email"> | null;
    } | null;

    if (!snapshot || snapshot.error || !snapshot.mosque || !snapshot.request || !snapshot.program) {
      setError(snapshot?.error ?? "This registration could not be found.");
      setLoading(false);
      return;
    }

    setMosque(snapshot.mosque);
    setProgram(snapshot.program);
    setRequest(snapshot.request);
    setTrack(snapshot.track ?? null);
    setStudent(snapshot.student ?? null);
    setParent(snapshot.parent ?? null);
    setLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRegistration();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, slug]);

  async function confirmPaidSession(sessionId: string) {
    setConfirmBusy(true);
    const token = await getCurrentAccessToken();
    if (!token) {
      setConfirmBusy(false);
      return;
    }
    await fetch("/api/stripe/confirm", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ checkoutSessionId: sessionId }),
    });
    await loadRegistration();
    setConfirmBusy(false);
  }

  useEffect(() => {
    const result = searchParams.get("result");
    const sessionId = searchParams.get("session_id");
    if (result !== "success" && result !== "cancelled") {
      return;
    }
    const timeout = window.setTimeout(() => {
      setConfirmedResult(result);
      router.replace(`/m/${slug}/registration/${requestId}`, { scroll: false });
      if (result === "success" && sessionId) {
        void confirmPaidSession(sessionId);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleStartCheckout() {
    setCheckoutBusy(true);
    setActionError(null);
    const token = await getCurrentAccessToken();
    if (!token) {
      setCheckoutBusy(false);
      setActionError("Please sign in again.");
      return;
    }
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ enrollmentRequestId: requestId }),
    });
    const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setCheckoutBusy(false);
      setActionError(result.error ?? "Could not start checkout.");
      return;
    }
    window.location.href = result.url;
  }

  async function handleConfirmFree() {
    if (!program) {
      return;
    }
    setConfirmBusy(true);
    setActionError(null);
    const result = await callApplicationAction(program.id, requestId, "confirm", {});
    if (!result.ok) {
      setConfirmBusy(false);
      setActionError(result.error);
      return;
    }
    // Stay in the loading state through the refetch too, not just the initial request — the
    // button should read "Please wait..." until the page has actually flipped to "completed".
    await loadRegistration();
    setConfirmBusy(false);
  }

  async function handleCancelRegistration() {
    if (!program) {
      return;
    }
    setCancelBusy(true);
    setCancelError(null);
    const result = await callApplicationAction(program.id, requestId, "cancel-registration", { reason: cancelReason.trim() });
    setCancelBusy(false);
    if (!result.ok) {
      setCancelError(result.error);
      return;
    }
    setCancelModalOpen(false);
    void loadRegistration();
  }

  if (loading) {
    return <ProgramDetailLoadingState />;
  }

  if (error) {
    return <EmptyState title="Registration unavailable" text={error} />;
  }

  if (!mosque || !program || !request) {
    return <EmptyState title="Registration not found" text="This registration could not be loaded." />;
  }

  const state = getConfirmationState(request, program);
  const schedule = track ? scheduleSummary(track.schedule, null) : scheduleSummary(program.schedule, program.schedule_notes);
  const location = track?.location || program.location || "Location will be announced";
  const durationLabel = program.is_ongoing
    ? "Ongoing — continues until ended"
    : program.start_date && program.end_date
      ? `${formatDurationDate(program.start_date)} – ${formatDurationDate(program.end_date)}`
      : "Dates to be announced";
  const listedPriceCents = request.payment_type === "annual" ? request.approved_price_annual_cents : request.approved_price_monthly_cents;
  const listedPrice = request.payment_bypassed ? "Waived" : listedPriceCents != null ? formatPrice(listedPriceCents) : "Payment terms not set";
  const programHref = `/m/${slug}/programs/${program.id}`;

  return (
    <div className="bg-[var(--workspace)] p-4">
      <div className="mx-auto max-w-xl space-y-5">
        <section className="rounded-[24px] bg-white p-5 shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{mosqueSlugLabel(mosque)}</p>
          <h1 className="mt-1 text-xl font-semibold text-[#26323A]">{program.title}</h1>
        </section>

        {confirmedResult === "cancelled" ? (
          <section className="rounded-[20px] border border-[#F3D28A] bg-[#FFF7E6] p-4 text-sm leading-6 text-[#8A5A00]">
            Payment was not completed. Your existing registration status is unchanged — you can try again below.
          </section>
        ) : null}

        {state === "blocked" ? (
          <section className="rounded-[24px] bg-white p-6 text-center shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
            <p className="text-sm leading-6 text-[#52616A]">
              {request.status === "cancelled" ? "This application is no longer available for confirmation." : "This registration link is no longer active."}
            </p>
            <Link href={programHref} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#D6DCE0] px-5 text-sm font-semibold text-[#26323A]">
              Back to Program
            </Link>
          </section>
        ) : (
          <>
            <section className="space-y-3 rounded-[24px] bg-white p-5 shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6B747B]">Registration Summary</h2>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Student</span>
                  <span className="font-semibold text-[#26323A]">{student?.full_name || student?.email || "Student"}</span>
                </div>
                {parent ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Parent/Guardian</span>
                    <span className="font-semibold text-[#26323A]">{parent.full_name || parent.email}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Track/Schedule</span>
                  <span className="font-semibold text-[#26323A]">{track ? track.name : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Schedule</span>
                  <span className="font-semibold text-[#26323A]">{schedule.full}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Location</span>
                  <span className="font-semibold text-[#26323A]">{location}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Duration</span>
                  <span className="font-semibold text-[#26323A]">{durationLabel}</span>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-[24px] bg-white p-5 shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6B747B]">Payment</h2>
              {state === "completed" ? (
                <p className="text-sm leading-6 text-[#52616A]">Registration completed.</p>
              ) : state === "no_payment_required" ? (
                <p className="text-sm leading-6 text-[#52616A]">Your registration has been approved. No payment is required.</p>
              ) : state === "payment_required_annual" ? (
                <p className="text-sm leading-6 text-[#52616A]">{program.is_ongoing ? `Your registration has been approved. Start the annual subscription to complete registration — ${listedPrice} per year.` : `Your registration has been approved. Pay in full to complete registration — ${listedPrice} once, covering the full program.`}</p>
              ) : state === "payment_required_annual_subscription" ? (
                <p className="text-sm leading-6 text-[#52616A]">Your registration has been approved. Start your annual subscription to complete registration — {listedPrice}/year, renews automatically until cancelled.</p>
              ) : (
                <p className="text-sm leading-6 text-[#52616A]">Your registration has been approved. Start your monthly subscription to complete registration — {listedPrice}/month.</p>
              )}
              {state !== "completed" ? (
                <div className="rounded-[14px] bg-[#F7FAFB] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Amount</span>
                    <span className="font-semibold text-[#26323A]">{listedPrice}</span>
                  </div>
                </div>
              ) : null}
            </section>

            {state !== "completed" ? (
              <section className="rounded-[24px] bg-white p-5 shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
                <label className="flex items-start gap-3 text-sm leading-6 text-[#52616A]">
                  <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1" />
                  I have reviewed the above and confirm all program/payment information are correct.
                </label>
                {actionError ? <p className="mt-3 text-sm font-semibold text-[#C0392B]">{actionError}</p> : null}
                <button
                  type="button"
                  disabled={!agreed || checkoutBusy || confirmBusy}
                  onClick={state === "no_payment_required" ? handleConfirmFree : handleStartCheckout}
                  className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold !text-white shadow-[0_10px_22px_rgba(36,139,114,0.24)] transition-colors hover:bg-[#17624F] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto md:px-10"
                >
                  {checkoutBusy || confirmBusy
                    ? "Please wait..."
                    : state === "no_payment_required"
                      ? "Confirm Registration"
                      : state === "payment_required_annual"
                        ? program.is_ongoing ? "Start Annual Subscription" : "Pay in Full"
                        : "Start Subscription"}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(true)}
                  className="mt-3 flex min-h-10 w-full items-center justify-center text-sm font-semibold text-[#C0392B] hover:underline md:w-auto md:mx-auto"
                >
                  Cancel Registration
                </button>
              </section>
            ) : (
              <section className="rounded-[24px] bg-white p-6 text-center shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F7F2] text-2xl text-[#17624F]">✓</div>
                <p className="mt-4 text-sm leading-6 text-[#52616A]">{student?.full_name || "This student"} is enrolled in {program.title}.</p>
                <p className="mt-3 text-xs leading-5 text-[#8A949B]">Tap Close above to continue.</p>
              </section>
            )}
          </>
        )}
      </div>
      {cancelModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
              <div ref={cancelModalRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[24px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
                <h2 className="text-lg font-semibold">Cancel Registration</h2>
                <p className="mt-2 text-sm leading-6 text-[#6B747B]">
                  This will cancel this application. If you change your mind, you will need to apply again.
                </p>
                <label className="mt-4 grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">
                  Reason (optional)
                  <textarea
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    disabled={cancelBusy}
                    rows={3}
                    placeholder="Let us know why you're cancelling"
                    className="rounded-[10px] border border-[#B9C3C8] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:opacity-60"
                  />
                </label>
                {cancelError ? <p className="mt-3 text-sm font-semibold text-[#C0392B]">{cancelError}</p> : null}
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCancelModalOpen(false);
                      setCancelError(null);
                    }}
                    disabled={cancelBusy}
                    className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]"
                  >
                    Never mind
                  </button>
                  <button
                    type="button"
                    disabled={cancelBusy}
                    onClick={handleCancelRegistration}
                    className="min-h-10 rounded-[10px] bg-[#C0392B] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  >
                    {cancelBusy ? "Cancelling..." : "Cancel Registration"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type StudentClassesTab = "classes" | "applications" | "browse";

function parseStudentClassesTab(value: string | null): StudentClassesTab {
  if (value === "browse") {
    return "browse";
  }
  if (value === "applications") {
    return "applications";
  }
  return "classes";
}

export function StudentClassesData({ slug }: { slug: string }) {
  const { mosque, programs, enrolledProgramIds, loading, enrollmentLoading, error } = useStudentPrograms(slug);
  const { rows: applicationRows, loading: applicationsLoading, reload: reloadApplications } = useApplicantApplications(slug);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<StudentClassesTab>(parseStudentClassesTab(searchParams.get("tab")));
  const [detailsRow, setDetailsRow] = useState<ApplicantApplicationRow | null>(null);
  const [rescindTarget, setRescindTarget] = useState<ApplicantApplicationRow | null>(null);
  const [rescindBusy, setRescindBusy] = useState(false);
  const requestDeepLinkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    setTab(parseStudentClassesTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (loading || error || !programs.length) {
      return;
    }
    let cancelled = false;
    // Warm the cache for each visible class so opening one from the portal is instant --
    // keyed "portal" to match the section PortalProgramDetailPage actually renders with,
    // not "public" (a mismatched key here would prefetch data nothing ever reads).
    loadCachedSession().then((session) => {
      if (cancelled) {
        return;
      }
      const userId = session?.user.id ?? null;
      for (const program of programs.slice(0, 6)) {
        prefetchQuery(`program-detail:${slug}:${program.id}:portal:${userId ?? "guest"}`, () => fetchProgramDetailSnapshot(slug, program.id, "portal", userId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loading, error, programs, slug]);

  useEffect(() => {
    if (applicationsLoading) {
      return;
    }
    const requestId = searchParams.get("requestId");
    if (!requestId || requestDeepLinkHandledRef.current === requestId) {
      return;
    }
    const row = applicationRows.find((item) => item.request.id === requestId);
    if (!row) {
      return;
    }
    requestDeepLinkHandledRef.current = requestId;
    setDetailsRow(row);
  }, [applicationRows, applicationsLoading, searchParams]);

  async function confirmRescindApplicantRequest() {
    if (!rescindTarget) {
      return;
    }
    setRescindBusy(true);
    const { error: rescindError } = await createSupabaseBrowserClient()
      .from("enrollment_requests")
      .update({ status: "cancelled", student_dismissed_at: new Date().toISOString() })
      .eq("id", rescindTarget.request.id);
    setRescindBusy(false);
    if (rescindError) {
      return;
    }
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    setRescindTarget(null);
    setDetailsRow(null);
    void reloadApplications();
  }

  function changeClassesTab(nextTab: StudentClassesTab) {
    setTab(nextTab);
    router.replace(`/m/${slug}/portal/classes?tab=${nextTab}`, { scroll: false });
  }

  const enrolledPrograms = programs.filter((program) => enrolledProgramIds.includes(program.id));
  const browsePrograms = programs;
  const applicationStatusByProgramId = useMemo(() => {
    const map: Record<string, ApplicantApplicationRow> = {};
    for (const row of applicationRows) {
      const existing = map[row.request.program_id];
      if (!existing || Date.parse(row.request.requested_at) > Date.parse(existing.request.requested_at)) {
        map[row.request.program_id] = row;
      }
    }
    return map;
  }, [applicationRows]);

  let content: ReactNode;
  if (loading || enrollmentLoading || (tab === "applications" && applicationsLoading)) {
    content = <ClassesLoadingPlaceholders count={tab === "browse" ? 2 : 1} />;
  } else if (error) {
    content = <EmptyState title="Could not load classes" text={error} onRetry={() => window.location.reload()} />;
  } else if (!mosque) {
    content = <EmptyState title="Masjid not found" text="Classes could not be loaded for this masjid." />;
  } else if (tab === "classes") {
    content =
      enrolledPrograms.length === 0 ? (
        <EmptyState title="You are not enrolled in any classes" text="Browse available classes to find a program." />
      ) : (
        <EnrolledClassList programs={enrolledPrograms} mosqueSlug={mosque.slug} />
      );
  } else if (tab === "applications") {
    content =
      applicationRows.length === 0 ? (
        <EmptyState title="You have not submitted any applications" text="Applications you submit will appear here with their status." />
      ) : (
        <MyApplicationsList slug={slug} rows={applicationRows} onViewDetails={setDetailsRow} />
      );
  } else {
    content = (
      <ProgramCardGrid
        programs={browsePrograms}
        mosqueSlug={mosque.slug}
        emptyText="No available classes to browse right now."
        enrolledProgramIds={enrolledProgramIds}
        detailBaseHref={`/m/${mosque.slug}/portal/classes`}
        applicationStatusByProgramId={applicationStatusByProgramId}
      />
    );
  }

  return (
    <section className="bg-[var(--workspace)]">
      <div className="flex justify-center gap-7 border-b border-[#D6DCE0] px-4 md:hidden">
        {(
          [
            ["classes", "My Classes"],
            ["browse", "Browse"],
            ["applications", "Applications"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => changeClassesTab(id)}
            className={cn(
              "flex min-h-12 shrink-0 flex-col items-center justify-center gap-2 text-center text-sm font-medium leading-none",
              tab === id ? "text-[#2F8FB3]" : "text-[#6B747B]",
            )}
          >
            <span>{label}</span>
            <span className={cn("h-px w-full min-w-12 rounded-full", tab === id ? "bg-[#2F8FB3]" : "bg-transparent")} aria-hidden />
          </button>
        ))}
      </div>
      <div className="hidden gap-2 border-b border-[#D6DCE0] px-4 py-3 md:flex">
        {(
          [
            ["classes", "My Classes"],
            ["browse", "Browse Classes"],
            ["applications", "My Applications"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => changeClassesTab(id)}
            className={cn(
              "min-h-9 rounded-full px-4 text-sm font-semibold transition-colors",
              tab === id ? "bg-[#17624F] text-white" : "bg-[#F0F4F5] text-[#52616A] hover:bg-[#E3E9EB]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {content}
      {tab === "browse" && !loading && !enrollmentLoading && mosque ? (
        <div className="p-4">
          <StudentInviteCodeTools slug={slug} />
        </div>
      ) : null}
      {detailsRow ? (
        <ApplicantDetailsDrawer
          row={detailsRow}
          slug={slug}
          onClose={() => setDetailsRow(null)}
          onRescind={() => setRescindTarget(detailsRow)}
        />
      ) : null}
      {rescindTarget ? (
        <ConfirmStudentRescindModal
          request={{ ...rescindTarget.request, student: rescindTarget.student, parent: null, program: rescindTarget.program, track: rescindTarget.track }}
          busy={rescindBusy}
          onCancel={() => {
            if (!rescindBusy) {
              setRescindTarget(null);
            }
          }}
          onConfirm={() => void confirmRescindApplicantRequest()}
        />
      ) : null}
    </section>
  );
}

type ScheduleOptionEnrollment = {
  enrollment: Enrollment;
  student: StudentDisplay | null;
  selectedTrackIds: string[];
  draftTrackIds: string[];
  message: { tone: "success" | "error"; text: string } | null;
};

export function StudentScheduleOptionsData({ slug, programId }: { slug: string; programId: string }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [items, setItems] = useState<ScheduleOptionEnrollment[]>([]);
  const [savingEnrollmentId, setSavingEnrollmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // One RPC call instead of mosque -> profile -> [children] -> [program+tracks+enrollments]
    // -> enrollment_tracks, as up to six sequential stages.
    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("get_student_schedule_options_snapshot", { p_slug: slug, p_program_id: programId });
      if (error) {
        if (!cancelled) {
          setError(friendlyErrorMessage(error, "Could not load your enrollment."));
          setLoading(false);
        }
        return;
      }

      const snapshot = data as unknown as {
        error: string | null;
        program: Program | null;
        tracks: ProgramTrack[];
        selfProfile: StudentDisplay | null;
        children: StudentDisplay[];
        enrollments: Enrollment[];
        enrollmentTracks: Array<{ enrollment_id: string; program_track_id: string }>;
      } | null;

      if (cancelled) {
        return;
      }
      if (!snapshot || snapshot.error || !snapshot.program) {
        setError(snapshot?.error ?? "Class not found.");
        setLoading(false);
        return;
      }

      const programRow = snapshot.program;
      const trackRows = snapshot.tracks ?? [];
      const possibleStudents = [snapshot.selfProfile, ...(snapshot.children ?? [])].filter(Boolean) as StudentDisplay[];
      const enrollmentRows = snapshot.enrollments ?? [];
      const enrollmentTrackRows = snapshot.enrollmentTracks ?? [];

      if (!possibleStudents.length) {
        setError("No student profile is available for this account.");
        setLoading(false);
        return;
      }

      const trackIdsByEnrollmentId = new Map<string, string[]>();
      for (const row of enrollmentTrackRows) {
        trackIdsByEnrollmentId.set(row.enrollment_id, [...(trackIdsByEnrollmentId.get(row.enrollment_id) ?? []), row.program_track_id]);
      }

      const nextItems = enrollmentRows.map((enrollment) => {
        const selectedTrackIds = [
          ...(trackIdsByEnrollmentId.get(enrollment.id) ?? []),
          ...(enrollment.program_track_id ? [enrollment.program_track_id] : []),
        ].filter((trackId, index, all) => all.indexOf(trackId) === index && trackRows.some((track) => track.id === trackId));
        return {
          enrollment,
          student: possibleStudents.find((student) => student.id === enrollment.student_profile_id) ?? null,
          selectedTrackIds,
          draftTrackIds: selectedTrackIds,
          message: null,
        };
      });

      setProgram(programRow);
      setTracks(trackRows);
      setItems(nextItems);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [programId, slug]);

  function updateDraft(enrollmentId: string, trackId: string) {
    if (!program) {
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.enrollment.id === enrollmentId
          ? {
              ...item,
              draftTrackIds: nextScheduleOptionSelection(program, tracks, item.draftTrackIds, trackId),
              message: null,
            }
          : item,
      ),
    );
  }

  async function saveSelection(item: ScheduleOptionEnrollment) {
    if (!program) {
      return;
    }
    const eligibility = isProfileEligibleForProgram(item.student, program);
    if (!eligibility.eligible) {
      setItems((current) => current.map((row) => (row.enrollment.id === item.enrollment.id ? { ...row, message: { tone: "error", text: eligibility.reason ?? "This student is not eligible for this class." } } : row)));
      return;
    }
    const trackEligibilityIssue = item.draftTrackIds
      .map((trackId) => isProfileEligibleForTrack(item.student, tracks.find((track) => track.id === trackId), program))
      .find((result) => !result.eligible);
    if (trackEligibilityIssue) {
      setItems((current) => current.map((row) => (row.enrollment.id === item.enrollment.id ? { ...row, message: { tone: "error", text: trackEligibilityIssue.reason ?? "This student is not eligible for the selected schedule option." } } : row)));
      return;
    }
    const validation = validateTrackSelection(program, tracks, item.draftTrackIds);
    if (!validation.valid) {
      setItems((current) => current.map((row) => (row.enrollment.id === item.enrollment.id ? { ...row, message: { tone: "error", text: validation.message } } : row)));
      return;
    }

    setSavingEnrollmentId(item.enrollment.id);
    const supabase = createSupabaseBrowserClient();

    if (program.track_switch_policy === "request_only") {
      const { error: requestError } = await supabase.from("program_track_switch_requests").insert({
        program_id: programId,
        enrollment_id: item.enrollment.id,
        student_profile_id: item.enrollment.student_profile_id,
        from_track_ids: item.selectedTrackIds,
        to_track_ids: item.draftTrackIds,
      });
      setItems((current) =>
        current.map((row) =>
          row.enrollment.id === item.enrollment.id
            ? requestError
              ? { ...row, message: { tone: "error", text: friendlyErrorMessage(requestError, "Could not send this request.") } }
              : { ...row, draftTrackIds: row.selectedTrackIds, message: { tone: "success", text: "Request sent to the class director." } }
            : row,
        ),
      );
      setSavingEnrollmentId(null);
      return;
    }

    const { error: updateError } = await supabase.rpc("update_enrollment_track_selection", {
      target_enrollment_id: item.enrollment.id,
      selected_track_ids: item.draftTrackIds,
    });

    setItems((current) =>
      current.map((row) =>
        row.enrollment.id === item.enrollment.id
          ? updateError
            ? { ...row, message: { tone: "error", text: friendlyErrorMessage(updateError, "Could not update your schedule.") } }
            : { ...row, selectedTrackIds: item.draftTrackIds, message: { tone: "success", text: "Schedule options updated." } }
          : row,
      ),
    );
    setSavingEnrollmentId(null);
    if (!updateError) {
      window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    }
  }

  if (loading) {
    return <InboxLoadingPanel label="Loading schedule options" />;
  }

  if (error) {
    return <EmptyState title="Could not load schedule options" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="Schedule options could not be loaded." />;
  }

  if (program.track_switch_policy === "disabled") {
    return <EmptyState title="Schedule changes unavailable" text="This class does not allow changing schedule options after enrollment." />;
  }

  const ruleText = trackSelectionRuleText(program, tracks.length);

  return (
    <section className="min-h-[calc(100vh-260px)] bg-white px-5 pb-28 pt-5 text-[#26323A]">
      <div className="border-b border-[#E1E8EC] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6B747B]">Schedule control</p>
        <h2 className="mt-2 text-2xl font-semibold leading-tight">{program.title}</h2>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
          <span className="text-[#6B747B]">Rule</span>
          <span className="text-right font-semibold text-[#17624F]">{ruleText}</span>
          <span className="text-[#6B747B]">Eligibility</span>
          <span className="text-right font-semibold">{formatAgeRange(program.age_range_text)} · {formatGender(program.audience_gender)}</span>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="py-8">
          <MiniEmpty text="This class does not have multiple schedule options." />
        </div>
      ) : items.length === 0 ? (
        <div className="py-8">
          <MiniEmpty text="No active enrollment was found for this class." />
        </div>
      ) : (
        <div className="divide-y divide-[#E1E8EC]">
          {items.map((item) => {
            const studentName = item.student?.full_name?.trim() || "Student";
            const eligibility = isProfileEligibleForProgram(item.student, program);
            const trackEligibility = item.draftTrackIds
              .map((trackId) => isProfileEligibleForTrack(item.student, tracks.find((track) => track.id === trackId), program))
              .find((result) => !result.eligible) ?? { eligible: true, reason: null };
            const validation = validateTrackSelection(program, tracks, item.draftTrackIds);
            const dirty = !sameStringSet(item.selectedTrackIds, item.draftTrackIds);
            const canSave = dirty && eligibility.eligible && trackEligibility.eligible && validation.valid && savingEnrollmentId !== item.enrollment.id;
            return (
              <section key={item.enrollment.id} className="py-5">
                <div className="flex items-start gap-3">
                  <Avatar src={item.student?.avatar_url ?? null} name={studentName} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">{studentName}</h3>
                    <p className="mt-1 text-xs font-medium text-[#6B747B]">{item.draftTrackIds.length} selected · {dirty ? "Unsaved changes" : "Current schedule"}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canSave}
                    onClick={() => void saveSelection(item)}
                    className="min-h-9 shrink-0 rounded-full bg-[#17624F] px-4 text-sm font-semibold text-white disabled:bg-[#D8E2E5] disabled:text-[#8A949B]"
                  >
                    {savingEnrollmentId === item.enrollment.id ? "Saving" : "Save"}
                  </button>
                </div>

                {!eligibility.eligible ? <p className="mt-3 text-sm font-semibold text-[#A34B16]">{eligibility.reason}</p> : null}
                {eligibility.eligible && !trackEligibility.eligible ? <p className="mt-3 text-sm font-semibold text-[#A34B16]">{trackEligibility.reason}</p> : null}
                {eligibility.eligible && trackEligibility.eligible && !validation.valid ? <p className="mt-3 text-sm font-semibold text-[#A34B16]">{validation.message}</p> : null}
                {item.message ? <p className={cn("mt-3 text-sm font-semibold", item.message.tone === "success" ? "text-[#17624F]" : "text-[#A34B16]")}>{item.message.text}</p> : null}

                <div className="mt-4 divide-y divide-[#EEF2F4] border-y border-[#EEF2F4]">
                  {tracks.map((track, index) => (
                    <ScheduleTrackControlRow
                      key={track.id}
                      index={index}
                      track={track}
                      trackCount={tracks.length}
                      program={program}
                      selectedTrackIds={item.draftTrackIds}
                      disabled={!eligibility.eligible}
                      onToggle={() => updateDraft(item.enrollment.id, track.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

type AccountPanel = "menu" | "settings" | "family" | "billing" | "security" | "homescreen" | "photo";
type EditableProfileField = "fullName" | "password" | "email" | "dateOfBirth" | "phone";

type BillingPaymentRow = {
  id: string;
  programTitle: string;
  studentName: string | null;
  amountCents: number;
  currency: string;
  paidAt: string;
  receiptUrl: string | null;
  taxReceiptStatus: string;
};

function taxReceiptStatusLabel(status: string) {
  switch (status) {
    case "admin_review_required":
      return "Tax receipt status: Under review";
    case "eligible_pending_issue":
      return "Tax receipt status: Eligible - pending issue";
    case "issued":
    case "partial_issued":
      return "Tax receipt status: Issued";
    case "contact_admin":
      return "Tax receipt status: Contact administration";
    default:
      return null;
  }
}

export function PortalAccountData({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSession = getCachedSessionSnapshot();
  const initialUser = initialSession?.user ?? null;
  const initialProfileSummary = initialUser?.id ? getCachedProfileSummary(initialUser.id) : undefined;
  const initialAccess = initialUser?.id ? getCachedUserAccess(slug, initialUser.id) : null;
  const initialMetadataName = typeof initialUser?.user_metadata?.full_name === "string" ? initialUser.user_metadata.full_name : "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionEmail, setSessionEmail] = useState(initialUser?.email ?? "");
  const [fallbackName, setFallbackName] = useState(initialProfileSummary?.fullName ?? (initialMetadataName || initialUser?.email?.split("@")[0] || "Guest"));
  const [accountLabel, setAccountLabel] = useState(initialAccess ? getAccountLabel(initialAccess) : "Account");
  const [isParent, setIsParent] = useState(initialAccess?.accountType?.toLowerCase() === "parent");
  const [isSignedIn, setIsSignedIn] = useState(initialSession !== null);
  const [activePanel, setActivePanel] = useState<AccountPanel>("menu");
  const [homescreenMosqueName, setHomescreenMosqueName] = useState(() => getCachedMosqueChrome(slug)?.name ?? "Madrasa");

  useEffect(() => {
    void loadMosqueChrome(slug).then((chrome) => {
      if (chrome?.name) {
        setHomescreenMosqueName(chrome.name);
      }
    });
  }, [slug]);
  const [panelMotion, setPanelMotion] = useState<"forward" | "back">("forward");
  const [hasPanelNavigated, setHasPanelNavigated] = useState(false);
  const [profileForm, setProfileForm] = useState({
    avatarUrl: initialProfileSummary?.avatarUrl ?? "",
    fullName: initialProfileSummary?.fullName ?? initialMetadataName ?? "",
    phone: "",
    dateOfBirth: "",
    email: initialUser?.email ?? "",
    password: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [editingField, setEditingField] = useState<EditableProfileField | null>(null);
  const [photoDraftUrl, setPhotoDraftUrl] = useState("");
  const [photoScale, setPhotoScale] = useState(1);
  const [photoOffset, setPhotoOffset] = useState({ x: 0, y: 0 });
  const [payments, setPayments] = useState<BillingPaymentRow[] | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialSession === undefined);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  async function loadBillingPayments() {
    setPaymentsLoading(true);
    setPaymentsError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: paymentRows, error } = await supabase
      .from("program_payments")
      .select("id, program_id, student_profile_id, amount_cents, currency, paid_at, receipt_url, tax_receipt_status")
      .order("paid_at", { ascending: false })
      .limit(100);
    if (error) {
      setPaymentsError(error.message);
      setPaymentsLoading(false);
      return;
    }

    const rows = paymentRows ?? [];
    const programIds = Array.from(new Set(rows.map((row) => row.program_id).filter((id): id is string => Boolean(id))));
    const studentIds = Array.from(new Set(rows.map((row) => row.student_profile_id).filter((id): id is string => Boolean(id))));

    const programTitleById = new Map<string, string>();
    if (programIds.length) {
      const { data: programRows } = await supabase.from("programs").select("id, title").in("id", programIds);
      for (const row of programRows ?? []) {
        programTitleById.set(row.id, row.title);
      }
    }

    const studentNameById = new Map<string, string | null>();
    if (studentIds.length) {
      const { data: studentRows } = await supabase.from("profiles").select("id, full_name").in("id", studentIds);
      for (const row of studentRows ?? []) {
        studentNameById.set(row.id, row.full_name);
      }
    }

    setPayments(
      rows.map((row) => ({
        id: row.id,
        programTitle: (row.program_id && programTitleById.get(row.program_id)) || "Class",
        studentName: row.student_profile_id ? studentNameById.get(row.student_profile_id) ?? null : null,
        amountCents: row.amount_cents,
        currency: row.currency,
        paidAt: row.paid_at,
        receiptUrl: row.receipt_url,
        taxReceiptStatus: row.tax_receipt_status,
      })),
    );
    setPaymentsLoading(false);
  }

  useEffect(() => {
    if (activePanel !== "billing" || !profile?.id || payments !== null) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void loadBillingPayments();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activePanel, profile?.id, payments]);

  useEffect(() => {
    const panelParam = searchParams.get("panel");
    if (!panelParam || !isAccountPanel(panelParam)) {
      return;
    }

    setActivePanel(panelParam);
    setPanelMotion("forward");
    setHasPanelNavigated(false);
    setEditingField(null);
    setProfileMessage(null);
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      const session = await loadCachedSession();
      if (!active) {
        return;
      }

      if (!session?.user.id) {
        setIsSignedIn(false);
        setProfile(null);
        setAccountLabel("Not signed in");
        setLoading(false);
        return;
      }

      setIsSignedIn(true);
      const metadata = session.user.user_metadata;
      const metadataName = typeof metadata?.full_name === "string" ? metadata.full_name : "";
      setSessionEmail(session.user.email ?? "");
      setFallbackName(metadataName || session.user.email?.split("@")[0] || "Guest");
      setLoading(false);

      const supabase = createSupabaseBrowserClient();
      const [{ data: profileRow }, access] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
        loadCachedUserAccess(slug, session.user.id),
      ]);

      if (!active) {
        return;
      }

      const resolvedAccountType = (profileRow?.account_type ?? access.accountType ?? "").toLowerCase();
      const resolvedAccess = { ...access, accountType: resolvedAccountType || access.accountType };

      setProfile(profileRow ?? null);
      setAccountLabel(getAccountLabel(resolvedAccess));
      setIsParent(resolvedAccountType === "parent");
      setProfileForm({
        avatarUrl: profileRow?.avatar_url ?? "",
        fullName: profileRow?.full_name ?? metadataName ?? "",
        phone: profileRow?.phone_number ?? "",
        dateOfBirth: profileRow?.date_of_birth ?? "",
        email: profileRow?.email ?? session.user.email ?? "",
        password: "",
      });
      setCachedProfileSummary(session.user.id, {
        fullName: profileRow?.full_name?.trim() || metadataName || session.user.email?.split("@")[0] || null,
        avatarUrl: profileRow?.avatar_url?.trim() || null,
      });
      window.dispatchEvent(new Event("tareeqah:profile-name-changed"));
      setLoading(false);
    }

    void loadAccount();

    return () => {
      active = false;
    };
  }, [router, slug]);


  function handleLogout() {
    router.replace(`/m/${slug}/login`);
    void performClientLogout();
  }


  function openPanel(panel: AccountPanel) {
    setHasPanelNavigated(true);
    setPanelMotion("forward");
    setActivePanel(panel);
  }

  function closePanel() {
    setHasPanelNavigated(true);
    setPanelMotion("back");
    setActivePanel("menu");
    setEditingField(null);
    setProfileMessage(null);
  }

  function openPhotoPanel() {
    setHasPanelNavigated(true);
    setPanelMotion("forward");
    setPhotoDraftUrl(profileForm.avatarUrl);
    setPhotoScale(1);
    setPhotoOffset({ x: 0, y: 0 });
    setProfileMessage(null);
    setActivePanel("photo");
  }

  function closePhotoPanel() {
    setHasPanelNavigated(true);
    setPanelMotion("back");
    setActivePanel("settings");
    setProfileMessage(null);
  }

  function handlePhotoFile(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhotoDraftUrl(reader.result);
        setPhotoScale(1);
        setPhotoOffset({ x: 0, y: 0 });
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveAvatarUrl(nextAvatarUrl: string) {
    if (!profile?.id) {
      return;
    }

    setProfileSaving(true);
    setProfileMessage(null);
    const cleanedAvatarUrl = nextAvatarUrl.trim();
    const { data: updatedProfile, error } = await createSupabaseBrowserClient()
      .from("profiles")
      .update({
        avatar_url: cleanedAvatarUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
      .select("*")
      .maybeSingle();

    if (error || !updatedProfile) {
      setProfileMessage(friendlyErrorMessage(error, "Profile photo could not be saved. Please refresh and try again."));
      setProfileSaving(false);
      return;
    }

    setProfile(updatedProfile);
    setProfileForm((current) => ({ ...current, avatarUrl: updatedProfile.avatar_url ?? "" }));
    setCachedProfileSummary(profile.id, {
      fullName: updatedProfile.full_name?.trim() || null,
      avatarUrl: updatedProfile.avatar_url?.trim() || null,
    });
    window.dispatchEvent(new Event("tareeqah:profile-name-changed"));
    setProfileSaving(false);
    setToast({ tone: "success", message: cleanedAvatarUrl ? "Profile photo updated." : "Profile photo removed." });
  }

  async function confirmPhotoChanges() {
    const croppedAvatarUrl = photoDraftUrl ? await cropAvatarImage(photoDraftUrl, photoScale, photoOffset).catch(() => photoDraftUrl) : "";
    await saveAvatarUrl(croppedAvatarUrl);
    setActivePanel("settings");
  }

  async function removeProfilePhoto() {
    setPhotoDraftUrl("");
    setPhotoScale(1);
    setPhotoOffset({ x: 0, y: 0 });
    await saveAvatarUrl("");
  }

  async function saveProfileField(field: EditableProfileField) {
    if (!profile?.id) {
      return;
    }

    setProfileSaving(true);
    setProfileMessage(null);
    const supabase = createSupabaseBrowserClient();

    if (field === "email" || field === "password") {
      const authUpdates: { email?: string; password?: string } = {};
      if (field === "email") {
        const nextEmail = profileForm.email.trim();
        if (!nextEmail) {
          setProfileMessage("Email cannot be empty.");
          setProfileSaving(false);
          return;
        }
        authUpdates.email = nextEmail;
      } else {
        const nextPassword = profileForm.password.trim();
        const passwordError = validateAccountPassword(nextPassword);
        if (passwordError) {
          setProfileMessage(passwordError);
          setProfileSaving(false);
          return;
        }
        authUpdates.password = nextPassword;
      }

      if (field === "email") {
        const nextEmail = profileForm.email.trim();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setProfileMessage("Please sign in again before changing your email.");
          setProfileSaving(false);
          return;
        }

        const response = await fetch("/api/account/email", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: nextEmail }),
        });
        const result = (await response.json()) as { email?: string; profile?: Profile; error?: string };
        if (!response.ok || !result.email || !result.profile) {
          setProfileMessage(result.error ?? "Email could not be updated.");
          setProfileSaving(false);
          return;
        }

        setSessionEmail(result.email);
        setProfile(result.profile);
        setProfileForm((current) => ({ ...current, email: result.email ?? nextEmail }));
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setProfileMessage("Please sign in again before changing your password.");
          setProfileSaving(false);
          return;
        }
        const response = await fetch("/api/account/profile", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ field: "password", value: authUpdates.password }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) {
          setProfileMessage(result.error ?? "Password could not be updated.");
          setProfileSaving(false);
          return;
        }
        setProfileForm((current) => ({ ...current, password: "" }));
      }
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setProfileMessage("Please sign in again before changing your account.");
        setProfileSaving(false);
        return;
      }
      const value = field === "fullName" ? profileForm.fullName : field === "phone" ? profileForm.phone : profileForm.dateOfBirth;
      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      const result = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok || !result.profile) {
        setProfileMessage(result.error ?? "Profile could not be saved. Please refresh and try again.");
        setProfileSaving(false);
        return;
      }
      const updatedProfile = result.profile;

      setProfile(updatedProfile);
      setProfileForm((current) => ({
        ...current,
        fullName: updatedProfile.full_name ?? "",
        phone: updatedProfile.phone_number ?? "",
        dateOfBirth: updatedProfile.date_of_birth ?? "",
      }));

      if (field === "fullName") {
        setCachedProfileName(profile.id, updatedProfile.full_name?.trim() || null);
        setCachedProfileSummary(profile.id, {
          fullName: updatedProfile.full_name?.trim() || null,
          avatarUrl: updatedProfile.avatar_url?.trim() || null,
        });
        window.dispatchEvent(new Event("tareeqah:profile-name-changed"));
      }
    }

    setEditingField(null);
    setToast({ tone: "success", message: "Saved." });
    setProfileSaving(false);
  }

  const displayName = profile?.full_name?.trim() || fallbackName || "Guest";
  const displayEmail = profile?.email?.trim() || sessionEmail || "Not provided";
  const rawAccountType = profile?.account_type?.trim();
  const accountType = accountLabel === "Account" && rawAccountType ? `${titleCase(rawAccountType)} Account` : accountLabel;

  if (loading) {
    return <GenericLoadingState label="Loading account" layout="account" />;
  }

  if (!isSignedIn) {
    return (
      <section className="min-h-[calc(100vh-140px)] bg-[var(--workspace)] px-5 py-10 text-[#26323A]">
        <div className="mx-auto max-w-sm">
          <div className="rounded-[30px] bg-white p-8 text-center shadow-[0_18px_45px_rgba(38,50,58,0.08)] ring-1 ring-[#E4EAEE]">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#79B7C8] text-3xl font-semibold text-[#2F8FB3]">!</div>
            <h1 className="mt-6 text-2xl font-semibold text-[#26323A]">Log in required</h1>
            <p className="mt-2 text-sm leading-6 text-[#6B747B]">Your account page is available after signing in.</p>
            <Link href={`/m/${slug}/login`} className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[#26323A] px-7 text-sm font-semibold !text-white shadow-[0_12px_24px_rgba(38,50,58,0.18)]">
              Log in
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const accountPanels: Record<AccountPanel, ReactNode> = {
    menu: (
      <>
        <div className="flex flex-col items-center pt-3 text-center">
          <AccountAvatar src={profile?.avatar_url ?? null} name={displayName} />
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.01em] text-[#1F2A31]">{displayName}</h1>
          <p className="mt-1 text-sm font-medium text-[#6B747B]">{accountType}</p>
        </div>

        <nav className="mt-10 -mx-5 divide-y divide-[#E3E8EC] px-5">
          <AccountMenuButton icon={<AccountUserIcon />} label="Account Settings" onClick={() => openPanel("settings")} />
          {isParent ? <AccountMenuButton icon={<FamilyIcon />} label="Family" onClick={() => openPanel("family")} /> : null}
          <AccountMenuButton icon={<BillingIcon />} label="Billing" onClick={() => openPanel("billing")} />
          <AccountMenuButton icon={<ShieldIcon />} label="Privacy and Security" onClick={() => openPanel("security")} />
          <AccountMenuButton icon={<HomeScreenIcon />} label="Add App to Homescreen" onClick={() => openPanel("homescreen")} />
          <AccountMenuButton icon={<LogoutIcon />} label="Log out" tone="danger" onClick={handleLogout} />
        </nav>
      </>
    ),
    settings: (
      <>
        <AccountSubpageHeader title="Account Settings" onBack={closePanel} />
        <div className="mt-8">
          <div className="-mx-1 flex items-center gap-4 border-b border-[#E3E8EC] px-1 pb-7">
            <AccountAvatar src={profile?.avatar_url ?? null} name={displayName} size="sm" />
            <button type="button" onClick={openPhotoPanel} className="min-h-10 rounded-full bg-[#F2F4F5] px-5 text-sm font-semibold text-[#26323A]">
              Edit photo
            </button>
            <button type="button" onClick={removeProfilePhoto} disabled={profileSaving} className="min-h-10 rounded-full bg-[#FCEDEC] px-5 text-sm font-semibold text-[#8F2D23] disabled:opacity-60">
              Remove
            </button>
          </div>

          <section className="mt-7">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A9399]">Personal details</p>
            <div className="mt-2 divide-y divide-[#E6EAED]">
              <EditableProfileRow
                label="Full name"
                value={profileForm.fullName || "Not provided"}
                editValue={profileForm.fullName}
                editing={editingField === "fullName"}
                onEdit={() => setEditingField("fullName")}
                onChange={(value) => setProfileForm((current) => ({ ...current, fullName: value }))}
                onSave={() => saveProfileField("fullName")}
                saving={profileSaving}
              />
              <EditableProfileRow
                label="Password"
                value="************"
                editValue={profileForm.password}
                inputType="password"
                placeholder="New password"
                editing={editingField === "password"}
                onEdit={() => setEditingField("password")}
                onChange={(value) => setProfileForm((current) => ({ ...current, password: value }))}
                onSave={() => saveProfileField("password")}
                saving={profileSaving}
              />
              <EditableProfileRow
                label="Email address"
                value={profileForm.email || displayEmail}
                editValue={profileForm.email}
                inputType="email"
                editing={editingField === "email"}
                onEdit={() => setEditingField("email")}
                onChange={(value) => setProfileForm((current) => ({ ...current, email: value }))}
                onSave={() => saveProfileField("email")}
                saving={profileSaving}
              />
              <EditableProfileRow
                label="Date of birth"
                value={profileForm.dateOfBirth || "Not provided"}
                editValue={profileForm.dateOfBirth}
                inputType="date"
                editing={editingField === "dateOfBirth"}
                onEdit={() => setEditingField("dateOfBirth")}
                onChange={(value) => setProfileForm((current) => ({ ...current, dateOfBirth: value }))}
                onSave={() => saveProfileField("dateOfBirth")}
                saving={profileSaving}
              />
              <EditableProfileRow
                label="Phone number"
                value={profileForm.phone || "Not provided"}
                editValue={profileForm.phone}
                inputMode="tel"
                editing={editingField === "phone"}
                onEdit={() => setEditingField("phone")}
                onChange={(value) => setProfileForm((current) => ({ ...current, phone: value }))}
                onSave={() => saveProfileField("phone")}
                saving={profileSaving}
              />
            </div>
          </section>

          <PushNotificationToggle />

          {profileMessage ? <p className="mt-5 rounded-2xl bg-[#F0F8FB] px-4 py-3 text-sm leading-6 text-[#257B9C]">{profileMessage}</p> : null}
        </div>
      </>
    ),
    photo: (
      <EditProfilePhotoPanel
        previewUrl={photoDraftUrl || profile?.avatar_url || ""}
        name={displayName}
        scale={photoScale}
        offset={photoOffset}
        saving={profileSaving}
        fileInputRef={photoInputRef}
        onBack={closePhotoPanel}
        onScaleChange={setPhotoScale}
        onOffsetChange={setPhotoOffset}
        onFileChange={handlePhotoFile}
        onConfirm={confirmPhotoChanges}
      />
    ),
    family: (
      <>
        <AccountSubpageHeader title="Family" onBack={closePanel} />
        <div className="mt-8">
          <ChildrenManager slug={slug} />
        </div>
      </>
    ),
    billing: (
      <>
        <AccountSubpageHeader title="Billing" onBack={closePanel} />
        <div className="mt-8 space-y-3">
          {paymentsLoading ? (
            <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-4 text-sm font-semibold text-[#6B747B]">Loading payment history...</div>
          ) : paymentsError ? (
            <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-4 text-sm font-semibold text-[#C0392B]">{paymentsError}</div>
          ) : !payments?.length ? (
            <StaticAccountNote title="Payments" text="Your payment history will appear here once you register for a paid class." />
          ) : (
            <>
              {payments.some((payment) => taxReceiptStatusLabel(payment.taxReceiptStatus)) ? (
                <p className="rounded-2xl bg-[#F0F8FB] px-4 py-3 text-xs leading-5 text-[#257B9C]">
                  Payment receipts are available for payments completed through Madrasa. Some programs may be eligible for official
                  charitable tax receipts depending on the masjid&apos;s policy. Eligibility is determined by the masjid administration, and
                  any official receipts are issued by the masjid separately.
                </p>
              ) : null}
              <div className="divide-y divide-[#E6EAED] rounded-[28px] bg-white px-5 shadow-[0_18px_45px_rgba(38,50,58,0.08)] ring-1 ring-[#E4EAEE]">
                {payments.map((payment) => (
                  <div key={payment.id} className="py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#26323A]">{payment.programTitle}</p>
                        {payment.studentName ? <p className="text-xs text-[#6B747B]">{payment.studentName}</p> : null}
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-[#26323A]">{formatCurrencyAmount(payment.amountCents)}</p>
                    </div>
                    <p className="mt-1 text-xs text-[#7B858C]">
                      {formatFinanceDate(payment.paidAt)}
                      {payment.receiptUrl ? (
                        <>
                          {" - "}
                          <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="underline">
                            View receipt
                          </a>
                        </>
                      ) : null}
                    </p>
                    {taxReceiptStatusLabel(payment.taxReceiptStatus) ? (
                      <p className="mt-1 text-xs font-semibold text-[#17624F]">{taxReceiptStatusLabel(payment.taxReceiptStatus)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </>
    ),
    security: (
      <>
        <AccountSubpageHeader title="Privacy and Security" onBack={closePanel} />
        <div className="mt-8">
          <nav className="-mx-5 divide-y divide-[#E3E8EC] px-5">
            <Link href="/legal/terms" className="flex min-h-[74px] w-full items-center gap-4 text-left transition-colors hover:bg-[#F2F6F7]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#26323A]"><DocumentIcon /></span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-[#26323A]">Terms of Service</span>
              <ChevronRightIcon />
            </Link>
            <Link href="/legal/privacy" className="flex min-h-[74px] w-full items-center gap-4 text-left transition-colors hover:bg-[#F2F6F7]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#26323A]"><DocumentIcon /></span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-[#26323A]">Privacy Policy</span>
              <ChevronRightIcon />
            </Link>
          </nav>
          <div className="mt-7">
            <StaticAccountNote title="More controls coming soon" text="Additional privacy and security settings will be added here later." />
          </div>
        </div>
      </>
    ),
    homescreen: (
      <>
        <AccountSubpageHeader title="Add App to Homescreen" onBack={closePanel} />
        <div className="mt-6">
          <InstallDemoTabs siteLabel={`${slug}.madrasa.ca`} appName={homescreenMosqueName} />
        </div>
      </>
    ),
  };

  const mobilePanel = activePanel;
  const desktopPanel = activePanel === "menu" ? "settings" : activePanel;

  function renderAccountPanel(panel: AccountPanel) {
    return (
      <div
        key={panel}
        className={cn(
          hasPanelNavigated ? "account-panel-slide" : "",
          hasPanelNavigated && (panelMotion === "forward" ? "account-panel-slide-forward" : "account-panel-slide-back"),
        )}
      >
        <AccountPanelFrame>{accountPanels[panel]}</AccountPanelFrame>
      </div>
    );
  }

  return (
    <section className="min-h-[calc(100vh-140px)] overflow-hidden bg-[var(--workspace)] px-5 py-8 text-[#26323A]">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-sm overflow-hidden md:hidden">
        {renderAccountPanel(mobilePanel)}
      </div>
      <div className="mx-auto hidden max-w-lg overflow-hidden md:block">
        {renderAccountPanel(desktopPanel)}
      </div>
    </section>
  );
}

function isAccountPanel(value: string): value is AccountPanel {
  return value === "menu" || value === "settings" || value === "family" || value === "billing" || value === "security" || value === "homescreen" || value === "photo";
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

export function TeacherAnnouncementData({ slug, programId }: { slug: string; programId: string }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementWithContext[]>([]);
  const [readersByAnnouncementId, setReadersByAnnouncementId] = useState<Record<string, Profile[]>>({});
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [selectedAnnouncementFeedValue, setSelectedAnnouncementFeedValue] = useState(announcementTargetValue(programId, null));
  const [selectedAnnouncementTrackIds, setSelectedAnnouncementTrackIds] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One RPC call instead of mosque -> program -> [announcements+tracks] -> [authors+receipts]
  // -> reader profiles, as six sequential stages.
  async function loadAnnouncements() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;
    setCurrentUserId(userId);

    const { data, error } = await supabase.rpc("get_teacher_announcements_snapshot", { p_slug: slug, p_program_id: programId });
    if (error) {
      setError(friendlyErrorMessage(error, "Could not load announcements."));
      setLoading(false);
      return;
    }

    const snapshot = data as unknown as {
      error: string | null;
      program: Program | null;
      announcements: AnnouncementWithContext[];
      tracks: ProgramTrack[];
      authors: Profile[];
      receipts: AnnouncementReceipt[];
      readers: Profile[];
    } | null;

    if (!snapshot || !snapshot.program) {
      setError(snapshot?.error ?? "Masjid not found.");
      setLoading(false);
      return;
    }

    const programRow = snapshot.program;
    const announcementRows = snapshot.announcements ?? [];
    const authors = snapshot.authors ?? [];
    const receipts = snapshot.receipts ?? [];
    const readerProfiles = snapshot.readers ?? [];
    const readerById = new Map(readerProfiles.map((reader) => [reader.id, reader]));
    const nextReaders: Record<string, Profile[]> = {};
    for (const receipt of receipts) {
      const reader = readerById.get(receipt.profile_id);
      if (receipt.read_at && reader) {
        nextReaders[receipt.announcement_id] = [...(nextReaders[receipt.announcement_id] ?? []), reader];
      }
    }

    const activeTracks = snapshot.tracks ?? [];
    setProgram(programRow);
    setTracks(activeTracks);
    setSelectedAnnouncementFeedValue((current) => {
      const target = parseAnnouncementTargetValue(current);
      return target.programId === programRow.id && target.trackId && activeTracks.some((track) => track.id === target.trackId)
        ? current
        : announcementTargetValue(programRow.id, activeTracks[0]?.id ?? null);
    });
    setSelectedAnnouncementTrackIds((current) => {
      const activeTrackIds = activeTracks.map((track) => track.id);
      const next = current.filter((trackId) => activeTrackIds.includes(trackId));
      return next.length ? next : activeTrackIds;
    });
    setReadersByAnnouncementId(nextReaders);
    setAnnouncements(
      (announcementRows ?? []).map((announcement) => ({
        ...announcement,
        program: programRow,
        author: (authors ?? []).find((author) => author.id === announcement.author_profile_id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAnnouncements();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, slug]);

  async function sendAnnouncement() {
    if (!currentUserId || !program || (!message.trim() && attachments.length === 0)) {
      return;
    }

    const allTrackIds = tracks.map((track) => track.id);
    const targetTrackIds =
      selectedAnnouncementTrackIds.length && selectedAnnouncementTrackIds.length < allTrackIds.length
        ? selectedAnnouncementTrackIds.filter((trackId) => allTrackIds.includes(trackId))
        : [];

    const supabase = createSupabaseBrowserClient();
    const { data: inserted, error: insertError } = await supabase
      .from("program_announcements")
      .insert({
        program_id: program.id,
        author_profile_id: currentUserId,
        message: message.trim(),
        attachments: attachments as unknown as Json,
        target_program_track_ids: targetTrackIds,
      })
      .select("id")
      .single();

    if (insertError) {
      setError(friendlyErrorMessage(insertError, "Could not send this announcement."));
      return;
    }

    setMessage("");
    setAttachments([]);
    setComposeOpen(false);
    setSelectedAnnouncementTrackIds(tracks.map((track) => track.id));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    if (inserted) {
      void notifyAnnouncementPosted(program.id, inserted.id);
    }
    await loadAnnouncements();
  }

  if (loading) {
    return <InboxLoadingPanel label="Loading announcements" />;
  }

  if (error) {
    return <EmptyState title="Could not load announcements" text={error} onRetry={() => window.location.reload()} />;
  }

  const feedTarget = parseAnnouncementTargetValue(selectedAnnouncementFeedValue);
  const visibleAnnouncements = feedTarget.trackId
    ? announcements.filter((announcement) => {
        const targetTrackIds = getAnnouncementTargetTrackIds(announcement);
        return targetTrackIds.length === 0 || targetTrackIds.includes(feedTarget.trackId as string);
      })
    : announcements;

  return (
    <section className="space-y-6 bg-[var(--workspace)] p-4 pb-28 text-[#26323A]">
      <div className="px-1">
        {!composeOpen ? (
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="flex min-h-12 w-full items-center justify-center rounded-[12px] bg-[#17624F] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(23,98,79,0.16)]"
          >
            Compose New Announcement
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Compose New Announcement</h2>
              <button type="button" onClick={() => setComposeOpen(false)} className="rounded-full bg-[#EEF3F5] px-3 py-1.5 text-xs font-semibold text-[#52616A]">
                Close
              </button>
            </div>
            {tracks.length ? (
              <div className="rounded-[18px] bg-[#F7FAFB] p-2">
                <div className="mb-2 grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => setSelectedAnnouncementTrackIds(tracks.map((track) => track.id))} className="min-h-8 rounded-[10px] bg-[#EAF7F1] px-2 text-xs font-semibold text-[#17624F]">
                    Select all
                  </button>
                  <button type="button" onClick={() => setSelectedAnnouncementTrackIds([])} className="min-h-8 rounded-[10px] bg-[#EEF2F4] px-2 text-xs font-semibold text-[#52616A]">
                    Deselect all
                  </button>
                </div>
                <div className="grid gap-1">
                  {tracks.map((track) => (
                    <RosterTrackOption
                      key={track.id}
                      checked={selectedAnnouncementTrackIds.includes(track.id)}
                      label={track.name}
                      onClick={() =>
                        setSelectedAnnouncementTrackIds((current) =>
                          current.includes(track.id) ? current.filter((trackId) => trackId !== track.id) : [...current, track.id],
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write an announcement..."
              className="min-h-28 w-full resize-none rounded-[16px] border border-[#B9C3C8] bg-white px-3 py-2 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]"
            />
            <MessageAttachmentComposer programId={programId} attachments={attachments} onChange={setAttachments} onError={(nextError) => setError(nextError || null)} />
            <div className="flex justify-end">
              <button type="button" onClick={sendAnnouncement} disabled={(!message.trim() && attachments.length === 0) || (tracks.length > 0 && selectedAnnouncementTrackIds.length === 0)} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#17624F] px-5 text-sm font-semibold text-white hover:bg-[#0F4537] disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="px-1 text-2xl font-semibold leading-8">Announcements History</h2>
        {tracks.length ? (
          <select
            value={selectedAnnouncementFeedValue}
            onChange={(event) => setSelectedAnnouncementFeedValue(event.target.value)}
            className="h-12 w-full rounded-[14px] border border-[#D6DCE0] bg-white px-4 text-sm font-semibold text-[#52616A] outline-none focus:border-[#2F8FB3]"
          >
            {tracks.map((track) => (
              <option key={track.id} value={announcementTargetValue(program?.id ?? programId, track.id)}>
                {track.name}
              </option>
            ))}
          </select>
        ) : null}
        <ProgramAnnouncementFeed program={program} announcements={visibleAnnouncements} readersByAnnouncementId={readersByAnnouncementId} viewer="teacher" />
      </div>
    </section>
  );
}

function MessageAttachmentComposer({
  programId,
  attachments,
  onChange,
  disabled = false,
  onError,
}: {
  programId: string;
  attachments: MessageAttachment[];
  onChange: (attachments: MessageAttachment[]) => void;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preparingVoiceNote, setPreparingVoiceNote] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const canRecord = typeof window !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  async function addFile(file: File, options: { preparingVoiceNote?: boolean } = {}) {
    setUploading(true);
    setPreparingVoiceNote(Boolean(options.preparingVoiceNote));
    onError("");
    try {
      const result = await uploadMessageAttachment(programId, file);
      if (result.error || !result.attachment) {
        onError(result.error ?? "Could not upload attachment.");
        return;
      }
      onChange([...attachments, result.attachment]);
    } catch {
      onError("Could not upload attachment.");
    } finally {
      setUploading(false);
      setPreparingVoiceNote(false);
    }
  }

  async function startRecording() {
    if (!canRecord || disabled || uploading) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setRecording(false);
        setRecordingSeconds(0);
        void addFile(file, { preparingVoiceNote: true });
      };
      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);
    } catch {
      onError("Microphone access was not allowed.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }

  useEffect(() => {
    if (!recording) {
      return;
    }
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 500);
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="audio/*,image/*,application/pdf,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void addFile(file);
          }
        }}
      />
      {attachments.length ? (
        <div className="grid gap-2">
          {attachments.map((attachment) =>
            attachment.kind === "audio" ? (
              <VoiceAttachmentPreview
                key={attachment.id}
                attachment={attachment}
                disabled={disabled || uploading}
                onRemove={() => onChange(attachments.filter((item) => item.id !== attachment.id))}
              />
            ) : (
              <div key={attachment.id} className="flex items-center gap-2 rounded-[14px] border border-[#DDE6EA] bg-white px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#2F8FB3]" aria-hidden>
                  {attachment.kind === "image" ? <PhotoIcon className="h-4 w-4" /> : <FileIcon />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#26323A]">{attachmentDisplayName(attachment)}</p>
                  <p className="text-[11px] text-[#7B858C]">{attachmentMetaLabel(attachment)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(attachments.filter((item) => item.id !== attachment.id))}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F6EDEA] text-[#C83F31]"
                  aria-label={`Remove ${attachmentDisplayName(attachment)}`}
                  disabled={disabled || uploading}
                >
                  <XIcon />
                </button>
              </div>
            ),
          )}
        </div>
      ) : null}
      {preparingVoiceNote ? (
        <div className="flex items-center gap-2 rounded-[14px] border border-[#DDE6EA] bg-white px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#2F8FB3]" aria-hidden>
            <MicIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#26323A]">Voice note</p>
            <p className="text-[11px] text-[#7B858C]">Preparing audio...</p>
          </div>
          <span className="h-5 w-5 animate-pulse rounded-full bg-[#BFE0EC]" aria-hidden />
        </div>
      ) : null}
      {recording ? (
        <div className="flex min-h-10 items-center justify-between rounded-[14px] border border-[#F0C2BA] bg-[#FFF4F2] px-3 text-xs font-semibold text-[#B63A2F]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#C83F31]" aria-hidden />
            Recording {formatRecordingDuration(recordingSeconds)}
          </span>
          <button type="button" onClick={stopRecording} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#B63A2F] shadow-sm" aria-label="Stop recording">
            <StopRecordingIcon />
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading || recording}
          className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#EEF6F7] px-3 text-xs font-semibold text-[#17624F] disabled:opacity-50"
        >
          <PaperclipIcon />
          {uploading ? "Uploading..." : "Attach file"}
        </button>
        {canRecord ? (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={disabled || uploading}
            className={cn("inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold disabled:opacity-50", recording ? "bg-[#C83F31] text-white" : "bg-[#26323A] text-white")}
          >
            <MicIcon />
            {recording ? formatRecordingDuration(recordingSeconds) : "Voice note"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function VoiceAttachmentPreview({ attachment, disabled, onRemove }: { attachment: MessageAttachment; disabled: boolean; onRemove: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playableDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = playableDuration ? Math.min(100, Math.max(0, (currentTime / playableDuration) * 100)) : 0;

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play();
      return;
    }
    audio.pause();
  }

  return (
    <div className="rounded-[14px] border border-[#DDE6EA] bg-white px-3 py-2">
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={togglePlayback} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#17624F] text-white disabled:opacity-50" disabled={disabled} aria-label={playing ? "Pause voice note" : "Play voice note"}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-[#26323A]">Voice note</p>
            <p className="shrink-0 text-[11px] font-semibold text-[#7B858C]">
              {formatRecordingDuration(Math.floor(currentTime))} / {playableDuration ? formatRecordingDuration(Math.floor(playableDuration)) : "--:--"}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8EEF1]">
            <div className="h-full rounded-full bg-[#2F8FB3]" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <button type="button" onClick={onRemove} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6EDEA] text-[#C83F31]" aria-label="Remove voice note" disabled={disabled}>
          <XIcon />
        </button>
      </div>
    </div>
  );
}

function useSignedAttachmentUrls(programId: string, source: "announcement" | "note", messageId: string, attachmentIds: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const attachmentIdsKey = attachmentIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (!attachmentIdsKey) {
      return;
    }
    (async () => {
      const token = await getCurrentAccessToken();
      if (!token) {
        return;
      }
      const response = await fetch(`/api/programs/${programId}/message-attachments/signed-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source, messageId }),
      });
      const result = (await response.json().catch(() => ({}))) as { urls?: Record<string, string> };
      if (!cancelled && result.urls) {
        setUrls(result.urls);
      }
    })().catch(() => null);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, source, messageId, attachmentIdsKey]);

  return urls;
}

export function MessageAttachmentList({
  attachments,
  programId,
  source,
  messageId,
}: {
  attachments: MessageAttachment[];
  programId: string;
  source: "announcement" | "note";
  messageId: string;
}) {
  const signedUrls = useSignedAttachmentUrls(
    programId,
    source,
    messageId,
    attachments.map((attachment) => attachment.id),
  );
  if (!attachments.length) {
    return null;
  }
  return (
    <div className="mt-3 grid gap-2">
      {attachments.map((attachment) => {
        const url = signedUrls[attachment.id];
        if (!url) {
          return (
            <div key={attachment.id} className="flex min-h-12 items-center gap-2 rounded-[14px] border border-[#DDE6EA] bg-white px-3 py-2 text-xs font-medium text-[#7B858C]">
              <span className="h-4 w-4 animate-pulse rounded-full bg-[#BFE0EC]" aria-hidden />
              Loading attachment...
            </div>
          );
        }
        return (
          <div key={attachment.id} className="overflow-hidden rounded-[14px] border border-[#DDE6EA] bg-white">
            {attachment.kind === "image" ? (
              <a href={url} target="_blank" rel="noreferrer" className="block">
                <img src={url} alt={attachmentDisplayName(attachment)} className="max-h-72 w-full object-cover" />
              </a>
            ) : attachment.kind === "audio" ? (
              <div className="space-y-2 px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#26323A]">
                  <MicIcon />
                  <span className="min-w-0 truncate">{attachmentDisplayName(attachment)}</span>
                  <span className="ml-auto shrink-0 text-[11px] font-medium text-[#7B858C]">{formatAttachmentSize(attachment.size)}</span>
                </div>
                <audio controls src={url} className="w-full" />
              </div>
            ) : (
              <a href={url} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm font-semibold text-[#17624F]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7]" aria-hidden>
                  <FileIcon />
                </span>
                <span className="min-w-0 flex-1 truncate">{attachmentDisplayName(attachment)}</span>
                <span className="shrink-0 text-xs text-[#7B858C]">{formatAttachmentSize(attachment.size)}</span>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

const scheduleTimeOptions = Array.from({ length: 33 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

export function TeacherScheduleData({ slug, programId }: { slug: string; programId: string }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [rows, setRows] = useState<ProgramScheduleRow[]>([]);
  const [initialRows, setInitialRows] = useState<ProgramScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSchedule() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const { data: mosque, error: mosqueError } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
    if (mosqueError || !mosque) {
      setError(friendlyErrorMessage(mosqueError, "Masjid not found."));
      setLoading(false);
      return;
    }

    const { data: programRow, error: programError } = await supabase
      .from("programs")
      .select("*")
      .eq("id", programId)
      .eq("mosque_id", mosque.id)
      .maybeSingle();

    if (programError || !programRow) {
      setError(friendlyErrorMessage(programError, "Class not found."));
      setLoading(false);
      return;
    }

    const parsedRows = parseProgramSchedule(programRow.schedule);
    setProgram(programRow);
    setRows(parsedRows);
    setInitialRows(parsedRows);
    setLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadSchedule();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, slug]);

  function toggleDay(day: (typeof scheduleDayOptions)[number]) {
    setSaved(false);
    setRows((currentRows) => {
      if (currentRows.some((row) => row.day === day)) {
        return currentRows.filter((row) => row.day !== day);
      }
      const nextRows = [...currentRows, { day, start: "18:00", end: "20:00" }];
      return sortScheduleRows(nextRows);
    });
  }

  function updateRow(day: (typeof scheduleDayOptions)[number], key: "start" | "end", value: string) {
    setSaved(false);
    setRows((currentRows) => currentRows.map((row) => (row.day === day ? { ...row, [key]: value } : row)));
  }

  async function saveSchedule() {
    if (!program) {
      return;
    }

    const invalidRow = rows.find((row) => row.end <= row.start);
    if (invalidRow) {
      setError(`${invalidRow.day} needs an end time after its start time.`);
      return;
    }

    setSaving(true);
    setError(null);
    const schedule = rows.map((row) => ({ day: row.day, start: row.start, end: row.end })) as Json;
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("programs")
      .update({
        schedule,
        schedule_notes: rows.length ? null : "Schedule TBA",
      })
      .eq("id", program.id);

    if (updateError) {
      setError(friendlyErrorMessage(updateError, "Could not save this schedule."));
      setSaving(false);
      return;
    }

    const nextProgram = { ...program, schedule, schedule_notes: rows.length ? null : "Schedule TBA" };
    setProgram(nextProgram);
    setInitialRows(rows);
    invalidateProgramCaches(slug, program.id);
    window.dispatchEvent(new Event("tareeqah:programs-changed"));
    setSaved(true);
    setSaving(false);
  }

  if (loading) {
    return <DirectorySkeleton layout="schedule" />;
  }

  if (error && !program) {
    return <EmptyState title="Could not load schedule" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This schedule could not be loaded." />;
  }

  return (
    <section className="bg-[var(--workspace)] p-4">
      <div className="space-y-5 rounded-[28px] bg-white p-5 shadow-[0_12px_32px_rgba(38,50,58,0.08)]">
        <div>
          <h2 className="text-2xl font-semibold leading-8 text-[#26323A]">Class schedule</h2>
          <p className="mt-2 text-sm leading-6 text-[#6B747B]">Choose any number of class days, then set the time range for each selected day.</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Class</p>
          <h3 className="mt-1 text-lg font-semibold text-[#26323A]">{program.title}</h3>
          <p className="mt-1 text-sm text-[#6B747B]">{scheduleSummary(program.schedule, program.schedule_notes).full}</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-[#26323A]">Available days</h3>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {scheduleDayOptions.map((day) => {
              const selected = rows.some((row) => row.day === day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "min-h-10 rounded-[6px] border px-2 text-sm font-semibold transition-colors",
                    selected ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#D6DCE0] bg-white text-[#26323A] hover:border-[#8ABFB3]",
                  )}
                >
                  {formatDayAbbreviation(day)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-[#26323A]">Hours</h3>
          <p className="mt-1 text-sm text-[#6B747B]">Set the start and end time for each class day.</p>
          <div className="mt-4 space-y-4">
            {rows.length ? (
              rows.map((row) => (
                <div key={row.day}>
                  <p className="mb-2 text-sm font-semibold text-[#26323A]">{row.day}</p>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <select value={row.start} onChange={(event) => updateRow(row.day, "start", event.target.value)} className="h-11 rounded-[6px] border border-[#D6DCE0] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]">
                      {scheduleTimeOptions.map((time) => (
                        <option key={time} value={time}>{formatClockLabel(time)}</option>
                      ))}
                    </select>
                    <span className="text-sm text-[#6B747B]">to</span>
                    <select value={row.end} onChange={(event) => updateRow(row.day, "end", event.target.value)} className="h-11 rounded-[6px] border border-[#D6DCE0] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]">
                      {scheduleTimeOptions.map((time) => (
                        <option key={time} value={time}>{formatClockLabel(time)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] px-4 py-6 text-center text-sm text-[#6B747B]">
                Select one or more days to build this class schedule.
              </div>
            )}
          </div>
        </div>

        {error ? <div className="rounded-[18px] border border-[#F4C7C1] bg-[#FDEDEA] px-4 py-3 text-sm text-[#A4352A]">{error}</div> : null}
        {saved ? <div className="rounded-[18px] border border-[#BEE5D4] bg-[#EAF8F1] px-4 py-3 text-sm text-[#17624F]">Schedule saved.</div> : null}

        <div className="flex justify-end gap-3 border-t border-[#EEF2F4] pt-4">
          <button type="button" onClick={() => { setRows(initialRows); setError(null); setSaved(false); }} className="min-h-10 rounded-[6px] border border-[#D6DCE0] bg-white px-5 text-sm font-semibold text-[#26323A] hover:bg-[var(--workspace)]">
            Cancel
          </button>
          <button type="button" onClick={saveSchedule} disabled={saving} className="min-h-10 rounded-[6px] bg-[#17624F] px-5 text-sm font-semibold text-white hover:bg-[#0F4537] disabled:opacity-60">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function TeacherHomeData({ slug }: { slug: string }) {
  const { programs, currentUserId, loading, error } = useTeacherPrograms(slug);
  const { totalCount: inboxItemCount, actionRequired: inboxActionRequired } = useTeacherNotificationCounts(currentUserId ? slug : "");

  if (loading) {
    return <HomeLoadingState />;
  }

  if (error) {
    return <EmptyState title="Could not load teacher home" text={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-4 bg-[var(--workspace)] p-4">
      <AddToHomeScreenNudge slug={slug} settingsHref={`/m/${slug}/teacher/account`} />
      {inboxItemCount > 0 ? (
        <HomeNotification
          tone="active"
          title={inboxActionRequired ? "Action required" : "Attention"}
          text={inboxActionRequired ? "Your inbox contains messages that require an action from you." : "Your inbox contains unread messages."}
          href={`/m/${slug}/teacher/inbox`}
        />
      ) : null}
      <HomeSectionTitle title="Upcoming" />
      {programs.length ? <HomeUpcomingRows programs={programs} canCancelSessions currentUserId={currentUserId} slug={slug} /> : <EmptyState title="No assigned classes" text="Your next class sessions will appear here." />}
    </div>
  );
}

export function AdminHomeData({ slug }: { slug: string }) {
  const { programs, loading, error } = useAdminProgramsWithTracks(slug);

  if (loading) {
    return <HomeLoadingState />;
  }

  if (error) {
    return <EmptyState title="Could not load admin home" text={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-4 bg-[var(--workspace)] p-4">
      <AddToHomeScreenNudge slug={slug} settingsHref={`/m/${slug}/admin/settings`} />
      <HomeSectionTitle title="Upcoming" />
      {programs.length ? <HomeUpcomingRows programs={programs} /> : <EmptyState title="No classes yet" text="All masjid class sessions will appear here after classes are created." />}
    </div>
  );
}

export function TeacherClassesData({ slug }: { slug: string }) {
  const { programs, allPrograms, roleByProgramId, financeAccessByProgramId, programCounts, canCreateClass, loading, error } = useTeacherPrograms(slug);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTeacherClassesTab = searchParams.get("tab");
  const [tab, setTab] = useState<"mine" | "other">(initialTeacherClassesTab === "other" ? "other" : "mine");
  const [hiddenProgramIds, setHiddenProgramIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<EditorToastState | null>(null);

  useEffect(() => {
    const nextTab = searchParams.get("tab");
    if (nextTab === "mine" || nextTab === "other") {
      setTab(nextTab);
    }
  }, [searchParams]);

  function changeTeacherClassesTab(nextTab: "mine" | "other") {
    setTab(nextTab);
    router.replace(`/m/${slug}/teacher/classes?tab=${nextTab}`, { scroll: false });
  }

  useEffect(() => {
    const queuedToast = readQueuedEditorToast();
    if (queuedToast) {
      setToast(queuedToast);
    }
  }, []);

  useEffect(() => {
    if (loading || error || !programs.length) {
      return;
    }
    let cancelled = false;
    // Warm the public-page cache for each assigned class -- the cover/title now always opens
    // that page, so by the time a teacher taps in it should already be cached, not a cold fetch.
    loadCachedSession().then((session) => {
      if (cancelled) {
        return;
      }
      const userId = session?.user.id ?? null;
      for (const program of programs.slice(0, 6)) {
        prefetchQuery(`program-detail:${slug}:${program.id}:public:${userId ?? "guest"}`, () => fetchProgramDetailSnapshot(slug, program.id, "public", userId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loading, error, programs, slug]);

  if (loading) {
    return <ClassesLoadingPlaceholders count={2} />;
  }

  if (error) {
    return <EmptyState title="Could not load classes" text={error} onRetry={() => window.location.reload()} />;
  }

  const visiblePrograms = programs.filter((program) => !hiddenProgramIds.has(program.id));
  const assignedProgramIds = new Set(programs.map((program) => program.id));
  const otherPrograms = allPrograms.filter((program) => !assignedProgramIds.has(program.id) && program.is_active);

  return (
    <section className="bg-[var(--workspace)]">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="grid grid-cols-2 border-b border-[#D6DCE0] md:hidden">
        <button
          type="button"
          onClick={() => changeTeacherClassesTab("mine")}
          className={cn("min-h-12 text-sm font-medium", tab === "mine" ? "border-b-2 border-[#2F8FB3] text-[#2F8FB3]" : "text-[#6B747B]")}
        >
          My Classes
        </button>
        <button
          type="button"
          onClick={() => changeTeacherClassesTab("other")}
          className={cn("min-h-12 text-sm font-medium", tab === "other" ? "border-b-2 border-[#2F8FB3] text-[#2F8FB3]" : "text-[#6B747B]")}
        >
          Other Classes
        </button>
      </div>

      <div className="space-y-4 p-4">
        {tab === "mine" ? (
          <>
          {visiblePrograms.length === 0 ? (
            <EmptyState title="No assigned classes" text="Classes you direct or instruct will appear here." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {visiblePrograms.map((program) => (
                <TeacherClassCard
                  key={program.id}
                  program={program}
                  mosqueSlug={slug}
                  role={roleByProgramId[program.id] ?? "instructor"}
                  canManageFinances={financeAccessByProgramId[program.id] ?? false}
                  counts={programCounts[program.id]}
                  onResigned={() => {
                    setHiddenProgramIds((current) => new Set([...current, program.id]));
                    setToast({ tone: "success", message: "You resigned from the class." });
                  }}
                  onResignError={(message) => setToast({ tone: "error", message })}
                  onDeleted={() => {
                    setHiddenProgramIds((current) => new Set([...current, program.id]));
                    setToast({ tone: "success", message: "Class deleted." });
                  }}
                  onDeleteError={(message) => setToast({ tone: "error", message })}
                />
              ))}
            </div>
          )}
            <TeacherWorkspaceTools slug={slug} mode="create" canCreateClass={canCreateClass} />
          </>
        ) : (
          <>
            <TeacherWorkspaceTools slug={slug} mode="invite" canCreateClass={canCreateClass} />
          {otherPrograms.length === 0 ? (
            <EmptyState title="No other classes" text="Every active class at this masjid is already assigned to you." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {otherPrograms.map((program) => (
                <TeacherOtherClassCard key={program.id} program={program} mosqueSlug={slug} />
              ))}
            </div>
          )}
          </>
        )}
      </div>
    </section>
  );
}

export function AdminClassesData({ slug }: { slug: string }) {
  const { programs, programCounts, canCreateClass, loading, error } = useTeacherPrograms(slug);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [hiddenProgramIds, setHiddenProgramIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const queuedToast = readQueuedEditorToast();
    if (queuedToast) {
      setToast(queuedToast);
    }
  }, []);

  useEffect(() => {
    if (loading || error || !programs.length) {
      return;
    }
    let cancelled = false;
    // Warm the public-page cache for each class -- the cover/title now always opens
    // that page, so by the time an admin taps in it should already be cached, not a cold fetch.
    loadCachedSession().then((session) => {
      if (cancelled) {
        return;
      }
      const userId = session?.user.id ?? null;
      for (const program of programs.slice(0, 6)) {
        prefetchQuery(`program-detail:${slug}:${program.id}:public:${userId ?? "guest"}`, () => fetchProgramDetailSnapshot(slug, program.id, "public", userId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loading, error, programs, slug]);

  if (loading) {
    return <ClassesLoadingPlaceholders count={3} />;
  }

  if (error) {
    return <EmptyState title="Could not load classes" text={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <section className="space-y-4 bg-[var(--workspace)] p-4">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <AdminMosqueSwitcher slug={slug} target="programs" />
      {programs.filter((program) => !hiddenProgramIds.has(program.id)).length === 0 ? (
        <EmptyState title="No classes yet" text="Classes created for this masjid will appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.filter((program) => !hiddenProgramIds.has(program.id)).map((program) => (
            <TeacherClassCard
              key={program.id}
              program={program}
              mosqueSlug={slug}
              role="director"
              basePath={`/m/${slug}/admin/programs`}
              controlLabel="Admin Control"
              canManageFinances
              counts={programCounts[program.id]}
              onDeleted={() => {
                setHiddenProgramIds((current) => new Set([...current, program.id]));
                setToast({ tone: "success", message: "Class deleted." });
              }}
              onDeleteError={(message) => setToast({ tone: "error", message })}
            />
          ))}
        </div>
      )}
      <TeacherWorkspaceTools slug={slug} mode="create" canCreateClass={canCreateClass} createHref={`/m/${slug}/admin/programs/new`} />
    </section>
  );
}

function AdminMosqueSwitcher({ slug, target = "programs" }: { slug: string; target?: "programs" | "masjid" | "finances" }) {
  const router = useRouter();
  const [mosques, setMosques] = useState<Array<Pick<Mosque, "id" | "name" | "slug">>>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        const session = await loadCachedSession();
        const userId = session?.user.id;
        if (!userId) {
          setMosques([]);
          return;
        }
        const supabase = createSupabaseBrowserClient();
        const { data: memberships } = await supabase
          .from("mosque_memberships")
          .select("mosque_id")
          .eq("profile_id", userId)
          .eq("role", "admin")
          .eq("status", "active");
        const mosqueIds = (memberships ?? []).map((membership) => membership.mosque_id);
        const { data } = mosqueIds.length
          ? await supabase.from("mosques").select("id, name, slug").in("id", mosqueIds).order("name", { ascending: true })
          : { data: [] as Array<Pick<Mosque, "id" | "name" | "slug">> };
        setMosques(data ?? []);
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  if (mosques.length <= 1) {
    return null;
  }

  return (
    <label className="block rounded-[18px] border border-[#D6DCE0] bg-white p-3 shadow-[0_8px_22px_rgba(38,50,58,0.05)]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7B858C]">Viewing masjid</span>
      <select
        value={slug}
        onChange={(event) => router.push(`/m/${event.target.value}/admin/${target === "masjid" ? "masjid" : target === "finances" ? "finances" : "programs"}`)}
        className="mt-2 h-11 w-full rounded-[12px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]"
      >
        {mosques.map((mosque) => (
          <option key={mosque.id} value={mosque.slug}>{mosque.name}</option>
        ))}
      </select>
    </label>
  );
}

type AdminMasjidSnapshot = { mosque: Mosque | null; memberCount: number; error: string | null };
const emptyAdminMasjidSnapshot: AdminMasjidSnapshot = { mosque: null, memberCount: 0, error: null };

async function fetchAdminMasjidSnapshot(slug: string): Promise<AdminMasjidSnapshot> {
  const supabase = createSupabaseBrowserClient();
  const { data, error: mosqueError } = await supabase.from("mosques").select("*").eq("slug", slug).maybeSingle();
  if (mosqueError) {
    return { mosque: null, memberCount: 0, error: friendlyErrorMessage(mosqueError, "Could not load your masjid.") };
  }
  if (!data) {
    return emptyAdminMasjidSnapshot;
  }
  const { count } = await supabase.from("mosque_memberships").select("*", { count: "exact", head: true }).eq("mosque_id", data.id).eq("status", "active");
  return { mosque: data, memberCount: count ?? 0, error: null };
}

export function AdminMasjidData({ slug }: { slug: string }) {
  const { data: snapshot, loading } = useCachedQuery(slug ? `admin-masjid:${slug}` : null, () => fetchAdminMasjidSnapshot(slug));
  const { mosque, memberCount, error } = snapshot ?? emptyAdminMasjidSnapshot;

  if (loading) {
    return <ClassesLoadingPlaceholders count={1} />;
  }

  if (error) {
    return <EmptyState title="Could not load masjid" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!mosque) {
    return <EmptyState title="Masjid not found" text="This masjid could not be loaded." />;
  }

  return (
    <section className="space-y-4 bg-[var(--workspace)] p-4">
      <AdminMosqueSwitcher slug={slug} target="masjid" />
      <article className="overflow-hidden rounded-[24px] border border-[#CBD8DE] bg-white shadow-[0_16px_40px_rgba(38,50,58,0.09)]">
        <div className="relative h-44 bg-[#EAF4F2]">
          {mosque.picture_url ? (
            <Image src={mosque.picture_url} alt="" fill sizes="420px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-semibold text-[#17624F]">{initials(mosque.name)}</div>
          )}
        </div>
        <div className="space-y-4 p-4">
          <div>
            <span className="inline-flex min-h-7 items-center rounded-full bg-[#E7F3F8] px-3 text-xs font-bold uppercase tracking-wide text-[#2F6077]">Masjid Control</span>
            <h2 className="mt-3 text-2xl font-semibold leading-7 text-[#26323A]">{mosqueSlugLabel(mosque)}</h2>
          </div>
          <div className="divide-y divide-[#E3E8EC] border-t border-[#E3E8EC]">
            <TeacherActionLink href={`/m/${slug}/admin/masjid/information`} icon={<EditClassIcon />} label="Masjid Information" />
            <TeacherActionLink href={`/m/${slug}/admin/students`} icon={<StudentsIcon />} label="Manage Members" count={memberCount} />
            <TeacherActionLink href={`/m/${slug}/admin/finances`} icon={<FinanceIcon />} label="Manage Finances" />
          </div>
        </div>
      </article>
    </section>
  );
}

export function AdminMasjidInformationData({ slug }: { slug: string }) {
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editableSlug, setEditableSlug] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [pictureUrl, setPictureUrl] = useState("");
  const [pwaName, setPwaName] = useState("");
  const [shortName, setShortName] = useState("");
  const [appIconUrl, setAppIconUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [appIconFile, setAppIconFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [picturePreview, setPicturePreview] = useState("");
  const [appIconPreview, setAppIconPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [cropTarget, setCropTarget] = useState<{ file: File; kind: "logo" | "picture" | "appIcon" } | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);
  const appIconInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        const session = await loadCachedSession();
        if (!session?.user.id) {
          setError("Log in required.");
          setLoading(false);
          return;
        }
        const access = await loadCachedUserAccess(slug, session.user.id);
        if (!access.isMosqueAdmin) {
          setError("Admin access required.");
          setLoading(false);
          return;
        }
        const { data, error: mosqueError } = await createSupabaseBrowserClient().from("mosques").select("*").eq("slug", slug).maybeSingle();
        if (mosqueError) {
          setError(friendlyErrorMessage(mosqueError, "Could not load your masjid."));
        }
        setMosque(data ?? null);
        setName(data?.name ?? "");
        setEditableSlug(data?.slug ?? slug);
        setAddress(data?.address ?? "");
        setLogoUrl(data?.logo_url ?? "");
        setPictureUrl(data?.picture_url ?? "");
        setPwaName(data?.pwa_name ?? "");
        setShortName(data?.short_name ?? "");
        setAppIconUrl(data?.app_icon_url ?? "");
        setLogoFile(null);
        setPictureFile(null);
        setAppIconFile(null);
        setLoading(false);
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [slug]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview("");
      return;
    }
    const nextUrl = URL.createObjectURL(logoFile);
    setLogoPreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [logoFile]);

  useEffect(() => {
    if (!pictureFile) {
      setPicturePreview("");
      return;
    }
    const nextUrl = URL.createObjectURL(pictureFile);
    setPicturePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [pictureFile]);

  useEffect(() => {
    if (!appIconFile) {
      setAppIconPreview("");
      return;
    }
    const nextUrl = URL.createObjectURL(appIconFile);
    setAppIconPreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [appIconFile]);

  async function uploadMosqueMedia(kind: "logo" | "picture" | "appIcon", file: File) {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      throw new Error("Log in required.");
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    const response = await fetch(`/api/mosques/${slug}/media/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });
    const result = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      throw new Error(result.error ?? "Could not upload image.");
    }
    return result.url;
  }

  async function saveMasjidInformation() {
    setToast(null);
    if (!name.trim()) {
      setToast({ tone: "error", message: "Masjid name is required." });
      return;
    }

    setSaving(true);
    try {
      const accessToken = await getCurrentAccessToken();
      if (!accessToken) {
        throw new Error("Log in required.");
      }

      const nextLogoUrl = logoFile ? await uploadMosqueMedia("logo", logoFile) : logoUrl.trim();
      const nextPictureUrl = pictureFile ? await uploadMosqueMedia("picture", pictureFile) : pictureUrl.trim();
      const nextAppIconUrl = appIconFile ? await uploadMosqueMedia("appIcon", appIconFile) : appIconUrl.trim();
      const response = await fetch(`/api/mosques/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: name.trim(),
          slug: editableSlug.trim(),
          address: address.trim() || null,
          logoUrl: nextLogoUrl || null,
          pictureUrl: nextPictureUrl || null,
          pwaName: pwaName.trim() || null,
          shortName: shortName.trim() || null,
          appIconUrl: nextAppIconUrl || null,
        }),
      });
      const result = (await response.json()) as { mosque?: Mosque; error?: string };
      if (!response.ok || !result.mosque) {
        throw new Error(result.error ?? "Could not update masjid.");
      }

      setMosque(result.mosque);
      setName(result.mosque.name);
      setEditableSlug(result.mosque.slug);
      setAddress(result.mosque.address ?? "");
      setLogoUrl(result.mosque.logo_url ?? "");
      setPictureUrl(result.mosque.picture_url ?? "");
      setPwaName(result.mosque.pwa_name ?? "");
      setShortName(result.mosque.short_name ?? "");
      setAppIconUrl(result.mosque.app_icon_url ?? "");
      setLogoFile(null);
      setPictureFile(null);
      setAppIconFile(null);
      setToast({ tone: "success", message: "Masjid information updated." });
      if (result.mosque.slug !== slug) {
        window.location.href = `/m/${result.mosque.slug}/admin/masjid/information`;
        return;
      }
    } catch (saveError) {
      setToast({ tone: "error", message: saveError instanceof Error ? saveError.message : "Could not update masjid." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <ClassesLoadingPlaceholders count={1} />;
  }

  if (error) {
    return <EmptyState title="Could not load masjid" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!mosque) {
    return <EmptyState title="Masjid not found" text="This masjid could not be loaded." />;
  }

  const activeLogo = logoPreview || logoUrl;
  const activePicture = picturePreview || pictureUrl;
  const activeAppIcon = appIconPreview || appIconUrl || activeLogo;

  return (
    <section className="space-y-4 bg-[var(--workspace)] p-3 sm:p-4">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <article className="w-full max-w-full overflow-hidden rounded-[24px] border border-[#CBD8DE] bg-white shadow-[0_16px_40px_rgba(38,50,58,0.09)]">
        <div className="relative h-40 bg-[#EAF4F2]">
          {activePicture ? (
            <img src={activePicture} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-semibold text-[#17624F]">{initials(name || mosque.name)}</div>
          )}
          <button
            type="button"
            onClick={() => pictureInputRef.current?.click()}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#26323A] shadow-lg"
            aria-label="Change thumbnail"
            title="Change thumbnail"
          >
            <PhotoIcon />
          </button>
          <input
            ref={pictureInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              if (file) {
                setCropTarget({ file, kind: "picture" });
              }
            }}
          />
        </div>
        <div className="space-y-5 p-3 sm:p-4">
          <div>
            <span className="inline-flex min-h-7 items-center rounded-full bg-[#E7F3F8] px-3 text-xs font-bold uppercase tracking-wide text-[#2F6077]">Masjid Information</span>
            <h2 className="mt-3 text-2xl font-semibold leading-7 text-[#26323A]">{titleCase(editableSlug || mosque.slug)}</h2>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="h-12 min-w-0 rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]" />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">Slug</span>
              <input value={editableSlug} onChange={(event) => setEditableSlug(event.target.value)} className="h-12 min-w-0 rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]" placeholder="assiddiq" />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">Address</span>
              <input value={address} onChange={(event) => setAddress(event.target.value)} className="h-12 min-w-0 rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]" placeholder="Masjid address" />
            </label>
            <div className="grid gap-3 rounded-[18px] border border-[#E1E8EC] bg-[#F8FAFA] p-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">Logo</span>
              <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-[#DDE5E9] bg-white">
                  {activeLogo ? <img src={activeLogo} alt="" className="h-full w-full object-contain" /> : <span className="text-lg font-semibold text-[#17624F]">{initials(name || mosque.name)}</span>}
                </div>
                <div className="min-w-0">
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="min-h-10 rounded-full bg-[#26323A] px-4 text-sm font-semibold text-white">
                    Change logo
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      if (file) {
                        setCropTarget({ file, kind: "logo" });
                      }
                    }}
                  />
                  {logoFile ? <p className="mt-2 truncate text-xs text-[#7B858C]">{logoFile.name}</p> : null}
                </div>
              </div>
            </div>
            <div className="grid gap-3 rounded-[18px] border border-[#D7E4E8] bg-white p-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">Installed app branding</span>
                <p className="mt-1 text-xs leading-5 text-[#68747C]">Used for the PWA name and home-screen icon on this masjid subdomain.</p>
              </div>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">App display name</span>
                <input value={pwaName} onChange={(event) => setPwaName(event.target.value)} className="h-12 min-w-0 rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]" placeholder={name || "Assiddiq"} />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">Short name</span>
                <input value={shortName} onChange={(event) => setShortName(event.target.value)} className="h-12 min-w-0 rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]" placeholder={(pwaName || name || "Madrasa").slice(0, 24)} maxLength={24} />
              </label>
              <div className="grid gap-3 rounded-[16px] border border-[#E1E8EC] bg-[#F8FAFA] p-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B858C]">App icon</span>
                <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-[#DDE5E9] bg-white">
                    {activeAppIcon ? <img src={activeAppIcon} alt="" className="h-full w-full object-contain" /> : <span className="text-lg font-semibold text-[#17624F]">{initials(name || mosque.name)}</span>}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <button type="button" onClick={() => appIconInputRef.current?.click()} className="min-h-10 rounded-full bg-[#26323A] px-4 text-sm font-semibold text-white">
                      Change app icon
                    </button>
                    <input
                      ref={appIconInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.target.value = "";
                        if (file) {
                          setCropTarget({ file, kind: "appIcon" });
                        }
                      }}
                    />
                    <input value={appIconUrl} onChange={(event) => setAppIconUrl(event.target.value)} className="h-10 min-w-0 rounded-[10px] border border-[#D9E1E5] bg-white px-3 text-xs font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]" placeholder="Icon URL, or upload an icon" />
                  </div>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => void saveMasjidInformation()} disabled={saving} className="min-h-12 rounded-full bg-[#2F8FB3] px-5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save masjid information"}
            </button>
          </div>
        </div>
      </article>
      {cropTarget ? (
        <ImageCropModal
          file={cropTarget.file}
          title={cropTarget.kind === "picture" ? "Crop cover picture" : cropTarget.kind === "logo" ? "Crop logo" : "Crop app icon"}
          aspectRatio={cropTarget.kind === "picture" ? 16 / 9 : 1}
          outputWidth={cropTarget.kind === "picture" ? 1280 : 512}
          outputHeight={cropTarget.kind === "picture" ? 720 : 512}
          onCancel={() => setCropTarget(null)}
          onConfirm={(croppedFile) => {
            if (cropTarget.kind === "picture") {
              setPictureFile(croppedFile);
            } else if (cropTarget.kind === "logo") {
              setLogoFile(croppedFile);
            } else {
              setAppIconFile(croppedFile);
            }
            setCropTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

type AdminMasjidFinancesSnapshot = { programs: Program[]; error: string | null };
const emptyAdminMasjidFinancesSnapshot: AdminMasjidFinancesSnapshot = { programs: [], error: null };

async function fetchAdminMasjidFinancesSnapshot(slug: string): Promise<AdminMasjidFinancesSnapshot> {
  const supabase = createSupabaseBrowserClient();
  const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
  if (!mosque) {
    return { programs: [], error: "Masjid not found." };
  }
  const { data, error: programsError } = await supabase.from("programs").select("*").eq("mosque_id", mosque.id).order("title", { ascending: true });
  if (programsError) {
    return { programs: [], error: friendlyErrorMessage(programsError, "Could not load classes.") };
  }
  return { programs: data ?? [], error: null };
}

export function AdminMasjidFinancesData({ slug }: { slug: string }) {
  const { data: snapshot, loading } = useCachedQuery(slug ? `admin-masjid-finances:${slug}` : null, () => fetchAdminMasjidFinancesSnapshot(slug));
  const { programs, error } = snapshot ?? emptyAdminMasjidFinancesSnapshot;
  const [selectedProgramId, setSelectedProgramId] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedProgramId((current) => current || programs[0]?.id || "");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [programs]);

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  if (error) {
    return <EmptyState title="Could not load finances" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!programs.length) {
    return (
      <section className="space-y-4 bg-white p-4">
        <AdminMosqueSwitcher slug={slug} target="finances" />
        <EmptyState title="No classes yet" text="Create a class before managing finances." />
      </section>
    );
  }

  return (
    <section className="space-y-4 bg-white p-4 pb-28">
      <AdminMosqueSwitcher slug={slug} target="finances" />
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7B858C]">Class finances</span>
        <select
          value={selectedProgramId}
          onChange={(event) => setSelectedProgramId(event.target.value)}
          className="mt-2 h-11 w-full rounded-[12px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]"
        >
          {programs.map((program) => (
            <option key={program.id} value={program.id}>{program.title}</option>
          ))}
        </select>
      </label>
      {selectedProgramId ? <ProgramFinancesData slug={slug} programId={selectedProgramId} mode="admin" /> : null}
    </section>
  );
}

type TeacherInstructorsGateSnapshot = { program: Program | null; isDirector: boolean; error: string | null };
const emptyTeacherInstructorsGateSnapshot: TeacherInstructorsGateSnapshot = { program: null, isDirector: false, error: null };

async function fetchTeacherInstructorsGate(slug: string, programId: string): Promise<TeacherInstructorsGateSnapshot> {
  const supabase = createSupabaseBrowserClient();
  const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
  if (!mosque) {
    return emptyTeacherInstructorsGateSnapshot;
  }

  const [{ data: programRow, error: programError }, { data: directorAllowed }] = await Promise.all([
    supabase.from("programs").select("*").eq("id", programId).eq("mosque_id", mosque.id).maybeSingle(),
    supabase.rpc("is_program_director", { check_program_id: programId }),
  ]);

  if (programError) {
    return { program: null, isDirector: false, error: friendlyErrorMessage(programError, "Could not load this class.") };
  }

  return { program: programRow ?? null, isDirector: Boolean(directorAllowed), error: null };
}

export function TeacherInstructorsData({ slug, programId }: { slug: string; programId: string }) {
  const { data: gateSnapshot, loading } = useCachedQuery(programId ? `teacher-instructors-gate:${slug}:${programId}` : null, () => fetchTeacherInstructorsGate(slug, programId));
  const { program, isDirector, error } = gateSnapshot ?? emptyTeacherInstructorsGateSnapshot;

  if (loading) {
    return <ClassesLoadingPlaceholders count={1} />;
  }

  if (error) {
    return <EmptyState title="Could not load instructors" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This class may no longer be available." />;
  }

  if (!isDirector) {
    return <EmptyState title="Director access required" text="Only the class director can manage instructors for this class." />;
  }

  return (
    <div className="bg-white p-4">
      <ProgramTeacherStaffTools program={program} />
    </div>
  );
}

export function TeacherProgramCreateData({ slug }: { slug: string }) {
  const [builderStep, setBuilderStep] = useState<ProgramBuilderStep>("basics");
  const [builderStatus, setBuilderStatus] = useState<ProgramBuilderStatus>(() => defaultBuilderStatus());
  const [creatorAccountType, setCreatorAccountType] = useState<string | null>(null);
  const [directorOptions, setDirectorOptions] = useState<DirectorOption[]>([]);
  const [selectedDirectorId, setSelectedDirectorId] = useState("");
  const [title, setTitle] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tagRows, setTagRows] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [allAges, setAllAges] = useState(false);
  const [ageStart, setAgeStart] = useState("");
  const [ageEnd, setAgeEnd] = useState("");
  const [noRegistrationDeadline, setNoRegistrationDeadline] = useState(false);
  const [roomVisible, setRoomVisible] = useState(false);
  const [eventTimeVisible, setEventTimeVisible] = useState(false);
  const [audienceGender, setAudienceGender] = useState("all");
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("");
  const [offersMonthlyPayment, setOffersMonthlyPayment] = useState(true);
  const [offersAnnualPayment, setOffersAnnualPayment] = useState(false);
  const [annualPrice, setAnnualPrice] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [learningVisible, setLearningVisible] = useState(false);
  const [learningTitle, setLearningTitle] = useState("What You Will Learn");
  const [learningIntro, setLearningIntro] = useState("");
  const [learningDescriptionVisible, setLearningDescriptionVisible] = useState(false);
  const [topicsIntro, setTopicsIntro] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [policiesText, setPoliciesText] = useState("");
  const [outcomeRows, setOutcomeRows] = useState<Array<{ id: string; text: string }>>([]);
  const [faqVisible, setFaqVisible] = useState(false);
  const [faqRows, setFaqRows] = useState<ProgramEditorFaqRow[]>([]);
  const [contentSectionsVisible, setContentSectionsVisible] = useState(false);
  const [contentSectionRows, setContentSectionRows] = useState<ProgramEditorContentSectionRow[]>([]);
  const [mediaVisible, setMediaVisible] = useState(false);
  const [mediaRows, setMediaRows] = useState<ProgramEditorMediaRow[]>([]);
  const [trackRows, setTrackRows] = useState<ProgramEditorTrackRow[]>([
    { id: crypto.randomUUID(), name: "Main Track", sessions: [{ day: "Monday", start: "18:00", end: "20:00" }] },
  ]);
  const [transferRules, setTransferRules] = useState<ProgramEditorTransferRule[]>([]);
  const [trackSelectionMode, setTrackSelectionMode] = useState<TrackSelectionMode>("exact");
  const [trackSelectionCount, setTrackSelectionCount] = useState(1);
  const [instructorDisplayName, setInstructorDisplayName] = useState("");
  const [instructorCredentials, setInstructorCredentials] = useState("");
  const [instructorContactPhone, setInstructorContactPhone] = useState("");
  const [coverDirectorVisibility, setCoverDirectorVisibility] = useState("name_and_photo");
  const [contactPhoneOmitted, setContactPhoneOmitted] = useState(false);
  const [contactEmailOmitted, setContactEmailOmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [missingFieldsModal, setMissingFieldsModal] = useState<{ fields: ProgramBuilderMissingField[]; allowContinue: boolean } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const [thumbnailCropFile, setThumbnailCropFile] = useState<File | null>(null);
  // Annual pricing is compared against one year of monthly payments: 12 months for an
  // ongoing program (which bills annually, not for a known total length), or the program's
  // actual fixed duration for a fixed-length program (its annual price is a one-time lump
  // sum covering that whole length, not a yearly renewal).
  const pricingDurationMonths =
    builderStatus.durationType === "ongoing"
      ? "12"
      : builderStatus.billingDurationMonths || String(builderStatus.durationMonths || monthsBetweenDates(builderStatus.startDate, builderStatus.endDate) || "");

  useEffect(() => {
    // One RPC call instead of profile -> mosque -> [if admin] memberships -> teachers, as
    // four sequential stages. Only the fetch is collapsed here -- every bit of the form-default
    // logic below (guarding against overwriting a field the user already touched, etc.) is
    // unchanged.
    async function loadDefaults() {
      const session = await loadCachedSession();
      if (!session?.user.id) {
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("get_program_create_defaults_snapshot", { p_slug: slug });
      if (error) {
        return;
      }

      const snapshot = data as unknown as {
        profile: { full_name: string | null; phone_number: string | null; teacher_whatsapp_number: string | null; account_type: string | null } | null;
        mosque: Mosque | null;
        teachers: DirectorOption[];
      } | null;
      if (!snapshot) {
        return;
      }

      const profile = snapshot.profile;
      setCreatorAccountType(profile?.account_type ?? null);
      setInstructorDisplayName(profile?.full_name ?? "");
      setInstructorContactPhone(profile?.phone_number ?? profile?.teacher_whatsapp_number ?? "");
      const mosque = snapshot.mosque;
      if (mosque) {
        const mosqueAddress = typeof mosque.address === "string" && mosque.address.trim() ? mosque.address.trim() : "";
        setBuilderStatus((current) => current.location ? current : { ...current, location: mosque.name ?? titleCase(slug), room: mosqueAddress });
      }
      if (profile?.account_type === "admin") {
        const teachers = snapshot.teachers ?? [];
        setDirectorOptions(teachers);
        setSelectedDirectorId((current) => current || teachers[0]?.id || "");
      }
    }

    void loadDefaults();
  }, [slug]);

  useEffect(() => {
    if (creatorAccountType !== "admin" || !selectedDirectorId) {
      return;
    }
    const director = directorOptions.find((teacher) => teacher.id === selectedDirectorId);
    if (!director) {
      return;
    }
    setInstructorDisplayName(director.full_name ?? "");
    setInstructorCredentials(director.teacher_credentials ?? "");
    setInstructorContactPhone(director.phone_number ?? director.teacher_whatsapp_number ?? "");
    setBuilderStatus((current) => ({ ...current, contactEmail: director.email ?? "" }));
  }, [creatorAccountType, directorOptions, selectedDirectorId]);

  function handleThumbnailFile(file: File | null) {
    if (!file) {
      return;
    }
    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setThumbnailUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function addTrack() {
    setTrackRows((current) => [...current, { id: crypto.randomUUID(), name: "New Track", sessions: [{ day: "Monday", start: "18:00", end: "20:00" }] }]);
  }

  function addMedia() {
    setMediaRows((current) => [...current, { id: crypto.randomUUID(), url: "", title: "", mediaType: "photo", file: null }]);
  }

  function addTag() {
    const tag = tagDraft.trim();
    if (!tag) {
      return;
    }
    setTagRows((current) => Array.from(new Set([...current, tag])).slice(0, 12));
    setTagDraft("");
  }

  function setCreateMediaFile(rowId: string, file: File | null) {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setMediaRows((current) =>
        current.map((row) => row.id === rowId ? { ...row, file, mediaType: file.type.startsWith("video/") ? "video" : "photo", previewUrl: typeof reader.result === "string" ? reader.result : row.previewUrl } : row),
      );
    };
    reader.readAsDataURL(file);
  }

  async function uploadFile(programId: string, file: File) {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      throw new Error("Log in required.");
    }
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/programs/${programId}/media/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });
    const result = (await response.json()) as { url?: string; mediaType?: "photo" | "video"; error?: string };
    if (!response.ok || !result.url || !result.mediaType) {
      throw new Error(result.error ?? "Could not upload media.");
    }
    return { url: result.url, mediaType: result.mediaType };
  }

  async function saveNewProgram(statusOverride?: Partial<ProgramBuilderStatus>) {
    const effectiveBuilderStatus = { ...builderStatus, ...statusOverride };
    setMessage(null);
    setToast(null);
    if (!title.trim()) {
      setToast({ tone: "error", message: "Add a public title before saving." });
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && !title.trim()) {
      setToast({ tone: "error", message: "Public title is required before publishing." });
      setBuilderStep("basics");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.programType === "event" && !eventDate) {
      setToast({ tone: "error", message: "Choose an event date before publishing." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.schedulePattern === "custom_dates" && trackRows.some((track) => track.sessions.some((session) => !session.date))) {
      setToast({ tone: "error", message: "Custom session dates need a date for each meeting." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft") {
      const statusValidation = validateProgramStatusCombination({
        publicationStatus: effectiveBuilderStatus.publicationStatus,
        applicationStatus: effectiveBuilderStatus.applicationStatus,
        lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
        applicationOpenAt: effectiveBuilderStatus.applicationOpenAt || null,
        applicationCloseAt: effectiveBuilderStatus.applicationCloseAt || null,
        startDate: effectiveBuilderStatus.startDate || null,
        endDate: effectiveBuilderStatus.endDate || null,
        isOngoing: effectiveBuilderStatus.durationType === "ongoing",
        billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
      });
      if (!statusValidation.valid) {
        setToast({ tone: "error", message: statusValidation.errors[0].message });
        setBuilderStep(statusValidation.errors[0].field === "endDate" ? "schedule" : "pricing");
        return;
      }
    }
    if (creatorAccountType === "admin" && !selectedDirectorId) {
      setToast({ tone: "error", message: "Choose a teacher director for this class." });
      return;
    }
    if (learningVisible && !learningTitle.trim()) {
      setToast({ tone: "error", message: "Learning section title cannot be blank." });
      return;
    }
    if (learningVisible && outcomeRows.some((row) => !row.text.trim())) {
      setToast({ tone: "error", message: "Checklist points cannot be blank." });
      return;
    }
    if (faqRows.some((row) => !row.question.trim() || !row.answer.trim())) {
      setToast({ tone: "error", message: "FAQ questions and answers cannot be blank." });
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && trackRows.some((track) => !track.name.trim() || track.sessions.some((session) => session.end <= session.start))) {
      setToast({ tone: "error", message: "Each track needs a name and an end time after start time." });
      setBuilderStep("schedule");
      return;
    }
    const eventPayment = effectiveBuilderStatus.programType === "event";
    const savedOffersMonthlyPayment = eventPayment ? false : offersMonthlyPayment;
    const savedOffersAnnualPayment = eventPayment ? true : offersAnnualPayment;
    const usesPerTrackPricing =
      effectiveBuilderStatus.paymentKind === "tareeqah" &&
      effectiveBuilderStatus.programType === "recurring" &&
      trackRows.some((track) => track.pricingOverrideEnabled);
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !savedOffersMonthlyPayment && !savedOffersAnnualPayment) {
      setToast({ tone: "error", message: "Choose at least one payment option before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment && Number(price || "0") <= 0) {
      setToast({ tone: "error", message: "Add a valid monthly price before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment && Number(annualPrice || "0") <= 0) {
      setToast({
        tone: "error",
        message: effectiveBuilderStatus.programType === "event"
          ? "Add a valid one-time price before publishing."
          : effectiveBuilderStatus.durationType === "ongoing"
            ? "Add a valid annual subscription price before publishing."
            : "Add a valid Pay in Full price before publishing.",
      });
      setBuilderStep("pricing");
      return;
    }
    if (
      effectiveBuilderStatus.publicationStatus !== "draft" &&
      usesPerTrackPricing &&
      trackRows.some((track) =>
        (savedOffersMonthlyPayment && Number(track.priceMonthly || "0") <= 0) ||
        (savedOffersAnnualPayment && Number(track.priceAnnual || "0") <= 0)
      )
    ) {
      setToast({ tone: "error", message: "Add valid prices for every track before publishing." });
      setBuilderStep("pricing");
      return;
    }
    const savedTrackSelectionMode: TrackSelectionMode = "exact";
    const savedTrackSelectionCount = 1;

    setBusy(true);
    try {
      const accessToken = await getCurrentAccessToken();
      if (!accessToken) {
        throw new Error("Log in required.");
      }
      const schedule = trackRows[0]?.sessions as unknown as Json;
      const response = await fetch("/api/programs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          mosqueSlug: slug,
          internalName: null,
          title: title.trim(),
          summary: effectiveBuilderStatus.summary.trim() || null,
          description: description.trim() || null,
          category: tagRows.join(", ") || null,
          tags: tagRows,
          programType: effectiveBuilderStatus.programType,
          publicationStatus: effectiveBuilderStatus.publicationStatus,
          applicationStatus: effectiveBuilderStatus.acceptingApplications ? effectiveBuilderStatus.applicationStatus : "not_accepting",
          applicationOpenAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationOpenAt || null : null,
          applicationCloseAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationCloseAt || null : null,
          lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
          applicationMode: effectiveBuilderStatus.applicationMode,
          acceptingApplications: effectiveBuilderStatus.acceptingApplications,
          waitlistEnabled: effectiveBuilderStatus.waitlistEnabled,
          capacityBehavior: effectiveBuilderStatus.capacityBehavior,
          defaultCapacity: null,
          durationType: effectiveBuilderStatus.durationType,
          startNow: effectiveBuilderStatus.startNow,
          startDate: effectiveBuilderStatus.startNow ? null : effectiveBuilderStatus.startDate || null,
          endDate: effectiveBuilderStatus.durationType === "fixed_months" ? effectiveBuilderStatus.endDate || null : null,
          durationMonths: effectiveBuilderStatus.durationType === "fixed_months" ? monthsBetweenDates(effectiveBuilderStatus.startDate, effectiveBuilderStatus.endDate) : null,
          schedulePattern: effectiveBuilderStatus.schedulePattern,
          registrationDeadlineAt: noRegistrationDeadline ? null : effectiveBuilderStatus.registrationDeadline || null,
          location: effectiveBuilderStatus.location.trim() || null,
          room: effectiveBuilderStatus.room.trim() || null,
          roomArea: effectiveBuilderStatus.roomArea.trim() || null,
          paymentKind: effectiveBuilderStatus.paymentKind,
          billingStartBehavior: effectiveBuilderStatus.billingStartBehavior,
          billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
          billingDurationMonths: effectiveBuilderStatus.billingDurationMonths ? Number(effectiveBuilderStatus.billingDurationMonths) : 10,
          allowCustomPrices: true,
          allowWaivedPayments: true,
          manualPaymentNote: effectiveBuilderStatus.manualPaymentNote.trim() || null,
          financialAssistanceNote: effectiveBuilderStatus.financialAssistanceNote.trim() || null,
          receiptNote: effectiveBuilderStatus.receiptNote.trim() || null,
          taxReceiptPolicy: effectiveBuilderStatus.taxReceiptPolicy,
          trackSwitchPolicy: effectiveBuilderStatus.trackSwitchPolicy,
          trackSwitchAllowAll: effectiveBuilderStatus.trackSwitchAllowAll,
          contactEmail: contactEmailOmitted ? "" : effectiveBuilderStatus.contactEmail.trim() || null,
          contactPhone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
          coverPriceLabelEnabled: effectiveBuilderStatus.coverPriceLabelEnabled,
          coverPriceLabel: effectiveBuilderStatus.coverPriceLabel.trim() || null,
          thumbnailUrl: thumbnailFile ? null : thumbnailUrl.trim() || null,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid: effectiveBuilderStatus.paymentKind === "tareeqah",
          offersMonthlyPayment: savedOffersMonthlyPayment,
          offersAnnualPayment: savedOffersAnnualPayment,
          usesPerTrackPricing,
          priceMonthlyCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule,
          scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          trackSelectionMode: savedTrackSelectionMode,
          trackSelectionCount: savedTrackSelectionCount,
          directorProfileId: creatorAccountType === "admin" ? selectedDirectorId : null,
        }),
      });
      const result = (await response.json()) as { program?: Program; error?: string };
      if (!response.ok || !result.program) {
        throw new Error(result.error ?? "Could not create class.");
      }

      const program = result.program;
      let nextThumbnailUrl = thumbnailUrl;
      if (thumbnailFile) {
        nextThumbnailUrl = (await uploadFile(program.id, thumbnailFile)).url;
        const thumbnailResponse = await fetch(`/api/programs/${program.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            internalName: null,
            title: program.title,
            summary: effectiveBuilderStatus.summary.trim() || null,
            description: program.description,
            category: tagRows.join(", ") || null,
            tags: tagRows,
            programType: effectiveBuilderStatus.programType,
            publicationStatus: effectiveBuilderStatus.publicationStatus,
            applicationStatus: effectiveBuilderStatus.acceptingApplications ? effectiveBuilderStatus.applicationStatus : "not_accepting",
            applicationOpenAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationOpenAt || null : null,
            applicationCloseAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationCloseAt || null : null,
            lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
            applicationMode: effectiveBuilderStatus.applicationMode,
            acceptingApplications: effectiveBuilderStatus.acceptingApplications,
            waitlistEnabled: effectiveBuilderStatus.waitlistEnabled,
            capacityBehavior: effectiveBuilderStatus.capacityBehavior,
            defaultCapacity: null,
            durationType: effectiveBuilderStatus.durationType,
            startNow: effectiveBuilderStatus.startNow,
            startDate: effectiveBuilderStatus.startNow ? null : effectiveBuilderStatus.startDate || null,
            endDate: effectiveBuilderStatus.durationType === "fixed_months" ? effectiveBuilderStatus.endDate || null : null,
            durationMonths: effectiveBuilderStatus.durationType === "fixed_months" ? monthsBetweenDates(effectiveBuilderStatus.startDate, effectiveBuilderStatus.endDate) : null,
            schedulePattern: effectiveBuilderStatus.schedulePattern,
            registrationDeadlineAt: noRegistrationDeadline ? null : effectiveBuilderStatus.registrationDeadline || null,
            location: effectiveBuilderStatus.location.trim() || null,
            room: effectiveBuilderStatus.room.trim() || null,
            roomArea: effectiveBuilderStatus.roomArea.trim() || null,
            paymentKind: effectiveBuilderStatus.paymentKind,
            billingStartBehavior: effectiveBuilderStatus.billingStartBehavior,
            billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
            billingDurationMonths: effectiveBuilderStatus.billingDurationMonths ? Number(effectiveBuilderStatus.billingDurationMonths) : 10,
            allowCustomPrices: true,
            allowWaivedPayments: true,
            manualPaymentNote: effectiveBuilderStatus.manualPaymentNote.trim() || null,
            financialAssistanceNote: effectiveBuilderStatus.financialAssistanceNote.trim() || null,
            receiptNote: effectiveBuilderStatus.receiptNote.trim() || null,
            taxReceiptPolicy: effectiveBuilderStatus.taxReceiptPolicy,
            trackSwitchPolicy: effectiveBuilderStatus.trackSwitchPolicy,
            trackSwitchAllowAll: effectiveBuilderStatus.trackSwitchAllowAll,
            contactEmail: contactEmailOmitted ? "" : effectiveBuilderStatus.contactEmail.trim() || null,
            contactPhone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
            coverPriceLabelEnabled: effectiveBuilderStatus.coverPriceLabelEnabled,
            coverPriceLabel: effectiveBuilderStatus.coverPriceLabel.trim() || null,
            thumbnailUrl: nextThumbnailUrl,
            audienceGender: program.audience_gender,
            ageRangeText: program.age_range_text,
            isPaid: effectiveBuilderStatus.paymentKind === "tareeqah",
            offersMonthlyPayment: savedOffersMonthlyPayment,
            offersAnnualPayment: savedOffersAnnualPayment,
            usesPerTrackPricing,
            priceMonthlyCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
            priceAnnualCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
            schedule: program.schedule,
            scheduleTimezone: program.schedule_timezone,
            scheduleNotes: program.schedule_notes,
            trackSelectionMode: savedTrackSelectionMode,
            trackSelectionCount: savedTrackSelectionCount,
          }),
        });
        const thumbnailResult = (await thumbnailResponse.json()) as { error?: string };
        if (!thumbnailResponse.ok) {
          throw new Error(thumbnailResult.error ?? "Could not save thumbnail.");
        }
      }

      const supabase = createSupabaseBrowserClient();
      const { error: detailsError } = await supabase.from("program_details").upsert({
        program_id: program.id,
        learning_title: learningVisible ? learningTitle.trim() : "What You Will Learn",
        learning_intro: learningVisible ? learningIntro.trim() || null : null,
        topics_intro: topicsIntro.trim() || null,
        requirements_text: requirementsText.trim() || null,
        policies_text: policiesText.trim() || null,
        instructor_display_name: instructorDisplayName.trim() || null,
        instructor_credentials: instructorCredentials.trim() || null,
        instructor_contact_phone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
        cover_director_visibility: coverDirectorVisibility,
      }, { onConflict: "program_id" });
      if (detailsError) {
        throw new Error(friendlyErrorMessage(detailsError, "Could not save class details."));
      }

      if (learningVisible && outcomeRows.length) {
        const { error: outcomesError } = await supabase.from("program_outcomes").insert(outcomeRows.map((row, index) => ({ program_id: program.id, sort_order: index + 1, text: row.text.trim() })));
        if (outcomesError) {
          throw new Error(friendlyErrorMessage(outcomesError, "Could not save learning outcomes."));
        }
      }
      if (faqRows.length) {
        const { error: faqsError } = await supabase.from("program_faqs").insert(
          faqRows.map((row, index) => ({
            program_id: program.id,
            sort_order: index + 1,
            question: row.question.trim(),
            answer: row.answer.trim(),
          })),
        );
        if (faqsError) {
          throw new Error(friendlyErrorMessage(faqsError, "Could not save FAQs."));
        }
      }
      if (contentSectionRows.length) {
        const { error: contentSectionsError } = await supabase.from("program_content_sections").insert(
          contentSectionRows.map((row, index) => ({
            program_id: program.id,
            sort_order: index + 1,
            title: row.title.trim(),
            description: row.description.trim() || null,
            duration_text: row.durationText.trim() || null,
          })),
        );
        if (contentSectionsError) {
          throw new Error(friendlyErrorMessage(contentSectionsError, "Could not save content sections."));
        }
      }
      const { data: insertedTracks, error: tracksError } = await supabase
        .from("program_tracks")
        .insert(trackRows.map((track, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          name: track.name.trim(),
          description: null,
          schedule: track.sessions as unknown as Json,
          location: track.location?.trim() || effectiveBuilderStatus.location.trim() || null,
          room: track.room?.trim() || effectiveBuilderStatus.room.trim() || null,
          capacity: track.capacity ? Number(track.capacity) : null,
          pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
          price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
          price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
          ...trackEligibilityOverrideColumns(track),
          is_active: true,
        })))
        .select("id, sort_order");
      if (tracksError) {
        throw new Error(friendlyErrorMessage(tracksError, "Could not save tracks."));
      }
      await saveCanonicalProgramSessions(supabase, program.id, insertedTracks ?? [], trackRows, {
        programType: effectiveBuilderStatus.programType,
        schedulePattern: effectiveBuilderStatus.schedulePattern,
        eventDate,
        title: program.title,
        location: effectiveBuilderStatus.location.trim() || null,
        room: effectiveBuilderStatus.room.trim() || null,
      });
      await saveTrackTransferRules(supabase, program.id, insertedTracks ?? [], trackRows, transferRules);

      const uploadedMedia = [];
      for (const [index, row] of mediaRows.entries()) {
        if (!row.file) {
          continue;
        }
        const uploaded = await uploadFile(program.id, row.file);
        uploadedMedia.push({ program_id: program.id, sort_order: index + 1, media_type: uploaded.mediaType, url: uploaded.url, thumbnail_url: uploaded.mediaType === "photo" ? uploaded.url : null, title: row.title.trim() || null, short_label: row.title.trim() || null });
      }
      if (uploadedMedia.length) {
        const { error: mediaError } = await supabase.from("program_media").insert(uploadedMedia);
        if (mediaError) {
          throw new Error(friendlyErrorMessage(mediaError, "Could not save class photos."));
        }
      }

      invalidateProgramCaches(slug, program.id);
      window.dispatchEvent(new Event("tareeqah:programs-changed"));
      queueEditorToast({ tone: "success", message: "Class created successfully." });
      window.location.href = creatorAccountType === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Could not create class." });
      setBusy(false);
    }
  }

  // Billing-cycle count is purely derived from the date range for a fixed-duration program —
  // not directly editable, so it always tracks the current start/end dates.
  useEffect(() => {
    if (builderStatus.durationType !== "fixed_months") {
      return;
    }
    const estimate = estimateBillingMonths(builderStatus.startDate, builderStatus.endDate);
    if (estimate == null) {
      return;
    }
    setBuilderStatus((current) => (current.billingDurationMonths === String(estimate) ? current : { ...current, billingDurationMonths: String(estimate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderStatus.durationType, builderStatus.startDate, builderStatus.endDate]);

  const billingMonthsFieldVisible =
    builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" && offersMonthlyPayment && builderStatus.durationType === "fixed_months" && builderStatus.billingEndBehavior === "fixed_months";

  if (previewOpen) {
    return (
      <ProgramEditorPreview
        program={buildProgramPreview({
          id: "new",
          title: title || "New Class",
          description,
          thumbnailUrl,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid,
          offersMonthlyPayment: builderStatus.programType === "event" ? false : offersMonthlyPayment,
          offersAnnualPayment: builderStatus.programType === "event" ? true : offersAnnualPayment,
          priceMonthlyCents: builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: builderStatus.paymentKind === "tareeqah" ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule: trackRows[0]?.sessions as unknown as Json,
          trackSelectionMode,
          trackSelectionCount,
        })}
        learningTitle={learningVisible ? learningTitle : ""}
        learningIntro={learningVisible ? learningIntro : ""}
        outcomes={learningVisible ? outcomeRows.map((row) => row.text).filter((text) => text.trim()) : []}
        faqRows={faqRows}
        mediaRows={mediaRows}
        trackRows={trackRows}
        instructorDisplayName={instructorDisplayName}
        instructorCredentials={instructorCredentials}
        instructorContactPhone={instructorContactPhone}
        onBack={() => setPreviewOpen(false)}
      />
    );
  }

  function goToPreviousStep() {
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.max(0, index - 1)]?.id ?? "basics");
    scrollBuilderToTop();
  }

  function getMissingBuilderFields() {
    return computeProgramBuilderMissingFields({
      title,
      programType: builderStatus.programType,
      location: builderStatus.location,
      room: builderStatus.room,
      allAges,
      ageStart,
      ageEnd,
      learningVisible,
      learningTitle,
      outcomeRows,
      faqVisible,
      faqRows,
      contentSectionsVisible,
      contentSectionRows,
      contactPhone: instructorContactPhone,
      contactPhoneOmitted,
      contactEmail: builderStatus.contactEmail,
      contactEmailOmitted,
      durationType: builderStatus.durationType,
      endDate: builderStatus.endDate,
      startNow: builderStatus.startNow,
      startDate: builderStatus.startDate,
      eventDate,
      schedulePattern: builderStatus.schedulePattern,
      noRegistrationDeadline,
      registrationDeadline: builderStatus.registrationDeadline,
      trackRows,
      paymentKind: builderStatus.paymentKind,
      offersMonthlyPayment,
      price,
      offersAnnualPayment,
      annualPrice,
      coverPriceLabelEnabled: builderStatus.coverPriceLabelEnabled,
      coverPriceLabel: builderStatus.coverPriceLabel,
    });
  }

  function advanceStepAnyway() {
    setMissingFieldsModal(null);
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
    scrollBuilderToTop();
  }

  function handleContinueOrPublishClick() {
    const missing = getMissingBuilderFields();
    if (builderStep !== "review") {
      const missingOnThisStep = missing.filter((field) => field.step === builderStep);
      if (missingOnThisStep.length) {
        setMissingFieldsModal({ fields: missingOnThisStep, allowContinue: true });
        return;
      }
      const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
      setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
      scrollBuilderToTop();
      return;
    }
    if (missing.length) {
      setMissingFieldsModal({ fields: missing, allowContinue: false });
      return;
    }
    const publishOverride = { publicationStatus: builderStatus.publicationStatus === "hidden" ? "hidden" : "published" } as const;
    setBuilderStatus((current) => ({ ...current, ...publishOverride, applicationStatus: current.acceptingApplications ? current.applicationStatus : "not_accepting" }));
    void saveNewProgram(publishOverride);
  }

  return (
    <div className="space-y-5 bg-[var(--workspace)] p-4 pb-40">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      {missingFieldsModal ? (
        <MissingFieldsModal
          missingFields={missingFieldsModal.fields}
          allowContinue={missingFieldsModal.allowContinue}
          onContinueAnyway={advanceStepAnyway}
          onClose={() => setMissingFieldsModal(null)}
        />
      ) : null}
      <ProgramBuilderStepper activeStep={builderStep} />
      <ProgramBuilderActionBar busy={busy} builderStep={builderStep} onBack={goToPreviousStep} onContinueOrPublish={handleContinueOrPublishClick} />

      <h1 className="px-1 text-2xl font-semibold text-[#26323A]">{programBuilderSteps.find((step) => step.id === builderStep)?.label}</h1>

      {builderStep === "schedule" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <ProgramTimingFields
            builderStatus={builderStatus}
            setBuilderStatus={setBuilderStatus}
            eventDate={eventDate}
            setEventDate={setEventDate}
            eventTimeVisible={eventTimeVisible}
            setEventTimeVisible={setEventTimeVisible}
            noRegistrationDeadline={noRegistrationDeadline}
            setNoRegistrationDeadline={setNoRegistrationDeadline}
          />
        </section>
      ) : null}
      {builderStep === "pricing" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("How payments are handled", true)}</span>
              <select value={builderStatus.paymentKind} onChange={(event) => { const value = event.target.value as ProgramBuilderStatus["paymentKind"]; setBuilderStatus((current) => ({ ...current, paymentKind: value })); setIsPaid(value === "tareeqah"); }} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="free">Free</option>
                <option value="tareeqah">Paid through Madrasa</option>
              </select>
            </label>
            {billingMonthsFieldVisible ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Billing months</span>
                <BillingMonthsHint
                  startDate={builderStatus.startDate}
                  endDate={builderStatus.endDate}
                  chosenMonths={builderStatus.billingDurationMonths}
                />
              </label>
            ) : builderStatus.paymentKind === "tareeqah" && builderStatus.durationType === "ongoing" && builderStatus.programType !== "event" && (offersMonthlyPayment || offersAnnualPayment) ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Number of billing months</span>
                <input value="Ongoing — billed until cancelled" disabled className="h-10 w-full rounded-[8px] border border-[#D6DCE0] bg-[#F1F4F5] px-3 text-sm font-medium text-[#8A949B] outline-none" />
              </label>
            ) : null}
            {builderStatus.paymentKind === "tareeqah" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Tax receipt policy</span>
                <select
                  value={builderStatus.taxReceiptPolicy}
                  onChange={(event) => setBuilderStatus((current) => ({ ...current, taxReceiptPolicy: event.target.value as ProgramBuilderStatus["taxReceiptPolicy"] }))}
                  className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="not_applicable">Not a tax-deductible donation</option>
                  <option value="admin_review_required">May be eligible - admin reviews each payment</option>
                  <option value="eligible_confirmed">Eligible as a charitable donation (confirmed)</option>
                </select>
              </label>
            ) : null}
            <ProgramApplicationAvailabilityFields builderStatus={builderStatus} setBuilderStatus={setBuilderStatus} />
          </div>
        </section>
      ) : null}

      {builderStep === "basics" ? (
        <section className="overflow-hidden rounded-2xl border border-[#E1E8EC] bg-white">
          <div className="relative">
            <ProgramHero program={{ id: "new", mosque_id: "", teacher_profile_id: null, director_profile_id: null, ...defaultProgramBuilderColumns(), title: title || "New Class", description: description || null, is_active: true, is_paid: builderStatus.paymentKind === "tareeqah", offers_monthly_payment: offersMonthlyPayment, offers_annual_payment: offersAnnualPayment, thumbnail_url: thumbnailUrl || null, price_monthly_cents: null, price_annual_cents: null, stripe_product_id: null, stripe_price_id: null, stripe_annual_price_id: null, audience_gender: audienceGender, age_range_text: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd), schedule: null, schedule_timezone: null, schedule_notes: null, track_selection_mode: trackSelectionMode, track_selection_count: trackSelectionCount, tags: tagRows, created_at: "", updated_at: "" }} />
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (file) {
                  setThumbnailCropFile(file);
                }
              }}
            />
            <button type="button" onClick={() => thumbnailInputRef.current?.click()} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#26323A] shadow-lg" aria-label="Replace thumbnail">
              <PhotoIcon />
            </button>
          </div>
          {thumbnailCropFile ? (
            <ImageCropModal
              file={thumbnailCropFile}
              title="Crop thumbnail"
              aspectRatio={4 / 3}
              outputWidth={1200}
              outputHeight={900}
              onCancel={() => setThumbnailCropFile(null)}
              onConfirm={(croppedFile) => {
                handleThumbnailFile(croppedFile);
                setThumbnailCropFile(null);
              }}
            />
          ) : null}
          <div className="space-y-3 p-4">
            <EditBox label="Public name" required value={title} onChange={setTitle} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Class type", true)}</span>
              <select value={builderStatus.programType} onChange={(event) => setBuilderStatus((current) => ({ ...current, programType: event.target.value as ProgramBuilderStatus["programType"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="recurring">Recurring program</option>
                <option value="event">One-time event</option>
              </select>
            </label>
            <p className="-mt-2 text-xs leading-5 text-[#6B747B]">Public title is what parents and students see.</p>
            {summaryVisible || builderStatus.summary.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Short summary / tagline" value={builderStatus.summary} onChange={(value) => setBuilderStatus((current) => ({ ...current, summary: value }))} />
                <button type="button" onClick={() => { setSummaryVisible(false); setBuilderStatus((current) => ({ ...current, summary: "" })); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove summary
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSummaryVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add short summary / tagline
              </button>
            )}
            {descriptionVisible || description.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Description" value={description} onChange={setDescription} multiline />
                <button type="button" onClick={() => { setDescriptionVisible(false); setDescription(""); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove description
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDescriptionVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add description
              </button>
            )}
            <div className="grid gap-3">
              <EditBox label="Location name" required value={builderStatus.location} onChange={(value) => setBuilderStatus((current) => ({ ...current, location: value }))} />
              <EditBox label="Location address" required value={builderStatus.room} onChange={(value) => setBuilderStatus((current) => ({ ...current, room: value }))} />
              {roomVisible || builderStatus.roomArea.trim() ? (
                <div className="space-y-1.5">
                  <EditBox label="Room / Area" value={builderStatus.roomArea} onChange={(value) => setBuilderStatus((current) => ({ ...current, roomArea: value }))} />
                  <button
                    type="button"
                    onClick={() => {
                      setRoomVisible(false);
                      setBuilderStatus((current) => ({ ...current, roomArea: "" }));
                    }}
                    className="justify-self-start text-sm font-semibold text-[#C0392B]"
                  >
                    Remove Room / Area
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setRoomVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                  Add Room / Area
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {builderStep === "basics" && creatorAccountType === "admin" ? (
        <section className="space-y-2 bg-white px-4 py-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B747B]" htmlFor="edit-program-director">Class Director</label>
          <select id="edit-program-director" value={selectedDirectorId} onChange={(event) => setSelectedDirectorId(event.target.value)} className="h-12 w-full rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]">
            <option value="">Choose director</option>
            {directorOptions.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.email || "Unnamed teacher"}</option>)}
          </select>
        </section>
      ) : null}

      <ProgramEditorFields
        masjidLabel={slug.charAt(0).toUpperCase() + slug.slice(1)}
        builderStatus={builderStatus}
        setBuilderStatus={setBuilderStatus}
        activeStep={builderStep}
        programType={builderStatus.programType}
        schedulePattern={builderStatus.schedulePattern}
        previewProgram={buildProgramPreview({
          id: "new",
          title: title || "New Class",
          description,
          thumbnailUrl,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid: builderStatus.paymentKind === "tareeqah",
          offersMonthlyPayment: builderStatus.programType === "event" ? false : offersMonthlyPayment,
          offersAnnualPayment: builderStatus.programType === "event" ? true : offersAnnualPayment,
          priceMonthlyCents: builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: builderStatus.paymentKind === "tareeqah" ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule: trackRows[0]?.sessions as unknown as Json,
          trackSelectionMode,
          trackSelectionCount,
        })}
        eventDate={eventDate}
        setEventDate={setEventDate}
        eventTimeVisible={eventTimeVisible}
        setEventTimeVisible={setEventTimeVisible}
        learningVisible={learningVisible}
        setLearningVisible={setLearningVisible}
        learningTitle={learningTitle}
        setLearningTitle={setLearningTitle}
        learningIntro={learningIntro}
        setLearningIntro={setLearningIntro}
        learningDescriptionVisible={learningDescriptionVisible}
        setLearningDescriptionVisible={setLearningDescriptionVisible}
        topicsIntro={topicsIntro}
        setTopicsIntro={setTopicsIntro}
        requirementsText={requirementsText}
        setRequirementsText={setRequirementsText}
        policiesText={policiesText}
        setPoliciesText={setPoliciesText}
        outcomeRows={outcomeRows}
        setOutcomeRows={setOutcomeRows}
        faqVisible={faqVisible}
        setFaqVisible={setFaqVisible}
        faqRows={faqRows}
        setFaqRows={setFaqRows}
        contentSectionsVisible={contentSectionsVisible}
        setContentSectionsVisible={setContentSectionsVisible}
        contentSectionRows={contentSectionRows}
        setContentSectionRows={setContentSectionRows}
        mediaVisible={mediaVisible}
        setMediaVisible={setMediaVisible}
        mediaRows={mediaRows}
        setMediaRows={setMediaRows}
        onMediaFile={setCreateMediaFile}
        addMedia={addMedia}
        trackRows={trackRows}
        setTrackRows={setTrackRows}
        addTrack={addTrack}
        transferRules={transferRules}
        setTransferRules={setTransferRules}
        trackSelectionMode={trackSelectionMode}
        setTrackSelectionMode={setTrackSelectionMode}
        trackSelectionCount={trackSelectionCount}
        setTrackSelectionCount={setTrackSelectionCount}
        allAges={allAges}
        setAllAges={setAllAges}
        ageStart={ageStart}
        setAgeStart={setAgeStart}
        ageEnd={ageEnd}
        setAgeEnd={setAgeEnd}
        audienceGender={audienceGender}
        setAudienceGender={setAudienceGender}
        paymentKind={builderStatus.paymentKind}
        durationMonthsForPricing={pricingDurationMonths}
        isPaid={builderStatus.paymentKind === "tareeqah"}
        setIsPaid={setIsPaid}
        offersMonthlyPayment={offersMonthlyPayment}
        setOffersMonthlyPayment={setOffersMonthlyPayment}
        offersAnnualPayment={offersAnnualPayment}
        setOffersAnnualPayment={setOffersAnnualPayment}
        price={price}
        setPrice={setPrice}
        annualPrice={annualPrice}
        setAnnualPrice={setAnnualPrice}
        instructorDisplayName={instructorDisplayName}
        setInstructorDisplayName={setInstructorDisplayName}
        instructorCredentials={instructorCredentials}
        setInstructorCredentials={setInstructorCredentials}
        instructorContactPhone={instructorContactPhone}
        setInstructorContactPhone={setInstructorContactPhone}
        coverDirectorVisibility={coverDirectorVisibility}
        setCoverDirectorVisibility={setCoverDirectorVisibility}
        contactEmail={builderStatus.contactEmail}
        setContactEmail={(value) => setBuilderStatus((current) => ({ ...current, contactEmail: value }))}
        contactPhoneOmitted={contactPhoneOmitted}
        setContactPhoneOmitted={setContactPhoneOmitted}
        contactEmailOmitted={contactEmailOmitted}
        setContactEmailOmitted={setContactEmailOmitted}
        coverPriceLabelEnabled={builderStatus.coverPriceLabelEnabled}
        setCoverPriceLabelEnabled={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabelEnabled: value }))}
        coverPriceLabel={builderStatus.coverPriceLabel}
        setCoverPriceLabel={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabel: value }))}
      />

      <ProgramBuilderActionBar busy={busy} builderStep={builderStep} onBack={goToPreviousStep} onContinueOrPublish={handleContinueOrPublishClick} sticky message={message} />
    </div>
  );
}

export function TeacherProgramSettingsData({ slug, programId, returnHref }: { slug: string; programId: string; returnHref?: string }) {
  const [builderStep, setBuilderStep] = useState<ProgramBuilderStep>("basics");
  const [builderStatus, setBuilderStatus] = useState<ProgramBuilderStatus>(() => defaultBuilderStatus());
  const [program, setProgram] = useState<Program | null>(null);
  const [details, setDetails] = useState<ProgramDetails | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [isAdminEditor, setIsAdminEditor] = useState(false);
  const [directorOptions, setDirectorOptions] = useState<DirectorOption[]>([]);
  const [selectedDirectorId, setSelectedDirectorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [allAges, setAllAges] = useState(true);
  const [ageStart, setAgeStart] = useState("");
  const [ageEnd, setAgeEnd] = useState("");
  const [noRegistrationDeadline, setNoRegistrationDeadline] = useState(false);
  const [roomVisible, setRoomVisible] = useState(false);
  const [eventTimeVisible, setEventTimeVisible] = useState(false);
  const [audienceGender, setAudienceGender] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("");
  const [offersMonthlyPayment, setOffersMonthlyPayment] = useState(true);
  const [offersAnnualPayment, setOffersAnnualPayment] = useState(false);
  const [annualPrice, setAnnualPrice] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [learningVisible, setLearningVisible] = useState(true);
  const [learningTitle, setLearningTitle] = useState("What You Will Learn");
  const [learningIntro, setLearningIntro] = useState("");
  const [learningDescriptionVisible, setLearningDescriptionVisible] = useState(false);
  const [topicsIntro, setTopicsIntro] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [policiesText, setPoliciesText] = useState("");
  const [outcomeRows, setOutcomeRows] = useState<Array<{ id: string; text: string }>>([]);
  const [faqVisible, setFaqVisible] = useState(false);
  const [faqRows, setFaqRows] = useState<ProgramEditorFaqRow[]>([]);
  const [contentSectionsVisible, setContentSectionsVisible] = useState(false);
  const [contentSectionRows, setContentSectionRows] = useState<ProgramEditorContentSectionRow[]>([]);
  const [mediaVisible, setMediaVisible] = useState(false);
  const [mediaRows, setMediaRows] = useState<ProgramEditorMediaRow[]>([]);
  const [trackRows, setTrackRows] = useState<ProgramEditorTrackRow[]>([]);
  const [transferRules, setTransferRules] = useState<ProgramEditorTransferRule[]>([]);
  const [trackSelectionMode, setTrackSelectionMode] = useState<TrackSelectionMode>("exact");
  const [trackSelectionCount, setTrackSelectionCount] = useState(1);
  const [instructorDisplayName, setInstructorDisplayName] = useState("");
  const [instructorCredentials, setInstructorCredentials] = useState("");
  const [instructorContactPhone, setInstructorContactPhone] = useState("");
  const [coverDirectorVisibility, setCoverDirectorVisibility] = useState("name_and_photo");
  const [contactPhoneOmitted, setContactPhoneOmitted] = useState(false);
  const [contactEmailOmitted, setContactEmailOmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [missingFieldsModal, setMissingFieldsModal] = useState<{ fields: ProgramBuilderMissingField[]; allowContinue: boolean } | null>(null);
  const [pendingFutureApplicantsConfirm, setPendingFutureApplicantsConfirm] = useState<{ statusOverride?: Partial<ProgramBuilderStatus> } | null>(null);
  const [startDateChangeConfirmOpen, setStartDateChangeConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const [thumbnailCropFile, setThumbnailCropFile] = useState<File | null>(null);
  const loadedDirectorRef = useRef<string | null>(null);
  const startDateChangeModalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(startDateChangeModalRef, startDateChangeConfirmOpen, () => setStartDateChangeConfirmOpen(false));
  // Annual pricing is compared against one year of monthly payments: 12 months for an
  // ongoing program (which bills annually, not for a known total length), or the program's
  // actual fixed duration for a fixed-length program (its annual price is a one-time lump
  // sum covering that whole length, not a yearly renewal).
  const pricingDurationMonths =
    builderStatus.durationType === "ongoing"
      ? "12"
      : builderStatus.billingDurationMonths || String(builderStatus.durationMonths || monthsBetweenDates(builderStatus.startDate, builderStatus.endDate) || "");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function load() {
      setLoading(true);
      setError(null);

      const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
      if (!mosque) {
        setProgram(null);
        setLoading(false);
        return;
      }

      const [{ data: programRow, error: programError }, { data: directorAllowed }, detailResult, outcomeResult, contentSectionResult, faqResult, mediaResult, trackResult, sessionResult, transferRuleResult] = await Promise.all([
        supabase.from("programs").select("*").eq("id", programId).eq("mosque_id", mosque.id).maybeSingle(),
        supabase.rpc("is_program_director", { check_program_id: programId }),
        supabase.from("program_details").select("*").eq("program_id", programId).maybeSingle(),
        supabase.from("program_outcomes").select("*").eq("program_id", programId).order("sort_order", { ascending: true }),
        supabase.from("program_content_sections").select("*").eq("program_id", programId).order("sort_order", { ascending: true }),
        supabase.from("program_faqs").select("*").eq("program_id", programId).order("sort_order", { ascending: true }),
        supabase.from("program_media").select("*").eq("program_id", programId).order("sort_order", { ascending: true }),
        supabase.from("program_tracks").select("*").eq("program_id", programId).order("sort_order", { ascending: true }),
        supabase.from("program_sessions").select("*").eq("program_id", programId).order("session_date", { ascending: true }).order("start_time", { ascending: true }),
        supabase.from("program_track_transfer_rules").select("*").eq("program_id", programId),
      ]);
      const trackIds = (trackResult.data ?? []).map((track) => track.id);
      const { data: trackSessionLinks } = trackIds.length
        ? await supabase.from("program_track_sessions").select("*").in("program_track_id", trackIds)
        : { data: [] as ProgramTrackSession[] };

      if (programError) {
        setError(friendlyErrorMessage(programError, "Could not load this class."));
        setLoading(false);
        return;
      }

      setProgram(programRow ?? null);
      setDetails(detailResult.data ?? null);
      setIsDirector(Boolean(directorAllowed));
      setIsAdminEditor(false);
      setDirectorOptions([]);
      if (programRow) {
        const directorProfileId = programRow.director_profile_id ?? programRow.teacher_profile_id;
        setSelectedDirectorId(directorProfileId ?? "");
        loadedDirectorRef.current = directorProfileId ?? "";
        const session = await loadCachedSession();
        const viewerId = session?.user.id ?? null;
        if (viewerId) {
          const [{ data: viewerProfile }, { data: adminMembership }] = await Promise.all([
            supabase.from("profiles").select("account_type").eq("id", viewerId).maybeSingle(),
            supabase
              .from("mosque_memberships")
              .select("id")
              .eq("mosque_id", mosque.id)
              .eq("profile_id", viewerId)
              .eq("role", "admin")
              .eq("status", "active")
              .maybeSingle(),
          ]);
          const nextIsAdminEditor = viewerProfile?.account_type === "admin" && Boolean(adminMembership);
          setIsAdminEditor(nextIsAdminEditor);
          if (nextIsAdminEditor) {
            const { data: teacherMemberships } = await supabase
              .from("mosque_memberships")
              .select("profile_id")
              .eq("mosque_id", mosque.id)
              .eq("role", "teacher")
              .eq("status", "active");
            const teacherIds = Array.from(new Set((teacherMemberships ?? []).map((membership) => membership.profile_id).filter(Boolean))) as string[];
            if (teacherIds.length) {
              const { data: teachers } = await supabase
                .from("profiles")
                .select("id, full_name, email, phone_number, teacher_credentials, teacher_whatsapp_number")
                .in("id", teacherIds)
                .eq("account_type", "teacher")
                .order("full_name", { ascending: true });
              setDirectorOptions(teachers ?? []);
            }
          }
        }
        const { data: directorProfile } = directorProfileId
          ? await supabase.from("profiles").select("full_name, email, phone_number, teacher_credentials, teacher_whatsapp_number").eq("id", directorProfileId).maybeSingle()
          : { data: null };
        const rows = parseProgramSchedule(programRow.schedule);
        const firstRow = rows[0];
        const parsedAge = parseAgeRangeForEdit(programRow.age_range_text);
        const nextLearningVisible = Boolean(detailResult.data || (outcomeResult.data ?? []).length);
        const nextLearningTitle = detailResult.data?.learning_title?.trim() || "What You Will Learn";
        const nextLearningIntro = detailResult.data?.learning_intro ?? "";
        setLearningDescriptionVisible(Boolean(nextLearningIntro.trim()));
        setTopicsIntro(detailResult.data?.topics_intro ?? "");
        setRequirementsText(detailResult.data?.requirements_text ?? "");
        setPoliciesText(detailResult.data?.policies_text ?? "");
        const nextInstructorDisplayName = detailResult.data?.instructor_display_name ?? directorProfile?.full_name ?? "";
        const nextInstructorCredentials = detailResult.data?.instructor_credentials ?? "";
        const nextInstructorContactPhone = detailResult.data?.instructor_contact_phone ?? directorProfile?.phone_number ?? directorProfile?.teacher_whatsapp_number ?? "";
        setNoRegistrationDeadline(!programRow.registration_deadline_at);
        setRoomVisible(Boolean(programRow.room_area));
        setSummaryVisible(Boolean(programRow.summary?.trim()));
        setDescriptionVisible(Boolean(programRow.description?.trim()));
        setEventTimeVisible(programRow.program_type === "event" && Boolean((sessionResult.data ?? [])[0]));
        setEventDate((sessionResult.data ?? [])[0]?.session_date ?? programRow.start_date ?? "");
        setBuilderStatus({
          internalName: programRow.internal_name ?? "",
          summary: programRow.summary ?? "",
          category: programRow.category ?? "",
          programType: programRow.program_type === "event" ? "event" : "recurring",
          publicationStatus: ["draft", "published", "hidden", "archived"].includes(programRow.publication_status) ? programRow.publication_status as ProgramBuilderStatus["publicationStatus"] : "published",
          applicationStatus: ["accepting", "not_accepting", "opens_later", "waitlist_only", "closed", "invite_only"].includes(programRow.application_status) ? programRow.application_status as ProgramBuilderStatus["applicationStatus"] : "accepting",
          lifecycleStatus: ["upcoming", "active", "paused", "completed", "cancelled", "archived"].includes(programRow.lifecycle_status) ? programRow.lifecycle_status as ProgramBuilderStatus["lifecycleStatus"] : "upcoming",
          applicationMode: ["application_required", "open_enrollment", "invite_only", "hidden_private"].includes(programRow.application_mode) ? programRow.application_mode as ProgramBuilderStatus["applicationMode"] : "application_required",
          acceptingApplications: programRow.accepting_applications !== false,
          waitlistEnabled: programRow.waitlist_enabled !== false,
          capacityBehavior: ["manual_review", "close_when_full", "allow_waitlist"].includes(programRow.capacity_behavior) ? programRow.capacity_behavior as ProgramBuilderStatus["capacityBehavior"] : "manual_review",
          defaultCapacity: programRow.default_capacity ? String(programRow.default_capacity) : "",
          durationType: ["ongoing", "fixed_months"].includes(programRow.duration_type) ? programRow.duration_type as ProgramBuilderStatus["durationType"] : "ongoing",
          startNow: programRow.start_now ?? false,
          startDate: programRow.start_date ?? "",
          endDate: programRow.end_date ?? "",
          durationMonths: programRow.duration_months ? String(programRow.duration_months) : "10",
          schedulePattern: ["weekly", "custom_dates"].includes(programRow.schedule_pattern) ? programRow.schedule_pattern as ProgramBuilderStatus["schedulePattern"] : "weekly",
          registrationDeadline: programRow.registration_deadline_at ? programRow.registration_deadline_at.slice(0, 16) : "",
          applicationOpenAt: programRow.application_open_at ? programRow.application_open_at.slice(0, 16) : "",
          applicationCloseAt: programRow.application_close_at ? programRow.application_close_at.slice(0, 16) : "",
          location: programRow.location ?? "",
          room: programRow.room ?? "",
          roomArea: programRow.room_area ?? "",
          paymentKind: ["free", "tareeqah"].includes(programRow.payment_kind) ? programRow.payment_kind as ProgramBuilderStatus["paymentKind"] : (programRow.is_paid ? "tareeqah" : "free"),
          billingStartBehavior: ["on_payment", "program_start"].includes(programRow.billing_start_behavior) ? programRow.billing_start_behavior as ProgramBuilderStatus["billingStartBehavior"] : "on_payment",
          billingEndBehavior: ["manual_cancel", "program_end", "fixed_months"].includes(programRow.billing_end_behavior) ? programRow.billing_end_behavior as ProgramBuilderStatus["billingEndBehavior"] : "fixed_months",
          billingDurationMonths: programRow.billing_duration_months ? String(programRow.billing_duration_months) : "",
          allowCustomPrices: programRow.allow_custom_prices !== false,
          allowWaivedPayments: programRow.allow_waived_payments !== false,
          manualPaymentNote: programRow.manual_payment_note ?? "",
          financialAssistanceNote: programRow.financial_assistance_note ?? defaultBuilderStatus().financialAssistanceNote,
          receiptNote: programRow.receipt_note ?? defaultBuilderStatus().receiptNote,
          taxReceiptPolicy: ["not_applicable", "admin_review_required", "eligible_confirmed"].includes(programRow.tax_receipt_policy) ? programRow.tax_receipt_policy as ProgramBuilderStatus["taxReceiptPolicy"] : "not_applicable",
          trackSwitchPolicy: ["disabled", "request_only", "allowed"].includes(programRow.track_switch_policy) ? programRow.track_switch_policy as ProgramBuilderStatus["trackSwitchPolicy"] : "disabled",
          trackSwitchAllowAll: Boolean(programRow.track_switch_allow_all),
          contactEmail: programRow.contact_email ?? directorProfile?.email ?? "",
          contactPhone: programRow.contact_phone ?? "",
          coverPriceLabelEnabled: programRow.cover_price_label_enabled !== false,
          coverPriceLabel: programRow.cover_price_label ?? "",
        });
        const nextOutcomeRows = (outcomeResult.data ?? []).map((row) => ({ id: row.id, text: row.text }));
        const nextFaqRows = (faqResult.data ?? []).map((row) => ({ id: row.id, question: row.question, answer: row.answer }));
        const nextContentSectionRows = (contentSectionResult.data ?? []).map((row) => ({ id: row.id, title: row.title, description: row.description ?? "", durationText: row.duration_text ?? "" }));
        const nextMediaRows = (mediaResult.data ?? []).map((row) => ({ id: row.id, url: row.url, title: row.title ?? "", mediaType: row.media_type }));
        const storedSessions: ProgramScheduleRow[] = (sessionResult.data ?? []).map(scheduleRowFromProgramSession);
        const defaultSession: ProgramScheduleRow = firstRow ?? { day: "Monday", start: "18:00", end: "20:00" };
        const nextTrackRows: ProgramEditorTrackRow[] =
          programRow.program_type === "event"
            ? [{ id: "event", name: "Event", sessions: [storedSessions[0] ?? defaultSession] }]
            : programRow.schedule_pattern === "custom_dates"
              ? [{ id: "sessions", name: "Sessions", sessions: storedSessions.length ? storedSessions : [{ ...defaultSession, date: "" }] }]
              : (trackResult.data ?? []).length
            ? linkedEditorTrackRows(trackResult.data ?? [], sessionResult.data ?? [], trackSessionLinks ?? [], defaultSession)
            : [
                {
                  id: "default",
                  name: "Main Track",
                  sessions: [defaultSession],
                },
              ];
        setTitle(programRow.title);
        setDescription(programRow.description ?? "");
        setThumbnailUrl(programRow.thumbnail_url ?? "");
        setAllAges(parsedAge.allAges);
        setAgeStart(parsedAge.start);
        setAgeEnd(parsedAge.end);
        setAudienceGender(normalizeAudienceGender(programRow.audience_gender));
        setIsPaid(Boolean(programRow.is_paid));
        setOffersMonthlyPayment(programRow.offers_monthly_payment !== false);
        setOffersAnnualPayment(Boolean(programRow.offers_annual_payment));
        setPrice(programRow.price_monthly_cents ? String(programRow.price_monthly_cents / 100) : "");
        setAnnualPrice(programRow.price_annual_cents ? String(programRow.price_annual_cents / 100) : "");
        setLearningVisible(nextLearningVisible);
        setLearningTitle(nextLearningTitle);
        setLearningIntro(nextLearningIntro);
        setInstructorDisplayName(nextInstructorDisplayName);
        setInstructorCredentials(nextInstructorCredentials);
        setInstructorContactPhone(nextInstructorContactPhone);
        setCoverDirectorVisibility(detailResult.data?.cover_director_visibility ?? "name_and_photo");
        setTrackSelectionMode("exact");
        setTrackSelectionCount(1);
        setOutcomeRows(nextOutcomeRows);
        setFaqRows(nextFaqRows);
        setFaqVisible(nextFaqRows.length > 0);
        setContentSectionRows(nextContentSectionRows);
        setContentSectionsVisible(nextContentSectionRows.length > 0);
        setMediaRows(nextMediaRows);
        setMediaVisible(nextMediaRows.length > 0);
        setTrackRows(nextTrackRows);
        setTransferRules((transferRuleResult.data ?? []).map((row) => ({ id: row.id, fromTrackId: row.from_track_id, toTrackId: row.to_track_id })));
      }
      setLoading(false);
    }

    void load();
  }, [programId, slug]);

  useEffect(() => {
    if (!isAdminEditor || !selectedDirectorId || loading || loadedDirectorRef.current === selectedDirectorId) {
      return;
    }
    const director = directorOptions.find((teacher) => teacher.id === selectedDirectorId);
    if (!director) {
      return;
    }
    setInstructorDisplayName(director.full_name ?? "");
    setInstructorCredentials(director.teacher_credentials ?? "");
    setInstructorContactPhone(director.phone_number ?? director.teacher_whatsapp_number ?? "");
    setBuilderStatus((current) => ({ ...current, contactEmail: director.email ?? "" }));
    loadedDirectorRef.current = selectedDirectorId;
  }, [directorOptions, isAdminEditor, loading, selectedDirectorId]);

  // Billing-cycle count is purely derived from the date range for a fixed-duration program —
  // not directly editable, so it always tracks the current start/end dates.
  useEffect(() => {
    if (builderStatus.durationType !== "fixed_months") {
      return;
    }
    const estimate = estimateBillingMonths(builderStatus.startDate, builderStatus.endDate);
    if (estimate == null) {
      return;
    }
    setBuilderStatus((current) => (current.billingDurationMonths === String(estimate) ? current : { ...current, billingDurationMonths: String(estimate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderStatus.durationType, builderStatus.startDate, builderStatus.endDate]);

  const billingMonthsFieldVisible =
    builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" && offersMonthlyPayment && builderStatus.durationType === "fixed_months" && builderStatus.billingEndBehavior === "fixed_months";

  function handleThumbnailFile(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setThumbnailUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function addLearningSection() {
    setLearningVisible(true);
    setLearningTitle("What You Will Learn");
    setLearningIntro("Describe what students will gain from this program.");
    setOutcomeRows([{ id: crypto.randomUUID(), text: "learning outcome #1" }]);
  }

  function addTrack() {
    setTrackRows((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "New Track", sessions: [{ day: "Monday", start: "18:00", end: "20:00" }] },
    ]);
  }

  function addMedia() {
    setMediaRows((current) => [...current, { id: crypto.randomUUID(), url: "", title: "", mediaType: "photo" }]);
  }

  async function uploadProgramMedia(rowId: string, file: File | null) {
    if (!program || !file) {
      return;
    }

    setBusy(true);
    setMessage(null);
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      setBusy(false);
      setMessage("Log in required.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/programs/${program.id}/media/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });
    const result = (await response.json()) as { url?: string; mediaType?: "photo" | "video"; error?: string };
    setBusy(false);
    if (!response.ok || !result.url || !result.mediaType) {
      setMessage(result.error ?? "Could not upload media.");
      return;
    }

    setMediaRows((current) => current.map((row) => row.id === rowId ? { ...row, url: result.url ?? row.url, mediaType: result.mediaType ?? row.mediaType } : row));
    setMessage(`${result.mediaType === "video" ? "Video" : "Photo"} uploaded. Save changes to publish it.`);
  }

  async function saveProgram(statusOverride?: Partial<ProgramBuilderStatus>, confirmFutureApplicantsOnly = false) {
    if (!program) {
      return;
    }

    const effectiveBuilderStatus = { ...builderStatus, ...statusOverride };
    const savedOffersMonthlyPayment = effectiveBuilderStatus.programType === "event" ? false : offersMonthlyPayment;
    const savedOffersAnnualPayment = effectiveBuilderStatus.programType === "event" ? true : offersAnnualPayment;
    const usesPerTrackPricing =
      effectiveBuilderStatus.paymentKind === "tareeqah" &&
      effectiveBuilderStatus.programType === "recurring" &&
      trackRows.some((track) => track.pricingOverrideEnabled);
    const savedTrackSelectionMode: TrackSelectionMode = "exact";
    const savedTrackSelectionCount = 1;

    setMessage(null);
    setToast(null);
    if (!title.trim()) {
      setToast({ tone: "error", message: "Add a public title before saving." });
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && !title.trim()) {
      setToast({ tone: "error", message: "Public title is required before publishing." });
      setBuilderStep("basics");
      return;
    }

    if (learningVisible && !learningTitle.trim()) {
      setToast({ tone: "error", message: "Learning section title cannot be blank." });
      return;
    }

    if (learningVisible && outcomeRows.some((row) => !row.text.trim())) {
      setToast({ tone: "error", message: "Checklist points cannot be blank." });
      return;
    }

    if (faqRows.some((row) => !row.question.trim() || !row.answer.trim())) {
      setToast({ tone: "error", message: "FAQ questions and answers cannot be blank." });
      return;
    }

    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.programType === "event" && !eventDate) {
      setToast({ tone: "error", message: "Choose an event date before publishing." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.schedulePattern === "custom_dates" && effectiveBuilderStatus.programType !== "event" && trackRows.every((track) => track.sessions.every((session) => !session.date))) {
      setToast({ tone: "error", message: "Add at least one session date before publishing." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && trackRows.some((track) => !track.name.trim() || track.sessions.length === 0 || track.sessions.some((session) => session.end <= session.start))) {
      setToast({ tone: "error", message: "Each track needs a name and an end time after the start time." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft") {
      const statusValidation = validateProgramStatusCombination({
        publicationStatus: effectiveBuilderStatus.publicationStatus,
        applicationStatus: effectiveBuilderStatus.applicationStatus,
        lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
        applicationOpenAt: effectiveBuilderStatus.applicationOpenAt || null,
        applicationCloseAt: effectiveBuilderStatus.applicationCloseAt || null,
        startDate: effectiveBuilderStatus.startDate || null,
        endDate: effectiveBuilderStatus.endDate || null,
        isOngoing: effectiveBuilderStatus.durationType === "ongoing",
        billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
      });
      if (!statusValidation.valid) {
        setToast({ tone: "error", message: statusValidation.errors[0].message });
        setBuilderStep(statusValidation.errors[0].field === "endDate" ? "schedule" : "pricing");
        return;
      }
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !savedOffersMonthlyPayment && !savedOffersAnnualPayment) {
      setToast({ tone: "error", message: "Choose at least one payment option before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment && Number(price || "0") <= 0) {
      setToast({ tone: "error", message: "Add a valid monthly price before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment && Number(annualPrice || "0") <= 0) {
      setToast({ tone: "error", message: effectiveBuilderStatus.durationType === "ongoing" ? "Add a valid annual subscription price before publishing." : "Add a valid Pay in Full price before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (
      effectiveBuilderStatus.publicationStatus !== "draft" &&
      usesPerTrackPricing &&
      trackRows.some((track) =>
        (savedOffersMonthlyPayment && Number(track.priceMonthly || "0") <= 0) ||
        (savedOffersAnnualPayment && Number(track.priceAnnual || "0") <= 0)
      )
    ) {
      setToast({ tone: "error", message: "Add valid prices for every track before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (isAdminEditor && !selectedDirectorId) {
      setToast({ tone: "error", message: "Choose a director for this class." });
      return;
    }
    setBusy(true);
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      setToast({ tone: "error", message: "Log in required." });
      setBusy(false);
      return;
    }

    const nextAgeRangeText = allAges ? null : formatAgeRangeForSave(ageStart, ageEnd);
    const schedule = trackRows[0] ? (trackRows[0].sessions as unknown as Json) : null;
    const response = await fetch(`/api/programs/${program.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        internalName: null,
        title: title.trim(),
        summary: effectiveBuilderStatus.summary.trim() || null,
        description: description.trim() || null,
        category: effectiveBuilderStatus.category.trim() || null,
        programType: effectiveBuilderStatus.programType,
        publicationStatus: effectiveBuilderStatus.publicationStatus,
        applicationStatus: effectiveBuilderStatus.acceptingApplications ? effectiveBuilderStatus.applicationStatus : "not_accepting",
        applicationOpenAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationOpenAt || null : null,
        applicationCloseAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationCloseAt || null : null,
        lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
        applicationMode: effectiveBuilderStatus.applicationMode,
        acceptingApplications: effectiveBuilderStatus.acceptingApplications,
        waitlistEnabled: effectiveBuilderStatus.waitlistEnabled,
        capacityBehavior: effectiveBuilderStatus.capacityBehavior,
        defaultCapacity: null,
        durationType: effectiveBuilderStatus.programType === "event" ? "ongoing" : effectiveBuilderStatus.durationType,
        startNow: effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.startNow,
        startDate: effectiveBuilderStatus.programType === "event" ? eventDate || null : effectiveBuilderStatus.startNow ? null : effectiveBuilderStatus.startDate || null,
        endDate: effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.durationType === "fixed_months" ? effectiveBuilderStatus.endDate || null : null,
        durationMonths: effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.durationType === "fixed_months" ? monthsBetweenDates(effectiveBuilderStatus.startDate, effectiveBuilderStatus.endDate) : null,
        schedulePattern: effectiveBuilderStatus.programType === "event" ? "custom_dates" : effectiveBuilderStatus.schedulePattern,
        registrationDeadlineAt: noRegistrationDeadline ? null : effectiveBuilderStatus.registrationDeadline || null,
        location: effectiveBuilderStatus.location.trim() || null,
        room: effectiveBuilderStatus.room.trim() || null,
        roomArea: effectiveBuilderStatus.roomArea.trim() || null,
        paymentKind: effectiveBuilderStatus.paymentKind,
        billingStartBehavior: effectiveBuilderStatus.billingStartBehavior,
        billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
        billingDurationMonths: effectiveBuilderStatus.billingDurationMonths ? Number(effectiveBuilderStatus.billingDurationMonths) : null,
        allowCustomPrices: true,
        allowWaivedPayments: true,
        manualPaymentNote: effectiveBuilderStatus.manualPaymentNote.trim() || null,
        financialAssistanceNote: effectiveBuilderStatus.financialAssistanceNote.trim() || null,
        receiptNote: effectiveBuilderStatus.receiptNote.trim() || null,
        taxReceiptPolicy: effectiveBuilderStatus.taxReceiptPolicy,
        trackSwitchPolicy: effectiveBuilderStatus.trackSwitchPolicy,
        trackSwitchAllowAll: effectiveBuilderStatus.trackSwitchAllowAll,
        contactEmail: contactEmailOmitted ? "" : effectiveBuilderStatus.contactEmail.trim() || null,
        contactPhone: effectiveBuilderStatus.contactPhone.trim() || null,
        coverPriceLabelEnabled: effectiveBuilderStatus.coverPriceLabelEnabled,
        coverPriceLabel: effectiveBuilderStatus.coverPriceLabel.trim() || null,
        thumbnailUrl: thumbnailUrl.trim() || null,
        audienceGender: audienceGender || null,
        ageRangeText: nextAgeRangeText,
        isPaid: effectiveBuilderStatus.paymentKind === "tareeqah",
        offersMonthlyPayment: savedOffersMonthlyPayment,
        offersAnnualPayment: savedOffersAnnualPayment,
        usesPerTrackPricing,
        priceMonthlyCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
        priceAnnualCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
        schedule,
        scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        scheduleNotes: null,
        trackSelectionMode: savedTrackSelectionMode,
        trackSelectionCount: savedTrackSelectionCount,
        directorProfileId: isAdminEditor ? selectedDirectorId : null,
        confirmFutureApplicantsOnly,
      }),
    });

    const result = (await response.json()) as { program?: Program; error?: string; requiresFutureApplicantConfirmation?: boolean };
    if (!response.ok && result.requiresFutureApplicantConfirmation) {
      setBusy(false);
      setPendingFutureApplicantsConfirm({ statusOverride });
      return;
    }
    if (!response.ok || !result.program) {
      setToast({ tone: "error", message: result.error ?? "Could not save class." });
      setBusy(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const detailsPayload = {
      program_id: program.id,
      learning_title: learningVisible ? learningTitle.trim() : "What You Will Learn",
      learning_intro: learningVisible ? learningIntro.trim() || null : null,
      topics_intro: topicsIntro.trim() || null,
      requirements_text: requirementsText.trim() || null,
      policies_text: policiesText.trim() || null,
      instructor_display_name: instructorDisplayName.trim() || null,
      instructor_credentials: instructorCredentials.trim() || null,
      instructor_contact_phone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
      cover_director_visibility: coverDirectorVisibility,
      updated_at: new Date().toISOString(),
    };
    const { error: detailsError } = await supabase.from("program_details").upsert(detailsPayload, { onConflict: "program_id" });
    if (detailsError) {
      setToast({ tone: "error", message: friendlyErrorMessage(detailsError, "Could not save class details.") });
      setBusy(false);
      return;
    }

    await supabase.from("program_outcomes").delete().eq("program_id", program.id);
    if (learningVisible && outcomeRows.length) {
      const { error: outcomesError } = await supabase.from("program_outcomes").insert(
        outcomeRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          text: row.text.trim(),
        })),
      );
      if (outcomesError) {
        setToast({ tone: "error", message: friendlyErrorMessage(outcomesError, "Could not save learning outcomes.") });
        setBusy(false);
        return;
      }
    }

    await supabase.from("program_faqs").delete().eq("program_id", program.id);
    if (faqRows.length) {
      const { error: faqsError } = await supabase.from("program_faqs").insert(
        faqRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          question: row.question.trim(),
          answer: row.answer.trim(),
        })),
      );
      if (faqsError) {
        setToast({ tone: "error", message: friendlyErrorMessage(faqsError, "Could not save FAQs.") });
        setBusy(false);
        return;
      }
    }

    await supabase.from("program_content_sections").delete().eq("program_id", program.id);
    if (contentSectionRows.length) {
      const { error: contentSectionsError } = await supabase.from("program_content_sections").insert(
        contentSectionRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          title: row.title.trim(),
          description: row.description.trim() || null,
          duration_text: row.durationText.trim() || null,
        })),
      );
      if (contentSectionsError) {
        setToast({ tone: "error", message: friendlyErrorMessage(contentSectionsError, "Could not save content sections.") });
        setBusy(false);
        return;
      }
    }

    await supabase.from("program_media").delete().eq("program_id", program.id);
    const filledMediaRows = mediaRows.filter((row) => row.url.trim());
    if (filledMediaRows.length) {
      const { error: mediaError } = await supabase.from("program_media").insert(
        filledMediaRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          media_type: row.mediaType === "video" ? "video" : "photo",
          url: row.url.trim(),
          thumbnail_url: row.url.trim(),
          title: row.title.trim() || null,
          short_label: row.title.trim() || null,
        })),
      );
      if (mediaError) {
        setToast({ tone: "error", message: friendlyErrorMessage(mediaError, "Could not save class photos.") });
        setBusy(false);
        return;
      }
    }

    await supabase.from("program_sessions").delete().eq("program_id", program.id);
    await supabase.from("program_tracks").delete().eq("program_id", program.id);
    if (trackRows.length) {
      const { data: insertedTracks, error: tracksError } = await supabase.from("program_tracks").insert(
        trackRows.map((track, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          name: track.name.trim(),
          description: null,
          schedule: track.sessions as unknown as Json,
          location: track.location?.trim() || effectiveBuilderStatus.location.trim() || null,
          room: track.room?.trim() || effectiveBuilderStatus.room.trim() || null,
          capacity: track.capacity ? Number(track.capacity) : null,
          pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
          price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
          price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
          ...trackEligibilityOverrideColumns(track),
          is_active: true,
        })),
      ).select("id, sort_order");
      if (tracksError) {
        setToast({ tone: "error", message: friendlyErrorMessage(tracksError, "Could not save tracks.") });
        setBusy(false);
        return;
      }
      try {
        await saveCanonicalProgramSessions(supabase, program.id, insertedTracks ?? [], trackRows, {
          programType: effectiveBuilderStatus.programType,
          schedulePattern: effectiveBuilderStatus.schedulePattern,
          eventDate,
          title: title.trim(),
          location: effectiveBuilderStatus.location.trim() || null,
          room: effectiveBuilderStatus.room.trim() || null,
        });
        await saveTrackTransferRules(supabase, program.id, insertedTracks ?? [], trackRows, transferRules);
      } catch (sessionError) {
        setToast({ tone: "error", message: sessionError instanceof Error ? sessionError.message : "Could not save sessions." });
        setBusy(false);
        return;
      }
    }

    setProgram(result.program);
    setDetails(detailsPayload as ProgramDetails);
    invalidateProgramCaches(slug, program.id);
    window.dispatchEvent(new Event("tareeqah:programs-changed"));
    queueEditorToast({ tone: "success", message: "Changes saved successfully." });
    window.location.href = returnHref ?? `/m/${slug}/teacher/classes`;
  }

  if (loading) {
    return <ClassesLoadingPlaceholders count={1} />;
  }

  if (error) {
    return <EmptyState title="Could not load class settings" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This class may no longer be available." />;
  }

  if (!isDirector) {
    return <EmptyState title="Director access required" text="Only the class director can edit this class." />;
  }

  const startDateLocked = programAlreadyStarted(program);

  function goToPreviousStep() {
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.max(0, index - 1)]?.id ?? "basics");
    scrollBuilderToTop();
  }

  function getMissingBuilderFields() {
    return computeProgramBuilderMissingFields({
      title,
      programType: builderStatus.programType,
      location: builderStatus.location,
      room: builderStatus.room,
      allAges,
      ageStart,
      ageEnd,
      learningVisible,
      learningTitle,
      outcomeRows,
      faqVisible,
      faqRows,
      contentSectionsVisible,
      contentSectionRows,
      contactPhone: instructorContactPhone,
      contactPhoneOmitted,
      contactEmail: builderStatus.contactEmail,
      contactEmailOmitted,
      durationType: builderStatus.durationType,
      endDate: builderStatus.endDate,
      startNow: builderStatus.startNow,
      startDate: builderStatus.startDate,
      eventDate,
      schedulePattern: builderStatus.schedulePattern,
      noRegistrationDeadline,
      registrationDeadline: builderStatus.registrationDeadline,
      trackRows,
      paymentKind: builderStatus.paymentKind,
      offersMonthlyPayment,
      price,
      offersAnnualPayment,
      annualPrice,
      coverPriceLabelEnabled: builderStatus.coverPriceLabelEnabled,
      coverPriceLabel: builderStatus.coverPriceLabel,
    });
  }

  function advanceStepAnyway() {
    setMissingFieldsModal(null);
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
    scrollBuilderToTop();
  }

  function publishNow() {
    const publishOverride = { publicationStatus: builderStatus.publicationStatus === "hidden" ? "hidden" : "published" } as const;
    setBuilderStatus((current) => ({ ...current, ...publishOverride, applicationStatus: current.acceptingApplications ? current.applicationStatus : "not_accepting" }));
    void saveProgram(publishOverride);
  }

  function confirmStartDateChangeAndPublish() {
    setStartDateChangeConfirmOpen(false);
    const publishOverride = {
      publicationStatus: builderStatus.publicationStatus === "hidden" ? "hidden" : "published",
      lifecycleStatus: "paused",
    } as const;
    setBuilderStatus((current) => ({ ...current, ...publishOverride, applicationStatus: current.acceptingApplications ? current.applicationStatus : "not_accepting" }));
    void saveProgram(publishOverride);
  }

  function handleContinueOrPublishClick() {
    const missing = getMissingBuilderFields();
    if (builderStep !== "review") {
      const missingOnThisStep = missing.filter((field) => field.step === builderStep);
      if (missingOnThisStep.length) {
        setMissingFieldsModal({ fields: missingOnThisStep, allowContinue: true });
        return;
      }
      const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
      setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
      scrollBuilderToTop();
      return;
    }
    if (missing.length) {
      setMissingFieldsModal({ fields: missing, allowContinue: false });
      return;
    }
    const startDateChanged = startDateLocked && builderStatus.startDate.trim() && builderStatus.startDate !== (program?.start_date ?? "");
    if (startDateChanged) {
      setStartDateChangeConfirmOpen(true);
      return;
    }
    publishNow();
  }

  const editWizardContent = (
    <>
      <ProgramBuilderStepper activeStep={builderStep} />
      <ProgramBuilderActionBar busy={busy} builderStep={builderStep} onBack={goToPreviousStep} onContinueOrPublish={handleContinueOrPublishClick} />
      <h1 className="px-1 text-2xl font-semibold text-[#26323A]">{programBuilderSteps.find((step) => step.id === builderStep)?.label}</h1>

      {builderStep === "schedule" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <ProgramTimingFields
            builderStatus={builderStatus}
            setBuilderStatus={setBuilderStatus}
            eventDate={eventDate}
            setEventDate={setEventDate}
            eventTimeVisible={eventTimeVisible}
            setEventTimeVisible={setEventTimeVisible}
            noRegistrationDeadline={noRegistrationDeadline}
            setNoRegistrationDeadline={setNoRegistrationDeadline}
            startDateLocked={startDateLocked}
          />
        </section>
      ) : null}

      {builderStep === "pricing" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("How payments are handled", true)}</span>
              <select value={builderStatus.paymentKind} onChange={(event) => { const value = event.target.value as ProgramBuilderStatus["paymentKind"]; setBuilderStatus((current) => ({ ...current, paymentKind: value })); setIsPaid(value === "tareeqah"); }} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="free">Free</option>
                <option value="tareeqah">Paid through Madrasa</option>
              </select>
            </label>
            {billingMonthsFieldVisible ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Billing months</span>
                <BillingMonthsHint
                  startDate={builderStatus.startDate}
                  endDate={builderStatus.endDate}
                  chosenMonths={builderStatus.billingDurationMonths}
                />
              </label>
            ) : builderStatus.paymentKind === "tareeqah" && builderStatus.durationType === "ongoing" && builderStatus.programType !== "event" && (offersMonthlyPayment || offersAnnualPayment) ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Number of billing months</span>
                <input value="Ongoing — billed until cancelled" disabled className="h-10 w-full rounded-[8px] border border-[#D6DCE0] bg-[#F1F4F5] px-3 text-sm font-medium text-[#8A949B] outline-none" />
              </label>
            ) : null}
            {builderStatus.paymentKind === "tareeqah" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Tax receipt policy</span>
                <select
                  value={builderStatus.taxReceiptPolicy}
                  onChange={(event) => setBuilderStatus((current) => ({ ...current, taxReceiptPolicy: event.target.value as ProgramBuilderStatus["taxReceiptPolicy"] }))}
                  className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="not_applicable">Not a tax-deductible donation</option>
                  <option value="admin_review_required">May be eligible - admin reviews each payment</option>
                  <option value="eligible_confirmed">Eligible as a charitable donation (confirmed)</option>
                </select>
              </label>
            ) : null}
            <ProgramApplicationAvailabilityFields builderStatus={builderStatus} setBuilderStatus={setBuilderStatus} />
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <div className="space-y-5 bg-[var(--workspace)] p-4 pb-40">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      {missingFieldsModal ? (
        <MissingFieldsModal
          missingFields={missingFieldsModal.fields}
          allowContinue={missingFieldsModal.allowContinue}
          onContinueAnyway={advanceStepAnyway}
          onClose={() => setMissingFieldsModal(null)}
        />
      ) : null}
      {startDateChangeConfirmOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
              <div ref={startDateChangeModalRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[24px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
                <h2 className="text-lg font-semibold">Change start date?</h2>
                <p className="mt-2 text-sm leading-6 text-[#6B747B]">
                  This class has already started. Changing the start date will pause the class until then, and it won&apos;t be treated as an active class in the meantime.
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setStartDateChangeConfirmOpen(false)} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmStartDateChangeAndPublish}
                    className="min-h-10 rounded-[10px] bg-[#17624F] px-4 text-xs font-semibold text-white"
                  >
                    Pause and update start date
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {pendingFutureApplicantsConfirm ? (
        <ConfirmModal
          title="Apply to future applicants only?"
          text="Existing students will keep their current approved payment terms. These changes apply only to future applicants. To change a current student's billing, use Manage Finances."
          confirmLabel="Apply Changes"
          onConfirm={async () => {
            const statusOverride = pendingFutureApplicantsConfirm.statusOverride;
            setPendingFutureApplicantsConfirm(null);
            await saveProgram(statusOverride, true);
          }}
          onCancel={() => setPendingFutureApplicantsConfirm(null)}
        />
      ) : null}
      {editWizardContent}

      {builderStep === "basics" ? (
        <section className="overflow-hidden rounded-2xl border border-[#E1E8EC] bg-white">
          <div className="relative">
            <ProgramHero program={{ ...program, title, thumbnail_url: thumbnailUrl || null }} />
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (file) {
                  setThumbnailCropFile(file);
                }
              }}
            />
            <button type="button" onClick={() => thumbnailInputRef.current?.click()} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#26323A] shadow-lg" aria-label="Replace thumbnail">
              <PhotoIcon />
            </button>
          </div>
          {thumbnailCropFile ? (
            <ImageCropModal
              file={thumbnailCropFile}
              title="Crop thumbnail"
              aspectRatio={4 / 3}
              outputWidth={1200}
              outputHeight={900}
              onCancel={() => setThumbnailCropFile(null)}
              onConfirm={(croppedFile) => {
                handleThumbnailFile(croppedFile);
                setThumbnailCropFile(null);
              }}
            />
          ) : null}
          <div className="space-y-3 p-4">
            <EditBox label="Public name" required value={title} onChange={setTitle} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Class type", true)}</span>
              <select value={builderStatus.programType} onChange={(event) => setBuilderStatus((current) => ({ ...current, programType: event.target.value as ProgramBuilderStatus["programType"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="recurring">Recurring program</option>
                <option value="event">One-time event</option>
              </select>
            </label>
            {summaryVisible || builderStatus.summary.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Short summary / tagline" value={builderStatus.summary} onChange={(value) => setBuilderStatus((current) => ({ ...current, summary: value }))} />
                <button type="button" onClick={() => { setSummaryVisible(false); setBuilderStatus((current) => ({ ...current, summary: "" })); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove summary
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSummaryVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add short summary / tagline
              </button>
            )}
            {descriptionVisible || description.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Description" value={description} onChange={setDescription} multiline />
                <button type="button" onClick={() => { setDescriptionVisible(false); setDescription(""); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove description
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDescriptionVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add description
              </button>
            )}
            <div className="grid gap-3">
              <EditBox label="Location name" required value={builderStatus.location} onChange={(value) => setBuilderStatus((current) => ({ ...current, location: value }))} />
              <EditBox label="Location address" required value={builderStatus.room} onChange={(value) => setBuilderStatus((current) => ({ ...current, room: value }))} />
              {roomVisible || builderStatus.roomArea.trim() ? (
                <div className="space-y-1.5">
                  <EditBox label="Room / Area" value={builderStatus.roomArea} onChange={(value) => setBuilderStatus((current) => ({ ...current, roomArea: value }))} />
                  <button
                    type="button"
                    onClick={() => {
                      setRoomVisible(false);
                      setBuilderStatus((current) => ({ ...current, roomArea: "" }));
                    }}
                    className="justify-self-start text-sm font-semibold text-[#C0392B]"
                  >
                    Remove Room / Area
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setRoomVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                  Add Room / Area
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {builderStep === "basics" && isAdminEditor ? (
        <section className="space-y-2 bg-white px-4 py-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B747B]" htmlFor="edit-program-director">
            Class Director
          </label>
          <select id="edit-program-director" value={selectedDirectorId} onChange={(event) => setSelectedDirectorId(event.target.value)} className="h-12 w-full rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]">
            <option value="">Choose director</option>
            {directorOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name || teacher.email || "Unnamed teacher"}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      <ProgramEditorFields
        masjidLabel={slug.charAt(0).toUpperCase() + slug.slice(1)}
        builderStatus={builderStatus}
        setBuilderStatus={setBuilderStatus}
        isEditMode
        activeStep={builderStep}
        programType={builderStatus.programType}
        schedulePattern={builderStatus.schedulePattern}
        previewProgram={buildProgramPreview({
          id: program.id,
          title: title || program.title,
          description,
          thumbnailUrl,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid: builderStatus.paymentKind === "tareeqah",
          offersMonthlyPayment: builderStatus.programType === "event" ? false : offersMonthlyPayment,
          offersAnnualPayment: builderStatus.programType === "event" ? true : offersAnnualPayment,
          priceMonthlyCents: builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: builderStatus.paymentKind === "tareeqah" ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule: trackRows[0]?.sessions as unknown as Json,
          trackSelectionMode,
          trackSelectionCount,
          base: program,
        })}
        eventDate={eventDate}
        setEventDate={setEventDate}
        eventTimeVisible={eventTimeVisible}
        setEventTimeVisible={setEventTimeVisible}
        learningVisible={learningVisible}
        setLearningVisible={setLearningVisible}
        learningTitle={learningTitle}
        setLearningTitle={setLearningTitle}
        learningIntro={learningIntro}
        setLearningIntro={setLearningIntro}
        learningDescriptionVisible={learningDescriptionVisible}
        setLearningDescriptionVisible={setLearningDescriptionVisible}
        topicsIntro={topicsIntro}
        setTopicsIntro={setTopicsIntro}
        requirementsText={requirementsText}
        setRequirementsText={setRequirementsText}
        policiesText={policiesText}
        setPoliciesText={setPoliciesText}
        outcomeRows={outcomeRows}
        setOutcomeRows={setOutcomeRows}
        faqVisible={faqVisible}
        setFaqVisible={setFaqVisible}
        faqRows={faqRows}
        setFaqRows={setFaqRows}
        contentSectionsVisible={contentSectionsVisible}
        setContentSectionsVisible={setContentSectionsVisible}
        contentSectionRows={contentSectionRows}
        setContentSectionRows={setContentSectionRows}
        mediaVisible={mediaVisible}
        setMediaVisible={setMediaVisible}
        mediaRows={mediaRows}
        setMediaRows={setMediaRows}
        onMediaFile={uploadProgramMedia}
        addMedia={addMedia}
        trackRows={trackRows}
        setTrackRows={setTrackRows}
        addTrack={addTrack}
        transferRules={transferRules}
        setTransferRules={setTransferRules}
        trackSelectionMode={trackSelectionMode}
        setTrackSelectionMode={setTrackSelectionMode}
        trackSelectionCount={trackSelectionCount}
        setTrackSelectionCount={setTrackSelectionCount}
        allAges={allAges}
        setAllAges={setAllAges}
        ageStart={ageStart}
        setAgeStart={setAgeStart}
        ageEnd={ageEnd}
        setAgeEnd={setAgeEnd}
        audienceGender={audienceGender}
        setAudienceGender={setAudienceGender}
        paymentKind={builderStatus.paymentKind}
        durationMonthsForPricing={pricingDurationMonths}
        isPaid={builderStatus.paymentKind === "tareeqah"}
        setIsPaid={setIsPaid}
        offersMonthlyPayment={offersMonthlyPayment}
        setOffersMonthlyPayment={setOffersMonthlyPayment}
        offersAnnualPayment={offersAnnualPayment}
        setOffersAnnualPayment={setOffersAnnualPayment}
        price={price}
        setPrice={setPrice}
        annualPrice={annualPrice}
        setAnnualPrice={setAnnualPrice}
        instructorDisplayName={instructorDisplayName}
        setInstructorDisplayName={setInstructorDisplayName}
        instructorCredentials={instructorCredentials}
        setInstructorCredentials={setInstructorCredentials}
        instructorContactPhone={instructorContactPhone}
        setInstructorContactPhone={setInstructorContactPhone}
        coverDirectorVisibility={coverDirectorVisibility}
        setCoverDirectorVisibility={setCoverDirectorVisibility}
        contactEmail={builderStatus.contactEmail}
        setContactEmail={(value) => setBuilderStatus((current) => ({ ...current, contactEmail: value }))}
        contactPhoneOmitted={contactPhoneOmitted}
        setContactPhoneOmitted={setContactPhoneOmitted}
        contactEmailOmitted={contactEmailOmitted}
        setContactEmailOmitted={setContactEmailOmitted}
        coverPriceLabelEnabled={builderStatus.coverPriceLabelEnabled}
        setCoverPriceLabelEnabled={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabelEnabled: value }))}
        coverPriceLabel={builderStatus.coverPriceLabel}
        setCoverPriceLabel={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabel: value }))}
      />

      <ProgramBuilderActionBar busy={busy} builderStep={builderStep} onBack={goToPreviousStep} onContinueOrPublish={handleContinueOrPublishClick} sticky message={message} />
    </div>
  );
}

function buildProgramPreview({
  id,
  title,
  description,
  thumbnailUrl,
  audienceGender,
  ageRangeText,
  isPaid,
  offersMonthlyPayment,
  offersAnnualPayment,
  priceMonthlyCents,
  priceAnnualCents,
  schedule,
  trackSelectionMode,
  trackSelectionCount,
  base,
}: {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  audienceGender: string;
  ageRangeText: string | null;
  isPaid: boolean;
  offersMonthlyPayment?: boolean;
  offersAnnualPayment?: boolean;
  priceMonthlyCents: number | null;
  priceAnnualCents?: number | null;
  schedule: Json | null;
  trackSelectionMode: TrackSelectionMode;
  trackSelectionCount: number;
  base?: Program;
}): Program {
  return {
    id,
    mosque_id: base?.mosque_id ?? "",
    teacher_profile_id: base?.teacher_profile_id ?? null,
    director_profile_id: base?.director_profile_id ?? null,
    ...defaultProgramBuilderColumns(),
    internal_name: base?.internal_name ?? null,
    summary: base?.summary ?? null,
    category: base?.category ?? null,
    program_type: base?.program_type ?? "recurring",
    publication_status: base?.publication_status ?? "draft",
    application_status: base?.application_status ?? "not_accepting",
    lifecycle_status: base?.lifecycle_status ?? "upcoming",
    application_mode: base?.application_mode ?? "application_required",
    accepting_applications: base?.accepting_applications ?? false,
    title,
    description: description.trim() || null,
    is_active: true,
    is_paid: isPaid,
    offers_monthly_payment: isPaid ? offersMonthlyPayment !== false : false,
    offers_annual_payment: isPaid ? Boolean(offersAnnualPayment) : false,
    thumbnail_url: thumbnailUrl.trim() || null,
    price_monthly_cents: isPaid ? priceMonthlyCents : null,
    price_annual_cents: isPaid ? priceAnnualCents ?? null : null,
    stripe_product_id: base?.stripe_product_id ?? null,
    stripe_price_id: base?.stripe_price_id ?? null,
    stripe_annual_price_id: base?.stripe_annual_price_id ?? null,
    audience_gender: audienceGender || null,
    age_range_text: ageRangeText,
    schedule,
    schedule_timezone: base?.schedule_timezone ?? null,
    schedule_notes: null,
    track_selection_mode: trackSelectionMode,
    track_selection_count: Math.max(1, trackSelectionCount),
    tags: base?.tags ?? null,
    created_at: base?.created_at ?? "",
    updated_at: base?.updated_at ?? "",
  };
}

function ProgramEditorPreview({
  program,
  learningTitle,
  learningIntro,
  outcomes,
  faqRows,
  mediaRows,
  trackRows,
  instructorDisplayName,
  instructorCredentials,
  instructorContactPhone,
  onBack,
}: {
  program: Program;
  learningTitle: string;
  learningIntro: string;
  outcomes: string[];
  faqRows: ProgramEditorFaqRow[];
  mediaRows: Array<{ id: string; url: string; title: string; mediaType: string; previewUrl?: string }>;
  trackRows: ProgramEditorTrackRow[];
  instructorDisplayName: string;
  instructorCredentials: string;
  instructorContactPhone: string;
  onBack: () => void;
}) {
  const age = formatAgeRange(program.age_range_text);
  const gender = formatGender(program.audience_gender);
  const price = formatPrice(program.price_monthly_cents);
  const previewTracks = trackRows.map((track, index): ProgramTrack => ({
    id: track.id,
    program_id: program.id,
    name: track.name.trim() || `Track ${index + 1}`,
    description: null,
    schedule: track.sessions as unknown as Json,
    ...defaultProgramTrackBuilderColumns(),
    pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
    price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
    price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
    ...trackEligibilityOverrideColumns(track),
    sort_order: index + 1,
    is_active: true,
    created_at: "",
    updated_at: "",
  }));
  const visibleMediaRows = mediaRows.filter((row) => row.previewUrl || row.url);

  return (
    <div className="fixed inset-0 z-[9000] overflow-y-auto bg-white">
      <button
        type="button"
        onClick={onBack}
        className="fixed left-[max(16px,calc(50%-244px))] top-3 z-[9010] inline-flex min-h-10 items-center rounded-full bg-[#26323A] px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(38,50,58,0.18)] transition active:scale-95 active:bg-[#1B2429]"
      >
        Back to Editor
      </button>

      <div className="mx-auto min-h-full max-w-[520px] space-y-5 bg-white p-4 pb-32 pt-16">
      <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
        <ProgramHero program={program} />
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#17624F]">
            <span>{age}</span>
            <span aria-hidden>•</span>
            <span>{gender}</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-8 text-[#26323A]">{program.title}</h1>
            {program.description?.trim() ? <p className="mt-2 text-sm leading-7 text-[#52616A]">{program.description.trim()}</p> : null}
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-[#C8DCE2] bg-white p-4 shadow-[0_14px_34px_rgba(38,50,58,0.10)]">
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold text-[#26323A]">{price}</p>
          {program.is_paid ? <span className="text-xs text-[#6B747B]">monthly</span> : null}
        </div>
        {previewTracks.length ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Choose schedule</p>
              <p className="text-right text-[11px] font-medium text-[#7B858C]">{trackSelectionRuleText(program, previewTracks.length)}</p>
            </div>
            {previewTracks.map((track) => {
              const schedule = scheduleSummary(track.schedule, null);
              return (
                <div key={track.id} className="rounded-[14px] border border-[#D6DCE0] bg-[#F8FBFC] p-3 text-left">
                  <span className="block text-sm font-semibold text-[#26323A]">{track.name}</span>
                  <span className="mt-1 block text-xs font-medium text-[#17624F]">{schedule.full}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <button type="button" disabled className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold text-white opacity-70 md:w-auto md:px-10">
          Request Enrollment
        </button>
        <dl className="mt-5 divide-y divide-[#E6ECEF] text-sm">
          <SidebarFact label="Age" value={age} />
          <SidebarFact label="Audience" value={gender} />
          <SidebarFact label="Schedule" value={previewTracks[0] ? scheduleSummary(previewTracks[0].schedule, null).full : scheduleSummary(program.schedule, null).full} />
          <SidebarFact label="Teacher" value={instructorDisplayName.trim() || "Teacher to be announced"} />
          <SidebarFact label="Status" value="Open" />
        </dl>
      </aside>

      {(learningIntro.trim() || outcomes.length) && learningTitle.trim() ? (
        <DetailSection title={learningTitle.trim()}>
          {learningIntro.trim() ? <p className="text-sm leading-7 text-[#52616A]">{learningIntro}</p> : null}
          {outcomes.length ? (
            <div className={cn("grid gap-3 sm:grid-cols-2", learningIntro.trim() ? "mt-5" : "")}>
              {outcomes.map((item) => (
                <div key={item} className="flex gap-3 text-sm text-[#26323A]">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E3F5EE] text-xs font-semibold text-[#228763]">✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      {visibleMediaRows.length ? (
        <DetailSection title="Class Media">
          <div className="space-y-3">
            {visibleMediaRows.map((row) => (
              <div key={row.id} className="overflow-hidden rounded-[16px] border border-[#E6ECEF]">
                <div className="relative h-40 bg-[#E7EEF2]">
                  <Image src={row.previewUrl || row.url} alt="" fill className="object-cover" sizes="360px" />
                </div>
                {row.title.trim() ? <p className="p-3 text-sm font-semibold text-[#26323A]">{row.title}</p> : null}
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title="Instructor">
        <h2 className="text-base font-semibold text-[#26323A]">{instructorDisplayName.trim() || "Teacher to be announced"}</h2>
        {instructorCredentials.trim() ? <p className="mt-3 text-sm leading-7 text-[#52616A]">{instructorCredentials}</p> : null}
        {instructorContactPhone.trim() ? <p className="mt-3 text-sm font-medium text-[#17624F]">{instructorContactPhone}</p> : null}
      </DetailSection>

      {faqRows.length ? (
        <ProgramFaqSection
          faqs={faqRows.map((row, index) => ({
            id: row.id || `preview-faq-${index}`,
            question: row.question.trim() || `Question ${index + 1}`,
            answer: row.answer.trim() || "Add an answer for this FAQ.",
          }))}
        />
      ) : null}
      </div>
    </div>
  );
}

type ProgramBuilderMissingField = { label: string; step: ProgramBuilderStep };

function computeProgramBuilderMissingFields(input: {
  title: string;
  programType: ProgramBuilderStatus["programType"];
  location: string;
  room: string;
  allAges: boolean;
  ageStart: string;
  ageEnd: string;
  learningVisible: boolean;
  learningTitle: string;
  outcomeRows: Array<{ text: string }>;
  faqVisible: boolean;
  faqRows: ProgramEditorFaqRow[];
  contentSectionsVisible: boolean;
  contentSectionRows: ProgramEditorContentSectionRow[];
  contactPhone: string;
  contactPhoneOmitted: boolean;
  contactEmail: string;
  contactEmailOmitted: boolean;
  durationType: ProgramBuilderStatus["durationType"];
  endDate: string;
  startNow: boolean;
  startDate: string;
  eventDate: string;
  schedulePattern: ProgramBuilderStatus["schedulePattern"];
  noRegistrationDeadline: boolean;
  registrationDeadline: string;
  trackRows: ProgramEditorTrackRow[];
  paymentKind: ProgramBuilderStatus["paymentKind"];
  offersMonthlyPayment: boolean;
  price: string;
  offersAnnualPayment: boolean;
  annualPrice: string;
  coverPriceLabelEnabled: boolean;
  coverPriceLabel: string;
}): ProgramBuilderMissingField[] {
  const missing: ProgramBuilderMissingField[] = [];

  if (!input.title.trim()) missing.push({ label: "Public name", step: "basics" });
  if (!input.location.trim()) missing.push({ label: "Location name", step: "basics" });
  if (!input.room.trim()) missing.push({ label: "Location address", step: "basics" });
  const ageBounds = [input.ageStart.trim(), input.ageEnd.trim()].filter(Boolean);
  if (!input.allAges && ageBounds.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
    missing.push({ label: "Valid age limits", step: "basics" });
  }

  if (input.outcomeRows.length > 0) {
    if (!input.learningTitle.trim()) missing.push({ label: "Learning Outcomes section title", step: "public" });
    if (input.outcomeRows.some((row) => !row.text.trim())) missing.push({ label: "Learning Outcomes: fill in every outcome point", step: "public" });
  }
  if (input.faqRows.length > 0 && input.faqRows.some((row) => !row.question.trim() || !row.answer.trim())) {
    missing.push({ label: "FAQ: fill in every question and answer", step: "public" });
  }
  if (input.contentSectionRows.length > 0 && input.contentSectionRows.some((row) => !row.title.trim())) {
    missing.push({ label: "Class Content: fill in every item title", step: "public" });
  }
  if (!input.contactPhoneOmitted && !input.contactPhone.trim()) missing.push({ label: "Contact phone (or mark Do not include)", step: "basics" });
  if (!input.contactEmailOmitted && !input.contactEmail.trim()) missing.push({ label: "Contact email (or mark Do not include)", step: "basics" });

  if (input.programType === "event") {
    if (!input.eventDate.trim()) missing.push({ label: "Event date", step: "schedule" });
  } else {
    if (input.durationType === "fixed_months" && !input.endDate.trim()) missing.push({ label: "End date", step: "schedule" });
    if (!input.startNow && !input.startDate.trim()) missing.push({ label: "Start date (or choose Start now)", step: "schedule" });
    if (input.schedulePattern === "weekly") {
      const weeklySessionCount = uniqueScheduleRows(input.trackRows.flatMap((track) => track.sessions)).length;
      if (weeklySessionCount === 0) missing.push({ label: "At least one weekly session", step: "schedule" });
      if (input.trackRows.length === 0 || input.trackRows.some((track) => track.sessions.length === 0)) {
        missing.push({ label: "Every track needs at least one session (no empty tracks)", step: "schedule" });
      }
    }
  }
  if (!input.noRegistrationDeadline && !input.registrationDeadline.trim()) {
    missing.push({ label: "Registration deadline (or choose No registration deadline)", step: "schedule" });
  }

  if (input.paymentKind === "tareeqah") {
    const annualPriceLabel = input.durationType === "ongoing" ? "Annual subscription price" : "Pay in Full price";
    const perTrackPricingEnabled =
      input.programType === "recurring" &&
      input.schedulePattern === "weekly" &&
      input.trackRows.length > 0 &&
      input.trackRows.some((track) => track.pricingOverrideEnabled);
    if (perTrackPricingEnabled) {
      if (input.offersMonthlyPayment && input.trackRows.some((track) => !(Number(track.priceMonthly) > 0))) {
        missing.push({ label: "Monthly price for every track", step: "pricing" });
      }
      if (input.offersAnnualPayment && input.trackRows.some((track) => !(Number(track.priceAnnual) > 0))) {
        missing.push({ label: `${annualPriceLabel} for every track`, step: "pricing" });
      }
    } else {
      if (input.offersMonthlyPayment && !(Number(input.price) > 0)) missing.push({ label: "Monthly price", step: "pricing" });
      if (input.offersAnnualPayment && !(Number(input.annualPrice) > 0)) missing.push({ label: annualPriceLabel, step: "pricing" });
    }
  }
  if (input.coverPriceLabelEnabled && !input.coverPriceLabel.trim()) missing.push({ label: "Price tag label", step: "pricing" });

  return missing;
}

function MissingFieldsModal({
  missingFields,
  allowContinue,
  onContinueAnyway,
  onClose,
}: {
  missingFields: ProgramBuilderMissingField[];
  allowContinue: boolean;
  onContinueAnyway?: () => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[24px] bg-white p-5 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-lg font-semibold">Required fields missing</h2>
        <p className="mt-1 text-sm leading-6 text-[#6B747B]">
          {allowContinue
            ? "You can still move on, but these need to be filled in before this class can be published."
            : "These need to be filled in before you can publish."}
        </p>
        <ul className="mt-4 space-y-2">
          {missingFields.map((field) => (
            <li key={field.label} className="flex items-start gap-2 text-sm text-[#26323A]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C83F31]" aria-hidden />
              {field.label}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-[10px] border border-[#C9D3D8] bg-white px-4 text-sm font-semibold text-[#26323A]">
            {allowContinue ? "Review Fields" : "Close"}
          </button>
          {allowContinue ? (
            <button type="button" onClick={onContinueAnyway} className="min-h-10 rounded-[10px] bg-[#17624F] px-4 text-sm font-semibold text-white">
              Continue Anyway
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProgramBuilderActionBar({
  busy,
  builderStep,
  onBack,
  onContinueOrPublish,
  sticky = false,
  message,
}: {
  busy: boolean;
  builderStep: ProgramBuilderStep;
  onBack: () => void;
  onContinueOrPublish: () => void;
  sticky?: boolean;
  message?: string | null;
}) {
  return (
    <div className={cn("z-10 space-y-2 bg-white py-2 md:max-w-[420px]", sticky ? "sticky bottom-[92px] md:bottom-4" : "")}>
      {message ? <p className="text-sm font-medium text-[#52616A]">{message}</p> : null}
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || builderStep === "basics"} onClick={onBack} className="min-h-11 shrink-0 rounded-[10px] border border-[#C9D3D8] bg-white px-4 text-sm font-semibold text-[#26323A] transition active:scale-95 active:bg-[#F2F4F5] disabled:opacity-40">
          Back
        </button>
        <button type="button" disabled={busy} onClick={onContinueOrPublish} className="min-h-11 flex-[1.4] rounded-[10px] bg-[#17624F] px-5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Saving..." : builderStep === "review" ? "Publish" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function ProgramTimingFields({
  builderStatus,
  setBuilderStatus,
  eventDate,
  setEventDate,
  eventTimeVisible,
  setEventTimeVisible,
  noRegistrationDeadline,
  setNoRegistrationDeadline,
  startDateLocked = false,
}: {
  builderStatus: ProgramBuilderStatus;
  setBuilderStatus: Dispatch<SetStateAction<ProgramBuilderStatus>>;
  eventDate: string;
  setEventDate: (value: string) => void;
  eventTimeVisible: boolean;
  setEventTimeVisible: (value: boolean) => void;
  noRegistrationDeadline: boolean;
  setNoRegistrationDeadline: (value: boolean) => void;
  startDateLocked?: boolean;
}) {
  const endDateInvalid = Boolean(
    builderStatus.durationType === "fixed_months" &&
      builderStatus.startDate &&
      builderStatus.endDate &&
      new Date(`${builderStatus.endDate}T00:00:00`).getTime() <= new Date(`${builderStatus.startDate}T00:00:00`).getTime(),
  );

  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      {builderStatus.programType === "recurring" ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("When does it end?", true)}</span>
          <select
            value={builderStatus.durationType}
            onChange={(event) => {
              const value = event.target.value as ProgramBuilderStatus["durationType"];
              setBuilderStatus((current) => ({
                ...current,
                durationType: value,
                billingEndBehavior: value === "ongoing" && current.billingEndBehavior === "program_end" ? "manual_cancel" : current.billingEndBehavior,
                endDate: value === "ongoing" ? "" : current.endDate,
              }));
            }}
            className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
          >
            <option value="ongoing">Ongoing until manually ended</option>
            <option value="fixed_months">Ends on a specific date</option>
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel(builderStatus.programType === "event" ? "Event date" : "Start date", true)}</span>
        {builderStatus.programType === "event" ? (
          <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]" />
        ) : (
          <>
            <input
              type={builderStatus.startNow ? "text" : "date"}
              disabled={builderStatus.startNow}
              value={builderStatus.startNow ? "Start Immediately" : builderStatus.startDate}
              onChange={(event) => setBuilderStatus((current) => ({ ...current, startDate: event.target.value }))}
              className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#52616A]"
            />
            {startDateLocked ? (
              <p className="mt-2 text-xs leading-5 text-[#8A5A00]">This class has already started. Changing this date will pause the class until then.</p>
            ) : (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
                <input type="checkbox" checked={builderStatus.startNow} onChange={(event) => setBuilderStatus((current) => ({ ...current, startNow: event.target.checked }))} />
                Start now after publishing
              </label>
            )}
          </>
        )}
      </label>
      {builderStatus.programType === "recurring" && builderStatus.durationType === "fixed_months" ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("End date", true)}</span>
          <input
            type="date"
            value={builderStatus.endDate}
            onChange={(event) => setBuilderStatus((current) => ({ ...current, endDate: event.target.value }))}
            className={cn("h-10 w-full rounded-[8px] border bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]", endDateInvalid ? "border-[#C83F31]" : "border-[#B9C3C8]")}
          />
          {endDateInvalid ? (
            <span className="mt-1 block text-xs leading-5 text-[#C83F31]">End date must be after the start date.</span>
          ) : null}
        </label>
      ) : null}
      {builderStatus.programType === "recurring" ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Schedule pattern</span>
          <select value={builderStatus.schedulePattern} onChange={(event) => setBuilderStatus((current) => ({ ...current, schedulePattern: event.target.value as ProgramBuilderStatus["schedulePattern"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
            <option value="weekly">Weekly repeating</option>
            <option value="custom_dates">Custom session dates</option>
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Registration deadline", !noRegistrationDeadline)}</span>
        <input type={noRegistrationDeadline ? "text" : "datetime-local"} disabled={noRegistrationDeadline} value={noRegistrationDeadline ? "None" : builderStatus.registrationDeadline} onChange={(event) => setBuilderStatus((current) => ({ ...current, registrationDeadline: event.target.value }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#52616A]" />
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
          <input type="checkbox" checked={noRegistrationDeadline} onChange={(event) => { setNoRegistrationDeadline(event.target.checked); if (event.target.checked) setBuilderStatus((current) => ({ ...current, registrationDeadline: "" })); }} />
          No registration deadline
        </label>
      </label>
      {builderStatus.programType === "event" && !eventTimeVisible ? <button type="button" onClick={() => setEventTimeVisible(true)} className="block text-sm font-semibold text-[#2F8FB3]">Add start and end time</button> : null}
    </div>
  );
}

type ApplicationAvailabilityChoice = "not_yet" | "now" | "later" | "invite" | "waitlist";

function applicationAvailabilityChoiceFromStatus(status: ProgramApplicationStatus): ApplicationAvailabilityChoice {
  switch (status) {
    case "accepting":
      return "now";
    case "opens_later":
      return "later";
    case "invite_only":
      return "invite";
    case "waitlist_only":
      return "waitlist";
    default:
      return "not_yet";
  }
}

function ProgramApplicationAvailabilityFields({
  builderStatus,
  setBuilderStatus,
}: {
  builderStatus: ProgramBuilderStatus;
  setBuilderStatus: Dispatch<SetStateAction<ProgramBuilderStatus>>;
}) {
  const choice = applicationAvailabilityChoiceFromStatus(builderStatus.applicationStatus);
  const openBeforeClose =
    !builderStatus.applicationOpenAt ||
    !builderStatus.applicationCloseAt ||
    new Date(builderStatus.applicationCloseAt).getTime() > new Date(builderStatus.applicationOpenAt).getTime();

  return (
    <>
      <label className="block md:col-span-2">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Can students apply?", true)}</span>
        <select
          value={choice}
          onChange={(event) => {
            const nextChoice = event.target.value as ApplicationAvailabilityChoice;
            setBuilderStatus((current) => {
              const applicationStatus: ProgramApplicationStatus =
                nextChoice === "now"
                  ? "accepting"
                  : nextChoice === "later"
                    ? "opens_later"
                    : nextChoice === "invite"
                      ? "invite_only"
                      : nextChoice === "waitlist"
                        ? "waitlist_only"
                        : "not_accepting";
              return {
                ...current,
                applicationStatus,
                acceptingApplications: applicationStatus === "accepting",
                applicationMode: applicationStatus === "invite_only" ? "invite_only" : "application_required",
                applicationOpenAt: applicationStatus === "opens_later" ? current.applicationOpenAt : "",
                applicationCloseAt: applicationStatus === "opens_later" ? current.applicationCloseAt : "",
              };
            });
          }}
          className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
        >
          <option value="not_yet">No, not yet</option>
          <option value="now">Yes, start now</option>
          <option value="later">Yes, starting later</option>
          <option value="waitlist">Waitlist only</option>
          <option value="invite">Invite only</option>
        </select>
      </label>
      {choice === "later" ? (
        <>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Applications open", true)}</span>
            <input
              type="datetime-local"
              value={builderStatus.applicationOpenAt}
              onChange={(event) => setBuilderStatus((current) => ({ ...current, applicationOpenAt: event.target.value }))}
              className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Applications close (optional)</span>
            <input
              type="datetime-local"
              value={builderStatus.applicationCloseAt}
              onChange={(event) => setBuilderStatus((current) => ({ ...current, applicationCloseAt: event.target.value }))}
              className={cn("h-10 w-full rounded-[8px] border bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]", openBeforeClose ? "border-[#B9C3C8]" : "border-[#C83F31]")}
            />
            {!openBeforeClose ? <span className="mt-1 block text-xs leading-5 text-[#C83F31]">Close date must be after the open date.</span> : null}
          </label>
        </>
      ) : null}
      {choice === "waitlist" ? (
        <p className="rounded-[10px] border border-[#DCE7EB] bg-[#F7FBFC] px-3 py-3 text-sm font-semibold text-[#52616A] md:col-span-2">Families will see a &quot;Join Waitlist&quot; button instead of Apply.</p>
      ) : null}
      {choice === "invite" ? (
        <p className="rounded-[10px] border border-[#DCE7EB] bg-[#F7FBFC] px-3 py-3 text-sm font-semibold text-[#52616A] md:col-span-2">Families will see &quot;Invite required&quot; instead of Apply. An invite-code flow isn&apos;t built yet — this only controls the public messaging for now.</p>
      ) : null}
    </>
  );
}

function EditBox({
  label,
  value,
  onChange,
  required = false,
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">
        {formatRequiredLabel(label, required)}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="min-h-24 w-full resize-y rounded-[8px] border border-[#B9C3C8] bg-white px-3 py-2 text-sm leading-6 text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#9AA4AA]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#9AA4AA]"
        />
      )}
    </label>
  );
}

function ProgramBuilderStepper({
  activeStep,
}: {
  activeStep: ProgramBuilderStep;
}) {
  const activeIndex = programBuilderSteps.findIndex((step) => step.id === activeStep);
  return (
    <nav className="px-1 py-1" aria-label="Class builder steps">
      <ol className="grid grid-cols-5 items-center gap-1 sm:gap-2">
        {programBuilderSteps.map((step, index) => {
          const active = step.id === activeStep;
          const complete = index < activeIndex;
          return (
            <li key={step.id} className="relative flex min-w-0 justify-center">
              {index > 0 ? <span className={cn("absolute right-1/2 top-1/2 hidden h-px w-full -translate-y-1/2 sm:block", complete || active ? "bg-[#17624F]" : "bg-[#DDE7EA]")} aria-hidden /> : null}
              <div
                className={cn(
                  "relative z-10 flex min-w-0 items-center justify-center gap-2 bg-[var(--workspace)] px-1 py-1.5 text-xs font-semibold transition sm:px-2",
                  active ? "text-[#17624F]" : "text-[#6B747B]",
                )}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs", active || complete ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#C9D3D8] bg-white text-[#7B858C]")}>
                  {complete ? "✓" : index + 1}
                </span>
                <span className="hidden truncate sm:inline">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ProgramStatusBadge({ status }: { status: ProgramBuilderStatus["publicationStatus"] }) {
  const label = status.replace(/_/g, " ");
  return (
    <span className="rounded-full bg-[#EFF5F2] px-3 py-1 text-xs font-semibold capitalize text-[#17624F]">
      {label}
    </span>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[#E6ECEF] pt-3 first:border-t-0 first:pt-0 md:first:border-t md:first:pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7B858C]">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[#26323A]">{value || "Not set"}</p>
    </div>
  );
}

type ProgramEditorFieldsProps = {
  masjidLabel?: string;
  activeStep?: ProgramBuilderStep;
  programType?: ProgramBuilderStatus["programType"];
  schedulePattern?: ProgramBuilderStatus["schedulePattern"];
  previewProgram?: Program;
  eventDate?: string;
  setEventDate?: (value: string) => void;
  eventTimeVisible?: boolean;
  setEventTimeVisible?: (value: boolean) => void;
  learningVisible: boolean;
  setLearningVisible: (value: boolean) => void;
  learningTitle: string;
  setLearningTitle: (value: string) => void;
  learningIntro: string;
  setLearningIntro: (value: string) => void;
  learningDescriptionVisible?: boolean;
  setLearningDescriptionVisible?: (value: boolean) => void;
  topicsIntro?: string;
  setTopicsIntro?: (value: string) => void;
  requirementsText?: string;
  setRequirementsText?: (value: string) => void;
  policiesText?: string;
  setPoliciesText?: (value: string) => void;
  outcomeRows: Array<{ id: string; text: string }>;
  setOutcomeRows: Dispatch<SetStateAction<Array<{ id: string; text: string }>>>;
  faqVisible: boolean;
  setFaqVisible: (value: boolean) => void;
  faqRows: ProgramEditorFaqRow[];
  setFaqRows: Dispatch<SetStateAction<ProgramEditorFaqRow[]>>;
  contentSectionsVisible: boolean;
  setContentSectionsVisible: (value: boolean) => void;
  contentSectionRows: ProgramEditorContentSectionRow[];
  setContentSectionRows: Dispatch<SetStateAction<ProgramEditorContentSectionRow[]>>;
  mediaVisible: boolean;
  setMediaVisible: (value: boolean) => void;
  mediaRows: ProgramEditorMediaRow[];
  setMediaRows: Dispatch<SetStateAction<ProgramEditorMediaRow[]>>;
  onMediaFile: (rowId: string, file: File | null) => void;
  addMedia: () => void;
  trackRows: ProgramEditorTrackRow[];
  setTrackRows: Dispatch<SetStateAction<ProgramEditorTrackRow[]>>;
  addTrack: () => void;
  transferRules?: ProgramEditorTransferRule[];
  setTransferRules?: Dispatch<SetStateAction<ProgramEditorTransferRule[]>>;
  trackSelectionMode: TrackSelectionMode;
  setTrackSelectionMode: (value: TrackSelectionMode) => void;
  trackSelectionCount: number;
  setTrackSelectionCount: (value: number) => void;
  allAges: boolean;
  setAllAges: (value: boolean) => void;
  ageStart: string;
  setAgeStart: (value: string) => void;
  ageEnd: string;
  setAgeEnd: (value: string) => void;
  audienceGender: string;
  setAudienceGender: (value: string) => void;
  paymentKind?: ProgramBuilderStatus["paymentKind"];
  durationMonthsForPricing?: string;
  isPaid: boolean;
  setIsPaid: (value: boolean) => void;
  offersMonthlyPayment: boolean;
  setOffersMonthlyPayment: (value: boolean) => void;
  offersAnnualPayment: boolean;
  setOffersAnnualPayment: (value: boolean) => void;
  price: string;
  setPrice: (value: string) => void;
  annualPrice: string;
  setAnnualPrice: (value: string) => void;
  instructorDisplayName: string;
  setInstructorDisplayName: (value: string) => void;
  instructorCredentials: string;
  setInstructorCredentials: (value: string) => void;
  instructorContactPhone: string;
  setInstructorContactPhone: (value: string) => void;
  coverDirectorVisibility?: string;
  setCoverDirectorVisibility?: (value: string) => void;
  contactEmail?: string;
  setContactEmail?: (value: string) => void;
  contactPhoneOmitted?: boolean;
  setContactPhoneOmitted?: (value: boolean) => void;
  contactEmailOmitted?: boolean;
  setContactEmailOmitted?: (value: boolean) => void;
  coverPriceLabelEnabled?: boolean;
  setCoverPriceLabelEnabled?: (value: boolean) => void;
  coverPriceLabel?: string;
  setCoverPriceLabel?: (value: string) => void;
  builderStatus?: ProgramBuilderStatus;
  setBuilderStatus?: Dispatch<SetStateAction<ProgramBuilderStatus>>;
  isEditMode?: boolean;
};

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

function RemoveSectionButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-xs font-semibold text-[#C83F31] hover:underline">
      Remove section
    </button>
  );
}

function EditorFieldSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E1E8EC] bg-white p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RowIconButton({ tone = "neutral", ...props }: React.ComponentPropsWithoutRef<"button"> & { tone?: "neutral" | "danger" | "accent" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        tone === "danger" ? "text-[#C83F31] hover:bg-[#FDEDEA]" : tone === "accent" ? "text-[#2F8FB3] hover:bg-[#E9F4F8]" : "text-[#6B747B] hover:bg-[#F1F4F5]",
        props.className,
      )}
    />
  );
}

function ProgramFaqEditor({
  faqRows,
  onChange,
  onRemoveSection,
}: {
  faqRows: ProgramEditorFaqRow[];
  onChange: Dispatch<SetStateAction<ProgramEditorFaqRow[]>>;
  onRemoveSection?: () => void;
}) {
  return (
    <EditorFieldSection title="FAQs" action={onRemoveSection ? <RemoveSectionButton onClick={onRemoveSection} /> : undefined}>
      <div className="divide-y divide-[#E6ECEF]">
        {faqRows.map((row, index) => (
          <div key={row.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Question {index + 1}</p>
              <RowIconButton tone="danger" onClick={() => onChange((current) => current.filter((item) => item.id !== row.id))} aria-label="Remove FAQ">
                <TrashIcon />
              </RowIconButton>
            </div>
            <input
              value={row.question}
              onChange={(event) => onChange((current) => current.map((item) => item.id === row.id ? { ...item, question: event.target.value } : item))}
              className="h-11 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm outline-none focus:border-[#2F8FB3]"
              placeholder="Question"
            />
            <textarea
              value={row.answer}
              onChange={(event) => onChange((current) => current.map((item) => item.id === row.id ? { ...item, answer: event.target.value } : item))}
              className="min-h-24 w-full resize-y rounded-[8px] border border-[#B9C3C8] px-3 py-2 text-sm leading-6 outline-none focus:border-[#2F8FB3]"
              placeholder="Answer"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange((current) => [...current, { id: crypto.randomUUID(), question: "New question", answer: "Add the answer families should see." }])}
          className="mt-3 min-h-10 rounded-[8px] border border-[#D6DCE0] px-4 text-sm font-semibold text-[#26323A]"
        >
          Add FAQ
        </button>
      </div>
    </EditorFieldSection>
  );
}

function TrackTransferRuleBuilder({
  trackRows,
  transferRules,
  setTransferRules,
}: {
  trackRows: ProgramEditorTrackRow[];
  transferRules: ProgramEditorTransferRule[];
  setTransferRules: Dispatch<SetStateAction<ProgramEditorTransferRule[]>>;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  function addRule() {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    if (transferRules.some((rule) => rule.fromTrackId === fromId && rule.toTrackId === toId)) {
      return;
    }
    setTransferRules((current) => [...current, { id: crypto.randomUUID(), fromTrackId: fromId, toTrackId: toId }]);
    setFromId("");
    setToId("");
  }

  function trackName(id: string) {
    return trackRows.find((track) => track.id === id)?.name || "Untitled track";
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Allowed switches</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={fromId} onChange={(event) => setFromId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border border-[#B9C3C8] bg-white px-2 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]">
          <option value="">From...</option>
          {trackRows.map((track) => (
            <option key={track.id} value={track.id}>{track.name || "Untitled track"}</option>
          ))}
        </select>
        <span className="shrink-0 text-[#6B747B]" aria-hidden>→</span>
        <select value={toId} onChange={(event) => setToId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border border-[#B9C3C8] bg-white px-2 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]">
          <option value="">To...</option>
          {trackRows.filter((track) => track.id !== fromId).map((track) => (
            <option key={track.id} value={track.id}>{track.name || "Untitled track"}</option>
          ))}
        </select>
        <button type="button" onClick={addRule} disabled={!fromId || !toId} className="h-10 shrink-0 rounded-[8px] bg-[#17624F] px-3 text-sm font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </div>
      {transferRules.length ? (
        <div className="divide-y divide-[#EEF2F4] rounded-[8px] border border-[#E1E8EC] bg-white">
          {transferRules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-[#26323A]">{trackName(rule.fromTrackId)} → {trackName(rule.toTrackId)}</span>
              <button
                type="button"
                onClick={() => setTransferRules((current) => current.filter((item) => item.id !== rule.id))}
                className="shrink-0 text-xs font-semibold text-[#C83F31] hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#7B858C]">No switches allowed yet. Add pairs above.</p>
      )}
    </div>
  );
}

function ProgramEditorFields({
  masjidLabel = "Masjid",
  activeStep,
  programType = "recurring",
  schedulePattern = "weekly",
  previewProgram,
  eventDate = "",
  setEventDate,
  eventTimeVisible = false,
  setEventTimeVisible,
  learningVisible,
  setLearningVisible,
  learningTitle,
  setLearningTitle,
  learningIntro,
  setLearningIntro,
  learningDescriptionVisible = true,
  setLearningDescriptionVisible,
  topicsIntro = "",
  setTopicsIntro,
  requirementsText = "",
  setRequirementsText,
  policiesText = "",
  setPoliciesText,
  outcomeRows,
  setOutcomeRows,
  faqVisible,
  setFaqVisible,
  faqRows,
  setFaqRows,
  contentSectionsVisible,
  setContentSectionsVisible,
  contentSectionRows,
  setContentSectionRows,
  mediaVisible,
  setMediaVisible,
  mediaRows,
  setMediaRows,
  onMediaFile,
  addMedia,
  trackRows,
  setTrackRows,
  addTrack,
  transferRules = [],
  setTransferRules,
  trackSelectionMode,
  setTrackSelectionMode,
  trackSelectionCount,
  setTrackSelectionCount,
  allAges,
  setAllAges,
  ageStart,
  setAgeStart,
  ageEnd,
  setAgeEnd,
  audienceGender,
  setAudienceGender,
  paymentKind = "free",
  durationMonthsForPricing = "10",
  isPaid,
  setIsPaid: _setIsPaid,
  offersMonthlyPayment,
  setOffersMonthlyPayment,
  offersAnnualPayment,
  setOffersAnnualPayment,
  price,
  setPrice,
  annualPrice,
  setAnnualPrice,
  instructorDisplayName,
  setInstructorDisplayName,
  instructorCredentials,
  setInstructorCredentials,
  instructorContactPhone,
  setInstructorContactPhone,
  coverDirectorVisibility = "name_and_photo",
  setCoverDirectorVisibility,
  contactEmail = "",
  setContactEmail,
  contactPhoneOmitted = false,
  setContactPhoneOmitted,
  contactEmailOmitted = false,
  setContactEmailOmitted,
  coverPriceLabelEnabled = true,
  setCoverPriceLabelEnabled,
  coverPriceLabel = "",
  setCoverPriceLabel,
  builderStatus,
  setBuilderStatus,
  isEditMode = false,
}: ProgramEditorFieldsProps) {
  const showAll = !activeStep;
  const showBasics = showAll || activeStep === "basics";
  const showPublic = showAll || activeStep === "public";
  const showSchedule = showAll || activeStep === "schedule";
  const showPricing = showAll || activeStep === "pricing";
  const showReview = activeStep === "review";
  const canUsePerTrackPricing = paymentKind === "tareeqah" && programType === "recurring" && schedulePattern === "weekly" && trackRows.length > 0;
  const perTrackPricingEnabled = canUsePerTrackPricing && trackRows.some((track) => track.pricingOverrideEnabled);
  const weeklySessionLibrary = useMemo(() => uniqueScheduleRows(trackRows.flatMap((track) => track.sessions)), [trackRows]);
  const isOngoingDuration = builderStatus?.durationType === "ongoing";

  function setPerTrackPricingEnabled(enabled: boolean) {
    setTrackRows((current) =>
      current.map((track) => ({
        ...track,
        pricingOverrideEnabled: enabled,
      })),
    );
  }

  function addSharedWeeklySession() {
    const nextSession: ProgramScheduleRow = { day: "Monday", start: "18:00", end: "20:00" };
    setTrackRows((current) => current.map((track) => ({ ...track, sessions: uniqueScheduleRows([...track.sessions, nextSession]) })));
  }

  function updateSharedWeeklySession(previous: ProgramScheduleRow, next: ProgramScheduleRow) {
    const previousKey = scheduleRowKey(previous);
    setTrackRows((current) =>
      current.map((track) => ({
        ...track,
        sessions: uniqueScheduleRows(track.sessions.map((session) => scheduleRowKey(session) === previousKey ? next : session)),
      })),
    );
  }

  function removeSharedWeeklySession(session: ProgramScheduleRow) {
    const key = scheduleRowKey(session);
    setTrackRows((current) =>
      current.map((track) => {
        const remaining = track.sessions.filter((row) => scheduleRowKey(row) !== key);
        return { ...track, sessions: remaining.length ? remaining : track.sessions };
      }),
    );
  }

  function toggleTrackWeeklySession(trackId: string, session: ProgramScheduleRow, selected: boolean) {
    const key = scheduleRowKey(session);
    setTrackRows((current) =>
      current.map((track) => {
        if (track.id !== trackId) {
          return track;
        }
        const hasSession = track.sessions.some((row) => scheduleRowKey(row) === key);
        if (selected && !hasSession) {
          return { ...track, sessions: uniqueScheduleRows([...track.sessions, session]) };
        }
        if (!selected && hasSession && track.sessions.length > 1) {
          return { ...track, sessions: track.sessions.filter((row) => scheduleRowKey(row) !== key) };
        }
        return track;
      }),
    );
  }

  function addLearningSection() {
    setLearningVisible(true);
    setLearningTitle("What You Will Learn");
    setLearningIntro("");
    setLearningDescriptionVisible?.(false);
    setOutcomeRows([
      { id: crypto.randomUUID(), text: "Learning outcome #1" },
      { id: crypto.randomUUID(), text: "Learning outcome #2" },
      { id: crypto.randomUUID(), text: "Learning outcome #3" },
    ]);
  }

  const [topicsVisible, setTopicsVisible] = useState(false);
  const [requirementsVisible, setRequirementsVisible] = useState(false);
  const [policiesVisible, setPoliciesVisible] = useState(false);
  const [credentialsVisible, setCredentialsVisible] = useState(false);
  const showTopicsField = topicsVisible || Boolean(topicsIntro.trim());
  const showRequirementsField = requirementsVisible || Boolean(requirementsText.trim());
  const showPoliciesField = policiesVisible || Boolean(policiesText.trim());
  const showCredentialsField = credentialsVisible || Boolean(instructorCredentials.trim());

  function removeLearningSection() {
    setLearningVisible(false);
    setOutcomeRows([]);
    setLearningTitle("");
    setLearningIntro("");
    setLearningDescriptionVisible?.(false);
  }

  function removeTopicsSection() {
    setTopicsVisible(false);
    setTopicsIntro?.("");
  }

  function removeRequirementsSection() {
    setRequirementsVisible(false);
    setRequirementsText?.("");
  }

  function removePoliciesSection() {
    setPoliciesVisible(false);
    setPoliciesText?.("");
  }

  function removeFaqSection() {
    setFaqVisible(false);
    setFaqRows([]);
  }

  function removeContentSection() {
    setContentSectionsVisible(false);
    setContentSectionRows([]);
  }

  function removeMediaSection() {
    setMediaVisible(false);
    setMediaRows([]);
  }

  if (showReview) {
    const program = previewProgram;
    const previewTracks = trackRows.map((track, index): ProgramTrack => ({
      id: track.id,
      program_id: program?.id ?? "preview",
      name: track.name.trim() || `Track ${index + 1}`,
      description: null,
      schedule: track.sessions as unknown as Json,
      ...defaultProgramTrackBuilderColumns(),
      location: track.location?.trim() || null,
      room: track.room?.trim() || null,
      capacity: track.capacity ? Number(track.capacity) : null,
      pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
      price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
      price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
      ...trackEligibilityOverrideColumns(track),
      sort_order: index + 1,
      is_active: true,
      created_at: "",
      updated_at: "",
    }));
    const visibleMediaRows = mediaRows.filter((row) => row.previewUrl || row.url);
    const statusFields: ProgramStatusFields | null = builderStatus
      ? {
          publicationStatus: builderStatus.publicationStatus,
          applicationStatus: builderStatus.applicationStatus,
          lifecycleStatus: deriveLifecycleStatus({
            lifecycleStatus: builderStatus.lifecycleStatus,
            startNow: builderStatus.startNow,
            startDate: builderStatus.startDate || null,
            endDate: builderStatus.endDate || null,
            isOngoing: builderStatus.durationType === "ongoing",
          }),
          applicationOpenAt: builderStatus.applicationOpenAt || null,
          applicationCloseAt: builderStatus.applicationCloseAt || null,
          startDate: builderStatus.startDate || null,
          endDate: builderStatus.endDate || null,
          isOngoing: builderStatus.durationType === "ongoing",
          billingEndBehavior: builderStatus.billingEndBehavior,
        }
      : null;
    return (
      <div className="space-y-5">
        {statusFields && builderStatus && setBuilderStatus ? (
          <section className="divide-y divide-[#E1E8EC] rounded-2xl border border-[#E1E8EC] bg-white p-4 md:p-6">
            <div className="pb-5 first:pt-0">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Where should this program appear?</h2>
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-3 rounded-[10px] border border-[#E1E8EC] p-3 text-sm font-semibold text-[#26323A]">
                  <input
                    type="radio"
                    name="program-visibility"
                    className="mt-1"
                    checked={builderStatus.publicationStatus !== "hidden"}
                    onChange={() => setBuilderStatus((current) => ({ ...current, publicationStatus: current.publicationStatus === "draft" ? "draft" : "published" }))}
                  />
                  <span>
                    Show on {masjidLabel} Program page
                    <span className="mt-1 block text-xs font-medium leading-5 text-[#6B747B]">Appears on the public masjid classes page.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-[10px] border border-[#E1E8EC] p-3 text-sm font-semibold text-[#26323A]">
                  <input
                    type="radio"
                    name="program-visibility"
                    className="mt-1"
                    checked={builderStatus.publicationStatus === "hidden"}
                    onChange={() => setBuilderStatus((current) => ({ ...current, publicationStatus: "hidden" }))}
                  />
                  <span>
                    Hide from list, private entry only
                    <span className="mt-1 block text-xs font-medium leading-5 text-[#6B747B]">Reachable by a direct or private link only.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className={cn("py-5", !isEditMode && "last:pb-0")}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Status summary</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {getProgramStatusBadges(statusFields).map((badge) => (
                  <span key={badge.label} className={cn("rounded-full px-3 py-1 text-xs font-semibold", programStatusBadgeToneClass(badge.tone))}>
                    {badge.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-[#52616A]">{getApplicationButtonState(statusFields).label}</p>
            </div>

            {isEditMode ? (
              <div className="pt-5 last:pb-0">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Program status</span>
                  <select
                    value={statusFields.lifecycleStatus}
                    onChange={(event) => setBuilderStatus((current) => ({ ...current, lifecycleStatus: event.target.value as ProgramLifecycleStatus }))}
                    className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="archived">Archived</option>
                  </select>
                  <span className="mt-1 block text-xs leading-5 text-[#6B747B]">
                    Upcoming, Active, and Completed are set automatically from the start and end dates. Choose Paused, Cancelled, or Archived to override manually.
                  </span>
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

      <div className="mx-auto max-w-[520px] space-y-5">
        {program ? (
          <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
            <ProgramHero program={program} />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#17624F]">
                <span>{formatAgeRange(program.age_range_text)}</span>
                <span aria-hidden>•</span>
                <span>{formatGender(program.audience_gender)}</span>
              </div>
              <div>
                <h1 className="text-2xl font-semibold leading-8 text-[#26323A]">{program.title}</h1>
                {program.description?.trim() ? <p className="mt-2 text-sm leading-7 text-[#52616A]">{program.description.trim()}</p> : null}
              </div>
            </div>
          </section>
        ) : null}

        <aside className="rounded-2xl border border-[#C8DCE2] bg-white p-4 shadow-[0_14px_34px_rgba(38,50,58,0.10)]">
          <ProgramScheduleOptionsDisplay tracks={previewTracks} program={program} fallbackSchedule={previewTracks[0] ? scheduleSummary(previewTracks[0].schedule, null).full : "Schedule TBA"} />
          {program ? <ProgramPaymentOptionsDisplay program={program} tracks={previewTracks} /> : null}
          <button type="button" disabled className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold text-white opacity-70 md:w-auto md:px-10">
            Request Enrollment
          </button>
        </aside>

        {(learningIntro.trim() || outcomeRows.length) && learningTitle.trim() ? (
          <DetailSection title={learningTitle.trim()}>
            {learningIntro.trim() ? <p className="text-sm leading-7 text-[#52616A]">{learningIntro}</p> : null}
            {outcomeRows.length ? (
              <div className={cn("grid gap-3 sm:grid-cols-2", learningIntro.trim() ? "mt-5" : "")}>
                {outcomeRows.map((row) => (
                  <div key={row.id} className="flex gap-3 text-sm text-[#26323A]">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E3F5EE] text-xs font-semibold text-[#228763]">✓</span>
                    <span>{row.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </DetailSection>
        ) : null}

        {contentSectionRows.some((row) => row.title.trim()) ? (
          <DetailSection title="Class Content">
            <div className="divide-y divide-[#E6ECEF]">
              {contentSectionRows.filter((row) => row.title.trim()).map((row, index) => (
                <div key={row.id} className="flex min-h-14 items-center gap-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0F8FB] text-xs font-medium text-[#2F8FB3]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#26323A]">{row.title}</p>
                    {row.description.trim() ? <p className="text-xs text-[#6B747B]">{row.description}</p> : null}
                  </div>
                  {row.durationText.trim() ? <span className="rounded-full bg-[#EAF7F1] px-2 py-1 text-xs text-[#228763]">{row.durationText}</span> : null}
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}

        {[{ title: "Topics Covered", body: topicsIntro }, { title: "Requirements", body: requirementsText }, { title: "Policies", body: policiesText }].some((row) => row.body.trim()) ? (
          <DetailSection title="Class Details">
            <div className="divide-y divide-[#E6ECEF]">
              {[{ title: "Topics Covered", body: topicsIntro }, { title: "Requirements", body: requirementsText }, { title: "Policies", body: policiesText }]
                .filter((row) => row.body.trim())
                .map((row) => (
                  <div key={row.title} className="py-3 first:pt-0 last:pb-0">
                    <h3 className="text-sm font-semibold text-[#26323A]">{row.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-[#52616A]">{row.body}</p>
                  </div>
                ))}
            </div>
          </DetailSection>
        ) : null}

        {visibleMediaRows.length ? (
          <DetailSection title="Class Media">
            <div className="space-y-3">
              {visibleMediaRows.map((row) => (
                <div key={row.id} className="overflow-hidden rounded-[16px] border border-[#E6ECEF]">
                  <div className="relative h-40 bg-[#E7EEF2]">
                    <Image src={row.previewUrl || row.url} alt="" fill className="object-cover" sizes="360px" />
                  </div>
                  {row.title.trim() ? <p className="p-3 text-sm font-semibold text-[#26323A]">{row.title}</p> : null}
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}

        {faqRows.length ? (
          <ProgramFaqSection
            faqs={faqRows.map((row, index) => ({
              id: row.id || `preview-faq-${index}`,
              question: row.question.trim() || `Question ${index + 1}`,
              answer: row.answer.trim() || "Add an answer for this FAQ.",
            }))}
          />
        ) : null}
      </div>
      </div>
    );
  }

  void _setIsPaid;

  return (
    <div className="space-y-4">
        {showPublic ? (learningVisible ? (
          <EditorFieldSection title="Learning Outcomes" action={<RemoveSectionButton onClick={removeLearningSection} />}>
            <div className="space-y-4">
              <EditBox label="Section title" required value={learningTitle} onChange={setLearningTitle} />
              {learningDescriptionVisible || learningIntro.trim() ? (
                <EditBox label="Section description" value={learningIntro} onChange={setLearningIntro} multiline />
              ) : (
                <button type="button" onClick={() => setLearningDescriptionVisible?.(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                  Add section description
                </button>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#26323A]">Outcome points</p>
                  <RowIconButton tone="accent" className="border border-[#A8D4E2] text-lg" onClick={() => setOutcomeRows((current) => [...current, { id: crypto.randomUUID(), text: `Learning outcome #${current.length + 1}` }])} aria-label="Add outcome point">
                    +
                  </RowIconButton>
                </div>
                {outcomeRows.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-[28px_minmax(0,1fr)_32px] items-start gap-2 border-t border-[#E6ECEF] py-2 first:border-t-0 first:pt-0">
                    <span className="mt-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#26323A] text-[10px] font-semibold text-white">{String(index + 1).padStart(2, "0")}</span>
                    <textarea
                      value={row.text}
                      onChange={(event) => setOutcomeRows((current) => current.map((item) => item.id === row.id ? { ...item, text: event.target.value } : item))}
                      className="min-h-14 min-w-0 resize-y rounded-[8px] border border-[#D6E1E6] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#2F8FB3]"
                      aria-label={`Checklist point ${index + 1}`}
                    />
                    <RowIconButton tone="danger" className="mt-1" onClick={() => setOutcomeRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Delete checklist point">
                      <TrashIcon />
                    </RowIconButton>
                  </div>
                ))}
              </div>
            </div>
          </EditorFieldSection>
        ) : (
          <button type="button" onClick={addLearningSection} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
            Add checklist section
          </button>
        )) : null}

        {showPublic && setTopicsIntro ? (
          showTopicsField ? (
            <EditorFieldSection title="Topics Covered" action={<RemoveSectionButton onClick={removeTopicsSection} />}>
              <EditBox label="Topics covered" value={topicsIntro} onChange={setTopicsIntro} multiline />
            </EditorFieldSection>
          ) : (
            <button type="button" onClick={() => setTopicsVisible(true)} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
              Add Topics Covered section
            </button>
          )
        ) : null}

        {showPublic ? (contentSectionsVisible ? (
          <EditorFieldSection
            title="Class Schedule"
            action={
              <div className="flex items-center gap-3">
                <RemoveSectionButton onClick={removeContentSection} />
                <RowIconButton
                  tone="accent"
                  className="border border-[#A8D4E2] text-lg"
                  onClick={() => setContentSectionRows((current) => [...current, { id: crypto.randomUUID(), title: "", description: "", durationText: "" }])}
                  aria-label="Add content item"
                >
                  +
                </RowIconButton>
              </div>
            }
          >
            <div className="divide-y divide-[#E6ECEF]">
              {contentSectionRows.map((row, index) => (
                <div key={row.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Item {index + 1}</p>
                    <RowIconButton
                      tone="danger"
                      onClick={() => {
                        const next = contentSectionRows.filter((item) => item.id !== row.id);
                        setContentSectionRows(next);
                        if (next.length === 0) {
                          setContentSectionsVisible(false);
                        }
                      }}
                      aria-label="Remove content item"
                    >
                      <TrashIcon />
                    </RowIconButton>
                  </div>
                  <input
                    value={row.title}
                    onChange={(event) => setContentSectionRows((current) => current.map((item) => item.id === row.id ? { ...item, title: event.target.value } : item))}
                    placeholder="Title"
                    className="h-11 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm font-semibold outline-none focus:border-[#2F8FB3]"
                  />
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <input
                      value={row.description}
                      onChange={(event) => setContentSectionRows((current) => current.map((item) => item.id === row.id ? { ...item, description: event.target.value } : item))}
                      placeholder="Description (optional)"
                      className="h-10 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm outline-none focus:border-[#2F8FB3]"
                    />
                    <input
                      value={row.durationText}
                      onChange={(event) => setContentSectionRows((current) => current.map((item) => item.id === row.id ? { ...item, durationText: event.target.value } : item))}
                      placeholder="Duration (optional)"
                      className="h-10 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm outline-none focus:border-[#2F8FB3]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </EditorFieldSection>
        ) : (
          <button
            type="button"
            onClick={() => {
              setContentSectionsVisible(true);
              setContentSectionRows([{ id: crypto.randomUUID(), title: "", description: "", durationText: "" }]);
            }}
            className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]"
          >
            Add class content section
          </button>
        )) : null}

        {showPublic && setRequirementsText ? (
          showRequirementsField ? (
            <EditorFieldSection title="Prerequisites" action={<RemoveSectionButton onClick={removeRequirementsSection} />}>
              <EditBox label="Prerequisites" value={requirementsText} onChange={setRequirementsText} multiline />
            </EditorFieldSection>
          ) : (
            <button type="button" onClick={() => setRequirementsVisible(true)} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
              Add Prerequisites section
            </button>
          )
        ) : null}

        {showPublic && setPoliciesText ? (
          showPoliciesField ? (
            <EditorFieldSection title="Policies" action={<RemoveSectionButton onClick={removePoliciesSection} />}>
              <EditBox label="Policies" value={policiesText} onChange={setPoliciesText} multiline />
            </EditorFieldSection>
          ) : (
            <button type="button" onClick={() => setPoliciesVisible(true)} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
              Add Policies section
            </button>
          )
        ) : null}

        {showPublic ? (faqVisible ? (
          <ProgramFaqEditor faqRows={faqRows} onChange={setFaqRows} onRemoveSection={removeFaqSection} />
        ) : (
          <button
            type="button"
            onClick={() => {
              setFaqVisible(true);
              setFaqRows([{ id: crypto.randomUUID(), question: "", answer: "" }]);
            }}
            className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]"
          >
            Add FAQ section
          </button>
        )) : null}

        {showPublic ? (mediaVisible ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-base font-semibold text-[#26323A]">Class Media</h2>
              <RemoveSectionButton onClick={removeMediaSection} />
            </div>
            <div className="rounded-[14px] border border-[#D6DCE0] bg-white p-3">
            <div className="divide-y divide-[#E6ECEF]">
              {mediaRows.map((row) => {
                const previewUrl = row.previewUrl || row.url;
                return (
                  <div key={row.id} className="grid gap-2 py-3 first:pt-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                      {previewUrl ? (
                        <div className="relative h-28 overflow-hidden rounded-[8px] bg-[#E7EEF2]">
                          {row.mediaType === "video" ? <video src={previewUrl} className="h-full w-full object-cover" controls preload="metadata" /> : <Image src={previewUrl} alt="" fill className="object-cover" sizes="280px" />}
                        </div>
                      ) : <div className="flex h-28 items-center justify-center rounded-[8px] bg-[#F2F6F7] text-[#7B858C]"><PhotoIcon /></div>}
                      <div className="flex flex-col gap-2">
                        <label className="flex h-10 cursor-pointer items-center justify-center rounded-[8px] border border-[#D6DCE0] text-[#52616A]" aria-label="Replace media"><PhotoIcon /><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => onMediaFile(row.id, event.target.files?.[0] ?? null)} /></label>
                        <RowIconButton onClick={() => setMediaRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Remove media item"><TrashIcon /></RowIconButton>
                      </div>
                    </div>
                    <input value={row.title} onChange={(event) => setMediaRows((current) => current.map((item) => item.id === row.id ? { ...item, title: event.target.value } : item))} placeholder="Optional title" className="h-10 rounded-[8px] border border-[#B9C3C8] px-3 text-sm" />
                  </div>
                );
              })}
              <button type="button" onClick={addMedia} className="min-h-10 rounded-[8px] border border-[#D6DCE0] px-4 text-sm font-semibold text-[#26323A]">
                Add media
              </button>
            </div>
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMediaVisible(true);
              addMedia();
            }}
            className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]"
          >
            Add media section
          </button>
        )) : null}

        {showSchedule && programType === "event" && eventTimeVisible ? (
          <EditorFieldSection title="Event Time">
            <div className="flex flex-wrap items-end gap-2">
              <span className="text-sm font-semibold text-[#52616A]">One-time event</span>
              <select
                value={trackRows[0]?.sessions[0]?.start ?? "18:00"}
                onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: [{ ...(track.sessions[0] ?? { day: "Monday", end: "20:00" }), start: event.target.value }] } : track))}
                className="h-10 min-w-[104px] flex-1 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
              >
                {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
              </select>
              <span className="text-xs font-semibold text-[#6B747B]">to</span>
              <select
                value={trackRows[0]?.sessions[0]?.end ?? "20:00"}
                onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: [{ ...(track.sessions[0] ?? { day: "Monday", start: "18:00" }), end: event.target.value }] } : track))}
                className="h-10 min-w-[104px] flex-1 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
              >
                {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
              </select>
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && programType === "recurring" && schedulePattern === "custom_dates" ? (
          <EditorFieldSection title="Sessions">
            <div className="divide-y divide-[#E6ECEF]">
              {(trackRows[0]?.sessions ?? []).map((session, sessionIndex) => (
                <div key={`session-${sessionIndex}`} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_minmax(0,1fr)_32px] items-center gap-2 py-2 first:pt-0">
                  <input
                    type="date"
                    value={session.date ?? ""}
                    onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.map((row, index) => index === sessionIndex ? { ...row, date: event.target.value } : row) } : track))}
                    className="h-10 min-w-0 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
                  />
                  <select
                    value={session.start}
                    onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.map((row, index) => index === sessionIndex ? { ...row, start: event.target.value } : row) } : track))}
                    className="h-10 min-w-0 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
                  >
                    {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                  </select>
                  <span className="text-xs font-semibold text-[#6B747B]">to</span>
                  <select
                    value={session.end}
                    onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.map((row, index) => index === sessionIndex ? { ...row, end: event.target.value } : row) } : track))}
                    className="h-10 min-w-0 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
                  >
                    {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                  </select>
                  {trackRows[0]?.sessions.length > 1 ? (
                    <RowIconButton tone="danger" onClick={() => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.filter((_row, index) => index !== sessionIndex) } : track))} aria-label="Remove session">
                      <TrashIcon />
                    </RowIconButton>
                  ) : <span aria-hidden />}
                </div>
              ))}
              <button type="button" onClick={() => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: [...track.sessions, { day: "Monday", date: "", start: "18:00", end: "20:00" }] } : track))} className="mt-3 min-h-9 rounded-[8px] border border-[#D6DCE0] px-3 text-sm font-semibold text-[#26323A]">
                Add session
              </button>
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && programType === "recurring" && schedulePattern === "weekly" ? (
          <EditorFieldSection
            title="Weekly Sessions"
            action={
              <RowIconButton tone="accent" className="border border-[#A8D4E2] text-lg" onClick={addSharedWeeklySession} aria-label="Add weekly session">
                +
              </RowIconButton>
            }
          >
            <p className="-mt-1 mb-3 text-xs leading-5 text-[#6B747B]">Add all meeting times, then build tracks from them </p>
            <div className="overflow-hidden rounded-xl border border-[#E1E8EC] bg-[#FAFCFC]">
              <div className="grid grid-cols-[28px_1fr_auto] gap-2 border-b border-[#E1E8EC] bg-[#F3F7F8] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#7B858C]">
                <span />
                <span>Day &amp; Time</span>
                <span />
              </div>
              <div className="divide-y divide-[#E6ECEF]">
                {weeklySessionLibrary.map((session, sessionIndex) => (
                  <div key={scheduleRowKey(session)} className="space-y-2 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#17624F] text-[10px] font-bold tabular-nums text-white">
                        {String(sessionIndex + 1).padStart(2, "0")}
                      </span>
                      <select
                        value={session.day}
                        onChange={(event) => updateSharedWeeklySession(session, { ...session, day: event.target.value as (typeof scheduleDayOptions)[number] })}
                        className="h-10 flex-1 rounded-lg border border-[#CBE3EA] bg-white px-2 text-xs font-bold uppercase tracking-wide text-[#17624F] outline-none focus:border-[#2F8FB3] sm:max-w-[160px]"
                      >
                        {scheduleDayOptions.map((day) => <option key={day} value={day}>{day}</option>)}
                      </select>
                      {weeklySessionLibrary.length > 1 ? (
                        <RowIconButton tone="danger" onClick={() => removeSharedWeeklySession(session)} aria-label="Remove weekly session">
                          <TrashIcon />
                        </RowIconButton>
                      ) : <span className="h-8 w-8 shrink-0" aria-hidden />}
                    </div>
                    <div className="flex items-center gap-2 pl-9">
                      <select
                        value={session.start}
                        onChange={(event) => updateSharedWeeklySession(session, { ...session, start: event.target.value })}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#B9C3C8] bg-white px-2 text-sm font-semibold tabular-nums outline-none focus:border-[#2F8FB3]"
                      >
                        {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                      </select>
                      <span className="shrink-0 text-xs font-semibold text-[#6B747B]">to</span>
                      <select
                        value={session.end}
                        onChange={(event) => updateSharedWeeklySession(session, { ...session, end: event.target.value })}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#B9C3C8] bg-white px-2 text-sm font-semibold tabular-nums outline-none focus:border-[#2F8FB3]"
                      >
                        {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && programType === "recurring" && schedulePattern === "weekly" ? (
          <EditorFieldSection
            title="Tracks"
            action={
              <RowIconButton tone="accent" className="border border-[#A8D4E2] text-lg" onClick={addTrack} aria-label="Add track">
                +
              </RowIconButton>
            }
          >
            <div className="space-y-3">
              {trackRows.map((track, trackIndex) => (
                <div key={track.id} className="rounded-xl border border-[#DCE7EB] bg-[#FAFCFC] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#26323A] text-[10px] font-bold tabular-nums text-white">
                      {String(trackIndex + 1).padStart(2, "0")}
                    </span>
                    {trackRows.length > 1 ? (
                      <RowIconButton tone="danger" onClick={() => setTrackRows((current) => current.filter((item) => item.id !== track.id))} aria-label="Remove track">
                        <TrashIcon />
                      </RowIconButton>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <EditBox label="Track name" required value={track.name} onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, name: value } : item))} />
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Capacity</span>
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 items-center overflow-hidden rounded-lg border border-[#B9C3C8] bg-white">
                          <button
                            type="button"
                            onClick={() => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: String(Math.max(0, (Number(item.capacity) || 0) - 1)) } : item))}
                            className="flex h-full w-9 shrink-0 items-center justify-center text-base font-semibold text-[#26323A] hover:bg-[#F1F4F5]"
                            aria-label="Decrease capacity"
                          >
                            −
                          </button>
                          <input
                            value={track.capacity ?? ""}
                            onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: event.target.value.replace(/\D/g, "") } : item))}
                            className="h-full w-14 shrink-0 border-x border-[#EEF1F2] bg-transparent text-center text-sm font-semibold tabular-nums text-[#26323A] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: String((Number(item.capacity) || 0) + 1) } : item))}
                            className="flex h-full w-9 shrink-0 items-center justify-center text-base font-semibold text-[#26323A] hover:bg-[#F1F4F5]"
                            aria-label="Increase capacity"
                          >
                            +
                          </button>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-[#52616A]">students</span>
                      </div>
                    </label>
                  </div>
                  <div className="mt-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Sessions in this track</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weeklySessionLibrary.map((session, sessionIndex) => {
                        const checked = track.sessions.some((row) => scheduleRowKey(row) === scheduleRowKey(session));
                        return (
                          <button
                            key={`${track.id}-${scheduleRowKey(session)}`}
                            type="button"
                            onClick={() => toggleTrackWeeklySession(track.id, session, !checked)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors",
                              checked ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#D6E1E6] bg-white text-[#52616A] hover:border-[#9EB4BD]",
                            )}
                          >
                            {String(sessionIndex + 1).padStart(2, "0")} · {formatDayAbbreviation(session.day)} {formatScheduleRange(session.start, session.end)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3 border-t border-[#E6ECEF] pt-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                      <input
                        type="checkbox"
                        checked={Boolean(track.eligibilityOverrideEnabled)}
                        onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, eligibilityOverrideEnabled: event.target.checked } : item))}
                      />
                      Override eligibility for this track
                    </label>
                    {track.eligibilityOverrideEnabled ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <EditBox label="From age" value={track.ageMin ?? ""} onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, ageMin: value } : item))} />
                          <EditBox label="To age" value={track.ageMax ?? ""} onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, ageMax: value } : item))} />
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Gender</span>
                          <select
                            value={track.genderOverride ?? "all"}
                            onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, genderOverride: event.target.value } : item))}
                            className="h-11 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]"
                          >
                            <option value="all">All</option>
                            <option value="brothers">Brothers only</option>
                            <option value="sisters">Sisters only</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Comment (shown on public page, not validated)</span>
                          <textarea
                            value={track.eligibilityComment ?? ""}
                            onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, eligibilityComment: event.target.value } : item))}
                            rows={2}
                            className="w-full resize-none rounded-[10px] border border-[#B9C3C8] px-3 py-2 text-sm leading-6 outline-none focus:border-[#2F8FB3]"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && trackRows.length > 1 && builderStatus && setBuilderStatus && setTransferRules ? (
          <EditorFieldSection title="Track Switching">
            <div className="space-y-3">
              <p className="text-xs leading-5 text-[#7B858C]">Choose whether enrolled students can switch between schedule options after joining, and configure exactly which switches are allowed.</p>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Track switching</span>
                <select
                  value={builderStatus.trackSwitchPolicy}
                  onChange={(event) => setBuilderStatus((current) => ({ ...current, trackSwitchPolicy: event.target.value as ProgramBuilderStatus["trackSwitchPolicy"] }))}
                  className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="disabled">Disabled</option>
                  <option value="request_only">Allowed by request</option>
                  <option value="allowed">Allowed without requesting</option>
                </select>
              </label>
              {builderStatus.trackSwitchPolicy !== "disabled" ? (
                <div className="space-y-3 rounded-[10px] border border-[#E1E8EC] bg-[#FAFCFC] p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                    <input
                      type="checkbox"
                      checked={builderStatus.trackSwitchAllowAll}
                      onChange={(event) => setBuilderStatus((current) => ({ ...current, trackSwitchAllowAll: event.target.checked }))}
                    />
                    Allow switching between any schedule options
                  </label>
                  {!builderStatus.trackSwitchAllowAll ? (
                    <TrackTransferRuleBuilder trackRows={trackRows} transferRules={transferRules} setTransferRules={setTransferRules} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </EditorFieldSection>
        ) : null}

        {showBasics ? <EditorFieldSection title="Target Audience">
          <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
            <input type="checkbox" checked={allAges} onChange={(event) => setAllAges(event.target.checked)} />
            All ages
          </label>
          {!allAges ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <EditBox label="From age" value={ageStart} onChange={setAgeStart} />
              <EditBox label="To age" value={ageEnd} onChange={setAgeEnd} />
            </div>
          ) : null}
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Gender</span>
            <select value={audienceGender} onChange={(event) => setAudienceGender(event.target.value)} className="h-11 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]">
              <option value="all">All</option>
              <option value="brothers">Brothers only</option>
              <option value="sisters">Sisters only</option>
            </select>
          </label>
        </EditorFieldSection> : null}

        {showBasics ? <EditorFieldSection title="Director Information">
          <div className="space-y-3">
            <EditBox label="Display name" value={instructorDisplayName} onChange={setInstructorDisplayName} />
            {showCredentialsField ? (
              <div className="space-y-1.5">
                <EditBox label="Credentials (optional)" value={instructorCredentials} onChange={setInstructorCredentials} />
                <button type="button" onClick={() => { setCredentialsVisible(false); setInstructorCredentials(""); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove credentials
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setCredentialsVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add credentials
              </button>
            )}
            <div>
              <EditBox label="Contact phone" required={!contactPhoneOmitted} disabled={contactPhoneOmitted} value={contactPhoneOmitted ? "" : instructorContactPhone} onChange={setInstructorContactPhone} />
              {setContactPhoneOmitted ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
                  <input type="checkbox" checked={contactPhoneOmitted} onChange={(event) => setContactPhoneOmitted(event.target.checked)} />
                  Do not include phone number
                </label>
              ) : null}
            </div>
            {setContactEmail ? (
              <div>
                <EditBox label="Contact email" required={!contactEmailOmitted} disabled={contactEmailOmitted} value={contactEmailOmitted ? "" : contactEmail} onChange={setContactEmail} />
                {setContactEmailOmitted ? (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
                    <input type="checkbox" checked={contactEmailOmitted} onChange={(event) => setContactEmailOmitted(event.target.checked)} />
                    Do not include email
                  </label>
                ) : null}
              </div>
            ) : null}
            {setCoverDirectorVisibility ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Show on class cover</span>
                <select
                  value={coverDirectorVisibility}
                  onChange={(event) => setCoverDirectorVisibility(event.target.value)}
                  className="h-11 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="name_and_photo">Name and photo</option>
                  <option value="name_only">Name only</option>
                  <option value="none">Neither</option>
                </select>
              </label>
            ) : null}
          </div>
        </EditorFieldSection> : null}

        {showPricing && paymentKind === "tareeqah" ? <EditorFieldSection title="Price">
            {programType === "event" ? (
              <div>
                <EditBox label="One-time price amount" required value={annualPrice} onChange={setAnnualPrice} />
              </div>
            ) : (
            <div className="mt-3 space-y-3">
              {canUsePerTrackPricing ? (
                <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#F3F7F8] p-1">
                  <button
                    type="button"
                    onClick={() => setPerTrackPricingEnabled(false)}
                    className={cn(
                      "min-h-10 rounded-[10px] px-3 text-sm font-semibold transition",
                      !perTrackPricingEnabled ? "bg-white text-[#26323A] shadow-sm" : "text-[#6B747B]",
                    )}
                  >
                    Program price
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerTrackPricingEnabled(true)}
                    className={cn(
                      "min-h-10 rounded-[10px] px-3 text-sm font-semibold transition",
                      perTrackPricingEnabled ? "bg-white text-[#26323A] shadow-sm" : "text-[#6B747B]",
                    )}
                  >
                    Per-track prices
                  </button>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                <input type="checkbox" checked={offersMonthlyPayment} onChange={(event) => setOffersMonthlyPayment(event.target.checked)} />
                Offer monthly payments
              </label>
              {offersMonthlyPayment && !perTrackPricingEnabled ? (
                <div>
                  <EditBox label="Monthly price" required value={price} onChange={setPrice} />
                  {formatMonthlyCycle(price, durationMonthsForPricing) ? <p className="mt-1 text-xs leading-5 text-[#6B747B]">{formatMonthlyCycle(price, durationMonthsForPricing)}</p> : null}
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                <input type="checkbox" checked={offersAnnualPayment} onChange={(event) => setOffersAnnualPayment(event.target.checked)} />
                {isOngoingDuration ? "Offer annual subscription" : "Offer Pay in Full"}
              </label>
              {offersAnnualPayment && !perTrackPricingEnabled ? (
                <div className="space-y-2">
                  <EditBox label={isOngoingDuration ? "Annual price" : "Pay in Full price"} required value={annualPrice} onChange={setAnnualPrice} />
                  {isOngoingDuration ? (
                    <p className="text-xs leading-5 text-[#6B747B]">Bills once a year and renews automatically until the family cancels — same as monthly, just yearly.</p>
                  ) : null}
                  {offersMonthlyPayment && formatAnnualSavings(price, annualPrice, durationMonthsForPricing) ? <p className="inline-flex rounded-full bg-[#E9F4F8] px-3 py-1 text-xs font-semibold text-[#2F6077]">{formatAnnualSavings(price, annualPrice, durationMonthsForPricing)}</p> : null}
                </div>
              ) : null}
              {perTrackPricingEnabled ? (
                <div className="divide-y divide-[#E6ECEF] rounded-[8px] border border-[#E1E8EC]">
                  {trackRows.map((track) => (
                    <div key={track.id} className="p-3">
                      <p className="truncate text-sm font-semibold text-[#26323A]">{track.name || "Untitled track"}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {offersMonthlyPayment ? (
                          <div>
                            <EditBox
                              label="Monthly price"
                              required
                              value={track.priceMonthly ?? ""}
                              onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, priceMonthly: value, pricingOverrideEnabled: true } : item))}
                            />
                            {formatMonthlyCycle(track.priceMonthly ?? "", durationMonthsForPricing) ? <p className="mt-1 text-xs leading-5 text-[#6B747B]">{formatMonthlyCycle(track.priceMonthly ?? "", durationMonthsForPricing)}</p> : null}
                          </div>
                        ) : null}
                        {offersAnnualPayment ? (
                          <div className="space-y-2">
                            <EditBox
                              label={isOngoingDuration ? "Annual price" : "Pay in Full price"}
                              required
                              value={track.priceAnnual ?? ""}
                              onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, priceAnnual: value, pricingOverrideEnabled: true } : item))}
                            />
                            {offersMonthlyPayment && formatAnnualSavings(track.priceMonthly ?? "", track.priceAnnual ?? "", durationMonthsForPricing) ? <p className="inline-flex rounded-full bg-[#E9F4F8] px-3 py-1 text-xs font-semibold text-[#2F6077]">{formatAnnualSavings(track.priceMonthly ?? "", track.priceAnnual ?? "", durationMonthsForPricing)}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            )}
        </EditorFieldSection> : null}

        {showPricing ? <EditorFieldSection title="Cover Price Tag">
          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-[8px] border border-[#E1E8EC] bg-[#FAFCFC] p-3 text-sm font-semibold text-[#26323A]">
              <input
                type="checkbox"
                checked={coverPriceLabelEnabled}
                onChange={(event) => setCoverPriceLabelEnabled?.(event.target.checked)}
                className="mt-1"
              />
              <span>
                Show a price tag on the class cover
                <span className="mt-1 block text-xs font-medium leading-5 text-[#6B747B]">Leave the label blank to use the automatic public price summary.</span>
              </span>
            </label>
            {coverPriceLabelEnabled ? (
              <EditBox label="Price tag label" value={coverPriceLabel} onChange={(value) => setCoverPriceLabel?.(value)} />
            ) : null}
          </div>
        </EditorFieldSection> : null}

    </div>
  );
}

function parseAgeRangeForEdit(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized || normalized === "all" || normalized === "all ages") {
    return { allAges: true, start: "", end: "" };
  }

  const numbers = normalized.match(/\d+/g) ?? [];
  if (normalized.endsWith("+")) return { allAges: false, start: numbers[0] ?? "", end: "" };
  if (normalized.includes("younger")) return { allAges: false, start: "", end: numbers[0] ?? "" };
  return {
    allAges: false,
    start: numbers[0] ?? "",
    end: numbers[1] ?? numbers[0] ?? "",
  };
}

function formatAgeRangeForSave(start: string, end: string) {
  const cleanStart = start.trim() === "0" ? "" : start.trim();
  const cleanEnd = end.trim() === "0" ? "" : end.trim();
  if (cleanStart && cleanEnd) {
    return `${cleanStart}-${cleanEnd}`;
  }
  if (cleanStart) return `${cleanStart}+`;
  if (cleanEnd) return `${cleanEnd} or younger`;
  return null;
}

function normalizeAudienceGender(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("brother") || normalized === "male" || normalized === "boys") {
    return "brothers";
  }
  if (normalized.includes("sister") || normalized === "female" || normalized === "girls") {
    return "sisters";
  }
  return "all";
}

export function AdminTeacherRequestsData({ slug }: { slug: string }) {
  const [requests, setRequests] = useState<Array<MosqueMembership & { profile?: Profile | null; mosque?: Mosque | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One RPC call instead of mosque -> memberships -> profiles, as three sequential stages.
  async function loadRequests() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("get_admin_teacher_requests_snapshot", { p_slug: slug });
    if (error) {
      setError(friendlyErrorMessage(error, "Could not load teachers."));
      setLoading(false);
      return;
    }

    const snapshot = data as unknown as { mosque: Mosque | null; memberships: MosqueMembership[]; profiles: Profile[] } | null;
    if (!snapshot || !snapshot.mosque) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const mosque = snapshot.mosque;
    const membershipRows = snapshot.memberships ?? [];
    const profiles = snapshot.profiles ?? [];
    setRequests(
      membershipRows.map((request) => ({
        ...request,
        mosque,
        profile: profiles.find((profile) => profile.id === request.profile_id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function setTeacherCreationPermission(requestId: string, canCreatePrograms: boolean) {
    setBusyId(requestId);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: reviewError } = await supabase
      .from("mosque_memberships")
      .update({ can_create_programs: canCreatePrograms })
      .eq("id", requestId);
    setBusyId(null);
    if (reviewError) {
      setError(friendlyErrorMessage(reviewError, "Could not update this permission."));
      return;
    }
    await loadRequests();
  }

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  return (
    <section className="space-y-3 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Teacher permissions</p>
        <h2 className="mt-1 text-xl font-semibold text-[#26323A]">Class creation access</h2>
      </div>
      {error ? <div className="border border-[#F4C7C1] bg-[#FDEDEA] px-4 py-3 text-sm text-[#A4352A]">{error}</div> : null}
      {requests.length === 0 ? (
        <MiniEmpty text="No active teachers found." />
      ) : (
        <div className="divide-y divide-[#E1E6E9] bg-white">
          {requests.map((request) => (
            <div key={request.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-semibold text-[#26323A]">{request.profile?.full_name || request.profile?.email || "Unnamed teacher"}</p>
                <p className="mt-1 text-sm text-[#6B747B]">{[request.profile?.email, request.profile?.phone_number].filter(Boolean).join(" - ") || "No contact details"}</p>
              </div>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <span className={cn("text-sm font-semibold", request.can_create_programs ? "text-[#17624F]" : "text-[#7B858C]")}>
                  {request.can_create_programs ? "Can create classes" : "Cannot create classes"}
                </span>
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => void setTeacherCreationPermission(request.id, !request.can_create_programs)}
                  className={cn(
                    "min-h-10 rounded-full px-4 text-sm font-semibold disabled:opacity-60",
                    request.can_create_programs ? "border border-[#C83F31] bg-white text-[#C83F31]" : "bg-[#17624F] text-white",
                  )}
                >
                  {request.can_create_programs ? "Revoke" : "Allow"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type AdminMemberEnrollmentContext = {
  enrollment: Enrollment;
  program: Program | null;
  tracks: ProgramTrack[];
};
type AdminMemberTeacherClassContext = {
  assignment: ProgramTeacher;
  program: Program | null;
};
type AdminMember = MosqueMembership & {
  profile?: Profile | null;
  enrollmentContexts?: AdminMemberEnrollmentContext[];
  teacherClassContexts?: AdminMemberTeacherClassContext[];
  parentProfile?: Profile | null;
  childProfiles?: Profile[];
  synthetic?: boolean;
};

export function AdminMembersData({ slug }: { slug: string }) {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [activeType, setActiveType] = useState<"student" | "parent" | "teacher" | "admin">("student");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [permissionTarget, setPermissionTarget] = useState<
    | { type: "class_creation"; member: AdminMember; enabled: boolean }
    | { type: "finance"; member: AdminMember; context: AdminMemberTeacherClassContext; enabled: boolean }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // One RPC call instead of mosque -> memberships -> programs -> teacher-assignments ->
  // enrollments -> enrollment_tracks -> tracks -> parent_child_links -> profiles, as nine
  // fully sequential stages -- the worst waterfall found in the full-app audit.
  async function loadMembers() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("get_admin_members_snapshot", { p_slug: slug });
    if (error) {
      setError(friendlyErrorMessage(error, "Could not load members."));
      setLoading(false);
      return;
    }

    const snapshot = data as unknown as {
      mosqueId: string | null;
      memberships: MosqueMembership[];
      programs: Program[];
      teacherAssignments: ProgramTeacher[];
      enrollments: Enrollment[];
      enrollmentTracks: Array<{ enrollment_id: string; program_track_id: string }>;
      tracks: ProgramTrack[];
      links: Array<{ id: string; mosque_id: string; parent_profile_id: string; child_profile_id: string; created_at: string }>;
      profiles: Profile[];
    } | null;

    if (!snapshot) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const membershipRows = snapshot.memberships ?? [];
    const programRows = snapshot.programs ?? [];
    const teacherAssignmentRows = snapshot.teacherAssignments ?? [];
    const enrollmentRows = snapshot.enrollments ?? [];
    const enrollmentTrackRows = snapshot.enrollmentTracks ?? [];
    const trackRows = snapshot.tracks ?? [];
    const linkRows = snapshot.links ?? [];

    const profiles = snapshot.profiles ?? [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const programById = new Map((programRows ?? []).map((program) => [program.id, program]));
    const trackById = new Map((trackRows ?? []).map((track) => [track.id, track]));
    const trackIdsByEnrollmentId = new Map<string, string[]>();
    for (const row of enrollmentTrackRows ?? []) {
      trackIdsByEnrollmentId.set(row.enrollment_id, [...(trackIdsByEnrollmentId.get(row.enrollment_id) ?? []), row.program_track_id]);
    }
    const enrollmentContextsByStudentId = new Map<string, AdminMemberEnrollmentContext[]>();
    const teacherContextsByProfileId = new Map<string, AdminMemberTeacherClassContext[]>();
    for (const assignment of teacherAssignmentRows ?? []) {
      if (!assignment.teacher_profile_id) {
        continue;
      }
      teacherContextsByProfileId.set(assignment.teacher_profile_id, [
        ...(teacherContextsByProfileId.get(assignment.teacher_profile_id) ?? []),
        {
          assignment,
          program: programById.get(assignment.program_id) ?? null,
        },
      ]);
    }
    for (const enrollment of enrollmentRows ?? []) {
      const selectedTrackIds = trackIdsByEnrollmentId.get(enrollment.id) ?? (enrollment.program_track_id ? [enrollment.program_track_id] : []);
      const context = {
        enrollment,
        program: programById.get(enrollment.program_id) ?? null,
        tracks: selectedTrackIds.map((trackId) => trackById.get(trackId)).filter((track): track is ProgramTrack => Boolean(track)),
      };
      enrollmentContextsByStudentId.set(enrollment.student_profile_id, [...(enrollmentContextsByStudentId.get(enrollment.student_profile_id) ?? []), context]);
    }
    const parentByChildId = new Map<string, Profile>();
    const childrenByParentId = new Map<string, Profile[]>();
    for (const link of linkRows ?? []) {
      const parent = profileById.get(link.parent_profile_id);
      const child = profileById.get(link.child_profile_id);
      if (parent && !parentByChildId.has(link.child_profile_id)) {
        parentByChildId.set(link.child_profile_id, parent);
      }
      if (child) {
        childrenByParentId.set(link.parent_profile_id, [...(childrenByParentId.get(link.parent_profile_id) ?? []), child]);
      }
    }

    const membershipMembers = (membershipRows ?? [])
        .map((membership) => ({
          ...membership,
          profile: profileById.get(membership.profile_id) ?? null,
          enrollmentContexts: enrollmentContextsByStudentId.get(membership.profile_id) ?? [],
          teacherClassContexts: teacherContextsByProfileId.get(membership.profile_id) ?? [],
          parentProfile: parentByChildId.get(membership.profile_id) ?? null,
          childProfiles: childrenByParentId.get(membership.profile_id) ?? [],
        }))
        .filter((membership) => membership.profile?.account_type === membership.role || membership.role === "teacher");
    const existingMembershipProfileIds = new Set(membershipMembers.map((membership) => membership.profile_id));
    const syntheticTeacherMembers: AdminMember[] = Array.from(teacherContextsByProfileId.entries())
      .filter(([profileId]) => !existingMembershipProfileIds.has(profileId))
      .map(([profileId, contexts]) => ({
        id: `teacher-assignment:${profileId}`,
        mosque_id: snapshot.mosqueId ?? "",
        profile_id: profileId,
        role: "teacher",
        status: "active",
        teacher_approval_status: null,
        teacher_approval_reviewed_by: null,
        teacher_approval_reviewed_at: null,
        can_create_programs: false,
        created_at: contexts[0]?.assignment.created_at ?? new Date().toISOString(),
        updated_at: contexts[0]?.assignment.created_at ?? new Date().toISOString(),
        profile: profileById.get(profileId) ?? null,
        enrollmentContexts: [],
        teacherClassContexts: contexts,
        parentProfile: null,
        childProfiles: [],
        synthetic: true,
      }))
      .filter((member) => !member.profile || member.profile.account_type === "teacher");

    setMembers([...membershipMembers, ...syntheticTeacherMembers]);
    setLoading(false);
  }

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function setTeacherCreationPermission(membershipId: string, canCreatePrograms: boolean) {
    setBusyId(membershipId);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("mosque_memberships")
      .update({ can_create_programs: canCreatePrograms })
      .eq("id", membershipId);
    setBusyId(null);
    if (updateError) {
      setError(friendlyErrorMessage(updateError, "Could not update this permission."));
      return;
    }
    await loadMembers();
  }

  async function setTeacherFinancePermission(assignmentId: string, enabled: boolean) {
    setBusyId(assignmentId);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase
      .from("program_teachers")
      .update({ can_manage_finances: enabled })
      .eq("id", assignmentId)
      .eq("role", "director");
    setBusyId(null);
    if (updateError) {
      setError(friendlyErrorMessage(updateError, "Could not update this permission."));
      return;
    }
    setToast({ tone: "success", message: enabled ? "Finance access enabled." : "Finance access removed." });
    window.dispatchEvent(new Event("tareeqah:programs-changed"));
    await loadMembers();
  }

  async function confirmPermissionChange() {
    if (!permissionTarget) {
      return;
    }
    const target = permissionTarget;
    setPermissionTarget(null);
    if (target.type === "class_creation") {
      if (target.member.synthetic) {
        setError("This teacher does not have an active teacher membership record yet.");
        return;
      }
      await setTeacherCreationPermission(target.member.id, target.enabled);
      setToast({ tone: "success", message: target.enabled ? "Class creation enabled." : "Class creation removed." });
      return;
    }
    await setTeacherFinancePermission(target.context.assignment.id, target.enabled);
  }

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  const tabs: Array<{ id: typeof activeType; label: string }> = [
    { id: "student", label: "Students" },
    { id: "parent", label: "Parents" },
    { id: "teacher", label: "Teachers" },
    { id: "admin", label: "Admins" },
  ];
  const visibleMembers =
    activeType === "student"
      ? members.filter((member) => member.role === "student" || (member.role === "parent" && (member.enrollmentContexts?.length ?? 0) > 0))
      : members.filter((member) => member.role === activeType);

  return (
    <section className="space-y-4 bg-[var(--workspace)] p-4">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      {error ? <div className="border border-[#F4C7C1] bg-[#FDEDEA] px-4 py-3 text-sm text-[#A4352A]">{error}</div> : null}
      <div className="grid grid-cols-4 gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveType(tab.id)}
            className={cn(
              "min-h-8 rounded-full px-1.5 text-[11px] font-semibold leading-tight",
              activeType === tab.id ? "bg-[#17624F] text-white" : "bg-[#F1F4F5] text-[#5C6870]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8A949B]">Showing {visibleMembers.length} result{visibleMembers.length === 1 ? "" : "s"}</p>
      {visibleMembers.length === 0 ? (
        <MiniEmpty text={`No active ${activeType} members found.`} />
      ) : (
        <div className="divide-y divide-[#E6EAED] bg-white">
          {visibleMembers.map((member) => (
            <AdminMemberRow
              key={member.id}
              member={member}
              viewType={activeType}
              busyId={busyId}
              onRequestToggleTeacherCreation={() => setPermissionTarget({ type: "class_creation", member, enabled: !member.can_create_programs })}
              onRequestToggleFinance={(context) => setPermissionTarget({ type: "finance", member, context, enabled: !context.assignment.can_manage_finances })}
            />
          ))}
        </div>
      )}
      {permissionTarget ? (
        <AdminTeacherPermissionModal
          target={permissionTarget}
          onCancel={() => setPermissionTarget(null)}
          onConfirm={() => void confirmPermissionChange()}
        />
      ) : null}
    </section>
  );
}

function AdminMemberRow({
  member,
  viewType,
  busyId,
  onRequestToggleTeacherCreation,
  onRequestToggleFinance,
}: {
  member: AdminMember;
  viewType: "student" | "parent" | "teacher" | "admin";
  busyId: string | null;
  onRequestToggleTeacherCreation: () => void;
  onRequestToggleFinance: (context: AdminMemberTeacherClassContext) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = member.profile?.full_name || member.profile?.email || (member.role === "teacher" ? "Assigned teacher" : "Unnamed member");
  const isStudentView = viewType === "student";
  const isChildStudent = isStudentView && Boolean(member.parentProfile);
  const roleLabel = isStudentView ? (isChildStudent ? "Child Student" : "Adult Student") : member.role === "parent" ? "Parent" : member.role === "teacher" ? "Teacher" : "Admin";
  const enrollmentContexts = member.enrollmentContexts ?? [];
  const teacherClassContexts = member.teacherClassContexts ?? [];
  const childProfiles = member.childProfiles ?? [];

  return (
    <article>
      <div className="flex items-center gap-3 py-3">
        <Avatar src={member.profile?.avatar_url ?? null} name={name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-5 text-[#26323A]">{name}</h3>
          <p className="mt-0.5 truncate text-xs font-medium text-[#7B858C]">{roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide member details" : "Show member details"}
        >
          <ChevronIcon expanded={expanded} />
        </button>
      </div>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="pb-4 pl-0 pr-2">
            <dl className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,0.85fr)] gap-x-4 gap-y-3 rounded-[18px] bg-[#F7FAFB] px-4 py-3 text-sm">
              <RequestDetail label="Email" value={member.profile?.email} singleLine />
              <RequestDetail label="Phone" value={member.profile?.phone_number} singleLine />
              {member.role === "student" ? (
                <>
                  <RequestDetail label="Age" value={displayAge(member.profile)} />
                  <RequestDetail label="Gender" value={formatStudentDetailGender(member.profile?.gender ?? null)} />
                </>
              ) : null}
              {isStudentView && member.role === "parent" ? (
                <>
                  <RequestDetail label="Date of birth" value={formatMemberDate(member.profile?.date_of_birth ?? null)} singleLine />
                  <RequestDetail label="Gender" value={formatStudentDetailGender(member.profile?.gender ?? null)} />
                </>
              ) : null}
              {viewType === "parent" ? (
                <>
                  <RequestDetail label="Date of birth" value={formatMemberDate(member.profile?.date_of_birth ?? null)} singleLine />
                  <RequestDetail label="Gender" value={formatStudentDetailGender(member.profile?.gender ?? null)} />
                </>
              ) : null}
              {member.role === "teacher" ? (
                <>
                  <RequestDetail label="Class creation" value={member.can_create_programs ? "Allowed" : "Not allowed"} singleLine />
                  <RequestDetail label="Status" value={titleCase(member.status)} singleLine />
                </>
              ) : null}
              {member.role === "admin" ? <RequestDetail label="Status" value={titleCase(member.status)} singleLine /> : null}
            </dl>
            {isStudentView && member.parentProfile ? (
              <div className="mt-3 rounded-[18px] bg-[#F7FAFB] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Parent</p>
                <p className="mt-1 text-sm font-semibold text-[#26323A]">{member.parentProfile.full_name || member.parentProfile.email || "Parent"}</p>
                <p className="mt-1 break-words text-xs font-medium leading-5 text-[#6B747B]">{[member.parentProfile.email, member.parentProfile.phone_number].filter(Boolean).join(" - ") || "No contact details"}</p>
              </div>
            ) : null}
            {isStudentView ? (
              <AdminMemberProgramList title="Classes" emptyText="Not enrolled in any classes." enrollmentContexts={enrollmentContexts} />
            ) : null}
            {viewType === "parent" ? <AdminMemberChildrenList children={childProfiles} /> : null}
            {member.role === "teacher" ? (
              <AdminMemberTeacherClassList
                contexts={teacherClassContexts}
                canCreatePrograms={member.can_create_programs}
                synthetic={Boolean(member.synthetic)}
                busyId={busyId}
                onToggleClassCreation={onRequestToggleTeacherCreation}
                onToggleFinance={onRequestToggleFinance}
              />
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function AdminMemberProgramList({
  title,
  emptyText,
  enrollmentContexts,
}: {
  title: string;
  emptyText: string;
  enrollmentContexts: AdminMemberEnrollmentContext[];
}) {
  return (
    <div className="mt-3 rounded-[18px] bg-[#F7FAFB] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">{title}</p>
      {enrollmentContexts.length === 0 ? (
        <p className="mt-1 text-sm font-semibold text-[#26323A]">{emptyText}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {enrollmentContexts.map((context) => {
            const trackText = context.tracks.length ? context.tracks.map((track) => track.name).join(", ") : "No track selected";
            return (
              <div key={context.enrollment.id} className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#26323A]">{context.program?.title ?? "Class"}</p>
                <p className="mt-0.5 truncate text-xs font-medium text-[#6B747B]">{trackText}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminMemberChildrenList({ children }: { children: Profile[] }) {
  return (
    <div className="mt-3 rounded-[18px] bg-[#F7FAFB] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Children</p>
      {children.length === 0 ? (
        <p className="mt-1 text-sm font-semibold text-[#26323A]">No linked children.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <div key={child.id} className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#26323A]">{child.full_name || child.email || "Child"}</p>
              <p className="mt-0.5 truncate text-xs font-medium text-[#6B747B]">
                {[displayAge(child) !== "Not provided" ? `${displayAge(child)} years old` : null, formatStudentDetailGender(child.gender ?? null) !== "Not provided" ? formatStudentDetailGender(child.gender ?? null) : null]
                  .filter(Boolean)
                  .join(" - ") || "No details"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type TeacherRosterSnapshot = {
  mosque: Mosque | null;
  program: Program | null;
  tracks: ProgramTrack[];
  trackDaysById: Map<string, string[]>;
  trackSessionKeysById: Map<string, string[]>;
  availableRosterDays: string[];
  students: Array<{ enrollment: Enrollment; profile: StudentDisplay | null; parent?: ParentDisplay | null; subscription?: ProgramSubscription | null; trackIds: string[] }>;
  waitlist: RequestWithContext[];
  currentUserId: string | null;
  error: string | null;
};

const emptyTeacherRosterSnapshot: TeacherRosterSnapshot = {
  mosque: null,
  program: null,
  tracks: [],
  trackDaysById: new Map(),
  trackSessionKeysById: new Map(),
  availableRosterDays: [],
  students: [],
  waitlist: [],
  currentUserId: null,
  error: null,
};

export function TeacherStudentsData({ slug, programId }: { slug: string; programId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cameFromParam = searchParams.get("from");
  const cameFrom = cameFromParam === "finances" || cameFromParam === "applications" ? cameFromParam : null;
  const originStudentId = searchParams.get("studentId");
  const sessionTrackIdParam = searchParams.get("trackId");
  const sessionDayParam = searchParams.get("day");
  const sessionStartParam = searchParams.get("start");
  const sessionEndParam = searchParams.get("end");
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [students, setStudents] = useState<Array<{ enrollment: Enrollment; profile: StudentDisplay | null; parent?: ParentDisplay | null; subscription?: ProgramSubscription | null; trackIds: string[] }>>([]);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [trackDaysById, setTrackDaysById] = useState<Map<string, string[]>>(new Map());
  const [trackSessionKeysById, setTrackSessionKeysById] = useState<Map<string, string[]>>(new Map());
  const [selectedRosterTrackIds, setSelectedRosterTrackIds] = useState<string[]>(() => (sessionTrackIdParam ? [sessionTrackIdParam] : []));
  const [selectedRosterDays, setSelectedRosterDays] = useState<string[]>(() => (sessionDayParam ? [sessionDayParam] : [...scheduleDayOptions]));
  const [sessionFilterActive, setSessionFilterActive] = useState(Boolean(sessionTrackIdParam || sessionDayParam));
  const [waitlist, setWaitlist] = useState<RequestWithContext[]>([]);
  const [studentSearch, setStudentSearch] = useState(originStudentId ?? "");
  const [genderFilter, setGenderFilter] = useState("all");
  const [studentSort, setStudentSort] = useState<"first" | "last" | "age">("first");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [studentView, setStudentView] = useState<"students" | "parents">("students");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<{ studentId: string; studentName: string; subscription?: ProgramSubscription | null } | null>(null);
  const kickModalRef = useRef<HTMLDivElement>(null);
  const [noteTarget, setNoteTarget] = useState<{ item: { enrollment: Enrollment; profile: StudentDisplay | null; parent?: ParentDisplay | null }; confirmedParent?: boolean } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ request: RequestWithContext; action: "approved" | "rejected" } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [showKickMessage, setShowKickMessage] = useState(false);
  const [kickMessage, setKickMessage] = useState("");

  useModalFocusTrap(kickModalRef, Boolean(kickTarget), () => setKickTarget(null));

  useEffect(() => {
    if (cameFrom && originStudentId) {
      setStudentSearch(originStudentId);
    }
  }, [originStudentId, cameFrom]);

  function notesHref(studentId: string) {
    const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith(`/m/${slug}/admin/`);
    const basePath = isAdminRoute ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
    return `${basePath}/${programId}/students/${studentId}/notes`;
  }

  // One RPC call instead of mosque -> program -> [enrollments+waitlist+tracks] -> [sessions+
  // track_sessions] -> [enrollment_tracks+subscriptions+completed_requests] ->
  // completed_request_tracks -> profiles -> parent_child_links -> parents, as nine sequential
  // stages. All the track/session/day derivation logic below is unchanged.
  async function fetchTeacherRoster(): Promise<TeacherRosterSnapshot> {
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id ?? null;

    const { data, error } = await supabase.rpc("get_teacher_roster_snapshot", { p_slug: slug, p_program_id: programId });
    if (error) {
      return { ...emptyTeacherRosterSnapshot, currentUserId: userId, error: friendlyErrorMessage(error, "Could not load students.") };
    }

    const snapshot = data as unknown as {
      error: string | null;
      mosque: Mosque | null;
      program: Program | null;
      enrollments: Enrollment[];
      waitlist: EnrollmentRequest[];
      tracks: ProgramTrack[];
      sessions: ProgramSession[];
      trackSessions: ProgramTrackSession[];
      enrollmentTracks: Array<{ enrollment_id: string; program_track_id: string }>;
      subscriptions: ProgramSubscription[];
      completedRequests: Array<Pick<EnrollmentRequest, "id" | "student_profile_id" | "program_track_id" | "reviewed_at" | "requested_at">>;
      completedRequestTracks: Array<{ enrollment_request_id: string; program_track_id: string }>;
      profiles: StudentDisplay[];
      links: Array<{ child_profile_id: string; parent_profile_id: string }>;
      parents: ParentDisplay[];
    } | null;

    if (!snapshot || !snapshot.mosque) {
      return { ...emptyTeacherRosterSnapshot, currentUserId: userId, error: snapshot?.error ?? "Masjid not found." };
    }
    if (!snapshot.program) {
      return { ...emptyTeacherRosterSnapshot, currentUserId: userId, mosque: snapshot.mosque, error: snapshot.error ?? "Class not found." };
    }

    const mosqueData = snapshot.mosque;
    const programData = snapshot.program;
    const enrollmentRows = snapshot.enrollments ?? [];
    const waitlistRows = snapshot.waitlist ?? [];
    const activeTrackRows = snapshot.tracks ?? [];
    const sessionRows = snapshot.sessions ?? [];
    const trackSessionRows = snapshot.trackSessions ?? [];

    const sessionById = new Map(sessionRows.map((session) => [session.id, session]));
    const nextTrackDaysById = new Map<string, string[]>();
    const nextTrackSessionKeysById = new Map<string, string[]>();
    for (const track of activeTrackRows) {
      const linkedRows = trackSessionRows
        .filter((link) => link.program_track_id === track.id)
        .map((link) => sessionById.get(link.program_session_id))
        .filter((session): session is ProgramSession => Boolean(session))
        .map(scheduleRowFromProgramSession);
      const linkedDays = linkedRows.map((row) => row.day);
      const fallbackDays = parseProgramSchedule(track.schedule).map((row) => row.day);
      const fallbackRows = parseProgramSchedule(track.schedule);
      const sessionRowsForTrack = linkedRows.length ? linkedRows : fallbackRows;
      nextTrackDaysById.set(track.id, Array.from(new Set(linkedDays.length ? linkedDays : fallbackDays)));
      nextTrackSessionKeysById.set(track.id, Array.from(new Set(sessionRowsForTrack.map(rosterSessionKey))));
    }
    const availableRosterDays = Array.from(new Set(Array.from(nextTrackDaysById.values()).flat()));

    const enrollmentTrackRows = snapshot.enrollmentTracks ?? [];
    const subscriptionRows = snapshot.subscriptions ?? [];
    const completedRequestRows = snapshot.completedRequests ?? [];
    const completedRequestTrackRows = snapshot.completedRequestTracks ?? [];
    const fallbackTrackIdsByStudentId = new Map<string, string[]>();
    const requestTrackIdsByRequestId = new Map<string, string[]>();
    for (const row of completedRequestTrackRows) {
      requestTrackIdsByRequestId.set(row.enrollment_request_id, [...(requestTrackIdsByRequestId.get(row.enrollment_request_id) ?? []), row.program_track_id]);
    }
    for (const request of completedRequestRows) {
      if (fallbackTrackIdsByStudentId.has(request.student_profile_id)) {
        continue;
      }
      const trackIds = [...(requestTrackIdsByRequestId.get(request.id) ?? []), ...(request.program_track_id ? [request.program_track_id] : [])].filter(
        (trackId, index, all) => Boolean(trackId) && all.indexOf(trackId) === index,
      );
      if (trackIds.length) {
        fallbackTrackIdsByStudentId.set(request.student_profile_id, trackIds);
      }
    }
    const profileRows = snapshot.profiles ?? [];
    const linkRows = snapshot.links ?? [];
    const parentRows = snapshot.parents ?? [];

    return {
      mosque: mosqueData,
      program: programData,
      tracks: activeTrackRows,
      trackDaysById: nextTrackDaysById,
      trackSessionKeysById: nextTrackSessionKeysById,
      availableRosterDays,
      currentUserId: userId,
      students: (enrollmentRows ?? [])
        .filter((enrollment) => isCurrentEnrollmentStatus(enrollment.status))
        .map((enrollment) => ({
          enrollment,
          trackIds: [
            ...(enrollmentTrackRows ?? [])
              .filter((row) => row.enrollment_id === enrollment.id)
              .map((row) => row.program_track_id)
              .filter(Boolean),
            ...(enrollment.program_track_id ? [enrollment.program_track_id] : []),
            ...(fallbackTrackIdsByStudentId.get(enrollment.student_profile_id) ?? []),
          ].filter((trackId, index, all) => all.indexOf(trackId) === index),
          profile: (profileRows ?? []).find((profile) => profile.id === enrollment.student_profile_id) ?? null,
          subscription: (subscriptionRows ?? []).find((subscription) => subscription.student_profile_id === enrollment.student_profile_id) ?? null,
          parent:
            ((parentRows ?? []).find(
              (parent) => parent.id === (linkRows ?? []).find((link) => link.child_profile_id === enrollment.student_profile_id)?.parent_profile_id,
            ) as ParentDisplay | undefined) ?? null,
        })),
      waitlist: (waitlistRows ?? []).map((request) => ({
        ...request,
        program: programData,
        student: (profileRows ?? []).find((profile) => profile.id === request.student_profile_id) ?? null,
        parent: request.parent_profile_id ? ((parentRows ?? []).find((parent) => parent.id === request.parent_profile_id) as ParentDisplay | undefined) ?? null : null,
        track: request.program_track_id ? activeTrackRows.find((track) => track.id === request.program_track_id) ?? null : null,
      })),
      error: null,
    };
  }

  const { data: rosterSnapshot, loading: rosterQueryLoading, refetch: refetchRoster } = useCachedQuery(programId ? `teacher-roster:${programId}` : null, () => fetchTeacherRoster());

  useEffect(() => {
    if (!rosterSnapshot) {
      return;
    }
    setMosque(rosterSnapshot.mosque);
    setProgram(rosterSnapshot.program);
    setTracks(rosterSnapshot.tracks);
    setTrackDaysById(rosterSnapshot.trackDaysById);
    setTrackSessionKeysById(rosterSnapshot.trackSessionKeysById);
    setCurrentUserId(rosterSnapshot.currentUserId);
    setStudents(rosterSnapshot.students);
    setWaitlist(rosterSnapshot.waitlist);
    setError(rosterSnapshot.error);
    setSelectedRosterTrackIds((current) => {
      const availableTrackIds = new Set(rosterSnapshot.tracks.map((track) => track.id));
      const next = current.filter((trackId) => availableTrackIds.has(trackId));
      return next.length ? next : rosterSnapshot.tracks.map((track) => track.id);
    });
    setSelectedRosterDays((current) => {
      const next = current.filter((day) => rosterSnapshot.availableRosterDays.includes(day));
      if (next.length) {
        return next;
      }
      if (sessionDayParam && rosterSnapshot.availableRosterDays.includes(sessionDayParam)) {
        return [sessionDayParam];
      }
      return rosterSnapshot.availableRosterDays.length ? rosterSnapshot.availableRosterDays : [...scheduleDayOptions];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterSnapshot]);

  useEffect(() => {
    setLoading(rosterQueryLoading);
  }, [rosterQueryLoading]);

  async function kickStudent(studentId: string, customMessage?: string) {
    if (!program || !mosque || !currentUserId) {
      return;
    }

    setBusyStudentId(studentId);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const targetStudent = students.find((student) => student.enrollment.student_profile_id === studentId);
    if (hasActiveRecurringSubscription(targetStudent?.subscription ?? null)) {
      setError("End this student's active subscription before removing them from class.");
      setBusyStudentId(null);
      return;
    }

    const { error: updateError } = await supabase
      .from("enrollments")
      .update({ status: "kicked" })
      .eq("program_id", program.id)
      .eq("student_profile_id", studentId);

    if (updateError) {
      setError(friendlyErrorMessage(updateError, "Could not remove this student."));
      setBusyStudentId(null);
      return;
    }

    const now = new Date().toISOString();
    const parentId = targetStudent?.parent?.id ?? null;
    const reviewNote = customMessage?.trim() || `You were removed from ${program.title}.`;
    const { error: noticeError } = await supabase.from("enrollment_requests").upsert(
      {
        mosque_id: mosque.id,
        program_id: program.id,
        student_profile_id: studentId,
        parent_profile_id: parentId,
        status: "cancelled",
        reviewed_by: currentUserId,
        reviewed_at: now,
        review_note: reviewNote,
        student_dismissed_at: null,
      },
      { onConflict: "program_id,student_profile_id" },
    );

    if (noticeError) {
      setError(friendlyErrorMessage(noticeError, "Could not send removal notice."));
    }

    const { data: actorProfile } = await supabase.from("profiles").select("full_name, email").eq("id", currentUserId).maybeSingle();
    const actorName = actorProfile?.full_name?.trim() || actorProfile?.email?.trim() || "Director";
    await supabase.from("program_finance_audit_events").insert({
      program_id: program.id,
      student_profile_id: studentId,
      actor_profile_id: currentUserId,
      event_type: "student_removed",
      summary: `${actorName} removed ${targetStudent?.profile?.full_name || "Student"} from ${program.title}.`,
      metadata: {},
    });

    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    const refreshedRoster = await fetchTeacherRoster();
    await refetchRoster();
    const stillVisible = refreshedRoster.students.some((student) => student.enrollment.student_profile_id === studentId);
    setBusyStudentId(null);
    if (stillVisible) {
      setError("The student was updated, but they are still appearing in the active roster. Try refreshing the page.");
      return;
    }
    setKickTarget(null);
    setShowKickMessage(false);
    setKickMessage("");
  }

  async function reviewWaitlistedRequest(
    request: RequestWithContext,
    status: "approved" | "rejected",
    options: { paymentType?: PaymentType; priceMonthlyCents?: number | null; priceAnnualCents?: number | null; paymentBypassed?: boolean; paymentBypassedExternal?: boolean; note?: string | null } = {},
  ) {
    if (!currentUserId || !program) {
      return;
    }

    setReviewBusy(true);
    setError(null);
    const endpoint = status === "approved" ? "approve" : "reject";
    const result = await callApplicationAction(request.program_id, request.id, endpoint, {
      paymentType: options.paymentType,
      priceMonthlyCents: options.priceMonthlyCents,
      priceAnnualCents: options.priceAnnualCents,
      paymentBypassed: options.paymentBypassed,
      paymentBypassedExternal: options.paymentBypassedExternal,
      note: options.note,
    });

    if (!result.ok) {
      setReviewBusy(false);
      setError(result.error);
      return;
    }

    queueEnrollmentRequestReviewedEmail(request.id);
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    await refetchRoster();
    setReviewBusy(false);
    setReviewTarget(null);
    setToast({ tone: "success", message: status === "approved" ? "Waitlisted application accepted." : "Waitlisted application rejected." });
  }

  const trackDayMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const track of tracks) {
      map.set(track.id, trackDaysById.get(track.id) ?? parseProgramSchedule(track.schedule).map((row) => row.day));
    }
    return map;
  }, [trackDaysById, tracks]);
  const activeSessionKey = useMemo(() => {
    if (!sessionFilterActive || !sessionDayParam || !sessionStartParam) {
      return null;
    }
    const normalizedDay = normalizeScheduleDay(sessionDayParam);
    if (!normalizedDay) {
      return null;
    }
    return rosterSessionKey({ day: normalizedDay, start: sessionStartParam, end: sessionEndParam || sessionStartParam });
  }, [sessionDayParam, sessionEndParam, sessionFilterActive, sessionStartParam]);
  const rosterDayOptions = useMemo(() => {
    const days = Array.from(new Set(Array.from(trackDayMap.values()).flat()));
    return scheduleDayOptions.filter((day) => days.includes(day));
  }, [trackDayMap]);

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    const sorted = students
      .filter((student) => {
        const gender = normalizeGender(student.profile?.gender ?? null);
        const genderMatches = studentView === "parents" || genderFilter === "all" || gender === genderFilter;
        if (!genderMatches) {
          return false;
        }
        const trackMatches =
          tracks.length === 0 ||
          selectedRosterTrackIds.length === tracks.length ||
          (student.trackIds ?? []).some((trackId) => selectedRosterTrackIds.includes(trackId));
        if (!trackMatches) {
          return false;
        }
        if (activeSessionKey) {
          return (student.trackIds ?? []).some((trackId) => (trackSessionKeysById.get(trackId) ?? []).includes(activeSessionKey));
        }
        const dayMatches =
          tracks.length === 0 ||
          rosterDayOptions.length === 0 ||
          (selectedRosterDays.length === rosterDayOptions.length && rosterDayOptions.every((day) => selectedRosterDays.includes(day))) ||
          ((student.trackIds ?? []).length
            ? (student.trackIds ?? []).some((trackId) => (trackDayMap.get(trackId) ?? []).some((day) => selectedRosterDays.includes(day)))
            : selectedRosterDays.length > 0);
        if (!dayMatches) {
          return false;
        }
        if (!query) {
          return true;
        }
        const haystack = [
          student.profile?.full_name,
          student.profile?.email,
          student.profile?.phone_number,
          student.parent?.full_name,
          student.parent?.email,
          student.parent?.phone_number,
          student.enrollment.student_profile_id,
          student.enrollment.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((left, right) => {
        let comparison = 0;
        if (studentSort === "age") {
          comparison = (profileAgeNumber(left.profile) ?? 999) - (profileAgeNumber(right.profile) ?? 999);
        } else if (studentSort === "last") {
          comparison = lastNameOf(left.profile?.full_name ?? "").localeCompare(lastNameOf(right.profile?.full_name ?? ""));
        } else {
          comparison = firstNameOf(left.profile?.full_name ?? "").localeCompare(firstNameOf(right.profile?.full_name ?? ""));
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    return sorted;
  }, [activeSessionKey, genderFilter, rosterDayOptions, selectedRosterDays, selectedRosterTrackIds, sortDirection, studentSearch, studentSort, studentView, students, trackDayMap, trackSessionKeysById, tracks]);
  const familyGroups = useMemo(() => {
    const groups = new Map<string, { parent: ParentDisplay | null; children: TeacherStudentItem[] }>();
    for (const student of filteredStudents) {
      if (!student.parent) {
        continue;
      }
      const key = student.parent?.id ?? `student:${student.enrollment.student_profile_id}`;
      const current = groups.get(key) ?? { parent: student.parent ?? null, children: [] };
      current.children.push(student);
      groups.set(key, current);
    }
    return Array.from(groups.values()).sort((left, right) => {
      const leftName = left.parent?.full_name ?? left.children[0]?.profile?.full_name ?? "";
      const rightName = right.parent?.full_name ?? right.children[0]?.profile?.full_name ?? "";
      const comparison =
        studentSort === "last"
          ? lastNameOf(leftName).localeCompare(lastNameOf(rightName))
          : firstNameOf(leftName).localeCompare(firstNameOf(rightName));
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredStudents, sortDirection, studentSort]);
  const resultCount = studentView === "parents" ? familyGroups.length : filteredStudents.length;
  const hasVisibleStudents = resultCount > 0;

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  if (error && !program) {
    return <EmptyState title="Could not load students" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This teacher class could not be loaded." />;
  }

  return (
    <div className="bg-white px-5 pb-28 pt-5">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      {cameFrom ? (
        <div className="sticky top-3 z-20 mb-4">
          <button
            type="button"
            onClick={() => {
              const basePath = typeof window !== "undefined" && window.location.pathname.startsWith(`/m/${slug}/admin/`) ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
              router.push(`${basePath}/${programId}/${cameFrom}`);
            }}
            className="min-h-10 rounded-full bg-[#17624F] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(23,98,79,0.22)]"
          >
            {cameFrom === "finances" ? "Back to Finances" : "Back to Applications"}
          </button>
        </div>
      ) : null}
      {sessionFilterActive ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-full bg-[#EEF6F7] px-4 py-2 text-sm font-semibold text-[#2F8FB3]">
          <span>Filtered to {sessionDayParam ?? "that"}&apos;s session{sessionStartParam ? ` at ${formatClockLabel(sessionStartParam)}` : ""}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedRosterTrackIds(tracks.map((track) => track.id));
              setSelectedRosterDays(rosterDayOptions.length ? rosterDayOptions : [...scheduleDayOptions]);
              setSessionFilterActive(false);
            }}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#2F8FB3] shadow-[0_4px_10px_rgba(38,50,58,0.08)]"
          >
            Clear
          </button>
        </div>
      ) : null}
      <div className="space-y-5">
        {error ? <div className="border-l-4 border-[#E25241] bg-[#FDEDEA] p-3 text-sm text-[#A4352A]">{error}</div> : null}

        <section className="space-y-4">
          {tracks.length ? (
            <div className="rounded-[24px] bg-[#F6FAFA] p-3">
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Track Snapshot</p>
                  <h2 className="text-lg font-semibold text-[#26323A]">{program.title}</h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#52616A] shadow-[0_4px_12px_rgba(38,50,58,0.06)]">
                  {students.filter((student) => isCurrentEnrollmentStatus(student.enrollment.status)).length} active
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {tracks.map((track) => {
                  const activeCount = students.filter((student) => isCurrentEnrollmentStatus(student.enrollment.status) && student.trackIds.includes(track.id)).length;
                  const capacity = track.capacity ?? null;
                  const atCapacity = capacity != null && activeCount >= capacity;
                  return (
                    <div key={track.id} className="flex min-h-14 items-center justify-between gap-3 rounded-[16px] border border-[#E1E8EC] bg-white px-3 py-2.5">
                      <p className="min-w-0 truncate text-sm font-semibold text-[#26323A]">{track.name}</p>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", atCapacity ? "bg-[#FBEAE7] text-[#C0392B]" : "bg-[#EAF7F1] text-[#17624F]")}>
                        {capacity == null ? `${activeCount} / no limit` : `${activeCount} / ${capacity} spots`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <TeacherStudentListControls
            search={studentSearch}
            gender={genderFilter}
            sort={studentSort}
            sortDirection={sortDirection}
            view={studentView}
            tracks={tracks}
            selectedTrackIds={selectedRosterTrackIds}
            selectedDays={selectedRosterDays}
            dayOptions={rosterDayOptions}
            onSearchChange={setStudentSearch}
            onGenderChange={setGenderFilter}
            onTrackToggle={(trackId) =>
              setSelectedRosterTrackIds((current) => {
                const allTrackIds = tracks.map((track) => track.id);
                if (trackId === "select_all") {
                  return allTrackIds;
                }
                if (trackId === "deselect_all") {
                  return [];
                }
                return current.includes(trackId) ? current.filter((id) => id !== trackId) : [...current, trackId];
              })
            }
            onDayToggle={(day) =>
              setSelectedRosterDays((current) => {
                const allDays = rosterDayOptions.length ? rosterDayOptions : [...scheduleDayOptions];
                if (day === "select_all") {
                  return allDays;
                }
                if (day === "deselect_all") {
                  return [];
                }
                return current.includes(day) ? current.filter((item) => item !== day) : [...current, day];
              })
            }
            onSortChange={setStudentSort}
            onSortDirectionChange={setSortDirection}
            onViewChange={(view) => {
              setStudentView(view);
              if (view === "parents") {
                setGenderFilter("all");
              }
            }}
          />
          <p className="text-xs font-medium text-[#6B747B]">
            Showing {resultCount} {resultCount === 1 ? "result" : "results"}
          </p>
          {hasVisibleStudents ? (
            <div className="divide-y divide-[#EEF2F4]">
              {studentView === "parents" ? (
              familyGroups.map((group) => (
                <TeacherFamilyRow
                  key={group.parent?.id ?? group.children[0]?.enrollment.id}
                  group={group}
                  busyStudentId={busyStudentId}
                  onKick={(student) => {
                    setKickTarget({
                      studentId: student.enrollment.student_profile_id,
                      studentName: student.profile?.full_name ?? "this student",
                      subscription: student.subscription ?? null,
                    });
                    setShowKickMessage(false);
                    setKickMessage("");
                  }}
                  onNote={(student) => {
                    if (student.parent) {
                      setNoteTarget({ item: student });
                      return;
                    }
                    router.push(notesHref(student.enrollment.student_profile_id));
                  }}
                />
              ))
              ) : (
              filteredStudents.map((student) => (
                <TeacherStudentRow
                  key={student.enrollment.id}
                  item={student}
                  busy={busyStudentId === student.enrollment.student_profile_id}
                  onKick={() => {
                    setKickTarget({
                      studentId: student.enrollment.student_profile_id,
                      studentName: student.profile?.full_name ?? "this student",
                      subscription: student.subscription ?? null,
                    });
                    setShowKickMessage(false);
                    setKickMessage("");
                  }}
                  onNote={() => {
                    if (student.parent) {
                      setNoteTarget({ item: student });
                      return;
                    }
                    router.push(notesHref(student.enrollment.student_profile_id));
                  }}
                />
              ))
              )}
            </div>
          ) : (
            <EmptyState title={students.length ? "No matching students" : "No enrolled students"} text={students.length ? "Adjust the search or filters." : "Accepted students will appear here."} />
          )}
        </section>

        {!cameFrom && waitlist.length ? (
          <section className="space-y-3">
            <HomeSectionTitle title="Waitlist" />
            {waitlist.map((request) => (
              <TeacherRequestCard
                key={request.id}
                request={request}
                onAccept={() => setReviewTarget({ request, action: "approved" })}
                onReject={() => setReviewTarget({ request, action: "rejected" })}
              />
            ))}
          </section>
        ) : null}
        {!cameFrom && program ? <ProgramStudentInviteTools program={program} /> : null}
      </div>
      {reviewTarget ? (
        <ApplicationDecisionModal
          target={reviewTarget}
          busy={reviewBusy}
          onClose={() => {
            if (!reviewBusy) {
              setReviewTarget(null);
            }
          }}
          onSubmit={(options) => reviewWaitlistedRequest(reviewTarget.request, reviewTarget.action, options)}
        />
      ) : null}
      {kickTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-6 backdrop-blur-sm">
          <div ref={kickModalRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
            {hasActiveRecurringSubscription(kickTarget.subscription ?? null) ? (
              <>
                <h2 className="text-xl font-semibold">End subscription first</h2>
                <p className="mt-2 text-sm leading-6 text-[#6B747B]">
                  {kickTarget.studentName} has an active subscription in {program.title}. You must end it in finances before removing the student from class.
                </p>
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setKickTarget(null)}
                    className="px-2 py-2 text-sm font-semibold text-[#6B747B]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`${typeof window !== "undefined" && window.location.pathname.startsWith(`/m/${slug}/admin/`) ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`}/${programId}/finances`)}
                    className="rounded-full bg-[#17624F] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#104C3E]"
                  >
                    Go to Finances
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold">Remove from class?</h2>
                <p className="mt-2 text-sm leading-6 text-[#6B747B]">
                  {kickTarget.studentName} will be marked as kicked from {program.title}. This keeps the finance record for audit history and sends a notification in their inbox.
                </p>
                <button
                  type="button"
                  onClick={() => setShowKickMessage((value) => !value)}
                  className="mt-4 text-sm font-semibold text-[#2F8FB3] underline-offset-4 hover:underline"
                >
                  {showKickMessage ? "Remove message" : "Add message"}
                </button>
                {showKickMessage ? (
                  <textarea
                    value={kickMessage}
                    onChange={(event) => setKickMessage(event.target.value)}
                    placeholder={`Optional message. Default: You were removed from ${program.title}.`}
                    className="mt-3 min-h-24 w-full resize-none rounded-2xl border border-[#D6DCE0] bg-[#F8FAFB] px-4 py-3 text-sm leading-6 text-[#26323A] outline-none focus:border-[#2F8FB3]"
                  />
                ) : null}
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setKickTarget(null);
                      setShowKickMessage(false);
                      setKickMessage("");
                    }}
                    className="px-2 py-2 text-sm font-semibold text-[#6B747B]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => kickStudent(kickTarget.studentId, kickMessage)}
                    disabled={busyStudentId === kickTarget.studentId}
                    className="rounded-full bg-[#FCE8E4] px-5 py-2.5 text-sm font-semibold text-[#C83F31] transition-colors hover:bg-[#F9D8D1] disabled:opacity-60"
                  >
                    {busyStudentId === kickTarget.studentId ? "Removing..." : "Remove from class"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {noteTarget?.item.parent && !noteTarget.confirmedParent ? (
        <ChildNoteRecipientPrompt
          studentName={noteTarget.item.profile?.full_name ?? "this child"}
          parentName={noteTarget.item.parent.full_name ?? "parent"}
          onClose={() => setNoteTarget(null)}
          onGoToParent={() => router.push(notesHref(noteTarget.item.enrollment.student_profile_id))}
        />
      ) : null}
    </div>
  );
}

function AdminMemberTeacherClassList({
  contexts,
  canCreatePrograms,
  synthetic,
  busyId,
  onToggleClassCreation,
  onToggleFinance,
}: {
  contexts: AdminMemberTeacherClassContext[];
  canCreatePrograms: boolean;
  synthetic: boolean;
  busyId: string | null;
  onToggleClassCreation: () => void;
  onToggleFinance: (context: AdminMemberTeacherClassContext) => void;
}) {
  return (
    <div className="mt-3 rounded-[18px] bg-[#F7FAFB] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Involved Classes</p>
      {contexts.length === 0 ? (
        <p className="mt-1 text-sm font-semibold text-[#26323A]">Not assigned to any classes.</p>
      ) : (
        <div className="mt-2 divide-y divide-[#E3E8EC]">
          {contexts.map((context) => {
            const isDirector = context.assignment.role === "director";
            return (
              <div key={context.assignment.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#26323A]">{context.program?.title ?? "Class"}</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-[#6B747B]">{isDirector ? "Director" : "Instructor"}</p>
                </div>
                {isDirector ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <PermissionIconButton
                      label={canCreatePrograms ? "Class creation active" : "Class creation inactive"}
                      active={canCreatePrograms}
                      disabled={synthetic || busyId === context.assignment.id}
                      icon="class"
                      onClick={onToggleClassCreation}
                    />
                    <PermissionIconButton
                      label={context.assignment.can_manage_finances ? "Finance access active" : "Finance access inactive"}
                      active={context.assignment.can_manage_finances}
                      disabled={busyId === context.assignment.id}
                      icon="finance"
                      onClick={() => onToggleFinance(context)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[#7B858C]">
        <span className="inline-flex items-center gap-1"><PermissionClassIcon /> Class creation</span>
        <span className="inline-flex items-center gap-1"><FinanceIcon /> Finances</span>
      </div>
    </div>
  );
}

function PermissionIconButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: "class" | "finance";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border transition disabled:opacity-45",
        active ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#CAD4DA] bg-white text-[#8A949B]",
      )}
      aria-label={label}
      title={label}
    >
      {icon === "class" ? <PermissionClassIcon /> : <FinanceIcon />}
    </button>
  );
}

function AdminTeacherPermissionModal({
  target,
  onCancel,
  onConfirm,
}: {
  target:
    | { type: "class_creation"; member: AdminMember; enabled: boolean }
    | { type: "finance"; member: AdminMember; context: AdminMemberTeacherClassContext; enabled: boolean };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const teacherName = target.member.profile?.full_name || target.member.profile?.email || "this teacher";
  const permission = target.type === "class_creation" ? "class creation" : "finance management";
  const className = target.type === "finance" ? target.context.program?.title ?? "this class" : null;
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onCancel);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-full", target.enabled ? "bg-[#E8F7F2] text-[#17624F]" : "bg-[#F3F6F8] text-[#52616A]")}>
          {target.type === "class_creation" ? <PermissionClassIcon /> : <FinanceIcon />}
        </div>
        <h2 className="mt-4 text-xl font-semibold">{target.enabled ? "Enable" : "Disable"} {permission}?</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          {target.enabled ? "Allow" : "Remove"} {permission} for {teacherName}
          {className ? ` on ${className}` : ""}.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]">Cancel</button>
          <button type="button" onClick={onConfirm} className="min-h-10 rounded-[10px] bg-[#17624F] px-4 text-sm font-semibold text-white">Confirm</button>
        </div>
      </div>
    </div>,
    document.body,
  );
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
type FinanceRowMenuAction = FinanceAction | "view_details" | "add_note";

type FinanceChargeRow = {
  id: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  receiptUrl: string | null;
  taxReceiptStatus: string;
  taxReceiptEligibleAmountCents: number | null;
  taxReceiptNumber: string | null;
};

type FinanceActionEndpoint = "waive" | "change-price" | "end-subscription" | "payment-history";

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

  const response = await fetch(`/api/programs/${programId}/finance/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    return { ok: false, error: result.error ?? "Something went wrong." };
  }
  return { ok: true, data: result };
}

async function updateTaxReceiptStatus(
  programId: string,
  paymentId: string,
  payload: { status: string; number?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, error: "Please sign in again to continue." };
  }

  const response = await fetch(`/api/programs/${programId}/finance/payments/${paymentId}/tax-receipt`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    return { ok: false, error: result.error ?? "Something went wrong." };
  }
  return { ok: true };
}

function TaxReceiptStatusControl({
  programId,
  payment,
  onUpdated,
}: {
  programId: string;
  payment: FinanceChargeRow;
  onUpdated: (paymentId: string, fields: Partial<FinanceChargeRow>) => void;
}) {
  const [status, setStatus] = useState(payment.taxReceiptStatus);
  const [number, setNumber] = useState(payment.taxReceiptNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = status !== payment.taxReceiptStatus || number !== (payment.taxReceiptNumber ?? "");

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await updateTaxReceiptStatus(programId, payment.id, { status, number: number.trim() || null });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onUpdated(payment.id, { taxReceiptStatus: status, taxReceiptNumber: number.trim() || null });
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-[#7B858C]">Tax receipt</span>
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="h-7 rounded-full border border-[#D6DCE0] bg-white px-2 text-xs font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]"
      >
        <option value="not_applicable">Not applicable</option>
        <option value="admin_review_required">Under review</option>
        <option value="eligible_pending_issue">Eligible - pending issue</option>
        <option value="issued">Issued</option>
        <option value="partial_issued">Partially issued</option>
        <option value="not_eligible">Not eligible</option>
        <option value="contact_admin">Contact administration</option>
      </select>
      {status === "issued" || status === "partial_issued" ? (
        <input
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="Receipt #"
          className="h-7 w-24 rounded-full border border-[#D6DCE0] bg-white px-2 text-xs font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]"
        />
      ) : null}
      {dirty ? (
        <button type="button" onClick={() => void handleSave()} disabled={busy} className="h-7 rounded-full bg-[#17624F] px-2.5 text-xs font-semibold text-white disabled:opacity-60">
          {busy ? "Saving..." : "Save"}
        </button>
      ) : null}
      {error ? <span className="w-full text-xs text-[#C0392B]">{error}</span> : null}
    </div>
  );
}

export function ProgramFinancesData({ slug, programId, mode = "teacher" }: { slug: string; programId: string; mode?: "teacher" | "admin" }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [rows, setRows] = useState<FinanceEnrollmentRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<ProgramFinanceAuditEvent[]>([]);
  const [auditActorsById, setAuditActorsById] = useState<Record<string, Profile>>({});
  const [search, setSearch] = useState("");
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadFinanceRows();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, slug, mode]);

  // One RPC call instead of mosque+profile -> program -> [membership+director-assignment
  // access check] -> [5-way batch] -> parent_child_links -> profiles, as seven sequential
  // stages.
  async function loadFinanceRows() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const session = await loadCachedSession();
    const userId = session?.user.id ?? null;
    if (!userId) {
      setError("Log in required.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_program_finances_snapshot", { p_slug: slug, p_program_id: programId });
    if (error) {
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
    setRows(
      enrollmentRows.map((enrollment) => {
        const request = requestRows.find((item) => item.student_profile_id === enrollment.student_profile_id) ?? null;
        const subscription = subscriptionRows.find((item) => item.student_profile_id === enrollment.student_profile_id) ?? null;
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
      }),
    );
    setAuditEvents(auditRows);
    setAuditActorsById(Object.fromEntries(profileRows.filter((profile) => auditActorIds.includes(profile.id)).map((profile) => [profile.id, profile])));
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
      return [row.student?.full_name, row.parent?.full_name, row.student?.email, row.parent?.email, payment, status, payStatus, subStatus]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [genderFilter, payStatusFilter, paymentFilter, program, rows, search, statusFilter, subStatusFilter, typeFilter]);

  const activeRows = rows.filter((row) => financeStatus(row) === "Active");
  const monthlySumCents = activeRows.reduce((sum, row) => sum + financeMonthlyAmountCents(row, program), 0);

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  if (error && !program) {
    return <EmptyState title="Could not load finances" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This class could not be loaded." />;
  }

  if (error) {
    return <EmptyState title="Finance access unavailable" text={error} />;
  }

  return (
    <section className="space-y-5 bg-white px-4 pb-28 pt-4 text-[#26323A]">
      <div className="rounded-[28px] bg-[#17624F] p-5 text-white shadow-[0_18px_45px_rgba(23,98,79,0.22)]">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="mt-0 text-2xl font-semibold leading-7">{program.title}</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <FinanceSummaryFigure value={rows.length.toString()} label="Total records" />
            <FinanceSummaryFigure value={activeRows.length.toString()} label="Active students" />
            <FinanceSummaryFigure value={formatCurrencyAmount(monthlySumCents)} label="Monthly sum" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 text-[#6B747B] md:max-w-xl">
          <SearchIcon />
          <input aria-label="Search finance records" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#26323A] outline-none" />
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
          <CompactFinanceSelect label="Payment type" value={paymentFilter} options={["waived", "paid externally", "monthly", program.is_ongoing ? "annual subscription" : "pay in full"]} labels={{ "pay in full": "Pay in Full", "annual subscription": "Annual Subscription" }} onChange={setPaymentFilter} />
          <CompactFinanceSelect label="Type" value={typeFilter} options={["adult", "child"]} labels={{ adult: "Adult student", child: "Child student" }} onChange={setTypeFilter} />
          <CompactFinanceSelect label="Gender" value={genderFilter} options={["male", "female"]} labels={{ male: "Brothers", female: "Sisters" }} onChange={setGenderFilter} />
        </div>
      ) : null}

      <div className="flex items-center justify-between px-1 text-sm font-semibold text-[#6B747B]">
        <span>Showing {filteredRows.length} of {rows.length} records</span>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-[#E1E8EC] bg-white shadow-[0_14px_38px_rgba(38,50,58,0.08)]">
        <div className="overflow-x-auto">
          <table className="min-w-[1340px] w-full text-left text-sm">
            <thead className="bg-[#F7FAFB] text-[11px] font-semibold uppercase tracking-wide text-[#7B858C]">
              <tr>
                {["Student", "Parent", "Payment Type", "Price", "Enrollment Status", "Payment Status", "Subscription Status", "Current Period", "Next Billing / Ends On", "Date Joined", "Approved By", "Actions"].map((column) => (
                  <th key={column} className="px-4 py-3">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F4]">
              {filteredRows.map((row) => (
                <tr key={row.enrollment.id} className="align-middle">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-[#26323A]">{row.student?.full_name || "Student"}</p>
                    <p className="mt-0.5 text-xs text-[#7B858C]">{financeStudentSubtitle(row)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-[#26323A]">{row.parent?.full_name || "---"}</p>
                    <p className="mt-0.5 text-xs text-[#7B858C]">{row.parent?.email || "---"}</p>
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
                  <td className="px-4 py-4 text-[#52616A]">{formatFinanceDate(row.enrollment.created_at)}</td>
                  <td className="px-4 py-4 text-[#52616A]">{row.approver?.full_name ?? row.approver?.email ?? "---"}</td>
                  <td className="px-4 py-4">
                    <FinanceRowActionMenu
                      row={row}
                      onSelect={(action) => {
                        if (action === "view_details") {
                          setDetailsTarget(row);
                          return;
                        }
                        if (action === "add_note") {
                          setNoteTarget(row);
                          return;
                        }
                        setActionTarget({ row, action });
                      }}
                    />
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-sm font-semibold text-[#7B858C]">No matching finance rows.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Link href={`${mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`}/${programId}/finances/audit`} className="inline-flex min-h-11 items-center rounded-full bg-[#EEF6F7] px-4 text-sm font-semibold text-[#17624F]">
        View audit trail{auditEvents.length ? ` (${auditEvents.length})` : ""}
      </Link>

      {actionTarget ? (
        <FinanceActionModal
          row={actionTarget.row}
          action={actionTarget.action}
          program={program}
          onClose={() => setActionTarget(null)}
          onSuccess={() => void loadFinanceRows()}
        />
      ) : null}

      {detailsTarget ? (
        <FinanceDetailsDrawer
          row={detailsTarget}
          program={program}
          slug={slug}
          mode={mode}
          onClose={() => setDetailsTarget(null)}
        />
      ) : null}

      {noteTarget ? (
        <FinanceAddNoteModal
          row={noteTarget}
          program={program}
          onClose={() => setNoteTarget(null)}
          onSuccess={() => void loadFinanceRows()}
        />
      ) : null}
    </section>
  );
}

function FinanceRowActionMenu({ row, onSelect }: { row: FinanceEnrollmentRow; onSelect: (action: FinanceRowMenuAction) => void }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const studentName = row.student?.full_name || "student";
  const menuItems = [
    { action: "view_details" as const, label: "View details" },
    { action: "change_price" as const, label: "Send new checkout link" },
    { action: "waive" as const, label: "Waive future payments" },
    hasActiveRecurringSubscription(row.subscription) ? { action: "end_subscription" as const, label: "End subscription" } : null,
    { action: "add_note" as const, label: "Add note" },
  ].filter((item): item is { action: FinanceRowMenuAction; label: string } => Boolean(item));

  function updateMenuPosition() {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 232;
    const menuHeight = 232;
    const gap = 8;
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
    const below = rect.bottom + gap;
    const top = below + menuHeight > window.innerHeight ? Math.max(12, rect.top - menuHeight - gap) : below;
    setMenuPosition({ top, left });
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    updateMenuPosition();
    function closeOnPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && buttonRef.current?.contains(target)) {
        return;
      }
      const menu = document.getElementById(`finance-action-menu-${row.enrollment.id}`);
      if (target && menu?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    document.addEventListener("mousedown", closeOnPointerDown);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("mousedown", closeOnPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row.enrollment.id]);

  return (
    <div className="inline-flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          updateMenuPosition();
          setOpen((current) => !current);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F6] text-[#26323A] transition-colors hover:bg-[#E3ECEF]"
        aria-label={`Open finance actions for ${studentName}`}
      >
        <MoreVerticalIcon />
      </button>
      {open && menuPosition
        ? createPortal(
            <div
              id={`finance-action-menu-${row.enrollment.id}`}
              className="fixed z-[80] w-[232px] rounded-[18px] border border-[#E1E8EC] bg-white p-1.5 text-sm shadow-[0_22px_60px_rgba(38,50,58,0.20)]"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {menuItems.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelect(item.action);
                  }}
                  className="flex min-h-10 w-full items-center rounded-[13px] px-3 text-left font-semibold text-[#52616A] transition-colors hover:bg-[#F4F8F9] hover:text-[#26323A]"
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function FinanceSummaryFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold leading-none text-white md:text-4xl">{value}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">{label}</p>
    </div>
  );
}

function FinanceSelect({ label, value, options, labels = {}, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-[14px] border border-[#D6DCE0] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#26323A] outline-none">
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>{labels[option] ?? titleCase(option)}</option>
        ))}
      </select>
    </label>
  );
}

function FinanceActionModal({
  row,
  action,
  program,
  onClose,
  onSuccess,
}: {
  row: FinanceEnrollmentRow;
  action: FinanceAction;
  program: Program;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const initialPriceCents =
    row.paymentTerms?.amount_cents ??
    row.subscription?.amount_cents ??
    row.request?.approved_price_monthly_cents ??
    row.request?.approved_price_annual_cents ??
    program.price_monthly_cents ??
    program.price_annual_cents ??
    0;
  const [price, setPrice] = useState((initialPriceCents / 100).toFixed(2).replace(/\.00$/, ""));
  const [billingMode, setBillingMode] = useState<"monthly" | "one_time">(row.paymentTerms?.payment_type === "pay_in_full" || row.subscription?.payment_type === "annual" ? "one_time" : "monthly");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [timing, setTiming] = useState<"period_end" | "immediate">("period_end");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const studentProfileId = row.enrollment.student_profile_id;
  const hasActiveSubscription = hasActiveRecurringSubscription(row.subscription);

  const modalTitle = action === "waive" ? "Waive Future Payments" : action === "change_price" ? "Send New Checkout Link" : "End Subscription";
  const modalText =
    action === "waive"
      ? "This will stop future payment requirements for this student. Past payments will not be changed. The student will remain enrolled."
      : action === "change_price"
        ? "This creates a new Stripe checkout link for this student. Past payments will not be changed."
        : "This stops the Stripe subscription. It does not remove the student from the class.";

  async function handleWaive() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callFinanceAction(program.id, "waive", { studentProfileId, timing, reason: reason.trim(), note: note.trim() || undefined });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  }

  async function handleChangePrice() {
    const amountCents = Math.round(parseFloat(price) * 100);
    if (!amountCents || Number.isNaN(amountCents) || amountCents < 50) {
      setError("Enter a valid price.");
      return;
    }
    if (hasActiveSubscription) {
      setError("End the current subscription before sending a new checkout link.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callFinanceAction<{ url: string }>(program.id, "change-price", {
      studentProfileId,
      amountCents,
      billingMode,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    setCheckoutUrl(result.data.url);
  }

  async function handleEndSubscription() {
    setBusy(true);
    setError(null);
    const result = await callFinanceAction(program.id, "end-subscription", { studentProfileId, timing });
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
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
        <h2 className="mt-1 text-xl font-semibold">{modalTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">{row.student?.full_name || "Student"} - {modalText}</p>

        <div className="mt-5 grid gap-3">
          {action === "waive" ? (
            <>
              {hasActiveSubscription ? (
                <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#D6DCE0]">
                  {(
                    [
                      ["period_end", "After current period"],
                      ["immediate", "Immediately"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={busy}
                      onClick={() => setTiming(value)}
                      className={cn("px-3 py-2 text-xs font-semibold disabled:opacity-60", timing === value ? "bg-[#17624F] text-white" : "bg-white text-[#52616A]")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">
                Reason (required)
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={busy}
                  rows={2}
                  placeholder="e.g. Financial hardship approved by director"
                  className="rounded-[10px] border border-[#B9C3C8] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:opacity-60"
                />
              </label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">
                Internal note (optional)
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={busy}
                  placeholder="e.g. Parent requested discount due to sibling enrollment"
                  className="h-10 rounded-[10px] border border-[#B9C3C8] px-3 text-sm font-semibold normal-case tracking-normal text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:opacity-60"
                />
              </label>
            </>
          ) : null}
          {action === "change_price" ? (
            <div className="grid gap-3">
              {hasActiveSubscription ? (
                <div className="rounded-[14px] border border-[#F3D9A6] bg-[#FFF7E6] p-3 text-xs leading-5 text-[#8A5A00]">
                  <p className="font-semibold">This student already has an active subscription.</p>
                  <p className="mt-1">End the current subscription first, then send a new checkout link. This avoids double billing and keeps Stripe aligned with the student&apos;s payment terms.</p>
                </div>
              ) : null}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={busy || Boolean(checkoutUrl)}
                  inputMode="decimal"
                  className="h-11 rounded-[10px] border border-[#B9C3C8] px-3 text-sm font-semibold outline-none focus:border-[#2F8FB3] disabled:opacity-60"
                />
                <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#D6DCE0]">
                  {(["monthly", "one_time"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={busy || Boolean(checkoutUrl) || (mode === "one_time" && Boolean(program.is_ongoing))}
                      onClick={() => setBillingMode(mode)}
                      className={cn("px-3 text-xs font-semibold disabled:opacity-60", billingMode === mode ? "bg-[#17624F] text-white" : "bg-white text-[#52616A]")}
                    >
                      {mode === "monthly" ? "Monthly" : "One-time"}
                    </button>
                  ))}
                </div>
              </div>
              {program.is_ongoing ? <p className="text-xs leading-5 text-[#7B858C]">Ongoing programs only support monthly billing.</p> : null}
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">
                Internal note (optional)
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={busy || Boolean(checkoutUrl)}
                  placeholder="e.g. Sibling discount applied"
                  className="h-10 rounded-[10px] border border-[#B9C3C8] px-3 text-sm font-semibold normal-case tracking-normal text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:opacity-60"
                />
              </label>
              {checkoutUrl ? (
                <div className="rounded-[14px] border border-[#D6DCE0] bg-[#F8FAFB] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">New checkout link</p>
                  <p className="mt-1 break-all text-sm font-semibold text-[#26323A]">{checkoutUrl}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(checkoutUrl);
                      setCopied(true);
                    }}
                    className="mt-2 min-h-9 rounded-[10px] bg-[#17624F] px-3 text-xs font-semibold text-white"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-[#7B858C]">Share this link with the family directly - it is not emailed automatically.</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {action === "end_subscription" ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#D6DCE0]">
                {(
                  [
                    ["period_end", "End at period end"],
                    ["immediate", "End immediately"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    onClick={() => setTiming(value)}
                    className={cn("px-3 py-2 text-xs font-semibold disabled:opacity-60", timing === value ? "bg-[#17624F] text-white" : "bg-white text-[#52616A]")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleEndSubscription}
                className="min-h-10 rounded-[10px] bg-[#26323A] px-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {busy ? "Ending subscription..." : timing === "immediate" ? "End subscription now" : "End at period end"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs font-semibold text-[#C0392B]">{error ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]">Close</button>
            {action === "waive" ? (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={handleWaive}
                className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {busy ? "Waiving..." : "Waive future payments"}
              </button>
            ) : null}
            {action === "change_price" && !checkoutUrl ? (
              <button
                type="button"
                disabled={busy || hasActiveSubscription}
                onClick={handleChangePrice}
                className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {busy ? "Generating..." : "Send checkout link"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FinanceDetailsDrawer({
  row,
  program,
  slug,
  mode,
  onClose,
}: {
  row: FinanceEnrollmentRow;
  program: Program;
  slug: string;
  mode: "teacher" | "admin";
  onClose: () => void;
}) {
  const studentProfileId = row.enrollment.student_profile_id;
  const [history, setHistory] = useState<FinanceChargeRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [studentEvents, setStudentEvents] = useState<ProgramFinanceAuditEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useHideMobileChromeWhileMounted();

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setHistoryLoading(true);
      setHistoryError(null);
      void callFinanceAction<{ charges: FinanceChargeRow[] }>(program.id, "payment-history", { studentProfileId }).then((result) => {
        if (cancelled) {
          return;
        }
        setHistoryLoading(false);
        if (!result.ok) {
          setHistoryError(result.error);
          return;
        }
        setHistory(result.data.charges ?? []);
      });

      setEventsLoading(true);
      const supabase = createSupabaseBrowserClient();
      void supabase
        .from("program_finance_audit_events")
        .select("*")
        .eq("program_id", program.id)
        .eq("student_profile_id", studentProfileId)
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
  }, [program.id, studentProfileId]);

  const checkoutLinkStatus = row.subscription?.status === "checkout_started" ? "Checkout sent, awaiting completion" : "No pending checkout";
  const basePath = mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex justify-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <div className="flex items-center justify-between border-b border-[#EEF2F4] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
            <h2 className="mt-1 text-lg font-semibold">{row.student?.full_name || "Student"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F6] text-[#26323A] hover:bg-[#E3ECEF]">
            <XIcon />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section className="grid gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Student type</span>
              <span className="font-semibold">{financeStudentSubtitle(row)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Parent</span>
              <span className="font-semibold">{row.parent?.full_name || "Self"}</span>
            </div>
            {row.parent?.email ? (
              <div className="flex items-center justify-between">
                <span className="text-[#6B747B]">Parent email</span>
                <span className="font-semibold">{row.parent.email}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Enrollment status</span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financeStatus(row))))}>{financeStatus(row)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Payment type</span>
              <span className="font-semibold">{financePaymentType(row, program)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Approved price</span>
              <span className="font-semibold">{financePrice(row, program)}</span>
            </div>
            {row.paymentTerms ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Payment terms</span>
                  <span className="font-semibold">{financePaymentTermsStatusLabel(row.paymentTerms)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Billing cycle</span>
                  <span className="font-semibold">{financeBillingCycleLabel(row.paymentTerms)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[#6B747B]">Payment terms</span>
                <span className="font-semibold">Legacy record</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Payment status</span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financePaymentStatus(row, program))))}>{financePaymentStatus(row, program)}</span>
            </div>
          </section>

          <section className="grid gap-1 rounded-[16px] border border-[#E1E8EC] bg-[#FAFCFC] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Subscription status</span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financeSubscriptionStatus(row))))}>{financeSubscriptionStatus(row)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Current period</span>
              <span className="font-semibold">{financeCurrentPeriodLabel(row)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Next billing / ends on</span>
              <span className="font-semibold">{financeNextBillingLabel(row)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Checkout link</span>
              <span className="font-semibold">{checkoutLinkStatus}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Terms history</span>
              <span className="font-semibold">{row.paymentTermsHistory.length || 0}</span>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#26323A]">Payment History</h3>
            {historyLoading ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">Loading payment history...</div>
            ) : historyError ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#C0392B]">{historyError}</div>
            ) : !history?.length ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">No payments recorded yet.</div>
            ) : (
              <div className="divide-y divide-[#EEF2F4]">
                {history.map((charge) => (
                  <div key={charge.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#26323A]">{formatCurrencyAmount(charge.amountCents)}</p>
                      <span className="rounded-full bg-[#EAF8EF] px-2 py-0.5 text-xs font-semibold text-[#258A43]">Paid</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#7B858C]">
                      {formatFinanceDate(charge.createdAt)}
                      {charge.receiptUrl ? (
                        <>
                          {" - "}
                          <a href={charge.receiptUrl} target="_blank" rel="noreferrer" className="underline">
                            Receipt
                          </a>
                        </>
                      ) : null}
                    </p>
                    {program.tax_receipt_policy !== "not_applicable" ? (
                      <TaxReceiptStatusControl
                        programId={program.id}
                        payment={charge}
                        onUpdated={(paymentId, fields) =>
                          setHistory((current) => current?.map((item) => (item.id === paymentId ? { ...item, ...fields } : item)) ?? current)
                        }
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#26323A]">Audit Trail</h3>
            {eventsLoading ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">Loading activity...</div>
            ) : !studentEvents?.length ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">No finance activity for this student yet.</div>
            ) : (
              <div className="divide-y divide-[#EEF2F4]">
                {studentEvents.map((event) => (
                  <div key={event.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      {event.event_type === "manual_note" ? (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", programStatusBadgeToneClass("neutral"))}>Note</span>
                      ) : null}
                      <p className="text-sm font-semibold text-[#26323A]">{event.summary}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-[#7B858C]">{formatFinanceDate(event.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="mt-auto border-t border-[#EEF2F4] px-5 py-4">
          {hasActiveRecurringSubscription(row.subscription) ? (
            <p className="mb-3 rounded-[12px] border border-[#F3D9A6] bg-[#FFF7E6] p-3 text-xs font-semibold leading-5 text-[#8A5A00]">
              This student has an active subscription. End or waive billing before removing them from the class.
            </p>
          ) : null}
          <Link
            href={`${basePath}/${program.id}/students?from=finances&studentId=${studentProfileId}`}
            className="text-sm font-semibold text-[#17624F] hover:underline"
          >
            Manage class enrollment →
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FinanceAddNoteModal({
  row,
  program,
  onClose,
  onSuccess,
}: {
  row: FinanceEnrollmentRow;
  program: Program;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const text = note.trim();
    if (!text) {
      setError("Enter a note before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("Please sign in again to continue.");
      return;
    }
    const { error: insertError } = await supabase.from("program_finance_audit_events").insert({
      program_id: program.id,
      student_profile_id: row.enrollment.student_profile_id,
      actor_profile_id: user.id,
      event_type: "manual_note",
      summary: text,
      metadata: {},
    });
    setBusy(false);
    if (insertError) {
      setError(friendlyErrorMessage(insertError, "Could not save this note."));
      return;
    }
    onSuccess();
    onClose();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useHideMobileChromeWhileMounted();
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
        <h2 className="mt-1 text-xl font-semibold">Add Note</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">{row.student?.full_name || "Student"} - Internal note, visible only to Directors and Admins.</p>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
          rows={4}
          placeholder="e.g. Parent requested discount due to sibling enrollment."
          className="mt-4 w-full rounded-[14px] border border-[#B9C3C8] px-3 py-2 text-sm font-semibold outline-none focus:border-[#2F8FB3] disabled:opacity-60"
        />

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs font-semibold text-[#C0392B]">{error ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]">Close</button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save note"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FinanceWorkflowBlock({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-[#E1E8EC] bg-[#FAFCFC] p-4">
      <h3 className="text-sm font-semibold text-[#26323A]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[#6B747B]">{text}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function applicationPaymentPlanLabel(row: { request: EnrollmentRequest; track: ProgramTrack | null }, program: Program | null) {
  if (!program?.is_paid) {
    return "Free";
  }
  if (row.request.payment_bypassed) {
    return row.request.payment_bypass_external ? "Paid externally" : "Waived after approval";
  }
  return row.request.payment_type === "annual" ? (program.is_ongoing ? "Annual subscription" : "Pay in Full") : "Monthly subscription";
}

export function applicationListedPrice(row: { request: EnrollmentRequest; track: ProgramTrack | null }, program: Program | null) {
  if (row.request.payment_bypassed) {
    return row.request.payment_bypass_external ? "Paid externally" : "Waived";
  }
  if (!program?.is_paid) {
    return "Free";
  }
  const isAnnual = row.request.payment_type === "annual";
  const cents = isAnnual
    ? row.request.approved_price_annual_cents ?? row.track?.price_annual_cents ?? program.price_annual_cents
    : row.request.approved_price_monthly_cents ?? row.track?.price_monthly_cents ?? program.price_monthly_cents;
  return formatPrice(cents);
}

export function ProgramApplicationsData({ slug, programId, mode = "teacher" }: { slug: string; programId: string; mode?: "teacher" | "admin" }) {
  const searchParams = useSearchParams();
  const [program, setProgram] = useState<Program | null>(null);
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<ProgramFinanceAuditEvent[]>([]);
  const [auditActorsById, setAuditActorsById] = useState<Record<string, Profile>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payStatusFilter, setPayStatusFilter] = useState("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [detailsTarget, setDetailsTarget] = useState<ApplicationRow | null>(null);
  const [trackSwitchRequests, setTrackSwitchRequests] = useState<ProgramTrackSwitchRequestWithContext[]>([]);
  const [switchRequestBusyId, setSwitchRequestBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadApplications();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, slug, mode]);

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
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const session = await loadCachedSession();
    const userId = session?.user.id ?? null;
    if (!userId) {
      setError("Log in required.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_program_applications_snapshot", { p_slug: slug, p_program_id: programId });
    if (error) {
      setError(friendlyErrorMessage(error, "Could not load applications."));
      setLoading(false);
      return;
    }

    const snapshot = data as unknown as {
      error: string | null;
      program: Program | null;
      canManage: boolean;
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

    if (!snapshot.canManage) {
      setProgram(snapshot.program);
      setRows([]);
      setAuditEvents([]);
      setAuditActorsById({});
      setError("You don't have permission to manage applications for this class.");
      setLoading(false);
      return;
    }

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

    const auditActorIds = Array.from(new Set(auditRows.map((event) => event.actor_profile_id).filter(Boolean) as string[]));

    setProgram(programRow);
    setTracks(trackRows);
    setRows(
      requestRows.map((request) => ({
        request,
        student: profileRows.find((profile) => profile.id === request.student_profile_id) as StudentDisplay | null,
        parent: request.parent_profile_id ? (profileRows.find((profile) => profile.id === request.parent_profile_id) as ParentDisplay | undefined) ?? null : null,
        track: resolveRequestTrack(request, requestTrackIdsByRequestId, trackRows),
        subscription: subscriptionRows.find((subscription) => subscription.student_profile_id === request.student_profile_id) ?? null,
        approver: request.reviewed_by ? (profileRows.find((profile) => profile.id === request.reviewed_by) as Profile | undefined) ?? null : null,
      })),
    );
    setAuditEvents(auditRows);
    setAuditActorsById(Object.fromEntries(profileRows.filter((profile) => auditActorIds.includes(profile.id)).map((profile) => [profile.id, profile])));
    setTrackSwitchRequests(
      switchRows.map((request) => ({
        ...request,
        program: programRow,
        student: profileRows.find((profile) => profile.id === request.student_profile_id) as StudentDisplay | null,
      })),
    );
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
      return [row.student?.full_name, row.parent?.full_name, row.student?.email, row.parent?.email]
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

  if (error) {
    return <EmptyState title="Applications unavailable" text={error} />;
  }

  return (
    <section className="space-y-5 bg-white px-4 pb-28 pt-4 text-[#26323A]">
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
                onApprove={() => void decideTrackSwitchRequest(request.id, "approved")}
                onReject={() => void decideTrackSwitchRequest(request.id, "rejected")}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#26323A]">Audit Trail</h2>
          <span className="rounded-full bg-[#EEF6F7] px-2.5 py-1 text-xs font-semibold text-[#17624F]">{auditEvents.length}</span>
        </div>
        <div className="divide-y divide-[#EEF2F4]">
          {auditEvents.length ? (
            auditEvents.map((event) => (
              <div key={event.id} className="py-3">
                <div className="flex items-center gap-2">
                  {event.event_type === "manual_note" ? (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", programStatusBadgeToneClass("neutral"))}>Note</span>
                  ) : null}
                  <p className="text-sm font-semibold text-[#26323A]">{financeAuditSummaryWithActor(event, auditActorsById)}</p>
                </div>
                <p className="mt-0.5 text-xs text-[#7B858C]">{formatFinanceDate(event.created_at)} - {event.event_type.replace(/_/g, " ")}</p>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm font-semibold text-[#7B858C]">No activity yet.</p>
          )}
        </div>
      </section>

      {detailsTarget ? (
        <ApplicationReviewOverlay
          programId={programId}
          slug={slug}
          mode={mode}
          requestId={detailsTarget.request.id}
          onClose={() => setDetailsTarget(null)}
          onChanged={loadApplications}
        />
      ) : null}
    </section>
  );
}

const TERMINAL_PAYMENT_TERM_STATUSES = new Set(["superseded", "cancelled", "ended"]);

function selectCurrentPaymentTerms(
  termsRows: ProgramPaymentTerms[],
  request: EnrollmentRequest | null,
  subscription: ProgramSubscription | null,
) {
  if (!termsRows.length) {
    return null;
  }
  const directMatch = termsRows.find((terms) => terms.id === request?.payment_terms_id || terms.id === subscription?.payment_terms_id);
  if (directMatch && !TERMINAL_PAYMENT_TERM_STATUSES.has(directMatch.status)) {
    return directMatch;
  }
  return termsRows.find((terms) => !TERMINAL_PAYMENT_TERM_STATUSES.has(terms.status)) ?? directMatch ?? termsRows[0] ?? null;
}

function financePaymentType(row: FinanceEnrollmentRow, program: Program | null) {
  // Legacy waivers updated the reviewed application but did not supersede its
  // earlier paid terms. The explicit final review decision wins in that case.
  if (row.request?.payment_bypassed) {
    return row.request.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_waived) {
    return "Waived";
  }
  if (row.paymentTerms) {
    if (row.paymentTerms.payment_type === "pay_in_full" || row.paymentTerms.payment_type === "annual") {
      return row.paymentTerms.payment_type === "annual" ? "Annual Subscription" : "Pay in Full";
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
  if (row.request?.payment_bypassed) {
    return row.request.payment_bypass_external ? "Paid Externally" : "Waived";
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
  if (row.request?.payment_bypassed && !row.subscription?.stripe_subscription_id) {
    return "N/A";
  }
  if (row.subscription?.stripe_subscription_id) {
    const stripeStatus = row.subscription.status?.toLowerCase();
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
    return "N/A";
  }
  return "N/A";
}

function financePaymentStatus(row: FinanceEnrollmentRow, program: Program | null) {
  if (row.request?.payment_bypassed) {
    return row.request.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_waived || row.subscription?.payment_paused) {
    return "Waived";
  }
  if (row.paymentTerms) {
    const stripeStatus = row.subscription?.status?.toLowerCase();
    if (row.paymentTerms.payment_type === "monthly" && row.subscription?.stripe_subscription_id && hasActiveRecurringSubscription(row.subscription)) {
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
        return row.paymentTerms.payment_type === "monthly" ? "Paid" : "No payment required";
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

function financePaymentTermsStatusLabel(terms: ProgramPaymentTerms) {
  const status = terms.status.replace(/_/g, " ");
  return `${financePaymentTypeFromTerms(terms)} - ${titleCase(status)}`;
}

function financePaymentTypeFromTerms(terms: ProgramPaymentTerms) {
  if (terms.payment_type === "pay_in_full" || terms.payment_type === "annual") {
    return terms.payment_type === "annual" ? "Annual Subscription" : "Pay in Full";
  }
  if (terms.payment_type === "monthly") {
    return "Monthly";
  }
  if (terms.payment_type === "waived") {
    return "Waived";
  }
  return "Free";
}

function financeBillingCycleLabel(terms: ProgramPaymentTerms) {
  if (!["monthly", "annual"].includes(terms.payment_type)) {
    return "Not applicable";
  }
  if (terms.billing_end_behavior === "fixed_month_count" && terms.billing_months) {
    return `${terms.billing_months} month${terms.billing_months === 1 ? "" : "s"}`;
  }
  return "Ongoing until cancelled";
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
  if (row.paymentTerms?.current_period_start && row.paymentTerms.current_period_end) {
    return `${formatFinanceShortDate(row.paymentTerms.current_period_start)} – ${formatFinanceShortDate(row.paymentTerms.current_period_end)}`;
  }
  if (!row.subscription?.current_period_start || !row.subscription.current_period_end) {
    return "—";
  }
  return `${formatFinanceShortDate(row.subscription.current_period_start)} – ${formatFinanceShortDate(row.subscription.current_period_end)}`;
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

function formatApplicationSummaryStartDate(program: Program) {
  const today = localDateKey(new Date());
  if (program.start_date) {
    return program.lifecycle_status === "active" || program.start_date <= today ? `Started ${formatFinanceShortDate(program.start_date)}` : formatFinanceShortDate(program.start_date);
  }
  if (program.start_now) {
    return program.lifecycle_status === "active" ? "Started immediately" : "Starts immediately after publishing";
  }
  if (program.lifecycle_status === "active") {
    return "Already ongoing";
  }
  if (program.is_ongoing) {
    return "Starts immediately";
  }
  return "Start date pending";
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatFinanceShortDate(value: string | null | undefined) {
  return formatShortDate(value);
}

function formatDurationDate(value: string | null | undefined) {
  return formatDateOnly(value);
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

function financeAuditFallbackSummary(row: FinanceEnrollmentRow, program: Program) {
  const actor = row.approver?.full_name ?? "Director";
  const student = row.student?.full_name || "Student";
  if (row.paymentTerms?.internal_note) {
    return row.paymentTerms.internal_note;
  }
  if (row.paymentTerms?.payment_type === "waived") {
    return `${actor} waived payment indefinitely for ${student}.`;
  }
  if (row.paymentTerms?.payment_type === "monthly" && row.paymentTerms.amount_cents != null) {
    return `${actor} approved ${student} for ${formatPrice(row.paymentTerms.amount_cents)}/month.`;
  }
  if (row.paymentTerms?.payment_type === "pay_in_full" && row.paymentTerms.amount_cents != null) {
    return `${actor} approved ${student} for Pay in Full of ${formatPrice(row.paymentTerms.amount_cents)}.`;
  }
  if (row.paymentTerms?.payment_type === "annual" && row.paymentTerms.amount_cents != null) {
    return `${actor} approved ${student} for an annual subscription of ${formatPrice(row.paymentTerms.amount_cents)}/year.`;
  }
  if (row.request?.payment_bypassed || row.subscription?.payment_waived) {
    return `${actor} waived payment indefinitely for ${student}.`;
  }
  if (row.subscription?.stripe_subscription_id) {
    return `Parent paid and subscription is active for ${student}.`;
  }
  if ((row.subscription?.payment_type ?? row.request?.payment_type) === "annual" && row.request?.approved_price_annual_cents) {
    return program.is_ongoing
      ? `${actor} approved ${student} for an annual subscription of ${formatPrice(row.request.approved_price_annual_cents)}/year.`
      : `${actor} approved ${student} for Pay in Full of ${formatPrice(row.request.approved_price_annual_cents)}.`;
  }
  if (row.request?.approved_price_monthly_cents) {
    return `${actor} changed ${student}'s price to ${formatPrice(row.request.approved_price_monthly_cents)}/month.`;
  }
  if (program.is_paid) {
    return `Payment link was sent for ${student}.`;
  }
  return `${student} was admitted into ${program.title}.`;
}

function financeAuditSummaryWithActor(event: ProgramFinanceAuditEvent, actorsById: Record<string, Profile>) {
  if (!event.actor_profile_id) {
    return event.summary;
  }
  const actor = actorsById[event.actor_profile_id];
  const actorName = actor?.full_name?.trim() || actor?.email?.trim();
  if (!actorName || event.summary.toLowerCase().includes(actorName.toLowerCase())) {
    return event.summary;
  }
  return `${actorName}: ${event.summary}`;
}

export function formatFinanceDate(value: string | null | undefined) {
  return formatFullDate(value);
}

function mosqueProgramsQueryKey(slug: string) {
  return `mosque-programs:${slug}`;
}

/** Invalidate every cached list/detail view that embeds this program's data, after any edit
 * to its schedule, tracks, pricing, or content — covers the guest/student browse list, the
 * teacher's and admin's own program lists, and every viewer-scoped program-detail snapshot. */
function invalidateProgramCaches(slug: string, programId: string) {
  invalidateQuery(mosqueProgramsQueryKey(slug));
  invalidateQuery(`teacher-programs:${slug}`);
  invalidateQuery(`admin-programs:${slug}`);
  invalidateQueryPrefix(`program-detail:${slug}:${programId}:`);
}

function useMosquePrograms(slug: string) {
  const { data, loading, error: queryError, refetch } = useCachedQuery(slug ? mosqueProgramsQueryKey(slug) : null, () => fetchMosqueProgramsSnapshot(slug));
  return { mosque: data?.mosque ?? null, programs: data?.programs ?? [], loading, error: queryError, refetch };
}

// One RPC call instead of mosque -> programs -> teachers -> program_details as four
// sequential/parallel round-trips. Backs both the guest/public browse list and the student
// portal's Browse tab, so this is a high-leverage collapse.
export async function fetchMosqueProgramsSnapshot(slug: string): Promise<MosqueProgramsSnapshot> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_mosque_programs_snapshot", { p_slug: slug });
  if (error) {
    throw new Error(error.message);
  }

  const snapshot = data as unknown as {
    error: string | null;
    mosque: Mosque | null;
    programs: Program[];
    teachers: TeacherDisplay[];
    details: Array<{ program_id: string; instructor_display_name: string | null; cover_director_visibility: string }>;
  } | null;

  if (!snapshot || snapshot.error || !snapshot.mosque) {
    throw new Error(snapshot?.error ?? "Masjid not found.");
  }

  const visiblePrograms = (snapshot.programs ?? []).filter((program) => isPubliclyListed(toProgramStatusFields(program)));
  const teachers = snapshot.teachers ?? [];
  const detailsRows = snapshot.details ?? [];

  return {
    mosque: snapshot.mosque,
    programs: visiblePrograms.map((program) => {
      const details = detailsRows.find((row) => row.program_id === program.id);
      return {
        ...program,
        teacher: teachers.find((teacher) => teacher.id === (program.director_profile_id ?? program.teacher_profile_id)) ?? null,
        coverDirectorDisplayName: details?.instructor_display_name ?? null,
        coverDirectorVisibility: details?.cover_director_visibility ?? "name_and_photo",
      };
    }),
  };
}

async function saveTrackTransferRules(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  programId: string,
  insertedTracks: Array<{ id: string; sort_order: number | null }>,
  trackRows: ProgramEditorTrackRow[],
  transferRules: ProgramEditorTransferRule[],
) {
  await supabase.from("program_track_transfer_rules").delete().eq("program_id", programId);
  if (!transferRules.length) {
    return;
  }

  const insertedTrackBySortOrder = new Map(insertedTracks.map((track) => [track.sort_order ?? 0, track.id]));
  const realIdByLocalId = new Map<string, string>();
  trackRows.forEach((track, index) => {
    const realId = insertedTrackBySortOrder.get(index + 1);
    if (realId) {
      realIdByLocalId.set(track.id, realId);
    }
  });

  const rows = transferRules
    .map((rule) => {
      const fromId = realIdByLocalId.get(rule.fromTrackId);
      const toId = realIdByLocalId.get(rule.toTrackId);
      return fromId && toId ? { program_id: programId, from_track_id: fromId, to_track_id: toId } : null;
    })
    .filter((row): row is { program_id: string; from_track_id: string; to_track_id: string } => Boolean(row));

  if (rows.length) {
    await supabase.from("program_track_transfer_rules").insert(rows);
  }
}

async function saveCanonicalProgramSessions(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  programId: string,
  insertedTracks: Array<{ id: string; sort_order: number | null }>,
  trackRows: ProgramEditorTrackRow[],
  options: {
    programType: ProgramBuilderStatus["programType"];
    schedulePattern: ProgramBuilderStatus["schedulePattern"];
    eventDate?: string;
    title: string;
    location?: string | null;
    room?: string | null;
  },
) {
  const insertedTrackBySortOrder = new Map(insertedTracks.map((track) => [track.sort_order ?? 0, track.id]));
  const sessionPayloadByKey = new Map<string, Database["public"]["Tables"]["program_sessions"]["Insert"]>();
  const linkKeysByTrackId = new Map<string, Set<string>>();

  for (const [trackIndex, track] of trackRows.entries()) {
    const insertedTrackId = insertedTrackBySortOrder.get(trackIndex + 1);
    if (!insertedTrackId) {
      continue;
    }
    const sessions = options.programType === "event" ? track.sessions.slice(0, 1) : track.sessions;
    for (const session of sessions) {
      const sessionDate = options.programType === "event" ? options.eventDate : options.schedulePattern === "custom_dates" ? session.date : null;
      if ((options.programType === "event" || options.schedulePattern === "custom_dates") && !sessionDate) {
        continue;
      }
      const day = options.schedulePattern === "weekly" && options.programType !== "event"
        ? session.day
        : sessionDate
          ? dayFromSessionDate(sessionDate)
          : session.day;
      const row = {
        ...session,
        date: sessionDate ?? undefined,
        day,
        start: normalizeScheduleTime(session.start) || session.start,
        end: normalizeScheduleTime(session.end) || session.end || session.start,
      };
      const key = scheduleRowKey(row);
      if (!sessionPayloadByKey.has(key)) {
        sessionPayloadByKey.set(key, {
          program_id: programId,
          program_track_id: null,
          session_date: sessionDate ?? null,
          day_of_week: day,
          start_time: row.start,
          end_time: row.end,
          title: options.programType === "event" ? options.title : `${day} Session`,
          location: track.location?.trim() || options.location || null,
          room: track.room?.trim() || options.room || null,
          capacity: track.capacity ? Number(track.capacity) : null,
        });
      }
      const nextKeys = linkKeysByTrackId.get(insertedTrackId) ?? new Set<string>();
      nextKeys.add(key);
      linkKeysByTrackId.set(insertedTrackId, nextKeys);
    }
  }

  const sessionEntries = Array.from(sessionPayloadByKey.entries());
  if (!sessionEntries.length) {
    return;
  }

  const { data: insertedSessions, error: sessionsError } = await supabase
    .from("program_sessions")
    .insert(sessionEntries.map(([, payload]) => payload))
    .select("id");
  if (sessionsError) {
    throw new Error(friendlyErrorMessage(sessionsError, "Could not save sessions."));
  }

  const sessionIdByKey = new Map<string, string>();
  sessionEntries.forEach(([key], index) => {
    const insertedSessionId = insertedSessions?.[index]?.id;
    if (insertedSessionId) {
      sessionIdByKey.set(key, insertedSessionId);
    }
  });

  const linkRows = Array.from(linkKeysByTrackId.entries()).flatMap(([programTrackId, keys]) =>
    Array.from(keys).flatMap((key) => {
      const programSessionId = sessionIdByKey.get(key);
      return programSessionId ? [{ program_track_id: programTrackId, program_session_id: programSessionId }] : [];
    }),
  );

  if (linkRows.length) {
    const { error: linkError } = await supabase.from("program_track_sessions").insert(linkRows);
    if (linkError) {
      throw new Error(friendlyErrorMessage(linkError, "Could not link sessions to tracks."));
    }
  }
}

type TeacherProgramsResult = {
  programs: ProgramScheduleSource[];
  allPrograms: ProgramScheduleSource[];
  roleByProgramId: Record<string, TeacherProgramRole>;
  financeAccessByProgramId: Record<string, boolean>;
  programCounts: Record<string, { students: number; applications: number; instructors: number }>;
  canCreateClass: boolean;
  currentUserId: string | null;
  error: string | null;
};

const emptyTeacherProgramsResult: TeacherProgramsResult = {
  programs: [],
  allPrograms: [],
  roleByProgramId: {},
  financeAccessByProgramId: {},
  programCounts: {},
  canCreateClass: false,
  currentUserId: null,
  error: null,
};

// A single RPC call instead of the mosque+profile -> programs+assignments+memberships ->
// tracks+enrollments+requests+instructors -> sessions+links chain this used to run as five
// sequential/parallel round-trip stages. The RPC (security invoker, same RLS as before) just
// returns the same raw rows in one response -- every bit of business logic below (role
// assignment, draft filtering, per-program counting, session/track linking) is unchanged.
export async function fetchTeacherPrograms(slug: string): Promise<TeacherProgramsResult> {
  const session = await loadCachedSession();
  const userId = session?.user.id;
  if (!userId) {
    return { ...emptyTeacherProgramsResult, error: "Log in required." };
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_teacher_programs_snapshot", { p_slug: slug });
  if (error) {
    return { ...emptyTeacherProgramsResult, currentUserId: userId, error: error.message };
  }

  const snapshot = data as unknown as {
    error: string | null;
    accountType: string | null;
    mosqueId: string | null;
    programs: Program[];
    assignments: Array<{ program_id: string; role: string; can_manage_finances: boolean }>;
    memberships: Array<{ role: string; status: string; can_create_programs: boolean }>;
    tracks: ProgramTrack[];
    activeEnrollments: Array<{ program_id: string }>;
    pendingRequests: Array<{ program_id: string }>;
    instructorRows: Array<{ program_id: string }>;
    sessions: ProgramSession[];
    links: ProgramTrackSession[];
  } | null;

  if (!snapshot) {
    return { ...emptyTeacherProgramsResult, currentUserId: userId, error: "Could not load assigned classes." };
  }
  if (snapshot.error) {
    return { ...emptyTeacherProgramsResult, currentUserId: userId, error: snapshot.error };
  }

  const teacherAccountType = snapshot.accountType?.toLowerCase() ?? null;
  if (teacherAccountType !== "teacher" && teacherAccountType !== "admin") {
    return { ...emptyTeacherProgramsResult, currentUserId: userId, error: "Teacher account required." };
  }

  if (!snapshot.mosqueId) {
    return { ...emptyTeacherProgramsResult, currentUserId: userId };
  }

  const mosquePrograms = snapshot.programs;
  const assignments = snapshot.assignments;
  const memberships = snapshot.memberships;
  const trackRows = snapshot.tracks;
  const activeEnrollmentRows = snapshot.activeEnrollments;
  const pendingRequestRows = snapshot.pendingRequests;
  const instructorRows = snapshot.instructorRows;

  const assignmentRoleByProgramId = Object.fromEntries(
    (assignments ?? []).map((assignment) => [assignment.program_id, assignment.role === "director" ? "director" : "instructor" as TeacherProgramRole]),
  ) as Record<string, TeacherProgramRole>;
  const programIds = (mosquePrograms ?? []).map((program) => program.id);
  const nextProgramCounts: Record<string, { students: number; applications: number; instructors: number }> = {};
  for (const programId of programIds) {
    nextProgramCounts[programId] = { students: 0, applications: 0, instructors: 0 };
  }
  for (const row of activeEnrollmentRows ?? []) {
    if (nextProgramCounts[row.program_id]) nextProgramCounts[row.program_id].students += 1;
  }
  for (const row of pendingRequestRows ?? []) {
    if (nextProgramCounts[row.program_id]) nextProgramCounts[row.program_id].applications += 1;
  }
  for (const row of instructorRows ?? []) {
    if (nextProgramCounts[row.program_id]) nextProgramCounts[row.program_id].instructors += 1;
  }
  const hydratedTrackRows = applyLinkedSessionsToTracks(trackRows ?? [], snapshot.sessions ?? [], snapshot.links ?? []);
  const programsWithTracks = (mosquePrograms ?? [])
    // Keep active programs plus the viewer's own unpublished drafts (so a director can find
    // and finish one) — but never resurface archived/cancelled (i.e. deleted) programs, which
    // are also is_active=false but should stay gone for everyone.
    .filter((program) => program.is_active || program.publication_status === "draft")
    .map((program) => ({
      ...program,
      scheduleTracks: hydratedTrackRows.filter((track) => track.program_id === program.id),
    }));

  const nextRoleByProgramId: Record<string, TeacherProgramRole> = {};
  const nextFinanceAccessByProgramId: Record<string, boolean> = {};
  const isAdminForMosque = teacherAccountType === "admin" && (memberships ?? []).some((membership) => membership.role === "admin" && membership.status === "active");
  const canCreateForMosque = isAdminForMosque || (teacherAccountType === "teacher" && (memberships ?? []).some((membership) => membership.role === "teacher" && membership.status === "active" && membership.can_create_programs));
  const assignedPrograms = isAdminForMosque ? programsWithTracks : programsWithTracks.filter((program) => {
    const isDirector = (program.director_profile_id ?? program.teacher_profile_id) === userId || assignmentRoleByProgramId[program.id] === "director";
    const assignedRole = isDirector ? "director" : assignmentRoleByProgramId[program.id];
    if (assignedRole) {
      nextRoleByProgramId[program.id] = assignedRole;
      nextFinanceAccessByProgramId[program.id] = assignedRole === "director" && Boolean((assignments ?? []).find((assignment) => assignment.program_id === program.id && assignment.role === "director")?.can_manage_finances);
      return true;
    }
    return false;
  });
  if (isAdminForMosque) {
    for (const program of assignedPrograms) {
      nextRoleByProgramId[program.id] = "director";
      nextFinanceAccessByProgramId[program.id] = true;
    }
  }

  return {
    programs: assignedPrograms,
    allPrograms: programsWithTracks,
    roleByProgramId: nextRoleByProgramId,
    financeAccessByProgramId: nextFinanceAccessByProgramId,
    programCounts: nextProgramCounts,
    canCreateClass: canCreateForMosque,
    currentUserId: userId,
    error: null,
  };
}

function useTeacherPrograms(slug: string) {
  const { data, loading, error: queryError, refetch } = useCachedQuery(slug ? `teacher-programs:${slug}` : null, () => fetchTeacherPrograms(slug));
  const result = data ?? emptyTeacherProgramsResult;
  return { ...result, error: result.error ?? queryError, loading, refetch };
}

type AdminProgramsResult = { programs: ProgramScheduleSource[]; error: string | null };
const emptyAdminProgramsResult: AdminProgramsResult = { programs: [], error: null };

// Same one-RPC-call pattern as fetchTeacherPrograms above -- collapses the mosque+profile ->
// admin-membership check -> programs -> tracks -> sessions+links chain into a single response.
export async function fetchAdminProgramsWithTracks(slug: string): Promise<AdminProgramsResult> {
  const session = await loadCachedSession();
  const userId = session?.user.id;
  if (!userId) {
    return { programs: [], error: "Log in required." };
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_admin_programs_snapshot", { p_slug: slug });
  if (error) {
    return { programs: [], error: error.message };
  }

  const snapshot = data as unknown as {
    error: string | null;
    programs: Program[];
    tracks: ProgramTrack[];
    sessions: ProgramSession[];
    links: ProgramTrackSession[];
  } | null;

  if (!snapshot) {
    return { programs: [], error: "Could not load classes." };
  }
  if (snapshot.error) {
    return { programs: [], error: snapshot.error };
  }

  const hydratedTrackRows = applyLinkedSessionsToTracks(snapshot.tracks ?? [], snapshot.sessions ?? [], snapshot.links ?? []);

  return {
    programs: (snapshot.programs ?? []).map((program) => ({
      ...program,
      scheduleTracks: hydratedTrackRows.filter((track) => track.program_id === program.id),
    })),
    error: null,
  };
}

function useAdminProgramsWithTracks(slug: string) {
  const { data, loading, error: queryError, refetch } = useCachedQuery(slug ? `admin-programs:${slug}` : null, () => fetchAdminProgramsWithTracks(slug));
  const result = data ?? emptyAdminProgramsResult;
  return { programs: result.programs, error: result.error ?? queryError, loading, refetch };
}

type StudentEnrollmentsResult = {
  enrolledProgramIds: string[];
  programOwnerLabels: Record<string, string[]>;
  programOwnerLabelsByTrackId: Record<string, Record<string, string[]>>;
  programTracksByProgramId: Record<string, ProgramTrack[]>;
  accountType: string | null;
  viewerProfiles: StudentDisplay[];
};

const emptyStudentEnrollmentsResult: StudentEnrollmentsResult = {
  enrolledProgramIds: [],
  programOwnerLabels: {},
  programOwnerLabelsByTrackId: {},
  programTracksByProgramId: {},
  accountType: null,
  viewerProfiles: [],
};

function getProgramOwnerLabelsByTrackId(
  enrollments: EnrollmentTrackSelection[],
  enrollmentTrackRows: Array<{ enrollment_id: string; program_track_id: string }>,
  labelByStudentId: Map<string, string>,
) {
  const trackIdsByEnrollmentId = new Map<string, string[]>();
  for (const row of enrollmentTrackRows) {
    trackIdsByEnrollmentId.set(row.enrollment_id, [...(trackIdsByEnrollmentId.get(row.enrollment_id) ?? []), row.program_track_id]);
  }

  const next: Record<string, Record<string, string[]>> = {};
  for (const enrollment of enrollments) {
    const label = labelByStudentId.get(enrollment.student_profile_id);
    if (!label) {
      continue;
    }

    const trackIds = [
      ...(trackIdsByEnrollmentId.get(enrollment.id) ?? []),
      ...(enrollment.program_track_id ? [enrollment.program_track_id] : []),
    ].filter((trackId, index, all) => all.indexOf(trackId) === index);

    for (const trackId of trackIds) {
      next[enrollment.program_id] = next[enrollment.program_id] ?? {};
      next[enrollment.program_id][trackId] = Array.from(new Set([...(next[enrollment.program_id][trackId] ?? []), label]));
    }
  }

  return next;
}

// One RPC call instead of profile+mosque -> children -> enrollments -> enrollment_tracks ->
// tracks -> sessions+links as up to seven sequential/parallel round-trips. Backs the Home
// "Upcoming" list and Classes "My Classes" tab for both students and parents.
export async function fetchStudentEnrollments(slug: string, userId: string | null): Promise<StudentEnrollmentsResult> {
  if (!userId) {
    return emptyStudentEnrollmentsResult;
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_student_enrollments_snapshot", { p_slug: slug });
  if (error) {
    return emptyStudentEnrollmentsResult;
  }

  const snapshot = data as unknown as {
    profile: StudentDisplay | null;
    accountType: string | null;
    children: StudentDisplay[];
    enrollments: EnrollmentTrackSelection[];
    enrollmentTracks: Array<{ enrollment_id: string; program_track_id: string }>;
    tracks: ProgramTrack[];
    sessions: ProgramSession[];
    links: ProgramTrackSession[];
  } | null;

  if (!snapshot) {
    return emptyStudentEnrollmentsResult;
  }

  const profile = snapshot.profile;
  const nextAccountType = snapshot.accountType;
  const enrollmentTrackRows = snapshot.enrollmentTracks ?? [];
  const tracks = snapshot.tracks ?? [];
  const sessions = snapshot.sessions ?? [];
  const links = snapshot.links ?? [];

  if (nextAccountType === "parent") {
    const children = snapshot.children ?? [];
    const possibleProfiles = [profile, ...children].filter(Boolean) as StudentDisplay[];
    if (possibleProfiles.length === 0) {
      return { ...emptyStudentEnrollmentsResult, accountType: nextAccountType, viewerProfiles: possibleProfiles };
    }

    const activeRows = (snapshot.enrollments ?? []).filter((row) => isCurrentEnrollmentStatus(row.status));
    const childNameById = new Map(possibleProfiles.map((student) => [student.id, student.id === userId ? (student.full_name?.trim() || "You") : (student.full_name?.trim() || "Child")]));
    const owners: Record<string, string[]> = {};
    for (const row of activeRows) {
      const childName = childNameById.get(row.student_profile_id);
      if (!childName) {
        continue;
      }
      owners[row.program_id] = Array.from(new Set([...(owners[row.program_id] ?? []), childName]));
    }
    const trackMap = buildEnrollmentTrackMap(activeRows, enrollmentTrackRows, tracks, sessions, links);
    const ownerLabelsByTrackId = getProgramOwnerLabelsByTrackId(activeRows, enrollmentTrackRows, childNameById);
    return {
      enrolledProgramIds: Object.keys(owners),
      programOwnerLabels: owners,
      programOwnerLabelsByTrackId: ownerLabelsByTrackId,
      programTracksByProgramId: trackMap,
      accountType: nextAccountType,
      viewerProfiles: possibleProfiles,
    };
  }

  const activeRows = (snapshot.enrollments ?? []).filter((row) => isCurrentEnrollmentStatus(row.status));
  const trackMap = buildEnrollmentTrackMap(activeRows, enrollmentTrackRows, tracks, sessions, links);
  return {
    enrolledProgramIds: activeRows.map((row) => row.program_id),
    programOwnerLabels: {},
    programOwnerLabelsByTrackId: {},
    programTracksByProgramId: trackMap,
    accountType: nextAccountType,
    viewerProfiles: profile ? [profile] : [],
  };
}

function useStudentPrograms(slug: string) {
  const base = useMosquePrograms(slug);
  const [session, setSession] = useState<ReturnType<typeof getCachedSessionSnapshot>>(() => getCachedSessionSnapshot());

  useEffect(() => {
    let cancelled = false;
    loadCachedSession().then((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
      }
    });
    const unsubscribe = subscribeCachedSession((nextSession) => {
      setSession(nextSession);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  // Keying on userId (not just slug) means logging in/out while this page stays mounted
  // naturally lands on a different cache key and refetches, without needing a manual
  // onAuthStateChange subscription the way the pre-cache version required.
  const enrollmentKey = session === undefined ? null : `student-enrollments:${slug}:${userId ?? "guest"}`;
  const { data, loading: enrollmentLoading, refetch: refetchEnrollments } = useCachedQuery(enrollmentKey, () => fetchStudentEnrollments(slug, userId));
  const result = data ?? emptyStudentEnrollmentsResult;

  return { ...base, ...result, enrollmentLoading, refetchEnrollments };
}

// Pure version of the track-map assembly that loadEnrollmentTrackMap used to fetch its own way
// (program_tracks, then program_sessions+program_track_sessions via hydrateTracksWithLinkedSessions)
// -- now fed straight from the RPC's raw rows instead of issuing its own queries.
function buildEnrollmentTrackMap(
  enrollments: Array<{ id: string; program_id: string; program_track_id?: string | null }>,
  enrollmentTrackRows: Array<{ enrollment_id: string; program_track_id: string }>,
  tracks: ProgramTrack[],
  sessions: ProgramSession[],
  links: ProgramTrackSession[],
) {
  if (!enrollments.length) {
    return {};
  }

  const legacyEnrollmentTracks = enrollments
    .filter((enrollment) => Boolean(enrollment.program_track_id))
    .map((enrollment) => ({ enrollment_id: enrollment.id, program_track_id: enrollment.program_track_id as string }));
  const allEnrollmentTracks = [...enrollmentTrackRows, ...legacyEnrollmentTracks].filter(
    (row, index, all) => all.findIndex((item) => item.enrollment_id === row.enrollment_id && item.program_track_id === row.program_track_id) === index,
  );
  if (!allEnrollmentTracks.length) {
    return {};
  }

  const hydratedTracks = applyLinkedSessionsToTracks(tracks, sessions, links);
  const trackById = new Map(hydratedTracks.map((track) => [track.id, track]));
  const enrollmentProgramById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment.program_id]));
  const next: Record<string, ProgramTrack[]> = {};

  for (const row of allEnrollmentTracks) {
    const programId = enrollmentProgramById.get(row.enrollment_id);
    const track = trackById.get(row.program_track_id);
    if (!programId || !track) {
      continue;
    }
    next[programId] = [...(next[programId] ?? []).filter((item) => item.id !== track.id), track];
  }

  return next;
}

export type ApplicantApplicationRow = {
  request: EnrollmentRequest;
  program: Program | null;
  track: ProgramTrack | null;
  subscription: ProgramSubscription | null;
  student: StudentDisplay | null;
  parent?: ParentDisplay | null;
};

export function applicantRowFromRequest(request: RequestWithContext): ApplicantApplicationRow {
  return {
    request,
    program: request.program ?? null,
    track: request.track ?? null,
    subscription: request.subscription ?? null,
    student: request.student ?? null,
    parent: request.parent ?? null,
  };
}

/**
 * Every enrollment_requests row for the current user (or, for a parent, every
 * linked child) — unlike Inbox's request feed, this is never filtered by
 * student_dismissed_at, since it's the persistent source of truth for
 * "what did I apply to and where does it stand", not a dismissable feed.
 */
type ApplicantApplicationsResult = { rows: ApplicantApplicationRow[]; error: string | null };
const emptyApplicantApplicationsResult: ApplicantApplicationsResult = { rows: [], error: null };

// One RPC call instead of profile+mosque -> children -> requests -> [programs+tracks+
// subscriptions] -> extra-students as five sequential/parallel round-trips. Backs the
// Applications tab and the Home action-required banner for both students and parents.
async function fetchApplicantApplications(slug: string, userId: string | null): Promise<ApplicantApplicationsResult> {
  if (!userId) {
    return emptyApplicantApplicationsResult;
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_applicant_applications_snapshot", { p_slug: slug });
  if (error) {
    return { rows: [], error: error.message };
  }

  const snapshot = data as unknown as {
    error: string | null;
    requests: EnrollmentRequest[];
    programs: Program[];
    tracks: ProgramTrack[];
    subscriptions: ProgramSubscription[];
    children: StudentDisplay[];
    extraStudents: StudentDisplay[];
  } | null;

  if (!snapshot) {
    return { rows: [], error: "Could not load applications." };
  }
  if (snapshot.error) {
    return { rows: [], error: snapshot.error };
  }

  const requests = snapshot.requests ?? [];
  const programRows = snapshot.programs ?? [];
  const trackRows = snapshot.tracks ?? [];
  const subscriptionRows = snapshot.subscriptions ?? [];
  const allStudents = [...(snapshot.children ?? []), ...(snapshot.extraStudents ?? [])];

  return {
    rows: requests.map((request) => ({
      request,
      program: programRows.find((program) => program.id === request.program_id) ?? null,
      track: request.program_track_id ? trackRows.find((track) => track.id === request.program_track_id) ?? null : null,
      subscription:
        subscriptionRows.find((subscription) => subscription.program_id === request.program_id && subscription.student_profile_id === request.student_profile_id) ?? null,
      student: request.student_profile_id === userId ? null : allStudents.find((student) => student.id === request.student_profile_id) ?? null,
    })),
    error: null,
  };
}

function useApplicantApplications(slug: string) {
  const [session, setSession] = useState<ReturnType<typeof getCachedSessionSnapshot>>(() => getCachedSessionSnapshot());

  useEffect(() => {
    let cancelled = false;
    loadCachedSession().then((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
      }
    });
    const unsubscribe = subscribeCachedSession((nextSession) => {
      setSession(nextSession);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  const key = session === undefined ? null : `student-applications:${slug}:${userId ?? "guest"}`;
  const { data, loading, error: queryError, refetch } = useCachedQuery(key, () => fetchApplicantApplications(slug, userId));
  const result = data ?? emptyApplicantApplicationsResult;

  return { rows: result.rows, loading, error: result.error ?? queryError, reload: refetch };
}

function TeacherRequestSection({ title, count, children, action }: { title: string; count: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-10 items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold text-[#26323A]">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="min-w-8 rounded-full bg-[#E8F7F2] px-2.5 py-1 text-center text-xs font-semibold text-[#17624F]">{count}</span>
          {action}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function StudentAnnouncementStream({ announcements }: { announcements: AnnouncementWithContext[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#D6DCE0] bg-white shadow-[0_8px_22px_rgba(38,50,58,0.06)]">
      <div className="max-h-[430px] space-y-4 overflow-y-auto p-4">
        {announcements.length ? (
          announcements.map((announcement) => <StudentAnnouncementCard key={announcement.id} announcement={announcement} />)
        ) : (
          <MiniEmpty text="Class announcements will appear here." />
        )}
      </div>
    </section>
  );
}

export function StudentAnnouncementCard({ announcement }: { announcement: AnnouncementWithContext }) {
  const attachments = normalizeMessageAttachments(announcement.attachments);
  return (
    <article className="flex gap-3">
      <Avatar src={announcement.author?.avatar_url ?? null} name={announcement.author?.full_name ?? "Teacher"} />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[#E1E8EC] bg-[#FAFBFC] p-3 shadow-[0_6px_18px_rgba(38,50,58,0.05)]">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-[#26323A]">{announcement.author?.full_name ?? "Teacher"}</h3>
          <span className="text-xs text-[#6B747B]">{formatAnnouncementTimestamp(announcement.created_at)}</span>
        </div>
        <p className="mt-0.5 text-xs font-medium text-[#2F8FB3]">{announcement.program?.title ?? "Class announcement"}</p>
        {announcement.message.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#26323A]">{announcement.message}</p> : null}
        <MessageAttachmentList attachments={attachments} programId={announcement.program_id} source="announcement" messageId={announcement.id} />
      </div>
    </article>
  );
}

function ProgramAnnouncementFeed({
  program,
  announcements,
  readersByAnnouncementId = {},
  viewer,
}: {
  program: Program | null;
  announcements: AnnouncementWithContext[];
  readersByAnnouncementId?: Record<string, Profile[]>;
  viewer: "teacher" | "student";
}) {
  return (
    <section className={cn("space-y-4 text-[#26323A]", viewer === "student" ? "bg-white px-4 pb-28 pt-4" : "")}>
      {program && viewer === "student" ? (
        <div className="px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Class announcements</p>
          <h2 className="mt-1 text-2xl font-semibold leading-8">{program.title}</h2>
          <p className="mt-1 text-sm text-[#6B747B]">{scheduleSummary(program.schedule, program.schedule_notes).full}</p>
        </div>
      ) : null}
      <div className="space-y-4">
        {announcements.length ? (
          announcements.map((announcement) => (
            <TeacherAnnouncementBubble
              key={announcement.id}
              announcement={announcement}
              readers={readersByAnnouncementId[announcement.id] ?? []}
              showSeenDetails={viewer === "teacher"}
            />
          ))
        ) : (
          <MiniEmpty text="No announcements have been sent for this class." />
        )}
      </div>
    </section>
  );
}

function AnnouncementTrackTargetControls({
  tracks,
  mode,
  selectedTrackIds,
  onModeChange,
  onToggleTrack,
}: {
  tracks: ProgramTrack[];
  mode: "all" | "tracks";
  selectedTrackIds: string[];
  onModeChange: (mode: "all" | "tracks") => void;
  onToggleTrack: (trackId: string) => void;
}) {
  if (tracks.length === 0) {
    return (
      <div className="rounded-[14px] border border-[#DDE6EA] bg-white px-3 py-3 text-sm text-[#6B747B]">
        This announcement will go to the whole class.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-[#DDE6EA] bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onModeChange("all")}
          className={cn(
            "min-h-10 rounded-full px-3 text-sm font-semibold transition",
            mode === "all" ? "bg-[#17624F] text-white shadow-[0_8px_18px_rgba(23,98,79,0.18)]" : "bg-[#EEF3F5] text-[#52616A]",
          )}
        >
          Whole program
        </button>
        <button
          type="button"
          onClick={() => onModeChange("tracks")}
          className={cn(
            "min-h-10 rounded-full px-3 text-sm font-semibold transition",
            mode === "tracks" ? "bg-[#17624F] text-white shadow-[0_8px_18px_rgba(23,98,79,0.18)]" : "bg-[#EEF3F5] text-[#52616A]",
          )}
        >
          Specific tracks
        </button>
      </div>
      {mode === "tracks" ? (
        <div className="grid gap-2">
          {tracks.map((track) => {
            const selected = selectedTrackIds.includes(track.id);
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => onToggleTrack(track.id)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-[14px] border px-3 text-left text-sm font-semibold transition",
                  selected ? "border-[#17624F] bg-[#E8F7F2] text-[#17624F]" : "border-[#DDE6EA] bg-white text-[#52616A]",
                )}
              >
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border", selected ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#B9C3C8] bg-white")} aria-hidden>
                  {selected ? "✓" : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{track.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function StudentNoteBubble({
  note,
  viewer,
  deleting = false,
  onDelete,
}: {
  note: StudentNoteWithContext;
  viewer: "teacher" | "recipient";
  deleting?: boolean;
  onDelete?: (note: StudentNoteWithContext) => void;
}) {
  const authorName = note.author?.full_name?.trim() || "Teacher";
  const seen = Boolean(note.seen_at);
  const attachments = normalizeMessageAttachments(note.attachments);
  return (
    <article className="flex gap-3">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <Avatar src={note.author?.avatar_url ?? null} name={authorName} />
        {viewer === "teacher" && onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(note)}
            disabled={deleting}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FCE8E4] text-[#C83F31] transition hover:bg-[#F7D4CE] disabled:opacity-50"
            aria-label="Delete note"
            title="Delete note"
          >
            {deleting ? <span className="h-4 w-4 animate-pulse rounded-full bg-[#F3B8AE]" aria-hidden /> : <TrashIcon />}
          </button>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[#E1E8EC] bg-white p-3 shadow-[0_6px_18px_rgba(38,50,58,0.05)]">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-[#26323A]">{authorName}</h3>
          <span className="text-xs text-[#6B747B]">{timeAgo(note.created_at)}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[#F0F3F5] px-2 py-0.5 text-[11px] font-semibold text-[#52616A]">{note.program?.title ?? "Class"}</span>
          <span className="rounded-full bg-[#EAF4F7] px-2 py-0.5 text-[11px] font-semibold text-[#2F6F83]">Subject: {note.student?.full_name ?? "Student"}</span>
        </div>
        {note.message.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#26323A]">{note.message}</p> : null}
        <MessageAttachmentList attachments={attachments} programId={note.program_id} source="note" messageId={note.id} />
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#6B747B]">
          <span>{seen ? `Seen ${note.seen_at ? timeAgo(note.seen_at) : ""}` : "Not seen"}</span>
          {viewer === "recipient" && !seen ? <span className="font-semibold text-[#2F8FB3]">Marked seen</span> : null}
        </div>
      </div>
    </article>
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

function TeacherAnnouncementBubble({ announcement, readers = [], showSeenDetails = false }: { announcement: AnnouncementWithContext; readers?: Profile[]; showSeenDetails?: boolean }) {
  const authorName = announcement.author?.full_name?.trim() || "You";
  const [readersOpen, setReadersOpen] = useState(false);
  const attachments = normalizeMessageAttachments(announcement.attachments);

  return (
    <article className="flex gap-2.5">
      {announcement.author?.avatar_url ? (
        <Image src={announcement.author.avatar_url} alt="" width={30} height={30} className="mt-1 h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E7F3F8] text-[11px] font-semibold text-[#2F8FB3]">
          {initials(authorName)}
        </div>
      )}
      <div className="min-w-0 flex-1 rounded-[20px] rounded-tl-md border border-[#E1E8EC] bg-[#FBFCFD] px-3.5 py-3 shadow-[0_6px_16px_rgba(38,50,58,0.04)]">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-[#26323A]">{authorName}</h3>
          <span className="text-xs text-[#6B747B]">{formatAnnouncementTimestamp(announcement.created_at)}</span>
        </div>
        {announcement.message.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#26323A]">{announcement.message}</p> : null}
        <MessageAttachmentList attachments={attachments} programId={announcement.program_id} source="announcement" messageId={announcement.id} />
        {showSeenDetails ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setReadersOpen(true)}
              className="text-[11px] font-semibold text-[#2F8FB3] underline-offset-2 transition-colors hover:text-[#246F8D] hover:underline"
            >
              Seen by {readers.length}
            </button>
          </div>
        ) : null}
      </div>
      {showSeenDetails && readersOpen && typeof document !== "undefined"
        ? createPortal(<AnnouncementReadersDrawer readers={readers} onClose={() => setReadersOpen(false)} />, document.body)
        : null}
    </article>
  );
}

function AnnouncementReadersDrawer({ readers, onClose }: { readers: Profile[]; onClose: () => void }) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(drawerRef, true, onClose);
  useHideMobileChromeWhileMounted();

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={drawerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full rounded-t-[28px] bg-white p-5 text-[#26323A] shadow-[0_-18px_50px_rgba(38,50,58,0.22)] outline-none">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Seen by {readers.length}</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF3F5] text-[#52616A]" aria-label="Close seen list">
            <XIcon />
          </button>
        </div>
        <div className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto">
          {readers.length ? (
            readers.map((reader) => {
              const name = reader.full_name || reader.email || "Reader";
              return (
                <div key={reader.id} className="flex items-center gap-3 rounded-[14px] bg-[#F7FAFB] px-3 py-2">
                  {reader.avatar_url ? (
                    <Image src={reader.avatar_url} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E7F3F8] text-[10px] font-semibold text-[#2F8FB3]">{initials(name)}</span>
                  )}
                  <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
                </div>
              );
            })
          ) : (
            <p className="rounded-[14px] bg-[#F7FAFB] px-3 py-3 text-sm text-[#6B747B]">No one has seen this announcement yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InstructorLifecycleNotificationCard({
  notification,
  slug,
  reviewed = false,
  onClear,
}: {
  notification: InstructorLifecycleNotification;
  slug: string;
  reviewed?: boolean;
  onClear?: () => void;
}) {
  const instructorName = notification.instructor?.full_name?.trim() || notification.instructor?.email || "Instructor";
  const programTitle = notification.program?.title ?? "this class";
  const actionText = notification.event_type === "resigned" ? "has resigned from" : "has become an instructor of";

  return (
    <article className={cn("rounded-[22px] border border-[#E1E8EC] bg-white p-4 shadow-[0_10px_24px_rgba(38,50,58,0.07)]", reviewed ? "opacity-70" : "")}>
      <div className="flex items-start gap-3">
        <Avatar src={notification.instructor?.avatar_url ?? null} name={instructorName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-[#26323A]">
            <span className="font-semibold">{instructorName}</span> {actionText} <span className="font-semibold">{programTitle}</span>.
          </p>
          <div className="mt-3">
            <TransitionLink
              href={`/m/${slug}/teacher/classes/${notification.program_id}/instructors`}
              label="Manage"
              className="inline-flex min-h-8 items-center justify-center rounded-full border border-[#D6E1E6] bg-white px-3 text-xs font-semibold text-[#26323A] shadow-[0_6px_14px_rgba(38,50,58,0.08)] transition-colors hover:border-[#B8CBD4] hover:bg-[#F7FAFB]"
            >
              Manage
            </TransitionLink>
          </div>
        </div>
        {onClear ? (
          <button type="button" onClick={onClear} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7B858C] transition-colors hover:bg-[#FCEDEC] hover:text-[#C83F31]" aria-label="Clear notification">
            <XIcon />
          </button>
        ) : null}
      </div>
    </article>
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

function TeacherRequestCard({
  request,
  reviewed = false,
  onAccept,
  onWaitlist,
  onReject,
  onClear,
  onView,
}: {
  request: RequestWithContext;
  reviewed?: boolean;
  onAccept?: () => void;
  onWaitlist?: () => void;
  onReject?: () => void;
  onClear?: () => void;
  onView?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const studentName = request.student?.full_name ?? "Student";
  const isParentRequest = Boolean(request.parent_profile_id);
  const statusLabel = request.admission_completed_at ? "Admitted" : request.status.charAt(0).toUpperCase() + request.status.slice(1);
  const requestContext = request.admission_completed_at ? "Registration complete" : isParentRequest ? "Parent request" : "Student request";

  return (
    <article className="relative pb-1">
      {!expanded ? <div className="absolute inset-x-8 bottom-0 h-3 rounded-b-[18px] bg-[#DDE7EC]" aria-hidden /> : null}
      <div className={cn("relative overflow-hidden rounded-[22px] border border-[#E1E8EC] bg-white shadow-[0_10px_24px_rgba(38,50,58,0.07)]", reviewed ? "opacity-70" : "")}>
        <div className="flex items-center gap-2 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#2F8FB3]" aria-hidden>
            <DefaultProfileIcon className="h-5 w-5" compact />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold leading-5 text-[#26323A]">{studentName}</h3>
            <p className="mt-0.5 truncate text-xs leading-4 text-[#6B747B]">
              {requestContext} • {request.program?.title ?? "Class request"}
            </p>
          </div>
          {reviewed ? (
            <span className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold", request.admission_completed_at || request.status === "approved" ? "bg-[#EAF8EF] text-[#258A43]" : request.status === "waitlisted" ? "bg-[#FFF4D6] text-[#8A6418]" : "bg-[#FDEDEA] text-[#C83F31]")}>
              {statusLabel}
            </span>
          ) : null}
          {reviewed && onClear ? (
            <button type="button" onClick={onClear} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7B858C] transition-colors hover:bg-[#FCEDEC] hover:text-[#C83F31]" aria-label="Clear request">
              <XIcon />
            </button>
          ) : null}
          <button type="button" onClick={() => setExpanded((value) => !value)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E7F3F8] text-[#257B9C] transition-colors hover:bg-[#DDEEF6]" aria-label={expanded ? "Hide student details" : "Show student details"}>
            <ChevronIcon expanded={expanded} />
          </button>
        </div>
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="border-t border-[#E6ECEF] bg-[#F8FAFB] px-5 py-4">
              <dl className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,0.8fr)] gap-x-5 gap-y-3 text-sm">
                {request.admission_completed_at ? <RequestDetail label="Admitted" value={timeAgo(request.admission_completed_at)} /> : null}
                {isParentRequest ? (
                  <>
                    <RequestDetail label="Child" value={request.student?.full_name} />
                    <RequestDetail label="Child Age" value={displayAge(request.student)} />
                    <RequestDetail label="Gender" value={request.student?.gender} />
                    <RequestDetail label="Parent" value={request.parent?.full_name} />
                    <RequestDetail label="Parent Email" value={request.parent?.email} />
                    <RequestDetail label="Parent Phone" value={request.parent?.phone_number} />
                  </>
                ) : (
                  <>
                    <RequestDetail label="Email" value={request.student?.email} />
                    <RequestDetail label="Phone" value={request.student?.phone_number} />
                    <RequestDetail label="Age" value={displayAge(request.student)} />
                    <RequestDetail label="Gender" value={request.student?.gender} />
                  </>
                )}
              </dl>
              {onView ? (
                <div className="mt-4">
                  <button type="button" onClick={onView} className="flex min-h-10 w-full items-center justify-center rounded-[9px] bg-[#EEF6F7] px-2 text-xs font-semibold text-[#17624F] transition-colors hover:bg-[#E3F0F0]">
                    View Application
                  </button>
                </div>
              ) : !reviewed && (onAccept || onReject) ? (
                <div className={cn("mt-4 grid gap-2", onWaitlist ? "grid-cols-3" : "grid-cols-2")}>
                  <button type="button" onClick={onAccept} className="min-h-10 rounded-[9px] bg-[#E2F6E8] px-2 text-xs font-semibold text-[#258A43] transition-colors hover:bg-[#D4F0DD]">
                    Accept
                  </button>
                  {onWaitlist ? (
                    <button type="button" onClick={onWaitlist} className="min-h-10 rounded-[9px] bg-[#FFF4D6] px-2 text-xs font-semibold text-[#8A6418] transition-colors hover:bg-[#FFE9A8]">
                      Waitlist
                    </button>
                  ) : null}
                  <button type="button" onClick={onReject} className="min-h-10 rounded-[9px] bg-[#FCE8E4] px-2 text-xs font-semibold text-[#C83F31] transition-colors hover:bg-[#F9D8D1]">
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function WithdrawalRequestCard({
  request,
  reviewed = false,
  busy = false,
  onApprove,
  onReject,
  onClear,
}: {
  request: WithdrawalRequestWithContext;
  reviewed?: boolean;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onClear?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const studentName = request.student?.full_name?.trim() || "Student";
  const programTitle = request.program?.title ?? "Class";
  const requester = request.parent?.full_name?.trim() || (request.requested_by === request.student_profile_id ? studentName : "Family");
  const subscription = request.subscription;
  const hasStripeSubscription = Boolean(subscription?.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(subscription.status));
  const statusText = request.status === "pending" ? "Pending review" : titleCase(request.status);

  return (
    <article className={cn("rounded-[22px] border border-[#E1E8EC] bg-white p-4 shadow-[0_10px_24px_rgba(38,50,58,0.06)]", reviewed ? "opacity-70" : "")}>
      <button type="button" onClick={() => setExpanded((current) => !current)} className="flex w-full items-start gap-3 text-left">
        <Avatar src={request.student?.avatar_url ?? null} name={studentName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold leading-5 text-[#26323A]">{studentName}</h3>
              <p className="mt-0.5 truncate text-xs text-[#6B747B]">{programTitle} · {timeAgo(request.requested_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", request.status === "pending" ? "bg-[#FFF7E6] text-[#996800]" : "bg-[#EEF3F5] text-[#52616A]")}>{statusText}</span>
              {reviewed && onClear ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClear();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onClear();
                    }
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7B858C] transition-colors hover:bg-[#FCEDEC] hover:text-[#C83F31]"
                  aria-label="Clear withdrawal"
                >
                  <XIcon />
                </span>
              ) : null}
              <ChevronIcon expanded={expanded} />
            </div>
          </div>
        </div>
      </button>
      {expanded ? (
        <div className="mt-4 border-t border-[#E3E8EC] pt-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Requested by</dt>
            <dd className="truncate text-[#26323A]">{requester}</dd>
            <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Student</dt>
            <dd className="truncate text-[#26323A]">{studentName}</dd>
            {request.parent ? (
              <>
                <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Parent</dt>
                <dd className="truncate text-[#26323A]">{request.parent.full_name ?? "Parent"}{request.parent.email ? ` · ${request.parent.email}` : ""}</dd>
              </>
            ) : null}
            <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Reason</dt>
            <dd className="whitespace-pre-wrap text-[#26323A]">{request.reason?.trim() || "No reason provided."}</dd>
            <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Billing</dt>
            <dd className="text-[#26323A]">
              {hasStripeSubscription
                ? "Active Stripe subscription. Accepting cancels it immediately."
                : subscription?.cancel_at_period_end
                  ? "Stripe cancellation already scheduled."
                  : subscription
                    ? `Subscription status: ${subscription.status}`
                    : "No paid subscription found."}
            </dd>
          </dl>
          {hasStripeSubscription ? (
            <p className="mt-3 rounded-[14px] bg-[#FFF8E8] px-3 py-2 text-xs font-semibold leading-5 text-[#9A6400]">
              Accepting this request ends class access and cancels the subscription immediately.
            </p>
          ) : request.status === "pending" ? (
            <p className="mt-3 rounded-[14px] bg-[#F4FBF8] px-3 py-2 text-xs font-semibold leading-5 text-[#17624F]">
              Accepting this request removes the student from the class immediately.
            </p>
          ) : null}
          {reviewed && request.decision_note ? <p className="mt-2 text-sm leading-5 text-[#6B747B]">{request.decision_note}</p> : null}
          {!reviewed && request.status === "pending" ? (
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                className="min-h-10 rounded-full bg-[#17624F] px-4 text-sm font-semibold text-white disabled:bg-[#D8E2E5] disabled:text-[#8A949B]"
              >
                {busy ? "Working..." : "Accept withdrawal and remove student"}
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="min-h-10 rounded-full bg-[#EEF3F5] px-4 text-sm font-semibold text-[#26323A] disabled:opacity-60"
              >
                Reject withdrawal and keep student
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function BillingMonthsHint({ startDate, endDate, chosenMonths }: { startDate: string; endDate: string; chosenMonths: string }) {
  const suggested = estimateBillingMonths(startDate, endDate);
  const exactDuration = monthsBetweenDates(startDate, endDate);
  return (
    <div className="mt-2 rounded-[12px] border border-[#E1E8EC] bg-[#F7FAFB] px-3 py-2 text-xs text-[#52616A]">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="font-semibold text-[#26323A]">{exactDuration ? `${exactDuration} calendar mo` : "Set dates"}</p>
          <p className="mt-0.5 font-medium">Program duration</p>
        </div>
        <div>
          <p className="font-semibold text-[#26323A]">{suggested ? `${suggested} suggested` : "No suggestion"}</p>
          <p className="mt-0.5 font-medium">Billing cycles</p>
        </div>
      </div>
      {chosenMonths ? <p className="mt-2 font-semibold text-[#17624F]">Using {chosenMonths} monthly {Number(chosenMonths) === 1 ? "charge" : "charges"} for price calculations.</p> : null}
    </div>
  );
}

function TeacherMetricTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#E1E8EC] bg-white p-4 shadow-[0_10px_26px_rgba(38,50,58,0.06)]">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF5F7] text-[#2F8FB3]">{icon}</div>
      <p className="mt-4 text-3xl font-semibold leading-none text-[#26323A]">{value}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{label}</p>
    </div>
  );
}

type TeacherStudentItem = { enrollment: Enrollment; profile: StudentDisplay | null; parent?: ParentDisplay | null; subscription?: ProgramSubscription | null; trackIds?: string[] };

function studentRoleLabel(item: TeacherStudentItem) {
  if (item.parent) {
    return "Child";
  }

  if (item.profile?.account_type === "parent") {
    return "Parent";
  }

  return "Adult Student";
}

function TeacherStudentListControls({
  search,
  gender,
  sort,
  sortDirection,
  view,
  tracks,
  selectedTrackIds,
  selectedDays,
  dayOptions,
  onSearchChange,
  onGenderChange,
  onTrackToggle,
  onDayToggle,
  onSortChange,
  onSortDirectionChange,
  onViewChange,
}: {
  search: string;
  gender: string;
  sort: "first" | "last" | "age";
  sortDirection: "asc" | "desc";
  view: "students" | "parents";
  tracks: ProgramTrack[];
  selectedTrackIds: string[];
  selectedDays: string[];
  dayOptions: string[];
  onSearchChange: (value: string) => void;
  onGenderChange: (value: string) => void;
  onTrackToggle: (trackId: string) => void;
  onDayToggle: (day: string) => void;
  onSortChange: (value: "first" | "last" | "age") => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
  onViewChange: (value: "students" | "parents") => void;
}) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const allTracksSelected = tracks.length > 0 && selectedTrackIds.length === tracks.length;
  const trackLabel = tracks.length === 0 || allTracksSelected ? "All tracks" : selectedTrackIds.length === 0 ? "No tracks" : selectedTrackIds.length === 1 ? tracks.find((track) => track.id === selectedTrackIds[0])?.name ?? "1 track" : `${selectedTrackIds.length} tracks`;
  const availableDayOptions = dayOptions.length ? dayOptions : [...scheduleDayOptions];
  const allDaysSelected = selectedDays.length === availableDayOptions.length && availableDayOptions.every((day) => selectedDays.includes(day));
  const dayLabel = allDaysSelected ? "All days" : selectedDays.length === 0 ? "No days" : selectedDays.length === 1 ? formatDayAbbreviation(selectedDays[0]) : `${selectedDays.length} days`;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sr-only">Search students</span>
        <span className="flex h-11 items-center gap-2 rounded-full bg-[#F5F7F8] px-4 text-[#7B858C]">
          <SearchIcon />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#26323A] outline-none placeholder:text-[#9AA4AA]"
          />
        </span>
      </label>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {(["all", "male", "female"] as const).map((value) => {
            const label = value === "all" ? "All" : value === "male" ? "Brothers" : "Sisters";
            const active = gender === value;
            return (
              <button
                key={value}
                type="button"
                disabled={view === "parents" && value !== "all"}
                onClick={() => onGenderChange(value)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  active ? "bg-[#5DAF93] text-white" : "bg-[#F2F4F5] text-[#6B747B]",
                  view === "parents" && value !== "all" && "hidden",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setViewMenuOpen((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#26323A] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(38,50,58,0.14)]"
            aria-expanded={viewMenuOpen}
          >
            <span>{view === "students" ? "Students" : "Parents"}</span>
            <ChevronIcon expanded={viewMenuOpen} />
          </button>
          {viewMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-32 rounded-[16px] border border-[#DDE5E9] bg-white p-1 shadow-[0_18px_44px_rgba(38,50,58,0.18)]">
              {(["students", "parents"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onViewChange(value);
                    setViewMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center rounded-[12px] px-3 py-2 text-left text-sm font-semibold",
                    view === value ? "bg-[#F2F6F7] text-[#26323A]" : "text-[#6B747B] hover:bg-[#F7FAFB]",
                  )}
                >
                  {value === "students" ? "Students" : "Parents"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        {tracks.length ? (
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setTrackMenuOpen((value) => !value)}
              className="flex h-10 w-full items-center justify-between gap-2 rounded-full border border-[#DDE5E9] bg-white px-3 text-left text-sm font-semibold text-[#26323A] outline-none"
              aria-expanded={trackMenuOpen}
            >
              <span className="min-w-0 truncate">Tracks: {trackLabel}</span>
              <ChevronIcon expanded={trackMenuOpen} />
            </button>
            {trackMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-56 rounded-[16px] border border-[#DDE5E9] bg-white p-2 shadow-[0_18px_44px_rgba(38,50,58,0.18)]">
                <div className="grid grid-cols-2 gap-1.5 border-b border-[#EEF2F4] pb-2">
                  <button
                    type="button"
                    onClick={() => onTrackToggle("select_all")}
                    className="min-h-8 rounded-[10px] bg-[#EAF7F1] px-2 text-xs font-semibold text-[#17624F] transition-colors hover:bg-[#DDF1E7]"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => onTrackToggle("deselect_all")}
                    className="min-h-8 rounded-[10px] bg-[#F2F4F5] px-2 text-xs font-semibold text-[#52616A] transition-colors hover:bg-[#E8ECEF]"
                  >
                    Deselect all
                  </button>
                </div>
                <div className="pt-1">
                  {tracks.map((track) => (
                    <RosterTrackOption key={track.id} checked={selectedTrackIds.includes(track.id)} label={track.name} onClick={() => onTrackToggle(track.id)} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,130px)_38px] items-center gap-2">
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setDayMenuOpen((value) => !value)}
              className="flex h-10 w-full items-center justify-between gap-2 rounded-full border border-[#DDE5E9] bg-white px-3 text-left text-sm font-semibold text-[#26323A] outline-none"
              aria-expanded={dayMenuOpen}
            >
              <span className="min-w-0 truncate">Days: {dayLabel}</span>
              <ChevronIcon expanded={dayMenuOpen} />
            </button>
            {dayMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-56 rounded-[16px] border border-[#DDE5E9] bg-white p-2 shadow-[0_18px_44px_rgba(38,50,58,0.18)]">
                <div className="grid grid-cols-2 gap-1.5 border-b border-[#EEF2F4] pb-2">
                  <button
                    type="button"
                    onClick={() => onDayToggle("select_all")}
                    className="min-h-8 rounded-[10px] bg-[#EAF7F1] px-2 text-xs font-semibold text-[#17624F] transition-colors hover:bg-[#DDF1E7]"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => onDayToggle("deselect_all")}
                    className="min-h-8 rounded-[10px] bg-[#F2F4F5] px-2 text-xs font-semibold text-[#52616A] transition-colors hover:bg-[#E8ECEF]"
                  >
                    Deselect all
                  </button>
                </div>
                <div className="pt-1">
                  {availableDayOptions.map((day) => (
                    <RosterTrackOption key={day} checked={selectedDays.includes(day)} label={day} onClick={() => onDayToggle(day)} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <label className="min-w-0">
            <span className="sr-only">Sort students</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as "first" | "last" | "age")}
              className="h-10 w-full rounded-full border border-[#DDE5E9] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none"
            >
              <option value="first">First name</option>
              <option value="last">Last name</option>
              <option value="age">Age</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#DDE5E9] bg-white text-[#26323A]"
            aria-label={sortDirection === "asc" ? "Sort descending" : "Sort ascending"}
          >
            <SortDirectionIcon direction={sortDirection} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentActionMenu({ busy, onKick }: { busy: boolean; onKick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((value) => !value);
        }}
        className={cn("flex h-9 w-9 items-center justify-center rounded-full transition-colors", menuOpen ? "bg-[#26323A] text-white" : "text-[#52616A] hover:bg-[#EEF3F5] hover:text-[#26323A]")}
        aria-label="Student actions"
      >
        <MoreVerticalIcon />
      </button>
      {menuOpen ? (
        <span className="absolute right-0 top-11 z-30 w-40 overflow-hidden rounded-[16px] border border-[#DDE5E9] bg-white p-1 text-sm shadow-[0_18px_44px_rgba(38,50,58,0.18)]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (busy) {
                return;
              }
              setMenuOpen(false);
              onKick();
            }}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left font-semibold text-[#C83F31] hover:bg-[#FFF1EF] disabled:opacity-50"
          >
            {busy ? "Removing..." : "Remove"}
          </button>
        </span>
      ) : null}
    </span>
  );
}

function TeacherStudentRow({
  item,
  busy,
  onKick,
  onNote,
}: {
  item: TeacherStudentItem;
  busy: boolean;
  onKick: () => void;
  onNote: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const studentName = item.profile?.full_name ?? "Student";
  const roleLabel = studentRoleLabel(item);

  return (
    <article>
      <div className="flex items-center gap-3 py-3">
        <Avatar src={item.profile?.avatar_url ?? null} name={studentName} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-5 text-[#26323A]">{studentName}</h3>
          <p className="mt-0.5 truncate text-xs font-medium text-[#7B858C]">{roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide student details" : "Show student details"}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <button type="button" onClick={onNote} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]" aria-label={`Add note for ${studentName}`}>
          <NoteAddIcon />
        </button>
        <StudentActionMenu busy={busy} onKick={onKick} />
      </div>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="pb-4 pl-0 pr-2">
            <dl className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,0.85fr)] gap-x-4 gap-y-3 rounded-[18px] bg-[#F7FAFB] px-4 py-3 text-sm">
              {item.parent ? null : <RequestDetail label="Email" value={item.profile?.email} singleLine />}
              <RequestDetail label="Age" value={displayAge(item.profile)} />
              {item.parent ? null : <RequestDetail label="Phone" value={item.profile?.phone_number} singleLine />}
              <RequestDetail label="Gender" value={formatStudentDetailGender(item.profile?.gender ?? null)} />
              {item.parent ? (
                <>
                  <RequestDetail label="Parent" value={item.parent.full_name} singleLine />
                  <RequestDetail label="Parent Phone" value={item.parent.phone_number} singleLine />
                  <RequestDetail label="Parent Email" value={item.parent.email} singleLine />
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </article>
  );
}

function TeacherFamilyRow({
  group,
  busyStudentId,
  onKick,
  onNote,
}: {
  group: { parent: ParentDisplay | null; children: TeacherStudentItem[] };
  busyStudentId: string | null;
  onKick: (student: TeacherStudentItem) => void;
  onNote: (student: TeacherStudentItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const parentName = group.parent?.full_name?.trim() || group.children[0]?.profile?.full_name?.trim() || "No parent profile";
  const childCount = group.children.length;

  return (
    <article>
      <div className="flex items-center gap-3 py-3">
        <Avatar src={group.parent?.avatar_url ?? group.children[0]?.profile?.avatar_url ?? null} name={parentName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-5 text-[#26323A]">{parentName}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-[#7B858C]">Parent</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide parent details" : "Show parent details"}
        >
          <ChevronIcon expanded={expanded} />
        </button>
      </div>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="space-y-3 pb-4 pl-0 pr-2">
            <dl className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,0.85fr)] gap-x-4 gap-y-3 rounded-[18px] bg-[#F7FAFB] px-4 py-3 text-sm">
              <RequestDetail label="Parent" value={group.parent?.full_name} singleLine />
              <RequestDetail label="Phone" value={group.parent?.phone_number} singleLine />
              <RequestDetail label="Email" value={group.parent?.email} singleLine />
            </dl>
            <div className="divide-y divide-[#EEF2F4] rounded-[18px] bg-[#FCFDFD] px-3">
              {group.children.map((student) => (
                <div key={student.enrollment.id} className="relative flex items-center gap-3 py-3">
                  <Avatar src={student.profile?.avatar_url ?? null} name={student.profile?.full_name ?? "Student"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#26323A]">{student.profile?.full_name ?? "Student"}</p>
                    <p className="mt-0.5 truncate text-xs text-[#7B858C]">Child</p>
                  </div>
                  <button type="button" onClick={() => onNote(student)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]" aria-label={`Add note for ${student.profile?.full_name ?? "student"}`}>
                    <NoteAddIcon />
                  </button>
                  <StudentActionMenu
                    busy={busyStudentId === student.enrollment.student_profile_id}
                    onKick={() => onKick(student)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ChildNoteRecipientPrompt({
  studentName,
  parentName,
  onClose,
  onGoToParent,
}: {
  studentName: string;
  parentName: string;
  onClose: () => void;
  onGoToParent: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-6 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-xl font-semibold">Message parent</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          {studentName} is a child profile. Notes for this student should be sent to {parentName || "their parent"}.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-2 py-2 text-sm font-semibold text-[#6B747B]">
            Cancel
          </button>
          <button type="button" onClick={onGoToParent} className="rounded-full bg-[#17624F] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F4537]">
            Go to parent
          </button>
        </div>
      </div>
    </div>
  );
}

// One RPC call instead of mosque -> program -> enrollment -> [profile+link] -> parent -> (in
// the child TeacherStudentNotesPage) notes -> authors, as a component-level waterfall of
// roughly eight sequential stages across two components. Notes are fetched here too and
// passed down as the child's initial data, so it no longer needs its own on-mount fetch --
// only its refresh-after-send/delete fetch remains, which is a one-off user action, not a
// page-load cost.
export function TeacherStudentNotesData({ slug, programId, studentId }: { slug: string; programId: string; studentId: string }) {
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [target, setTarget] = useState<TeacherStudentItem | null>(null);
  const [initialNotes, setInitialNotes] = useState<StudentNoteWithContext[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;

      const { data, error: rpcError } = await supabase.rpc("get_teacher_student_notes_snapshot", { p_slug: slug, p_program_id: programId, p_student_id: studentId });
      if (cancelled) {
        return;
      }
      if (rpcError) {
        setError(friendlyErrorMessage(rpcError, "Could not load notes."));
        setLoading(false);
        return;
      }

      const snapshot = data as unknown as {
        error: string | null;
        mosque: Mosque | null;
        program: Program | null;
        enrollment: Enrollment | null;
        profile: StudentDisplay | null;
        parent: ParentDisplay | null;
        notes: Array<Database["public"]["Tables"]["program_student_notes"]["Row"]>;
        authors: Profile[];
      } | null;

      if (!snapshot || snapshot.error || !snapshot.mosque || !snapshot.program || !snapshot.enrollment) {
        setError(snapshot?.error ?? "Student enrollment not found.");
        setLoading(false);
        return;
      }

      const authors = snapshot.authors ?? [];
      const recipient = snapshot.parent ?? snapshot.profile;
      const notes = (snapshot.notes ?? []).map((note) => ({
        ...note,
        program: snapshot.program as Program,
        student: snapshot.profile,
        recipient: recipient as Profile | null,
        author: authors.find((author) => author.id === note.author_profile_id) ?? null,
      }));

      setMosque(snapshot.mosque);
      setProgram(snapshot.program);
      setTarget({
        enrollment: snapshot.enrollment,
        profile: snapshot.profile ?? null,
        parent: snapshot.parent ?? null,
      });
      setInitialNotes(notes);
      setCurrentUserId(userId);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [programId, slug, studentId]);

  if (loading) {
    return <DirectorySkeleton layout="inbox" />;
  }

  if (error) {
    return <EmptyState title="Could not load notes" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program || !target) {
    return <EmptyState title="Student not found" text="This student could not be loaded for notes." />;
  }

  return (
    <TeacherStudentNotesPage
      key={`${program.id}:${target.enrollment.student_profile_id}`}
      mosque={mosque}
      program={program}
      target={target}
      currentUserId={currentUserId}
      initialNotes={initialNotes}
    />
  );
}

function TeacherStudentNotesPage({
  mosque,
  program,
  target,
  currentUserId,
  initialNotes,
}: {
  mosque: Mosque | null;
  program: Program;
  target: { enrollment: Enrollment; profile: StudentDisplay | null; parent?: ParentDisplay | null };
  currentUserId: string | null;
  initialNotes: StudentNoteWithContext[];
}) {
  const [notes, setNotes] = useState<StudentNoteWithContext[]>(initialNotes);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<StudentNoteWithContext | null>(null);
  const studentName = target.profile?.full_name?.trim() || "Student";
  const recipient = target.parent ?? target.profile;
  const recipientName = recipient?.full_name?.trim() || (target.parent ? "Parent" : studentName);
  const recipientKind = target.parent ? "Parent" : "Student";
  const recipientAvatar = target.parent?.avatar_url ?? target.profile?.avatar_url ?? null;

  async function loadNotes() {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: noteRows, error: noteError } = await supabase
      .from("program_student_notes")
      .select("*")
      .eq("program_id", program.id)
      .eq("student_profile_id", target.enrollment.student_profile_id)
      .order("created_at", { ascending: true });

    if (noteError) {
      setError(friendlyErrorMessage(noteError, "Could not load notes."));
      setLoading(false);
      return;
    }

    const authorIds = Array.from(new Set((noteRows ?? []).map((note) => note.author_profile_id)));
    const { data: authors } = authorIds.length ? await supabase.from("profiles").select("*").in("id", authorIds) : { data: [] as Profile[] };
    setNotes(
      (noteRows ?? []).map((note) => ({
        ...note,
        program,
        student: target.profile,
        recipient: recipient as Profile | null,
        author: (authors ?? []).find((author) => author.id === note.author_profile_id) ?? null,
      })),
    );
    setLoading(false);
  }

  async function sendNote() {
    if (!mosque || !currentUserId || !recipient?.id || (!message.trim() && attachments.length === 0)) {
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: inserted, error: insertError } = await supabase
      .from("program_student_notes")
      .insert({
        mosque_id: mosque.id,
        program_id: program.id,
        student_profile_id: target.enrollment.student_profile_id,
        recipient_profile_id: recipient.id,
        parent_profile_id: target.parent?.id ?? null,
        author_profile_id: currentUserId,
        category: "note",
        message: message.trim(),
        attachments: attachments as unknown as Json,
      })
      .select("id")
      .single();
    setBusy(false);
    if (insertError) {
      setError(friendlyErrorMessage(insertError, "Could not send this note."));
      return;
    }
    setMessage("");
    setAttachments([]);
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    if (inserted) {
      void notifyNoteSent(program.id, inserted.id);
    }
    await loadNotes();
  }

  async function deleteNote(note: StudentNoteWithContext) {
    if (deletingNoteId) {
      return;
    }
    setDeletingNoteId(note.id);
    setError(null);
    const token = await getCurrentAccessToken();
    if (!token) {
      setDeletingNoteId(null);
      setError("Log in required.");
      return;
    }
    const response = await fetch(`/api/programs/${program.id}/notes/${note.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeletingNoteId(null);
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setError(result.error ?? "Could not delete note.");
      return;
    }
    setNotes((current) => current.filter((item) => item.id !== note.id));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }

  return (
    <div className="bg-white px-0 pb-28 pt-0 text-[#26323A]">
      <div className="flex min-h-[calc(100vh-230px)] flex-col">
        <section className="border-b border-[#E6ECEF] px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <Avatar src={recipientAvatar} name={recipientName} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#EEF6F7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2F8FB3]">{recipientKind}</span>
                {target.parent ? <span className="truncate text-xs font-semibold text-[#6B747B]">For {studentName}</span> : null}
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold leading-6">{recipientName}</h1>
              <p className="mt-1 truncate text-sm font-semibold text-[#17624F]">{program.title}</p>
              
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col px-4">
          <div className="min-h-[280px] flex-1 space-y-3 overflow-y-auto py-4">
            {error ? <div className="rounded-xl bg-[#FDEDEA] px-3 py-2 text-sm text-[#A4352A]">{error}</div> : null}
            {loading ? (
              <InboxLoadingPanel label="Loading student notes" />
            ) : notes.length ? (
              notes.map((note) => <StudentNoteBubble key={note.id} note={note} viewer="teacher" deleting={deletingNoteId === note.id} onDelete={setPendingDeleteNote} />)
            ) : (
              <MiniEmpty text="No notes have been sent for this student in this class." />
            )}
          </div>
          <div className="mt-3 flex items-end gap-2 rounded-[28px] border border-[#D6DCE0] bg-[#F8FAFB] px-3 py-2 shadow-[0_10px_24px_rgba(38,50,58,0.08)]">
            <div className="min-w-0 flex-1 space-y-2">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write a note..."
                rows={1}
                className="max-h-32 min-h-10 w-full resize-none bg-transparent px-1 py-2 text-sm leading-6 text-[#26323A] outline-none placeholder:text-[#9AA4AA]"
              />
              <MessageAttachmentComposer programId={program.id} attachments={attachments} onChange={setAttachments} disabled={busy} onError={setError} />
            </div>
            <button
              type="button"
              disabled={busy || (!message.trim() && attachments.length === 0)}
              onClick={sendNote}
              className={cn(
                "mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                (message.trim() || attachments.length > 0) && !busy ? "bg-[#2F80ED] text-white" : "bg-[#D6DCE0] text-white",
              )}
              aria-label="Send note"
            >
              <SendUpIcon />
            </button>
          </div>
        </section>
      </div>
      {pendingDeleteNote ? (
        <ConfirmModal
          title="Delete this note?"
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            await deleteNote(pendingDeleteNote);
            setPendingDeleteNote(null);
          }}
          onCancel={() => setPendingDeleteNote(null)}
        />
      ) : null}
    </div>
  );
}

function RequestDetail({ label, value, singleLine = false }: { label: string; value: string | null | undefined; singleLine?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-semibold leading-5 text-[#26323A]", singleLine ? "truncate whitespace-nowrap" : "break-words")}>{value?.trim() || "Not provided"}</dd>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded ? <path d="m7 14 5-5 5 5" /> : <path d="m7 10 5 5 5-5" />}
    </svg>
  );
}

function MoreVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

function ShareLinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.6" />
      <path d="m8.2 13.2 7.6 4.6" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.3 9A7 7 0 0 0 6.7 6.7L4 9" />
      <path d="M5.7 15A7 7 0 0 0 17.3 17.3L20 15" />
    </svg>
  );
}

function SendUpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5" />
      <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21 10.5-8.6 8.6a5 5 0 0 1-7.1-7.1l9.2-9.2a3.4 3.4 0 0 1 4.8 4.8l-9.2 9.2a1.8 1.8 0 0 1-2.5-2.5l8.6-8.6" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

function StopRecordingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.8l9.1-6.2a1 1 0 0 0 0-1.7L9.6 4.9A1 1 0 0 0 8 5.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <rect x="7" y="5" width="3.8" height="14" rx="1.4" />
      <rect x="13.2" y="5" width="3.8" height="14" rx="1.4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function SortDirectionIcon({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {direction === "asc" ? (
        <>
          <path d="M12 19V5" />
          <path d="m6 11 6-6 6 6" />
        </>
      ) : (
        <>
          <path d="M12 5v14" />
          <path d="m6 13 6 6 6-6" />
        </>
      )}
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

function StudentsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="7.2" r="3" />
      <circle cx="5.8" cy="9" r="2.3" />
      <circle cx="18.2" cy="9" r="2.3" />
      <path d="M7.3 20c.55-3.1 2.12-4.65 4.7-4.65s4.15 1.55 4.7 4.65" />
      <path d="M2.8 18.4c.38-2.24 1.43-3.36 3.15-3.36.75 0 1.37.21 1.87.64" />
      <path d="M16.18 15.68c.5-.43 1.12-.64 1.87-.64 1.72 0 2.77 1.12 3.15 3.36" />
    </svg>
  );
}

function InstructorManageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6.4 6.8 5.7-2.25 5.7 2.25-5.7 2.25-5.7-2.25Z" />
      <path d="M17.8 6.8v3.35" />
      <circle cx="12" cy="12.2" r="3.05" />
      <path d="M5.9 20.3c.8-3.12 2.84-4.68 6.1-4.68s5.3 1.56 6.1 4.68" />
    </svg>
  );
}

function AttendanceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 3-4 3 2 4-6" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 11 18-5v12L3 13v-2Z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 15h4" />
      <path d="M8 18h8" />
    </svg>
  );
}

function FinanceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.4" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
      <path d="M16.5 14.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z" />
    </svg>
  );
}

function PermissionClassIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V7.5L12 4l8 3.5V19" />
      <path d="M8 19v-6h8v6" />
      <path d="M10 9h4" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h6v6" />
      <path d="m10 14 10-10" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

function EditClassIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function PhotoIcon({ className = "h-5 w-5" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m6.5 17 4.2-4.2a1.4 1.4 0 0 1 2 0L15.5 15l1.2-1.2a1.4 1.4 0 0 1 2 0l1.8 1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
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

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4.5h6a1.5 1.5 0 0 1 1.5 1.5v.75h-9V6A1.5 1.5 0 0 1 9 4.5Z" />
      <path d="M8 6.75H6.5A2.5 2.5 0 0 0 4 9.25v8.25A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V9.25a2.5 2.5 0 0 0-2.5-2.5H16" />
      <path d="M8.5 12.5h7" />
      <path d="M8.5 16h5" />
    </svg>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E1E8EC] bg-white p-5 shadow-[0_10px_28px_rgba(38,50,58,0.06)] md:p-6">
      <h2 className="text-base font-semibold text-[#26323A]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProgramMediaGallery({ items }: { items: readonly ProgramMedia[] }) {
  const [active, setActive] = useState(0);
  const activeItem = items[active] ?? items[0];

  return (
    <DetailSection title="Class Media">
      <div className="overflow-hidden rounded-xl border border-[#D6DCE0] bg-[var(--workspace)]">
        <div className="relative flex aspect-[16/10] items-end overflow-hidden p-5 text-white">
          {mediaType(activeItem) === "video" ? (
            <video src={mediaUrl(activeItem)} className="absolute inset-0 h-full w-full object-cover" controls preload="metadata" />
          ) : (
            <Image src={mediaUrl(activeItem)} alt={mediaAltText(activeItem)} fill className="object-cover" sizes="(min-width: 1024px) 720px, 100vw" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          {mediaType(activeItem) === "video" ? (
            <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#17624F] shadow-lg" aria-hidden>
              ▶
            </span>
          ) : null}
          <div className="pointer-events-none relative">
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">{mediaType(activeItem) === "video" ? "Video" : "Photo"}</p>
            <p className="mt-1 text-lg font-semibold">{mediaTitle(activeItem)}</p>
            {mediaCaption(activeItem) ? <p className="mt-1 max-w-xl text-sm leading-5 text-white/85">{mediaCaption(activeItem)}</p> : null}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 border-t border-[#D6DCE0] bg-white p-2">
          {items.map((item, index) => (
            <button
              key={`${mediaShortLabel(item)}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                "relative aspect-square overflow-hidden border text-left transition",
                active === index ? "border-[#248B72] ring-2 ring-[#B9E4D7]" : "border-[#D6DCE0]",
              )}
              aria-label={`Show ${mediaTitle(item)}`}
            >
              {mediaType(item) === "video" ? <video src={mediaUrl(item)} className="h-full w-full object-cover" preload="metadata" /> : <Image src={mediaThumbnail(item)} alt={mediaAltText(item)} fill className="object-cover" sizes="96px" />}
              <span className="absolute inset-0 bg-black/15" />
              <span className="absolute bottom-1 left-1 right-1 truncate text-[10px] font-medium text-white">{mediaShortLabel(item)}</span>
            </button>
          ))}
        </div>
      </div>
    </DetailSection>
  );
}

function contentDescription(row: ProgramContentSection) {
  return row.description ?? "";
}

function contentDuration(row: ProgramContentSection) {
  return row.duration_text ?? "";
}

function mediaUrl(item: ProgramMedia) {
  return item.url;
}

function mediaThumbnail(item: ProgramMedia) {
  return item.thumbnail_url ?? item.url;
}

function mediaTitle(item: ProgramMedia) {
  return item.title ?? "Class media";
}

function mediaCaption(item: ProgramMedia) {
  return item.caption ?? "";
}

function mediaAltText(item: ProgramMedia) {
  return item.alt_text ?? mediaTitle(item);
}

function mediaShortLabel(item: ProgramMedia) {
  return item.short_label ?? mediaTitle(item);
}

function mediaType(item: ProgramMedia) {
  const inferred = inferMediaTypeFromUrl(item.url) ?? inferMediaTypeFromUrl(item.thumbnail_url ?? "");
  return inferred ?? item.media_type;
}

function inferMediaTypeFromUrl(url: string | null | undefined): "photo" | "video" | null {
  if (!url) {
    return null;
  }
  const pathname = url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  const extension = pathname.split(".").pop() ?? "";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(extension)) {
    return "video";
  }
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(extension)) {
    return "photo";
  }
  return null;
}

function SidebarFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-[#6B747B]">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium text-[#26323A]">{value}</dd>
    </div>
  );
}

function ProgramDetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="text-[#6B747B]">{label}</dt>
      <dd className="max-w-[55%] text-right font-semibold text-[#26323A]">{value}</dd>
    </div>
  );
}

function ProgramFaqSection({ faqs }: { faqs: Array<Pick<ProgramFaq, "id" | "question" | "answer">> }) {
  const [openId, setOpenId] = useState("");
  return (
    <section className="overflow-hidden rounded-[28px] bg-[#F6F1FF] p-4 shadow-[0_14px_36px_rgba(75,52,117,0.10)]">
      <div className="rounded-[24px] bg-white/72 p-4 ring-1 ring-white">
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#5D4A86] shadow-sm">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EEE6FF] text-[#5D4A86]">?</span>
          Frequently Asked Questions
        </div>
        <div className="mt-5 space-y-3">
          {faqs.map((faq) => {
            const open = faq.id === openId;
            return (
              <button
                key={faq.id}
                type="button"
                onClick={() => setOpenId(open ? "" : faq.id)}
                className={cn(
                  "w-full rounded-[18px] bg-white p-4 text-left shadow-[0_10px_24px_rgba(38,50,58,0.08)] ring-1 ring-[#E7E0F2] transition",
                  open && "ring-[#BFA9E8]",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold leading-5 text-[#26323A]">{faq.question}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3EEFC] text-[#5D4A86]">
                    <ChevronIcon expanded={open} />
                  </span>
                </span>
                {open ? <span className="mt-3 block text-sm leading-6 text-[#52616A]">{faq.answer}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function trackEffectivePriceCents(track: ProgramTrack, program: Program) {
  const monthlyCents = track.pricing_override_enabled ? track.price_monthly_cents : program.price_monthly_cents;
  const annualCents = track.pricing_override_enabled ? track.price_annual_cents : program.price_annual_cents;
  return { monthlyCents, annualCents };
}

function trackPriceLine(track: ProgramTrack | null, program: Program, forType?: PaymentType, options?: { bareLabel?: boolean }): { label: string } | null {
  if (!program.is_paid) {
    return { label: "Free" };
  }
  const { monthlyCents, annualCents } = track ? trackEffectivePriceCents(track, program) : { monthlyCents: program.price_monthly_cents, annualCents: program.price_annual_cents };
  const offersMonthly = program.offers_monthly_payment !== false && Boolean(monthlyCents);
  const offersAnnual = Boolean(program.offers_annual_payment && annualCents);
  if (!offersMonthly && !offersAnnual) {
    return null;
  }
  const useAnnual =
    forType === "annual" && offersAnnual
      ? true
      : forType === "monthly" && offersMonthly
        ? false
        : !offersMonthly && offersAnnual;
  const label = useAnnual
    ? options?.bareLabel
      ? formatPrice(annualCents)
      : program.is_ongoing
        ? `${formatPrice(annualCents)}/yr`
        : `${formatPrice(annualCents)} pay in full`
    : `${formatPrice(monthlyCents)}/mo`;
  return { label };
}

function trackPricingDeal(track: ProgramTrack | null, program: Program): { annualPriceCents: number; savingsCents: number } | null {
  if (!program.is_paid) {
    return null;
  }
  const { monthlyCents, annualCents } = track ? trackEffectivePriceCents(track, program) : { monthlyCents: program.price_monthly_cents, annualCents: program.price_annual_cents };
  const offersMonthly = program.offers_monthly_payment !== false && Boolean(monthlyCents);
  const offersAnnual = Boolean(program.offers_annual_payment && annualCents);
  if (!offersMonthly || !offersAnnual) {
    return null;
  }
  const durationMonths = pricingComparisonDurationMonths(program);
  if (!durationMonths) {
    return null;
  }
  const monthlyTotal = (monthlyCents ?? 0) * durationMonths;
  const annual = annualCents ?? 0;
  if (!monthlyTotal || !annual || annual >= monthlyTotal) {
    return null;
  }
  return { annualPriceCents: annual, savingsCents: monthlyTotal - annual };
}

function hasPerTrackPricing(tracks: ProgramTrack[]) {
  return tracks.some((track) => Boolean(track.pricing_override_enabled && (track.price_monthly_cents || track.price_annual_cents)));
}

function TrackPricingDealCaption({ track, program, paymentType }: { track: ProgramTrack | null; program: Program; paymentType?: PaymentType }) {
  const deal = trackPricingDeal(track, program);
  if (!deal) {
    return null;
  }
  return (
    <p className="mt-1 text-xs font-semibold text-[#8A6418]">
      {paymentType === "annual"
        ? `Saves ${formatPrice(deal.savingsCents)}`
        : paymentType === "monthly"
          ? `Save ${formatPrice(deal.savingsCents)} paying ${program.is_ongoing ? "annually" : "in full"}`
          : `Save ${formatPrice(deal.savingsCents)} by paying ${program.is_ongoing ? "annually" : "in full"}`}
    </p>
  );
}

function TrackPriceNumber({ price }: { price: { label: string } | null }) {
  if (!price) {
    return null;
  }
  return <span className="block font-mono text-2xl font-black leading-none tracking-tight tabular-nums text-[#17624F]">{price.label}</span>;
}

function trackCapacityBadge(track: ProgramTrack, enrolledCountByTrackId: Record<string, number>): { label: string; tone: "full" | "low" } | null {
  if (track.capacity == null) {
    return null;
  }
  const remaining = track.capacity - (enrolledCountByTrackId[track.id] ?? 0);
  if (remaining <= 0) {
    return { label: "Full", tone: "full" };
  }
  if (remaining < 10) {
    return { label: "Few Spots Left!", tone: "low" };
  }
  return null;
}

function ProgramScheduleOptionsDisplay({
  tracks,
  program,
  fallbackSchedule,
  enrolledCountByTrackId = {},
}: {
  tracks: ProgramTrack[];
  program?: Program | null;
  fallbackSchedule: string;
  enrolledCountByTrackId?: Record<string, number>;
}) {
  const showTrackPrices = program ? hasPerTrackPricing(tracks) : false;
  return (
    <div className="mt-4 space-y-2 border-t border-[#E6ECEF] pt-4">
      {tracks.length ? (
        <div className="space-y-2">
          {tracks.map((track) => {
            const scheduleLines = scheduleSessionLines(track.schedule, null);
            const price = program && showTrackPrices ? trackPriceLine(track, program) : null;
            const capacityBadge = trackCapacityBadge(track, enrolledCountByTrackId);
            return (
              <div key={track.id} className={cn("relative overflow-hidden rounded-[14px] p-3 ring-1", capacityBadge?.tone === "full" ? "bg-[#F3F4F5] ring-[#E1E8EC] opacity-75" : "bg-[#F8FBFC] ring-[#E6ECEF]", capacityBadge?.tone === "low" ? "pt-7" : "")}>
                {capacityBadge?.tone === "low" ? (
                  <span className="absolute right-0 top-0 rounded-bl-[10px] bg-[#C0392B] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{capacityBadge.label}</span>
                ) : null}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#26323A]">{track.name}</p>
                    <div className="mt-1 space-y-0.5">
                      {scheduleLines.map((line) => (
                        <p key={line} className="text-xs font-medium leading-5 text-[#52616A]">{line}</p>
                      ))}
                    </div>
                    {program ? <TrackPricingDealCaption track={track} program={program} /> : null}
                  </div>
                  {price ? <div className="shrink-0 text-right"><TrackPriceNumber price={price} /></div> : null}
                </div>
                {program ? <TrackPayInFullPriceCaption track={track} program={program} /> : null}
                {track.eligibility_comment ? <p className="mt-1.5 text-xs leading-5 text-[#7B858C]">{track.eligibility_comment}</p> : null}
                {capacityBadge?.tone === "full" ? <span className="mt-2 inline-block rounded-full bg-[#E1E8EC] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Full</span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        (() => {
          const price = program ? trackPriceLine(null, program) : null;
          const scheduleLines = fallbackSchedule ? [fallbackSchedule] : ["Schedule will be announced"];
          return (
            <div className="rounded-[14px] bg-[#F8FBFC] p-3 ring-1 ring-[#E6ECEF]">
              <p className="text-sm font-semibold text-[#26323A]">Class schedule</p>
              <div className="mt-1 space-y-0.5">
                {scheduleLines.map((line) => (
                  <p key={line} className="text-xs font-medium leading-5 text-[#52616A]">{line}</p>
                ))}
              </div>
              {price ? <div className="mt-3"><TrackPriceNumber price={price} /></div> : null}
              {program ? <TrackPricingDealCaption track={null} program={program} /> : null}
              {program ? <TrackPayInFullPriceCaption track={null} program={program} /> : null}
            </div>
          );
        })()
      )}
    </div>
  );
}

function TrackPayInFullPriceCaption({ track, program }: { track: ProgramTrack | null; program: Program }) {
  if (program.is_ongoing) {
    return null;
  }
  const deal = trackPricingDeal(track, program);
  if (!deal) {
    return null;
  }
  return <p className="shrink-0 text-xs font-semibold text-[#6B747B]">Pay in full: {formatPrice(deal.annualPriceCents)}</p>;
}

function ProgramPaymentOptionsDisplay({ program, tracks = [] }: { program: Program; tracks?: ProgramTrack[] }) {
  const options = programPaymentOptions(program);
  if (!program.is_paid) {
    return (
      <div className="mt-4 space-y-2 border-t border-[#E6ECEF] pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Price options</p>
        <div className="rounded-[14px] bg-[#F7FAFB] p-3 ring-1 ring-[#E6ECEF]">
          <p className="text-sm font-semibold text-[#26323A]">Free</p>
          <p className="mt-1 text-xs leading-5 text-[#6B747B]">No payment is required for this class.</p>
        </div>
      </div>
    );
  }
  if (hasPerTrackPricing(tracks)) {
    return null;
  }
  const primaryPrice = trackPriceLine(null, program);
  return (
    <div className="mt-4 space-y-2 border-t border-[#E6ECEF] pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Price options</p>
      {primaryPrice ? (
        <div className="rounded-[14px] bg-[#F7FAFB] p-3 ring-1 ring-[#E6ECEF]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Program price</p>
          <p className="mt-1 font-mono text-3xl font-black leading-none tracking-tight tabular-nums text-[#17624F]">{primaryPrice.label}</p>
          <TrackPricingDealCaption track={null} program={program} />
        </div>
      ) : null}
      {options.map((option) => (
        <div key={option.type} className="rounded-[14px] bg-[#F7FAFB] p-3 ring-1 ring-[#E6ECEF]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-[#26323A]">{option.title}</p>
            {option.badge ? <span className="rounded-full bg-[#EAF7F1] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#17624F]">{option.badge}</span> : null}
          </div>
          <p className="mt-1 text-sm font-bold text-[#17624F]">{option.price}</p>
          <p className="mt-1 text-xs leading-5 text-[#6B747B]">{option.subtitle}</p>
        </div>
      ))}
    </div>
  );
}

function paymentTypeLabel(type: PaymentType, program: Pick<Program, "is_ongoing">): string {
  if (type === "monthly") {
    return "Monthly";
  }
  return program.is_ongoing ? "Annual subscription" : "Pay in Full";
}

function ProgramPaymentOptionSelector({
  program,
  selectedPaymentType,
  onChange,
}: {
  program: Program;
  selectedPaymentType: PaymentType;
  onChange: (type: PaymentType) => void;
}) {
  const offeredTypes = programOfferedPaymentTypes(program);
  if (offeredTypes.length <= 1) {
    return null;
  }
  return (
    <div className="space-y-2">
      {offeredTypes.map((type) => {
        const selected = type === selectedPaymentType;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[14px] border p-3 text-left transition",
              selected ? "border-[#17624F] bg-[#EAF7F1] ring-1 ring-[#17624F]" : "border-[#D6DCE0] bg-[#F8FBFC] hover:border-[#9EC8D5]",
            )}
          >
            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border text-[11px]", selected ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#B9C3C8] bg-white text-transparent")}>
              <CheckIcon />
            </span>
            <span className="text-sm font-semibold text-[#26323A]">{paymentTypeLabel(type, program)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChildEnrollmentSelector({
  program,
  childrenProfiles,
  statuses,
  selfProfileId,
  selectedChildIds,
  onToggle,
}: {
  program: Program;
  childrenProfiles: StudentDisplay[];
  statuses: Record<string, { enrolled: boolean; requestStatus: string | null }>;
  selfProfileId?: string | null;
  selectedChildIds: string[];
  onToggle: (childId: string) => void;
}) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Select students</p>
      <div className="mt-2 space-y-2">
        {childrenProfiles.map((child) => {
          const status = statuses[child.id];
          const eligibility = isProfileEligibleForProgram(child, program);
          const locked = status?.enrolled || status?.requestStatus === "pending" || status?.requestStatus === "waitlisted" || !eligibility.eligible;
          const checked = selectedChildIds.includes(child.id);
          const detail = status?.enrolled
            ? "Already enrolled"
            : status?.requestStatus === "pending"
              ? "Pending review"
              : status?.requestStatus === "waitlisted"
                ? "Waitlisted"
                : eligibility.eligible
                  ? ""
                  : eligibility.reason;
          const isSelf = child.id === selfProfileId;
          return (
            <button
              key={child.id}
              type="button"
              onClick={() => (locked ? undefined : onToggle(child.id))}
              disabled={locked}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-[14px] border p-3 text-left text-sm transition",
                checked ? "border-[#17624F] bg-[#EAF7F1] ring-1 ring-[#17624F]" : "border-[#D6DCE0] bg-[#F8FBFC] hover:border-[#9EC8D5]",
                locked && "cursor-not-allowed opacity-65",
              )}
            >
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border text-[11px]", checked ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#B9C3C8] bg-white text-transparent")}>
                <CheckIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-[#26323A]">
                  {child.full_name ?? "Student"} {isSelf ? "(You)" : ""}
                </span>
                {detail ? <span className={cn("block truncate text-xs", eligibility.eligible ? "text-[#6B747B]" : "text-[#A34B16]")}>{detail}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProgramTrackSelector({
  tracks,
  selectedTrackIds,
  program,
  enrolledCountByTrackId = {},
  selectedPaymentType,
  onToggle,
}: {
  tracks: ProgramTrack[];
  selectedTrackIds: string[];
  program: Program;
  enrolledCountByTrackId?: Record<string, number>;
  selectedPaymentType?: PaymentType;
  onToggle: (trackId: string) => void;
}) {
  const ruleText = trackSelectionRuleText(program, tracks.length);
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[11px] font-medium text-[#7B858C]">{ruleText}</p>
      <div className="space-y-2">
        {tracks.map((track) => {
          const selected = selectedTrackIds.includes(track.id);
          const scheduleLines = scheduleSessionLines(track.schedule, null);
          const capacityBadge = trackCapacityBadge(track, enrolledCountByTrackId);
          const full = capacityBadge?.tone === "full";
          const price = trackPriceLine(track, program, selectedPaymentType);
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => (full ? undefined : onToggle(track.id))}
              disabled={full}
              className={cn(
                "relative w-full overflow-hidden rounded-[14px] p-3 text-left ring-1 transition",
                full
                  ? "cursor-not-allowed bg-[#F3F4F5] opacity-75 ring-[#E1E8EC]"
                  : selected
                    ? "bg-[#EAF7F1] ring-2 ring-[#17624F]"
                    : "bg-[#F7FAFB] ring-[#E6ECEF] hover:ring-[#9EC8D5]",
                capacityBadge?.tone === "low" ? "pt-7" : "",
              )}
            >
              {capacityBadge?.tone === "low" ? (
                <span className="absolute right-0 top-0 rounded-bl-[10px] bg-[#C0392B] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{capacityBadge.label}</span>
              ) : null}
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <span className="min-w-0">
                  <span className="block truncate whitespace-nowrap text-[13px] font-semibold leading-5 text-[#26323A]">{track.name}</span>
                  {track.description ? <span className="mt-1 block text-xs leading-5 text-[#52616A]">{track.description}</span> : null}
                  {(() => {
                    const deal = trackPricingDeal(track, program);
                    if (!deal) {
                      return null;
                    }
                    return (
                      <span className="mt-0.5 block text-[11px] font-semibold leading-5 text-[#8A6418]">
                        {selectedPaymentType === "annual"
                          ? program.is_ongoing
                            ? `Saves ${formatPrice(deal.savingsCents)}/year`
                            : `Saves ${formatPrice(deal.savingsCents)}`
                          : `Save ${formatPrice(deal.savingsCents)} ${program.is_ongoing ? "with annual subscription" : "paying in full"}`}
                      </span>
                    );
                  })()}
                </span>
                <span className="shrink-0 text-right">
                  <TrackPriceNumber price={price} />
                </span>
              </span>
              <span className="mt-1 block min-w-0 space-y-0.5">
                  {scheduleLines.map((line) => (
                    <span key={line} className="block text-xs font-medium leading-5 text-[#17624F]">{line}</span>
                  ))}
                {(() => {
                  const deal = trackPricingDeal(track, program);
                  if (!deal) {
                    return null;
                  }
                  return (
                    <span className="block text-[11px] font-semibold leading-5 text-[#6B747B]">
                      {program.is_ongoing ? `Annual: ${formatPrice(deal.annualPriceCents)}/yr` : `Pay in full: ${formatPrice(deal.annualPriceCents)}`}
                    </span>
                  );
                })()}
              </span>
              {full ? <span className="mt-2 inline-block rounded-full bg-[#E1E8EC] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Full</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleTrackControlRow({
  index,
  track,
  trackCount,
  program,
  selectedTrackIds,
  disabled,
  onToggle,
}: {
  index: number;
  track: ProgramTrack;
  trackCount: number;
  program: Pick<Program, "track_selection_mode" | "track_selection_count">;
  selectedTrackIds: string[];
  disabled: boolean;
  onToggle: () => void;
}) {
  const selected = selectedTrackIds.includes(track.id);
  void program;
  void trackCount;
  const selectedCount = selectedTrackIds.length;
  const rowDisabled = disabled;
  const schedule = scheduleSummary(track.schedule, null);
  const actionLabel = selected
    ? "Remove"
    : selectedCount >= 1
      ? "Switch"
      : "Add";

  return (
    <button
      type="button"
      disabled={rowDisabled}
      onClick={onToggle}
      className={cn("flex w-full items-start gap-3 py-4 text-left transition", rowDisabled ? "cursor-not-allowed opacity-60" : "hover:bg-[#F7FAFB]")}
    >
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", selected ? "bg-[#17624F] text-white" : "bg-[#EEF3F5] text-[#6B747B]")}>
        {selected ? <CheckIcon /> : String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#26323A]">{track.name}</span>
          {selected ? <span className="rounded-full bg-[#E6F5EE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#17624F]">Active</span> : null}
        </span>
        {track.description ? <span className="mt-1 block text-xs leading-5 text-[#6B747B]">{track.description}</span> : null}
        <span className="mt-1 block text-xs font-semibold text-[#2F6F83]">{schedule.full}</span>
      </span>
      <span className={cn("mt-0.5 min-w-16 shrink-0 text-right text-xs font-bold uppercase tracking-wide", selected ? "text-[#17624F]" : "text-[#2F8FB3]")}>{actionLabel}</span>
    </button>
  );
}

function RosterTrackOption({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm font-semibold text-[#26323A] hover:bg-[#F7FAFB]"
    >
      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border text-[11px]", checked ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#B9C3C8] bg-white text-transparent")}>✓</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function trackSelectionRuleText(program: Pick<Program, "track_selection_mode" | "track_selection_count">, trackCount: number) {
  void program;
  void trackCount;
  return "Select one";
}

function nextProgramTrackSelection(
  program: Pick<Program, "track_selection_mode" | "track_selection_count">,
  tracks: ProgramTrack[],
  currentTrackIds: string[],
  toggledTrackId: string,
) {
  const current = currentTrackIds.filter((trackId) => tracks.some((track) => track.id === trackId));
  if (current.includes(toggledTrackId)) {
    return current.filter((trackId) => trackId !== toggledTrackId);
  }
  void program;
  return [toggledTrackId];
}

function nextScheduleOptionSelection(
  program: Pick<Program, "track_selection_mode" | "track_selection_count">,
  tracks: ProgramTrack[],
  currentTrackIds: string[],
  toggledTrackId: string,
) {
  const current = currentTrackIds.filter((trackId) => tracks.some((track) => track.id === trackId));
  const selected = current.includes(toggledTrackId);

  if (selected) {
    return current.filter((trackId) => trackId !== toggledTrackId);
  }
  void program;
  return [toggledTrackId];
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function validateTrackSelection(program: Pick<Program, "track_selection_mode" | "track_selection_count">, tracks: ProgramTrack[], selectedTrackIds: string[]) {
  if (tracks.length === 0) {
    return { valid: true, message: "" };
  }

  const validSelectedCount = selectedTrackIds.filter((trackId) => tracks.some((track) => track.id === trackId)).length;
  void program;
  if (validSelectedCount !== 1) {
    return { valid: false, message: "Choose one schedule option." };
  }
  return { valid: true, message: "" };
}

async function replaceEnrollmentRequestTracks(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  requestIds: string[],
  selectedTrackIds: string[],
) {
  if (requestIds.length === 0) {
    return null;
  }

  const { error: deleteError } = await supabase.from("enrollment_request_tracks").delete().in("enrollment_request_id", requestIds);
  if (deleteError) {
    return deleteError.message;
  }

  const rows = requestIds.flatMap((requestId) => selectedTrackIds.map((trackId) => ({ enrollment_request_id: requestId, program_track_id: trackId })));
  if (!rows.length) {
    return null;
  }

  const { error: insertError } = await supabase.from("enrollment_request_tracks").insert(rows);
  return insertError?.message ?? null;
}

function ProgramCardGrid({
  programs,
  mosqueSlug,
  emptyText,
  enrolledProgramIds = [],
  detailBaseHref,
  detailReturnTo,
  applicationStatusByProgramId,
}: {
  programs: ProgramWithTeacher[];
  mosqueSlug: string;
  emptyText: string;
  enrolledProgramIds?: string[];
  detailBaseHref?: string;
  detailReturnTo?: string;
  applicationStatusByProgramId?: Record<string, ApplicantApplicationRow>;
}) {
  if (programs.length === 0) {
    return <EmptyState title="No classes available" text={emptyText} />;
  }

  return (
    <div className="grid gap-4 bg-[var(--workspace)] p-4 md:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => {
        const applicationRow = applicationStatusByProgramId?.[program.id];
        const enrolled = enrolledProgramIds.includes(program.id);
        const relationship = enrolled
          ? null
          : applicationRow
            ? programBrowseRelationship(applicationRow)
            : null;
        return (
          <ProgramCard
            key={program.id}
            program={program}
            enrolled={enrolled}
            detailHref={`${detailBaseHref ?? `/m/${mosqueSlug}/programs`}/${program.id}${detailReturnTo ? `?returnTo=${encodeURIComponent(detailReturnTo)}` : ""}`}
            relationship={relationship}
          />
        );
      })}
    </div>
  );
}

function programBrowseRelationship(row: ApplicantApplicationRow): { label: string; tone: "open" | "waitlist" | "closed" } | null {
  const status = getApplicationStatus(row.request);
  switch (status) {
    case "pending_review":
      return { label: "Application Submitted", tone: "closed" };
    case "waitlisted":
      return { label: "Waitlisted", tone: "waitlist" };
    case "approved_confirmation_required":
      return { label: "Approved — Action Needed", tone: "open" };
    case "completed_enrolled":
      return { label: "Enrolled", tone: "open" };
    default:
      return null;
  }
}

function EnrolledClassList({ programs, mosqueSlug }: { programs: ProgramWithTeacher[]; mosqueSlug: string }) {
  return (
    <div className="grid gap-4 bg-[var(--workspace)] p-4 md:grid-cols-2">
      {programs.map((program) => (
        <article key={program.id} className="overflow-hidden rounded-[22px] border border-[#CBD8DE] bg-white shadow-[0_16px_40px_rgba(38,50,58,0.09)]">
          <ProgramHero program={program} />
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <span className="inline-flex min-h-7 items-center rounded-full bg-[#E6F5EE] px-3 text-xs font-bold uppercase tracking-wide text-[#17624F]">Enrolled</span>
              <h3 className="line-clamp-2 text-lg font-semibold leading-6 text-[#26323A]">{program.title}</h3>
              <p className="mt-1 text-sm text-[#6B747B]">{scheduleSummary(program.schedule, program.schedule_notes).full}</p>
            </div>
            <AudienceDetails age={formatAgeRange(program.age_range_text)} gender={formatGender(program.audience_gender)} />
            <div className="divide-y divide-[#E3E8EC] border-t border-[#E3E8EC]">
              {program.track_switch_policy !== "disabled" ? (
                <TeacherActionLink href={`/m/${mosqueSlug}/portal/classes/${program.id}/schedule`} icon={<ScheduleIcon />} label="Schedule Options" />
              ) : null}
              <TeacherActionLink href={`/m/${mosqueSlug}/portal/announcements?tab=announcements`} icon={<MegaphoneIcon />} label="View Announcements" />
              <TeacherActionLink href={`/m/${mosqueSlug}/portal/announcements?tab=notes`} icon={<ClipboardIcon />} label="View Notes" />
              <TeacherActionLink href={`/m/${mosqueSlug}/programs/${program.id}?returnTo=${encodeURIComponent(`/m/${mosqueSlug}/portal/classes`)}`} icon={<ExternalLinkIcon />} label="Class Details" previewLabel="Class Details" />
              <TeacherActionLink href={`/m/${mosqueSlug}/portal/classes/${program.id}/withdrawal`} icon={<XIcon />} label="Request Withdrawal" previewLabel="Request Withdrawal" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function MyApplicationsList({
  slug,
  rows,
  onViewDetails,
}: {
  slug: string;
  rows: ApplicantApplicationRow[];
  onViewDetails: (row: ApplicantApplicationRow) => void;
}) {
  const sorted = [...rows].sort((a, b) => Date.parse(b.request.requested_at) - Date.parse(a.request.requested_at));
  return (
    <div className="space-y-3 bg-[var(--workspace)] p-4">
      {sorted.map((row) => {
        const status = getApplicationStatus(row.request);
        const paymentStatus = getApplicationPaymentStatus(row.request, row.program, row.subscription);
        const action = getApplicantPrimaryAction(status, paymentStatus, row.request, row.program);
        const statusLabel = getApplicationRowStatusLabel(status, paymentStatus);
        const childName = row.student?.full_name?.trim();
        const trackName = row.track?.name?.trim();
        return (
          <article key={row.request.id} className="overflow-hidden rounded-[22px] border border-[#E1E8EC] bg-white shadow-[0_10px_24px_rgba(38,50,58,0.07)]">
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#17624F]" aria-hidden>
                <DefaultProfileIcon className="h-5 w-5" compact />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold leading-5 text-[#26323A]">{row.program?.title ?? "Class"}</h3>
                <p className="mt-0.5 text-xs leading-5 text-[#6B747B]">
                  {childName ? `${childName} • ` : ""}
                  {trackName ? `${trackName} • ` : ""}
                  Submitted {timeAgo(row.request.requested_at)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", programStatusBadgeToneClass(applicationStatusTone(status)))}>{statusLabel}</span>
                  {paymentStatus !== "not_required" ? (
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", programStatusBadgeToneClass(paymentStatusTone(paymentStatus)))}>
                      {PAYMENT_STATUS_LABELS[paymentStatus]}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3">
                  {action.kind === "confirmation" ? (
                    <Link
                      href={`/m/${slug}/registration/${row.request.id}?returnTo=${encodeURIComponent(`/m/${slug}/portal/classes?tab=applications`)}`}
                      className="inline-flex min-h-10 w-full items-center justify-center rounded-[9px] bg-[#2E6E52] px-4 text-sm font-semibold !text-white shadow-[0_8px_18px_rgba(46,110,82,0.22)] transition-colors hover:bg-[#265D45] md:w-auto md:px-10"
                    >
                      {action.label}
                    </Link>
                  ) : action.kind === "class" && row.request.program_id ? (
                    <Link
                      href={`/m/${slug}/portal/classes/${row.request.program_id}`}
                      className="inline-flex min-h-10 w-full items-center justify-center rounded-[9px] bg-[#17624F] px-4 text-sm font-semibold !text-white transition-colors hover:bg-[#124F40]"
                    >
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onViewDetails(row)}
                      className="inline-flex min-h-10 w-full items-center justify-center rounded-[9px] border border-[#CBD5D9] bg-white px-4 text-sm font-semibold text-[#26323A] transition-colors hover:bg-[#F5F8F9]"
                    >
                      {action.label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ApplicantDetailsDrawer({
  row,
  slug,
  returnTo,
  onClose,
  onRescind,
  onCancelRegistration,
}: {
  row: ApplicantApplicationRow;
  slug: string;
  returnTo?: string;
  onClose: () => void;
  onRescind: () => void;
  onCancelRegistration?: () => void;
}) {
  const status = getApplicationStatus(row.request);
  const paymentStatus = getApplicationPaymentStatus(row.request, row.program, row.subscription);
  const statusLabel = getApplicationRowStatusLabel(status, paymentStatus);
  const childName = row.student?.full_name?.trim();
  const decisionNote = row.request.decision_note ?? row.request.review_note;
  const canRescind = status === "pending_review";
  const canCompleteRegistration = status === "approved_confirmation_required";
  const confirmationAction = getApplicantPrimaryAction(status, paymentStatus, row.request, row.program);
  const resolvedReturnTo = returnTo ?? `/m/${slug}/portal/classes?tab=applications`;

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: false } }));
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="flex h-full w-full max-w-md flex-col bg-white text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <div className="flex shrink-0 items-center justify-between border-b border-[#EEF2F4] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{row.program?.title ?? "Class"}</p>
            <h2 className="mt-0.5 text-base font-semibold">{childName || "Your application"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F6] text-[#26323A] hover:bg-[#E3ECEF]">
            <XIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#6B747B]">Application status</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", programStatusBadgeToneClass(applicationStatusTone(status)))}>
                {statusLabel}
              </span>
            </div>

            {childName ? (
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold text-[#26323A]">Applicant</h3>
                <div className="grid gap-1 rounded-[12px] border border-[#E1E8EC] bg-[#FAFCFC] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Student</span>
                    <span className="font-semibold">{childName}</span>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[#26323A]">Program Details</h3>
              <div className="grid gap-1 rounded-[12px] border border-[#E1E8EC] bg-[#FAFCFC] p-2.5">
                {isPaymentStatusMeaningful(row.request, row.program) ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Payment status</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", programStatusBadgeToneClass(paymentStatusTone(paymentStatus)))}>
                      {PAYMENT_STATUS_LABELS[paymentStatus]}
                    </span>
                  </div>
                ) : null}
                {row.track?.name ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Track</span>
                    <span className="font-semibold">{row.track.name}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Payment plan</span>
                  <span className="font-semibold">{applicationPaymentPlanLabel(row, row.program)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Listed price</span>
                  <span className="font-semibold">{applicationListedPrice(row, row.program)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B747B]">Submitted</span>
                  <span className="font-semibold">{timeAgo(row.request.requested_at)}</span>
                </div>
                {row.request.reviewed_at ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">Reviewed</span>
                    <span className="font-semibold">{timeAgo(row.request.reviewed_at)}</span>
                  </div>
                ) : null}
                {decisionNote ? (
                  <div className="pt-1">
                    <p className="text-[#6B747B]">Note</p>
                    <p className="mt-0.5 font-semibold">{decisionNote}</p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t border-[#EEF2F4] px-4 py-3">
          {canCompleteRegistration ? (
            <>
              <Link
                href={`/m/${slug}/registration/${row.request.id}?returnTo=${encodeURIComponent(resolvedReturnTo)}`}
                className="flex min-h-11 w-full items-center justify-center rounded-[8px] bg-[#2E6E52] px-4 text-center text-sm font-semibold !text-white shadow-[0_8px_18px_rgba(46,110,82,0.18)] transition-colors hover:bg-[#265D45]"
              >
                <span>{confirmationAction.label}</span>
              </Link>
              {onCancelRegistration ? (
                <button
                  type="button"
                  onClick={onCancelRegistration}
                  className="flex min-h-11 w-full items-center justify-center rounded-[8px] bg-[#C83F31] px-4 text-center text-sm font-semibold text-white shadow-[0_8px_18px_rgba(200,63,49,0.18)] transition-colors hover:bg-[#A93429]"
                >
                  <span>Cancel registration</span>
                </button>
              ) : null}
            </>
          ) : null}
          {canRescind ? (
            <button
              type="button"
              onClick={onRescind}
              className="flex min-h-12 w-full items-center justify-center rounded-[9px] bg-[#C83F31] px-4  text-sm font-semibold text-white shadow-[0_8px_18px_rgba(200,63,49,0.18)] transition-colors hover:bg-[#A93429]"
            >
              <span>
                <span className="block">Rescind application</span>
              </span>
            </button>
          ) : null}
          {row.program ? (
            <Link
              href={`/m/${slug}/programs/${row.program.id}?returnTo=${encodeURIComponent(`/m/${slug}/portal/classes`)}`}
              className="flex min-h-10 w-full items-center justify-center rounded-[9px] border border-[#D6DCE0] bg-white px-3 text-xs font-semibold text-[#26323A] transition-colors hover:bg-[#F7FAFB]"
            >
              View Program Page
            </Link>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function StudentWithdrawalRequestData({ slug, programId }: { slug: string; programId: string }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [students, setStudents] = useState<StudentDisplay[]>([]);
  const [existingRequestsByStudentId, setExistingRequestsByStudentId] = useState<Record<string, WithdrawalRequest | null>>({});
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [understandsNoRefund, setUnderstandsNoRefund] = useState(false);
  const [understandsImmediateExit, setUnderstandsImmediateExit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // One RPC call instead of mosque -> program -> profile -> [children] -> enrollments ->
    // withdrawal_requests, as up to six sequential stages.
    async function loadOptions() {
      setLoading(true);
      setMessage(null);
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("get_student_withdrawal_options_snapshot", { p_slug: slug, p_program_id: programId });
      if (error) {
        if (!cancelled) {
          setMessage({ tone: "error", text: friendlyErrorMessage(error, "Could not load withdrawal options.") });
          setLoading(false);
        }
        return;
      }

      const snapshot = data as unknown as {
        error: string | null;
        program: Program | null;
        selfProfile: StudentDisplay | null;
        children: StudentDisplay[];
        enrolledStudentIds: string[];
        requests: WithdrawalRequest[];
      } | null;

      if (cancelled) {
        return;
      }
      if (!snapshot || snapshot.error || !snapshot.program) {
        setMessage({ tone: "error", text: snapshot?.error ?? "Class not found." });
        setLoading(false);
        return;
      }

      const possibleStudents = [snapshot.selfProfile, ...(snapshot.children ?? [])].filter(Boolean) as StudentDisplay[];
      const enrolledIds = new Set(snapshot.enrolledStudentIds ?? []);
      const enrolledStudents = possibleStudents.filter((student) => enrolledIds.has(student.id));
      const requestByStudentId = (snapshot.requests ?? []).reduce<Record<string, WithdrawalRequest>>((next, request) => {
        next[request.student_profile_id] = request;
        return next;
      }, {});

      setProgram(snapshot.program);
      setStudents(enrolledStudents);
      setExistingRequestsByStudentId(requestByStudentId);
      setSelectedStudentId(enrolledStudents.find((student) => !requestByStudentId[student.id])?.id ?? enrolledStudents[0]?.id ?? "");
      setLoading(false);
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [programId, slug]);

  async function submit() {
    if (!selectedStudentId) {
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const { error: submitError } = await createSupabaseBrowserClient().rpc("request_program_withdrawal", {
      target_program_id: programId,
      target_student_profile_id: selectedStudentId,
      withdrawal_reason: reason.trim() || null,
      understands_no_refund: understandsNoRefund,
      understands_immediate_exit: understandsImmediateExit,
    });
    setSubmitting(false);
    if (submitError) {
      setMessage({ tone: "error", text: submitError.message });
      return;
    }
    setExistingRequestsByStudentId((current) => ({
      ...current,
      [selectedStudentId]: { id: "pending", student_profile_id: selectedStudentId } as WithdrawalRequest,
    }));
    setSubmitted(true);
    setMessage({ tone: "success", text: "Withdrawal request sent. The teacher will review it, and you will be notified when it is done." });
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    void notifyWithdrawalRequested(programId, selectedStudentId);
  }

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const selectedAlreadyPending = Boolean(selectedStudentId && existingRequestsByStudentId[selectedStudentId]);
  const canSubmit = Boolean(selectedStudentId && understandsNoRefund && understandsImmediateExit && !selectedAlreadyPending && !submitted);

  return (
    <div className="bg-white px-4 pb-28 pt-7 text-[#26323A]">
      {loading ? (
        <InboxLoadingPanel label="Loading withdrawal form" />
      ) : message?.tone === "error" && !program ? (
        <EmptyState title="Could not load withdrawal" text={message.text} onRetry={() => window.location.reload()} />
      ) : submitted ? (
        <div className="space-y-5">
          <div className="rounded-[24px] bg-[#F4FBF8] px-5 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#17624F] text-white">
              <CheckIcon />
            </div>
            <h2 className="mt-4 text-2xl font-semibold leading-8">Request sent</h2>
            <p className="mt-2 text-sm leading-6 text-[#52616A]">
              The teacher will review the withdrawal request. You will be notified when it is done.
            </p>
          </div>
          <TransitionLink href={`/m/${slug}/portal/classes`} label="Classes" className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#26323A] px-4 text-sm font-semibold text-white md:w-auto md:px-10" style={{ color: "#FFFFFF" }}>
            Back to classes
          </TransitionLink>
        </div>
      ) : program ? (
        <div className="space-y-7">
          <section className="space-y-3 border-b border-[#E3E8EC] pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6B747B]">Class summary</p>
            <div>
              <h2 className="text-2xl font-semibold leading-8">{program.title}</h2>
              <p className="mt-1 text-sm leading-6 text-[#52616A]">{scheduleSummary(program.schedule, program.schedule_notes).full}</p>
            </div>
            <AudienceDetails age={formatAgeRange(program.age_range_text)} gender={formatGender(program.audience_gender)} />
          </section>

          <section className="space-y-3 border-b border-[#E3E8EC] pb-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6B747B]">Student</p>
                <h3 className="mt-1 text-lg font-semibold">Who is withdrawing?</h3>
              </div>
              <span className="text-xs font-semibold text-[#6B747B]">{students.length}</span>
            </div>
            {students.length ? (
              <div className="space-y-2">
                {students.map((student) => {
                  const pending = Boolean(existingRequestsByStudentId[student.id]);
                  const selected = selectedStudentId === student.id;
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                      className={cn("flex min-h-14 w-full items-center gap-3 border px-3 text-left transition-colors", selected ? "border-[#17624F] bg-[#F4FBF8]" : "border-[#E1E8EC] bg-white")}
                    >
                      <Avatar src={student.avatar_url ?? null} name={student.full_name ?? "Student"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{student.full_name ?? "Student"}</span>
                        <span className="block truncate text-xs text-[#6B747B]">{pending ? "Withdrawal already pending" : students.length === 1 ? "Selected by default" : "Enrolled"}</span>
                      </span>
                      {selected ? <CheckIcon /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <MiniEmpty text="No active enrollment was found for this class." />
            )}
          </section>

          <section className="space-y-3 border-b border-[#E3E8EC] pb-6">
            <label htmlFor="withdrawal-reason" className="block text-xs font-semibold uppercase tracking-[0.24em] text-[#6B747B]">Reason optional</label>
            <textarea
              id="withdrawal-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={selectedStudent ? `Reason for withdrawing ${selectedStudent.full_name ?? "this student"}` : "Reason for withdrawal"}
              className="min-h-28 w-full resize-none rounded-[18px] border border-[#C9D4DA] bg-white px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-[#17624F]"
            />
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6B747B]">Terms</p>
            <WithdrawalAcknowledgement checked={understandsNoRefund} onChange={setUnderstandsNoRefund}>
              I understand that submitting this withdrawal request does not create a refund.
            </WithdrawalAcknowledgement>
            <WithdrawalAcknowledgement checked={understandsImmediateExit} onChange={setUnderstandsImmediateExit}>
              I understand that if approved, the subscription ends and the student leaves the class immediately. Rejoining later requires starting the application process again.
            </WithdrawalAcknowledgement>
          </section>

          {message ? <p className={cn("text-sm font-semibold", message.tone === "success" ? "text-[#17624F]" : "text-[#A34B16]")}>{message.text}</p> : null}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !canSubmit}
            className="min-h-12 w-full rounded-full bg-[#26323A] px-4 text-sm font-semibold text-white disabled:bg-[#D8E2E5] disabled:text-[#8A949B]"
          >
            {submitting ? "Sending..." : selectedAlreadyPending ? "Already requested" : "Submit withdrawal request"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WithdrawalAcknowledgement({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex gap-3 rounded-[18px] border border-[#E1E8EC] bg-[#FAFCFC] px-4 py-3 text-sm font-semibold leading-6 text-[#26323A]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#17624F]" />
      <span>{children}</span>
    </label>
  );
}

function DisabledActionRow({ icon, label, tone = "default" }: { icon: ReactNode; label: string; tone?: "default" | "danger" }) {
  return (
    <div className={cn("flex min-h-[58px] items-center gap-3 text-sm font-semibold", tone === "danger" ? "text-[#C83F31]" : "text-[#8A949B]")}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 text-left leading-5">{label}</span>
      <span className="text-xs font-medium text-[#6B747B]">Soon</span>
    </div>
  );
}

function programCoverPriceLabel(program: Program) {
  if (program.cover_price_label?.trim()) {
    return program.cover_price_label.trim();
  }
  return program.is_paid ? (programPaymentOptions(program)[0]?.price.replace("/month", "") ?? "Paid") : "Free";
}

function programRegistrationLabel(program: Program) {
  const state = getApplicationButtonState(toProgramStatusFields(program));
  switch (state.type) {
    case "open":
      return { label: "Registration open", tone: "open" as const };
    case "waitlist":
      return { label: "Waitlist open", tone: "waitlist" as const };
    case "invite":
      return { label: "Invite only", tone: "invite" as const };
    case "scheduled":
      return { label: "Opens soon", tone: "scheduled" as const };
    default:
      return { label: "Registration closed", tone: "closed" as const };
  }
}

function ProgramCard({
  program,
  detailHref,
  enrolled = false,
  relationship,
}: {
  program: ProgramWithTeacher;
  detailHref: string;
  enrolled?: boolean;
  relationship?: { label: string; tone: "open" | "waitlist" | "closed" } | null;
}) {
  const registration = relationship ?? programRegistrationLabel(program);
  return (
    <TransitionLink href={detailHref} label="Class Details" className={cn("group relative overflow-hidden rounded-xl bg-white shadow-[0_5px_18px_rgba(38,50,58,0.14)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(38,50,58,0.18)]", enrolled && "opacity-70")}>
      <div className="relative">
        <ProgramHero program={program} />
        {enrolled ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/58">
            <span className="rounded-full bg-[#17624F] px-4 py-2 text-sm font-semibold text-white shadow-lg">Enrolled</span>
          </div>
        ) : null}
      </div>
      {program.cover_price_label_enabled !== false ? <PriceTag price={programCoverPriceLabel(program)} /> : null}
      <div className="space-y-3 p-4 pt-5">
        {(() => {
          const visibility = program.coverDirectorVisibility ?? "name_and_photo";
          const showPhoto = visibility === "name_and_photo";
          const showName = visibility === "name_and_photo" || visibility === "name_only";
          const directorName = program.coverDirectorDisplayName?.trim() || program.teacher?.full_name;
          return (
            <div className="flex items-start gap-3">
              {showPhoto ? <Avatar src={program.teacher?.avatar_url ?? null} name={directorName ?? "Teacher"} /> : null}
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-lg font-medium leading-6 text-[#26323A]">{program.title}</h3>
                {program.summary ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#52616A]">{program.summary}</p>
                ) : showName ? (
                  <p className="mt-1 truncate text-sm text-[#6B747B]">{directorName ?? "Teacher to be announced"}</p>
                ) : null}
              </div>
            </div>
          );
        })()}
        <AudienceDetails age={formatAgeRange(program.age_range_text)} gender={formatGender(program.audience_gender)} />
        {(program.location?.trim() || program.room?.trim()) ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-[#6B747B]">
            <span aria-hidden>📍</span>
            <span className="min-w-0 flex-1">{[program.location?.trim(), program.room?.trim()].filter(Boolean).join(" — ")}</span>
          </p>
        ) : null}
        <div className="grid gap-2 text-xs font-semibold">
          <div className="rounded-[10px] bg-[#F5F8F9] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#6B747B]">Registration</span>
              <span className={cn(
                "text-right",
                registration.tone === "open" ? "text-[#17624F]" : registration.tone === "waitlist" ? "text-[#9B6B09]" : "text-[#6B747B]",
              )}>
                {registration.label}
              </span>
            </div>
          </div>
          {!relationship && registration.label === "Registration open" ? (
            <div className="flex items-center justify-between gap-3 rounded-[10px] bg-[#F5F8F9] px-3 py-2">
              <span className="text-[#6B747B]">Deadline</span>
              <span className={cn("text-right", program.registration_deadline_at ? "text-[#C0392B]" : "text-[#8A949B]")}>
                {program.registration_deadline_at ? formatFinanceShortDate(program.registration_deadline_at) : "No registration deadline"}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </TransitionLink>
  );
}

function ProgramHero({ program }: { program: Program }) {
  if (program.thumbnail_url) {
    return (
      <div className="relative aspect-[4/3] bg-[#DDE8EE]">
        <Image src={program.thumbnail_url} alt="" fill className="object-cover" />
      </div>
    );
  }

  return (
    <div className="relative flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top_left,#E5FFF0_0,#7ECFC2_52%,#2E9B82_100%)] p-4 text-white/80">
      <PhotoIcon className="h-12 w-12" />
    </div>
  );
}

function PriceTag({ price }: { price: string }) {
  return (
    <div className="absolute right-2 top-[126px] h-11 w-20 rotate-3" aria-label={`Price ${price}`}>
      <div
        className="relative flex h-9 w-20 items-center justify-center pl-3 text-base font-semibold text-[#2A2104] shadow-[0_7px_14px_rgba(91,68,6,0.24)]"
        style={{
          clipPath: "polygon(0 50%, 18% 0, 100% 0, 100% 100%, 18% 100%)",
          background: "linear-gradient(135deg, #FFE37A 0%, #FFC400 38%, #D99A00 100%)",
        }}
      >
        <span className="absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#B98200] bg-white shadow-inner" aria-hidden />
        <span className="relative z-10">{price}</span>
      </div>
    </div>
  );
}

function AudienceDetails({ age, gender }: { age: string; gender: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#26323A]">
      <div className="flex min-h-7 items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-[#2F8FB3]" aria-hidden />
        <span>{age}</span>
      </div>
      <div className="flex min-h-7 items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#2F8FB3]" aria-hidden />
        <span>{gender}</span>
      </div>
    </div>
  );
}

function HomeNotification({
  tone,
  title,
  text,
  href,
}: {
  tone: "active" | "empty";
  title: string;
  text: string;
  href?: string;
}) {
  if (tone === "empty") {
    return (
      <div className="px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#E7FFF3_0%,#D4F3EA_52%,#BFE6F3_100%)] px-5 py-4 shadow-[0_14px_34px_rgba(38,50,58,0.08)]">
      <div className="relative flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-xl font-medium text-[var(--brand-green)]">
          !
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{text}</p>
        </div>
        {href ? (
          <Link href={href} className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-white px-4 text-sm font-semibold text-[var(--text-primary)] shadow-[0_10px_22px_rgba(38,50,58,0.12)] ring-1 ring-white/70">
            Inbox
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function NoteAddIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" aria-hidden>
      <path d="M7.5 3.75h6.75L18.75 8v8.5A2.75 2.75 0 0 1 16 19.25H7.5a2.75 2.75 0 0 1-2.75-2.75v-10A2.75 2.75 0 0 1 7.5 3.75Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M14 3.9V8h4.15M8 11h4.5M8 14.25h3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.25" cy="17.25" r="3.5" fill="#17624F" stroke="white" strokeWidth="1.25" />
      <path d="M17.25 15.65v3.2M15.65 17.25h3.2" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function HomeSectionTitle({ title }: { title: string }) {
  return (
    <div className="px-1 pt-1">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
    </div>
  );
}

function HomeLoadingState() {
  return <GenericLoadingState label="Loading home" layout="home" />;
}

type HomeLesson = {
  program: ProgramScheduleSource;
  ownerLabel?: string;
  trackKey?: string;
  trackName?: string;
  date: Date;
  startsAt: Date;
  endsAt: Date | null;
  start: string;
  end: string;
  color: string;
};

function HomeUpcomingRows({
  programs,
  ownerLabelsByProgramId = {},
  ownerLabelsByTrackId = {},
  canCancelSessions = false,
  currentUserId = null,
  slug,
}: {
  programs: ProgramScheduleSource[];
  ownerLabelsByProgramId?: Record<string, string[]>;
  ownerLabelsByTrackId?: Record<string, Record<string, string[]>>;
  canCancelSessions?: boolean;
  currentUserId?: string | null;
  slug?: string;
}) {
  const [cancellations, setCancellations] = useState<ProgramSessionCancellation[]>([]);
  const [cancellationsLoadedKey, setCancellationsLoadedKey] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<HomeLesson | null>(null);
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelModalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(cancelModalRef, Boolean(cancelTarget), () => setCancelTarget(null));
  const week = currentWeekDays();
  const weekStartKey = dayKey(week[0]);
  const weekEndKey = dayKey(week[week.length - 1]);
  const programKey = programs.map((program) => program.id).sort().join("|");
  const cancellationLoadKey = `${programKey}:${weekStartKey}:${weekEndKey}`;
  const lessonSources: Array<{ program: ProgramScheduleSource; ownerLabel?: string; ownerLabelsByTrackId?: Record<string, string[]> }> = programs.flatMap((program) => {
    const trackOwners = ownerLabelsByTrackId[program.id];
    if (trackOwners && Object.keys(trackOwners).length > 0) {
      return [{ program, ownerLabelsByTrackId: trackOwners }];
    }
    const labels = ownerLabelsByProgramId[program.id] ?? [];
    return labels.length ? labels.map((ownerLabel) => ({ program, ownerLabel })) : [{ program }];
  });
  const cancellationKeys = new Set(cancellations.map((cancellation) => sessionCancellationKey(cancellation.program_id, cancellation.session_date, cancellation.start_time)));
  const lessons = weekLessons(lessonSources, week)
    .filter((lesson) => !cancellationKeys.has(lessonCancellationKey(lesson)))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const upcomingLessons = lessons.filter((lesson) => !lessonHasEnded(lesson));
  const futureFallbackLessons =
    upcomingLessons.length === 0
      ? nextFutureLessons(lessonSources, week, 3).filter((lesson) => !cancellationKeys.has(lessonCancellationKey(lesson)))
      : [];

  useEffect(() => {
    const programIds = Array.from(new Set(programs.map((program) => program.id)));
    if (programIds.length === 0) {
      setCancellations([]);
      setCancellationsLoadedKey(cancellationLoadKey);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let active = true;
    setCancellationsLoadedKey((current) => (current === cancellationLoadKey ? current : null));

    supabase
      .from("program_session_cancellations")
      .select("*")
      .in("program_id", programIds)
      .gte("session_date", weekStartKey)
      .lte("session_date", weekEndKey)
      .then(({ data }) => {
        if (active) {
          setCancellations(data ?? []);
          setCancellationsLoadedKey(cancellationLoadKey);
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programKey, weekStartKey, weekEndKey]);

  function openCancelModal(lesson: HomeLesson) {
    setCancelTarget(lesson);
    setCancelError(null);
    setCancelMessage(defaultCancellationMessage(lesson));
  }

  async function cancelSession() {
    if (!cancelTarget || !currentUserId) {
      return;
    }

    setCancelBusy(true);
    setCancelError(null);
    const supabase = createSupabaseBrowserClient();
    const message = cancelMessage.trim();
    let announcementId: string | null = null;

    if (message) {
      const { data: announcement, error: announcementError } = await supabase
        .from("program_announcements")
        .insert({
          program_id: cancelTarget.program.id,
          author_profile_id: currentUserId,
          message,
        })
        .select("id")
        .single();

      if (announcementError) {
        setCancelError(announcementError.message);
        setCancelBusy(false);
        return;
      }

      announcementId = announcement?.id ?? null;
    }

    const { data: cancellation, error: cancellationError } = await supabase
      .from("program_session_cancellations")
      .upsert(
        {
          program_id: cancelTarget.program.id,
          session_date: dayKey(cancelTarget.date),
          start_time: cancelTarget.start,
          end_time: cancelTarget.end,
          cancelled_by: currentUserId,
          announcement_id: announcementId,
          note: message || null,
        },
        { onConflict: "program_id,session_date,start_time" },
      )
      .select("*")
      .single();

    if (cancellationError) {
      setCancelError(cancellationError.message);
      setCancelBusy(false);
      return;
    }

    if (cancellation) {
      setCancellations((current) => [
        ...current.filter((item) => sessionCancellationKey(item.program_id, item.session_date, item.start_time) !== sessionCancellationKey(cancellation.program_id, cancellation.session_date, cancellation.start_time)),
        cancellation,
      ]);
    }

    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    setCancelBusy(false);
    setCancelTarget(null);
    setCancelMessage("");
  }

  if (cancellationsLoadedKey !== cancellationLoadKey) {
    return <HomeUpcomingLoadingRows />;
  }

  if (lessons.length === 0 && futureFallbackLessons.length === 0) {
    return <EmptyState title="No upcoming classes" text="Upcoming sessions will appear here after schedules are added." />;
  }

  const lessonsByDay = new Map<string, HomeLesson[]>();
  for (const lesson of lessons) {
    const key = dayKey(lesson.date);
    lessonsByDay.set(key, [...(lessonsByDay.get(key) ?? []), lesson]);
  }

  const upcomingLessonsByDay = new Map<string, HomeLesson[]>();
  for (const lesson of upcomingLessons) {
    const key = dayKey(lesson.date);
    upcomingLessonsByDay.set(key, [...(upcomingLessonsByDay.get(key) ?? []), lesson]);
  }

  const futureFallbackLessonsByDay = new Map<string, HomeLesson[]>();
  for (const lesson of futureFallbackLessons) {
    const key = dayKey(lesson.date);
    futureFallbackLessonsByDay.set(key, [...(futureFallbackLessonsByDay.get(key) ?? []), lesson]);
  }
  const futureFallbackDayGroups = Array.from(futureFallbackLessonsByDay.entries()).sort(([, a], [, b]) => a[0].startsAt.getTime() - b[0].startsAt.getTime());

  return (
    <div className="space-y-5 pb-24">
      <WeekCalendar days={week} lessonsByDay={lessonsByDay} />
      {upcomingLessons.length === 0 ? (
        futureFallbackLessons.length ? (
          <div className="space-y-5">
            <div className="px-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Next upcoming sessions</h3>
              <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Nothing else is scheduled this week.</p>
            </div>
            {futureFallbackDayGroups.map(([key, dayLessons]) => (
              <section key={key} className="space-y-2">
                <h3 className="px-1 text-sm font-semibold text-[var(--text-primary)]">{formatHomeDate(dayLessons[0].date)}</h3>
                <div className="space-y-3">
                  {dayLessons.map((lesson) => (
                    <HomeUpcomingLesson
                      key={[lesson.program.id, lesson.ownerLabel ?? "self", dayKey(lesson.date), normalizeScheduleTime(lesson.start) || lesson.start, normalizeScheduleTime(lesson.end) || lesson.end].join("|")}
                      lesson={lesson}
                      canCancel={canCancelSessions}
                      onCancel={() => openCancelModal(lesson)}
                      viewStudentsHref={canCancelSessions && slug ? homeLessonViewStudentsHref(slug, lesson) : undefined}
                      markAttendanceHref={canCancelSessions && slug ? attendanceMarkHref(slug, lesson) : undefined}
                      markAttendanceDisabled={false}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState title="No more classes this week" text="Your scheduled class days are shown above." />
        )
      ) : (
        <div className="space-y-5">
          {week
            .map((day) => ({ day, lessons: upcomingLessonsByDay.get(dayKey(day)) ?? [] }))
            .filter((group) => group.lessons.length > 0)
            .map((group) => (
              <section key={dayKey(group.day)} className="space-y-2">
                <h3 className="px-1 text-sm font-semibold text-[var(--text-primary)]">{formatHomeDate(group.day)}</h3>
                <div className="space-y-3">
                  {group.lessons.map((lesson) => (
                    <HomeUpcomingLesson
                      key={[lesson.program.id, lesson.ownerLabel ?? "self", dayKey(lesson.date), normalizeScheduleTime(lesson.start) || lesson.start, normalizeScheduleTime(lesson.end) || lesson.end].join("|")}
                      lesson={lesson}
                      canCancel={canCancelSessions}
                      onCancel={() => openCancelModal(lesson)}
                      viewStudentsHref={canCancelSessions && slug ? homeLessonViewStudentsHref(slug, lesson) : undefined}
                      markAttendanceHref={canCancelSessions && slug ? attendanceMarkHref(slug, lesson) : undefined}
                      markAttendanceDisabled={false}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172522]/45 px-5 backdrop-blur-sm">
          <div ref={cancelModalRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-[0_24px_70px_rgba(23,37,34,0.28)] outline-none">
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">Cancel session?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              By continuing, you will cancel {cancelTarget.program.title} on {formatHomeDate(cancelTarget.date)}.
            </p>
            <textarea
              value={cancelMessage}
              onChange={(event) => setCancelMessage(event.target.value)}
              placeholder="Optional announcement to send to enrolled students"
              className="mt-4 min-h-28 w-full resize-none rounded-[18px] border border-[var(--border-default)] bg-[#F7F9FA] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-blue)]"
            />
            {cancelError ? <p className="mt-3 text-sm text-[var(--danger-dark)]">{cancelError}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setCancelTarget(null)} disabled={cancelBusy} className="min-h-10 rounded-[8px] bg-[#EEF2F4] px-5 text-sm font-semibold text-[#5C6870] disabled:opacity-60">
                Keep
              </button>
              <button type="button" onClick={cancelSession} disabled={cancelBusy} className="min-h-10 rounded-[8px] bg-[var(--danger-dark)] px-5 text-sm font-semibold text-white disabled:opacity-60">
                {cancelBusy ? "Cancelling..." : "Cancel and send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HomeUpcomingLoadingRows() {
  return <GenericLoadingState label="Loading upcoming classes" layout="schedule" compact />;
}

function WeekCalendar({ days, lessonsByDay }: { days: Date[]; lessonsByDay: Map<string, HomeLesson[]> }) {
  const today = new Date();
  return (
    <div className="grid grid-cols-7 gap-1 px-1">
      {days.map((day) => {
        const lessons = lessonsByDay.get(dayKey(day)) ?? [];
        const isToday = day.toDateString() === today.toDateString();
        return (
          <div key={dayKey(day)} className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex min-h-14 w-full max-w-12 flex-col items-center justify-center rounded-2xl text-center transition-colors",
                isToday ? "bg-[#DDF3EA] text-[var(--brand-green)] shadow-[0_8px_18px_rgba(23,98,79,0.12)]" : "text-[var(--text-muted)]",
              )}
            >
              <span className="text-[11px] font-semibold uppercase leading-none">{weekdayShort(day)}</span>
              <span className="mt-1 text-sm font-semibold leading-none">{day.getDate()}</span>
            </div>
            <div className="-mt-1.5 flex h-2 items-center justify-center gap-0.5">
              {Array.from(new Map(lessons.map((lesson) => [lesson.trackKey ?? lesson.program.id, lesson])).values())
                .slice(0, 3)
                .map((lesson) => (
                  <span key={lesson.trackKey ?? lesson.program.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lesson.color }} aria-hidden />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function homeLessonViewStudentsHref(slug: string, lesson: HomeLesson) {
  const params = new URLSearchParams({
    from: "home",
    day: weekdayName(lesson.date),
    start: normalizeScheduleTime(lesson.start) || lesson.start,
    end: normalizeScheduleTime(lesson.end) || lesson.end || lesson.start,
  });
  return `/m/${slug}/teacher/classes/${lesson.program.id}/students?${params.toString()}`;
}

function HomeUpcomingLesson({
  lesson,
  canCancel = false,
  onCancel,
  viewStudentsHref,
  markAttendanceHref,
  markAttendanceDisabled,
}: {
  lesson: HomeLesson;
  canCancel?: boolean;
  onCancel?: () => void;
  viewStudentsHref?: string;
  markAttendanceHref?: string;
  markAttendanceDisabled?: boolean;
}) {
  const detailParts = [lesson.ownerLabel, lessonTimeRange(lesson)].filter(Boolean);
  const happeningNow = lesson.startsAt.getTime() <= Date.now() && Boolean(lesson.endsAt && Date.now() < lesson.endsAt.getTime());
  return (
    <div className={cn("flex items-center gap-3 rounded-[24px] px-4 py-3 shadow-[0_8px_24px_rgba(38,50,58,0.06)]", happeningNow ? "border border-[#8FD4BD] bg-[#EAF8F2] shadow-[0_10px_26px_rgba(23,98,79,0.12)]" : "bg-white")}>
      <HomeProgramThumb program={lesson.program} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">{lesson.program.title}</h3>
        {happeningNow ? <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#17624F]">Happening now</p> : null}
        <p className="mt-0.5 text-sm leading-5 text-[var(--text-muted)]">{detailParts.join(" • ")}</p>
      </div>
      {canCancel ? (
        <UpcomingLessonActionMenu onCancel={onCancel} viewStudentsHref={viewStudentsHref} markAttendanceHref={markAttendanceHref} markAttendanceDisabled={markAttendanceDisabled} />
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: lesson.color }} aria-hidden />
      )}
    </div>
  );
}

function UpcomingLessonActionMenu({
  onCancel,
  viewStudentsHref,
  markAttendanceHref,
  markAttendanceDisabled,
}: {
  onCancel?: () => void;
  viewStudentsHref?: string;
  markAttendanceHref?: string;
  markAttendanceDisabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function placeMenu() {
      const button = buttonRef.current;
      if (!button) {
        return;
      }
      const rect = button.getBoundingClientRect();
      const menuWidth = 176;
      const menuHeight = 150;
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight + 96 ? Math.max(12, rect.top - menuHeight - gap) : rect.bottom + gap;
      const left = Math.min(Math.max(12, rect.right - menuWidth), window.innerWidth - menuWidth - 12);
      setMenuPosition({ top, left });
    }
    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [menuOpen]);

  return (
    <span className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        className={cn("flex h-9 w-9 items-center justify-center rounded-full transition-colors", menuOpen ? "bg-[var(--text-primary)] text-white" : "text-[var(--text-secondary)] hover:bg-[#EEF3F5] hover:text-[var(--text-primary)]")}
        aria-label="Session actions"
      >
        <MoreVerticalIcon />
      </button>
      {menuOpen && menuPosition ? createPortal(
        <span className="fixed z-[2147483646] w-44 rounded-[16px] border border-[#DDE5E9] bg-white p-1 text-sm shadow-[0_18px_44px_rgba(38,50,58,0.18)]" style={{ top: menuPosition.top, left: menuPosition.left }}>
          {viewStudentsHref ? (
            <Link
              href={viewStudentsHref}
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left font-semibold text-[var(--text-primary)] hover:bg-[#F1F5F6] no-underline"
            >
              View students
            </Link>
          ) : null}
          {markAttendanceHref ? (
            markAttendanceDisabled ? (
              <span className="flex w-full cursor-not-allowed items-center gap-2 rounded-[12px] px-3 py-2.5 text-left font-semibold text-[#A7B0B6]">
                Mark Attendance
              </span>
            ) : (
              <Link
                href={markAttendanceHref}
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left font-semibold text-[var(--brand-green)] hover:bg-[#EAF7F1] no-underline"
              >
                Mark Attendance
              </Link>
            )
          ) : null}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onCancel?.();
            }}
            className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left font-semibold text-[var(--danger-dark)] hover:bg-[#FFF1EF]"
          >
            Cancel session
          </button>
        </span>,
        document.body,
      ) : null}
    </span>
  );
}

function HomeProgramThumb({ program }: { program: ProgramScheduleSource }) {
  if (program.thumbnail_url) {
    return (
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#DDE8EE]">
        <Image src={program.thumbnail_url} alt="" fill className="object-cover" sizes="56px" />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E7F3F8] text-sm font-semibold text-[var(--brand-blue)]">
      {initials(program.title)}
    </div>
  );
}

function currentWeekDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  });
}

function weekDaysFrom(start: Date) {
  const first = new Date(start);
  first.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
}

// A weekly-pattern match against "this week" alone can't tell whether a program has actually
// started yet or already ended, so upcoming-session lists would otherwise show a class before
// its configured start_date and keep showing it forever past end_date.
function dateWithinProgramDuration(date: Date, program: Pick<ProgramScheduleSource, "start_date" | "end_date" | "is_ongoing">) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  if (program.start_date) {
    const start = new Date(program.start_date);
    start.setHours(0, 0, 0, 0);
    if (dayStart < start) {
      return false;
    }
  }
  if (!program.is_ongoing && program.end_date) {
    const end = new Date(program.end_date);
    end.setHours(0, 0, 0, 0);
    if (dayStart > end) {
      return false;
    }
  }
  return true;
}

function weekLessons(sources: Array<{ program: ProgramScheduleSource; ownerLabel?: string; ownerLabelsByTrackId?: Record<string, string[]> }>, week: Date[]) {
  const lessons: HomeLesson[] = [];
  const seenLessonKeys = new Set<string>();

  sources.forEach(({ program, ownerLabel, ownerLabelsByTrackId }) => {
    const trackSources = program.scheduleTracks?.length
      ? program.scheduleTracks.map((track) => ({ trackId: track.id, trackKey: `${program.id}:${track.id}`, trackName: track.name, rows: parseProgramSchedule(track.schedule) }))
      : [{ trackId: null as string | null, trackKey: program.id, trackName: undefined, rows: parseProgramSchedule(program.schedule) }];

    trackSources.forEach(({ trackId, trackKey, trackName, rows }) => {
      const rowOwnerLabels = ownerLabelsByTrackId && trackId ? ownerLabelsByTrackId[trackId] ?? [] : ownerLabel ? [ownerLabel] : [undefined];
      if (ownerLabelsByTrackId && trackId && rowOwnerLabels.length === 0) {
        return;
      }
      const trackColor = programLessonColor(trackKey);
      rows.forEach((row) => {
        const date = week.find((day) => weekdayName(day).toLowerCase() === row.day.toLowerCase());
        if (!date || !dateWithinProgramDuration(date, program)) {
          return;
        }

        const startsAt = withTime(date, row.start);
        rowOwnerLabels.forEach((nextOwnerLabel) => {
          const dedupeKey = [
            program.id,
            nextOwnerLabel ?? "self",
            dayKey(date),
            normalizeScheduleTime(row.start) || row.start,
            normalizeScheduleTime(row.end) || row.end,
          ].join("|");
          if (seenLessonKeys.has(dedupeKey)) {
            return;
          }
          seenLessonKeys.add(dedupeKey);
          lessons.push({
            program,
            ownerLabel: nextOwnerLabel,
            trackKey,
            trackName,
            date,
            startsAt,
            endsAt: row.end ? withTime(date, row.end) : null,
            start: row.start,
            end: row.end,
            color: trackColor,
          });
        });
      });
    });
  });

  return lessons;
}

function nextFutureLessons(sources: Array<{ program: ProgramScheduleSource; ownerLabel?: string; ownerLabelsByTrackId?: Record<string, string[]> }>, currentWeek: Date[], limit: number) {
  const now = new Date();
  const results: HomeLesson[] = [];
  for (let weekOffset = 1; weekOffset <= 16 && results.length < limit; weekOffset += 1) {
    const start = new Date(currentWeek[0]);
    start.setDate(start.getDate() + weekOffset * 7);
    const futureWeek = weekDaysFrom(start);
    results.push(...weekLessons(sources, futureWeek).filter((lesson) => lesson.startsAt > now));
  }
  return results.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, limit);
}

function lessonHasEnded(lesson: HomeLesson) {
  const now = new Date();
  if (lesson.date.toDateString() !== now.toDateString()) {
    return lesson.date < startOfToday();
  }

  return lesson.endsAt ? lesson.endsAt.getTime() <= now.getTime() : false;
}

function withTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const next = new Date(date);
  next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return next;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function weekdayShort(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);
}

function formatHomeDate(date: Date) {
  const today = startOfToday();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const dayDifference = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function lessonTimeRange(lesson: HomeLesson) {
  return formatScheduleRange(lesson.start, lesson.end);
}

function sessionCancellationKey(programId: string, sessionDate: string, startTime: string) {
  return `${programId}|${sessionDate}|${normalizeScheduleTime(startTime) || startTime}`;
}

function lessonCancellationKey(lesson: HomeLesson) {
  return sessionCancellationKey(lesson.program.id, dayKey(lesson.date), lesson.start);
}

function defaultCancellationMessage(lesson: HomeLesson) {
  return `${lesson.program.title} on ${formatHomeDate(lesson.date)} from ${lessonTimeRange(lesson)} has been cancelled.`;
}

function TeacherClassCard({
  program,
  mosqueSlug,
  role,
  basePath,
  controlLabel,
  canManageFinances = false,
  counts,
  onResigned,
  onResignError,
  onDeleted,
  onDeleteError,
}: {
  program: Program;
  mosqueSlug: string;
  role: TeacherProgramRole;
  basePath?: string;
  controlLabel?: string;
  canManageFinances?: boolean;
  counts?: { students?: number; applications?: number; instructors?: number };
  onResigned?: () => void;
  onResignError?: (message: string) => void;
  onDeleted?: () => void;
  onDeleteError?: (message: string) => void;
}) {
  const [resignOpen, setResignOpen] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const age = formatAgeRange(program.age_range_text);
  const gender = formatGender(program.audience_gender);
  const isDirector = role === "director";
  const classBasePath = basePath ?? `/m/${mosqueSlug}/teacher/classes`;
  const teacherClassesReturnTo = encodeURIComponent(classBasePath);
  const publicHref = `/m/${mosqueSlug}/programs/${program.id}?returnTo=${teacherClassesReturnTo}`;
  // The cover/title always opens the public view, for directors and instructors alike --
  // "Edit Class" stays reachable as its own row below, not overloaded onto the cover tap.
  const primaryHref = publicHref;
  const primaryLabel = "Public Page";

  async function resignFromClass() {
    setResigning(true);
    const { error: resignError } = await createSupabaseBrowserClient().rpc("resign_program_instructor", { target_program_id: program.id });
    setResigning(false);
    if (resignError) {
      onResignError?.(resignError.message);
      return;
    }
    setResignOpen(false);
    onResigned?.();
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    void notifyInstructorEvent(program.id, "resigned");
  }

  async function deleteClass() {
    setDeleting(true);
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      setDeleting(false);
      onDeleteError?.("Log in required.");
      return;
    }

    const response = await fetch(`/api/programs/${program.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setDeleting(false);
    if (!response.ok) {
      onDeleteError?.(result.error ?? "Could not delete class.");
      return;
    }
    setDeleteOpen(false);
    onDeleted?.();
  }

  return (
    <article className="relative overflow-hidden rounded-[22px] border border-[#CBD8DE] bg-white shadow-[0_16px_40px_rgba(38,50,58,0.09)]">
      {isDirector ? <ClassCardActionMenu onDelete={() => setDeleteOpen(true)} /> : null}
      <TransitionLink href={primaryHref} label={primaryLabel} className="relative block transition-opacity hover:opacity-95">
        <ProgramHero program={program} />
        <span className={cn("absolute left-3 top-3 z-10 inline-flex min-h-7 items-center rounded-full bg-white/92 px-3 text-xs font-bold uppercase tracking-wide shadow-[0_6px_16px_rgba(38,50,58,0.18)] backdrop-blur", controlLabel ? "text-[#2F6077]" : isDirector ? "text-[#17624F]" : "text-[#2F6077]")}>
          {controlLabel ?? (isDirector ? "Director" : "Instructor")}
        </span>
      </TransitionLink>
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {getProgramStatusBadges(toProgramStatusFields(program)).map((badge) => (
              <span key={badge.label} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", programStatusBadgeToneClass(badge.tone))}>
                {badge.label}
              </span>
            ))}
          </div>
          <TransitionLink href={primaryHref} label={primaryLabel} className="line-clamp-2 text-lg font-semibold leading-6 text-[#26323A] hover:text-[#17624F]">
            {program.title}
          </TransitionLink>
        </div>
        <AudienceDetails age={age} gender={gender} />
        <div className="divide-y divide-[#E3E8EC] border-t border-[#E3E8EC]">
          <TeacherActionLink href={publicHref} icon={<ExternalLinkIcon />} label="View Public Page" previewLabel="Class Details" />
          <TeacherActionLink href={`${classBasePath}/${program.id}/students`} icon={<StudentsIcon />} label="Students" count={counts?.students} />
          {isDirector ? <TeacherActionLink href={`${classBasePath}/${program.id}/applications`} icon={<ClipboardIcon />} label="Manage Applications" count={counts?.applications} urgent /> : null}
          {isDirector ? <TeacherActionLink href={`${classBasePath}/${program.id}/instructors`} icon={<InstructorManageIcon />} label="Instructors" count={counts?.instructors} /> : null}
          <TeacherActionLink href={`${classBasePath}/${program.id}/announcement`} icon={<MegaphoneIcon />} label="Announcement" />
          <TeacherActionLink href={attendanceHistoryHref(mosqueSlug, program.id, classBasePath)} icon={<AttendanceIcon />} label="Attendance History" />
          {canManageFinances ? <TeacherActionLink href={`${classBasePath}/${program.id}/finances`} icon={<FinanceIcon />} label="Manage Finances" /> : null}
          {isDirector || canManageFinances ? <TeacherActionLink href={`${classBasePath}/${program.id}/exports`} icon={<ClipboardIcon />} label="Export Data" /> : null}
          {isDirector ? <TeacherActionLink href={`${classBasePath}/${program.id}`} icon={<EditClassIcon />} label="Edit Class" /> : null}
          {!isDirector ? <TeacherActionButton icon={<XIcon />} label="Resign from Class" onClick={() => setResignOpen(true)} /> : null}
        </div>
      </div>
      {resignOpen ? (
        <ConfirmInstructorResignModal
          programTitle={program.title}
          busy={resigning}
          onCancel={() => setResignOpen(false)}
          onConfirm={() => void resignFromClass()}
        />
      ) : null}
      {deleteOpen ? (
        <ConfirmClassDeleteModal
          programTitle={program.title}
          busy={deleting}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void deleteClass()}
        />
      ) : null}
    </article>
  );
}

function programLessonColor(programId: string) {
  let hash = 0;
  for (let index = 0; index < programId.length; index += 1) {
    hash = (hash * 31 + programId.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  const saturation = 58 + (hash % 18);
  const lightness = 42 + (hash % 10);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function TeacherActionLink({ href, icon, label, previewLabel, count, urgent }: { href: string; icon: ReactNode; label: string; previewLabel?: string; count?: number; urgent?: boolean }) {
  return (
    <TransitionLink href={href} label={previewLabel ?? label} className="group flex min-h-[58px] min-w-0 items-center gap-3 text-sm font-semibold text-[#26323A] transition hover:bg-[#F7FAFB]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#26323A] transition group-hover:text-[#17624F]" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left leading-5">{label}</span>
      {count ? <ActionRowCount count={count} urgent={urgent} /> : null}
      <ChevronRightIcon className="text-[#9AA4AA]" />
    </TransitionLink>
  );
}

function ActionRowCount({ count, urgent }: { count: number; urgent?: boolean }) {
  return (
    <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none", urgent ? "bg-[#C0392B] text-white" : "bg-[#EDF1F2] text-[#6B747B]")}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function TeacherActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-[58px] w-full items-center gap-3 text-sm font-semibold text-[#26323A] transition hover:bg-[#F7FAFB]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#26323A] transition group-hover:text-[#17624F]" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left leading-5">{label}</span>
      <ChevronRightIcon className="text-[#9AA4AA]" />
    </button>
  );
}

function ClassCardActionMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute right-3 top-3 z-20">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className={cn("flex h-10 w-10 items-center justify-center rounded-full border border-white/70 shadow-[0_10px_26px_rgba(38,50,58,0.16)] backdrop-blur", open ? "bg-[#26323A] text-white" : "bg-white/92 text-[#26323A] hover:bg-white")}
        aria-label="Class actions"
      >
        <MoreVerticalIcon />
      </button>
      {open ? (
        <div className="absolute right-0 top-12 w-44 rounded-[16px] border border-[#DDE5E9] bg-white p-1 text-sm shadow-[0_18px_44px_rgba(38,50,58,0.18)]">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            className="flex min-h-10 w-full items-center rounded-[12px] px-3 text-left font-semibold text-[#C83F31] transition-colors hover:bg-[#FFF1EF]"
          >
            Delete class
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConfirmInstructorResignModal({
  programTitle,
  busy,
  onCancel,
  onConfirm,
}: {
  programTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onCancel);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">

        <h2 className="mt-4 text-xl font-semibold">Resign from class?</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          You are leaving {programTitle}. To rejoin, you will need a new instructor code from the director.
        </p>
        <div className="mt-6 grid gap-2">
          <button type="button" onClick={onConfirm} disabled={busy} className="min-h-11 rounded-[8px] bg-[#26323A] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Leaving..." : "Resign from class"}
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

function ConfirmClassDeleteModal({
  programTitle,
  busy,
  onCancel,
  onConfirm,
}: {
  programTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onCancel);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-xl font-semibold">Delete class?</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          {programTitle} will be removed from class lists and closed to new applications. Existing records are preserved.
        </p>
        <div className="mt-6 grid gap-2">
          <button type="button" onClick={onConfirm} disabled={busy} className="min-h-11 rounded-[8px] bg-[#C83F31] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Deleting..." : "Delete class"}
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

function TeacherOtherClassCard({ program, mosqueSlug }: { program: Program; mosqueSlug: string }) {
  const schedule = scheduleSummary(program.schedule, program.schedule_notes);
  const publicHref = `/m/${mosqueSlug}/programs/${program.id}?returnTo=${encodeURIComponent(`/m/${mosqueSlug}/teacher/classes`)}`;
  return (
    <article className="w-full min-w-0 overflow-hidden rounded-[20px] border border-[#D6DCE0] bg-white p-4 shadow-[0_12px_28px_rgba(38,50,58,0.07)]">
      <div className="flex min-w-0 gap-3">
        <HomeProgramThumb program={program} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold text-[#26323A]">{program.title}</h3>
          <p className="mt-1 text-sm text-[#6B747B]">{schedule.full}</p>
          {(program.location?.trim() || program.room?.trim()) ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-[#6B747B]">
              <span aria-hidden>📍</span>
              <span className="min-w-0 flex-1 truncate">{[program.location?.trim(), program.room?.trim()].filter(Boolean).join(" — ")}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 divide-y divide-[#E3E8EC] border-t border-[#E3E8EC]">
        <TeacherActionLink href={publicHref} icon={<ExternalLinkIcon />} label="View Public Page" previewLabel="Class Details" />
      </div>
    </article>
  );
}

function TeacherWorkspaceTools({ slug, mode, canCreateClass, createHref }: { slug: string; mode: "create" | "invite"; canCreateClass: boolean; createHref?: string }) {
  const [teacherMembership, setTeacherMembership] = useState<MosqueMembership | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [invitePreview, setInvitePreview] = useState<{ programId: string; title: string; directorName: string } | null>(null);
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false);
  const [invitePreviewError, setInvitePreviewError] = useState<string | null>(null);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [busy, setBusy] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const inviteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        setMembershipLoading(true);
        const supabase = createSupabaseBrowserClient();
        const session = await loadCachedSession();
        const userId = session?.user.id ?? null;
        const { data: mosqueRow } = await supabase.from("mosques").select("*").eq("slug", slug).maybeSingle();
        if (mosqueRow && userId) {
          const { data: membershipRow } = await supabase
            .from("mosque_memberships")
            .select("*")
            .eq("mosque_id", mosqueRow.id)
            .eq("profile_id", userId)
            .eq("role", "teacher")
            .maybeSingle();
          setTeacherMembership(membershipRow ?? null);
        }
        setMembershipLoading(false);
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [slug]);

  const isActiveTeacher = teacherMembership?.status === "active";

  useEffect(() => {
    const code = inviteCode.trim().toUpperCase();
    if (mode !== "invite" || code.length !== 8) {
      setInvitePreview(null);
      setInvitePreviewLoading(false);
      setInvitePreviewError(null);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setInvitePreviewLoading(true);
        const supabase = createSupabaseBrowserClient();
        const { data: previewRows, error: previewError } = await supabase.rpc("lookup_program_instructor_code", { invite: code });
        const previewRow = previewRows?.[0] ?? null;
        if (previewError) {
          if (!cancelled) {
            setInvitePreview(null);
            setInvitePreviewLoading(false);
            setInvitePreviewError(previewError.message);
          }
          return;
        }
        if (!previewRow) {
          if (!cancelled) {
            setInvitePreview(null);
            setInvitePreviewLoading(false);
            setInvitePreviewError(null);
          }
          return;
        }
        if (!cancelled) {
          setInvitePreviewError(null);
          setInvitePreview({
            programId: previewRow.program_id,
            title: previewRow.title,
            directorName: previewRow.director_name,
          });
          setInvitePreviewLoading(false);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [inviteCode, mode]);

  async function claimInviteCode() {
    if (!inviteCode.trim()) {
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const claimedProgramId = invitePreview?.programId;
    const { error: claimError } = await supabase.rpc("claim_program_instructor_code", {
      invite: inviteCode.trim().toUpperCase(),
    });
    setBusy(false);
    if (claimError) {
      setMessage(claimError.message);
      return;
    }
    setInviteCode("");
    setInvitePreview(null);
    setShowInviteInput(false);
    setToast({ tone: "success", message: "Instructor code accepted. The class is now assigned to you." });
    window.dispatchEvent(new Event("tareeqah:programs-changed"));
    if (claimedProgramId) {
      void notifyInstructorEvent(claimedProgramId, "joined");
    }
    window.setTimeout(() => window.location.reload(), 450);
  }

  async function pasteInviteCode() {
    const clipboardText = await navigator.clipboard.readText().catch(() => "");
    const normalizedCode = clipboardText.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
    if (!normalizedCode) {
      setMessage("Clipboard does not contain an instructor code.");
      return;
    }
    setMessage(null);
    setInviteCode(normalizedCode);
    inviteInputRef.current?.focus();
  }

  const inviteChars = inviteCode.padEnd(8, " ").slice(0, 8).split("");

  return (
    <section className={cn("space-y-3", mode === "invite" && "rounded-[30px] bg-[#17624F] p-5 text-white shadow-[0_18px_40px_rgba(23,98,79,0.24)]")}>
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      {mode === "invite" && !membershipLoading && !isActiveTeacher ? (
        <div className="rounded-[14px] border border-white/25 bg-white/14 px-3 py-2 text-sm text-white">
          A teacher account is required to use instructor codes.
        </div>
      ) : null}

      {mode === "invite" ? (
        <div className="space-y-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Instructor access</p>
            <h2 className="mt-1 text-xl font-semibold leading-6">Join With Instructor Code</h2>
            <p className="mt-3 text-sm leading-5 text-white/78">
              Enter the one-time code shared by the class director to join as an instructor.
            </p>
          </div>

          {!showInviteInput ? (
            <button
              type="button"
              disabled={!isActiveTeacher}
              onClick={() => setShowInviteInput(true)}
              className="min-h-11 w-full rounded-full bg-white px-4 text-sm font-semibold text-[#17624F] shadow-[0_10px_22px_rgba(10,45,36,0.16)] disabled:opacity-60 md:w-auto md:px-10"
            >
              Enter Code
            </button>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="sr-only">Instructor code</span>
                <input
                  ref={inviteInputRef}
                  value={inviteCode}
                  maxLength={8}
                  onChange={(event) => setInviteCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                  className="sr-only"
                  autoFocus
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inviteInputRef.current?.focus()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      inviteInputRef.current?.focus();
                    }
                  }}
                  className="grid grid-cols-8 gap-1.5"
                >
                  {inviteChars.map((char, index) => (
                    <span
                      key={index}
                      className="flex aspect-[0.78] min-w-0 items-center justify-center rounded-[10px] bg-white text-base font-semibold text-[#17624F] shadow-[0_8px_18px_rgba(10,45,36,0.12)]"
                    >
                      {char.trim() || ""}
                    </span>
                  ))}
                </div>
              </label>

              <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={() => void pasteInviteCode()}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/16 text-white ring-1 ring-white/20 transition-colors hover:bg-white/24"
                  aria-label="Paste instructor code"
                >
                  <ClipboardIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInviteCode("");
                    setShowInviteInput(false);
                  }}
                  className="min-h-11 rounded-full bg-white/16 px-4 text-sm font-semibold text-white ring-1 ring-white/20"
                >
                  Cancel
                </button>
              </div>
              {inviteCode.trim().length === 8 ? (
                <div className="rounded-[18px] bg-white p-4 text-[#26323A] shadow-[0_12px_26px_rgba(10,45,36,0.14)]">
                  {invitePreviewLoading ? (
                    <p className="text-sm font-semibold text-[#6B747B]">Checking code...</p>
                  ) : invitePreviewError ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#C84B3E]">{invitePreviewError}</p>
                      <button type="button" onClick={() => setInviteCode("")} className="min-h-9 rounded-full bg-[#EEF3F5] px-3 text-xs font-semibold text-[#52616A]">Clear</button>
                    </div>
                  ) : invitePreview ? (
                    <>
                      <p className="text-sm font-semibold text-[#26323A]">{invitePreview.title}</p>
                      <p className="mt-1 text-xs font-medium text-[#6B747B]">Directed by {invitePreview.directorName}</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setInviteCode("")} className="min-h-10 rounded-full bg-[#EEF3F5] px-3 text-sm font-semibold text-[#52616A]">
                          Not this class
                        </button>
                        <button type="button" disabled={busy || !isActiveTeacher} onClick={() => void claimInviteCode()} className="min-h-10 rounded-full bg-[#17624F] px-3 text-sm font-semibold text-white disabled:opacity-50">
                          {busy ? "Joining..." : "Join Class"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#C84B3E]">No class found for this code.</p>
                      <button type="button" onClick={() => setInviteCode("")} className="min-h-9 rounded-full bg-[#EEF3F5] px-3 text-xs font-semibold text-[#52616A]">Clear</button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {mode === "create" ? (
        <div className="flex justify-center">
          {canCreateClass ? (
            <TransitionLink href={createHref ?? `/m/${slug}/teacher/classes/new`} label="Add Class" className="min-h-10 rounded-[10px] border border-[#D6DCE0] bg-white px-4 py-2 text-sm font-semibold text-[#52616A] shadow-[0_8px_18px_rgba(38,50,58,0.04)]">
              + Add class
            </TransitionLink>
          ) : (
            <button type="button" disabled className="min-h-10 rounded-[10px] border border-[#D6DCE0] bg-white px-4 text-sm font-semibold text-[#52616A] shadow-[0_8px_18px_rgba(38,50,58,0.04)] disabled:opacity-60">
              + Add class
            </button>
          )}
        </div>
      ) : null}

      {message ? <p className={cn("text-sm", mode === "invite" ? "text-white/82" : "text-[#6B747B]")}>{message}</p> : null}
    </section>
  );
}

/**
 * Student-facing redemption UI, mirroring TeacherWorkspaceTools' mode="invite" flow
 * (same code-entry grid, paste button, live preview via a lookup RPC), but claiming
 * lands the student straight on the registration-confirmation page instead of just
 * assigning a class, since a student invite creates a pre-approved application rather
 * than an instructor assignment.
 */
function StudentInviteCodeTools({ slug }: { slug: string }) {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isParentAccount, setIsParentAccount] = useState(false);
  const [children, setChildren] = useState<StudentDisplay[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [invitePreview, setInvitePreview] = useState<{ programId: string; title: string; directorName: string } | null>(null);
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false);
  const [invitePreviewError, setInvitePreviewError] = useState<string | null>(null);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inviteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        const supabase = createSupabaseBrowserClient();
        const session = await loadCachedSession();
        const userId = session?.user.id ?? null;
        if (!userId) {
          return;
        }
        setCurrentUserId(userId);
        const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle();
        if (profile?.account_type === "parent") {
          setIsParentAccount(true);
          const { children: parentChildren } = await fetchParentChildren(supabase, slug, userId);
          setChildren(parentChildren);
          setSelectedStudentId(parentChildren[0]?.id ?? "");
        } else {
          setSelectedStudentId(userId);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [slug]);

  useEffect(() => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 8) {
      setInvitePreview(null);
      setInvitePreviewLoading(false);
      setInvitePreviewError(null);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setInvitePreviewLoading(true);
        const supabase = createSupabaseBrowserClient();
        const { data: previewRows, error: previewError } = await supabase.rpc("lookup_program_student_invite_code", { invite: code });
        const previewRow = previewRows?.[0] ?? null;
        if (cancelled) {
          return;
        }
        if (previewError) {
          setInvitePreview(null);
          setInvitePreviewLoading(false);
          setInvitePreviewError(previewError.message);
          return;
        }
        if (!previewRow) {
          setInvitePreview(null);
          setInvitePreviewLoading(false);
          setInvitePreviewError(null);
          return;
        }
        setInvitePreviewError(null);
        setInvitePreview({ programId: previewRow.program_id, title: previewRow.title, directorName: previewRow.director_name });
        setInvitePreviewLoading(false);
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [inviteCode]);

  async function claimInviteCode() {
    if (!inviteCode.trim() || !selectedStudentId) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { data: requestId, error: claimError } = await supabase.rpc("claim_program_student_invite_code", {
      invite: inviteCode.trim().toUpperCase(),
      target_student_profile_id: selectedStudentId,
    });
    setBusy(false);
    if (claimError || !requestId) {
      setMessage(friendlyErrorMessage(claimError, "Could not redeem this code."));
      return;
    }
    router.push(`/m/${slug}/registration/${requestId}`);
  }

  async function pasteInviteCode() {
    const clipboardText = await navigator.clipboard.readText().catch(() => "");
    const normalizedCode = clipboardText.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
    if (!normalizedCode) {
      setMessage("Clipboard does not contain a registration code.");
      return;
    }
    setMessage(null);
    setInviteCode(normalizedCode);
    inviteInputRef.current?.focus();
  }

  if (!currentUserId) {
    return null;
  }

  const inviteChars = inviteCode.padEnd(8, " ").slice(0, 8).split("");

  return (
    <section className="rounded-[30px] bg-[#17624F] p-5 text-white shadow-[0_18px_40px_rgba(23,98,79,0.24)]">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Have a registration code?</p>
        <h2 className="mt-1 text-xl font-semibold leading-6">Join With a Class Code</h2>
        <p className="mt-3 text-sm leading-5 text-white/78">Enter the code shared by the class director to register directly.</p>
      </div>

      {!showInviteInput ? (
        <button
          type="button"
          onClick={() => setShowInviteInput(true)}
          className="mt-5 min-h-11 w-full rounded-full bg-white px-4 text-sm font-semibold text-[#17624F] shadow-[0_10px_22px_rgba(10,45,36,0.16)] md:w-auto md:px-10"
        >
          Enter Code
        </button>
      ) : (
        <div className="mt-5 space-y-4">
          {isParentAccount && children.length > 1 ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Registering</span>
              <select
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                className="h-10 w-full rounded-[8px] border-0 bg-white/12 px-3 text-sm text-white outline-none ring-1 ring-white/20 focus:ring-white/50"
              >
                {children.map((child) => (
                  <option key={child.id} value={child.id} className="text-[#26323A]">
                    {child.full_name || "Child"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="sr-only">Registration code</span>
            <input
              ref={inviteInputRef}
              value={inviteCode}
              maxLength={8}
              onChange={(event) => setInviteCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
              className="sr-only"
              autoFocus
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => inviteInputRef.current?.focus()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  inviteInputRef.current?.focus();
                }
              }}
              className="grid grid-cols-8 gap-1.5"
            >
              {inviteChars.map((char, index) => (
                <span key={index} className="flex aspect-[0.78] min-w-0 items-center justify-center rounded-[10px] bg-white text-base font-semibold text-[#17624F] shadow-[0_8px_18px_rgba(10,45,36,0.12)]">
                  {char.trim() || ""}
                </span>
              ))}
            </div>
          </label>

          <div className="grid grid-cols-[auto_1fr_auto] gap-2">
            <button
              type="button"
              onClick={() => void pasteInviteCode()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/16 text-white ring-1 ring-white/20 transition-colors hover:bg-white/24"
              aria-label="Paste registration code"
            >
              <ClipboardIcon />
            </button>
            <button
              type="button"
              onClick={() => {
                setInviteCode("");
                setShowInviteInput(false);
              }}
              className="min-h-11 rounded-full bg-white/16 px-4 text-sm font-semibold text-white ring-1 ring-white/20"
            >
              Cancel
            </button>
          </div>

          {inviteCode.trim().length === 8 ? (
            <div className="rounded-[18px] bg-white p-4 text-[#26323A] shadow-[0_12px_26px_rgba(10,45,36,0.14)]">
              {invitePreviewLoading ? (
                <p className="text-sm font-semibold text-[#6B747B]">Checking code...</p>
              ) : invitePreviewError ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#C84B3E]">{invitePreviewError}</p>
                  <button type="button" onClick={() => setInviteCode("")} className="min-h-9 rounded-full bg-[#EEF3F5] px-3 text-xs font-semibold text-[#52616A]">Clear</button>
                </div>
              ) : invitePreview ? (
                <>
                  <p className="text-sm font-semibold text-[#26323A]">{invitePreview.title}</p>
                  <p className="mt-1 text-xs font-medium text-[#6B747B]">Directed by {invitePreview.directorName}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setInviteCode("")} className="min-h-10 rounded-full bg-[#EEF3F5] px-3 text-sm font-semibold text-[#52616A]">
                      Not this class
                    </button>
                    <button type="button" disabled={busy || !selectedStudentId} onClick={() => void claimInviteCode()} className="min-h-10 rounded-full bg-[#17624F] px-3 text-sm font-semibold text-white disabled:opacity-50">
                      {busy ? "Confirming..." : "Confirm"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#C84B3E]">No class found for this code.</p>
                  <button type="button" onClick={() => setInviteCode("")} className="min-h-9 rounded-full bg-[#EEF3F5] px-3 text-xs font-semibold text-[#52616A]">Clear</button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {message ? <p className="mt-3 text-sm text-white/82">{message}</p> : null}
    </section>
  );
}

function ProgramTeacherStaffTools({ program }: { program: Program }) {
  const [isDirector, setIsDirector] = useState(false);
  const [instructors, setInstructors] = useState<Array<ProgramTeacher & { profile?: Profile | null }>>([]);
  const [inactiveInstructors, setInactiveInstructors] = useState<Array<ProgramInstructorEvent & { profile?: Profile | null }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [latestInviteCode, setLatestInviteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // One RPC call instead of [director-check+assignments+inactive-events] -> profiles, as two
  // sequential stages. Reuses the existing is_program_director() function server-side.
  async function loadStaff() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("get_program_staff_snapshot", { p_program_id: program.id });
    if (error) {
      return;
    }

    const snapshot = data as unknown as {
      isDirector: boolean;
      assignments: ProgramTeacher[];
      inactiveEvents: ProgramInstructorEvent[];
      profiles: Profile[];
    } | null;
    if (!snapshot) {
      return;
    }

    setIsDirector(Boolean(snapshot.isDirector));
    const assignments = snapshot.assignments ?? [];
    const inactiveEvents = snapshot.inactiveEvents ?? [];
    const profiles = snapshot.profiles ?? [];
    setInstructors(
      assignments
        .filter((assignment) => assignment.role === "instructor")
        .map((assignment) => ({
          ...assignment,
          profile: assignment.teacher_profile_id ? profiles.find((profile) => profile.id === assignment.teacher_profile_id) ?? null : null,
        })),
    );
    const activeProfileIds = new Set(assignments.map((assignment) => assignment.teacher_profile_id).filter(Boolean));
    setInactiveInstructors(inactiveEvents.filter((event) => event.teacher_profile_id && !activeProfileIds.has(event.teacher_profile_id)).map((event) => ({ ...event, profile: profiles.find((profile) => profile.id === event.teacher_profile_id) ?? null })));
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadStaff();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id]);

  async function generateInstructorCode() {
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const code = generateInviteCode();
    const { error: insertError } = await supabase.from("program_teachers").insert({
      program_id: program.id,
      teacher_profile_id: null,
      role: "instructor",
      invite_code: code,
      invite_code_created_at: new Date().toISOString(),
    });
    setBusy(false);
    if (insertError) {
      setMessage(insertError.message);
      return;
    }
    setLatestInviteCode(code);
    setMessage("Instructor code generated.");
    await loadStaff();
  }

  async function copyInviteCode(code: string | null) {
    if (!code) {
      return;
    }

    await navigator.clipboard.writeText(code).catch(() => null);
    setToast({ tone: "success", message: "Instructor code copied to clipboard." });
  }

  async function removeInstructor(assignmentId: string) {
    setBusy(true);
    setMessage(null);
    const token = await getCurrentAccessToken();
    const response = token ? await fetch(`/api/programs/${program.id}/instructors/${assignmentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }) : null;
    setBusy(false);
    if (!response?.ok) {
      const result = response ? await response.json().catch(() => ({})) as { error?: string } : {};
      setMessage(result.error ?? "Could not remove instructor.");
      return;
    }
    await loadStaff();
  }

  async function clearInactiveInstructor(eventId: string) {
    setBusy(true);
    const token = await getCurrentAccessToken();
    const response = token ? await fetch(`/api/programs/${program.id}/instructors/history/${eventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }) : null;
    setBusy(false);
    if (!response?.ok) {
      const result = response ? await response.json().catch(() => ({})) as { error?: string } : {};
      setMessage(result.error ?? "Could not clear inactive instructor.");
      return;
    }
    await loadStaff();
  }

  if (!isDirector) {
    return null;
  }

  const unusedCodes = instructors.filter((assignment) => !assignment.teacher_profile_id && assignment.invite_code);
  const activeInstructors = instructors.filter((assignment) => assignment.teacher_profile_id);
  const featuredCode = latestInviteCode ?? unusedCodes[unusedCodes.length - 1]?.invite_code ?? null;

  return (
    <section className="space-y-6 bg-white px-4 pb-24 pt-4">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="rounded-[30px] bg-[#17624F] p-5 text-white shadow-[0_18px_40px_rgba(23,98,79,0.24)]">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-6">Invite An Instructor</h2>
          <p className="mt-1 truncate text-sm font-medium text-white/72">{program.title}</p>
          
        </div>

        <div className="mt-6 grid grid-cols-8 gap-1.5">
          {(featuredCode ?? "--------").split("").map((char, index) => (
            <span
              key={`${char}-${index}`}
              className="flex aspect-[0.78] min-w-0 items-center justify-center rounded-[10px] bg-white text-base font-semibold text-[#17624F] shadow-[0_8px_18px_rgba(10,45,36,0.12)]"
            >
              {char}
            </span>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={generateInstructorCode}
            className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-[#17624F] shadow-[0_10px_22px_rgba(10,45,36,0.16)] disabled:opacity-60"
          >
            New Code
          </button>
          <button
            type="button"
            disabled={!featuredCode}
            onClick={() => void copyInviteCode(featuredCode)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/16 text-white ring-1 ring-white/20 transition-colors hover:bg-white/24 disabled:opacity-45"
            aria-label="Copy instructor code"
          >
            <CopyIcon />
          </button>
        </div>
      </div>

      {message ? <div className="px-1 text-sm font-semibold text-[#17624F]">{message}</div> : null}

      <section className="space-y-2">
        <h2 className="px-1 text-lg font-semibold text-[#26323A]">Active Instructors</h2>
        {activeInstructors.length ? (
          <div className="divide-y divide-[#EEF2F4]">
            {activeInstructors.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#26323A]">{assignment.profile?.full_name || assignment.profile?.email || "Assigned instructor"}</p>
                  <p className="truncate text-sm text-[#6B747B]">{assignment.profile?.email || (assignment.teacher_profile_id ? "Profile hidden until permissions are applied" : "Instructor")}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => void removeInstructor(assignment.id)} className="min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold text-[#C83F31] disabled:opacity-60">
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <MiniEmpty text="No instructors have joined yet." />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-lg font-semibold text-[#26323A]">Inactive Invitations</h2>
        {unusedCodes.length ? (
          <div className="divide-y divide-[#EEF2F4]">
            {unusedCodes.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold tracking-[0.12em] text-[#26323A]">{assignment.invite_code}</p>
                  <p className="mt-0.5 text-sm text-[#7B858C]">Code not claimed yet</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void copyInviteCode(assignment.invite_code)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]" aria-label="Copy unused instructor code">
                    <CopyIcon />
                  </button>
                  <button type="button" disabled={busy} onClick={() => void removeInstructor(assignment.id)} className="min-h-9 rounded-full px-3 text-sm font-semibold text-[#C83F31] disabled:opacity-60">
                    Clear permanently
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <MiniEmpty text="No inactive instructor invitations." />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-lg font-semibold text-[#26323A]">Inactive Instructors</h2>
        {inactiveInstructors.length ? <div className="divide-y divide-[#EEF2F4]">{inactiveInstructors.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-semibold text-[#26323A]">{event.profile?.full_name || event.profile?.email || "Former instructor"}</p><p className="text-xs text-[#7B858C]">Inactive since {formatFinanceDate(event.created_at)}</p></div><button type="button" disabled={busy} onClick={() => void clearInactiveInstructor(event.id)} className="shrink-0 text-xs font-semibold text-[#52616A] disabled:opacity-50">Clear permanently</button></div>)}</div> : <MiniEmpty text="No inactive instructors." />}
      </section>
    </section>
  );
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

type ProgramStudentInviteRow = Database["public"]["Tables"]["program_student_invites"]["Row"];

/**
 * Director-facing generation UI for student registration codes — mirrors
 * ProgramTeacherStaffTools' instructor-code generate/copy/remove flow, but for students,
 * with payment terms (waive, or monthly/annual with a custom price defaulting to the
 * program's own price) baked into each code, mirroring ApplicationDecisionModal's
 * waive/custom-price controls.
 */
function ProgramStudentInviteTools({ program }: { program: Program }) {
  const [canSendInvitations, setCanSendInvitations] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);
  const [invites, setInvites] = useState<ProgramStudentInviteRow[]>([]);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [trackId, setTrackId] = useState("");
  const [maxStudents, setMaxStudents] = useState("1");
  const [expiresAt, setExpiresAt] = useState(() => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  });
  const [bypassEligibility, setBypassEligibility] = useState(true);
  const [comment, setComment] = useState("");
  const [paymentBypassed, setPaymentBypassed] = useState(false);
  const [paymentType, setPaymentType] = useState<"monthly" | "annual">("monthly");
  const [customPriceMonthly, setCustomPriceMonthly] = useState(() => (program.price_monthly_cents ? String(program.price_monthly_cents / 100) : ""));
  const [customPriceAnnual, setCustomPriceAnnual] = useState(() => (program.price_annual_cents ? String(program.price_annual_cents / 100) : ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [latestInviteCode, setLatestInviteCode] = useState<string | null>(null);

  async function loadInvites() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: invitationAllowed }, { data: inviteRows }, { data: trackRows }] = await Promise.all([
      supabase.rpc("can_send_program_direct_invitations", { check_program_id: program.id }),
      supabase.from("program_student_invites").select("*").eq("program_id", program.id).order("created_at", { ascending: true }),
      supabase.from("program_tracks").select("*").eq("program_id", program.id).eq("is_active", true).order("sort_order", { ascending: true }),
    ]);
    setCanSendInvitations(Boolean(invitationAllowed));
    setInvites(inviteRows ?? []);
    setTracks(trackRows ?? []);
    setTrackId((current) => current || trackRows?.[0]?.id || "");
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadInvites();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id]);

  async function generateCode() {
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const code = generateInviteCode();
    const { data: sessionData } = await supabase.auth.getSession();
    const { error: insertError } = await supabase.from("program_student_invites").insert({
      program_id: program.id,
      program_track_id: trackId || null,
      invite_code: code,
      comment: comment.trim() || null,
      max_students: Math.max(1, Math.min(25, Math.round(Number(maxStudents) || 1))),
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      bypass_eligibility: bypassEligibility,
      payment_bypassed: paymentBypassed,
      payment_bypass_external: false,
      payment_type: paymentType,
      custom_price_monthly_cents: !paymentBypassed && paymentType === "monthly" ? Math.max(0, Math.round(Number(customPriceMonthly || "0") * 100)) : null,
      custom_price_annual_cents: !paymentBypassed && paymentType === "annual" ? Math.max(0, Math.round(Number(customPriceAnnual || "0") * 100)) : null,
      created_by: sessionData.session?.user.id ?? null,
    });
    setBusy(false);
    if (insertError) {
      setMessage(insertError.message);
      return;
    }
    setLatestInviteCode(code);
    setComment("");
    setMessage("Registration code generated.");
    await loadInvites();
  }

  async function copyCode(code: string | null) {
    if (!code) {
      return;
    }
    await navigator.clipboard.writeText(code).catch(() => null);
    setToast({ tone: "success", message: "Registration code copied to clipboard." });
  }

  async function removeInvite(id: string) {
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error: deleteError } = await supabase.from("program_student_invites").delete().eq("id", id);
    setBusy(false);
    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }
    await loadInvites();
  }

  if (!canSendInvitations) {
    return null;
  }

  const unusedInvites = invites.filter((invite) => !invite.claimed_at);
  const claimedInvites = invites.filter((invite) => invite.claimed_at);
  const featuredCode = latestInviteCode ?? unusedInvites[unusedInvites.length - 1]?.invite_code ?? null;

  if (!toolOpen) {
    return (
      <section className="bg-white px-4 pb-8 pt-2">
        <EditorToast toast={toast} onClose={() => setToast(null)} />
        <div className="flex items-center justify-between gap-3 rounded-[24px] bg-[#17624F] px-4 py-3 text-white shadow-[0_14px_30px_rgba(23,98,79,0.20)]">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Direct Invitations</h2>
            <p className="mt-0.5 text-xs font-medium text-white/72">
              {unusedInvites.length ? `${unusedInvites.length} unused ${unusedInvites.length === 1 ? "code" : "codes"}` : "Generate invite-only student access"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToolOpen(true)}
            className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#17624F] shadow-[0_8px_18px_rgba(10,45,36,0.16)]"
          >
            Open
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 bg-white px-4 pb-8 pt-4">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-semibold text-[#26323A]">Direct Invitations</h2>
        <button type="button" onClick={() => setToolOpen(false)} className="rounded-full bg-[#EEF3F5] px-3 py-1.5 text-xs font-semibold text-[#52616A]">
          Close
        </button>
      </div>
      <div className="rounded-[30px] bg-[#17624F] p-5 text-white shadow-[0_18px_40px_rgba(23,98,79,0.24)]">
        <h2 className="text-xl font-semibold leading-6">Configure Direct Invitation</h2>
        <p className="mt-1 truncate text-sm font-medium text-white/72">{program.title}</p>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Track</span>
            <select value={trackId} onChange={(event) => setTrackId(event.target.value)} className="h-10 w-full rounded-[8px] border-0 bg-white/12 px-3 text-sm text-white outline-none ring-1 ring-white/20 focus:ring-white/50">
              {!tracks.length ? <option value="" className="text-[#26323A]">General admission</option> : null}
              {tracks.map((track) => <option key={track.id} value={track.id} className="text-[#26323A]">{track.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Students</span>
              <input type="number" min={1} max={25} value={maxStudents} onChange={(event) => setMaxStudents(event.target.value)} className="h-10 w-full rounded-[8px] border-0 bg-white/12 px-3 text-sm text-white outline-none ring-1 ring-white/20 focus:ring-white/50" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Expires</span>
              <input type="date" value={expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setExpiresAt(event.target.value)} className="h-10 w-full rounded-[8px] border-0 bg-white/12 px-3 text-sm text-white outline-none ring-1 ring-white/20 focus:ring-white/50" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Comment</span>
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="h-10 w-full rounded-[8px] border-0 bg-white/12 px-3 text-sm text-white placeholder:text-white/50 outline-none ring-1 ring-white/20 focus:ring-white/50"
            />
          </label>
          <label className="flex items-start gap-2 text-sm font-semibold text-white">
            <input className="mt-0.5" type="checkbox" checked={bypassEligibility} onChange={(event) => setBypassEligibility(event.target.checked)} />
            <span>Bypass eligibility and capacity <span className="block text-xs font-medium text-white/65">Turn off to enforce age, gender, existing enrollment, and available track capacity.</span></span>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-white">
            <input type="checkbox" checked={paymentBypassed} onChange={(event) => setPaymentBypassed(event.target.checked)} />
            Waive payment for this registration
          </label>
          {!paymentBypassed ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType("monthly")}
                  className={cn("min-h-10 rounded-[9px] text-sm font-semibold transition-colors", paymentType === "monthly" ? "bg-white text-[#17624F]" : "bg-white/12 text-white")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType("annual")}
                  className={cn("min-h-10 rounded-[9px] text-sm font-semibold transition-colors", paymentType === "annual" ? "bg-white text-[#17624F]" : "bg-white/12 text-white")}
                >
                  {program.is_ongoing ? "Annual Subscription" : "Pay in Full"}
                </button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">{paymentType === "monthly" ? "Monthly price" : program.is_ongoing ? "Annual subscription price" : "Pay in Full price"}</span>
                <input
                  value={paymentType === "monthly" ? customPriceMonthly : customPriceAnnual}
                  onChange={(event) => (paymentType === "monthly" ? setCustomPriceMonthly(event.target.value) : setCustomPriceAnnual(event.target.value))}
                  inputMode="decimal"
                  className="h-10 w-full rounded-[8px] border-0 bg-white/12 px-3 text-sm text-white outline-none ring-1 ring-white/20 focus:ring-white/50"
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-8 gap-1.5">
          {(featuredCode ?? "--------").split("").map((char, index) => (
            <span
              key={`${char}-${index}`}
              className="flex aspect-[0.78] min-w-0 items-center justify-center rounded-[10px] bg-white text-base font-semibold text-[#17624F] shadow-[0_8px_18px_rgba(10,45,36,0.12)]"
            >
              {char}
            </span>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void generateCode()}
            className="min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-[#17624F] shadow-[0_10px_22px_rgba(10,45,36,0.16)] disabled:opacity-60"
          >
            Generate Invitation
          </button>
          <button
            type="button"
            disabled={!featuredCode}
            onClick={() => void copyCode(featuredCode)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/16 text-white ring-1 ring-white/20 transition-colors hover:bg-white/24 disabled:opacity-45"
            aria-label="Copy registration code"
          >
            <CopyIcon />
          </button>
        </div>
      </div>

      {message ? <div className="px-1 text-sm font-semibold text-[#17624F]">{message}</div> : null}

      <section className="space-y-2">
        <h2 className="px-1 text-lg font-semibold text-[#26323A]">Available Invitations</h2>
        {unusedInvites.length ? (
          <div className="divide-y divide-[#EEF2F4]">
            {unusedInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold tracking-[0.12em] text-[#26323A]">{invite.invite_code}</p>
                  <p className="mt-0.5 truncate text-sm text-[#7B858C]">{tracks.find((track) => track.id === invite.program_track_id)?.name || "General admission"} · up to {invite.max_students} {invite.max_students === 1 ? "student" : "students"}</p>
                  <p className="mt-0.5 truncate text-xs text-[#8A949A]">{invite.comment || "No message"} · {invite.expires_at ? `expires ${formatFinanceDate(invite.expires_at)}` : "no expiry"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void copyCode(invite.invite_code)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]" aria-label="Copy registration code">
                    <CopyIcon />
                  </button>
                  <button type="button" disabled={busy} onClick={() => void removeInvite(invite.id)} className="min-h-9 rounded-full px-3 text-sm font-semibold text-[#C83F31] disabled:opacity-60">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <MiniEmpty text="No unused registration codes." />
        )}
      </section>

      {claimedInvites.length ? (
        <section className="space-y-2">
          <h2 className="px-1 text-lg font-semibold text-[#26323A]">Redeemed Invitations</h2>
          <div className="divide-y divide-[#EEF2F4]">
            {claimedInvites.map((invite) => (
              <div key={invite.id} className="py-3">
                <p className="truncate font-semibold tracking-[0.12em] text-[#26323A]">{invite.invite_code}</p>
                <p className="mt-0.5 text-sm text-[#7B858C]">{invite.comment || "Claimed"} · {formatFinanceDate(invite.claimed_at)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function AccountPanelFrame({ children }: { children: ReactNode }) {
  return <div className="w-full shrink-0 px-1 pb-24">{children}</div>;
}

function AccountAvatar({ src, name, size = "lg" }: { src: string | null; name: string; size?: "sm" | "lg" }) {
  const sizeClass = size === "sm" ? "h-16 w-16 text-xl shadow-[0_10px_26px_rgba(38,50,58,0.1)]" : "h-32 w-32 text-4xl shadow-[0_18px_42px_rgba(38,50,58,0.12)]";
  if (src) {
    return <Image src={src} alt="" width={128} height={128} className={cn(sizeClass, "rounded-full object-cover")} />;
  }

  return (
    <div className={cn("flex items-center justify-center rounded-full bg-gradient-to-br from-[#DAF7ED] via-[#D9EEF3] to-[#80BDAF] font-semibold text-[#17624F]", sizeClass)}>
      {initials(name)}
    </div>
  );
}

function AccountMenuButton({
  icon,
  label,
  tone = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[74px] w-full items-center gap-4 text-left transition-colors hover:bg-[#F2F6F7]">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center", tone === "danger" ? "text-[#C83F31]" : "text-[#26323A]")}>{icon}</span>
      <span className={cn("min-w-0 flex-1 text-[15px] font-semibold", tone === "danger" ? "text-[#C83F31]" : "text-[#26323A]")}>{label}</span>
      <ChevronRightIcon className={tone === "danger" ? "text-[#C83F31]" : "text-[#9AA4AA]"} />
    </button>
  );
}

function AccountSubpageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex min-h-12 items-center gap-4">
      <button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#26323A] shadow-[0_10px_22px_rgba(38,50,58,0.08)] ring-1 ring-[#E4EAEE] transition active:scale-90 active:bg-[#EDF2F4]" aria-label="Back">
        <BackArrowIcon />
      </button>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[#1F2A31]">{title}</h1>
    </header>
  );
}


function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Shared subscribe/unsubscribe logic for web push, used by both the Account Settings
 * toggle and the home-page onboarding nudge — one implementation of the actual
 * permission/subscribe/API-call flow, two different UI presentations of it.
 */
function usePushSubscription() {
  const [supported] = useState(() => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
  const [permission, setPermission] = useState<NotificationPermission | null>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : null,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) {
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => {});
  }, [supported]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        setError("Notification permission was not granted.");
        setBusy(false);
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setError("Push notifications are not configured yet.");
        setBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const token = await getCurrentAccessToken();
      if (!token) {
        setError("Please sign in again to enable notifications.");
        setBusy(false);
        return;
      }

      const subscriptionJson = subscription.toJSON();
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        setError(result.error ?? "Could not save subscription.");
        setBusy(false);
        return;
      }

      setSubscribed(true);
    } catch {
      setError("Could not enable push notifications on this device.");
    }
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const token = await getCurrentAccessToken();
        if (token) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint }),
          });
        }
      }
      setSubscribed(false);
    } catch {
      setError("Could not disable push notifications.");
    }
    setBusy(false);
  }

  return { supported, permission, subscribed, busy, error, enable, disable };
}

function PushNotificationToggle() {
  const { supported, subscribed, busy, error, enable, disable } = usePushSubscription();

  if (!supported) {
    return null;
  }

  return (
    <section className="mt-7">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A9399]">Notifications</p>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-[#E6EAED] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#26323A]">Push notifications</p>
          <p className="mt-0.5 text-xs leading-5 text-[#6B747B]">Get notified on this device when your inbox has something new.</p>
          {error ? <p className="mt-1 text-xs font-semibold text-[#C0392B]">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => (subscribed ? void disable() : void enable())}
          disabled={busy}
          className={cn(
            "min-h-9 shrink-0 rounded-full px-4 text-xs font-semibold transition-colors disabled:opacity-60",
            subscribed ? "bg-[#E2F6E8] text-[#258A43]" : "bg-[#F0F4F5] text-[#52616A]",
          )}
        >
          {busy ? "..." : subscribed ? "On" : "Off"}
        </button>
      </div>
    </section>
  );
}

const a2hsNudgeShownStorageKey = "madrasa:a2hs-nudge-shown";

function wasA2hsNudgeShownThisSession() {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.sessionStorage.getItem(a2hsNudgeShownStorageKey) === "1";
  } catch {
    return true;
  }
}

function markA2hsNudgeShown() {
  try {
    window.sessionStorage.setItem(a2hsNudgeShownStorageKey, "1");
  } catch {
    // Best-effort only; worst case the nudge just reappears next navigation.
  }
}

/**
 * A once-per-session nudge shown on the home dashboard encouraging browser users to add the
 * app to their home screen. Hidden entirely once the app is already running standalone
 * (installed), or on desktop browsers. Android gets a direct "Install App" button when the
 * browser has fired beforeinstallprompt; both platforms always get "See How", which deep-links
 * into the existing homescreen-instructions panel in Account Settings.
 */
function AddToHomeScreenNudge({ slug, settingsHref }: { slug: string; settingsHref: string }) {
  const [visible, setVisible] = useState(false);
  const [mosqueName, setMosqueName] = useState(() => getCachedMosqueChrome(slug)?.name ?? "");
  const platform = useMemo(() => detectMobilePlatform(), []);

  useEffect(() => {
    if (platform === "other" || isStandalone() || wasA2hsNudgeShownThisSession()) {
      return;
    }

    let cancelled = false;
    void loadCachedSession().then((session) => {
      if (cancelled || !session) {
        return;
      }
      markA2hsNudgeShown();
      setVisible(true);
    });

    return () => {
      cancelled = true;
    };
  }, [platform]);

  useEffect(() => {
    if (!visible || mosqueName) {
      return;
    }
    void loadMosqueChrome(slug).then((chrome) => {
      if (chrome?.name) {
        setMosqueName(chrome.name);
      }
    });
  }, [visible, mosqueName, slug]);

  if (!visible) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/45 px-5 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="a2hs-nudge-title" className="w-full max-w-sm rounded-[28px] bg-[#E7F7F1] px-5 py-5 shadow-[0_24px_70px_rgba(38,50,58,0.24)]">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-xl font-medium text-[#17624F]" aria-hidden>
            📲
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="a2hs-nudge-title" className="text-base font-semibold text-[#26323A]">
              Add {mosqueName || "this app"} to your Home Screen
            </h2>
            <p className="mt-0.5 text-sm leading-5 text-[#52616A]">Get quick access and a full-screen experience, right from your home screen.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={`${settingsHref}?panel=homescreen`}
                onClick={() => setVisible(false)}
                className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#26323A] shadow-[0_10px_22px_rgba(38,50,58,0.12)] ring-1 ring-white/70"
              >
                See How
              </Link>
              <button type="button" onClick={() => setVisible(false)} className="text-xs font-semibold text-[#26323A]/60 hover:text-[#26323A]">
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EditableProfileRow({
  label,
  value,
  editValue,
  editing,
  saving,
  placeholder,
  inputType = "text",
  inputMode,
  onEdit,
  onChange,
  onSave,
}: {
  label: string;
  value: string;
  editValue: string;
  editing: boolean;
  saving: boolean;
  placeholder?: string;
  inputType?: string;
  inputMode?: "text" | "tel" | "email" | "numeric" | "decimal" | "search" | "url";
  onEdit: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="py-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#26323A]">{label}</p>
          {editing ? (
            <input
              type={inputType}
              inputMode={inputMode}
              value={editValue}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#D9E0E4] bg-white px-4 text-[15px] text-[#26323A] outline-none focus:border-[#2F8FB3]"
              suppressHydrationWarning
            />
          ) : (
            <p className="mt-1 break-words text-[15px] leading-6 text-[#7A838A]">{value}</p>
          )}
        </div>
        {editing ? (
          <button type="button" onClick={onSave} disabled={saving} className="pt-0.5 text-sm font-semibold text-[#17624F] underline-offset-2 hover:underline disabled:opacity-60">
            {saving ? "Saving" : "Save"}
          </button>
        ) : (
          <button type="button" onClick={onEdit} className="pt-0.5 text-sm font-semibold text-[#26323A] underline underline-offset-2">
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

const avatarCropWorkspaceSize = 420;
const avatarCropCircleSize = 256;
const avatarCropOutputSize = 512;

function cropAvatarImage(source: string, scale: number, offset: { x: number; y: number }) {
  return new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = avatarCropOutputSize;
      canvas.height = avatarCropOutputSize;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas not available"));
        return;
      }

      const fitScale = Math.min(avatarCropWorkspaceSize / image.naturalWidth, avatarCropWorkspaceSize / image.naturalHeight);
      const totalScale = fitScale * scale;
      const displayWidth = image.naturalWidth * totalScale;
      const displayHeight = image.naturalHeight * totalScale;
      const imageLeft = avatarCropWorkspaceSize / 2 - displayWidth / 2 + offset.x;
      const imageTop = avatarCropWorkspaceSize / 2 - displayHeight / 2 + offset.y;
      const cropLeft = (avatarCropWorkspaceSize - avatarCropCircleSize) / 2;
      const cropTop = (avatarCropWorkspaceSize - avatarCropCircleSize) / 2;
      const sourceX = (cropLeft - imageLeft) / totalScale;
      const sourceY = (cropTop - imageTop) / totalScale;
      const sourceSize = avatarCropCircleSize / totalScale;

      context.fillStyle = "#F2F4F5";
      context.fillRect(0, 0, avatarCropOutputSize, avatarCropOutputSize);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, avatarCropOutputSize, avatarCropOutputSize);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = source;
  });
}

function EditProfilePhotoPanel({
  previewUrl,
  name,
  scale,
  offset,
  saving,
  fileInputRef,
  onBack,
  onScaleChange,
  onOffsetChange,
  onFileChange,
  onConfirm,
}: {
  previewUrl: string;
  name: string;
  scale: number;
  offset: { x: number; y: number };
  saving: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onScaleChange: (nextScale: number) => void;
  onOffsetChange: (nextOffset: { x: number; y: number }) => void;
  onFileChange: (file: File | null) => void;
  onConfirm: () => void;
}) {
  const [dragState, setDragState] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!previewUrl) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    });
  }

  function dragPhoto(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    onOffsetChange({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }
  }

  function zoomPhoto(event: ReactWheelEvent<HTMLDivElement>) {
    if (!previewUrl) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    onScaleChange(Math.min(2.5, Math.max(0.6, Number((scale + delta).toFixed(2)))));
  }

  function resetPhoto() {
    onScaleChange(1);
    onOffsetChange({ x: 0, y: 0 });
  }

  return (
    <section className="-mx-5 min-h-[calc(100vh-140px)] bg-[var(--workspace)] px-5 pb-8 pt-1">
      <header className="flex h-14 items-center justify-between">
        <button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-full text-[#26323A] transition active:scale-90 active:bg-[#EDF2F4]" aria-label="Back">
          <BackArrowIcon />
        </button>
        <h1 className="text-base font-semibold text-[#26323A]">Preview</h1>
        <span className="h-10 w-10" aria-hidden />
      </header>

      <div className="mt-5 rounded-[28px] bg-[#F2F3F3] px-4 py-8 md:px-8">
        <div
          className={cn(
            "relative mx-auto flex h-[420px] w-full max-w-[420px] items-center justify-center overflow-hidden rounded-[28px] bg-[#EEF0F0]",
            previewUrl && "cursor-grab touch-none select-none active:cursor-grabbing",
          )}
          onPointerDown={beginDrag}
          onPointerMove={dragPhoto}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={zoomPhoto}
        >
          {previewUrl ? (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] bg-contain bg-center bg-no-repeat will-change-transform"
              style={{
                backgroundImage: `url("${previewUrl}")`,
                transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              }}
              aria-hidden
            />
          ) : (
            <span className="text-5xl font-semibold text-[#17624F]">{initials(name)}</span>
          )}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle 128px at center, transparent 0 126px, rgba(242, 243, 243, 0.74) 127px, rgba(242, 243, 243, 0.86) 100%)",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_22px_48px_rgba(38,50,58,0.18)]"
            aria-hidden
          />
        </div>
      </div>

      <div className="mx-auto -mt-8 flex w-fit items-center overflow-hidden rounded-full bg-white shadow-[0_14px_30px_rgba(38,50,58,0.14)] ring-1 ring-[#E4EAEE]">
        <button type="button" onClick={() => onScaleChange(Math.max(0.6, Number((scale - 0.1).toFixed(1))))} className="flex h-12 w-14 items-center justify-center text-2xl text-[#26323A]" aria-label="Zoom out">
          -
        </button>
        <button type="button" onClick={() => onScaleChange(Math.min(2.5, Number((scale + 0.1).toFixed(1))))} className="flex h-12 w-14 items-center justify-center border-l border-[#E4EAEE] text-2xl text-[#26323A]" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={resetPhoto} className="h-12 border-l border-[#E4EAEE] px-6 text-sm font-semibold text-[#26323A]">
          Reset
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
      <div className="mt-9 space-y-4">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="min-h-12 w-full rounded-full bg-[#F2F4F5] px-5 text-sm font-semibold text-[#26323A]">
          Select another photo
        </button>
        <button type="button" onClick={onConfirm} disabled={saving} className="min-h-12 w-full rounded-full bg-[#171717] px-5 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Confirm"}
        </button>
      </div>
    </section>
  );
}

const imageCropWorkspaceSize = 340;

function cropImageToFile(
  source: string,
  scale: number,
  offset: { x: number; y: number },
  options: { frameWidth: number; frameHeight: number; outputWidth: number; outputHeight: number; fileName: string },
) {
  return new Promise<File>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = options.outputWidth;
      canvas.height = options.outputHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas not available"));
        return;
      }

      const fitScale = Math.min(imageCropWorkspaceSize / image.naturalWidth, imageCropWorkspaceSize / image.naturalHeight);
      const totalScale = fitScale * scale;
      const displayWidth = image.naturalWidth * totalScale;
      const displayHeight = image.naturalHeight * totalScale;
      const imageLeft = imageCropWorkspaceSize / 2 - displayWidth / 2 + offset.x;
      const imageTop = imageCropWorkspaceSize / 2 - displayHeight / 2 + offset.y;
      const cropLeft = (imageCropWorkspaceSize - options.frameWidth) / 2;
      const cropTop = (imageCropWorkspaceSize - options.frameHeight) / 2;
      const sourceX = (cropLeft - imageLeft) / totalScale;
      const sourceY = (cropTop - imageTop) / totalScale;
      const sourceWidth = options.frameWidth / totalScale;
      const sourceHeight = options.frameHeight / totalScale;

      context.fillStyle = "#F2F4F5";
      context.fillRect(0, 0, options.outputWidth, options.outputHeight);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, options.outputWidth, options.outputHeight);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not export image"));
            return;
          }
          resolve(new File([blob], options.fileName, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.9,
      );
    };
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = source;
  });
}

/**
 * A generic drag/zoom cropper for any fixed aspect ratio, generalizing the avatar cropper's
 * exact interaction (CSS bg-contain workspace, pointer drag, wheel/± zoom) and canvas math to a
 * centered rectangular frame instead of a fixed circle.
 */
function ImageCropModal({
  file,
  aspectRatio,
  outputWidth,
  outputHeight,
  title,
  onCancel,
  onConfirm,
}: {
  file: File;
  aspectRatio: number;
  outputWidth: number;
  outputHeight: number;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const maxFrameSize = imageCropWorkspaceSize - 40;
  const frameWidth = aspectRatio >= 1 ? maxFrameSize : maxFrameSize * aspectRatio;
  const frameHeight = aspectRatio >= 1 ? maxFrameSize / aspectRatio : maxFrameSize;

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y });
  }

  function dragImage(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setOffset({ x: dragState.originX + event.clientX - dragState.startX, y: dragState.originY + event.clientY - dragState.startY });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }
  }

  function zoomImage(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    setScale((current) => Math.min(2.5, Math.max(0.6, Number((current + delta).toFixed(2)))));
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      const cropped = await cropImageToFile(objectUrl, scale, offset, {
        frameWidth,
        frameHeight,
        outputWidth,
        outputHeight,
        fileName: `${file.name.replace(/\.[^./\\]+$/, "")}.jpg`,
      });
      onConfirm(cropped);
    } catch {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/60 px-5 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="image-crop-title" className="w-full max-w-sm rounded-[28px] bg-white px-5 py-5 shadow-[0_24px_70px_rgba(38,50,58,0.28)]">
        <h2 id="image-crop-title" className="text-base font-semibold text-[#26323A]">
          {title}
        </h2>
        <div className="mt-4 flex justify-center">
          <div
            className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[#EEF0F0] active:cursor-grabbing"
            style={{ width: imageCropWorkspaceSize, height: imageCropWorkspaceSize }}
            onPointerDown={beginDrag}
            onPointerMove={dragImage}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={zoomImage}
          >
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 bg-contain bg-center bg-no-repeat will-change-transform"
              style={{
                width: imageCropWorkspaceSize,
                height: imageCropWorkspaceSize,
                backgroundImage: `url("${objectUrl}")`,
                transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-white"
              style={{ width: frameWidth, height: frameHeight, boxShadow: "0 0 0 9999px rgba(38,50,58,0.55)" }}
              aria-hidden
            />
          </div>
        </div>
        <div className="mx-auto mt-4 flex w-fit items-center overflow-hidden rounded-full bg-[#F2F4F5]">
          <button type="button" onClick={() => setScale((current) => Math.max(0.6, Number((current - 0.1).toFixed(1))))} className="flex h-10 w-12 items-center justify-center text-xl text-[#26323A]" aria-label="Zoom out">
            -
          </button>
          <button type="button" onClick={() => setScale((current) => Math.min(2.5, Number((current + 0.1).toFixed(1))))} className="flex h-10 w-12 items-center justify-center border-l border-white text-xl text-[#26323A]" aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={reset} className="h-10 border-l border-white px-4 text-sm font-semibold text-[#26323A]">
            Reset
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-full bg-[#F2F4F5] px-4 text-sm font-semibold text-[#26323A]">
            Cancel
          </button>
          <button type="button" onClick={() => void handleConfirm()} disabled={saving} className="min-h-11 rounded-full bg-[#171717] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StaticAccountNote({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_45px_rgba(38,50,58,0.08)] ring-1 ring-[#E4EAEE]">
      <h2 className="text-base font-semibold text-[#26323A]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#6B747B]">{text}</p>
    </section>
  );
}

function AccountUserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c1.1-3.5 3.3-5.3 6.5-5.3s5.4 1.8 6.5 5.3" />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1.2a3.2 3.2 0 0 0-2.4-3.1" />
      <path d="M15.6 5.2a3 3 0 0 1 0 5.6" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 5 6v5.2c0 4.3 2.8 7.8 7 9.8 4.2-2 7-5.5 7-9.8V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.5-4" />
    </svg>
  );
}

function HomeScreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18h2" />
      <path d="M12 7v7" />
      <path d="m9.5 9.5 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 17 15 12l-5-5" />
      <path d="M15 12H3" />
      <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

function ChevronRightIcon({ className = "text-[#9AA4AA]" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 18-6-6 6-6" />
      <path d="M9 12h11" />
    </svg>
  );
}

function Logo({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return <Image src={src} alt="" width={48} height={48} className="h-12 w-12 shrink-0 border border-[#D6DCE0] object-contain" />;
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#D6DCE0] bg-[#F7F8F9] text-sm font-medium text-[#2F8FB3]">
      {initials(name)}
    </div>
  );
}

export function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return <Image src={src} alt="" width={42} height={42} className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E7F3F8] text-sm font-medium text-[#2F8FB3]">
      {initials(name)}
    </div>
  );
}

function ProgramDetailLoadingState() {
  return <GenericLoadingState label="Loading class" layout="detail" />;
}

function ClassesLoadingPlaceholders({ count = 2 }: { count?: number }) {
  void count;
  return <GenericLoadingState label="Loading classes" layout="classes" />;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function lastNameOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "").toLowerCase();
}

export function displayAge(profile: Pick<Profile, "date_of_birth" | "age"> | null | undefined) {
  const calculatedAge = calculateAge(profile?.date_of_birth ?? null);
  if (calculatedAge !== null) {
    return `${calculatedAge}`;
  }
  return profile?.age?.trim() || "Not provided";
}

function formatMemberDate(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function calculateAge(dateOfBirth: string | null) {
  if (!dateOfBirth) {
    return null;
  }
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function profileAgeNumber(profile: Pick<Profile, "date_of_birth" | "age"> | null | undefined) {
  const calculatedAge = calculateAge(profile?.date_of_birth ?? null);
  if (calculatedAge !== null) {
    return calculatedAge;
  }

  const parsedAge = Number.parseInt(profile?.age ?? "", 10);
  return Number.isFinite(parsedAge) ? parsedAge : null;
}

function isProfileEligibleForProgram(profile: Pick<Profile, "date_of_birth" | "age" | "gender"> | null | undefined, program: Pick<Program, "age_range_text" | "audience_gender">) {
  const ageBounds = parseAgeRange(program.age_range_text);
  if (ageBounds) {
    const age = profileAgeNumber(profile);
    if (age === null) {
      return { eligible: false, reason: "Missing age requirement for this class." };
    }
    if (ageBounds.min !== null && age < ageBounds.min) {
      return { eligible: false, reason: `Outside age range: must be ${ageBounds.min} or older.` };
    }
    if (ageBounds.max !== null && age > ageBounds.max) {
      return { eligible: false, reason: `Outside age range: must be ${ageBounds.max} or younger.` };
    }
  }

  const audience = formatGender(program.audience_gender);
  const gender = normalizeGender(profile?.gender ?? null);
  if (audience === "Brothers Only" && gender !== "male") {
    return { eligible: false, reason: "Audience requirement: brothers only." };
  }
  if (audience === "Sisters Only" && gender !== "female") {
    return { eligible: false, reason: "Audience requirement: sisters only." };
  }

  return { eligible: true, reason: null };
}

function isProfileEligibleForTrack(
  profile: Pick<Profile, "date_of_birth" | "age" | "gender"> | null | undefined,
  track: Pick<ProgramTrack, "age_min" | "age_max" | "gender_override"> | null | undefined,
  program: Pick<Program, "age_range_text" | "audience_gender">,
) {
  if (track?.age_min != null || track?.age_max != null) {
    const age = profileAgeNumber(profile);
    if (age === null) {
      return { eligible: false, reason: "Missing age requirement for this class." };
    }
    if (track.age_min != null && age < track.age_min) {
      return { eligible: false, reason: `Outside age range: must be ${track.age_min} or older.` };
    }
    if (track.age_max != null && age > track.age_max) {
      return { eligible: false, reason: `Outside age range: must be ${track.age_max} or younger.` };
    }
  } else {
    const ageBounds = parseAgeRange(program.age_range_text);
    if (ageBounds) {
      const age = profileAgeNumber(profile);
      if (age === null) {
        return { eligible: false, reason: "Missing age requirement for this class." };
      }
      if (ageBounds.min !== null && age < ageBounds.min) {
        return { eligible: false, reason: `Outside age range: must be ${ageBounds.min} or older.` };
      }
      if (ageBounds.max !== null && age > ageBounds.max) {
        return { eligible: false, reason: `Outside age range: must be ${ageBounds.max} or younger.` };
      }
    }
  }

  const gender = normalizeGender(profile?.gender ?? null);
  const trackGender = track?.gender_override && track.gender_override !== "all" ? track.gender_override : null;
  if (trackGender) {
    if (trackGender === "brothers" && gender !== "male") {
      return { eligible: false, reason: "Audience requirement: brothers only." };
    }
    if (trackGender === "sisters" && gender !== "female") {
      return { eligible: false, reason: "Audience requirement: sisters only." };
    }
  } else {
    const audience = formatGender(program.audience_gender);
    if (audience === "Brothers Only" && gender !== "male") {
      return { eligible: false, reason: "Audience requirement: brothers only." };
    }
    if (audience === "Sisters Only" && gender !== "female") {
      return { eligible: false, reason: "Audience requirement: sisters only." };
    }
  }

  return { eligible: true, reason: null };
}

function parseAgeRange(ageRange: string | null) {
  const normalized = ageRange?.trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "all ages") {
    return null;
  }

  const cleaned = normalized.replace(/^ages?\s*/, "");
  const rangeMatch = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }

  const plusMatch = cleaned.match(/^(\d+)\s*\+$/);
  if (plusMatch) {
    return { min: Number(plusMatch[1]), max: null };
  }

  const exactMatch = cleaned.match(/^(\d+)$/);
  if (exactMatch) {
    const age = Number(exactMatch[1]);
    return { min: age, max: age };
  }

  return null;
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

type ProgramPaymentOptionsInput = Pick<
  Program,
  "is_paid" | "offers_monthly_payment" | "offers_annual_payment" | "price_monthly_cents" | "price_annual_cents" | "is_ongoing" | "start_date" | "end_date" | "duration_months" | "billing_duration_months"
>;

function programPayInFullDurationMonths(program: Pick<Program, "start_date" | "end_date" | "duration_months" | "billing_duration_months">) {
  return program.billing_duration_months ?? program.duration_months ?? estimateBillingMonths(program.start_date ?? "", program.end_date ?? "") ?? null;
}

/** Duration to compare monthly-vs-annual pricing against. An ongoing program's annual option
 * is a yearly renewal, so it's always weighed against 12 months of monthly payments — a
 * fixed-duration program's annual option is a lump sum for the whole known length instead. */
function pricingComparisonDurationMonths(program: Pick<Program, "is_ongoing" | "start_date" | "end_date" | "duration_months" | "billing_duration_months">) {
  return program.is_ongoing ? 12 : programPayInFullDurationMonths(program);
}

function programOfferedPaymentTypes(program: Pick<Program, "is_paid" | "offers_monthly_payment" | "offers_annual_payment" | "is_ongoing">): PaymentType[] {
  if (!program.is_paid) {
    return [];
  }
  const types: PaymentType[] = [];
  if (program.offers_monthly_payment !== false) {
    types.push("monthly");
  }
  if (program.offers_annual_payment) {
    types.push("annual");
  }
  return types;
}

export function programPaymentOptions(program: ProgramPaymentOptionsInput) {
  if (!program.is_paid) {
    return [];
  }
  const monthlyEnabled = program.offers_monthly_payment !== false && Boolean(program.price_monthly_cents);
  const annualEnabled = Boolean(program.offers_annual_payment && program.price_annual_cents);
  const durationMonths = pricingComparisonDurationMonths(program);
  const options: Array<{ type: PaymentType; title: string; price: string; subtitle: string; badge?: string }> = [];
  if (monthlyEnabled) {
    const monthlyBadge = monthlyEnabled && annualEnabled ? monthlyDealText(program) : "";
    const fixedRange = !program.is_ongoing && program.start_date && program.end_date ? `${formatDurationDate(program.start_date)} to ${formatDurationDate(program.end_date)}` : null;
    options.push({
      type: "monthly",
      title: "Monthly plan",
      price: `${formatPrice(program.price_monthly_cents)}/month`,
      subtitle: program.is_ongoing
        ? "This class is ongoing. Subscription continues monthly until ended."
        : fixedRange
          ? `Runs from ${fixedRange}. Subscription is scheduled to end when the program ends.`
          : "Billed monthly for the length of the program.",
      badge: monthlyBadge || undefined,
    });
  }
  if (annualEnabled) {
    const monthlyEquivalent = durationMonths && program.price_annual_cents ? Math.round(program.price_annual_cents / durationMonths) : null;
    options.push({
      type: "annual",
      title: program.is_ongoing ? "Annual subscription" : "Pay in Full",
      price: program.is_ongoing ? `${formatPrice(program.price_annual_cents)}/year` : formatPrice(program.price_annual_cents),
      subtitle: program.is_ongoing
        ? monthlyEquivalent
          ? `Equivalent to ${formatPrice(monthlyEquivalent)}/month, billed once a year. Renews automatically until cancelled.`
          : "Billed once a year. Renews automatically until cancelled."
        : monthlyEquivalent
          ? `Equivalent to ${formatPrice(monthlyEquivalent)}/month for the ${durationMonths}-month program.`
          : "One payment covers the full program.",
      badge: monthlyEnabled && annualEnabled ? annualDealText(program) : "",
    });
  }
  return options;
}

export function annualDealText(program: Pick<Program, "price_monthly_cents" | "price_annual_cents" | "start_date" | "end_date" | "duration_months" | "billing_duration_months" | "is_ongoing">) {
  const durationMonths = pricingComparisonDurationMonths(program);
  if (!durationMonths) {
    return "";
  }
  const monthlyTotal = (program.price_monthly_cents ?? 0) * durationMonths;
  const annual = program.price_annual_cents ?? 0;
  if (!monthlyTotal || !annual || annual >= monthlyTotal) {
    return "";
  }
  const savings = monthlyTotal - annual;
  return program.is_ongoing ? `Save ${formatPrice(savings)} per year by paying annually` : `Save ${formatPrice(savings)} by paying in full`;
}

function mosqueSlugLabel(mosque: Pick<Mosque, "slug" | "name"> | null | undefined) {
  if (!mosque) {
    return "";
  }
  return titleCase(mosque.slug || mosque.name);
}

function monthlyDealText(program: Pick<Program, "price_monthly_cents" | "price_annual_cents" | "start_date" | "end_date" | "duration_months" | "billing_duration_months" | "is_ongoing">) {
  const durationMonths = pricingComparisonDurationMonths(program);
  if (!durationMonths) {
    return "";
  }
  const monthlyTotal = (program.price_monthly_cents ?? 0) * durationMonths;
  const annual = program.price_annual_cents ?? 0;
  if (!monthlyTotal || !annual || monthlyTotal >= annual) {
    return "";
  }
  return `Save ${formatPrice(annual - monthlyTotal)} by paying monthly`;
}

function validateAccountPassword(value: string) {
  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return "Password must include uppercase, lowercase, number, and symbol.";
  }
  return null;
}

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

export function formatAnnouncementTimestamp(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function scheduleRowFromProgramSession(session: ProgramSession): ProgramScheduleRow {
  const day = session.day_of_week ? normalizeScheduleDay(session.day_of_week) : dayFromSessionDate(session.session_date);
  const start = normalizeScheduleTime(String(session.start_time)) || "18:00";
  const end = normalizeScheduleTime(String(session.end_time ?? session.start_time)) || start;
  return {
    id: session.id,
    date: session.session_date ?? undefined,
    day: (day || "Monday") as (typeof scheduleDayOptions)[number],
    start,
    end,
  };
}

function applyLinkedSessionsToTracks(tracks: ProgramTrack[], sessions: ProgramSession[], links: ProgramTrackSession[]) {
  if (!tracks.length || !sessions.length || !links.length) {
    return tracks;
  }
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const linksByTrackId = new Map<string, ProgramTrackSession[]>();
  for (const link of links) {
    linksByTrackId.set(link.program_track_id, [...(linksByTrackId.get(link.program_track_id) ?? []), link]);
  }

  return tracks.map((track) => {
    const rows = (linksByTrackId.get(track.id) ?? [])
      .map((link) => sessionById.get(link.program_session_id))
      .filter((session): session is ProgramSession => Boolean(session))
      .map(scheduleRowFromProgramSession);
    return rows.length ? { ...track, schedule: scheduleRowsToJson(rows) } : track;
  });
}

function linkedEditorTrackRows(tracks: ProgramTrack[], sessions: ProgramSession[], links: ProgramTrackSession[], fallback: ProgramScheduleRow) {
  const linkedTracks = applyLinkedSessionsToTracks(tracks, sessions, links);
  return linkedTracks.map((track) => {
    const trackSchedule = parseProgramSchedule(track.schedule);
    return {
      id: track.id,
      name: track.name,
      sessions: trackSchedule.length ? trackSchedule : [fallback],
      location: track.location ?? "",
      room: track.room ?? "",
      capacity: track.capacity ? String(track.capacity) : "",
      pricingOverrideEnabled: track.pricing_override_enabled,
      priceMonthly: track.price_monthly_cents ? String(track.price_monthly_cents / 100) : "",
      priceAnnual: track.price_annual_cents ? String(track.price_annual_cents / 100) : "",
      eligibilityOverrideEnabled: Boolean(track.age_min || track.age_max || (track.gender_override && track.gender_override !== "all") || track.eligibility_comment),
      ageMin: track.age_min ? String(track.age_min) : "",
      ageMax: track.age_max ? String(track.age_max) : "",
      genderOverride: track.gender_override ?? "all",
      eligibilityComment: track.eligibility_comment ?? "",
    };
  });
}

function scheduleTime(schedule: Json | null) {
  const rows = parseProgramSchedule(schedule);
  if (rows.length === 0) {
    return "TBA";
  }

  const firstTime = `${rows[0].start}-${rows[0].end}`;
  return rows.every((row) => `${row.start}-${row.end}` === firstTime) ? formatScheduleRange(rows[0].start, rows[0].end) : "Multiple times";
}

export function scheduleSummary(schedule: Json | null, notes: string | null) {
  const day = scheduleLabel(schedule, "Schedule will be announced");
  const time = scheduleTime(schedule);
  const full = notes || (time === "TBA" ? day : `${day}, ${time}`);
  return { day, time, full };
}

function scheduleSessionLines(schedule: Json | null, notes: string | null): string[] {
  if (notes) {
    return [notes];
  }
  const rows = parseProgramSchedule(schedule);
  if (rows.length === 0) {
    return ["Schedule will be announced"];
  }
  return rows.map((row) => `${row.day}, ${formatScheduleRange(row.start, row.end)}`);
}

function mockProgramDescription(title: string) {
  return `${title} is designed to help students build steady progress through clear instruction, guided practice, and consistent class routines.`;
}

function mockTeacherCredentials(title: string) {
  return `Certified instructor with experience teaching ${title.toLowerCase()} in a masjid classroom setting. Credentials and ijazah details can be updated from the teacher profile in Supabase.`;
}















