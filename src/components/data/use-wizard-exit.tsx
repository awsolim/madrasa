"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceRouter } from "@/components/layout/workspace-navigation";
import { queueEditorToast } from "@/components/data/editor-toast";
import { useModalFocusTrap } from "@/hooks/use-modal-behavior";

export function useWizardExit(slug: string, values: unknown) {
  const router = useWorkspaceRouter();
  const baseline = useRef<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const snapshot = JSON.stringify(values);
  const capture = () => { if (baseline.current === null) baseline.current = snapshot; };
  const leave = (discard: boolean) => {
    if (discard) queueEditorToast({ tone: "neutral", message: "Unsaved changes discarded. Saved details are unchanged." });
    router.push(`/m/${slug}/${window.location.pathname.includes("/admin/") ? "admin/programs" : "teacher/classes"}`);
  };
  useEffect(() => {
    const onBack = (event: Event) => {
      event.preventDefault();
      if (baseline.current !== null && baseline.current !== snapshot) setConfirm(true);
      else leave(false);
    };
    window.addEventListener("tareeqah:before-back", onBack);
    return () => window.removeEventListener("tareeqah:before-back", onBack);
  });
  useModalFocusTrap(modalRef, confirm, () => setConfirm(false));
  return {
    capture,
    requestExit: () => baseline.current !== null && baseline.current !== snapshot ? setConfirm(true) : leave(false),
    dialog: confirm ? createPortal(
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/40 p-5">
        <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="leave-wizard-title" className="w-full max-w-sm rounded-2xl bg-white p-6">
          <h2 id="leave-wizard-title" className="text-lg font-semibold">Discard unsaved changes?</h2>
          <p className="mt-2 text-sm text-[#52616A]">Your changes from this editing session won’t be saved.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="min-h-11 rounded-md border px-5 text-sm font-semibold text-[#17624F]" onClick={() => setConfirm(false)}>Keep editing</button>
            <button className="min-h-11 rounded-md bg-[#17624F] px-5 text-sm font-semibold text-white" onClick={() => leave(true)}>Discard changes</button>
          </div>
        </div>
      </div>, document.body) : null,
  };
}
