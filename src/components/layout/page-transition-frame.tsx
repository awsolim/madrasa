"use client";

import { useNavigationPending } from "@/components/layout/navigation-pending-context";

// The old page must never sit frozen on screen after a nav tap. The moment a nav click is
// detected (see NavigationPendingProvider), this instantly covers the content area with a
// neutral, content-agnostic loading state -- not a guess at the destination's layout, which
// is what caused a visibly-mismatched flash the last time this was attempted. Once the route
// actually catches up, this unmounts and whatever the destination renders (its own skeleton,
// then real content) takes over immediately.
export function PageTransitionFrame({ children }: { children: React.ReactNode }) {
  const isPending = useNavigationPending();

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
