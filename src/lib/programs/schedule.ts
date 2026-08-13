import type { Json } from "@/lib/supabase/types";

export const scheduleDayOptions = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type ScheduleDay = (typeof scheduleDayOptions)[number];

export type ProgramScheduleRow = {
  id?: string;
  date?: string;
  day: ScheduleDay;
  start: string;
  end: string;
};

export function formatDayAbbreviation(day: string) {
  return day.slice(0, 3);
}

export function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekdayName(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

export function dayFromSessionDate(value: string | null) {
  if (!value) {
    return "Monday" as const;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "Monday" as const;
  }
  return scheduleDayOptions[parsed.getDay() === 0 ? 6 : parsed.getDay() - 1];
}

export function normalizeScheduleDay(value: string) {
  const lower = value.trim().toLowerCase();
  const found = scheduleDayOptions.find((day) => day.toLowerCase() === lower || day.slice(0, 3).toLowerCase() === lower.slice(0, 3));
  return found ?? "";
}

export function normalizeScheduleTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return "";
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function formatClockLabel(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }

  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatScheduleRange(start: string, end?: string | null) {
  const startLabel = formatClockLabel(start);
  const endLabel = end ? formatClockLabel(end) : "";
  return endLabel ? `${startLabel}-${endLabel}` : startLabel;
}

export function parseProgramSchedule(schedule: Json | null): ProgramScheduleRow[] {
  const rawRows = expandRawScheduleRows(schedule);
  if (rawRows.length === 0) {
    return [];
  }

  const rows = rawRows
    .map((item): ProgramScheduleRow | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const dayValue = readScheduleString(item, ["day", "weekday", "days"]);
      const startValue = readScheduleString(item, ["start", "start_time", "startTime", "from"]);
      const endValue = readScheduleString(item, ["end", "end_time", "endTime", "to"]);
      const idValue = readScheduleString(item, ["id", "session_id", "sessionId"]);
      const dateValue = readScheduleString(item, ["date", "session_date", "sessionDate"]);
      const day = dayValue ? normalizeScheduleDay(dayValue) : "";
      const start = startValue ? normalizeScheduleTime(startValue) : "";
      const end = endValue ? normalizeScheduleTime(endValue) : "";
      if (!day || !start) {
        return null;
      }

      return { id: idValue || undefined, date: dateValue || undefined, day: day as ScheduleDay, start, end: end || start };
    })
    .filter((row): row is ProgramScheduleRow => Boolean(row));

  return sortScheduleRows(rows);
}

export function scheduleRowKey(row: ProgramScheduleRow) {
  return [row.date ?? "", row.day, normalizeScheduleTime(row.start) || row.start, normalizeScheduleTime(row.end) || row.end].join("|");
}

export function rosterSessionKey(row: Pick<ProgramScheduleRow, "day" | "start" | "end">) {
  return [normalizeScheduleDay(row.day) || row.day, normalizeScheduleTime(row.start) || row.start, normalizeScheduleTime(row.end ?? row.start) || row.end || row.start].join("|");
}

export function uniqueScheduleRows(rows: ProgramScheduleRow[]) {
  const byKey = new Map<string, ProgramScheduleRow>();
  for (const row of rows) {
    const start = normalizeScheduleTime(row.start) || row.start;
    const end = normalizeScheduleTime(row.end) || row.end || start;
    if (!row.day || !start) {
      continue;
    }
    const normalized = { ...row, start, end };
    if (!byKey.has(scheduleRowKey(normalized))) {
      byKey.set(scheduleRowKey(normalized), normalized);
    }
  }
  return sortScheduleRows(Array.from(byKey.values()));
}

export function scheduleRowsToJson(rows: ProgramScheduleRow[]): Json {
  return uniqueScheduleRows(rows).map((row) => ({
    id: row.id,
    date: row.date,
    day: row.day,
    start: row.start,
    end: row.end,
  })) as unknown as Json;
}

export function scheduleLabel(schedule: Json | null, fallback: string) {
  const rows = parseProgramSchedule(schedule);
  if (rows.length === 0) {
    return fallback;
  }

  return rows.length === 1 ? rows[0].day : rows.map((row) => row.day.slice(0, 3)).join(", ");
}

function expandRawScheduleRows(schedule: Json | null): Array<Record<string, Json>> {
  if (Array.isArray(schedule)) {
    return schedule.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }

      return expandScheduleObject(item as Record<string, Json>);
    });
  }

  if (schedule && typeof schedule === "object") {
    return expandScheduleObject(schedule as Record<string, Json>);
  }

  return [];
}

function expandScheduleObject(item: Record<string, Json>): Array<Record<string, Json>> {
  const days = item.days;
  if (Array.isArray(days)) {
    return days
      .filter((day): day is string => typeof day === "string")
      .map((day) => ({
        ...item,
        day,
      }));
  }

  return [item];
}

function readScheduleString(item: Record<string, Json>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

export function sortScheduleRows(rows: ProgramScheduleRow[]) {
  return [...rows].sort((a, b) => scheduleDayOptions.indexOf(a.day) - scheduleDayOptions.indexOf(b.day));
}
