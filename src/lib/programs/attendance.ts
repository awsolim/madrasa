import {
  dayKey,
  normalizeScheduleTime,
  weekdayName,
} from "@/lib/programs/schedule";

export type AttendanceLinkLesson = {
  program: { id: string };
  date: Date;
  start: string;
  end: string;
};

export function attendanceMarkHref(slug: string, lesson: AttendanceLinkLesson) {
  const params = new URLSearchParams({
    date: dayKey(lesson.date),
    day: weekdayName(lesson.date),
    start: normalizeScheduleTime(lesson.start) || lesson.start,
    end: normalizeScheduleTime(lesson.end) || lesson.end || lesson.start,
  });
  return `/m/${slug}/teacher/classes/${lesson.program.id}/attendance/mark?${params.toString()}`;
}

export function attendanceHistoryHref(slug: string, programId: string, basePath?: string, from = "classes") {
  const params = new URLSearchParams({ from });
  return `${basePath ?? `/m/${slug}/teacher/classes`}/${programId}/attendance?${params.toString()}`;
}
