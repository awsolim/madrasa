"use client";

import { useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let captureInitialized = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function initInstallPromptCapture() {
  if (typeof window === "undefined" || captureInitialized) {
    return;
  }
  captureInitialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export async function promptInstall() {
  if (!deferredPrompt) {
    return null;
  }
  const prompt = deferredPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return deferredPrompt !== null;
}

function getServerSnapshot() {
  return false;
}

export function useDeferredInstallPrompt() {
  const available = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { available, promptInstall };
}

export function isStandalone() {
  if (typeof window === "undefined") {
    return false;
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

export function detectMobilePlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") {
    return "other";
  }
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    return "ios";
  }
  if (/Android/.test(ua)) {
    return "android";
  }
  return "other";
}
