"use client";

import { cn } from "@/lib/utils";

export type AttendanceHistoryCellRecord = {
  status: string;
  absence_reason?: string | null;
};

export function formatAttendanceHistoryDate(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return value;
  }
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AttendanceHistoryCell({ record }: { record?: AttendanceHistoryCellRecord }) {
  if (!record) {
    return (
      <span className="inline-flex h-7 min-w-8 items-center justify-center rounded-full bg-[#F0F3F5] px-2 text-[11px] font-black text-[#7B858C] sm:h-8 sm:min-w-12 sm:text-xs">
        --
      </span>
    );
  }
  const present = record.status === "present";
  return (
    <div className="mx-auto max-w-20 space-y-1 sm:max-w-28">
      <span className={cn("inline-flex h-7 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-black sm:h-8 sm:min-w-12 sm:text-xs", present ? "bg-[#EAF7F1] text-[#17624F]" : "bg-[#FDEDEA] text-[#C0392B]")}>
        {present ? "P" : "A"}
      </span>
      {!present && record.absence_reason ? <p className="hidden text-[11px] font-medium leading-4 text-[#7B858C] sm:block">{record.absence_reason}</p> : null}
    </div>
  );
}
