"use client";

import { useNavigationPending } from "@/components/layout/navigation-pending-context";

export function NavigationProgressBar() {
  const isPending = useNavigationPending();

  if (!isPending) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] h-[3px] overflow-hidden" aria-hidden>
      <div className="nav-progress-sweep h-full w-1/3 bg-[var(--brand-green)]" />
    </div>
  );
}
