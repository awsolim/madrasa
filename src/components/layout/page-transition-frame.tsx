export function PageTransitionFrame({ children }: { children: React.ReactNode }) {
  // Keep the current real page visible until Next.js commits the destination. The
  // destination component then owns its neutral data skeleton. Guessed titles and
  // approximate controls here caused a second, visibly different layout to flash.
  return <main className="pb-20 md:pb-0">{children}</main>;
}
