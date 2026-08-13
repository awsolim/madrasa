"use client";

import type { ReactNode } from "react";
import { GenericLoadingState } from "@/components/data/data-loading";
import { cn } from "@/lib/utils";

export function FloatingInboxTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; badge?: number; actionRequired?: boolean }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr border-b border-[#D6DCE0] bg-[var(--workspace)] px-3">
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex min-h-14 min-w-0 items-center justify-center px-1 text-center text-[17px] font-semibold transition",
              active ? "border-b-[3px] border-[#2F8FB3] text-[#2F8FB3]" : "text-[#8A949B]",
            )}
          >
            <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-center">
              {tab.label}
              {!tab.badge && tab.actionRequired ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#2F8FB3]" /> : null}
            </span>
            {tab.badge ? <NotificationBadge count={tab.badge} className="right-1 top-2" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function NotificationBadge({ count, actionRequired, className = "" }: { count?: number; actionRequired?: boolean; className?: string }) {
  if (actionRequired) {
    return <span className={cn("absolute h-3 w-3 rounded-full bg-[#2F8FB3] ring-2 ring-white", className)} />;
  }
  if (count) {
    return (
      <span className={cn("absolute flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E25241] px-1 text-[11px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(226,82,65,0.35)] ring-2 ring-white", className)}>
        {count > 9 ? "9+" : count}
      </span>
    );
  }
  return null;
}

export function InboxSection({ title, count, children, action }: { title: string; count: number; children: ReactNode; action?: ReactNode }) {
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

export function InboxLoadingPanel({ label }: { label: string }) {
  return <GenericLoadingState label={label} />;
}
