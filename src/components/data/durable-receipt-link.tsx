"use client";

import { useState } from "react";
import { loadCachedSession } from "@/lib/client-cache";
import { cn } from "@/lib/utils";

export function DurableReceiptLink({ programId, paymentId, className }: { programId: string; paymentId: string; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openReceipt() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const receiptWindow = window.open("about:blank", "_blank");
    if (receiptWindow) receiptWindow.opener = null;

    try {
      const token = (await loadCachedSession())?.access_token;
      if (!token) throw new Error("Sign in again to view this receipt.");
      const response = await fetch(`/api/programs/${programId}/finance/payments/${paymentId}/receipt`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Receipt unavailable.");
      if (receiptWindow) receiptWindow.location.replace(result.url);
      else window.location.assign(result.url);
    } catch (caught) {
      receiptWindow?.close();
      setError(caught instanceof Error ? caught.message : "Receipt unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" disabled={loading} onClick={(event) => { event.stopPropagation(); void openReceipt(); }} className={cn("font-semibold text-[#1769AA] underline decoration-[#1769AA]/50 underline-offset-2 hover:decoration-[#1769AA] disabled:opacity-60", className)}>
        {loading ? "Opening…" : "View receipt"}
      </button>
      {error ? <span role="status" className="mt-1 max-w-48 text-right text-[11px] font-medium text-[#B42318]">{error}</span> : null}
    </span>
  );
}
