"use client";

import { useEffect, useState } from "react";
import { AddToHomeIcon, LockIcon, initialsFromName } from "@/components/pwa/ios-install-demo";

type StepKey = "browse" | "tap-menu" | "menu" | "confirm" | "done";

const STEPS: Array<{ key: StepKey; caption: string; durationMs: number }> = [
  { key: "browse", caption: "Open your masjid's site in Chrome", durationMs: 1800 },
  { key: "tap-menu", caption: "Tap the menu icon", durationMs: 700 },
  { key: "menu", caption: 'Tap "Add to Home screen"', durationMs: 2800 },
  { key: "confirm", caption: 'Tap "Add" to confirm', durationMs: 2000 },
  { key: "done", caption: "It's on your Home Screen", durationMs: 1800 },
];

const androidBlue = "#1A73E8";

/**
 * A fully synthetic, looping mockup of the Android Chrome "Add to Home screen" flow --
 * mirrors IosInstallDemo's structure (same step-cycling pattern, same caption/dots
 * footer) but with Chrome's own chrome: an overflow menu instead of a share sheet, and a
 * centered Material dialog instead of a full-screen confirm sheet.
 */
export function AndroidInstallDemo({ siteLabel = "assiddiq.madrasa.ca", appName = "Assiddiq" }: { siteLabel?: string; appName?: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex].key;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStepIndex((current) => (current + 1) % STEPS.length);
    }, STEPS[stepIndex].durationMs);
    return () => window.clearTimeout(timer);
  }, [stepIndex]);

  const menuOpen = step === "tap-menu" || step === "menu";
  const highlightAddRow = step === "menu";
  const confirmVisible = step === "confirm";
  const homeLanding = step === "done";
  const menuIconActive = step === "tap-menu" || step === "menu";

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[500px] w-[248px] shrink-0 rounded-[36px] bg-[#0E0E0E] p-[9px] shadow-[0_20px_50px_rgba(17,18,20,0.35)]">
        <span className="pointer-events-none absolute left-1/2 top-[19px] z-30 h-[8px] w-[8px] -translate-x-1/2 rounded-full bg-[#0E0E0E] ring-1 ring-white/10" aria-hidden />
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[27px] bg-white">
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 pb-1 pt-2.5 text-[11px] font-semibold text-[#1F1F1F]">
            <span>11:41</span>
            <AndroidStatusGlyphs />
          </div>

          {/* Chrome address bar */}
          <div className="flex items-center gap-2 px-3 pb-2 pt-1">
            <div className="flex h-9 flex-1 items-center gap-1.5 rounded-full bg-[#EEF1F4] px-3">
              <LockIcon className="h-3 w-3 shrink-0 text-[#5F6368]" />
              <span className="truncate text-[12px] font-medium text-[#3C4043]">{siteLabel}</span>
            </div>
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
              {menuIconActive ? <span className="absolute inset-0 animate-ping rounded-full bg-[#1A73E8]/20" aria-hidden /> : null}
              <DotsIcon className="relative h-[18px] w-[18px] text-[#3C4043]" />
            </span>
          </div>

          {/* Page content -- styled like a real class card, matching the iOS mockup */}
          <div className="flex-1 px-4 py-3">
            <div className="overflow-hidden rounded-[14px] border border-[#E3E3E6]">
              <div className="aspect-[4/3] w-full bg-gradient-to-br from-[#CFE9DE] to-[#7FBBA6]" />
              <div className="space-y-1.5 p-2.5">
                <div className="h-2.5 w-3/4 rounded-full bg-[#DADBDD]" />
                <div className="h-2 w-1/2 rounded-full bg-[#E7E8EA]" />
                <span className="mt-1 inline-flex h-4 w-20 rounded-full bg-[#DCEFE7]" />
              </div>
            </div>
          </div>

          {/* Android system navigation bar */}
          <div className="flex items-center justify-center gap-14 border-t border-[#EDEDED] py-2.5">
            <TriangleIcon className="h-3 w-3 text-[#5F6368]" />
            <span className="h-3 w-3 rounded-full border-2 border-[#5F6368]" />
            <span className="h-[11px] w-[11px] rounded-[3px] border-2 border-[#5F6368]" />
          </div>

          {/* Home-screen landing state */}
          <div
            className="absolute inset-0 z-20 bg-gradient-to-b from-[#2B3A4A] to-[#131B24] transition-opacity duration-500"
            style={{ opacity: homeLanding ? 1 : 0, pointerEvents: homeLanding ? "auto" : "none" }}
            aria-hidden
          >
            <div className="grid grid-cols-4 gap-x-3 gap-y-4 px-5 pt-16">
              {Array.from({ length: 8 }).map((_, index) =>
                index === 5 ? (
                  <div key={index} className="flex flex-col items-center gap-1">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-[#17624F] text-sm font-bold text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition-transform duration-500"
                      style={{ transform: homeLanding ? "scale(1)" : "scale(0.4)" }}
                    >
                      {initialsFromName(appName)}
                    </div>
                    <span className="max-w-[52px] truncate text-[10px] font-medium text-white/90">{appName}</span>
                  </div>
                ) : (
                  <div key={index} className="flex flex-col items-center gap-1">
                    <div className="h-12 w-12 rounded-full bg-white/15" />
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Dimmed backdrop while the menu or confirm dialog is up */}
          <div
            className="absolute inset-0 z-10 bg-black/25 transition-opacity duration-300"
            style={{ opacity: menuOpen || confirmVisible ? 1 : 0, pointerEvents: "none" }}
            aria-hidden
          />

          {/* Chrome overflow menu */}
          <div
            className="absolute right-3 top-[52px] z-20 w-[172px] origin-top-right overflow-hidden rounded-[10px] bg-white py-1 shadow-[0_12px_30px_rgba(0,0,0,0.22)] transition-all duration-300 ease-out"
            style={{ transform: menuOpen ? "scale(1)" : "scale(0.85)", opacity: menuOpen ? 1 : 0 }}
          >
            <MenuRow label="New tab" />
            <MenuRow label="Bookmarks" />
            <MenuRow label="History" />
            <MenuRow label="Share..." />
            <MenuRow label="Find in page" />
            <MenuRow label="Add to Home screen" icon={<AddToHomeIcon className="h-[14px] w-[14px]" />} highlighted={highlightAddRow} />
            <MenuRow label="Desktop site" />
            <MenuRow label="Settings" />
          </div>

          {/* Confirm dialog -- centered Material dialog, distinct from iOS's full-screen sheet */}
          <div
            className="absolute inset-0 z-30 flex items-center justify-center px-7 transition-opacity duration-300"
            style={{ opacity: confirmVisible ? 1 : 0, pointerEvents: "none" }}
          >
            <div
              className="w-full max-w-[220px] overflow-hidden rounded-[16px] bg-white shadow-[0_20px_44px_rgba(0,0,0,0.3)] transition-transform duration-300"
              style={{ transform: confirmVisible ? "scale(1)" : "scale(0.92)" }}
            >
              <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#17624F] text-xs font-bold text-white">{initialsFromName(appName)}</div>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-[#1F1F1F]">{appName}</p>
                  <p className="truncate text-[10.5px] text-[#5F6368]">{siteLabel}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 px-2 pb-2.5 pt-3">
                <span className="rounded-full px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: androidBlue }}>
                  Cancel
                </span>
                <span className="relative rounded-full px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide" style={{ color: androidBlue }}>
                  {confirmVisible ? <span className="absolute inset-0.5 animate-pulse rounded-full bg-[#1A73E8]/10" aria-hidden /> : null}
                  <span className="relative">Add</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 min-h-[20px] text-center text-sm font-semibold text-[#26323A]">{STEPS[stepIndex].caption}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {STEPS.map((item, index) => (
          <span key={item.key} className={`h-1.5 rounded-full transition-all duration-300 ${index === stepIndex ? "w-4 bg-[#17624F]" : "w-1.5 bg-[#D6DCE0]"}`} />
        ))}
      </div>
    </div>
  );
}

function MenuRow({ label, icon, highlighted = false }: { label: string; icon?: React.ReactNode; highlighted?: boolean }) {
  return (
    <div className={`relative mx-1 flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 transition-colors ${highlighted ? "bg-[#1A73E8]/10" : ""}`}>
      {highlighted ? <span className="absolute -inset-0.5 animate-pulse rounded-[10px] ring-2 ring-[#1A73E8]/50" aria-hidden /> : null}
      {icon ? (
        <span style={{ color: androidBlue }}>{icon}</span>
      ) : (
        <span className="h-[14px] w-[14px] shrink-0" aria-hidden />
      )}
      <span className="truncate text-[12px] font-medium text-[#1F1F1F]">{label}</span>
    </div>
  );
}

function AndroidStatusGlyphs() {
  return (
    <span className="flex items-center gap-1">
      <svg viewBox="0 0 16 12" className="h-2.5 w-3.5" fill="#1F1F1F" aria-hidden>
        <rect x="0" y="7" width="2.4" height="5" rx="0.6" />
        <rect x="4" y="5" width="2.4" height="7" rx="0.6" />
        <rect x="8" y="3" width="2.4" height="9" rx="0.6" />
        <rect x="12" y="0" width="2.4" height="12" rx="0.6" />
      </svg>
      <svg viewBox="0 0 22 12" className="h-2.5 w-5" fill="none" stroke="#1F1F1F" strokeWidth="1.2" aria-hidden>
        <rect x="0.6" y="1" width="17.5" height="10" rx="2.6" />
        <rect x="2.2" y="2.6" width="14.3" height="6.8" rx="1.3" fill="#1F1F1F" stroke="none" />
        <rect x="19" y="4" width="2" height="4" rx="1" fill="#1F1F1F" stroke="none" />
      </svg>
    </span>
  );
}

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function TriangleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}
