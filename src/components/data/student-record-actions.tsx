"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { cn } from "@/lib/utils";

export type StudentRecordAction = {
  id: string;
  label: string;
  description?: string;
  tone?: "default" | "positive" | "warning" | "danger";
};

export function StudentRecordActions({ actions, onSelect }: { actions: StudentRecordAction[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(panelRef, open, () => setOpen(false));

  if (!actions.length) return null;
  return (
    <>
      <div className="shrink-0 border-t border-[#E5EAED] bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 w-full rounded-[12px] bg-[#17624F] px-4 text-sm font-semibold text-white hover:bg-[#104C3E]">
          Actions
        </button>
      </div>
      {open ? createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-end justify-center bg-[#26323A]/35 backdrop-blur-sm sm:items-center sm:px-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full rounded-t-[24px] bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none sm:max-w-sm sm:rounded-[22px] sm:p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D6DCE0] sm:hidden" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Student actions</h3>
              <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-sm font-semibold text-[#6B747B]">Close</button>
            </div>
            <div className="mt-2 divide-y divide-[#EEF2F4]">
              {actions.map((action) => (
                <button key={action.id} type="button" onClick={() => { setOpen(false); onSelect(action.id); }} className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left">
                  <span><span className={cn("block text-sm font-semibold", action.tone === "danger" ? "text-[#C83F31]" : action.tone === "warning" ? "text-[#8A6418]" : action.tone === "positive" ? "text-[#17624F]" : "text-[#26323A]")}>{action.label}</span>{action.description ? <span className="mt-0.5 block text-xs leading-5 text-[#7B858C]">{action.description}</span> : null}</span>
                  <span aria-hidden className="text-[#9AA4AA]">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>, document.body) : null}
    </>
  );
}
