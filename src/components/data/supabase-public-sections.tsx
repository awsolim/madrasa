

"use client";

import { ChevronRightIcon, DefaultProfileIcon, SearchIcon, applicationListedPrice, applicationPaymentPlanLabel, formatFinanceDate } from "@/components/data/application-management-shared";
import type { EnrollmentRequest, ParentDisplay, ProgramFinanceAuditEvent, ProgramSubscription, StudentDisplay } from "@/components/data/application-management-shared";
export { applicationListedPrice, applicationPaymentPlanLabel, formatFinanceDate, resolveRequestTrack } from "@/components/data/application-management-shared";
export type { EnrollmentRequest, ParentDisplay, ProgramFinanceAuditEvent, ProgramSubscription, StudentDisplay } from "@/components/data/application-management-shared";

import { ChevronIcon, ClassesLoadingPlaceholders, DetailSection, ImageCropModal, PhotoIcon, ProgramFaqSection, ProgramHero, ProgramPaymentOptionsDisplay, ProgramScheduleOptionsDisplay, TrackPayInFullPriceCaption, TrackPriceNumber, TrackPricingDealCaption, TrashIcon, applyLinkedSessionsToTracks, formatDurationDate, getCurrentAccessToken, invalidateProgramCaches, mediaType, mosqueProgramsQueryKey, programPayInFullDurationMonths, programPaymentOptions, programStatusBadgeToneClass, scheduleRowFromProgramSession, scheduleSessionLines, scheduleSummary, scheduleTimeOptions, startOfToday, titleCase, trackCapacityBadge, trackPriceLine, trackPricingDeal, trackSelectionRuleText } from "@/components/data/program-builder-shared";
import type { Mosque, PaymentType, Profile, Program, ProgramBuilderStatus, ProgramDetails, ProgramFaq, ProgramMedia, ProgramSession, ProgramTrack, ProgramTrackSession } from "@/components/data/program-builder-shared";
export { annualDealText, programPaymentOptions, programStatusBadgeToneClass, scheduleSummary } from "@/components/data/program-builder-shared";
export type { Mosque, PaymentType, Profile, Program, ProgramBuilderStatus, ProgramDetails, ProgramFaq, ProgramMedia, ProgramSession, ProgramTrack, ProgramTrackSession } from "@/components/data/program-builder-shared";


import { FinanceActionModal, FinanceDetailsDrawer, FinanceAddNoteModal } from "@/components/data/student-record-file";
import dynamic from "next/dynamic";
import { selectCurrentPaymentTerms } from "@/lib/current-payment-terms";
import { loadStudentActivity, type StudentActivity } from "@/lib/student-activity";

import { programMediaType, validateProgramMediaFile } from "@/lib/program-media";
import { useWizardExit } from "@/components/data/use-wizard-exit";

import Image from "next/image";
import Link from "@/components/layout/workspace-link";
import { createPortal } from "react-dom";
import { Upload } from "tus-js-client";
import { ApplicationDecisionModal, ApplicationReviewOverlay, type ApplicationRow } from "@/components/data/application-review";
import type { StudentRecordAction } from "@/components/data/student-record-actions";
import { ChildrenManager } from "@/components/data/children-manager";
import { TransitionLink } from "@/components/layout/transition-link";
import { useSearchParams } from "next/navigation";
import { useWorkspacePathname as usePathname, useWorkspaceRouter as useRouter } from "@/components/layout/workspace-navigation";
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SetStateAction, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/data/empty-state";
import { DirectorySkeleton, GenericLoadingState, QuietPageLoadingState } from "@/components/data/data-loading";
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
import { clearPrivatePage, invalidatePrivateSnapshots, invalidateQuery, invalidateQueryPrefix, loadPrivateSnapshot, operationalSnapshotKey, prefetchQuery, readPrivatePage, useCachedQuery, writePrivatePage } from "@/lib/query-cache";
import { loadProgramEditor, loadProgramDirectorOptions } from "@/lib/program-editor-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { downloadStudentHistory } from "@/lib/student-history-export";
import { monthlyCheckoutPlan } from "@/lib/stripe/billing-anchor";
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

const LazyProgramFinancesData = dynamic(() =>
  import("@/components/data/program-finances-data").then((module) => module.ProgramFinancesData),
);
type ProgramOutcome = Database["public"]["Tables"]["program_outcomes"]["Row"];
type ProgramContentSection = Database["public"]["Tables"]["program_content_sections"]["Row"];
type ProgramStudentNote = Database["public"]["Tables"]["program_student_notes"]["Row"];
type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];
type WithdrawalRequest = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
type MosqueMembership = Database["public"]["Tables"]["mosque_memberships"]["Row"];
type ProgramTeacher = Database["public"]["Tables"]["program_teachers"]["Row"];
type ProgramInstructorEvent = Database["public"]["Tables"]["program_instructor_events"]["Row"];
type ProgramPaymentTerms = Database["public"]["Tables"]["program_payment_terms"]["Row"];
type AnnouncementReceipt = Database["public"]["Tables"]["program_announcement_receipts"]["Row"];
type ProgramSessionCancellation = Database["public"]["Tables"]["program_session_cancellations"]["Row"];
type ProgramAttendanceRecord = Database["public"]["Tables"]["program_attendance_records"]["Row"];
type TeacherDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "teacher_credentials" | "teacher_whatsapp_number">;

type ProgramWithTeacher = Program & {
  teacher?: TeacherDisplay | null;
  coverDirectorDisplayName?: string | null;
  coverDirectorVisibility?: string;
};

type TeacherProgramRole = "director" | "instructor";

type AnnouncementWithContext = Database["public"]["Tables"]["program_announcements"]["Row"] & {
  program?: Program | null;
  author?: Profile | null;
  receipt?: AnnouncementReceipt | null;
};

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
type ProgramScheduleSource = ProgramWithTeacher & { scheduleTracks?: ProgramTrack[] };
type EnrollmentTrackSelection = Pick<Enrollment, "id" | "program_id" | "student_profile_id" | "program_track_id" | "created_at" | "status">;

function getAnnouncementTargetTrackIds(announcement: Pick<AnnouncementWithContext, "target_program_track_ids">) {
  return announcement.target_program_track_ids ?? [];
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

type ApplicationActionEndpoint = "approve" | "waitlist" | "reject" | "cancel-approval" | "change-price" | "waive" | "note" | "confirm" | "reopen" | "cancel-registration" | "delete";

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
  invalidatePrivateSnapshots(`student-activity:${programId}:`);
  invalidatePrivateSnapshots("students:");
  invalidateQueryPrefix("teacher-roster:");
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
    return <QuietPageLoadingState layout="home" />;
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
  const [redirectError, setRedirectError] = useState<string | null>(null);
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

    void redirectSignedInAccounts().catch(() => { if (active) { setRedirectError("We could not load your account. Please try again."); setCheckingSignedInRedirect(false); } });
    return () => {
      active = false;
    };
  }, [router, slug]);

  if (redirectError) return <EmptyState title="Account unavailable" text={redirectError} onRetry={() => window.location.reload()} />;

  if (checkingSignedInRedirect || loading) {
    return <QuietPageLoadingState />;
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
  const isStudentPreview = searchParams.get("preview") === "student";
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
  const contactPhone = program.contact_phone?.trim()
    || details?.instructor_contact_phone?.trim()
    || program.teacher?.phone_number?.trim()
    || program.teacher?.teacher_whatsapp_number?.trim()
    || "";
  const contactEmail = program.contact_email?.trim() || program.teacher?.email?.trim() || "";
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
              <DetailSection title="Class Schedule">
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
                {isStudentPreview ? (
                  primaryCta.kind === "pill" ? (
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
                    <button
                      type="button"
                      disabled
                      className="mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(36,139,114,0.24)] md:w-auto md:px-10"
                    >
                      {primaryCta.label}
                    </button>
                  )
                ) : isTeacherContext || isStaffForProgram ? (
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
        setSubmitError(friendlyErrorMessage(parentInsertError, "Could not submit this application."));
        setSubmitBusy(false);
        return;
      }
      const parentRequestIds = (parentRequestRows ?? []).map((row) => row.id);
      if (parentRequestIds.length) {
        const { error: timestampError } = await supabase.from("enrollment_requests").update({ requested_at: submittedAt, teacher_dismissed_at: null }).in("id", parentRequestIds);
        if (timestampError) {
          setSubmitError(friendlyErrorMessage(timestampError, "Could not submit this application."));
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
      setSubmitError(friendlyErrorMessage(insertError, "Could not submit this application."));
      setSubmitBusy(false);
      return;
    }
    const requestIds = (requestRows ?? []).map((row) => row.id);
    if (requestIds.length) {
      const { error: timestampError } = await supabase.from("enrollment_requests").update({ requested_at: submittedAt, teacher_dismissed_at: null }).in("id", requestIds);
      if (timestampError) {
        setSubmitError(friendlyErrorMessage(timestampError, "Could not submit this application."));
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
    setActionError(null);
    const token = await getCurrentAccessToken();
    if (!token) {
      setConfirmBusy(false);
      setActionError("Payment succeeded. Please sign in again to finish registration.");
      return;
    }
    try {
      const response = await fetch("/api/stripe/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ checkoutSessionId: sessionId }),
        signal: AbortSignal.timeout(25000),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setActionError(result.error ?? "Payment succeeded, but registration could not be completed.");
        return;
      }
      await loadRegistration();
    } catch {
      setActionError("Payment succeeded, but we couldn't confirm registration in time. Refresh to check — your class may already be added.");
    } finally {
      setConfirmBusy(false);
    }
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
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ enrollmentRequestId: requestId }),
        signal: AbortSignal.timeout(25000),
      });
      const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        setActionError(result.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = result.url;
    } catch {
      setActionError("Could not start checkout. Check your connection and try again.");
    } finally {
      setCheckoutBusy(false);
    }
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
    return <EmptyState title="Registration unavailable" text={error} onRetry={() => void loadRegistration()} />;
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
  const monthlyPlan = state === "payment_required_monthly"
    ? monthlyCheckoutPlan({ monthly_billing_anchor: program.monthly_billing_anchor, schedule_timezone: program.schedule_timezone })
    : null;
  const monthlyTimeZone = program.schedule_timezone || "America/Edmonton";
  const openingMonth = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: monthlyTimeZone }).format(new Date());
  const firstRecurringDate = monthlyPlan?.firstRecurringChargeAt
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: monthlyTimeZone }).format(new Date(monthlyPlan.firstRecurringChargeAt * 1000))
    : null;
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
                <p className="text-sm leading-6 text-[#52616A]">Your registration has been approved. Start your monthly subscription to complete registration — {listedPrice}/month. {monthlyPlan?.prorateOpeningPeriod ? `Today you will pay only for the remaining days of ${openingMonth}. Stripe shows the exact amount before payment. The full monthly price begins ${firstRecurringDate}.` : "The full monthly price is due today and renews monthly."}</p>
              )}
              {state !== "completed" ? (
                <div className="rounded-[14px] bg-[#F7FAFB] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B747B]">{state === "payment_required_monthly" ? "Monthly amount" : "Amount"}</span>
                    <span className="font-semibold text-[#26323A]">{listedPrice}</span>
                  </div>
                  {monthlyPlan?.firstRecurringChargeAt ? <>
                    <div className="mt-2 flex items-center justify-between border-t border-[#E3E9EB] pt-2">
                      <span className="text-[#6B747B]">Due today</span>
                      <span className="font-semibold text-[#26323A]">{monthlyPlan.prorateOpeningPeriod ? "Prorated amount shown at checkout" : listedPrice}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-4">
                      <span className="text-[#6B747B]">Recurring billing</span>
                      <span className="text-right font-semibold text-[#26323A]">{firstRecurringDate}</span>
                    </div>
                  </> : null}
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
    content = <QuietPageLoadingState />;
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reportProblemModalOpen, setReportProblemModalOpen] = useState(false);
  const [reportProblemMessage, setReportProblemMessage] = useState("");
  const [reportProblemBusy, setReportProblemBusy] = useState(false);
  const [reportProblemError, setReportProblemError] = useState<string | null>(null);
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
      setPaymentsError(friendlyErrorMessage(error, "Could not load payment history."));
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
      const [{ data: fetchedProfileRow }, access] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
        loadCachedUserAccess(slug, session.user.id),
      ]);

      if (!active) {
        return;
      }

      // A confirmed email change updates auth.users directly (via the link in the
      // confirmation email); there's no trigger mirroring that into profiles.email,
      // so reconcile it here rather than showing a stale address.
      let profileRow = fetchedProfileRow;
      if (profileRow && session.user.email && profileRow.email?.toLowerCase() !== session.user.email.toLowerCase()) {
        profileRow = { ...profileRow, email: session.user.email };
        void supabase.from("profiles").update({ email: session.user.email, updated_at: new Date().toISOString() }).eq("id", session.user.id);
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

  async function handleDeleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setDeleteError("Please sign in again before deleting your account.");
      setDeleteBusy(false);
      return;
    }

    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      setDeleteError(result.error ?? "Account could not be deleted.");
      setDeleteBusy(false);
      return;
    }

    setDeleteModalOpen(false);
    setDeleteBusy(false);
    router.replace(`/m/${slug}/login`);
    void performClientLogout();
  }

  async function handleReportProblem() {
    const message = reportProblemMessage.trim();
    if (!message) {
      setReportProblemError("Please describe what happened.");
      return;
    }
    setReportProblemBusy(true);
    setReportProblemError(null);
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setReportProblemError("Please sign in again before sending a report.");
      setReportProblemBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/account/report-problem", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message, url: window.location.href }),
        signal: AbortSignal.timeout(15000),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setReportProblemError(result.error ?? "Report could not be sent.");
        return;
      }
      setReportProblemModalOpen(false);
      setToast({ tone: "success", message: "Thanks — your report was sent." });
    } catch {
      setReportProblemError("Report could not be sent. Check your connection and try again.");
    } finally {
      setReportProblemBusy(false);
    }
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
    invalidateQueryPrefix("program-detail:");
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
        const result = (await response.json()) as { pending?: boolean; message?: string; email?: string; profile?: Profile; error?: string };
        if (!response.ok) {
          setProfileMessage(result.error ?? "Email could not be updated.");
          setProfileSaving(false);
          return;
        }

        if (result.pending) {
          setEditingField(null);
          setToast({ tone: "success", message: result.message ?? "Check your new email inbox to confirm this change." });
          setProfileSaving(false);
          return;
        }

        if (!result.email || !result.profile) {
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

    if (field !== "password") {
      invalidateQueryPrefix("program-detail:");
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
    return <QuietPageLoadingState layout="account" />;
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
          <AccountMenuButton
            icon={<FlagIcon />}
            label="Report a Problem"
            onClick={() => {
              setReportProblemMessage("");
              setReportProblemError(null);
              setReportProblemModalOpen(true);
            }}
          />
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

          <div className="mt-7">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A9399]">Danger zone</p>
            <div className="mt-2 divide-y divide-[#E6EAED] rounded-[24px] bg-white ring-1 ring-[#E4EAEE]">
              <AccountMenuButton
                icon={<TrashIcon />}
                label="Delete Account"
                tone="danger"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteModalOpen(true);
                }}
              />
            </div>
          </div>

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
            <EmptyState title="Could not load payment history" text={paymentsError} onRetry={() => void loadBillingPayments()} />
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
      {deleteModalOpen ? (
        <ConfirmDeleteAccountModal
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => {
            if (!deleteBusy) setDeleteModalOpen(false);
          }}
          onConfirm={handleDeleteAccount}
        />
      ) : null}
      {reportProblemModalOpen ? (
        <ReportProblemModal
          message={reportProblemMessage}
          onMessageChange={setReportProblemMessage}
          busy={reportProblemBusy}
          error={reportProblemError}
          onCancel={() => {
            if (!reportProblemBusy) setReportProblemModalOpen(false);
          }}
          onConfirm={handleReportProblem}
        />
      ) : null}
    </section>
  );
}

function isAccountPanel(value: string): value is AccountPanel {
  return value === "menu" || value === "settings" || value === "family" || value === "billing" || value === "security" || value === "homescreen" || value === "photo";
}

function ReportProblemModal({
  message,
  onMessageChange,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  message: string;
  onMessageChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onCancel);
  useHideMobileChromeWhileMounted();

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-xl font-semibold">Report a problem</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">Tell us what happened. We&apos;ll get your account and current page automatically.</p>
        <textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          disabled={busy}
          rows={5}
          placeholder="What went wrong?"
          className="mt-4 w-full rounded-[14px] border border-[#D6DCE0] px-3 py-2 text-sm text-[#26323A] outline-none focus:border-[#26323A] disabled:opacity-60"
        />
        {error ? <p className="mt-3 text-sm font-medium text-[#C83F31]">{error}</p> : null}
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !message.trim()}
            className="min-h-11 rounded-[8px] bg-[#26323A] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Sending..." : "Send report"}
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

function ConfirmDeleteAccountModal({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [confirmText, setConfirmText] = useState("");
  useModalFocusTrap(containerRef, true, onCancel);
  useHideMobileChromeWhileMounted();
  const canConfirm = confirmText.trim().toUpperCase() === "DELETE";

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-xl font-semibold text-[#C83F31]">Delete account?</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">
          This permanently deletes your account, cancels any active subscriptions, and removes any child profiles that have no other
          parent linked. This can&apos;t be undone.
        </p>
        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-[#8A9399]">
          Type DELETE to confirm
          <input
            type="text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            disabled={busy}
            className="mt-2 h-11 w-full rounded-[10px] border border-[#D6DCE0] px-3 text-sm font-medium normal-case tracking-normal text-[#26323A] outline-none focus:border-[#C83F31] disabled:opacity-60"
            autoComplete="off"
          />
        </label>
        {error ? <p className="mt-3 text-sm font-medium text-[#C83F31]">{error}</p> : null}
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !canConfirm}
            className="min-h-11 rounded-[8px] bg-[#C83F31] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Deleting..." : "Delete my account"}
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
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
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

type CachedAnnouncementPage = {
  program: Program;
  tracks: ProgramTrack[];
  announcements: AnnouncementWithContext[];
  readersByAnnouncementId: Record<string, Profile[]>;
  canAnnounce: boolean;
};

export function TeacherAnnouncementData({ slug, programId }: { slug: string; programId: string }) {
  const cacheKey = `announcements:${slug}:${programId}:${getCachedSessionSnapshot()?.user.id ?? "unresolved"}`;
  const [initialPage] = useState(() => readPrivatePage<CachedAnnouncementPage>(cacheKey));
  const [canAnnounce, setCanAnnounce] = useState(initialPage?.canAnnounce ?? false);
  const [program, setProgram] = useState<Program | null>(initialPage?.program ?? null);
  const [tracks, setTracks] = useState<ProgramTrack[]>(initialPage?.tracks ?? []);
  const [announcements, setAnnouncements] = useState<AnnouncementWithContext[]>(initialPage?.announcements ?? []);
  const [readersByAnnouncementId, setReadersByAnnouncementId] = useState<Record<string, Profile[]>>(initialPage?.readersByAnnouncementId ?? {});
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [selectedAnnouncementFeedValue, setSelectedAnnouncementFeedValue] = useState(announcementTargetValue(programId, null));
  const [selectedAnnouncementTrackIds, setSelectedAnnouncementTrackIds] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(getCachedSessionSnapshot()?.user.id ?? null);
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState<string | null>(null);
  const announcementFeedRef = useRef<HTMLDivElement>(null);

  // One RPC call instead of mosque -> program -> [announcements+tracks] -> [authors+receipts]
  // -> reader profiles, as six sequential stages.
  async function loadAnnouncements() {
    if (!program) setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const [session, permissionResult, snapshotResult] = await Promise.all([
      loadCachedSession(),
      supabase.rpc("can_announce_program", { check_program_id: programId }),
      supabase.rpc("get_teacher_announcements_snapshot", { p_slug: slug, p_program_id: programId }),
    ]);
    const userId = session?.user.id ?? null;
    setCurrentUserId(userId);
    const allowed = Boolean(permissionResult.data);
    setCanAnnounce(allowed);

    const { data, error } = snapshotResult;
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
      return target.programId === programRow.id && (!target.trackId || activeTracks.some((track) => track.id === target.trackId))
        ? current
        : announcementTargetValue(programRow.id, null);
    });
    setSelectedAnnouncementTrackIds((current) => {
      const activeTrackIds = activeTracks.map((track) => track.id);
      const next = current.filter((trackId) => activeTrackIds.includes(trackId));
      return next.length ? next : activeTrackIds;
    });
    setReadersByAnnouncementId(nextReaders);
    const mappedAnnouncements = (announcementRows ?? []).map((announcement) => ({
        ...announcement,
        program: programRow,
        author: (authors ?? []).find((author) => author.id === announcement.author_profile_id) ?? null,
      }));
    setAnnouncements(mappedAnnouncements);
    if (userId) writePrivatePage<CachedAnnouncementPage>(`announcements:${slug}:${programId}:${userId}`, {
      program: programRow, tracks: activeTracks, announcements: mappedAnnouncements,
      readersByAnnouncementId: nextReaders, canAnnounce: allowed,
    });
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
    if (!canAnnounce || !currentUserId || !program || (!message.trim() && attachments.length === 0)) {
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const feed = announcementFeedRef.current;
      if (feed) feed.scrollTop = feed.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [announcements.length, selectedAnnouncementFeedValue]);

  if (loading) {
    return <InboxLoadingPanel label="Loading announcements" />;
  }

  if (error && !program) {
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
      {error ? <p role="status" className="rounded-xl bg-[#FFF6E8] px-4 py-3 text-sm text-[#79521B]">Could not refresh announcements. Showing the last loaded messages.</p> : null}
      <div className="space-y-3">
        <h2 className="px-1 text-2xl font-semibold leading-8">Announcements History</h2>
        {tracks.length ? (
          <select
            value={selectedAnnouncementFeedValue}
            onChange={(event) => setSelectedAnnouncementFeedValue(event.target.value)}
            className="h-12 w-full rounded-[14px] border border-[#D6DCE0] bg-white px-4 text-sm font-semibold text-[#52616A] outline-none focus:border-[#2F8FB3]"
          >
            <option value={announcementTargetValue(program?.id ?? programId, null)}>All tracks</option>
            {tracks.map((track) => (
              <option key={track.id} value={announcementTargetValue(program?.id ?? programId, track.id)}>
                {track.name}
              </option>
            ))}
          </select>
        ) : null}
        <div ref={announcementFeedRef} className="max-h-[min(55vh,520px)] overflow-y-auto overscroll-contain rounded-[18px] border border-[#D6DCE0] bg-white p-3 [touch-action:pan-y]">
          <ProgramAnnouncementFeed program={program} announcements={visibleAnnouncements} readersByAnnouncementId={readersByAnnouncementId} viewer="teacher" />
        </div>
      </div>

      <div className="px-1">
        {!canAnnounce ? <p className="text-sm text-[#6B747B]">You can view class announcements. Sending announcements requires permission from the Director.</p> : !composeOpen ? (
          <button type="button" onClick={() => setComposeOpen(true)} className="flex min-h-12 w-full items-center justify-center rounded-[12px] bg-[#17624F] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(23,98,79,0.16)]">
            New Announcement
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">New Announcement</h2>
              <button type="button" onClick={() => setComposeOpen(false)} className="rounded-full bg-[#EEF3F5] px-3 py-1.5 text-xs font-semibold text-[#52616A]">Close</button>
            </div>
            {tracks.length ? (
              <div className="rounded-[18px] bg-[#F7FAFB] p-2">
                <div className="mb-2 grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => setSelectedAnnouncementTrackIds(tracks.map((track) => track.id))} className="min-h-8 rounded-[10px] bg-[#EAF7F1] px-2 text-xs font-semibold text-[#17624F]">Select all</button>
                  <button type="button" onClick={() => setSelectedAnnouncementTrackIds([])} className="min-h-8 rounded-[10px] bg-[#EEF2F4] px-2 text-xs font-semibold text-[#52616A]">Deselect all</button>
                </div>
                <div className="grid gap-1">
                  {tracks.map((track) => (
                    <RosterTrackOption key={track.id} checked={selectedAnnouncementTrackIds.includes(track.id)} label={track.name} onClick={() => setSelectedAnnouncementTrackIds((current) => current.includes(track.id) ? current.filter((trackId) => trackId !== track.id) : [...current, track.id])} />
                  ))}
                </div>
              </div>
            ) : null}
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write an announcement..." className="min-h-28 w-full resize-none rounded-[16px] border border-[#B9C3C8] bg-white px-3 py-2 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]" />
            <MessageAttachmentComposer programId={programId} attachments={attachments} onChange={setAttachments} onError={(nextError) => setError(nextError || null)} />
            <div className="flex justify-end">
              <button type="button" onClick={sendAnnouncement} disabled={(!message.trim() && attachments.length === 0) || (tracks.length > 0 && selectedAnnouncementTrackIds.length === 0)} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#17624F] px-5 text-sm font-semibold text-white hover:bg-[#0F4537] disabled:opacity-50">Send</button>
            </div>
          </div>
        )}
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
    return <QuietPageLoadingState layout="home" />;
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
    return <QuietPageLoadingState layout="home" />;
  }

  if (error) {
    return <EmptyState title="Could not load admin home" text={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-4 bg-[var(--workspace)] p-4">
      <AddToHomeScreenNudge slug={slug} settingsHref={`/m/${slug}/admin/settings`} />
      <HomeSectionTitle title="Upcoming" />
      {programs.length ? <HomeUpcomingRows programs={programs} canCancelSessions slug={slug} managementBasePath={`/m/${slug}/admin/programs`} /> : <EmptyState title="No classes yet" text="All masjid class sessions will appear here after classes are created." />}
    </div>
  );
}

export function TeacherClassesData({ slug }: { slug: string }) {
  const { programs, allPrograms, roleByProgramId, permissionsByProgramId, programCounts, canCreateClass, loading, error } = useTeacherPrograms(slug);
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
    return <QuietPageLoadingState />;
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
                  permissions={permissionsByProgramId[program.id]}
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
    return <QuietPageLoadingState />;
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
              permissions={{ can_view_student_records: true, can_manage_enrollments: true, can_view_applications: true, can_decide_applications: true, can_edit_class: true, can_manage_finances: true, can_announce: true }}
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

export async function fetchAdminMasjidSnapshot(slug: string): Promise<AdminMasjidSnapshot> {
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
    return <QuietPageLoadingState layout="management" />;
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
      {selectedProgramId ? <LazyProgramFinancesData slug={slug} programId={selectedProgramId} mode="admin" /> : null}
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
  canDecideApplications: boolean;
  canViewApplications: boolean;
  canManageFinances: boolean;
  canViewStudentRecords: boolean;
  canManageEnrollments: boolean;
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
  canDecideApplications: false,
  canViewApplications: false,
  canManageFinances: false,
  canViewStudentRecords: false,
  canManageEnrollments: false,
  error: null,
};

export function TeacherStudentsData({ slug, programId }: { slug: string; programId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cameFromParam = searchParams.get("from");
  const cameFrom = cameFromParam === "finances" || cameFromParam === "applications" ? cameFromParam : null;
  const originStudentId = searchParams.get("studentSearch") ?? searchParams.get("studentId");
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
  const [canDecideApplications, setCanDecideApplications] = useState(false);
  const [studentAccess, setStudentAccess] = useState({ applications: false, finances: false, records: false, enrollments: false });
  const studentBasePath = `/m/${slug}/${typeof window !== "undefined" && /\/admin\//.test(window.location.pathname) ? "admin/programs" : "teacher/classes"}/${programId}`;
  const [studentSearch, setStudentSearch] = useState(originStudentId ?? "");
  const [genderFilter, setGenderFilter] = useState("all");
  const [studentSort, setStudentSort] = useState<"first" | "last" | "age">("first");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [studentFileRow, setStudentFileRow] = useState<FinanceEnrollmentRow | null>(null);
  const [studentFileProgram, setStudentFileProgram] = useState<Program | null>(null);
  const [studentFileAction, setStudentFileAction] = useState<{ row: FinanceEnrollmentRow; action: FinanceAction } | null>(null);
  const [studentFileNote, setStudentFileNote] = useState<FinanceEnrollmentRow | null>(null);
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
    const isAdminRoute = typeof window !== "undefined" && (window.location.pathname.startsWith(`/m/${slug}/admin/`) || window.location.pathname.startsWith("/admin/"));
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

    const data = await loadPrivateSnapshot(operationalSnapshotKey("students", slug, programId, userId ?? "anonymous"), async () => {
      const result = await supabase.rpc("get_teacher_roster_snapshot", { p_slug: slug, p_program_id: programId });
      if (result.error) throw result.error;
      return result.data;
    });
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
      canDecideApplications: boolean;
  canViewApplications: boolean;
      canManageFinances: boolean;
      canViewStudentRecords: boolean;
      canManageEnrollments: boolean;
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
      canDecideApplications: Boolean(snapshot.canDecideApplications),
      canViewApplications: Boolean(snapshot.canViewApplications),
      canManageFinances: Boolean(snapshot.canManageFinances),
      canViewStudentRecords: Boolean(snapshot.canViewStudentRecords),
      canManageEnrollments: Boolean(snapshot.canManageEnrollments),
      error: null,
    };
  }

  const { data: rosterSnapshot, loading: rosterQueryLoading, error: rosterQueryError, refetch: refetchRoster } = useCachedQuery(programId ? `teacher-roster:${slug}:${programId}` : null, () => fetchTeacherRoster(), { persist: false });

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
    setCanDecideApplications(rosterSnapshot.canDecideApplications);
    setStudentAccess({ applications: rosterSnapshot.canViewApplications || rosterSnapshot.canDecideApplications, finances: rosterSnapshot.canManageFinances, records: rosterSnapshot.canViewStudentRecords, enrollments: rosterSnapshot.canManageEnrollments });
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
    const targetStudent = students.find((student) => student.enrollment.student_profile_id === studentId);
    if (hasActiveRecurringSubscription(targetStudent?.subscription ?? null)) {
      setError("End this student's active subscription before removing them from class.");
      setBusyStudentId(null);
      return;
    }

    const reviewNote = customMessage?.trim() || `You were removed from ${program.title}.`;
    const token = (await loadCachedSession())?.access_token;
    const response = await fetch(`/api/programs/${program.id}/students/${studentId}/remove`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message: reviewNote }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Could not remove this student.");
      setBusyStudentId(null);
      return;
    }

    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    const refreshedRoster = await fetchTeacherRoster();
    invalidatePrivateSnapshots(`students:${slug}:${programId}:`);
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

  function openStudentFile(student: TeacherStudentItem) {
    if (!program) return;
    setStudentFileProgram(program);
    setStudentFileRow({ enrollment: student.enrollment, student: student.profile, parent: student.parent ?? null, approver: null, request: null, subscription: student.subscription ?? null, paymentTerms: null, paymentTermsHistory: [] });
    if (!studentAccess.finances) return;
    void loadFinanceStudentRecord(slug, programId, student.enrollment.student_profile_id).then((record) => {
      if (record) { setStudentFileProgram(record.program); setStudentFileRow(record.row); }
    }).catch(() => undefined);
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
    invalidatePrivateSnapshots(`students:${slug}:${programId}:`);
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
        const genderMatches = genderFilter === "all" || gender === genderFilter;
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
  }, [activeSessionKey, genderFilter, rosterDayOptions, selectedRosterDays, selectedRosterTrackIds, sortDirection, studentSearch, studentSort, students, trackDayMap, trackSessionKeysById, tracks]);
  const resultCount = filteredStudents.length;
  const hasVisibleStudents = resultCount > 0;

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  if ((error || rosterQueryError) && !program) {
    return <EmptyState title="Could not load students" text={error || rosterQueryError || "Please try again."} onRetry={() => void refetchRoster()} />;
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
              const basePath = typeof window !== "undefined" && (window.location.pathname.startsWith(`/m/${slug}/admin/`) || window.location.pathname.startsWith("/admin/")) ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
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
            view="students"
            canViewParents={false}
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
            onViewChange={() => undefined}
          />
          <p className="text-xs font-medium text-[#6B747B]">
            Showing {resultCount} {resultCount === 1 ? "result" : "results"}
          </p>
          {hasVisibleStudents ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {filteredStudents.map((student) => <StudentIdentityCard key={student.enrollment.id} item={student} onOpen={() => openStudentFile(student)} />)}
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
                onAccept={canDecideApplications ? () => setReviewTarget({ request, action: "approved" }) : undefined}
                onReject={canDecideApplications ? () => setReviewTarget({ request, action: "rejected" }) : undefined}
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
      {studentFileRow && studentFileProgram ? <FinanceDetailsDrawer row={studentFileRow} program={studentFileProgram} canViewFinances={studentAccess.finances} canManageEnrollments={studentAccess.enrollments} childDialogOpen={Boolean(studentFileAction || studentFileNote || kickTarget)} onClose={() => { setStudentFileRow(null); setStudentFileProgram(null); }} onAction={(action) => {
        if (action === "add_note") setStudentFileNote(studentFileRow);
        else if (action === "remove_student") { setKickTarget({ studentId: studentFileRow.enrollment.student_profile_id, studentName: studentFileRow.student?.full_name ?? "this student", subscription: studentFileRow.subscription }); setShowKickMessage(false); setKickMessage(""); }
        else setStudentFileAction({ row: studentFileRow, action });
      }} /> : null}
      {studentFileAction && studentFileProgram ? <FinanceActionModal row={studentFileAction.row} action={studentFileAction.action} program={studentFileProgram} onClose={() => setStudentFileAction(null)} onSuccess={() => { const target = students.find((student) => student.enrollment.student_profile_id === studentFileAction.row.enrollment.student_profile_id); if (target) openStudentFile(target); }} /> : null}
      {studentFileNote && studentFileProgram ? <FinanceAddNoteModal row={studentFileNote} program={studentFileProgram} onClose={() => setStudentFileNote(null)} onSuccess={() => { const target = students.find((student) => student.enrollment.student_profile_id === studentFileNote.enrollment.student_profile_id); if (target) openStudentFile(target); }} /> : null}
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
                    onClick={() => router.push(`${typeof window !== "undefined" && (window.location.pathname.startsWith(`/m/${slug}/admin/`) || window.location.pathname.startsWith("/admin/")) ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`}/${programId}/finances`)}
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

async function loadFinanceStudentRecord(slug: string, programId: string, studentProfileId: string): Promise<{ program: Program; row: FinanceEnrollmentRow } | null> {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase.rpc("get_program_finances_snapshot", { p_slug: slug, p_program_id: programId });
  if (result.error) throw result.error;
  const snapshot = result.data as unknown as {
    program: Program | null; hasAccess: boolean; enrollments: Enrollment[]; requests: EnrollmentRequest[];
    subscriptions: ProgramSubscription[]; paymentTerms: ProgramPaymentTerms[];
    links: Array<{ child_profile_id: string; parent_profile_id: string }>; profiles: Profile[];
  } | null;
  if (!snapshot?.program || !snapshot.hasAccess) return null;
  const enrollment = (snapshot.enrollments ?? []).find((item) => item.student_profile_id === studentProfileId);
  if (!enrollment) return null;
  const subscription = (snapshot.subscriptions ?? []).find((item) => item.student_profile_id === studentProfileId) ?? null;
  const request = (snapshot.requests ?? []).find((item) => item.id === subscription?.enrollment_request_id)
    ?? (snapshot.requests ?? []).find((item) => item.student_profile_id === studentProfileId && item.status === "approved")
    ?? (snapshot.requests ?? []).find((item) => item.student_profile_id === studentProfileId) ?? null;
  const paymentTermsHistory = (snapshot.paymentTerms ?? []).filter((terms) => terms.student_profile_id === studentProfileId);
  const paymentTerms = selectCurrentPaymentTerms(paymentTermsHistory, request, subscription);
  const parentId = paymentTerms?.parent_profile_id ?? request?.parent_profile_id ?? subscription?.parent_profile_id
    ?? (snapshot.links ?? []).find((link) => link.child_profile_id === studentProfileId)?.parent_profile_id ?? null;
  return { program: snapshot.program, row: {
    enrollment, request, subscription, paymentTerms, paymentTermsHistory,
    student: (snapshot.profiles ?? []).find((profile) => profile.id === studentProfileId) as StudentDisplay | null,
    approver: request?.reviewed_by ? ((snapshot.profiles ?? []).find((profile) => profile.id === request.reviewed_by) ?? null) : null,
    parent: parentId ? ((snapshot.profiles ?? []).find((profile) => profile.id === parentId) as ParentDisplay | undefined) ?? null : null,
  } };
}

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

function FinanceRowActionMenu({ row, onSelect }: { row: FinanceEnrollmentRow; onSelect: (action: FinanceRowMenuAction) => void }) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const studentName = row.student?.full_name || "student";
  const menuItems: { action: FinanceRowMenuAction; label: string }[] = [
    { action: "view_details" as const, label: "View student file" },
  ];

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

function ProgramFinanceReports({ slug, programId, mode }: { slug: string; programId: string; mode: "teacher" | "admin" }) {
  const base = mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
  const [selectedReport, setSelectedReport] = useState("finance_summary");
  const reports = [
    { type: "finance_summary", title: "Finance summary", text: "Current payment plans, subscriptions, payment counts, and billing dates." },
    { type: "payment_history", title: "Payment ledger", text: "Every recorded payment with dates, amounts, receipts, and student details." },
    { type: "finance_exceptions", title: "Billing exceptions", text: "Only records that need staff attention, with the reason clearly identified." },
  ];
  return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3">{reports.map((report) => { const selected = selectedReport === report.type; return <button key={report.type} type="button" onClick={() => setSelectedReport(report.type)} aria-pressed={selected} className={cn("rounded-[20px] border bg-white p-4 text-left text-[#26323A] transition", selected ? "border-[#17624F] ring-2 ring-[#17624F]/15" : "border-[#DFE7E5] hover:border-[#9CCBBC]")}><span className="flex items-center justify-between gap-3"><span className="font-semibold">{report.title}</span><span className={cn("h-4 w-4 shrink-0 rounded-full border", selected ? "border-[5px] border-[#17624F]" : "border-[#AEB9B5]")} /></span><span className="mt-2 block text-sm font-normal leading-5 text-[#657178]">{report.text}</span></button>; })}</div><Link href={`${base}/${programId}/exports?type=${selectedReport}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17624F] px-5 text-sm font-semibold !text-white no-underline hover:bg-[#124F40]">Prepare selected report</Link></div>;
}

function FinanceOverviewRow({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="flex items-center justify-between py-2.5"><span className="text-[#657178]">{label}</span><span className={cn("font-semibold", danger ? "text-[#B53A2E]" : "text-[#26323A]")}>{value}</span></div>;
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

function FinanceWorkflowBlock({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-[#E1E8EC] bg-[#FAFCFC] p-4">
      <h3 className="text-sm font-semibold text-[#26323A]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[#6B747B]">{text}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function financePaymentTermsStatusLabel(terms: ProgramPaymentTerms, program: Program | null) {
  const status = terms.status.replace(/_/g, " ");
  return `${financePaymentTypeFromTerms(terms, program)} - ${titleCase(status)}`;
}

function financePaymentTypeFromTerms(terms: ProgramPaymentTerms, program: Program | null) {
  if (terms.payment_type === "pay_in_full" || terms.payment_type === "annual") {
    return terms.payment_type === "annual" && program?.is_ongoing ? "Annual Subscription" : "Pay in Full";
  }
  if (terms.payment_type === "monthly") {
    return "Monthly";
  }
  if (terms.payment_type === "waived") {
    return "Waived";
  }
  return "Free";
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

function hasActiveRecurringSubscription(subscription: ProgramSubscription | null | undefined) {
  if (!subscription?.stripe_subscription_id) {
    return false;
  }
  const status = subscription.status?.toLowerCase();
  return !["canceled", "cancelled", "incomplete_expired"].includes(status);
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

type TeacherProgramsResult = {
  programs: ProgramScheduleSource[];
  allPrograms: ProgramScheduleSource[];
  roleByProgramId: Record<string, TeacherProgramRole>;
  permissionsByProgramId: Record<string, InstructorPermissions>;
  programCounts: Record<string, { students: number; applications: number; instructors: number }>;
  canCreateClass: boolean;
  currentUserId: string | null;
  error: string | null;
};

const emptyTeacherProgramsResult: TeacherProgramsResult = {
  programs: [],
  allPrograms: [],
  roleByProgramId: {},
  permissionsByProgramId: {},
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
  const [{ data, error }, { data: permissionRows, error: permissionError }] = await Promise.all([
    supabase.rpc("get_teacher_programs_snapshot", { p_slug: slug }),
    supabase.from("program_teachers")
      .select("program_id, role, can_view_student_records, can_manage_enrollments, can_view_applications, can_decide_applications, can_edit_class, can_manage_finances, can_announce")
      .eq("teacher_profile_id", userId),
  ]);
  if (error) {
    return { ...emptyTeacherProgramsResult, currentUserId: userId, error: error.message };
  }
  if (permissionError) return { ...emptyTeacherProgramsResult, currentUserId: userId, error: permissionError.message };

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
  const directorProfileIds = Array.from(new Set((mosquePrograms ?? []).map((program) => program.director_profile_id ?? program.teacher_profile_id).filter((id): id is string => Boolean(id))));
  const programIds = (mosquePrograms ?? []).map((program) => program.id);
  const [{ data: directorProfiles }, { data: programDetailRows }] = await Promise.all([
    directorProfileIds.length
      ? supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url, teacher_credentials, teacher_whatsapp_number").in("id", directorProfileIds)
      : Promise.resolve({ data: [] as TeacherDisplay[] }),
    programIds.length
      ? supabase.from("program_details").select("program_id, instructor_display_name, cover_director_visibility").in("program_id", programIds)
      : Promise.resolve({ data: [] as Array<{ program_id: string; instructor_display_name: string | null; cover_director_visibility: string | null }> }),
  ]);

  const assignmentRoleByProgramId = Object.fromEntries(
    (assignments ?? []).map((assignment) => [assignment.program_id, assignment.role === "director" ? "director" : "instructor" as TeacherProgramRole]),
  ) as Record<string, TeacherProgramRole>;
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
      teacher: (directorProfiles ?? []).find((profile) => profile.id === (program.director_profile_id ?? program.teacher_profile_id)) ?? null,
      coverDirectorDisplayName: (programDetailRows ?? []).find((details) => details.program_id === program.id)?.instructor_display_name ?? null,
      coverDirectorVisibility: (programDetailRows ?? []).find((details) => details.program_id === program.id)?.cover_director_visibility ?? "name_and_photo",
    }));

  const nextRoleByProgramId: Record<string, TeacherProgramRole> = {};
  const nextPermissionsByProgramId: Record<string, InstructorPermissions> = {};
  const isAdminForMosque = teacherAccountType === "admin" && (memberships ?? []).some((membership) => membership.role === "admin" && membership.status === "active");
  const canCreateForMosque = isAdminForMosque || (teacherAccountType === "teacher" && (memberships ?? []).some((membership) => membership.role === "teacher" && membership.status === "active" && membership.can_create_programs));
  const assignedPrograms = isAdminForMosque ? programsWithTracks : programsWithTracks.filter((program) => {
    const isDirector = (program.director_profile_id ?? program.teacher_profile_id) === userId || assignmentRoleByProgramId[program.id] === "director";
    const assignedRole = isDirector ? "director" : assignmentRoleByProgramId[program.id];
    if (assignedRole) {
      nextRoleByProgramId[program.id] = assignedRole;
      const permissionRow = (permissionRows ?? []).find((row) => row.program_id === program.id);
      nextPermissionsByProgramId[program.id] = assignedRole === "director"
        ? { can_view_student_records: true, can_manage_enrollments: true, can_view_applications: true, can_decide_applications: true, can_edit_class: true, can_manage_finances: Boolean(permissionRow?.can_manage_finances), can_announce: true }
        : { can_view_student_records: Boolean(permissionRow?.can_view_student_records), can_manage_enrollments: Boolean(permissionRow?.can_manage_enrollments), can_view_applications: Boolean(permissionRow?.can_view_applications || permissionRow?.can_decide_applications), can_decide_applications: Boolean(permissionRow?.can_decide_applications), can_edit_class: Boolean(permissionRow?.can_edit_class), can_manage_finances: Boolean(permissionRow?.can_manage_finances), can_announce: permissionRow?.can_announce !== false };
      return true;
    }
    return false;
  });
  if (isAdminForMosque) {
    for (const program of assignedPrograms) {
      nextRoleByProgramId[program.id] = "director";
      nextPermissionsByProgramId[program.id] = { can_view_student_records: true, can_manage_enrollments: true, can_view_applications: true, can_decide_applications: true, can_edit_class: true, can_manage_finances: true, can_announce: true };
    }
  }

  return {
    programs: assignedPrograms,
    allPrograms: programsWithTracks,
    roleByProgramId: nextRoleByProgramId,
    permissionsByProgramId: nextPermissionsByProgramId,
    programCounts: nextProgramCounts,
    canCreateClass: canCreateForMosque,
    currentUserId: userId,
    error: null,
  };
}

function useViewerCacheId() {
  const [session, setSession] = useState<ReturnType<typeof getCachedSessionSnapshot>>(() => getCachedSessionSnapshot());
  useEffect(() => {
    let active = true;
    void loadCachedSession().then((next) => { if (active) setSession(next); });
    const unsubscribe = subscribeCachedSession(setSession);
    return () => { active = false; unsubscribe(); };
  }, []);
  return session === undefined ? null : session?.user.id ?? "guest";
}

function useTeacherPrograms(slug: string) {
  const viewerId = useViewerCacheId();
  const { data, loading, error: queryError, refetch } = useCachedQuery(slug && viewerId ? `teacher-programs:${slug}:${viewerId}` : null, () => fetchTeacherPrograms(slug));
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
  const viewerId = useViewerCacheId();
  const { data, loading, error: queryError, refetch } = useCachedQuery(slug && viewerId ? `admin-programs:${slug}:${viewerId}` : null, () => fetchAdminProgramsWithTracks(slug));
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
export async function fetchApplicantApplications(slug: string, userId: string | null): Promise<ApplicantApplicationsResult> {
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
  canViewParents,
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
  canViewParents: boolean;
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
          {search ? <button type="button" aria-label="Clear search" onClick={() => onSearchChange("")} className="h-8 w-8 shrink-0 rounded-full text-lg hover:bg-black/5">×</button> : null}
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
        {canViewParents ? <div className="relative shrink-0">
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
        </div> : null}
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

type StudentLinks = { basePath: string; access: { applications: boolean; finances: boolean; records: boolean; enrollments: boolean } };

function StudentIdentityCard({ item, onOpen }: { item: TeacherStudentItem; onOpen: () => void }) {
  const name = item.profile?.full_name?.trim() || "Student";
  const content = <>
    <div className="flex items-start justify-between gap-3">
      <Avatar src={item.profile?.avatar_url ?? null} name={name} />
      <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", item.enrollment.status === "active" ? "bg-[#E8F6EF] text-[#17624F]" : "bg-[#F1F4F5] text-[#66747C]")}>{titleCase(item.enrollment.status)}</span>
    </div>
    <div className="mt-4 min-w-0">
      <h3 className="truncate text-[15px] font-semibold text-[#26323A]">{name}</h3>
      <p className="mt-1 text-xs font-medium text-[#748189]">{item.parent ? "Child student" : "Adult student"}</p>
      {item.parent?.full_name ? <p className="mt-2 truncate text-xs text-[#52616A]">Parent: {item.parent.full_name}</p> : null}
    </div>
  </>;
  const className = "block min-h-40 rounded-[20px] border border-[#DFE7EA] bg-white p-4 text-left shadow-[0_8px_24px_rgba(38,50,58,0.06)] transition hover:-translate-y-0.5 hover:border-[#B9D3CC] hover:shadow-[0_12px_28px_rgba(38,50,58,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8FB3]";
  return <button type="button" onClick={onOpen} aria-label={`Open ${name}'s student file`} className={className}>{content}</button>;
}

function StudentActionMenu({ busy, onKick, basePath, access, studentId }: StudentLinks & { studentId: string; busy: boolean; onKick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (!access.finances && !access.applications && !access.enrollments) return null;

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
          {access.finances ? (
            <TransitionLink label="Student file" href={`${basePath}/finances?studentId=${encodeURIComponent(studentId)}`} onClick={(event) => event.stopPropagation()} className="block rounded-[12px] px-3 py-2.5 font-semibold text-[#26323A] hover:bg-[#EEF3F5]">View student file</TransitionLink>
          ) : access.applications ? (
            <TransitionLink label="Student file" href={`${basePath}/applications?studentId=${encodeURIComponent(studentId)}`} onClick={(event) => event.stopPropagation()} className="block rounded-[12px] px-3 py-2.5 font-semibold text-[#26323A] hover:bg-[#EEF3F5]">View student file</TransitionLink>
          ) : null}
          {access.enrollments ? <button
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
          </button> : null}
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
  basePath, access,
}: StudentLinks & {
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
        {access.records ? <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide student details" : "Show student details"}
        >
          <ChevronIcon expanded={expanded} />
        </button> : null}
        <button type="button" onClick={onNote} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]" aria-label={`Add note for ${studentName}`}>
          <NoteAddIcon />
        </button>
        <StudentActionMenu basePath={basePath} access={access} studentId={item.enrollment.student_profile_id} busy={busy} onKick={onKick} />
      </div>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", access.records && expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
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
  basePath, access,
}: StudentLinks & {
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
        {access.records ? <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52616A] hover:bg-[#EEF3F5]"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide parent details" : "Show parent details"}
        >
          <ChevronIcon expanded={expanded} />
        </button> : null}
      </div>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", access.records && expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
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
                  <StudentActionMenu basePath={basePath} access={access} studentId={student.enrollment.student_profile_id}
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
type CachedStudentNotesPage = {
  mosque: Mosque;
  program: Program;
  target: TeacherStudentItem;
  notes: StudentNoteWithContext[];
  userId: string;
};

export function TeacherStudentNotesData({ slug, programId, studentId }: { slug: string; programId: string; studentId: string }) {
  const cacheKey = `student-notes:${slug}:${programId}:${studentId}:${getCachedSessionSnapshot()?.user.id ?? "unresolved"}`;
  const [initialPage] = useState(() => readPrivatePage<CachedStudentNotesPage>(cacheKey));
  const [mosque, setMosque] = useState<Mosque | null>(initialPage?.mosque ?? null);
  const [program, setProgram] = useState<Program | null>(initialPage?.program ?? null);
  const [target, setTarget] = useState<TeacherStudentItem | null>(initialPage?.target ?? null);
  const [initialNotes, setInitialNotes] = useState<StudentNoteWithContext[]>(initialPage?.notes ?? []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(initialPage?.userId ?? null);
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!initialPage) setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowserClient();
      const [session, { data, error: rpcError }] = await Promise.all([
        loadCachedSession(),
        supabase.rpc("get_teacher_student_notes_snapshot", { p_slug: slug, p_program_id: programId, p_student_id: studentId }),
      ]);
      const userId = session?.user.id ?? null;
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
      const nextTarget = {
        enrollment: snapshot.enrollment,
        profile: snapshot.profile ?? null,
        parent: snapshot.parent ?? null,
      };
      setTarget(nextTarget);
      setInitialNotes(notes);
      setCurrentUserId(userId);
      if (userId) writePrivatePage<CachedStudentNotesPage>(`student-notes:${slug}:${programId}:${studentId}:${userId}`, {
        mosque: snapshot.mosque, program: snapshot.program, target: nextTarget, notes, userId,
      });
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

  if (error && !program) {
    return <EmptyState title="Could not load notes" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program || !target) {
    return <EmptyState title="Student not found" text="This student could not be loaded for notes." />;
  }

  return (
    <>
      {error ? <p role="status" className="mx-4 mt-3 rounded-xl bg-[#FFF6E8] px-4 py-3 text-sm text-[#79521B]">Could not refresh notes. Showing the last loaded messages.</p> : null}
      <TeacherStudentNotesPage
        key={`${program.id}:${target.enrollment.student_profile_id}`}
        mosque={mosque}
        program={program}
        target={target}
        currentUserId={currentUserId}
        initialNotes={initialNotes}
      />
    </>
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
  const [previousInitialNotes, setPreviousInitialNotes] = useState(initialNotes);
  if (previousInitialNotes !== initialNotes) {
    setPreviousInitialNotes(initialNotes);
    setNotes(initialNotes);
  }
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

function MoreVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
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

function ProgramDetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="text-[#6B747B]">{label}</dt>
      <dd className="max-w-[55%] text-right font-semibold text-[#26323A]">{value}</dd>
    </div>
  );
}

export function paymentTypeLabel(type: PaymentType, program: Pick<Program, "is_ongoing">): string {
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
      setMessage({ tone: "error", text: friendlyErrorMessage(submitError, "Could not submit this withdrawal request.") });
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
  managementBasePath,
}: {
  programs: ProgramScheduleSource[];
  ownerLabelsByProgramId?: Record<string, string[]>;
  ownerLabelsByTrackId?: Record<string, Record<string, string[]>>;
  canCancelSessions?: boolean;
  currentUserId?: string | null;
  slug?: string;
  managementBasePath?: string;
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
                      viewStudentsHref={canCancelSessions && slug ? homeLessonViewStudentsHref(slug, lesson, managementBasePath) : undefined}
                      markAttendanceHref={canCancelSessions && slug ? attendanceMarkHref(slug, lesson, managementBasePath) : undefined}
                      markAttendanceDisabled={dayKey(lesson.date) !== dayKey(new Date())}
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
                      viewStudentsHref={canCancelSessions && slug ? homeLessonViewStudentsHref(slug, lesson, managementBasePath) : undefined}
                      markAttendanceHref={canCancelSessions && slug ? attendanceMarkHref(slug, lesson, managementBasePath) : undefined}
                      markAttendanceDisabled={dayKey(lesson.date) !== dayKey(new Date())}
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

function homeLessonViewStudentsHref(slug: string, lesson: HomeLesson, basePath?: string) {
  const params = new URLSearchParams({
    from: "home",
    day: weekdayName(lesson.date),
    start: normalizeScheduleTime(lesson.start) || lesson.start,
    end: normalizeScheduleTime(lesson.end) || lesson.end || lesson.start,
  });
  return `${basePath ?? `/m/${slug}/teacher/classes`}/${lesson.program.id}/students?${params.toString()}`;
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
                Available on session day
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
  permissions,
  counts,
  onResigned,
  onResignError,
  onDeleted,
  onDeleteError,
}: {
  program: ProgramScheduleSource;
  mosqueSlug: string;
  role: TeacherProgramRole;
  basePath?: string;
  controlLabel?: string;
  permissions?: InstructorPermissions;
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
  const publicHref = `/m/${mosqueSlug}/programs/${program.id}?preview=student&returnTo=${teacherClassesReturnTo}`;
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
        {program.teacher && program.coverDirectorVisibility !== "hidden" ? (
          <div className="flex items-center gap-3 rounded-[14px] bg-[#F5F9F8] px-3 py-2.5">
            {program.coverDirectorVisibility !== "name_only" ? <Avatar src={program.teacher.avatar_url ?? null} name={program.coverDirectorDisplayName ?? program.teacher.full_name ?? "Program Director"} /> : null}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B747B]">Program Director</p>
              <p className="truncate text-sm font-semibold text-[#26323A]">{program.coverDirectorDisplayName ?? program.teacher.full_name ?? "To be announced"}</p>
            </div>
          </div>
        ) : null}
        <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B747B]">Teacher Actions</p>
        <div className="divide-y divide-[#E3E8EC] border-t border-[#E3E8EC]">
          <TeacherActionLink href={publicHref} icon={<ExternalLinkIcon />} label="View Public Page" previewLabel="Class Details" />
          <TeacherActionLink href={`${classBasePath}/${program.id}/students`} icon={<StudentsIcon />} label="Students" count={counts?.students} />
          {isDirector || permissions?.can_view_applications || permissions?.can_decide_applications ? <TeacherActionLink href={`${classBasePath}/${program.id}/applications`} icon={<ClipboardIcon />} label="Applications" count={counts?.applications} urgent /> : null}
          {isDirector || permissions?.can_manage_finances ? <TeacherActionLink href={`${classBasePath}/${program.id}/finances`} icon={<FinanceIcon />} label="Finances" /> : null}
          {isDirector ? <TeacherActionLink href={`${classBasePath}/${program.id}/instructors`} icon={<InstructorManageIcon />} label="Instructors" count={counts?.instructors} /> : null}
          {isDirector || permissions?.can_announce ? <TeacherActionLink href={`${classBasePath}/${program.id}/announcement`} icon={<MegaphoneIcon />} label="Make Announcement" /> : null}
          <TeacherActionLink href={attendanceHistoryHref(mosqueSlug, program.id, classBasePath)} icon={<AttendanceIcon />} label="Attendance History" />
          {isDirector || permissions?.can_view_student_records || permissions?.can_view_applications || permissions?.can_decide_applications || permissions?.can_manage_finances ? <TeacherActionLink href={`${classBasePath}/${program.id}/exports`} icon={<ClipboardIcon />} label="Reports" /> : null}
          {isDirector || permissions?.can_edit_class ? <TeacherActionLink href={`${classBasePath}/${program.id}`} icon={<EditClassIcon />} label="Edit Class" /> : null}
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    setCopiedCode(code);
    window.setTimeout(() => {
      setCopiedCode((current) => (current === code ? null : current));
    }, 2000);
  }

  async function saveInstructorPermissions(assignmentId: string, update: InstructorPermissions) {
    const supabase = createSupabaseBrowserClient();
    const { data: updatedAssignment, error: updateError } = await supabase
      .from("program_teachers")
      .update(update)
      .eq("id", assignmentId)
      .eq("role", "instructor")
      .select("id")
      .maybeSingle();
    if (updateError || !updatedAssignment) {
      setToast({ tone: "error", message: updateError ? friendlyErrorMessage(updateError, "Could not update this permission.") : "No permission changes were saved. Please reload and try again." });
      return false;
    }
    await loadStaff();
    setToast({ tone: "success", message: "Instructor permissions saved." });
    return true;
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
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-white/20 transition-colors disabled:opacity-45",
              featuredCode && copiedCode === featuredCode ? "bg-white/8 text-white/50" : "bg-white/16 text-white hover:bg-white/24",
            )}
            aria-label="Copy instructor code"
          >
            {featuredCode && copiedCode === featuredCode ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>

      {message ? <div className="px-1 text-sm font-semibold text-[#17624F]">{message}</div> : null}

      <section className="space-y-2">
        <h2 className="px-1 text-lg font-semibold text-[#26323A]">Active Instructors</h2>
        {activeInstructors.length ? (
          <div className="space-y-3">
            {activeInstructors.map((assignment) => (
              <div key={assignment.id} className="rounded-[18px] border border-[#EEF2F4] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#26323A]">{assignment.profile?.full_name || assignment.profile?.email || "Assigned instructor"}</p>
                    <p className="truncate text-sm text-[#6B747B]">{assignment.profile?.email || (assignment.teacher_profile_id ? "Profile hidden until permissions are applied" : "Instructor")}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void removeInstructor(assignment.id)} className="min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold text-[#C83F31] disabled:opacity-60">
                    Remove
                  </button>
                </div>
                <InstructorPermissionEditor assignment={assignment} onSave={(update) => saveInstructorPermissions(assignment.id, update)} />
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
                  <button
                    type="button"
                    onClick={() => void copyInviteCode(assignment.invite_code)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                      assignment.invite_code && copiedCode === assignment.invite_code ? "text-[#B7C0C5]" : "text-[#52616A] hover:bg-[#EEF3F5]",
                    )}
                    aria-label="Copy unused instructor code"
                  >
                    {assignment.invite_code && copiedCode === assignment.invite_code ? <CheckIcon /> : <CopyIcon />}
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

type InstructorPermissions = Pick<ProgramTeacher, "can_view_student_records" | "can_manage_enrollments" | "can_view_applications" | "can_decide_applications" | "can_edit_class" | "can_manage_finances" | "can_announce">;

function instructorPermissions(assignment: ProgramTeacher): InstructorPermissions {
  return {
    can_view_student_records: assignment.can_view_student_records,
    can_manage_enrollments: assignment.can_manage_enrollments,
    can_view_applications: assignment.can_view_applications,
    can_decide_applications: assignment.can_decide_applications,
    can_edit_class: assignment.can_edit_class,
    can_manage_finances: assignment.can_manage_finances,
    can_announce: assignment.can_announce,
  };
}

function InstructorPermissionEditor({ assignment, onSave }: { assignment: ProgramTeacher; onSave: (update: InstructorPermissions) => Promise<boolean> }) {
  const [saved, setSaved] = useState(() => instructorPermissions(assignment));
  const [draft, setDraft] = useState(() => instructorPermissions(assignment));
  const [busy, setBusy] = useState(false);
  const fields: Array<{ key: keyof InstructorPermissions; label: string; detail: string }> = [
    { key: "can_view_student_records", label: "View student records", detail: "See contact, parent, and student history details" },
    { key: "can_manage_enrollments", label: "Manage enrollments", detail: "Move or remove enrolled students" },
    { key: "can_view_applications", label: "View applications", detail: "See applications for this class" },
    { key: "can_decide_applications", label: "Accept or decline", detail: "Review and decide applications" },
    { key: "can_edit_class", label: "Edit class", detail: "Change class details and pricing" },
    { key: "can_manage_finances", label: "Manage finances", detail: "Access student billing and payments" },
    { key: "can_announce", label: "Send announcements", detail: "Post class announcements" },
  ];
  const changed = fields.some(({ key }) => draft[key] !== saved[key]);
  const allEnabled = fields.every(({ key }) => draft[key]);
  const noneEnabled = fields.every(({ key }) => !draft[key]);

  async function save() {
    setBusy(true);
    const next = { ...draft, can_view_applications: draft.can_view_applications || draft.can_decide_applications };
    const ok = await onSave(next);
    setBusy(false);
    if (ok) {
      setSaved(next);
      setDraft(next);
    }
  }

  return (
    <div className="mt-4 border-t border-[#E3E8EC] pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#52616A]">Class permissions</p>
        <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-[#DDE6E3] bg-[#F4F7F6] p-0.5">
          <button type="button" disabled={busy || allEnabled} onClick={() => setDraft(Object.fromEntries(fields.map(({ key }) => [key, true])) as InstructorPermissions)} className="h-7 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold leading-none text-[#17624F] transition hover:bg-white disabled:opacity-40">Add all</button>
          <button type="button" disabled={busy || noneEnabled} onClick={() => setDraft(Object.fromEntries(fields.map(({ key }) => [key, false])) as InstructorPermissions)} className="h-7 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold leading-none text-[#52616A] transition hover:bg-white disabled:opacity-40">Remove all</button>
        </div>
      </div>
      <div className="divide-y divide-[#E3E8EC]">
        {fields.map(({ key, label, detail }) => (
          <label key={key} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2">
            <span className="min-w-0"><span className="block text-sm font-semibold text-[#26323A]">{label}</span><span className="block text-xs text-[#6B747B]">{detail}</span></span>
            <input type="checkbox" checked={draft[key]} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked, ...(key === "can_decide_applications" && event.target.checked ? { can_view_applications: true } : {}), ...(key === "can_view_applications" && !event.target.checked ? { can_decide_applications: false } : {}) }))} className="h-5 w-5 shrink-0 accent-[#17624F]" />
          </label>
        ))}
      </div>
      {changed ? <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs font-medium text-[#8B5B18]">Unsaved changes</span><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => setDraft(saved)} className="min-h-10 px-3 text-sm font-semibold text-[#52616A]">Cancel</button><button type="button" disabled={busy} onClick={() => void save()} className="min-h-10 rounded-[8px] bg-[#17624F] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button></div></div> : null}
    </div>
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

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4.5L18 13H5" />
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

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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

function mosqueSlugLabel(mosque: Pick<Mosque, "slug" | "name"> | null | undefined) {
  if (!mosque) {
    return "";
  }
  return titleCase(mosque.slug || mosque.name);
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

function mockProgramDescription(title: string) {
  return `${title} is designed to help students build steady progress through clear instruction, guided practice, and consistent class routines.`;
}

function mockTeacherCredentials(title: string) {
  return `Certified instructor with experience teaching ${title.toLowerCase()} in a masjid classroom setting. Credentials and ijazah details can be updated from the teacher profile in Supabase.`;
}
