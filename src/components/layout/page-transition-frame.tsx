"use client";

import { useStandaloneMode } from "@/lib/pwa/install";

// The shared shell stays mounted while Next swaps its route content. A separate
// navigation surface hid both cached pages and the destination's real loading UI.
export function PageTransitionFrame({ children }: { children: React.ReactNode }) {
  const standalone = useStandaloneMode();
  return <main className={`relative ${standalone === true ? "pb-20" : "pb-0"} md:pb-0`}>{children}</main>;
}
