"use client";

import { useEffect, type RefObject } from "react";

// Keep PWA chrome at the full layout viewport's bottom. VisualViewport shrinks
// for the keyboard and retains transient offsets during Safari transitions;
// using that rectangle can strand navigation halfway up the restored screen.
export function useMobileNavViewport(ref: RefObject<HTMLElement | null>, active: boolean, route?: string) {
  useEffect(() => {
    const nav = ref.current;
    if (!active || !nav) return;

    const viewport = window.visualViewport;
    let frame: number | null = null;
    let previousBottom = "";
    const timers = new Set<number>();

    function update() {
      frame = null;
      // clientHeight stays full-height when the software keyboard covers the
      // visual viewport. Ignore visual offsets, rubber-banding and pinch zoom.
      const bottom = Math.max(document.documentElement.clientHeight, window.innerHeight);
      if (!Number.isFinite(bottom) || bottom <= 0) return;
      const value = `${Math.round(bottom * 100) / 100}px`;
      if (value === previousBottom) return;
      nav!.style.setProperty("--mobile-nav-viewport-bottom", value);
      previousBottom = value;
    }

    function scheduleUpdate() {
      if (frame === null) frame = window.requestAnimationFrame(update);
    }

    function recover() {
      scheduleUpdate();
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      // Safari can report the pre-transition layout during focusout/navigation.
      // Recheck after it settles; never run a permanent animation/polling loop.
      for (const delay of [250, 700]) {
        const timer = window.setTimeout(() => { timers.delete(timer); scheduleUpdate(); }, delay);
        timers.add(timer);
      }
    }

    update();
    recover();
    viewport?.addEventListener("resize", scheduleUpdate);
    viewport?.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("orientationchange", recover);
    window.addEventListener("pageshow", recover);
    document.addEventListener("visibilitychange", recover);
    document.addEventListener("focusout", recover);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      viewport?.removeEventListener("resize", scheduleUpdate);
      viewport?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("orientationchange", recover);
      window.removeEventListener("pageshow", recover);
      document.removeEventListener("visibilitychange", recover);
      document.removeEventListener("focusout", recover);
      nav.style.removeProperty("--mobile-nav-viewport-bottom");
    };
  }, [active, ref, route]);
}
