"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApplicationReviewOverlay } from "@/components/data/application-review";
import { EditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { EmptyState } from "@/components/data/empty-state";
import { FloatingInboxTabs, InboxLoadingPanel, MiniEmpty } from "@/components/data/inbox-shared";
import {
  announcementTargetLabel,
  announcementTargetValue,
  notifyAnnouncementPosted,
  parseAnnouncementTargetValue,
  resolveRequestTrack,
} from "@/components/data/supabase-public-sections";
import { TransitionLink } from "@/components/layout/transition-link";
import { useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { getCachedSessionSnapshot, loadCachedSession, subscribeCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import {
  fetchNotificationState,
  markNotificationsDismissed,
  markNotificationsSeen,
  revertOptimisticKeys,
  studentWithdrawalNotificationKey,
  teacherInstructorNotificationKey,
  teacherRequestNotificationKey,
  teacherRequestShouldBeUnread,
  type InstructorLifecycleNotification,
} from "@/lib/notifications/inbox";
import { useCachedQuery } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProgramTrack = Database["public"]["Tables"]["program_tracks"]["Row"];
type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];
type WithdrawalRequest = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];
type ProgramTeacher = Database["public"]["Tables"]["program_teachers"]["Row"];
type ProgramInstructorEvent = Database["public"]["Tables"]["program_instructor_events"]["Row"];
type ProgramTrackSwitchRequestRow = Database["public"]["Tables"]["program_track_switch_requests"]["Row"];
type AnnouncementReceipt = Database["public"]["Tables"]["program_announcement_receipts"]["Row"];
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
type ProgramTrackSwitchRequestWithContext = ProgramTrackSwitchRequestRow & {
  program?: Program | null;
  student?: StudentDisplay | null;
};
type AnnouncementWithContext = Database["public"]["Tables"]["program_announcements"]["Row"] & {
  program?: Program | null;
  author?: Profile | null;
  receipt?: AnnouncementReceipt | null;
};

type TeacherInboxTab = "requests" | "other";
type TeacherInboxSortMode = "newest" | "unread";
type TeacherInboxMessageItem =
  | {
      id: string;
      key: string;
      kind: "application";
      title: string;
      subtitle: string;
      meta: string;
      createdAt: string;
      unread: boolean;
      requiresAction: boolean;
      request: RequestWithContext;
    }
  | {
      id: string;
      key: string;
      kind: "withdrawal";
      title: string;
      subtitle: string;
      meta: string;
      createdAt: string;
      unread: boolean;
      requiresAction: boolean;
      request: WithdrawalRequestWithContext;
    }
  | {
      id: string;
      key: string;
      kind: "instructor";
      title: string;
      subtitle: string;
      meta: string;
      createdAt: string;
      unread: boolean;
      requiresAction: false;
      notification: InstructorLifecycleNotification;
    }
  | {
      id: string;
      key: string;
      kind: "switch";
      title: string;
      subtitle: string;
      meta: string;
      createdAt: string;
      unread: boolean;
      requiresAction: boolean;
      request: ProgramTrackSwitchRequestWithContext;
    };

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

function TeacherInboxMessageRow({ item, onOpen, onClear }: { item: TeacherInboxMessageItem; onOpen: () => void; onClear: () => void }) {
  const inactive = !item.unread && !item.requiresAction;
  return (
    <div
      className={cn(
        "flex w-full items-start gap-2 rounded-[20px] border px-3 py-3 transition",
        item.requiresAction
          ? "border-[#CFE3EA] bg-white shadow-[0_10px_24px_rgba(38,50,58,0.07)]"
          : item.unread
            ? "border-[#DDE8EC] bg-white"
            : "border-[#EDF1F3] bg-[#F5F7F8] opacity-55",
      )}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#2F8FB3]" aria-hidden>
          <DefaultProfileIcon className="h-5 w-5" compact />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className={cn("truncate text-[15px] font-semibold leading-5", inactive ? "text-[#8A949B]" : "text-[#26323A]")}>{item.title}</span>
            {item.requiresAction ? (
              <span className="shrink-0 rounded-full bg-[#FFF7E6] px-2 py-0.5 text-[11px] font-semibold text-[#996800]">Action</span>
            ) : item.unread ? (
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2F8FB3]" aria-label="Unread" />
            ) : null}
          </span>
          <span className={cn("mt-1 block text-sm leading-5", inactive ? "text-[#9AA3A9]" : "text-[#26323A]")}>{item.subtitle}</span>
          <span className="mt-0.5 block truncate text-xs leading-4 text-[#9AA3A9]">{item.meta}</span>
        </span>
      </button>
      {!item.requiresAction ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-[#8A949B] transition hover:bg-[#EEF1F2] hover:text-[#52616A]"
          aria-label="Clear this message"
          title="Clear"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function TeacherInboxMessageDrawer({
  item,
  slug,
  tracksById,
  busyWithdrawalId,
  busySwitchRequestId,
  onClose,
  onApproveWithdrawal,
  onRejectWithdrawal,
  onApproveTrackSwitch,
  onRejectTrackSwitch,
}: {
  item: TeacherInboxMessageItem;
  slug: string;
  tracksById: Record<string, ProgramTrack>;
  busyWithdrawalId: string | null;
  busySwitchRequestId: string | null;
  onClose: () => void;
  onApproveWithdrawal: (request: WithdrawalRequestWithContext) => void;
  onRejectWithdrawal: (request: WithdrawalRequestWithContext) => void;
  onApproveTrackSwitch: (request: ProgramTrackSwitchRequestWithContext) => void;
  onRejectTrackSwitch: (request: ProgramTrackSwitchRequestWithContext) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: false } }));
    };
  }, []);
  const title = item.kind === "withdrawal" ? "Withdrawal" : item.kind === "instructor" ? "Instructor Update" : item.kind === "switch" ? "Schedule Switch" : "Message";
  const fromNames = item.kind === "switch" ? (item.request.from_track_ids ?? []).map((id) => tracksById[id]?.name || "Untitled track").join(", ") || "—" : "";
  const toNames = item.kind === "switch" ? (item.request.to_track_ids ?? []).map((id) => tracksById[id]?.name || "Untitled track").join(", ") || "—" : "";

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-end bg-[#26323A]/35 backdrop-blur-sm md:items-center md:justify-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="max-h-[82vh] w-full overflow-y-auto rounded-t-[30px] bg-white p-5 text-[#26323A] shadow-[0_-20px_60px_rgba(38,50,58,0.24)] outline-none md:max-w-lg md:rounded-[30px]"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#D6DCE0] md:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8A949B]">{title}</p>
            <h2 className="mt-1 text-xl font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm leading-5 text-[#6B747B]">{item.meta}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF3F5] text-[#52616A]" aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="mt-5 rounded-[18px] border border-[#E1E8EC] bg-[#F8FAFB] p-4">
          <p className="text-sm font-semibold text-[#26323A]">{item.subtitle}</p>
          {item.kind === "withdrawal" ? (
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
              <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Class</dt>
              <dd>{item.request.program?.title ?? "Class"}</dd>
              <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Student</dt>
              <dd>{item.request.student?.full_name ?? "Student"}</dd>
              {item.request.parent ? (
                <>
                  <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Parent</dt>
                  <dd>{item.request.parent.full_name ?? item.request.parent.email ?? "Parent"}</dd>
                </>
              ) : null}
              <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Reason</dt>
              <dd className="whitespace-pre-wrap">{item.request.reason?.trim() || "No reason provided."}</dd>
            </dl>
          ) : item.kind === "instructor" ? (
            <p className="mt-3 text-sm leading-6 text-[#52616A]">
              {item.notification.instructor?.full_name?.trim() || item.notification.instructor?.email || "Instructor"}{" "}
              {item.notification.event_type === "resigned" ? "resigned from" : "joined"} {item.notification.program?.title ?? "this class"}.
            </p>
          ) : item.kind === "switch" ? (
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
              <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Switching from</dt>
              <dd>{fromNames}</dd>
              <dt className="font-semibold uppercase tracking-wide text-[#8A949B]">Switching to</dt>
              <dd>{toNames}</dd>
            </dl>
          ) : null}
        </div>

        {item.kind === "withdrawal" && item.request.status === "pending" ? (
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => onApproveWithdrawal(item.request)}
              disabled={busyWithdrawalId === item.request.id}
              className="min-h-11 rounded-full bg-[#17624F] px-4 text-sm font-semibold text-white disabled:bg-[#D8E2E5] disabled:text-[#8A949B]"
            >
              {busyWithdrawalId === item.request.id ? "Working..." : "Accept withdrawal and remove student"}
            </button>
            <button
              type="button"
              onClick={() => onRejectWithdrawal(item.request)}
              disabled={busyWithdrawalId === item.request.id}
              className="min-h-11 rounded-full bg-[#EEF3F5] px-4 text-sm font-semibold text-[#26323A] disabled:opacity-60"
            >
              Reject withdrawal and keep student
            </button>
          </div>
        ) : item.kind === "switch" && item.request.status === "pending" ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onApproveTrackSwitch(item.request)}
              disabled={busySwitchRequestId === item.request.id}
              className="min-h-11 rounded-full bg-[#E2F6E8] px-4 text-sm font-semibold text-[#258A43] disabled:opacity-60"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => onRejectTrackSwitch(item.request)}
              disabled={busySwitchRequestId === item.request.id}
              className="min-h-11 rounded-full bg-[#FCE8E4] px-4 text-sm font-semibold text-[#C83F31] disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        ) : item.kind === "instructor" ? (
          <TransitionLink
            href={`/m/${slug}/teacher/classes/${item.notification.program_id}/instructors`}
            label="Manage"
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-[#17624F] px-4 text-sm font-semibold !text-white no-underline"
          >
            Manage
          </TransitionLink>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

type TeacherInboxSnapshot = {
  currentUserId: string | null;
  seenRequestIds: Set<string>;
  dismissedNotificationIds: Set<string>;
  programs: Program[];
  selectedProgramId: string;
  canReviewRequests: boolean;
  announcementTracksByProgramId: Record<string, ProgramTrack[]>;
  selectedAnnouncementTargetValue: string;
  announcements: AnnouncementWithContext[];
  trackSwitchRequests: ProgramTrackSwitchRequestWithContext[];
  requests: RequestWithContext[];
  withdrawals: WithdrawalRequestWithContext[];
  instructorNotifications: InstructorLifecycleNotification[];
  error: string | null;
};

const emptyTeacherInboxSnapshot: TeacherInboxSnapshot = {
  currentUserId: null,
  seenRequestIds: new Set(),
  dismissedNotificationIds: new Set(),
  programs: [],
  selectedProgramId: "",
  canReviewRequests: false,
  announcementTracksByProgramId: {},
  selectedAnnouncementTargetValue: "",
  announcements: [],
  trackSwitchRequests: [],
  requests: [],
  withdrawals: [],
  instructorNotifications: [],
  error: null,
};

export function TeacherInboxData({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [announcements, setAnnouncements] = useState<AnnouncementWithContext[]>([]);
  const [requests, setRequests] = useState<RequestWithContext[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequestWithContext[]>([]);
  const [instructorNotifications, setInstructorNotifications] = useState<InstructorLifecycleNotification[]>([]);
  const [trackSwitchRequests, setTrackSwitchRequests] = useState<ProgramTrackSwitchRequestWithContext[]>([]);
  const [switchRequestBusyId, setSwitchRequestBusyId] = useState<string | null>(null);
  const initialTeacherInboxTab = searchParams.get("tab");
  const [tab, setTab] = useState<TeacherInboxTab>(initialTeacherInboxTab === "other" ? "other" : "requests");
  const [sortMode, setSortMode] = useState<TeacherInboxSortMode>("newest");
  const [canReviewRequests, setCanReviewRequests] = useState(false);
  const [message, setMessage] = useState("");
  const [announcementTracksByProgramId, setAnnouncementTracksByProgramId] = useState<Record<string, ProgramTrack[]>>({});
  const [selectedAnnouncementTargetValue, setSelectedAnnouncementTargetValue] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [seenRequestIds, setSeenRequestIds] = useState<Set<string>>(new Set());
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(new Set());
  const [busyWithdrawalId, setBusyWithdrawalId] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ programId: string; requestId: string } | null>(null);
  const [drawerItem, setDrawerItem] = useState<TeacherInboxMessageItem | null>(null);
  const [teacherInboxSession, setTeacherInboxSession] = useState<ReturnType<typeof getCachedSessionSnapshot>>(() => getCachedSessionSnapshot());

  useEffect(() => {
    let cancelled = false;
    loadCachedSession().then((nextSession) => {
      if (!cancelled) {
        setTeacherInboxSession(nextSession);
      }
    });
    const unsubscribe = subscribeCachedSession((nextSession) => {
      setTeacherInboxSession(nextSession);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const nextTab = searchParams.get("tab");
    if (nextTab === "requests" || nextTab === "other") {
      setTab(nextTab);
    }
  }, [searchParams]);

  // One RPC call instead of notification-state -> mosque -> [programs+assignments] -> [7-way
  // request/withdrawal/instructor/track batch] -> [6-way profile/subscription hydration batch]
  // as five sequential/parallel round-trip stages. Raw rows only -- every bit of hydration
  // below (matching program/student/parent/author/track context onto each row) is unchanged.
  async function fetchTeacherInboxSnapshot(): Promise<TeacherInboxSnapshot> {
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      return { ...emptyTeacherInboxSnapshot };
    }

    const { seen: initialSeenIds, dismissed: initialDismissedIds } = await fetchNotificationState(userId);
    const { data, error } = await supabase.rpc("get_teacher_inbox_snapshot", {
      p_slug: slug,
      p_selected_program_id: selectedProgramId || null,
    });

    if (error) {
      return { ...emptyTeacherInboxSnapshot, currentUserId: userId, seenRequestIds: initialSeenIds, dismissedNotificationIds: initialDismissedIds, error: friendlyErrorMessage(error, "Could not load teacher inbox.") };
    }

    const snapshot = data as unknown as {
      currentUserId: string | null;
      programs: Program[];
      activeProgramId: string | null;
      directorProgramIds: string[];
      announcements: AnnouncementWithContext[];
      requests: RequestWithContext[];
      withdrawals: WithdrawalRequestWithContext[];
      instructorEventRows: ProgramInstructorEvent[];
      instructorRows: ProgramTeacher[];
      trackRows: ProgramTrack[];
      trackSwitchRows: ProgramTrackSwitchRequestRow[];
      students: StudentDisplay[];
      parents: ParentDisplay[];
      authors: Profile[];
      instructorProfiles: Profile[];
      subscriptions: ProgramSubscription[];
      requestTrackLinks: Array<{ enrollment_request_id: string; program_track_id: string }>;
    } | null;

    if (!snapshot) {
      return { ...emptyTeacherInboxSnapshot, currentUserId: userId, seenRequestIds: initialSeenIds, dismissedNotificationIds: initialDismissedIds };
    }

    const teacherPrograms = snapshot.programs ?? [];
    const activeProgramId = snapshot.activeProgramId ?? "";
    const directorProgramIds = snapshot.directorProgramIds ?? [];

    if (teacherPrograms.length === 0) {
      return {
        ...emptyTeacherInboxSnapshot,
        currentUserId: userId,
        seenRequestIds: initialSeenIds,
        dismissedNotificationIds: initialDismissedIds,
        programs: teacherPrograms,
        selectedProgramId: activeProgramId,
        canReviewRequests: directorProgramIds.length > 0,
      };
    }

    const announcementRows = snapshot.announcements ?? [];
    const requestRows = snapshot.requests ?? [];
    const withdrawalRows = snapshot.withdrawals ?? [];
    const instructorRows = snapshot.instructorRows ?? [];
    const instructorEventRows = snapshot.instructorEventRows ?? [];
    const trackRows = snapshot.trackRows ?? [];
    const trackSwitchRows = snapshot.trackSwitchRows ?? [];
    const students = snapshot.students ?? [];
    const parents = snapshot.parents ?? [];
    const authors = snapshot.authors ?? [];
    const instructorProfiles = snapshot.instructorProfiles ?? [];
    const subscriptions = snapshot.subscriptions ?? [];
    const requestTrackLinkRows = snapshot.requestTrackLinks ?? [];

    const requestTrackIdsByRequestId = new Map<string, string[]>();
    for (const linkRow of requestTrackLinkRows) {
      requestTrackIdsByRequestId.set(linkRow.enrollment_request_id, [...(requestTrackIdsByRequestId.get(linkRow.enrollment_request_id) ?? []), linkRow.program_track_id]);
    }

    const tracksByProgramId = trackRows.reduce<Record<string, ProgramTrack[]>>((next, track) => {
      next[track.program_id] = [...(next[track.program_id] ?? []), track];
      return next;
    }, {});
    const joinedAssignmentIdsWithEvents = new Set(instructorEventRows.filter((event) => event.event_type === "joined" && event.assignment_id).map((event) => event.assignment_id as string));
    const instructorEventNotifications: InstructorLifecycleNotification[] = instructorEventRows.map((event) => ({
      id: event.id,
      program_id: event.program_id,
      assignment_id: event.assignment_id,
      teacher_profile_id: event.teacher_profile_id,
      event_type: event.event_type === "resigned" ? "resigned" : "joined",
      created_at: event.created_at,
      program: teacherPrograms.find((program) => program.id === event.program_id) ?? null,
      instructor: event.teacher_profile_id ? (instructorProfiles.find((profile) => profile.id === event.teacher_profile_id) as Profile | undefined) ?? null : null,
    }));
    const fallbackJoinNotifications: InstructorLifecycleNotification[] = instructorRows
      .filter((notification) => !joinedAssignmentIdsWithEvents.has(notification.id))
      .map((notification) => ({
        id: notification.id,
        program_id: notification.program_id,
        assignment_id: notification.id,
        teacher_profile_id: notification.teacher_profile_id,
        event_type: "joined",
        created_at: notification.created_at,
        program: teacherPrograms.find((program) => program.id === notification.program_id) ?? null,
        instructor: notification.teacher_profile_id ? (instructorProfiles.find((profile) => profile.id === notification.teacher_profile_id) as Profile | undefined) ?? null : null,
      }));

    return {
      currentUserId: userId,
      seenRequestIds: initialSeenIds,
      dismissedNotificationIds: initialDismissedIds,
      programs: teacherPrograms,
      selectedProgramId: activeProgramId,
      canReviewRequests: directorProgramIds.length > 0,
      announcementTracksByProgramId: tracksByProgramId,
      selectedAnnouncementTargetValue: selectedAnnouncementTargetValue || (activeProgramId ? announcementTargetValue(activeProgramId, null) : ""),
      announcements: announcementRows.map((announcement) => ({
        ...announcement,
        program: teacherPrograms.find((program) => program.id === announcement.program_id) ?? null,
        author: authors.find((author) => author.id === announcement.author_profile_id) ?? null,
      })),
      trackSwitchRequests: trackSwitchRows.map((request) => ({
        ...request,
        program: teacherPrograms.find((program) => program.id === request.program_id) ?? null,
        student: students.find((student) => student.id === request.student_profile_id) ?? null,
      })),
      requests: requestRows.map((request) => ({
        ...request,
        program: teacherPrograms.find((program) => program.id === request.program_id) ?? null,
        student: students.find((student) => student.id === request.student_profile_id) ?? null,
        parent: request.parent_profile_id ? (parents.find((parent) => parent.id === request.parent_profile_id) as ParentDisplay | undefined) ?? null : null,
        track: resolveRequestTrack(request, requestTrackIdsByRequestId, trackRows),
      })),
      withdrawals: withdrawalRows.map((request) => ({
        ...request,
        program: teacherPrograms.find((program) => program.id === request.program_id) ?? null,
        student: students.find((student) => student.id === request.student_profile_id) ?? null,
        parent: request.parent_profile_id ? (parents.find((parent) => parent.id === request.parent_profile_id) as ParentDisplay | undefined) ?? null : null,
        subscription:
          subscriptions.find((subscription) => subscription.program_id === request.program_id && subscription.student_profile_id === request.student_profile_id) ?? null,
      })),
      instructorNotifications: [...instructorEventNotifications, ...fallbackJoinNotifications].sort((a, b) => Date.parse(b.created_at ?? "0") - Date.parse(a.created_at ?? "0")),
      error: null,
    };
  }

  const teacherInboxKey = teacherInboxSession === undefined ? null : `teacher-inbox:${slug}:${teacherInboxSession?.user.id ?? "guest"}`;
  const { data: inboxSnapshot, loading: inboxQueryLoading, refetch } = useCachedQuery(teacherInboxKey, () => fetchTeacherInboxSnapshot());

  useEffect(() => {
    if (!inboxSnapshot) {
      return;
    }
    setCurrentUserId(inboxSnapshot.currentUserId);
    setSeenRequestIds(inboxSnapshot.seenRequestIds);
    setDismissedNotificationIds(inboxSnapshot.dismissedNotificationIds);
    setPrograms(inboxSnapshot.programs);
    setSelectedProgramId(inboxSnapshot.selectedProgramId);
    setCanReviewRequests(inboxSnapshot.canReviewRequests);
    setAnnouncementTracksByProgramId(inboxSnapshot.announcementTracksByProgramId);
    setSelectedAnnouncementTargetValue(inboxSnapshot.selectedAnnouncementTargetValue);
    setAnnouncements(inboxSnapshot.announcements);
    setTrackSwitchRequests(inboxSnapshot.trackSwitchRequests);
    setRequests(inboxSnapshot.requests);
    setWithdrawals(inboxSnapshot.withdrawals);
    setInstructorNotifications(inboxSnapshot.instructorNotifications);
    setError(inboxSnapshot.error);
    setLoading(false);
  }, [inboxSnapshot]);

  useEffect(() => {
    setLoading(inboxQueryLoading);
  }, [inboxQueryLoading]);

  // Switching which program's announcements to view isn't part of the cache key (it starts
  // empty and only resolves once the first fetch runs), so re-run explicitly when the director
  // picks a different program after the initial load, mirroring the original effect's behavior.
  const hasLoadedInboxOnce = useRef(false);
  useEffect(() => {
    if (!hasLoadedInboxOnce.current) {
      hasLoadedInboxOnce.current = Boolean(inboxSnapshot);
      return;
    }
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgramId]);

  async function sendAnnouncement() {
    if (!currentUserId || !selectedProgramId || !message.trim()) {
      return;
    }

    const selectedTarget = parseAnnouncementTargetValue(selectedAnnouncementTargetValue || announcementTargetValue(selectedProgramId, null));
    const targetTrackIds = selectedTarget.trackId ? [selectedTarget.trackId] : [];

    const supabase = createSupabaseBrowserClient();
    const targetProgramId = selectedTarget.programId || selectedProgramId;
    const { data: inserted, error: insertError } = await supabase
      .from("program_announcements")
      .insert({
        program_id: targetProgramId,
        author_profile_id: currentUserId,
        message: message.trim(),
        target_program_track_ids: targetTrackIds,
      })
      .select("id")
      .single();
    if (insertError) {
      setError(friendlyErrorMessage(insertError, "Could not send this announcement."));
      return;
    }
    setMessage("");
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    if (inserted) {
      void notifyAnnouncementPosted(targetProgramId, inserted.id);
    }
    await refetch();
  }

  async function clearPastRequest(requestId: string) {
    setError(null);
    const { error: clearError } = await createSupabaseBrowserClient()
      .from("enrollment_requests")
      .update({ teacher_dismissed_at: new Date().toISOString() })
      .eq("id", requestId);

    if (clearError) {
      setError(friendlyErrorMessage(clearError, "Could not dismiss this."));
      return;
    }

    setRequests((current) => current.filter((request) => request.id !== requestId));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }

  async function clearAllPastRequests() {
    const pastRequestIds = pastRequests.map((request) => request.id);
    if (!pastRequestIds.length) {
      return;
    }

    setError(null);
    const { error: clearError } = await createSupabaseBrowserClient()
      .from("enrollment_requests")
      .update({ teacher_dismissed_at: new Date().toISOString() })
      .in("id", pastRequestIds);

    if (clearError) {
      setError(friendlyErrorMessage(clearError, "Could not dismiss these."));
      return;
    }

    setRequests((current) => current.filter((request) => !pastRequestIds.includes(request.id)));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }

  async function reviewWithdrawal(request: WithdrawalRequestWithContext, status: "approved" | "rejected") {
    setBusyWithdrawalId(request.id);
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setBusyWithdrawalId(null);
      setError("Please sign in again to review this withdrawal.");
      return false;
    }

    const response = await fetch("/api/withdrawal-requests/review", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ withdrawalRequestId: request.id, status }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setBusyWithdrawalId(null);
    if (!response.ok) {
      setError(result.error ?? "Could not review withdrawal request.");
      return false;
    }
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
    await refetch();
    return true;
  }

  async function clearPastWithdrawal(requestId: string) {
    setError(null);
    const { error: clearError } = await createSupabaseBrowserClient()
      .from("withdrawal_requests")
      .update({ teacher_dismissed_at: new Date().toISOString() })
      .eq("id", requestId);

    if (clearError) {
      setError(friendlyErrorMessage(clearError, "Could not dismiss this."));
      return;
    }

    setWithdrawals((current) => current.filter((request) => request.id !== requestId));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }

  async function clearAllPastWithdrawals() {
    const pastWithdrawalIds = pastWithdrawals.map((request) => request.id);
    if (!pastWithdrawalIds.length) {
      return;
    }

    setError(null);
    const { error: clearError } = await createSupabaseBrowserClient()
      .from("withdrawal_requests")
      .update({ teacher_dismissed_at: new Date().toISOString() })
      .in("id", pastWithdrawalIds);

    if (clearError) {
      setError(friendlyErrorMessage(clearError, "Could not dismiss these."));
      return;
    }

    setWithdrawals((current) => current.filter((request) => !pastWithdrawalIds.includes(request.id)));
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }

  const pendingRequests = requests.filter((request) => request.status === "pending");
  const pastRequests = requests.filter((request) => request.status !== "pending");
  const completedAdmissionRequests = pastRequests.filter((request) => request.admission_completed_at && !request.teacher_dismissed_at);
  const pendingWithdrawals = withdrawals.filter((request) => request.status === "pending");
  const pastWithdrawals = withdrawals.filter((request) => request.status !== "pending");
  const newInstructorNotifications = instructorNotifications.filter((notification) => !seenRequestIds.has(teacherInstructorNotificationKey(notification)));
  const pastInstructorNotifications = instructorNotifications.filter(
    (notification) => seenRequestIds.has(teacherInstructorNotificationKey(notification)) && !dismissedNotificationIds.has(teacherInstructorNotificationKey(notification)),
  );
  const pendingTrackSwitchRequests = trackSwitchRequests.filter((request) => request.status === "pending");
  const pastTrackSwitchRequests = trackSwitchRequests.filter((request) => request.status !== "pending");
  const allTracksById = Object.fromEntries(Object.values(announcementTracksByProgramId).flat().map((track) => [track.id, track]));
  const selectedProgram = programs.find((program) => program.id === selectedProgramId);
  const announcementTargetOptions = programs.flatMap((program) => [
    { value: announcementTargetValue(program.id, null), label: announcementTargetLabel(program, null) },
    ...(announcementTracksByProgramId[program.id] ?? []).map((track) => ({
      value: announcementTargetValue(program.id, track.id),
      label: announcementTargetLabel(program, track),
    })),
  ]);
  function markSeenOptimistically(keys: string[]) {
    if (!keys.length) {
      return;
    }
    setSeenRequestIds((current) => new Set([...current, ...keys]));
    void markNotificationsSeen(currentUserId, keys).then((ok) => {
      if (!ok) {
        revertOptimisticKeys(setSeenRequestIds, keys);
      }
    });
  }

  function changeTab(nextTab: TeacherInboxTab) {
    setTab(nextTab);
    router.replace(`/m/${slug}/teacher/inbox?tab=${nextTab}`, { scroll: false });
  }

  async function decideTrackSwitchRequest(requestId: string, decision: "approved" | "rejected") {
    setSwitchRequestBusyId(requestId);
    const supabase = createSupabaseBrowserClient();
    const { error: decisionError } = await supabase.rpc(decision === "approved" ? "approve_track_switch_request" : "reject_track_switch_request", {
      target_request_id: requestId,
    });
    setSwitchRequestBusyId(null);
    if (decisionError) {
      setToast({ tone: "error", message: friendlyErrorMessage(decisionError, "Could not process this request.") });
      return false;
    }
    setToast({ tone: "success", message: decision === "approved" ? "Switch approved." : "Switch rejected." });
    await refetch();
    return true;
  }

  function clearAllInstructorUpdates() {
    const keys = pastInstructorNotifications.map(teacherInstructorNotificationKey);
    if (!keys.length) {
      return;
    }
    setDismissedNotificationIds((current) => new Set([...current, ...keys]));
    void markNotificationsDismissed(currentUserId, keys).then((ok) => {
      if (!ok) {
        revertOptimisticKeys(setDismissedNotificationIds, keys);
      }
    });
  }

  function trackSwitchNotificationKey(request: ProgramTrackSwitchRequestWithContext) {
    return `track-switch:${request.id}:${request.status}:${request.requested_at}`;
  }

  // Items never disappear on their own — this is the only thing that removes an inbox item
  // from view (applications/withdrawals get their own teacher_dismissed_at column; instructor
  // updates and track switches share the generic teacher_notification_state dismissed_at ledger
  // since neither of those tables has a dismissal column of its own).
  function dismissInboxNotificationKey(key: string) {
    setDismissedNotificationIds((current) => new Set([...current, key]));
    void markNotificationsDismissed(currentUserId, [key]).then((ok) => {
      if (!ok) {
        revertOptimisticKeys(setDismissedNotificationIds, [key]);
      }
    });
  }

  function clearInboxItem(item: TeacherInboxMessageItem) {
    if (item.kind === "application") {
      void clearPastRequest(item.request.id);
    } else if (item.kind === "withdrawal") {
      void clearPastWithdrawal(item.request.id);
    } else {
      dismissInboxNotificationKey(item.key);
    }
  }

  function applicationMessage(request: RequestWithContext) {
    if (request.status === "pending") {
      return "Application requires review";
    }
    if (request.admission_completed_at) {
      return "Registration was completed";
    }
    if (request.status === "approved") {
      return "Application was accepted";
    }
    if (request.status === "waitlisted") {
      return "Application was waitlisted";
    }
    if (request.status === "rejected") {
      return "Application was rejected";
    }
    return `Application was ${request.status}`;
  }

  function sortInboxItems(items: TeacherInboxMessageItem[]) {
    const ordered = items.slice();
    ordered.sort((a, b) => {
      if (sortMode === "unread") {
        if (a.requiresAction !== b.requiresAction) {
          return a.requiresAction ? -1 : 1;
        }
        if (a.unread !== b.unread) {
          return a.unread ? -1 : 1;
        }
      }
      return Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0");
    });
    return ordered;
  }

  const applicationInboxItems = sortInboxItems(
    requests.map((request) => {
      const key = teacherRequestNotificationKey(request);
      return {
        id: request.id,
        key,
        kind: "application" as const,
        title: request.student?.full_name?.trim() || "Student",
        subtitle: applicationMessage(request),
        meta: `${request.program?.title ?? "Class"} · ${timeAgo(request.admission_completed_at ?? request.reviewed_at ?? request.requested_at)}`,
        createdAt: request.admission_completed_at ?? request.reviewed_at ?? request.requested_at,
        unread: teacherRequestShouldBeUnread(request, seenRequestIds),
        requiresAction: request.status === "pending",
        request,
      };
    }),
  );
  const otherInboxItems = sortInboxItems([
    ...withdrawals.map((request) => {
      const key = studentWithdrawalNotificationKey(request);
      return {
        id: request.id,
        key,
        kind: "withdrawal" as const,
        title: request.student?.full_name?.trim() || "Student",
        subtitle: request.status === "pending" ? "Withdrawal requires review" : `Withdrawal was ${request.status}`,
        meta: `${request.program?.title ?? "Class"} · ${timeAgo(request.reviewed_at ?? request.requested_at)}`,
        createdAt: request.reviewed_at ?? request.requested_at,
        unread: !seenRequestIds.has(key),
        requiresAction: request.status === "pending",
        request,
      };
    }),
    ...instructorNotifications
      .filter((notification) => !dismissedNotificationIds.has(teacherInstructorNotificationKey(notification)))
      .map((notification) => {
        const key = teacherInstructorNotificationKey(notification);
        const instructorName = notification.instructor?.full_name?.trim() || notification.instructor?.email || "Instructor";
        return {
          id: notification.id,
          key,
          kind: "instructor" as const,
          title: instructorName,
          subtitle: notification.event_type === "resigned" ? "Instructor resigned" : "Instructor joined",
          meta: `${notification.program?.title ?? "Class"} · ${timeAgo(notification.created_at ?? "")}`,
          createdAt: notification.created_at ?? "",
          unread: !seenRequestIds.has(key),
          requiresAction: false as const,
          notification,
        };
      }),
    ...trackSwitchRequests
      .filter((request) => !dismissedNotificationIds.has(trackSwitchNotificationKey(request)))
      .map((request) => {
      const key = trackSwitchNotificationKey(request);
      return {
        id: request.id,
        key,
        kind: "switch" as const,
        title: request.student?.full_name?.trim() || "Student",
        subtitle: request.status === "pending" ? "Schedule switch requires review" : `Schedule switch was ${request.status}`,
        meta: `${request.program?.title ?? "Class"} · ${timeAgo(request.requested_at)}`,
        createdAt: request.requested_at,
        unread: !seenRequestIds.has(key),
        requiresAction: request.status === "pending",
        request,
      };
    }),
  ]);
  const visibleInboxItems = tab === "requests" ? applicationInboxItems : otherInboxItems;
  const applicationUnreadCount = applicationInboxItems.filter((item) => item.unread).length;
  const otherUnreadCount = otherInboxItems.filter((item) => item.unread).length;

  async function readAllVisibleInboxItems() {
    const readableKeys = Array.from(new Set(visibleInboxItems.filter((item) => item.unread && !item.requiresAction).map((item) => item.key)));
    const actionRequiredCount = visibleInboxItems.filter((item) => item.requiresAction).length;

    if (!readableKeys.length) {
      setToast({
        tone: "success",
        message: actionRequiredCount ? "No messages were marked read. Action-required items remain active." : "No unread messages to mark read.",
      });
      return;
    }

    setSeenRequestIds((current) => new Set([...current, ...readableKeys]));
    const ok = await markNotificationsSeen(currentUserId, readableKeys);
    if (!ok) {
      revertOptimisticKeys(setSeenRequestIds, readableKeys);
      setToast({ tone: "error", message: "Could not mark messages read." });
      return;
    }

    setToast({
      tone: "success",
      message: actionRequiredCount
        ? `Read ${readableKeys.length} item${readableKeys.length === 1 ? "" : "s"}. Action-required items remain active.`
        : `Read ${readableKeys.length} item${readableKeys.length === 1 ? "" : "s"}.`,
    });
  }

  function openInboxItem(item: TeacherInboxMessageItem) {
    // Read/unread is separate from "requires action": opening marks the item read, while the
    // pending underlying request keeps the row active and keeps the nav/home attention state.
    markSeenOptimistically([item.key]);
    if (item.kind === "application") {
      window.dispatchEvent(new CustomEvent("tareeqah:nav-preview", { detail: { fromPath: pathname, kind: "subpage" } }));
      setReviewTarget({ programId: item.request.program_id, requestId: item.request.id });
      return;
    }
    window.dispatchEvent(new CustomEvent("tareeqah:nav-preview", { detail: { fromPath: pathname, kind: "subpage" } }));
    setDrawerItem(item);
  }

  function closeInboxDrawer() {
    setDrawerItem(null);
    window.dispatchEvent(new CustomEvent("tareeqah:nav-preview", { detail: { fromPath: pathname, kind: "inbox" } }));
  }

  function closeReviewTarget() {
    setReviewTarget(null);
    window.dispatchEvent(new CustomEvent("tareeqah:nav-preview", { detail: { fromPath: pathname, kind: "inbox" } }));
  }

  return (
    <div className="bg-[var(--workspace)]">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="md:hidden">
        <FloatingInboxTabs
          tabs={[
            { id: "requests", label: "Applications", badge: applicationUnreadCount, actionRequired: applicationInboxItems.some((item) => item.requiresAction) },
            { id: "other", label: "Other", badge: otherUnreadCount, actionRequired: otherInboxItems.some((item) => item.requiresAction) },
          ]}
          value={tab}
          onChange={(value) => changeTab(value as TeacherInboxTab)}
        />
      </div>
      <div className="space-y-4 p-4">
        {error ? (
          <EmptyState title="Could not load teacher inbox" text={error} onRetry={() => window.location.reload()} />
        ) : loading ? (
          <InboxLoadingPanel label={tab === "other" ? "Loading messages" : "Loading applications"} />
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-[#26323A]">{tab === "requests" ? "Applications" : "Other"}</h2>
                <p className="mt-0.5 text-xs text-[#6B747B]">{visibleInboxItems.length ? `${visibleInboxItems.length} messages` : "No messages"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as TeacherInboxSortMode)}
                  className="h-9 w-[136px] rounded-full border border-[#D6DCE0] bg-white px-2.5 text-xs font-semibold text-[#52616A] outline-none"
                  aria-label="Inbox sort"
                >
                  <option value="newest">Newest first</option>
                  <option value="unread">Unread first</option>
                </select>
                <button
                  type="button"
                  onClick={() => void readAllVisibleInboxItems()}
                  className="flex h-9 items-center justify-center rounded-full bg-[#EEF6F7] px-3 text-[11px] font-semibold text-[#17624F] transition-colors hover:bg-[#DCEFF4]"
                >
                  Read all
                </button>
              </div>
            </div>
            {visibleInboxItems.length ? (
              <div className="space-y-2">
                {visibleInboxItems.map((item) => (
                  <TeacherInboxMessageRow key={item.key} item={item} onOpen={() => openInboxItem(item)} onClear={() => clearInboxItem(item)} />
                ))}
              </div>
            ) : (
              <MiniEmpty text="Messages will appear here." />
            )}
          </section>
        )}
      </div>
      {drawerItem ? (
        <TeacherInboxMessageDrawer
          item={drawerItem}
          slug={slug}
          tracksById={allTracksById}
          busyWithdrawalId={busyWithdrawalId}
          busySwitchRequestId={switchRequestBusyId}
          onClose={closeInboxDrawer}
          onApproveWithdrawal={(request) => {
            void reviewWithdrawal(request, "approved").then((ok) => {
              if (ok) closeInboxDrawer();
            });
          }}
          onRejectWithdrawal={(request) => {
            void reviewWithdrawal(request, "rejected").then((ok) => {
              if (ok) closeInboxDrawer();
            });
          }}
          onApproveTrackSwitch={(request) => {
            void decideTrackSwitchRequest(request.id, "approved").then((ok) => {
              if (ok) closeInboxDrawer();
            });
          }}
          onRejectTrackSwitch={(request) => {
            void decideTrackSwitchRequest(request.id, "rejected").then((ok) => {
              if (ok) closeInboxDrawer();
            });
          }}
        />
      ) : null}
      {reviewTarget ? (
        <ApplicationReviewOverlay
          programId={reviewTarget.programId}
          slug={slug}
          mode="teacher"
          requestId={reviewTarget.requestId}
          onClose={closeReviewTarget}
          onChanged={refetch}
        />
      ) : null}
    </div>
  );
}
