"use client";

import { useEffect, useState } from "react";

type StepKey = "browse" | "tap-share" | "sheet" | "confirm" | "done";

const STEPS: Array<{ key: StepKey; caption: string; durationMs: number }> = [
  { key: "browse", caption: "Open your masjid's site in Safari", durationMs: 1800 },
  { key: "tap-share", caption: "Tap the Share icon", durationMs: 700 },
  { key: "sheet", caption: 'Scroll down and tap "Add to Home Screen"', durationMs: 2800 },
  { key: "confirm", caption: 'Tap "Add" in the top right', durationMs: 2600 },
  { key: "done", caption: "It's on your Home Screen", durationMs: 1800 },
];

const iosBlue = "#0B84FF";
const rowHeight = 36;
const listScrollOffset = rowHeight * 6 - 132;

/**
 * A fully synthetic, looping mockup of the iOS Safari "Add to Home Screen" flow --
 * deliberately not a real screen recording, so there's no risk of leaking a real
 * share-sheet contact list, and every tap target can carry an explicit indicator.
 * Modeled on modern iOS Safari's bottom-anchored chrome: the address bar sits directly
 * above the icon toolbar (both pinned to the bottom), not at the top of the screen.
 */
export function IosInstallDemo({ siteLabel = "assiddiq.madrasa.ca", appName = "Assiddiq" }: { siteLabel?: string; appName?: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [listScrolled, setListScrolled] = useState(false);
  const step = STEPS[stepIndex].key;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStepIndex((current) => (current + 1) % STEPS.length);
    }, STEPS[stepIndex].durationMs);
    return () => window.clearTimeout(timer);
  }, [stepIndex]);

  useEffect(() => {
    if (step !== "sheet") {
      return;
    }
    const resetTimer = window.setTimeout(() => setListScrolled(false), 0);
    const scrollTimer = window.setTimeout(() => setListScrolled(true), 1000);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(scrollTimer);
    };
  }, [step]);

  const sheetUp = step === "tap-share" || step === "sheet";
  const highlightAddRow = step === "sheet" && listScrolled;
  const confirmVisible = step === "confirm";
  const homeLanding = step === "done";
  const shareIconActive = step === "tap-share" || step === "sheet";
  const chromeVisible = step !== "confirm" && step !== "done";

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[500px] w-[248px] shrink-0 rounded-[40px] bg-[#111214] p-[9px] shadow-[0_20px_50px_rgba(17,18,20,0.35)]">
        <div className="pointer-events-none absolute left-1/2 top-[9px] z-30 h-[20px] w-[86px] -translate-x-1/2 rounded-full bg-[#111214]" aria-hidden />
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[32px] bg-white">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[11px] font-semibold text-[#0B0B0C]">
            <span>9:41</span>
            <StatusGlyphs />
          </div>

          {/* Page content -- styled like a real class card (image, title, status pill), not
              abstract gradient blocks, so this reads as "our app" rather than a generic mockup. */}
          <div className="flex-1 overflow-hidden px-4 py-3">
            <div className="overflow-hidden rounded-[14px] border border-[#E3E3E6]">
              <div className="aspect-[4/3] w-full bg-gradient-to-br from-[#CFE9DE] to-[#7FBBA6]" />
              <div className="space-y-1.5 p-2.5">
                <div className="h-2.5 w-3/4 rounded-full bg-[#DADBDD]" />
                <div className="h-2 w-1/2 rounded-full bg-[#E7E8EA]" />
                <span className="mt-1 inline-flex h-4 w-20 rounded-full bg-[#DCEFE7]" />
              </div>
            </div>
          </div>

          {/* Address bar + icon toolbar -- both anchored to the bottom together, matching
              modern iOS Safari (not a top address bar with a separate bottom toolbar). */}
          {chromeVisible ? (
            <div className="shrink-0 border-t border-[#E3E3E6] bg-[#F8F8F9]/95 pb-1 pt-1.5 backdrop-blur">
              <div className="flex items-center gap-2 px-3 pb-1.5">
                <span className="shrink-0 text-[11px] font-semibold text-[#8A8A8E]">AA</span>
                <div className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[#EFEFF1] px-3">
                  <LockIcon className="h-3 w-3 text-[#6B6B70]" />
                  <span className="truncate text-[12px] font-medium text-[#3C3C43]">{siteLabel}</span>
                  <RefreshIcon className="h-3 w-3 shrink-0 text-[#6B6B70]" />
                </div>
              </div>
              <div className="flex items-center justify-between px-5 pt-1">
                <ChevronIcon direction="back" className="h-4 w-4" style={{ color: iosBlue }} />
                <ChevronIcon direction="forward" className="h-4 w-4" style={{ color: `${iosBlue}55` }} />
                <span className="relative flex h-9 w-9 items-center justify-center">
                  {shareIconActive ? <span className="absolute inset-0 animate-ping rounded-full" style={{ backgroundColor: `${iosBlue}30` }} aria-hidden /> : null}
                  <ShareIcon className="relative h-5 w-5" style={{ color: iosBlue }} />
                </span>
                <BookIcon className="h-[18px] w-[18px]" style={{ color: iosBlue }} />
                <TabsIcon className="h-[18px] w-[18px]" style={{ color: iosBlue }} />
              </div>
            </div>
          ) : null}

          {/* Home-screen landing state, replaces the browser once "added" */}
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
                      className="flex h-12 w-12 items-center justify-center rounded-[13px] bg-[#17624F] text-sm font-bold text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition-transform duration-500"
                      style={{ transform: homeLanding ? "scale(1)" : "scale(0.4)" }}
                    >
                      {initialsFromName(appName)}
                    </div>
                    <span className="max-w-[52px] truncate text-[10px] font-medium text-white/90">{appName}</span>
                  </div>
                ) : (
                  <div key={index} className="flex flex-col items-center gap-1">
                    <div className="h-12 w-12 rounded-[13px] bg-white/15" />
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Dimmed backdrop while the share sheet or confirm sheet is up */}
          <div
            className="absolute inset-0 z-10 bg-black/25 transition-opacity duration-300"
            style={{ opacity: sheetUp || confirmVisible ? 1 : 0, pointerEvents: "none" }}
            aria-hidden
          />

          {/* Share sheet */}
          <div
            className="absolute inset-x-0 bottom-0 z-20 rounded-t-[20px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] transition-transform duration-500 ease-out"
            style={{ transform: sheetUp ? "translateY(0%)" : "translateY(105%)" }}
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[#D8D8DC]" aria-hidden />
            <div className="flex items-center gap-2 border-b border-[#E3E3E6] px-4 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-[#17624F] text-[9px] font-bold text-white">{initialsFromName(appName)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#0B0B0C]">{appName}</p>
                <p className="truncate text-[10px] text-[#8A8A8E]">{siteLabel}</p>
              </div>
            </div>
            <div className="flex items-center justify-around px-3 pb-2 pt-3">
              <ShareTarget label="Contact" color="#E3E3E6" icon={null} />
              <ShareTarget label="Contact" color="#E3E3E6" icon={null} />
              <ShareTarget label="Contact" color="#E3E3E6" icon={null} />
              <ShareTarget label="Contact" color="#E3E3E6" icon={null} />
            </div>
            <div className="flex items-center justify-around px-3 pb-3">
              <ShareTarget label="AirDrop" color="#1E90FF" icon={<AirDropIcon className="h-5 w-5 text-white" />} />
              <ShareTarget label="Messages" color="#3DD65A" icon={<MessageIcon className="h-5 w-5 text-white" />} />
              <ShareTarget label="Mail" color="#2E8FF2" icon={<MailIcon className="h-5 w-5 text-white" />} />
              <ShareTarget label="More" color="#C6C6C9" icon={<MoreIcon className="h-5 w-5 text-white" />} />
            </div>
            <div className="h-px bg-[#E3E3E6]" />
            {/* Fixed-height viewport onto a taller list -- "Add to Home Screen" starts below
                the fold and the list scrolls up to reveal it, matching the real interaction
                instead of just sitting statically visible. */}
            <div className="relative h-[132px] overflow-hidden px-2 pb-1 pt-1">
              <div className="transition-transform duration-500 ease-out" style={{ transform: `translateY(-${listScrolled ? listScrollOffset : 0}px)` }}>
                <ActionRow icon={<CopyIcon className="h-[17px] w-[17px]" />} label="Copy" />
                <ActionRow icon={<ReadingListIcon className="h-[17px] w-[17px]" />} label="Add to Reading List" />
                <ActionRow icon={<BookmarkIcon className="h-[17px] w-[17px]" />} label="Add Bookmark" />
                <ActionRow icon={<StarIcon className="h-[17px] w-[17px]" />} label="Add to Favorites" />
                <ActionRow icon={<SearchIcon className="h-[17px] w-[17px]" />} label="Find on Page" />
                <ActionRow icon={<AddToHomeIcon className="h-[17px] w-[17px]" />} label="Add to Home Screen" highlighted={highlightAddRow} />
              </div>
              {!listScrolled ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-7 items-end justify-center bg-gradient-to-t from-white to-transparent pb-0.5">
                  <ChevronIcon direction="forward" className="h-3.5 w-3.5 -rotate-90 animate-bounce" style={{ color: "#B8B8BC" }} />
                </div>
              ) : null}
            </div>
          </div>

          {/* Confirm step -- a compact sheet (icon, editable name, url, helper text) with the
              system keyboard docked below it, since the name field is focused -- not a
              full-screen page and not a small centered alert. */}
          <div
            className="absolute inset-x-0 bottom-0 z-30 flex flex-col transition-transform duration-400 ease-out"
            style={{ transform: confirmVisible ? "translateY(0%)" : "translateY(100%)" }}
          >
            <div className="rounded-t-[14px] bg-[#F2F2F7]">
              <div className="flex items-center justify-between border-b border-[#D1D1D6] px-4 py-3">
                <span className="text-[13px] font-medium" style={{ color: iosBlue }}>
                  Cancel
                </span>
                <span className="text-[13px] font-semibold text-[#0B0B0C]">Add to Home Screen</span>
                <span className="relative text-[13px] font-bold" style={{ color: iosBlue }}>
                  {confirmVisible ? <span className="absolute -inset-2 animate-pulse rounded-full" style={{ backgroundColor: `${iosBlue}1A` }} aria-hidden /> : null}
                  <span className="relative">Add</span>
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-[#17624F] text-sm font-bold text-white">{initialsFromName(appName)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 border-b border-[#8E8E93] pb-1">
                    <span className="truncate text-[14px] font-medium text-[#0B0B0C]">{appName}</span>
                    <span className="h-3.5 w-px shrink-0 animate-pulse" style={{ backgroundColor: iosBlue }} aria-hidden />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-[#8A8A8E]">{siteLabel}</p>
                </div>
              </div>
              <p className="px-4 pb-3 text-[10.5px] leading-[1.4] text-[#6B6B70]">
                An icon will be added to your Home Screen so you can quickly access this website.
              </p>
            </div>
            <AutocompleteBar appName={appName} />
            <MiniKeyboard />
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

export function initialsFromName(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "A";
}

function ShareTarget({ label, color, icon }: { label: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1" role="img" aria-label={label}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
        {icon}
      </div>
    </div>
  );
}

function ActionRow({ icon, label, highlighted = false }: { icon: React.ReactNode; label: string; highlighted?: boolean }) {
  return (
    <div className={`relative flex items-center gap-3 rounded-[10px] px-2.5 transition-colors ${highlighted ? "bg-[#0B84FF]/10" : ""}`} style={{ height: rowHeight }}>
      {highlighted ? <span className="absolute -inset-0.5 animate-pulse rounded-[12px] ring-2 ring-[#0B84FF]/50" aria-hidden /> : null}
      <span className="text-[#1C1C1E]">{icon}</span>
      <span className="text-[13px] font-medium text-[#0B0B0C]">{label}</span>
    </div>
  );
}

function AutocompleteBar({ appName }: { appName: string }) {
  const words = [appName, "Nowhere", "Nowadays"];
  return (
    <div className="flex items-center justify-around border-t border-[#B7BAC2] bg-[#D2D5DB] py-1.5 text-[11px] text-[#1C1C1E]">
      {words.map((word, index) => (
        <span key={word} className="flex items-center gap-3">
          {index === 0 ? <span className="font-semibold">&ldquo;{word}&rdquo;</span> : <span>{word}</span>}
          {index < words.length - 1 ? <span className="h-3 w-px bg-[#B7BAC2]" aria-hidden /> : null}
        </span>
      ))}
    </div>
  );
}

function MiniKeyboard() {
  const rows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ];
  return (
    <div className="bg-[#D2D5DB] px-1 pb-2 pt-1.5">
      {rows.map((row, index) => (
        <div key={index} className="mb-[6px] flex justify-center gap-[3px]">
          {row.map((key) => (
            <span key={key} className="flex h-7 flex-1 max-w-[22px] items-center justify-center rounded-[4px] bg-white text-[10px] font-medium text-[#1C1C1E] shadow-[0_1px_0_rgba(0,0,0,0.25)]">
              {key}
            </span>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-[4px]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-[#A9ADB6] text-[10px] text-white">⇧</span>
        <span className="flex h-7 flex-1 items-center justify-center rounded-[4px] bg-white text-[9px] font-medium text-[#3C3C43]">space</span>
        <span className="flex h-7 w-11 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-semibold text-white" style={{ backgroundColor: iosBlue }}>
          done
        </span>
      </div>
    </div>
  );
}

function StatusGlyphs() {
  return (
    <span className="flex items-center gap-1">
      <svg viewBox="0 0 16 12" className="h-2.5 w-3.5" fill="#0B0B0C" aria-hidden>
        <rect x="0" y="7" width="2.4" height="5" rx="0.6" />
        <rect x="4" y="5" width="2.4" height="7" rx="0.6" />
        <rect x="8" y="3" width="2.4" height="9" rx="0.6" />
        <rect x="12" y="0" width="2.4" height="12" rx="0.6" />
      </svg>
      <svg viewBox="0 0 22 12" className="h-2.5 w-5" fill="none" stroke="#0B0B0C" strokeWidth="1.2" aria-hidden>
        <rect x="0.6" y="1" width="17.5" height="10" rx="2.6" />
        <rect x="2.2" y="2.6" width="14.3" height="6.8" rx="1.3" fill="#0B0B0C" stroke="none" />
        <rect x="19" y="4" width="2" height="4" rx="1" fill="#0B0B0C" stroke="none" />
      </svg>
    </span>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 6v5h-5" />
    </svg>
  );
}

function ChevronIcon({ direction, className, style }: { direction: "back" | "forward"; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={direction === "back" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function ShareIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7.5 7.5 12 3l4.5 4.5" />
      <rect x="5" y="11" width="14" height="9" rx="2" />
    </svg>
  );
}

function BookIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5Z" />
    </svg>
  );
}

function TabsIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="14" height="14" rx="4" />
      <path d="M7 21h11a3 3 0 0 0 3-3V7" />
    </svg>
  );
}

function AirDropIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M7.5 9.5a6.5 6.5 0 0 1 9 0" opacity="0.85" />
      <path d="M4.5 6.5a10.5 10.5 0 0 1 15 0" opacity="0.5" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 3C6.5 3 2 6.7 2 11.3c0 2.6 1.5 4.9 3.8 6.4-.2 1-.7 2.3-1.6 3.3 1.6-.2 3-.9 4.1-1.7 1.2.4 2.4.6 3.7.6 5.5 0 10-3.7 10-8.6C22 6.7 17.5 3 12 3Z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function ReadingListIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14v9l-2.5-1.5L9 12V3" />
      <path d="M18 9v9" />
      <path d="M14 13h8" />
    </svg>
  );
}

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 4h12v17l-6-4-6 4Z" />
    </svg>
  );
}

export function AddToHomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.9l-5.6 3.1 1.4-6.2-4.8-4.3 6.4-.6Z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
