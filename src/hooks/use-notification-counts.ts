"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isApplicationActionRequired } from "@/lib/programs/applicant-actions";
import { getApplicationStatus } from "@/lib/programs/applications";
import { isCurrentEnrollmentStatus } from "@/lib/programs/enrollment-status";
import {
  fetchNotificationState,
  studentRequestNotificationKey,
  studentRequestRequiresAction,
  studentRequestShouldNotify,
  studentWithdrawalNotificationKey,
  teacherInstructorNotificationKey,
  teacherRequestShouldBeUnread,
  type InstructorLifecycleNotification,
  type NotificationCounts,
} from "@/lib/notifications/inbox";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];
type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];
type EnrollmentTrackSelection = Pick<Enrollment, "id" | "program_id" | "student_profile_id" | "program_track_id" | "created_at" | "status">;
type AnnouncementVisibilityRow = {
  id: string;
  program_id: string;
  target_program_track_ids: string[] | null;
  created_at: string;
};

const notificationCountsCache = new Map<string, NotificationCounts>();

async function fetchParentChildIds(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  mosqueId: string,
  parentId: string,
) {
  const { data: links } = await supabase
    .from("parent_child_links")
    .select("child_profile_id")
    .eq("parent_profile_id", parentId)
    .eq("mosque_id", mosqueId);

  return (links ?? []).map((link) => link.child_profile_id);
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
  announcement: Pick<AnnouncementVisibilityRow, "target_program_track_ids" | "created_at">,
  enrolledTrackIds: Set<string> | undefined,
  joinedAt?: string,
) {
  if (joinedAt && Date.parse(announcement.created_at) < Date.parse(joinedAt)) {
    return false;
  }
  const targetTrackIds = announcement.target_program_track_ids ?? [];
  if (targetTrackIds.length === 0) {
    return true;
  }
  if (!enrolledTrackIds || enrolledTrackIds.size === 0) {
    return true;
  }
  return targetTrackIds.some((trackId) => enrolledTrackIds.has(trackId));
}

export function useStudentNotificationCounts(slug: string) {
  const pathname = usePathname();
  const cachedCounts = notificationCountsCache.get(slug);
  const [announcementCount, setAnnouncementCount] = useState(cachedCounts?.announcementCount ?? 0);
  const [noteCount, setNoteCount] = useState(cachedCounts?.noteCount ?? 0);
  const [requestCount, setRequestCount] = useState(cachedCounts?.requestCount ?? 0);
  const [actionRequired, setActionRequired] = useState(cachedCounts?.actionRequired ?? false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    function setCounts(nextCounts: NotificationCounts) {
      notificationCountsCache.set(slug, nextCounts);
      if (active) {
        setAnnouncementCount(nextCounts.announcementCount);
        setNoteCount(nextCounts.noteCount);
        setRequestCount(nextCounts.requestCount);
        setActionRequired(nextCounts.actionRequired);
      }
    }

    async function load() {
      if (!slug) {
        setCounts({ announcementCount: 0, noteCount: 0, requestCount: 0, actionRequired: false });
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setCounts({ announcementCount: 0, noteCount: 0, requestCount: 0, actionRequired: false });
        return;
      }

      const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
      if (!mosque) {
        setCounts({ announcementCount: 0, noteCount: 0, requestCount: 0, actionRequired: false });
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle();
      const targetStudentIds = profile?.account_type === "parent" ? await fetchParentChildIds(supabase, mosque.id, userId) : [userId];
      const [{ data: enrollments }, { data: requestRows }, { data: withdrawalRows }, { data: noteRows }] = await Promise.all([
        targetStudentIds.length
          ? supabase.from("enrollments").select("id, program_id, student_profile_id, program_track_id, created_at, status").in("student_profile_id", targetStudentIds)
          : Promise.resolve({ data: [] as EnrollmentTrackSelection[] }),
        profile?.account_type === "parent"
          ? supabase
              .from("enrollment_requests")
              .select("*")
              .eq("mosque_id", mosque.id)
              .eq("parent_profile_id", userId)
              .is("student_dismissed_at", null)
          : supabase
              .from("enrollment_requests")
              .select("*")
              .eq("mosque_id", mosque.id)
              .eq("student_profile_id", userId)
              .is("student_dismissed_at", null),
        profile?.account_type === "parent"
          ? supabase
              .from("withdrawal_requests")
              .select("id, status, reviewed_at, requested_at")
              .eq("mosque_id", mosque.id)
              .or(`parent_profile_id.eq.${userId},requested_by.eq.${userId}`)
              .is("student_dismissed_at", null)
          : supabase
              .from("withdrawal_requests")
              .select("id, status, reviewed_at, requested_at")
              .eq("mosque_id", mosque.id)
              .eq("student_profile_id", userId)
              .is("student_dismissed_at", null),
        targetStudentIds.length
          ? supabase.from("program_student_notes").select("id, seen_at").in("student_profile_id", targetStudentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; seen_at: string | null }> }),
      ]);

      const { seen: seenRequestIds } = await fetchNotificationState(userId);
      const nextRequestCount =
        (requestRows ?? []).filter((request) => studentRequestShouldNotify(request) && (studentRequestRequiresAction(request as EnrollmentRequest) || !seenRequestIds.has(studentRequestNotificationKey(request)))).length +
        (withdrawalRows ?? []).filter((request) => !seenRequestIds.has(studentWithdrawalNotificationKey(request))).length;
      const nextNoteCount = (noteRows ?? []).filter((note) => !note.seen_at).length;
      const nextActionRequired = (requestRows ?? []).some((request) => isApplicationActionRequired(getApplicationStatus(request as EnrollmentRequest)));

      const enrollmentRows = ((enrollments ?? []) as EnrollmentTrackSelection[]).filter((enrollment) => isCurrentEnrollmentStatus(enrollment.status));
      const enrollmentIds = enrollmentRows.map((enrollment) => enrollment.id);
      const { data: enrollmentTrackRows } = enrollmentIds.length
        ? await supabase.from("enrollment_tracks").select("enrollment_id, program_track_id").in("enrollment_id", enrollmentIds)
        : { data: [] as Array<{ enrollment_id: string; program_track_id: string }> };
      const enrolledTrackIdsByProgramId = getEnrollmentTrackIdsByProgram(enrollmentRows, enrollmentTrackRows ?? []);
      const enrolledJoinDatesByProgramId = getEnrollmentJoinDatesByProgram(enrollmentRows);
      const programIds = enrollmentRows.map((row) => row.program_id);
      if (programIds.length === 0) {
        setCounts({ announcementCount: 0, noteCount: nextNoteCount, requestCount: nextRequestCount, actionRequired: nextActionRequired });
        return;
      }

      const { data: announcements } = await supabase.from("program_announcements").select("id, program_id, target_program_track_ids, created_at").in("program_id", programIds);
      const visibleAnnouncements = ((announcements ?? []) as AnnouncementVisibilityRow[]).filter((announcement) =>
        isAnnouncementVisibleForEnrollment(
          announcement,
          enrolledTrackIdsByProgramId.get(announcement.program_id),
          enrolledJoinDatesByProgramId.get(announcement.program_id),
        ),
      );
      const announcementIds = visibleAnnouncements.map((item) => item.id);
      if (announcementIds.length === 0) {
        setCounts({ announcementCount: 0, noteCount: nextNoteCount, requestCount: nextRequestCount, actionRequired: nextActionRequired });
        return;
      }

      const { data: receipts } = await supabase
        .from("program_announcement_receipts")
        .select("announcement_id, read_at, dismissed_at")
        .eq("profile_id", userId)
        .in("announcement_id", announcementIds);
      const readOrDismissed = new Set((receipts ?? []).filter((receipt) => receipt.read_at || receipt.dismissed_at).map((receipt) => receipt.announcement_id));
      setCounts({ announcementCount: announcementIds.filter((id) => !readOrDismissed.has(id)).length, noteCount: nextNoteCount, requestCount: nextRequestCount, actionRequired: nextActionRequired });
    }

    void load();
    window.addEventListener("tareeqah:notifications-changed", load);
    return () => {
      active = false;
      window.removeEventListener("tareeqah:notifications-changed", load);
    };
  }, [slug, pathname]);

  return { announcementCount, noteCount, requestCount, totalCount: (announcementCount + noteCount + requestCount || actionRequired) ? Math.max(announcementCount + noteCount + requestCount, 1) : 0, actionRequired };
}

export function useTeacherNotificationCounts(slug: string) {
  const pathname = usePathname();
  const [requestCount, setRequestCount] = useState(0);
  const [actionRequired, setActionRequired] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    function reset() {
      if (active) {
        setRequestCount(0);
        setActionRequired(false);
      }
    }

    async function load() {
      if (!slug) {
        reset();
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        reset();
        return;
      }

      const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
      if (!mosque) {
        reset();
        return;
      }

      const [{ data: mosquePrograms }, { data: assignments }] = await Promise.all([
        supabase.from("programs").select("id, teacher_profile_id, director_profile_id").eq("mosque_id", mosque.id).eq("is_active", true),
        supabase.from("program_teachers").select("program_id, role").eq("teacher_profile_id", userId),
      ]);
      const directorAssignmentIds = new Set((assignments ?? []).filter((assignment) => assignment.role === "director").map((assignment) => assignment.program_id));
      const programIds = (mosquePrograms ?? [])
        .filter((program) => (program.director_profile_id ?? program.teacher_profile_id) === userId || directorAssignmentIds.has(program.id))
        .map((program) => program.id);

      if (programIds.length === 0) {
        reset();
        return;
      }

      const [{ data: rows }, { data: withdrawalRows }, { data: instructorRows }, { data: instructorEventRows }, { data: trackSwitchRows }] = await Promise.all([
        supabase
          .from("enrollment_requests")
          .select("id, status, requested_at, reviewed_at, admission_completed_at")
          .in("program_id", programIds)
          .is("teacher_dismissed_at", null),
        supabase
          .from("withdrawal_requests")
          .select("id, status, reviewed_at, requested_at")
          .in("program_id", programIds)
          .eq("status", "pending")
          .is("teacher_dismissed_at", null),
        supabase
          .from("program_teachers")
          .select("id, teacher_profile_id")
          .in("program_id", programIds)
          .eq("role", "instructor")
          .not("teacher_profile_id", "is", null),
        supabase
          .from("program_instructor_events")
          .select("id, assignment_id, teacher_profile_id, event_type")
          .in("program_id", programIds),
        supabase.from("program_track_switch_requests").select("id, status, requested_at").in("program_id", programIds),
      ]);
      const { seen: seenIds, dismissed: dismissedIds } = await fetchNotificationState(userId);
      if (active) {
        const unseenApplications = (rows ?? []).filter((row) => teacherRequestShouldBeUnread(row, seenIds)).length;
        const joinedAssignmentIdsWithEvents = new Set((instructorEventRows ?? []).filter((event) => event.event_type === "joined" && event.assignment_id).map((event) => event.assignment_id as string));
        const eventInstructorNotifications: Array<Pick<InstructorLifecycleNotification, "id" | "event_type" | "teacher_profile_id">> = (instructorEventRows ?? []).map((event) => ({
          id: event.id,
          event_type: event.event_type === "resigned" ? "resigned" : "joined",
          teacher_profile_id: event.teacher_profile_id,
        }));
        const fallbackInstructorNotifications = (instructorRows ?? [])
          .filter((row) => !joinedAssignmentIdsWithEvents.has(row.id))
          .map((row) => ({ id: row.id, event_type: "joined" as const, teacher_profile_id: row.teacher_profile_id }));
        const unseenInstructors = [...eventInstructorNotifications, ...fallbackInstructorNotifications]
          .filter((row) => !dismissedIds.has(teacherInstructorNotificationKey(row)))
          .filter((row) => !seenIds.has(teacherInstructorNotificationKey(row))).length;
        const unseenWithdrawals = (withdrawalRows ?? []).filter((row) => !seenIds.has(studentWithdrawalNotificationKey(row))).length;
        const unseenTrackSwitches = (trackSwitchRows ?? []).filter((row) => !seenIds.has(`track-switch:${row.id}:${row.status}:${row.requested_at}`)).length;
        setRequestCount(unseenApplications + unseenInstructors + unseenWithdrawals + unseenTrackSwitches);
        const hasPendingApplication = (rows ?? []).some((row) => row.status === "pending");
        const hasPendingSwitch = (trackSwitchRows ?? []).some((row) => row.status === "pending");
        setActionRequired(hasPendingApplication || Boolean((withdrawalRows ?? []).length) || hasPendingSwitch);
      }
    }

    void load();
    window.addEventListener("tareeqah:notifications-changed", load);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      active = false;
      window.removeEventListener("tareeqah:notifications-changed", load);
      subscription.unsubscribe();
    };
  }, [slug, pathname]);

  return { requestCount, actionRequired, totalCount: (requestCount || actionRequired) ? Math.max(requestCount, 1) : 0 };
}
