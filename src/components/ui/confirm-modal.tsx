"use client";

import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { cn } from "@/lib/utils";

type ConfirmModalProps = {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/** Replaces window.confirm() for destructive/consequential actions, matching the app's
 * existing dialog visuals (see ApplicationConfirmActionModal / ConfirmStudentRescindModal). */
export function ConfirmModal({
  title,
  text,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, busy ? undefined : onCancel);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-lg font-semibold">{title}</h2>
        {text ? <p className="mt-2 text-sm leading-6 text-[#6B747B]">{text}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B] disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className={cn(
              "min-h-10 rounded-[10px] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50",
              tone === "danger" ? "bg-[#E25241]" : "bg-[#26323A]",
            )}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
