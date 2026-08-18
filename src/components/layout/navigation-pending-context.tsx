"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

const NavigationPendingContext = createContext(false);

// Single source of truth for "a nav click just happened and the route hasn't caught up
// yet" -- a capture-phase click listener on the whole document, mounted once, so it fires
// before any nav item's own onClick/preventDefault (bottom nav, desktop sidebar,
// TransitionLink all go through this without wiring anything up themselves).
export function NavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingPathname, setPendingPathname] = useState<string | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearSafetyTimer() {
      if (safetyTimerRef.current !== null) {
        window.clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    }

    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) {
        return;
      }

      const destination = new URL(href, window.location.href);
      if (destination.pathname === window.location.pathname) {
        return;
      }

      setPendingPathname(destination.pathname);
      clearSafetyTimer();
      safetyTimerRef.current = window.setTimeout(() => setPendingPathname(null), 4000);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clearSafetyTimer();
    };
  }, []);

  // Derived, not synced: once the route actually catches up to what we're waiting on,
  // this is false on its own -- no separate effect needed to "reset" it on pathname change.
  const isPending = pendingPathname !== null && pendingPathname !== pathname;

  return <NavigationPendingContext.Provider value={isPending}>{children}</NavigationPendingContext.Provider>;
}

export function useNavigationPending() {
  return useContext(NavigationPendingContext);
}

// Most navigations resolve from cache well under this delay, so nothing ever appears --
// the spinner only reveals itself for a navigation that's genuinely slow, instead of flashing
// on every single tap the way the raw pending flag does.
export function useDelayedNavigationPending(delayMs: number) {
  const isPending = useNavigationPending();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!isPending) {
      const timer = window.setTimeout(() => setRevealed(false), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setRevealed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [isPending, delayMs]);

  return isPending && revealed;
}
