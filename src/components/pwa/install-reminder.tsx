"use client";

import Link from "@/components/layout/workspace-link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCachedMosqueChrome, getCachedSessionSnapshot, loadCachedSession, loadMosqueChrome, subscribeCachedSession } from "@/lib/client-cache";
import { detectMobilePlatform, isStandalone, useDeferredInstallPrompt } from "@/lib/pwa/install";
import { useModalFocusTrap } from "@/hooks/use-modal-behavior";

const shownKey = "madrasa:a2hs-nudge-shown";

export function InstallReminder({ slug, settingsHref }: { slug: string; settingsHref: string }) {
  const [session, setSession] = useState(getCachedSessionSnapshot);
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState(() => getCachedMosqueChrome(slug)?.name ?? "");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { available, promptInstall } = useDeferredInstallPrompt();
  useModalFocusTrap(dialogRef, visible && Boolean(session), () => setVisible(false));

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeCachedSession(setSession);
    void loadCachedSession().then((value) => { if (!cancelled) setSession(value); }).catch(() => {
      // Account recovery owns connection errors; onboarding must not block it.
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.user.id) { setVisible(false); return; }
    if (detectMobilePlatform() === "other" || isStandalone()) return;
    try {
      if (window.sessionStorage.getItem(shownKey) === "1") return;
      window.sessionStorage.setItem(shownKey, "1");
    } catch { return; }
    setVisible(true);
  }, [session?.user.id]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadMosqueChrome(slug).then((chrome) => {
      if (!cancelled && chrome?.name) setName(chrome.name);
    }).catch(() => { /* The generic app label remains usable offline. */ });
    const installed = () => setVisible(false);
    window.addEventListener("appinstalled", installed);
    return () => { cancelled = true; window.removeEventListener("appinstalled", installed); };
  }, [visible, slug]);

  async function install() {
    setBusy(true);
    try {
      const choice = await promptInstall();
      if (choice) setVisible(false);
    } catch {
      // Keep the manual instructions available when the browser cannot prompt.
    } finally { setBusy(false); }
  }

  if (!visible || !session) return null;
  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#1C252B]/35 p-6 backdrop-blur-[2px]">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="install-reminder-title" aria-describedby="install-reminder-description" tabIndex={-1} className="w-full max-w-[326px] overflow-hidden rounded-[22px] bg-white text-center text-[#26323A] shadow-[0_22px_65px_rgba(20,31,38,0.25)] outline-none">
        <div className="px-6 pb-5 pt-6">
          <h2 id="install-reminder-title" className="text-[17px] font-semibold leading-6">Add {name || "this app"} to your Home Screen</h2>
          <p id="install-reminder-description" className="mt-2 text-[13px] leading-5 text-[#5F6B72]">Open your classes directly from your Home Screen and enable device notifications.</p>
          {detectMobilePlatform() === "ios" ? <p className="mt-2 text-[13px] leading-5 text-[#5F6B72]">You may need to sign in again the first time you open the installed app.</p> : null}
        </div>
        {available ? <button type="button" disabled={busy} onClick={() => void install()} className="min-h-12 w-full border-t border-[#DDE3E6] px-4 text-[15px] font-semibold text-[#17624F] active:bg-[#F0F5F3] disabled:opacity-60">{busy ? "Installing…" : "Install"}</button> : null}
        <Link href={`${settingsHref}?panel=homescreen`} onClick={() => setVisible(false)} className="flex min-h-12 items-center justify-center border-t border-[#DDE3E6] px-4 text-[15px] font-semibold text-[#17624F] active:bg-[#F0F5F3]">How to install</Link>
        <button type="button" onClick={() => setVisible(false)} className="min-h-12 w-full border-t border-[#DDE3E6] px-4 text-[15px] font-medium text-[#5F6B72] active:bg-[#F3F5F6]">Not now</button>
      </div>
    </div>, document.body,
  );
}
