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

function reminderIsSnoozed(userId: string) {
  try {
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
    if (userId) snoozeReminder(userId);
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
    <div className="fixed inset-0 z-[2147483647] flex items-end justify-center bg-[#26323A]/40 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-16 backdrop-blur-sm sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="push-reminder-title" className="w-full max-w-sm rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.24)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E7F7F1] text-xl" aria-hidden>🔔</div>
        <h2 id="push-reminder-title" className="mt-4 text-xl font-semibold">
          {installMode ? "Get important updates" : blockedMode ? "Notifications are blocked" : "Turn on notifications"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#59666E]">
          {installMode
            ? "Install and open this app from your Home Screen to receive application, class, payment, note, and withdrawal updates."
            : blockedMode
              ? "Allow notifications for this app in your device settings so important class and account updates are not missed."
              : "Receive important application, class, payment, note, and withdrawal updates even when the app is closed."}
        </p>
        {error ? <p className="mt-3 rounded-xl bg-[#FCEDEC] px-3 py-2 text-sm font-medium text-[#A5362B]">{error}</p> : null}
        <div className="mt-5 flex items-center gap-3">
          {installMode || blockedMode ? (
            <Link href={`${settingsHref}?panel=${installMode ? "homescreen" : "notifications"}`} onClick={remindLater} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#17624F] px-4 text-sm font-semibold text-white">
              {installMode ? "How to install" : "View instructions"}
            </Link>
          ) : (
            <button type="button" onClick={() => void enableNotifications()} disabled={busy} className="min-h-11 flex-1 rounded-full bg-[#17624F] px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Enabling…" : "Enable notifications"}
            </button>
          )}
          <button type="button" onClick={remindLater} className="min-h-11 px-2 text-sm font-semibold text-[#68747B]">Remind me later</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
