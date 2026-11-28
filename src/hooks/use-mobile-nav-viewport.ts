"use client";

import { useEffect, type RefObject } from "react";

// Safari can retain the wrong bottom edge for fixed PWA chrome after viewport
// changes. Anchor from the visible viewport's top instead. Update the element
// directly so scrolling does not rerender the app or its navigation links.
export function useMobileNavViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const nav = ref.current;
    if (!active || !nav) return;

    const viewport = window.visualViewport;
    let frame: number | null = null;
    let previousBottom = "";

    function update() {
      frame = null;
      // Let normal browser zoom behavior apply; do not chase a pinched viewport.
      const bottom = viewport && viewport.scale === 1
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      if (!Number.isFinite(bottom) || bottom <= 0) return;
      const value = `${Math.round(bottom * 100) / 100}px`;
      if (value === previousBottom) return;
      nav!.style.setProperty("--mobile-nav-viewport-bottom", value);
      previousBottom = value;
    }

    function scheduleUpdate() {
      if (frame === null) frame = window.requestAnimationFrame(update);
    }

    update();
    viewport?.addEventListener("resize", scheduleUpdate);
    viewport?.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("orientationchange", scheduleUpdate);
    window.addEventListener("pageshow", scheduleUpdate);
    document.addEventListener("visibilitychange", scheduleUpdate);
    document.addEventListener("focusout", scheduleUpdate);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", scheduleUpdate);
      viewport?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.removeEventListener("pageshow", scheduleUpdate);
      document.removeEventListener("visibilitychange", scheduleUpdate);
      document.removeEventListener("focusout", scheduleUpdate);
      nav.style.removeProperty("--mobile-nav-viewport-bottom");
    };
  }, [active, ref]);
}
