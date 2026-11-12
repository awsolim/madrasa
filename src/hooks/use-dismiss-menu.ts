"use client";

import { useEffect, type RefObject } from "react";

// Include both the trigger and the panel when the panel renders in a portal.
// Capture pointer events so touches and clicks still dismiss when another
// control stops propagation, without blocking that control's own action.
export function useDismissMenu(open: boolean, regions: RefObject<HTMLElement | null>[], onDismiss: () => void) {
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent | FocusEvent) {
      if (!regions.some(({ current }) => current && event.composedPath().includes(current))) onDismiss();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onDismiss();
      const trigger = regions[0]?.current;
      (trigger?.matches("button") ? trigger : trigger?.querySelector("button"))?.focus();
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("tareeqah:workspace-location", onDismiss);
    window.addEventListener("tareeqah:nav-preview", onDismiss);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("tareeqah:workspace-location", onDismiss);
      window.removeEventListener("tareeqah:nav-preview", onDismiss);
    };
  }, [open, regions, onDismiss]);
}
