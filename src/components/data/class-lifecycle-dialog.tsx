"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadCachedSession } from "@/lib/client-cache";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import type { ClassLifecycleAction, ClassLifecyclePlan } from "@/lib/programs/lifecycle-policy";
import type { Database } from "@/lib/supabase/types";

type Operation = Database["public"]["Tables"]["program_lifecycle_operations"]["Row"];
type Snapshot = { program: { title: string; lifecycle_status: string; publication_status: string; access_ends_at: string | null; schedule_timezone: string | null }; operations: Operation[] };
const nextClassAction = ({ program }: Snapshot): ClassLifecycleAction => program.access_ends_at || ["cancelled", "completed", "archived"].includes(program.lifecycle_status) ? "archive" : program.lifecycle_status === "paused" ? "resume" : "pause";

export function ClassLifecycleDialog({ programId, onClose, onUpdated }: { programId: string; onClose: () => void; onUpdated: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [action, setAction] = useState<ClassLifecycleAction>("pause");
  const [reason, setReason] = useState("");
  const [lastDay, setLastDay] = useState("now");
  const [preview, setPreview] = useState<{ plan: ClassLifecyclePlan; hash: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(modalRef, true, () => { if (!busy) onClose(); });
  useHideMobileChromeWhileMounted();
  const url = `/api/programs/${programId}/lifecycle`;

  async function request(body?: object) {
    const session = await loadCachedSession();
    if (!session) throw new Error("Please sign in again.");
    const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not update class.");
    return result;
  }

  useEffect(() => {
    let active = true;
    void request().then((result: Snapshot) => {
      if (!active) return;
      setSnapshot(result);
      setAction(nextClassAction(result));
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  async function review() {
    setBusy(true); setError(null); setNotice(null);
    try {
      setPreview(await request({ mode: "preview", action, reason, lastAccessDay: lastDay }));
      setConfirmed(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not review class."); }
    finally { setBusy(false); }
  }

  async function run(existingId?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const operationId = existingId || (await request({ mode: "start", action, reason, lastAccessDay: lastDay, hash: preview?.hash, confirm: confirmed })).operationId;
      setPreview(null);
      setConfirmed(false);
      let done = false;
      while (!done) {
        const result = await request({ mode: "continue", operationId });
        done = result.done;
        setProgress(done ? "Billing changes saved" : `Updated ${result.completed} of ${result.total} billing records`);
      }
      onUpdated();
      const updated: Snapshot = await request();
      setSnapshot(updated);
      setAction(nextClassAction(updated));
      setPreview(null);
      try {
        await request({ mode: "notify", operationId });
        setNotice(action === "archive" ? "Class archived. Historical records are retained." : "Class updated. Notifications have been processed.");
      } catch (e) { setError(e instanceof Error ? e.message : "Class updated. Notifications need retrying."); }
      setSnapshot(await request());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Class operation needs attention.");
      setSnapshot(await request().catch(() => snapshot));
    } finally { setBusy(false); setProgress(""); }
  }

  async function retryNotifications(id: string) {
    setBusy(true); setError(null);
    try { await request({ mode: "notify", operationId: id }); setSnapshot(await request()); setNotice("Notifications processed."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not send notifications."); }
    finally { setBusy(false); }
  }

  const unfinished = snapshot?.operations.find((op) => op.status === "processing");
  const unnotified = snapshot?.operations.find((op) => op.status !== "processing" && op.action !== "archive" && !op.notifications_sent_at);
  const archived = snapshot?.program.publication_status === "archived";
  const ending = Boolean(snapshot?.program.access_ends_at);
  const activeCount = preview?.plan.students.filter((s) => s.active).length ?? 0;
  const money = (amount: number, currency: string) => new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount / 100);

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/40 p-4 backdrop-blur-sm">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="class-lifecycle-title" tabIndex={-1} className="flex max-h-[calc(100svh-40px)] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] bg-white text-[#26323A] outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-[#E3E8EC] px-5 py-4">
          <div><h2 id="class-lifecycle-title" className="text-lg font-semibold">Class lifecycle</h2><p className="mt-1 text-sm text-[#6B747B]">{snapshot?.program.title || "Loading class…"}</p></div>
          <button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-full px-3 text-sm font-semibold disabled:opacity-40">Close</button>
        </header>
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
          {error ? <p role="alert" className="rounded-[12px] border border-[#E9C9C5] px-3 py-3 text-sm text-[#A22F25]">{error}</p> : null}
          {notice ? <p role="status" className="text-sm font-medium">{notice}</p> : null}
          {unfinished ? <section className="space-y-3"><h3 className="font-semibold">Update in progress</h3><p className="text-sm leading-6 text-[#52616A]">Applications are closed while this update is completed. {unfinished.completed_steps.length} billing steps are saved. Continuing will skip those steps.</p>{unfinished.last_error ? <p className="text-sm text-[#A22F25]">{unfinished.last_error}</p> : null}<button type="button" disabled={busy} onClick={() => void run(unfinished.id)} className="min-h-11 rounded-full bg-[#17624F] px-5 font-semibold text-white disabled:opacity-50">Continue</button></section> : null}
          {unnotified && !unfinished ? <div className="flex items-center justify-between gap-4 border-b border-[#E3E8EC] pb-4"><p className="text-sm text-[#52616A]">The class update is saved. Notifications need processing.</p><button type="button" disabled={busy} onClick={() => void retryNotifications(unnotified.id)} className="min-h-10 px-3 text-sm font-semibold text-[#17624F]">Retry</button></div> : null}
          {snapshot && !unfinished && !archived && !preview ? <>
            {ending ? <p className="text-sm leading-6">Future billing has stopped. Student access ends {new Date(snapshot.program.access_ends_at!).toLocaleString("en-CA", { timeZone: snapshot.program.schedule_timezone || "America/Edmonton" })}. Archive the class after access has ended.</p> : null}
            <label className="grid gap-2 text-sm font-semibold">Action<select value={action} disabled={busy} onChange={(e) => setAction(e.target.value as ClassLifecycleAction)} className="h-11 rounded-[10px] border border-[#B9C3C8] bg-white px-3">
              {!ending && !["cancelled", "completed"].includes(snapshot.program.lifecycle_status) ? <><option value={snapshot.program.lifecycle_status === "paused" ? "resume" : "pause"}>{snapshot.program.lifecycle_status === "paused" ? "Resume" : "Pause"}</option><option value="end">End</option></> : null}
              <option value="archive">Archive</option>
            </select></label>
            <p className="text-sm leading-6 text-[#52616A]">{action === "pause" ? "Pause teaching and monthly collection now. Enrollment stays active. Charges during the pause are skipped, and billing resumes on the existing cycle when you choose Resume. Already-paid time is not automatically refunded or extended. Annual plans need individual review first."
              : action === "resume" ? "Resume teaching and monthly collection. No catch-up invoice or immediate charge is created. Billing continues on each student's existing renewal date. Applications stay closed until you reopen them."
              : action === "end" ? "Stop all future recurring billing now. Choose when student access ends. Pending applications are closed. Any refunds must be reviewed and issued individually from the student file."
              : "Move this class into Archived after enrollment and billing are closed. Staff can still view historical student and financial records."}</p>
            {action === "end" ? <label className="grid gap-2 text-sm font-semibold">Student access<select value={lastDay === "now" ? "now" : "date"} disabled={busy} onChange={(e) => setLastDay(e.target.value === "now" ? "now" : new Date().toLocaleDateString("en-CA", { timeZone: snapshot.program.schedule_timezone || "America/Edmonton" }))} className="h-11 rounded-[10px] border border-[#B9C3C8] bg-white px-3"><option value="now">End immediately</option><option value="date">Keep access through a date</option></select>{lastDay !== "now" ? <input type="date" value={lastDay} disabled={busy} onChange={(e) => setLastDay(e.target.value)} className="h-11 rounded-[10px] border border-[#B9C3C8] px-3" /> : null}<span className="text-xs font-normal text-[#6B747B]">Dates use {snapshot.program.schedule_timezone || "America/Edmonton"}. Billing stops when confirmed.</span></label> : null}
            <label className="grid gap-2 text-sm font-semibold">Reason<textarea rows={3} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="rounded-[10px] border border-[#B9C3C8] px-3 py-2 font-normal" placeholder="Explain the update to families and staff." /></label>
          </> : null}
          {archived ? <p className="text-sm text-[#52616A]">This class is archived. Its student, payment, and attendance records have been retained.</p> : null}
          {preview ? <>
            <h3 className="font-semibold">Review {preview.plan.action}</h3>
            <p className="text-sm text-[#52616A]">{activeCount} enrolled students · {preview.plan.subscriptions.length} recurring subscriptions · {preview.plan.checkouts.length} open payment links · {preview.plan.pendingApplications} unfinished applications · {preview.plan.pendingWithdrawals} withdrawal requests</p>
            {preview.plan.blockers.length ? <div className="space-y-2 border-l-2 border-[#B83A2E] pl-3"><p className="text-sm font-semibold">Resolve before continuing</p>{preview.plan.blockers.map((message) => <p key={message} className="text-sm text-[#A22F25]">{message}</p>)}</div> : null}
            {preview.plan.warnings.map((message) => <p key={message} className="text-sm leading-6 text-[#845A1E]">{message}</p>)}
            <div className="divide-y divide-[#E3E8EC] border-y border-[#E3E8EC]">
              {preview.plan.students.filter((s) => s.active || preview.plan.subscriptions.some((sub) => sub.studentId === s.id)).map((student) => <div key={student.id} className="py-3"><p className="text-sm font-semibold">{student.name}</p>{student.parent ? <p className="mt-0.5 text-xs text-[#6B747B]">Parent: {student.parent}</p> : null}{preview.plan.subscriptions.filter((s) => s.studentId === student.id).map((sub) => <p key={sub.id} className="mt-1 text-xs leading-5 text-[#52616A]">{money(sub.amountCents, sub.currency)} / {sub.paymentType === "annual" ? "year" : "month"} · {sub.status}{sub.paused ? " · Collection paused" : ""}<br />Current period ends: {sub.periodEnd ? new Date(sub.periodEnd).toLocaleDateString("en-CA") : "Not available"}<br />{sub.stripeId}</p>)}{!preview.plan.subscriptions.some((s) => s.studentId === student.id) ? <p className="mt-1 text-xs text-[#6B747B]">No active recurring subscription</p> : null}</div>)}
            </div>
            {action === "end" ? <p className="text-sm leading-6">Billing stops on confirmation. Access ends {preview.plan.accessEndsAt ? new Date(preview.plan.accessEndsAt).toLocaleString("en-CA", { timeZone: snapshot?.program.schedule_timezone || "America/Edmonton" }) : "immediately"}. No automatic refunds are issued.</p> : null}
            {!preview.plan.blockers.length ? <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#17624F]" /><span>{action === "archive" ? "I reviewed the class records and confirm that enrollment and billing have been resolved." : "I reviewed the students, billing effects, and any refund decisions. Send this update to affected families using their notification preferences."}</span></label> : null}
          </> : null}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-[#E3E8EC] px-5 py-4">
          {progress ? <p role="status" className="mr-auto text-xs text-[#52616A]">{progress}</p> : null}
          {preview ? <><button type="button" disabled={busy} onClick={() => { setPreview(null); setConfirmed(false); }} className="min-h-11 px-3 text-sm font-semibold disabled:opacity-50">Back</button><button type="button" disabled={busy || !confirmed || Boolean(preview.plan.blockers.length)} onClick={() => void run()} className="min-h-11 rounded-full bg-[#17624F] px-5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Updating…" : "Confirm"}</button></> : snapshot && !unfinished && !archived ? <button type="button" disabled={busy || !reason.trim()} onClick={() => void review()} className="min-h-11 rounded-full bg-[#17624F] px-5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Reviewing…" : "Review"}</button> : null}
        </footer>
      </div>
    </div>, document.body,
  );
}
