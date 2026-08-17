"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AttendanceHistoryCell, formatAttendanceHistoryDate } from "@/components/data/attendance-history-cell";
import { AttendanceStatusButton } from "@/components/data/attendance-status-button";
import { DirectorySkeleton } from "@/components/data/data-loading";
import { EditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { EmptyState } from "@/components/data/empty-state";
import { loadCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import { formatShortDate } from "@/lib/programs/display";
import { isCurrentEnrollmentStatus } from "@/lib/programs/enrollment-status";
import {
  dayFromSessionDate,
  dayKey,
  formatDayAbbreviation,
  formatScheduleRange,
  normalizeScheduleDay,
  normalizeScheduleTime,
  parseProgramSchedule,
  scheduleDayOptions,
  weekdayName,
} from "@/lib/programs/schedule";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Mosque = Database["public"]["Tables"]["mosques"]["Row"];
type Program = Database["public"]["Tables"]["programs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProgramSession = Database["public"]["Tables"]["program_sessions"]["Row"];
type ProgramTrack = Database["public"]["Tables"]["program_tracks"]["Row"];
type ProgramTrackSession = Database["public"]["Tables"]["program_track_sessions"]["Row"];
type ProgramAttendanceRecord = Database["public"]["Tables"]["program_attendance_records"]["Row"];
type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];
type StudentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type">;
type ParentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url">;

function AttendanceEmptyState({ title, text }: { title: string; text: string }) {
  return <EmptyState title={title} text={text} />;
}
type AttendanceStudentRow = {
  enrollment: Enrollment;
  profile: StudentDisplay | null;
  parent: ParentDisplay | null;
  trackIds: string[];
};

type AttendanceMarkedState = {
  status: AttendanceStatus;
  reason: string;
  recordId?: string;
};

type AttendanceSessionContext = {
  mosque: Mosque | null;
  program: Program | null;
  students: AttendanceStudentRow[];
  records: ProgramAttendanceRecord[];
  session: ProgramSession | null;
  sessionDate: string;
  day: string;
  start: string;
  end: string;
  currentUserId: string | null;
  error: string | null;
};

const emptyAttendanceSessionContext: AttendanceSessionContext = {
  mosque: null,
  program: null,
  students: [],
  records: [],
  session: null,
  sessionDate: "",
  day: "",
  start: "",
  end: "",
  currentUserId: null,
  error: null,
};

async function loadAttendanceSessionContext(slug: string, programId: string, searchParams: URLSearchParams): Promise<AttendanceSessionContext> {
  const supabase = createSupabaseBrowserClient();
  const session = await loadCachedSession();
  const userId = session?.user.id ?? null;
  if (!userId) {
    return { ...emptyAttendanceSessionContext, error: "Log in required." };
  }

  const sessionDate = searchParams.get("date") ?? dayKey(new Date());
  const day = normalizeScheduleDay(searchParams.get("day") ?? dayFromSessionDate(sessionDate) ?? weekdayName(new Date())) ?? weekdayName(new Date());
  const start = normalizeScheduleTime(searchParams.get("start") ?? "") || "";
  const end = normalizeScheduleTime(searchParams.get("end") ?? "") || start;
  if (!start) {
    return { ...emptyAttendanceSessionContext, currentUserId: userId, sessionDate, day, start, end, error: "Session time is missing." };
  }

  const [{ data: mosque, error: mosqueError }, { data: canManage }] = await Promise.all([
    supabase.from("mosques").select("*").eq("slug", slug).maybeSingle(),
    supabase.rpc("can_manage_program", { check_program_id: programId, check_profile_id: userId }),
  ]);
  if (mosqueError || !mosque) {
    return { ...emptyAttendanceSessionContext, currentUserId: userId, sessionDate, day, start, end, error: friendlyErrorMessage(mosqueError, "Masjid not found.") };
  }
  if (!canManage) {
    return { ...emptyAttendanceSessionContext, mosque, currentUserId: userId, sessionDate, day, start, end, error: "You don't have permission to manage attendance for this class." };
  }

  const { data: program, error: programError } = await supabase.from("programs").select("*").eq("id", programId).eq("mosque_id", mosque.id).maybeSingle();
  if (programError || !program) {
    return { ...emptyAttendanceSessionContext, mosque, currentUserId: userId, sessionDate, day, start, end, error: friendlyErrorMessage(programError, "Class not found.") };
  }

  const [{ data: enrollmentRows }, { data: trackRows }, { data: sessionRows }, { data: records }] = await Promise.all([
    supabase.from("enrollments").select("*").eq("program_id", programId).order("created_at", { ascending: true }),
    supabase.from("program_tracks").select("*").eq("program_id", programId).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("program_sessions").select("*").eq("program_id", programId),
    supabase
      .from("program_attendance_records")
      .select("*")
      .eq("program_id", programId)
      .eq("session_date", sessionDate)
      .eq("start_time", start),
  ]);

  const normalizedEnd = end || start;
  const matchingSessions = (sessionRows ?? []).filter((row) => {
    const rowStart = normalizeScheduleTime(row.start_time) || row.start_time;
    const rowEnd = normalizeScheduleTime(row.end_time ?? "") || rowStart;
    const rowDay = normalizeScheduleDay(row.day_of_week ?? "") ?? "";
    return rowStart === start && rowEnd === normalizedEnd && (row.session_date === sessionDate || rowDay === day);
  });
  const sessionRow = matchingSessions[0] ?? null;
  const sessionIds = matchingSessions.map((row) => row.id);
  const trackIds = (trackRows ?? []).map((track) => track.id);
  const [{ data: trackSessionRows }, { data: enrollmentTrackRows }] = await Promise.all([
    trackIds.length
      ? supabase.from("program_track_sessions").select("*").in("program_track_id", trackIds)
      : Promise.resolve({ data: [] as ProgramTrackSession[] }),
    (enrollmentRows ?? []).length
      ? supabase.from("enrollment_tracks").select("enrollment_id, program_track_id").in("enrollment_id", (enrollmentRows ?? []).map((row) => row.id))
      : Promise.resolve({ data: [] as Array<{ enrollment_id: string; program_track_id: string }> }),
  ]);
  const sessionTrackIds = new Set(
    (trackSessionRows ?? [])
      .filter((row) => sessionIds.includes(row.program_session_id))
      .map((row) => row.program_track_id),
  );
  if (!sessionTrackIds.size) {
    for (const track of trackRows ?? []) {
      const hasMatchingSchedule = parseProgramSchedule(track.schedule).some((row) => {
        const rowStart = normalizeScheduleTime(row.start) || row.start;
        const rowEnd = normalizeScheduleTime(row.end) || rowStart;
        return row.day === day && rowStart === start && rowEnd === normalizedEnd;
      });
      if (hasMatchingSchedule) {
        sessionTrackIds.add(track.id);
      }
    }
  }

  const enrollmentTrackIdsByEnrollmentId = new Map<string, string[]>();
  for (const enrollment of enrollmentRows ?? []) {
    enrollmentTrackIdsByEnrollmentId.set(
      enrollment.id,
      [
        ...(enrollmentTrackRows ?? []).filter((row) => row.enrollment_id === enrollment.id).map((row) => row.program_track_id),
        ...(enrollment.program_track_id ? [enrollment.program_track_id] : []),
      ].filter((trackId, index, all) => Boolean(trackId) && all.indexOf(trackId) === index),
    );
  }
  const sessionEnrollments = (enrollmentRows ?? []).filter((enrollment) => {
    if (!isCurrentEnrollmentStatus(enrollment.status)) {
      return false;
    }
    const studentTrackIds = enrollmentTrackIdsByEnrollmentId.get(enrollment.id) ?? [];
    return !sessionTrackIds.size || studentTrackIds.some((trackId) => sessionTrackIds.has(trackId));
  });
  const studentIds = sessionEnrollments.map((enrollment) => enrollment.student_profile_id);
  const { data: profileRows } = studentIds.length
    ? await supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type").in("id", studentIds)
    : { data: [] as StudentDisplay[] };
  const { data: linkRows } = studentIds.length
    ? await supabase.from("parent_child_links").select("child_profile_id, parent_profile_id").eq("mosque_id", mosque.id).in("child_profile_id", studentIds)
    : { data: [] as Array<{ child_profile_id: string; parent_profile_id: string }> };
  const parentIds = Array.from(new Set((linkRows ?? []).map((link) => link.parent_profile_id)));
  const { data: parentRows } = parentIds.length
    ? await supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url").in("id", parentIds)
    : { data: [] as ParentDisplay[] };

  return {
    mosque,
    program,
    students: sessionEnrollments.map((enrollment) => {
      const parentId = (linkRows ?? []).find((link) => link.child_profile_id === enrollment.student_profile_id)?.parent_profile_id;
      return {
        enrollment,
        profile: (profileRows ?? []).find((profile) => profile.id === enrollment.student_profile_id) ?? null,
        parent: parentId ? ((parentRows ?? []).find((parent) => parent.id === parentId) as ParentDisplay | undefined) ?? null : null,
        trackIds: enrollmentTrackIdsByEnrollmentId.get(enrollment.id) ?? [],
      };
    }),
    records: records ?? [],
    session: sessionRow,
    sessionDate,
    day,
    start,
    end: normalizedEnd,
    currentUserId: userId,
    error: null,
  };
}

type AttendanceStatus = "present" | "absent";
type AttendanceDraft = Record<string, { status: AttendanceStatus | null; reason: string }>;

export function ProgramAttendanceMarkData({ slug, programId }: { slug: string; programId: string }) {
  const readonlySearchParams = useSearchParams();
  const router = useRouter();
  const [context, setContext] = useState<AttendanceSessionContext>(emptyAttendanceSessionContext);
  const [draft, setDraft] = useState<AttendanceDraft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);

  function draftFromContext(next: AttendanceSessionContext) {
    const nextDraft: AttendanceDraft = {};
    for (const student of next.students) {
      const record = next.records.find((row) => row.student_profile_id === student.enrollment.student_profile_id);
      nextDraft[student.enrollment.student_profile_id] = {
        status: record?.status === "present" || record?.status === "absent" ? record.status : null,
        reason: record?.absence_reason ?? "",
      };
    }
    return nextDraft;
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const next = await loadAttendanceSessionContext(slug, programId, new URLSearchParams(readonlySearchParams.toString()));
      if (!active) {
        return;
      }
      setContext(next);
      setDraft(draftFromContext(next));
      setError(next.error);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [programId, readonlySearchParams, slug]);

  const isTodaySession = context.sessionDate === dayKey(new Date());
  const savedStateByStudentId = useMemo(() => {
    const map = new Map<string, AttendanceMarkedState>();
    for (const record of context.records) {
      if (record.status === "present" || record.status === "absent") {
        map.set(record.student_profile_id, {
          status: record.status,
          reason: record.absence_reason ?? "",
          recordId: record.id,
        });
      }
    }
    return map;
  }, [context.records]);
  const studentsByMarkedState = useMemo(() => {
    const groups = {
      marked: [] as AttendanceStudentRow[],
      unmarked: [] as AttendanceStudentRow[],
    };
    for (const student of context.students) {
      if (savedStateByStudentId.has(student.enrollment.student_profile_id)) {
        groups.marked.push(student);
      } else {
        groups.unmarked.push(student);
      }
    }
    return groups;
  }, [context.students, savedStateByStudentId]);

  function setStudentAttendance(studentId: string, status: AttendanceStatus | null) {
    setDraft((current) => ({
      ...current,
      [studentId]: {
        status,
        reason: status === "absent" ? current[studentId]?.reason ?? "" : "",
      },
    }));
  }

  function setAbsenceReason(studentId: string, reason: string) {
    setDraft((current) => ({
      ...current,
      [studentId]: {
        status: current[studentId]?.status ?? "absent",
        reason,
      },
    }));
  }

  function openStudentHistory(studentId: string) {
    const currentParams = new URLSearchParams(readonlySearchParams.toString());
    const returnTo = `/m/${slug}/teacher/classes/${programId}/attendance/mark?${currentParams.toString()}`;
    const params = new URLSearchParams({
      studentId,
      from: "mark",
      returnTo,
      date: context.sessionDate,
      day: context.day,
      start: context.start,
      end: context.end,
    });
    router.push(`/m/${slug}/teacher/classes/${programId}/attendance?${params.toString()}`);
  }

  async function saveAttendance() {
    if (!context.program || !context.currentUserId) {
      return;
    }
    const markedRows = context.students
      .map((student) => {
        const state = draft[student.enrollment.student_profile_id];
        if (!state?.status) {
          return null;
        }
        return {
          program_id: context.program!.id,
          program_session_id: context.session?.id ?? null,
          enrollment_id: student.enrollment.id,
          student_profile_id: student.enrollment.student_profile_id,
          session_date: context.sessionDate,
          day_of_week: context.day,
          start_time: context.start,
          end_time: context.end || null,
          status: state.status,
          absence_reason: state.status === "absent" ? state.reason.trim() || null : null,
          marked_by: context.currentUserId,
          marked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const unmarkedStudentIds = context.students
      .filter((student) => !draft[student.enrollment.student_profile_id]?.status)
      .map((student) => student.enrollment.student_profile_id);

    setSaving(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const deletePromise = unmarkedStudentIds.length
      ? supabase
          .from("program_attendance_records")
          .delete()
          .eq("program_id", context.program.id)
          .eq("session_date", context.sessionDate)
          .eq("start_time", context.start)
          .in("student_profile_id", unmarkedStudentIds)
      : Promise.resolve({ error: null });
    const upsertPromise = markedRows.length
      ? supabase.from("program_attendance_records").upsert(markedRows, { onConflict: "program_id,session_date,start_time,student_profile_id" })
      : Promise.resolve({ error: null });
    const [{ error: deleteError }, { error: saveError }] = await Promise.all([deletePromise, upsertPromise]);
    setSaving(false);
    if (deleteError || saveError) {
      setError(friendlyErrorMessage(deleteError ?? saveError, "Could not save attendance."));
      return;
    }
    const next = await loadAttendanceSessionContext(slug, programId, new URLSearchParams(readonlySearchParams.toString()));
    setContext(next);
    setDraft(draftFromContext(next));
    setToast({ tone: "success", message: "Attendance saved." });
  }

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }

  if (error && !context.program) {
    return <EmptyState title="Could not load attendance" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!context.program) {
    return <EmptyState title="Class not found" text="This class could not be loaded." />;
  }

  return (
    <section className="space-y-5 bg-white px-4 pb-28 pt-4 text-[#26323A]">
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold leading-7">{context.program.title}</h2>
        <p className="text-sm font-medium text-[#6B747B]">
          {context.day}, {formatShortDate(context.sessionDate)} · {formatScheduleRange(context.start, context.end)}
        </p>
        {!isTodaySession ? <p className="text-sm font-semibold text-[#C0392B]">Attendance can only be marked on the day of this session.</p> : null}
      </div>

      {error ? <div className="rounded-[18px] border border-[#F4C7C1] bg-[#FDEDEA] px-4 py-3 text-sm text-[#A4352A]">{error}</div> : null}

      <AttendanceSection
        title="Marked"
        tone="marked"
        students={studentsByMarkedState.marked}
        draft={draft}
        savedStateByStudentId={savedStateByStudentId}
        onSetStatus={setStudentAttendance}
        onReasonChange={setAbsenceReason}
        onViewHistory={openStudentHistory}
      />
      <AttendanceSection
        title="Unmarked"
        tone="unmarked"
        students={studentsByMarkedState.unmarked}
        draft={draft}
        savedStateByStudentId={savedStateByStudentId}
        onSetStatus={setStudentAttendance}
        onReasonChange={setAbsenceReason}
        onViewHistory={openStudentHistory}
      />
      <div className="sticky bottom-4 z-10">
        <button
          type="button"
          onClick={() => void saveAttendance()}
          disabled={saving || !isTodaySession}
          className="min-h-12 w-full rounded-[16px] bg-[#17624F] px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(23,98,79,0.22)] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </section>
  );
}

function AttendanceSection({
  title,
  tone,
  students,
  draft,
  savedStateByStudentId,
  onSetStatus,
  onReasonChange,
  onViewHistory,
}: {
  title: string;
  tone: "marked" | "unmarked";
  students: AttendanceStudentRow[];
  draft: AttendanceDraft;
  savedStateByStudentId: Map<string, AttendanceMarkedState>;
  onSetStatus: (studentId: string, status: AttendanceStatus | null) => void;
  onReasonChange: (studentId: string, reason: string) => void;
  onViewHistory: (studentId: string) => void;
}) {
  const sectionTone = tone === "marked" ? "border-[#D6E8E1] bg-[#F7FBF9]" : "border-[#DDE5E9] bg-[#F8FAFB]";
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-lg font-semibold text-[#26323A]">{title}</h3>
        <span className="rounded-full bg-[#EEF3F5] px-2.5 py-1 text-xs font-semibold text-[#52616A]">{students.length}</span>
      </div>
      {students.length ? (
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {students.map((student) => {
            const studentId = student.enrollment.student_profile_id;
            const state = draft[studentId] ?? { status: null, reason: "" };
            const savedState = savedStateByStudentId.get(studentId);
            const studentName = student.profile?.full_name ?? student.profile?.email ?? "Student";
            return (
              <article key={student.enrollment.id} className={cn("overflow-hidden rounded-[20px] border", sectionTone)}>
                <div className="flex items-center gap-2.5 px-3 py-3">
                  <span className={cn("h-11 w-1.5 shrink-0 rounded-full", state.status === "present" ? "bg-[#17624F]" : state.status === "absent" ? "bg-[#C83F31]" : "bg-[#B9C3C8]")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-5 text-[#26323A]">{studentName}</p>
                    <p className="truncate text-[11px] font-medium leading-4 text-[#6B747B]">
                      {student.parent?.full_name ? `Parent: ${student.parent.full_name}` : student.profile?.account_type === "parent" ? "Adult student" : "Student"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewHistory(studentId)}
                    className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#2F8FB3] ring-1 ring-[#D6E7EE]"
                  >
                    History
                  </button>
                </div>
                <div className="space-y-2.5 border-t border-white/80 px-3 pb-3 pt-2.5">
                  <div className={cn("grid gap-1.5 rounded-[16px] bg-white/70 p-1 ring-1 ring-[#E1E8EC]", savedState ? "grid-cols-3" : "grid-cols-2")}>
                    <AttendanceStatusButton label="Present" active={state.status === "present"} tone="present" onClick={() => onSetStatus(studentId, "present")} />
                    <AttendanceStatusButton label="Absent" active={state.status === "absent"} tone="absent" onClick={() => onSetStatus(studentId, "absent")} />
                    {savedState ? <AttendanceStatusButton label="Unmark" active={state.status === null} tone="unmarked" onClick={() => onSetStatus(studentId, null)} /> : null}
                  </div>
                  {state.status === "absent" ? (
                    <textarea
                      value={state.reason}
                      onChange={(event) => onReasonChange(studentId, event.target.value)}
                      placeholder="Optional absence reason"
                      className="min-h-16 w-full resize-none rounded-[14px] border border-[#E3E8EC] bg-white px-3 py-2 text-xs text-[#26323A] outline-none focus:border-[#2F8FB3]"
                    />
                  ) : null}
                  {savedState ? (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8A949B]">
                      Saved as {savedState.status === "present" ? "present" : "absent"}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-[#DDE5E9] bg-[#F8FAFB] px-4 py-6 text-center text-sm font-medium text-[#7B858C]">
          No students in this section.
        </div>
      )}
    </section>
  );
}

type AttendanceHistoryRow = ProgramAttendanceRecord & {
  student?: StudentDisplay | null;
  marker?: Pick<Profile, "id" | "full_name" | "email"> | null;
};

type AttendanceHistoryStudent = {
  enrollment: Enrollment;
  profile: StudentDisplay | null;
  trackIds: string[];
};

type AttendanceHistorySessionColumn = {
  key: string;
  sessionId: string | null;
  sessionDate: string;
  dayOfWeek: string | null;
  startTime: string;
  endTime: string | null;
  trackIds: string[];
};

type AttendanceHistoryTimeframe = {
  key: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string | null;
  trackIds: string[];
  columns: AttendanceHistorySessionColumn[];
};

export function ProgramAttendanceHistoryData({ slug, programId, mode = "teacher" }: { slug: string; programId: string; mode?: "teacher" | "admin" }) {
  const searchParams = useSearchParams();
  const selectedStudentId = searchParams.get("studentId");
  const requestedDay = normalizeScheduleDay(searchParams.get("day") ?? "");
  const requestedStart = normalizeScheduleTime(searchParams.get("start") ?? "");
  const [program, setProgram] = useState<Program | null>(null);
  const [rows, setRows] = useState<AttendanceHistoryRow[]>([]);
  const [students, setStudents] = useState<AttendanceHistoryStudent[]>([]);
  const [sessions, setSessions] = useState<ProgramSession[]>([]);
  const [trackSessionLinks, setTrackSessionLinks] = useState<ProgramTrackSession[]>([]);
  const [selectedTimeframeKey, setSelectedTimeframeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
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
      const [{ data: mosque }, { data: canManage }] = await Promise.all([
        supabase.from("mosques").select("id").eq("slug", slug).maybeSingle(),
        supabase.rpc("can_manage_program", { check_program_id: programId, check_profile_id: userId }),
      ]);
      if (!active) {
        return;
      }
      if (!mosque) {
        setError("Masjid not found.");
        setLoading(false);
        return;
      }
      if (!canManage) {
        setError("You don't have permission to view attendance for this class.");
        setLoading(false);
        return;
      }
      const [{ data: programRow }, { data: recordRows }, { data: enrollmentRows }, { data: sessionRows }, { data: trackRows }] = await Promise.all([
        supabase.from("programs").select("*").eq("id", programId).eq("mosque_id", mosque.id).maybeSingle(),
        supabase
          .from("program_attendance_records")
          .select("*")
          .eq("program_id", programId)
          .order("session_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase.from("enrollments").select("*").eq("program_id", programId).order("created_at", { ascending: true }),
        supabase.from("program_sessions").select("*").eq("program_id", programId).order("session_date", { ascending: true }).order("start_time", { ascending: true }),
        supabase.from("program_tracks").select("*").eq("program_id", programId).eq("is_active", true).order("sort_order", { ascending: true }),
      ]);
      const activeEnrollmentRows = (enrollmentRows ?? []).filter((enrollment) => isCurrentEnrollmentStatus(enrollment.status));
      const trackIds = (trackRows ?? []).map((track) => track.id);
      const enrollmentIds = activeEnrollmentRows.map((enrollment) => enrollment.id);
      const [{ data: enrollmentTrackRows }, { data: trackSessionRows }] = await Promise.all([
        enrollmentIds.length
          ? supabase.from("enrollment_tracks").select("enrollment_id, program_track_id").in("enrollment_id", enrollmentIds)
          : Promise.resolve({ data: [] as Array<{ enrollment_id: string; program_track_id: string }> }),
        trackIds.length
          ? supabase.from("program_track_sessions").select("*").in("program_track_id", trackIds)
          : Promise.resolve({ data: [] as ProgramTrackSession[] }),
      ]);
      const trackIdsByEnrollmentId = new Map<string, string[]>();
      for (const row of enrollmentTrackRows ?? []) {
        trackIdsByEnrollmentId.set(row.enrollment_id, [...(trackIdsByEnrollmentId.get(row.enrollment_id) ?? []), row.program_track_id]);
      }
      const profileIds = Array.from(
        new Set([
          ...activeEnrollmentRows.map((enrollment) => enrollment.student_profile_id),
          ...(recordRows ?? []).flatMap((row) => [row.student_profile_id, row.marked_by]).filter((id): id is string => Boolean(id)),
        ]),
      );
      const { data: profileRows } = profileIds.length
        ? await supabase.from("profiles").select("id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type").in("id", profileIds)
        : { data: [] as StudentDisplay[] };
      if (!active) {
        return;
      }
      setProgram(programRow ?? null);
      const nextStudents = activeEnrollmentRows
        .filter((enrollment) => !selectedStudentId || enrollment.student_profile_id === selectedStudentId)
        .map((enrollment) => ({
          enrollment,
          trackIds: [
            ...(trackIdsByEnrollmentId.get(enrollment.id) ?? []),
            ...(enrollment.program_track_id ? [enrollment.program_track_id] : []),
          ].filter((trackId, index, all) => Boolean(trackId) && all.indexOf(trackId) === index),
          profile: ((profileRows ?? []).find((profile) => profile.id === enrollment.student_profile_id) as StudentDisplay | undefined) ?? null,
        }));
      setStudents(nextStudents);
      setSessions(sessionRows ?? []);
      setTrackSessionLinks(trackSessionRows ?? []);
      setRows(
        (recordRows ?? [])
          .filter((row) => !selectedStudentId || row.student_profile_id === selectedStudentId)
          .map((row) => ({
            ...row,
            student: (profileRows ?? []).find((profile) => profile.id === row.student_profile_id) as StudentDisplay | null,
            marker: row.marked_by ? ((profileRows ?? []).find((profile) => profile.id === row.marked_by) as Profile | undefined) ?? null : null,
          })),
      );
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [programId, selectedStudentId, slug]);

  const trackIdsBySessionId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of trackSessionLinks) {
      map.set(link.program_session_id, [...(map.get(link.program_session_id) ?? []), link.program_track_id]);
    }
    return map;
  }, [trackSessionLinks]);

  const allSessionColumns = useMemo(() => {
    const columns = new Map<string, AttendanceHistorySessionColumn>();
    for (const session of sessions) {
      if (!session.session_date) {
        continue;
      }
      const startTime = normalizeScheduleTime(session.start_time) || session.start_time;
      const endTime = normalizeScheduleTime(session.end_time ?? "") || null;
      const key = [session.session_date, startTime].join("|");
      columns.set(key, {
        key,
        sessionId: session.id,
        sessionDate: session.session_date,
        dayOfWeek: session.day_of_week,
        startTime,
        endTime,
        trackIds: trackIdsBySessionId.get(session.id) ?? [],
      });
    }
    for (const row of rows) {
      const startTime = normalizeScheduleTime(row.start_time) || row.start_time;
      const key = [row.session_date, startTime].join("|");
      if (!columns.has(key)) {
        columns.set(key, {
          key,
          sessionId: row.program_session_id,
          sessionDate: row.session_date,
          dayOfWeek: row.day_of_week,
          startTime,
          endTime: normalizeScheduleTime(row.end_time ?? "") || null,
          trackIds: row.program_session_id ? trackIdsBySessionId.get(row.program_session_id) ?? [] : [],
        });
      }
    }
    return Array.from(columns.values()).sort((a, b) => {
      const dateCompare = a.sessionDate.localeCompare(b.sessionDate);
      return dateCompare || a.startTime.localeCompare(b.startTime);
    });
  }, [rows, sessions, trackIdsBySessionId]);

  const timeframes = useMemo(() => {
    const map = new Map<string, AttendanceHistoryTimeframe>();
    for (const column of allSessionColumns) {
      const dayOfWeek = normalizeScheduleDay(column.dayOfWeek ?? "") || dayFromSessionDate(column.sessionDate);
      const key = [dayOfWeek, column.startTime, column.endTime ?? column.startTime].join("|");
      const existing = map.get(key);
      const nextTrackIds = Array.from(new Set([...(existing?.trackIds ?? []), ...column.trackIds]));
      if (existing) {
        existing.trackIds = nextTrackIds;
        existing.columns.push(column);
      } else {
        map.set(key, {
          key,
          dayOfWeek,
          startTime: column.startTime,
          endTime: column.endTime,
          trackIds: nextTrackIds,
          columns: [column],
        });
      }
    }
    return Array.from(map.values())
      .map((timeframe) => ({
        ...timeframe,
        columns: [...timeframe.columns].sort((a, b) => {
          const dateCompare = a.sessionDate.localeCompare(b.sessionDate);
          return dateCompare || a.startTime.localeCompare(b.startTime);
        }),
      }))
      .sort((a, b) => {
        const dayCompare = scheduleDayOptions.indexOf(a.dayOfWeek as (typeof scheduleDayOptions)[number]) - scheduleDayOptions.indexOf(b.dayOfWeek as (typeof scheduleDayOptions)[number]);
        return dayCompare || a.startTime.localeCompare(b.startTime);
      });
  }, [allSessionColumns]);

  useEffect(() => {
    setSelectedTimeframeKey((current) => {
      if (!timeframes.length) {
        return null;
      }
      if (current && timeframes.some((timeframe) => timeframe.key === current)) {
        return current;
      }
      const requested = requestedDay || requestedStart
        ? timeframes.find((timeframe) => (!requestedDay || timeframe.dayOfWeek === requestedDay) && (!requestedStart || timeframe.startTime === requestedStart))
        : null;
      return requested?.key ?? timeframes[0]?.key ?? null;
    });
  }, [requestedDay, requestedStart, timeframes]);
  const selectedTimeframe = selectedTimeframeKey ? timeframes.find((timeframe) => timeframe.key === selectedTimeframeKey) ?? null : null;
  const sessionColumns = selectedTimeframe?.columns ?? [];
  const filteredStudents = useMemo(() => {
    if (!selectedTimeframe || selectedStudentId) {
      return students;
    }
    if (!selectedTimeframe.trackIds.length) {
      return students;
    }
    return students.filter((student) => student.trackIds.some((trackId) => selectedTimeframe.trackIds.includes(trackId)));
  }, [selectedTimeframe, selectedStudentId, students]);

  const recordsByStudentAndSession = useMemo(() => {
    const map = new Map<string, AttendanceHistoryRow>();
    for (const row of rows) {
      const startTime = normalizeScheduleTime(row.start_time) || row.start_time;
      map.set(`${row.student_profile_id}|${row.session_date}|${startTime}`, row);
    }
    return map;
  }, [rows]);

  if (loading) {
    return <DirectorySkeleton layout="management" />;
  }
  if (error && !program) {
    return <EmptyState title="Could not load attendance" text={error} onRetry={() => window.location.reload()} />;
  }
  if (!program) {
    return <EmptyState title="Class not found" text="This class could not be loaded." />;
  }

  return (
    <section className="space-y-3 bg-white px-2 pb-28 pt-3 text-[#26323A] sm:px-4 sm:pt-4">
      <div className="space-y-0.5 px-1 sm:space-y-1">
        <h2 className="text-xl font-semibold leading-6 sm:text-2xl sm:leading-7">{program.title}</h2>
        <p className="text-xs font-medium text-[#6B747B] sm:text-sm">
          {selectedStudentId && students[0]?.profile ? `Attendance history for ${students[0].profile.full_name ?? students[0].profile.email ?? "student"}` : selectedTimeframe ? `Attendance history for ${formatAttendanceTimeframeLabel(selectedTimeframe)}` : "Attendance history"}
        </p>
      </div>
      {error ? <div className="rounded-[18px] border border-[#F4C7C1] bg-[#FDEDEA] px-4 py-3 text-sm text-[#A4352A]">{error}</div> : null}
      {!selectedStudentId && timeframes.length > 1 ? (
        <AttendanceHistoryTimeframeSelector timeframes={timeframes} selectedTimeframeKey={selectedTimeframeKey} onChange={setSelectedTimeframeKey} />
      ) : null}
      {filteredStudents.length && sessionColumns.length ? (
        <div className="-mx-1 overflow-hidden border-y border-[#E1E8EC] bg-white sm:mx-0 sm:rounded-[18px] sm:border sm:shadow-[0_10px_28px_rgba(38,50,58,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-max w-full border-separate border-spacing-0 text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#F7FAFB]">
                  <th className="sticky left-0 z-20 w-28 border-b border-r border-[#E1E8EC] bg-[#F7FAFB] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C] sm:w-48 sm:px-4 sm:py-3 sm:text-xs">
                    Student
                  </th>
                  {sessionColumns.map((session) => (
                    <th key={session.key} className="min-w-14 border-b border-[#E1E8EC] px-1.5 py-2 text-center sm:min-w-24 sm:px-2.5 sm:py-3">
                      <p className="text-[10px] font-semibold leading-4 text-[#26323A] sm:text-xs">{formatAttendanceHistoryDate(session.sessionDate)}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const studentName = student.profile?.full_name ?? student.profile?.email ?? "Student";
                  return (
                    <tr key={student.enrollment.id}>
                      <th className="sticky left-0 z-10 w-28 border-b border-r border-[#EEF2F4] bg-white px-2 py-2 text-left text-xs font-semibold leading-4 text-[#26323A] sm:w-48 sm:px-4 sm:py-3 sm:text-sm">
                        <span className="block min-w-0 truncate">{studentName}</span>
                      </th>
                      {sessionColumns.map((session) => {
                        const record = recordsByStudentAndSession.get(`${student.enrollment.student_profile_id}|${session.sessionDate}|${session.startTime}`);
                        return (
                          <td key={session.key} className="border-b border-[#EEF2F4] px-1 py-2 text-center align-middle sm:px-2 sm:py-3">
                            <AttendanceHistoryCell record={record} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <AttendanceEmptyState title="No attendance history" text="Marked sessions will appear here." />
      )}
    </section>
  );
}

function AttendanceHistoryTimeframeSelector({
  timeframes,
  selectedTimeframeKey,
  onChange,
}: {
  timeframes: AttendanceHistoryTimeframe[];
  selectedTimeframeKey: string | null;
  onChange: (timeframeKey: string) => void;
}) {
  return (
    <label className="block px-1">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8A949B]">Session timeframe</span>
      <select
        value={selectedTimeframeKey ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-full border border-[#DDE5E9] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none"
      >
        {timeframes.map((timeframe) => (
          <option key={timeframe.key} value={timeframe.key}>
            {formatAttendanceTimeframeLabel(timeframe)}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatAttendanceTimeframeLabel(timeframe: AttendanceHistoryTimeframe) {
  return `${formatDayAbbreviation(timeframe.dayOfWeek)} ${formatScheduleRange(timeframe.startTime, timeframe.endTime ?? timeframe.startTime)}`;
}

