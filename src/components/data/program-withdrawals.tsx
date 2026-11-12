"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useWorkspacePathname, useWorkspaceRouter } from "@/components/layout/workspace-navigation";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { getCachedSessionSnapshot, loadCachedSession } from "@/lib/client-cache";
import { invalidatePrivateSnapshots, invalidateQueryPrefix, useCachedQuery } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Withdrawal = {
  id: string; studentId: string; studentName: string; parentName: string | null;
  requestedAt: string; reason: string | null; status: string;
  reviewedAt: string | null; reviewedBy: string | null; decisionNote: string | null;
  hasSubscription: boolean | null; paymentType: string | null;
  latestPaymentCents: number | null; currency: string | null;
};
type WithdrawalPage = {
  hasAccess: boolean; canRefund?: boolean; pendingCount: number;
  pendingStudentIds: string[]; total: number; requests: Withdrawal[];
  pendingRequestIds?: Record<string, string>; selectedRequest?: Withdrawal | null;
};

export function useProgramWithdrawals(programId: string, enabled: boolean, reviewed = false, offset = 0, requestId?: string | null) {
  const userId = getCachedSessionSnapshot()?.user.id;
  return useCachedQuery<WithdrawalPage>(enabled && userId ? `withdrawals:${programId}:${userId}:${reviewed}:${offset}:${requestId ?? ""}` : null, async () => {
    const { data, error } = await createSupabaseBrowserClient().rpc("get_program_withdrawals", {
      p_program_id: programId, p_reviewed: reviewed, p_offset: offset, ...(requestId ? { p_request_id: requestId } : {}),
    });
    if (error) throw error;
    return data as unknown as WithdrawalPage;
  }, { persist: false });
}

function invalidateWithdrawals(programId: string) {
  invalidatePrivateSnapshots(`students:`);
  invalidatePrivateSnapshots(`finances:`);
  invalidatePrivateSnapshots(`payment-history:${programId}:`);
  invalidatePrivateSnapshots(`student-activity:${programId}:`);
  for (const prefix of [`withdrawals:${programId}:`, "teacher-roster:", "teacher-programs:", "admin-programs:", "teacher-inbox:", `finance-transactions:${programId}:`]) invalidateQueryPrefix(prefix);
  window.dispatchEvent(new Event("tareeqah:notifications-changed"));
}

const dateLabel = (value: string) => new Date(value).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const moneyLabel = (amount: number, currency: string) => new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);

export function ProgramWithdrawals({ programId, programTitle, readOnly = false }: { programId: string; programTitle: string; readOnly?: boolean }) {
  const [reviewed, setReviewed] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [closedDeepLink, setClosedDeepLink] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const params = useSearchParams();
  const requestedId = params.get("requestId");
  const { data, error, refetch } = useProgramWithdrawals(programId, true, reviewed, offset, requestedId);
  const deepLinked = requestedId !== closedDeepLink ? data?.selectedRequest ?? data?.requests.find(item => item.id === requestedId) : null;
  const target = selected ?? deepLinked;
  function closeReview() { setSelected(null); setClosedDeepLink(requestedId); }

  return <section aria-label="Withdrawal requests" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-[#26323A]">Withdrawal requests</h2><p className="mt-1 text-sm text-[#657178]">Review requests to leave this class.</p></div>
      <div className="flex rounded-full bg-[#F1F5F6] p-1" aria-label="Withdrawal status">
        {([false, true] as const).map(value => <button key={String(value)} type="button" aria-pressed={reviewed === value} onClick={() => { setReviewed(value); setOffset(0); closeReview(); }} className={cn("min-h-9 rounded-full px-4 text-sm font-semibold", reviewed === value ? "bg-white text-[#17624F]" : "text-[#657178]")}>{value ? "Reviewed" : "Pending"}</button>)}
      </div>
    </div>
    {success ? <p role="status" className="text-sm font-semibold text-[#17624F]">{success}</p> : null}
    {error ? <div role="alert" className="text-sm text-[#B42318]">Could not load withdrawal requests. <button type="button" onClick={() => void refetch()} className="min-h-10 px-2 font-semibold underline">Retry</button></div> : !data ? <div className="min-h-36" aria-busy="true" aria-label="Loading withdrawal requests" /> : !data.hasAccess ? <p className="text-sm text-[#657178]">Enrollment-management permission is required to review withdrawals.</p> : <>
      <div className="divide-y divide-[#E3E8EC] rounded-[16px] border border-[#E3E8EC]">
        {data.requests.map(item => <button key={item.id} type="button" onClick={() => { setSuccess(null); setSelected(item); }} className="flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#F7FAF9]">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-[#26323A]">{item.studentName}</p>{item.parentName ? <p className="mt-1 break-words text-xs text-[#657178]">Parent: {item.parentName}</p> : null}<p className="mt-1 text-xs text-[#7B858C]">Submitted {dateLabel(item.requestedAt)}</p></div>
          <span className={cn("shrink-0 text-xs font-semibold", item.status === "pending" ? "text-[#B42318]" : "text-[#657178]")}>{item.status === "pending" ? "Review" : item.status === "approved" ? "Approved" : "Rejected"} <span aria-hidden="true">›</span></span>
        </button>)}
        {!data.requests.length ? <p className="px-4 py-10 text-center text-sm text-[#657178]">{reviewed ? "No reviewed withdrawal requests." : "No pending withdrawal requests."}</p> : null}
      </div>
      {data.total > 50 ? <div className="flex items-center justify-between text-sm text-[#657178]"><button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))} className="min-h-11 px-3 disabled:opacity-40">Previous</button><span>{offset + 1}–{Math.min(offset + 50, data.total)} of {data.total}</span><button type="button" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)} className="min-h-11 px-3 disabled:opacity-40">Next</button></div> : null}
    </>}
    {target ? <WithdrawalReview request={target} programTitle={programTitle} canRefund={Boolean(data?.canRefund)} readOnly={readOnly} onClose={closeReview} onReviewed={(status) => {
      closeReview(); setSuccess(status === "approved" ? "Withdrawal approved. Enrollment and future billing have ended." : "Withdrawal rejected. Enrollment and billing remain unchanged.");
      invalidateWithdrawals(programId);
    }} /> : null}
  </section>;
}

function WithdrawalReview({ request, programTitle, canRefund, readOnly, onClose, onReviewed }: {
  request: Withdrawal; programTitle: string; canRefund: boolean; readOnly: boolean;
  onClose: () => void; onReviewed: (status: "approved" | "rejected") => void;
}) {
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [refundEnabled, setRefundEnabled] = useState(false);
  const [refund, setRefund] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const close = () => { if (!inFlight.current) onClose(); };
  useModalFocusTrap(container, true, close);
  useHideMobileChromeWhileMounted();
  const refundCents = refundEnabled ? Math.round(Number(refund) * 100) : 0;
  const invalidRefund = refundEnabled && (!/^\d+(\.\d{1,2})?$/.test(refund) || refundCents <= 0 || refundCents > (request.latestPaymentCents ?? 0));

  async function submit() {
    if (!decision || inFlight.current || (decision === "approved" && invalidRefund)) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const token = (await loadCachedSession())?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/withdrawal-requests/review", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ withdrawalRequestId: request.id, status: decision, refundAmountCents: decision === "approved" ? refundCents : 0 }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not review this request.");
      onReviewed(decision);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not review this request."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return createPortal(<div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/40 p-4">
    <div ref={container} role="dialog" aria-modal="true" aria-labelledby="withdrawal-review-title" tabIndex={-1} className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-[20px] bg-white p-5 text-[#26323A] outline-none">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs text-[#657178]">{programTitle}</p><h2 id="withdrawal-review-title" className="mt-1 break-words text-xl font-semibold">{request.studentName}</h2><p className="mt-1 text-sm text-[#657178]">Withdrawal request</p></div><button type="button" aria-label="Close" disabled={busy} onClick={close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F6] text-xl text-[#52616A]">×</button></div>
      <dl className="mt-5 space-y-3 border-y border-[#E3E8EC] py-4 text-sm">
        {request.parentName ? <div><dt className="text-xs text-[#657178]">Parent</dt><dd className="mt-1 break-words font-semibold">{request.parentName}</dd></div> : null}
        <div><dt className="text-xs text-[#657178]">Submitted</dt><dd className="mt-1">{dateLabel(request.requestedAt)}</dd></div>
        <div><dt className="text-xs text-[#657178]">Reason</dt><dd className="mt-1 whitespace-pre-wrap">{request.reason?.trim() || "No reason provided."}</dd></div>
        {request.hasSubscription != null ? <div><dt className="text-xs text-[#657178]">Billing</dt><dd className="mt-1">{request.hasSubscription ? `Active ${request.paymentType === "annual" ? "annual" : "monthly"} subscription` : "No active recurring subscription"}</dd></div> : null}
        {request.reviewedAt ? <div><dt className="text-xs text-[#657178]">Reviewed</dt><dd className="mt-1">{dateLabel(request.reviewedAt)}{request.reviewedBy ? ` · Reviewed by ${request.reviewedBy}` : ""}</dd></div> : null}
        {request.decisionNote ? <div><dt className="text-xs text-[#657178]">Decision</dt><dd className="mt-1 whitespace-pre-wrap">{request.decisionNote}</dd></div> : null}
      </dl>
      {error ? <p role="alert" className="mt-4 text-sm text-[#B42318]">{error}</p> : null}
      {request.status === "pending" && !readOnly ? !decision ? <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDecision("rejected")} className="min-h-11 rounded-[10px] border border-[#CFD8DC] px-4 text-sm font-semibold">Reject</button><button type="button" onClick={() => setDecision("approved")} className="min-h-11 rounded-[10px] bg-[#17624F] px-4 text-sm font-semibold text-white">Approve</button></div> : <div className="mt-5 space-y-4">
        <p className="text-sm leading-6">{decision === "approved" ? "Approval ends enrollment and class access immediately, and cancels any active recurring subscription. No further recurring payments will be collected." : "Reject this withdrawal request? The student remains enrolled and their billing continues unchanged."}</p>
        {decision === "approved" ? <>
          {canRefund && (request.latestPaymentCents ?? 0) > 0 ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={refundEnabled} disabled={busy} onChange={event => setRefundEnabled(event.target.checked)} />Issue a refund</label> : null}
          {refundEnabled ? <label className="block text-sm">Refund amount ({(request.currency ?? "cad").toUpperCase()})<input value={refund} disabled={busy} onChange={event => setRefund(event.target.value)} inputMode="decimal" placeholder="0.00" className="mt-2 min-h-11 w-full rounded-[10px] border border-[#CFD8DC] px-3 outline-none focus:border-[#17624F]" /><span className="mt-2 block text-xs leading-5 text-[#657178]">Latest payment: {moneyLabel(request.latestPaymentCents ?? 0, request.currency ?? "cad")}. Refunds go to the original payment method. Any previous refunds reduce the available amount, which is verified before processing.</span></label> : <p className="text-sm text-[#657178]">No refund will be issued.</p>}
        </> : null}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setDecision(null); setError(null); }} className="min-h-11 px-4 text-sm font-semibold text-[#657178]">Back</button><button type="button" disabled={busy || (decision === "approved" && invalidRefund)} onClick={() => void submit()} className="min-h-11 rounded-[10px] bg-[#17624F] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Processing…" : decision === "approved" && refundEnabled ? "Approve and refund" : decision === "approved" ? "Approve withdrawal" : "Reject withdrawal"}</button></div>
      </div> : readOnly && request.status === "pending" ? <p className="mt-4 text-sm text-[#657178]">This class cannot be changed while archived or while a class operation is in progress.</p> : null}
    </div>
  </div>, document.body);
}

export function StudentWithdrawalNotice({ programId, studentId, onNavigate }: { programId: string; studentId: string; onNavigate: () => void }) {
  const { data } = useProgramWithdrawals(programId, true);
  const pathname = useWorkspacePathname();
  const router = useWorkspaceRouter();
  if (!data?.hasAccess || !data.pendingStudentIds.includes(studentId)) return null;
  const requestId = data.pendingRequestIds?.[studentId];
  const base = pathname.replace(/\/(students|finances)(?:\/.*)?$/, "/students");
  const href = `${base}?view=withdrawals${requestId ? `&requestId=${encodeURIComponent(requestId)}` : ""}`;
  return <div className="flex items-center justify-between gap-3 border-b border-[#E3E8EC] py-3 text-sm"><span className="font-semibold text-[#B42318]">Withdrawal pending</span><button type="button" onClick={() => { onNavigate(); router.push(href); }} className="min-h-10 px-2 font-semibold text-[#17624F] underline underline-offset-4">Review</button></div>;
}
