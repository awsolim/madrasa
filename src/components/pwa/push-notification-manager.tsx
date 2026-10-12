"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loadCachedSession } from "@/lib/client-cache";

const reminderDelayMs = 7 * 24 * 60 * 60 * 1000;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const rawData = window.atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function reminderKey(userId: string) {
  return `madrasa:push-reminder:${userId}`;
}

function reminderDisabledKey(userId: string) {
  return `madrasa:push-reminder-disabled:${userId}`;
}

function reminderIsSnoozed(userId: string) {
  try {
    if (window.localStorage.getItem(reminderDisabledKey(userId)) === "true") return true;
    const remindedAt = Number(window.localStorage.getItem(reminderKey(userId)) ?? 0);
    return Number.isFinite(remindedAt) && Date.now() - remindedAt < reminderDelayMs;
  } catch {
    return false;
  }
}

function snoozeReminder(userId: string) {
  try {
    window.localStorage.setItem(reminderKey(userId), String(Date.now()));
  } catch {
    // The reminder can safely reappear next launch when storage is unavailable.
  }
}

async function saveSubscription(subscription: PushSubscription, accessToken: string) {
  const value = subscription.toJSON();
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ endpoint: value.endpoint, keys: value.keys, userAgent: navigator.userAgent }),
  });
  return response.ok;
}

export function PushNotificationManager({ settingsHref }: { settingsHref: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"enable" | "install" | "blocked" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doNotAskAgain, setDoNotAskAgain] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadCachedSession().then(async (session) => {
      if (cancelled || !session) return;
      setUserId(session.user.id);

      const iosNeedsInstall = isIos() && !isStandalone();
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (iosNeedsInstall) {
        if (!reminderIsSnoozed(session.user.id)) setMode("install");
        return;
      }
      if (!supported) return;

      if (Notification.permission === "denied") {
        if (!reminderIsSnoozed(session.user.id)) setMode("blocked");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;

        if (subscription && Notification.permission === "granted") {
          // The endpoint is unique. Saving it on every authenticated launch safely
          // transfers this installation to whichever account is currently signed in.
          await saveSubscription(subscription, session.access_token);
          return;
        }

        if (!reminderIsSnoozed(session.user.id)) setMode("enable");
      } catch {
        // A service-worker startup failure should not interfere with normal navigation.
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function remindLater() {
    if (userId) {
      if (doNotAskAgain) {
        try {
          window.localStorage.setItem(reminderDisabledKey(userId), "true");
        } catch {}
      } else {
        snoozeReminder(userId);
      }
    }
    setMode(null);
    setError(null);
  }

  async function enableNotifications() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMode(permission === "denied" ? "blocked" : "enable");
        setError(permission === "denied" ? "Notifications are blocked in this device's settings." : "Notification permission was not granted.");
        return;
      }

      const [session, configResponse] = await Promise.all([
        loadCachedSession(),
        fetch("/api/push/config", { cache: "no-store" }),
      ]);
      const config = (await configResponse.json().catch(() => ({}))) as { configured?: boolean; publicKey?: string | null };
      if (!session || !configResponse.ok || !config.configured || !config.publicKey) {
        setError("Notifications could not be enabled. Please try again from Account settings.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      if (!(await saveSubscription(subscription, session.access_token))) {
        setError("Notifications could not be saved. Please try again.");
        return;
      }

      try {
        window.localStorage.removeItem(reminderKey(session.user.id));
      } catch {}
      setMode(null);
    } catch {
      setError("Notifications could not be enabled on this device.");
    } finally {
      setBusy(false);
    }
  }

  if (!mode) return null;

  const installMode = mode === "install";
  const blockedMode = mode === "blocked";
  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#1C252B]/35 p-6 backdrop-blur-[2px]">
      <section role="alertdialog" aria-modal="true" aria-labelledby="push-reminder-title" aria-describedby="push-reminder-description" className="w-full max-w-[326px] overflow-hidden rounded-[22px] border border-white/70 bg-white/95 text-center text-[#26323A] shadow-[0_22px_65px_rgba(20,31,38,0.25)] backdrop-blur-xl">
        <div className="px-6 pb-5 pt-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F3EF] text-[#17624F]" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
          </div>
          <h2 id="push-reminder-title" className="mt-4 text-[17px] font-semibold leading-6">
            {installMode ? "Get important updates" : blockedMode ? "Notifications are blocked" : "Turn on notifications"}
          </h2>
          <p id="push-reminder-description" className="mt-1.5 text-[13px] leading-5 text-[#5F6B72]">
          {installMode
            ? "Install and open this app from your Home Screen to receive application, class, payment, note, and withdrawal updates."
            : blockedMode
              ? "Allow notifications for this app in your device settings so important class and account updates are not missed."
              : "Receive important application, class, payment, note, and withdrawal updates even when the app is closed."}
          </p>
          {error ? <p className="mt-3 rounded-xl bg-[#FCEDEC] px-3 py-2 text-xs font-medium leading-5 text-[#A5362B]">{error}</p> : null}
        </div>
        <div className="border-t border-[#DDE3E6]">
          {installMode || blockedMode ? (
            <Link href={`${settingsHref}?panel=${installMode ? "homescreen" : "notifications"}`} onClick={remindLater} className="flex min-h-12 w-full items-center justify-center px-4 text-[15px] font-semibold text-[#17624F] active:bg-[#F0F5F3]">
              {installMode ? "How to install" : "View instructions"}
            </Link>
          ) : (
            <button type="button" onClick={() => void enableNotifications()} disabled={busy} className="min-h-12 w-full px-4 text-[15px] font-semibold text-[#17624F] active:bg-[#F0F5F3] disabled:opacity-60">
              {busy ? "Enabling…" : "Enable notifications"}
            </button>
          )}
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 border-t border-[#DDE3E6] px-4 text-[13px] font-medium text-[#5F6B72]">
            <input
              type="checkbox"
              checked={doNotAskAgain}
              onChange={(event) => setDoNotAskAgain(event.target.checked)}
              className="h-4 w-4 accent-[#17624F]"
            />
            Don&apos;t ask me again
          </label>
          <button type="button" onClick={remindLater} className="min-h-12 w-full border-t border-[#DDE3E6] px-4 text-[15px] font-medium text-[#5F6B72] active:bg-[#F3F5F6]">
            {doNotAskAgain ? "Close" : "Remind me later"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
