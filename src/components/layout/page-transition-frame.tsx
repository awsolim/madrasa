"use client";

// A nav click is detected instantly (see NavigationPendingProvider) and reflected right away
// by the thin NavigationProgressBar at the top of the screen -- that alone is the loading
// signal for a navigation. The destination route handles its own content: cached data renders
// immediately, anything still fetching shows its own skeleton (see data-loading.tsx). No
// separate overlay is needed here; the old page just stays visible until the new one is ready.
export function PageTransitionFrame({ children }: { children: React.ReactNode }) {
  return <main className="relative pb-20 md:pb-0">{children}</main>;
}
