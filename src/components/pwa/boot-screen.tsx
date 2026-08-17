"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// Covers the gap between the OS handing the PWA a blank webview and the app's own
// content painting -- server-rendered, so it's part of the first HTML response and
// shows before any JS runs. The real page underneath is rendering the whole time;
// this only visually hides it until hydration confirms the app is actually live, then
// fades away. A safety-net timeout guarantees it never gets stuck up if hydration is
// unusually slow.
const maxVisibleMs = 4000;
const fadeMs = 260;

export function BootScreen() {
  const [dismissed, setDismissed] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const dismissTimer = window.setTimeout(() => setDismissed(true), 0);
    const safetyTimer = window.setTimeout(() => setDismissed(true), maxVisibleMs);
    return () => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    if (!dismissed) {
      return;
    }
    const removeTimer = window.setTimeout(() => setRemoved(true), fadeMs);
    return () => window.clearTimeout(removeTimer);
  }, [dismissed]);

  if (removed) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-4 bg-[#E8F3F0] transition-opacity ease-out motion-reduce:transition-none"
      style={{
        opacity: dismissed ? 0 : 1,
        pointerEvents: dismissed ? "none" : "auto",
        transitionDuration: `${fadeMs}ms`,
      }}
    >
      <Image src="/icon-192x192.png" alt="" width={112} height={112} priority className="rounded-[26px] shadow-[0_18px_44px_rgba(23,98,79,0.22)]" />
      <span className="text-xl font-semibold tracking-tight text-[#17624F]">Madrasa</span>
    </div>
  );
}
