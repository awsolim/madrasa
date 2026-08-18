"use client";

import { useDelayedNavigationPending } from "@/components/layout/navigation-pending-context";

// The old page must never sit frozen on screen after a nav tap. A nav click is detected
// instantly (see NavigationPendingProvider) and reflected right away by the thin
// NavigationProgressBar, but this overlay only reveals itself after a short delay -- most
// navigations resolve from cache well under that window, so nothing ever flashes; only a
// genuinely slow navigation gets a spinner. Once the route actually catches up, this unmounts
// and whatever the destination renders (its own skeleton, then real content) takes over.
export function PageTransitionFrame({ children }: { children: React.ReactNode }) {
  const isPending = useDelayedNavigationPending(200);

  return (
    <main className="relative pb-20 md:pb-0">
      {isPending ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--workspace)]">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#DDE7E2] border-t-[var(--brand-green)]" aria-label="Loading" />
        </div>
      ) : null}
      {children}
    </main>
  );
}
