"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type EditorToastState = { tone: "success" | "error"; message: string };

export const editorToastStorageKey = "tareeqah:editor-toast";

export function EditorToast({ toast, onClose }: { toast: EditorToastState | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timeout);
  }, [onClose, toast]);

  if (!toast || !mounted || typeof document === "undefined") {
    return null;
  }

  const isSuccess = toast.tone === "success";
  return createPortal(
    <div className="fixed left-1/2 top-4 w-[calc(100%-32px)] max-w-sm -translate-x-1/2" style={{ zIndex: 2147483647 }}>
      <div className={cn("flex min-h-12 items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_44px_rgba(38,50,58,0.20)]", isSuccess ? "bg-[#1D8B68]" : "bg-[#C83F31]")}>
        <span className="min-w-0 flex-1">{toast.message}</span>
        <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg leading-none text-white hover:bg-white/25" aria-label="Close notification">
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function queueEditorToast(toast: EditorToastState) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(editorToastStorageKey, JSON.stringify(toast));
}

export function readQueuedEditorToast() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(editorToastStorageKey);
    window.sessionStorage.removeItem(editorToastStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<EditorToastState>;
    if ((parsed.tone === "success" || parsed.tone === "error") && typeof parsed.message === "string" && parsed.message.trim()) {
      return { tone: parsed.tone, message: parsed.message };
    }
  } catch {
    window.sessionStorage.removeItem(editorToastStorageKey);
    return null;
  }
  return null;
}
