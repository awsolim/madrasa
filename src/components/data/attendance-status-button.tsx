"use client";

import { cn } from "@/lib/utils";

export function AttendanceStatusButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "present" | "absent" | "unmarked";
  onClick: () => void;
}) {
  const activeClass =
    tone === "present"
      ? "bg-[#17624F] text-white shadow-[0_8px_18px_rgba(23,98,79,0.18)]"
      : tone === "absent"
        ? "bg-[#C83F31] text-white shadow-[0_8px_18px_rgba(200,63,49,0.18)]"
        : "bg-[#26323A] text-white shadow-[0_8px_18px_rgba(38,50,58,0.16)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-[12px] px-2 text-xs font-black transition sm:text-sm",
        active ? activeClass : "bg-transparent text-[#52616A] hover:bg-white",
      )}
    >
      {label}
    </button>
  );
}
