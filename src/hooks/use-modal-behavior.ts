"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

const modalFocusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-level counter so stacked modals (e.g. a confirm dialog opened on top of a drawer)
// don't have the inner one's cleanup re-enable scroll while the outer one is still open.
let bodyScrollLockCount = 0;
let bodyScrollLockPreviousOverflow: { html: string; body: string } | null = null;

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    bodyScrollLockPreviousOverflow = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  bodyScrollLockCount += 1;
}

function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount === 0 && bodyScrollLockPreviousOverflow) {
    document.documentElement.style.overflow = bodyScrollLockPreviousOverflow.html;
    document.body.style.overflow = bodyScrollLockPreviousOverflow.body;
    bodyScrollLockPreviousOverflow = null;
  }
}

export function useModalFocusTrap<T extends HTMLElement>(containerRef: RefObject<T | null>, active: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    lockBodyScroll();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initialFocusable = container.querySelectorAll<HTMLElement>(modalFocusableSelector);
    const preferredInitialFocus = container.querySelector<HTMLElement>("[data-modal-initial-focus]");
    (preferredInitialFocus ?? initialFocusable[0] ?? container).focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (onClose) {
          event.preventDefault();
          onClose();
        }
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(container!.querySelectorAll<HTMLElement>(modalFocusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      unlockBodyScroll();
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Hides the app's bottom nav/top bar (via the tareeqah:overlay-chrome event) for as long as a
 * same-route full-screen modal/drawer stays mounted, since those overlays don't change the
 * pathname and so wouldn't otherwise be caught by route-based chrome-visibility logic. */
export function useHideMobileChromeWhileMounted(active = true) {
  useEffect(() => {
    if (!active) {
      return;
    }
    window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("tareeqah:overlay-chrome", { detail: { hidden: false } }));
    };
  }, [active]);
}
