"use client";
import { loadStudentActivity, type StudentActivity } from "@/lib/student-activity";
import { createPortal } from "react-dom";
import type { StudentRecordAction } from "@/components/data/student-record-actions";
import { TransitionLink } from "@/components/layout/transition-link";
import { useWorkspacePathname as usePathname } from "@/components/layout/workspace-navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { friendlyErrorMessage } from "@/lib/errors";
import { invalidatePrivateSnapshots, loadPrivateSnapshot } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { downloadStudentHistory } from "@/lib/student-history-export";
import { formatCurrencyAmount, formatFullDate, formatPrice, formatShortDate, formatStudentDetailGender } from "@/lib/programs/display";



export function FinanceActionModal({
  row,
  action,
  program,
  onClose,
  onSuccess,
}: {
  row: FinanceEnrollmentRow;
  action: FinanceAction;
  program: Program;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const initialPriceCents =
    row.paymentTerms?.amount_cents ??
    row.subscription?.amount_cents ??
    row.request?.approved_price_monthly_cents ??
    row.request?.approved_price_annual_cents ??
    program.price_monthly_cents ??
    program.price_annual_cents ??
    0;
  const initialPrice = (initialPriceCents / 100).toFixed(2).replace(/\.00$/, "");
  const [price, setPrice] = useState(initialPrice);
  const initialBillingMode: PaymentType = row.paymentTerms?.payment_type === "pay_in_full" || row.paymentTerms?.payment_type === "annual" || row.subscription?.payment_type === "annual" ? "annual" : "monthly";
  const initialPaymentPlan: PaymentType | "waived" = row.paymentTerms?.payment_type === "waived" || row.subscription?.payment_waived ? "waived" : initialBillingMode;
  const [paymentPlan, setPaymentPlan] = useState<PaymentType | "waived">(initialPaymentPlan);
  const [note, setNote] = useState("");
  const [timing, setTiming] = useState<"period_end" | "immediate">("period_end");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const studentProfileId = row.enrollment.student_profile_id;
  const hasActiveSubscription = hasActiveRecurringSubscription(row.subscription);
  const paymentPlanChoices: Array<PaymentType | "waived"> = [
    ...(program.offers_monthly_payment ? ["monthly" as const] : []),
    ...(program.offers_annual_payment && (!hasActiveSubscription || program.is_ongoing) ? ["annual" as const] : []),
    "waived",
  ];
  const paymentPlanChanged = action === "change_price" && !checkoutUrl && (paymentPlan !== initialPaymentPlan || price.trim() !== initialPrice || Boolean(note.trim()));
  const liveSubscriptionChange = hasActiveSubscription && paymentPlanChanged;

  const modalTitle = action === "waive" || action === "change_price" ? "Manage Payment Plan" : "End Subscription";
  const modalText =
    action === "waive"
      ? "Choose the student's future payment arrangement."
      : action === "change_price"
        ? "Choose the student's future payment arrangement."
        : "This stops the Stripe subscription. It does not remove the student from the class.";

  async function handleWaive() {
    setBusy(true);
    setError(null);
    const result = await callFinanceAction(program.id, "waive", { studentProfileId, note: note.trim() || undefined });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  }

  async function handleChangePrice() {
    if (paymentPlan === "waived") {
      await handleWaive();
      return;
    }
    const amountCents = Math.round(parseFloat(price) * 100);
    if (!amountCents || Number.isNaN(amountCents) || amountCents < 50) {
      setError("Enter a valid price.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callFinanceAction<{ url: string | null; scheduled?: boolean }>(program.id, "change-price", {
      studentProfileId,
      amountCents,
      billingMode: paymentPlan,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    if (result.data.url) setCheckoutUrl(result.data.url);
    else onClose();
  }

  async function handleEndSubscription() {
    setBusy(true);
    setError(null);
    const result = await callFinanceAction(program.id, "end-subscription", { studentProfileId, timing });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
    onClose();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className={cn("max-h-[88vh] w-full max-w-md overflow-y-auto rounded-[28px] border-2 bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none transition-colors", liveSubscriptionChange ? "border-[#C83F31] bg-[#FFF9F8]" : "border-transparent")}>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
        <h2 className="mt-1 text-xl font-semibold">{modalTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">{row.student?.full_name || "Student"} - {modalText}</p>

        <div className="mt-5 grid gap-3">
          {action === "change_price" || action === "waive" ? (
            <div className="grid gap-3">
              {liveSubscriptionChange ? <div role="alert" className="rounded-[14px] border border-[#E7A59D] bg-[#FFF0EE] p-4 text-[#9F2D22]">
                <p className="text-sm font-bold">You are changing a live Stripe subscription</p>
                <p className="mt-1 text-xs leading-5">Saving will schedule these new payment terms in Stripe for the end of the student&apos;s current paid period. Existing payments will remain unchanged.</p>
              </div> : null}
              {hasActiveSubscription && !liveSubscriptionChange ? (
                <div className="rounded-[14px] border border-[#D8E7E2] bg-[#F1F8F5] p-3 text-xs leading-5 text-[#17624F]">
                  Changes take effect at the end of the current paid period. Existing payments remain unchanged.
                </div>
              ) : null}
              <div className="grid gap-2" role="radiogroup" aria-label="Payment plan">
                {paymentPlanChoices.map((mode) => (
                  <button key={mode} type="button" role="radio" aria-checked={paymentPlan === mode} disabled={busy || Boolean(checkoutUrl)} onClick={() => setPaymentPlan(mode)} className={cn("flex min-h-12 w-full items-center justify-between rounded-[12px] border px-4 text-left text-sm font-semibold transition-colors", paymentPlan === mode ? (liveSubscriptionChange ? "border-[#C83F31] bg-[#FFF0EE] text-[#9F2D22]" : "border-[#17624F] bg-[#EAF6F2] text-[#17624F]") : "border-[#D6DCE0] bg-white text-[#52616A] hover:bg-[#F7FAFB]")}>
                    <span>{mode === "waived" ? "Waive future payments" : paymentTypeLabel(mode, program)}</span>
                    <span className={cn("h-4 w-4 rounded-full border", paymentPlan === mode ? (liveSubscriptionChange ? "border-[5px] border-[#C83F31] bg-white" : "border-[5px] border-[#17624F] bg-white") : "border-[#AEB9BE]")} />
                  </button>
                ))}
              </div>
              {paymentPlan !== "waived" ? <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Price
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={busy || Boolean(checkoutUrl)}
                  inputMode="decimal"
                  className="h-11 rounded-[10px] border border-[#B9C3C8] px-3 text-sm font-semibold outline-none focus:border-[#2F8FB3] disabled:opacity-60"
                />
              </label> : null}
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">
                Internal note (optional)
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={busy || Boolean(checkoutUrl)}
                  placeholder="e.g. Sibling discount applied"
                  className="h-10 rounded-[10px] border border-[#B9C3C8] px-3 text-sm font-semibold normal-case tracking-normal text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:opacity-60"
                />
              </label>
              {checkoutUrl ? (
                <div className="rounded-[14px] border border-[#D6DCE0] bg-[#F8FAFB] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">New checkout link</p>
                  <p className="mt-1 break-all text-sm font-semibold text-[#26323A]">{checkoutUrl}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(checkoutUrl);
                      setCopied(true);
                    }}
                    className="mt-2 min-h-9 rounded-[10px] bg-[#17624F] px-3 text-xs font-semibold text-white"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-[#7B858C]">Share this link with the family directly - it is not emailed automatically.</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {action === "end_subscription" ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#D6DCE0]">
                {(
                  [
                    ["period_end", "End at period end"],
                    ["immediate", "End immediately"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    onClick={() => setTiming(value)}
                    className={cn("px-3 py-2 text-xs font-semibold disabled:opacity-60", timing === value ? "bg-[#17624F] text-white" : "bg-white text-[#52616A]")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleEndSubscription}
                className="min-h-10 rounded-[10px] bg-[#26323A] px-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {busy ? "Ending subscription..." : timing === "immediate" ? "End subscription now" : "End at period end"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs font-semibold text-[#C0392B]">{error ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]">Quit</button>
            {(action === "change_price" || action === "waive") && !checkoutUrl ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleChangePrice}
                className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {busy ? "Saving..." : paymentPlan === "waived" ? "Waive future payments" : hasActiveSubscription ? "Schedule plan change" : "Create checkout link"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}



export function FinanceDetailsDrawer({
  row,
  program,
  initialTab = "overview",
  canViewFinances = true,
  canManageEnrollments = true,
  childDialogOpen,
  onClose,
  onAction,
}: {
  row: FinanceEnrollmentRow;
  program: Program;
  initialTab?: "overview" | "history" | "finances" | "actions";
  canViewFinances?: boolean;
  canManageEnrollments?: boolean;
  childDialogOpen: boolean;
  onClose: () => void;
  onAction: (action: StudentFileAction) => void;
}) {
  const studentProfileId = row.enrollment.student_profile_id;
  const drawerPathname = usePathname();
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "finances" | "actions">(initialTab);
  const [trackNames, setTrackNames] = useState<string[]>([]);
  const [history, setHistory] = useState<FinanceChargeRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [studentEvents, setStudentEvents] = useState<StudentActivity[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, !childDialogOpen, onClose);
  useHideMobileChromeWhileMounted();

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (canViewFinances) {
        setHistoryLoading(true);
        setHistoryError(null);
        void callFinanceAction<{ charges: FinanceChargeRow[] }>(program.id, "payment-history", { studentProfileId }).then((result) => {
        if (cancelled) {
          return;
        }
        setHistoryLoading(false);
        if (!result.ok) {
          setHistoryError(result.error);
          return;
        }
        setHistory(result.data.charges ?? []);
        });
      } else setHistoryLoading(false);

      setEventsLoading(true);
      void loadStudentActivity(program.id, studentProfileId, canViewFinances ? "finance" : "application").then((events) => {
        if (!cancelled) { setStudentEvents(events); setEventsError(null); }
      }).catch(() => { if (!cancelled) setEventsError("Activity could not be loaded. Close and reopen to retry."); }).finally(() => { if (!cancelled) setEventsLoading(false); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [canViewFinances, program.id, studentProfileId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void Promise.all([
      supabase.from("enrollment_tracks").select("program_track_id").eq("enrollment_id", row.enrollment.id),
      supabase.from("program_tracks").select("id, name").eq("program_id", program.id),
    ]).then(([linksResult, tracksResult]) => {
      if (cancelled || linksResult.error || tracksResult.error) return;
      const selected = new Set((linksResult.data ?? []).map((link) => link.program_track_id));
      setTrackNames((tracksResult.data ?? []).filter((track) => selected.has(track.id)).map((track) => track.name));
    });
    return () => { cancelled = true; };
  }, [program.id, row.enrollment.id]);

  const checkoutLinkStatus = row.subscription?.status === "checkout_started" ? "Checkout sent, awaiting completion" : "No pending checkout";
  const recordActions: StudentRecordAction[] = [];
  if (canViewFinances) {
    recordActions.push(
      { id: "change_price", label: "Manage payment plan", description: "Change paid terms or waive future payments." },
    );
  }
  recordActions.push(
    { id: "add_note", label: "Add note", description: "Add an internal note to this class record." },
    { id: "download_history", label: "Download student history", description: "Export this student's permitted class history as a structured Excel report." },
  );
  if (canViewFinances && hasActiveRecurringSubscription(row.subscription)) recordActions.push({ id: "end_subscription", label: "End subscription", description: "Stop recurring billing while preserving payment history.", tone: "danger" });
  if (canManageEnrollments) recordActions.push({ id: "remove_student", label: "Remove from class", description: "End this enrollment while preserving the student's history.", tone: "danger" });

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex justify-end bg-[#26323A]/35 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-white text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <div className="flex items-center justify-between border-b border-[#EEF2F4] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
            <h2 className="mt-1 text-lg font-semibold">{row.student?.full_name || "Student"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F6] text-[#26323A] hover:bg-[#E3ECEF]">
            <XIcon />
          </button>
        </div>

        <div className="border-b border-[#E7ECEF] px-3 py-2">
          <div className="grid rounded-[12px] bg-[#F1F5F6] p-1" style={{ gridTemplateColumns: `repeat(${canViewFinances ? 4 : 3}, minmax(0, 1fr))` }} role="tablist" aria-label="Student file sections">
            {([['overview', 'Info'], ['history', 'History'], ...(canViewFinances ? [['finances', 'Finances'] as const] : []), ['actions', 'Actions']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} className={cn("min-h-9 rounded-[9px] px-2 text-xs font-semibold transition-colors", activeTab === id ? "bg-white text-[#17624F] shadow-sm" : "text-[#64727A]")}>{label}</button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {activeTab === "overview" ? <>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2 rounded-[16px] border border-[#E1E8EC] bg-[#FAFCFC] p-3">
              <FinanceRecordFact label="Age">{displayAge(row.student)}</FinanceRecordFact>
              <FinanceRecordFact label="Gender">{formatStudentDetailGender(row.student?.gender ?? null)}</FinanceRecordFact>
              {row.parent ? <div className="col-span-2 space-y-1 text-sm text-[#52616A]">
                {row.student?.email ? <p className="break-all">{row.student.email}</p> : null}
                {row.student?.phone_number ? <p>{row.student.phone_number}</p> : null}
              </div> : <>
                <FinanceRecordFact label="Email" valueClassName="break-all">{row.student?.email || "—"}</FinanceRecordFact>
                <FinanceRecordFact label="Phone">{row.student?.phone_number || "—"}</FinanceRecordFact>
              </>}
            </dl>
            {row.parent ? <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-[16px] border border-[#E1E8EC] bg-[#FAFCFC] p-4">
              <FinanceRecordFact label="Parent">{row.parent.full_name || "—"}</FinanceRecordFact>
              <FinanceRecordFact label="Parent phone">{row.parent.phone_number || "—"}</FinanceRecordFact>
              <FinanceRecordFact label="Parent email" className="col-span-2" valueClassName="break-words">{row.parent.email || "—"}</FinanceRecordFact>
            </dl> : null}
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-[16px] border border-[#E1E8EC] bg-[#FAFCFC] p-4">
              <FinanceRecordFact label="Class">{program.title}</FinanceRecordFact>
              <FinanceRecordFact label="Track">{trackNames.length ? trackNames.join(", ") : "General"}</FinanceRecordFact>
              <FinanceRecordFact label="Enrollment"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financeStatus(row))))}>{financeStatus(row)}</span></FinanceRecordFact>
              <FinanceRecordFact label="Enrolled">{formatFinanceDate(row.enrollment.created_at)}</FinanceRecordFact>
            </dl>
          </> : null}

          {activeTab === "history" ? <>
            {row.request ? <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-[16px] border border-[#E1E8EC] bg-[#FAFCFC] p-4">
              <FinanceRecordFact label="Application status">{titleCase(row.request.status)}</FinanceRecordFact>
              <FinanceRecordFact label="Submitted">{formatFinanceDate(row.request.requested_at)}</FinanceRecordFact>
              <FinanceRecordFact label="Payment choice">{titleCase(row.request.payment_type ?? "—")}</FinanceRecordFact>
              <FinanceRecordFact label="Reviewed">{row.request.reviewed_at ? formatFinanceDate(row.request.reviewed_at) : "—"}</FinanceRecordFact>
            </dl> : null}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-[#26323A]">Student History</h3>
              {eventsLoading ? <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">Loading history...</div> : eventsError ? <p role="alert" className="text-sm text-red-700">{eventsError}</p> : !studentEvents?.length ? <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">No history recorded yet.</div> : <div className="divide-y divide-[#EEF2F4]">{studentEvents.map((event) => <div key={event.id} className="py-3"><p className="text-sm font-semibold leading-5 text-[#26323A]">{event.summary}</p><div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#7B858C]"><span>{formatFinanceDate(event.created_at)}</span><span aria-hidden>·</span><span>{event.actor_name === "System" ? "Recorded automatically by the system" : `Performed by ${event.actor_name}`}</span></div>{event.context ? <p className="mt-1 text-xs font-medium text-[#52616A]">{event.context}</p> : null}</div>)}</div>}
            </section>
            <TransitionLink label="Attendance history" href={`${drawerPathname.replace(/\/finances$/, "")}/attendance?from=students&studentId=${encodeURIComponent(studentProfileId)}`} className="flex min-h-11 items-center justify-between rounded-[14px] border border-[#DDE6E9] bg-[#F7FAFB] px-4 text-sm font-semibold text-[#17624F]">
              <span>View attendance history</span><span aria-hidden="true">→</span>
            </TransitionLink>
          </> : null}

          {activeTab === "finances" ? <>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-[16px] border border-[#E1E8EC] bg-[#FAFCFC] p-4">
              <FinanceRecordFact label="Approved price">{financePrice(row, program)}</FinanceRecordFact>
              <FinanceRecordFact label="Payment plan">{financePaymentType(row, program)}</FinanceRecordFact>
              <FinanceRecordFact label="Payment status"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financePaymentStatus(row, program))))}>{financePaymentStatus(row, program)}</span></FinanceRecordFact>
              <FinanceRecordFact label="Subscription"><span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", programStatusBadgeToneClass(financeBadgeTone(financeSubscriptionStatus(row))))}>{financeSubscriptionStatus(row)}</span></FinanceRecordFact>
              <FinanceRecordFact label="Billing cycle">{row.paymentTerms ? financeBillingCycleLabel(row.paymentTerms, program) : "—"}</FinanceRecordFact>
              <FinanceRecordFact label="Current period">{financeCurrentPeriodLabel(row)}</FinanceRecordFact>
              <FinanceRecordFact label="Next billing">{financeNextBillingLabel(row)}</FinanceRecordFact>
              <FinanceRecordFact label="Checkout">{checkoutLinkStatus}</FinanceRecordFact>
            </dl>
            <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#26323A]">Payment History</h3>
            {historyLoading ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">Loading payment history...</div>
            ) : historyError ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#C0392B]">{historyError}</div>
            ) : !history?.length ? (
              <div className="rounded-[14px] border border-dashed border-[#D6DCE0] bg-[#F8FAFB] p-3 text-sm font-semibold text-[#6B747B]">No payments recorded yet.</div>
            ) : (
              <div className="divide-y divide-[#EEF2F4]">
                {history.map((charge) => (
                  <div key={charge.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#26323A]">{formatCurrencyAmount(charge.amountCents)}</p>
                      <span className="rounded-full bg-[#EAF8EF] px-2 py-0.5 text-xs font-semibold text-[#258A43]">Paid</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#7B858C]">
                      {formatFinanceDate(charge.createdAt)}
                      {charge.receiptUrl ? (
                        <>
                          {" - "}
                          <a href={charge.receiptUrl} target="_blank" rel="noreferrer" className="underline">
                            Receipt
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            )}
            </section>
          </> : null}

          {activeTab === "actions" ? <div className="divide-y divide-[#E7ECEF]">
            {recordActions.map((action) => <button key={action.id} type="button" onClick={() => { if (action.id === "download_history") { void downloadStudentHistory(program.id, studentProfileId, row.student?.full_name || "student").catch((error) => setEventsError(error instanceof Error ? error.message : "Could not download student history.")); return; } onAction(action.id as StudentFileAction); }} className={cn("group flex min-h-14 w-full items-center justify-between gap-4 rounded-[10px] px-2 text-left transition-colors hover:bg-[#F4F7F8] active:bg-[#EAF0F2]", action.tone === "danger" ? "text-[#B42318]" : action.tone === "warning" ? "text-[#8A5A12]" : "text-[#26323A]")}><span className="text-sm font-semibold">{action.label}</span><span aria-hidden="true" className="text-lg text-[#9AA6AC] transition-transform group-hover:translate-x-0.5">›</span></button>)}
          </div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}



export function FinanceAddNoteModal({
  row,
  program,
  onClose,
  onSuccess,
}: {
  row: FinanceEnrollmentRow;
  program: Program;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const text = note.trim();
    if (!text) {
      setError("Enter a note before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("Please sign in again to continue.");
      return;
    }
    const { error: insertError } = await supabase.from("program_finance_audit_events").insert({
      program_id: program.id,
      student_profile_id: row.enrollment.student_profile_id,
      actor_profile_id: user.id,
      event_type: "manual_note",
      summary: text,
      metadata: {},
    });
    setBusy(false);
    if (insertError) {
      setError(friendlyErrorMessage(insertError, "Could not save this note."));
      return;
    }
    onSuccess();
    onClose();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  useHideMobileChromeWhileMounted();
  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[28px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{program.title}</p>
        <h2 className="mt-1 text-xl font-semibold">Add Note</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B747B]">{row.student?.full_name || "Student"} - Internal note, visible only to Directors and Admins.</p>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
          rows={4}
          placeholder="e.g. Parent requested discount due to sibling enrollment."
          className="mt-4 w-full rounded-[14px] border border-[#B9C3C8] px-3 py-2 text-sm font-semibold outline-none focus:border-[#2F8FB3] disabled:opacity-60"
        />

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="flex-1 text-xs font-semibold text-[#C0392B]">{error ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]">Close</button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="min-h-10 rounded-[10px] bg-[#26323A] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save note"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}



type FinanceEnrollmentRow = {
  enrollment: Enrollment;
  student: StudentDisplay | null;
  parent: ParentDisplay | null;
  approver: Profile | null;
  request: EnrollmentRequest | null;
  subscription: ProgramSubscription | null;
  paymentTerms: ProgramPaymentTerms | null;
  paymentTermsHistory: ProgramPaymentTerms[];
};



type FinanceAction = "waive" | "change_price" | "end_subscription";


type Program = Database["public"]["Tables"]["programs"]["Row"];


type PaymentType = "monthly" | "annual";



function hasActiveRecurringSubscription(subscription: ProgramSubscription | null | undefined) {
  if (!subscription?.stripe_subscription_id) {
    return false;
  }
  const status = subscription.status?.toLowerCase();
  return !["canceled", "cancelled", "incomplete_expired"].includes(status);
}



async function callFinanceAction<T = Record<string, unknown>>(
  programId: string,
  endpoint: FinanceActionEndpoint,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, error: "Please sign in again to continue." };
  }

  const run = async () => {
    const response = await fetch(`/api/programs/${programId}/finance/${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not complete this request.");
    return result;
  };
  try {
    const data = endpoint === "payment-history"
      ? await loadPrivateSnapshot(`payment-history:${programId}:${payload.studentProfileId}:${sessionData.session!.user.id}`, run)
      : await run();
    if (endpoint !== "payment-history") {
      invalidatePrivateSnapshots(`payment-history:${programId}:`);
      invalidatePrivateSnapshots(`student-activity:${programId}:`);
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not load or update this record. Please try again." };
  }
}



export function paymentTypeLabel(type: PaymentType, program: Pick<Program, "is_ongoing">): string {
  if (type === "monthly") {
    return "Monthly";
  }
  return program.is_ongoing ? "Annual subscription" : "Pay in Full";
}


type StudentFileAction = FinanceAction | "add_note" | "remove_student";



type FinanceChargeRow = {
  id: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  receiptUrl: string | null;
  taxReceiptStatus: string;
  taxReceiptEligibleAmountCents: number | null;
  taxReceiptNumber: string | null;
};



function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}



function FinanceRecordFact({ label, children, valueClassName, className }: { label: string; children: ReactNode; valueClassName?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 text-left", className)}>
      <dt className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7B858C]">{label}</dt>
      <dd className={cn("mt-1 min-w-0 text-left text-sm font-semibold leading-5 text-[#26323A]", valueClassName)}>{children}</dd>
    </div>
  );
}



export function displayAge(profile: Pick<Profile, "date_of_birth" | "age"> | null | undefined) {
  const calculatedAge = calculateAge(profile?.date_of_birth ?? null);
  if (calculatedAge !== null) {
    return `${calculatedAge}`;
  }
  return profile?.age?.trim() || "Not provided";
}



export function programStatusBadgeToneClass(tone: "neutral" | "positive" | "warning" | "danger") {
  switch (tone) {
    case "positive":
      return "bg-[#E3F5EE] text-[#228763]";
    case "warning":
      return "bg-[#FFF7E6] text-[#8A5A00]";
    case "danger":
      return "bg-[#FDEDEA] text-[#C83F31]";
    default:
      return "bg-[#EEF3F5] text-[#52616A]";
  }
}



function financeBadgeTone(label: string): "neutral" | "positive" | "warning" | "danger" {
  const value = label.toLowerCase();
  if (["active", "paid"].includes(value)) {
    return "positive";
  }
  if (["paused", "ending", "awaiting payment", "checkout sent", "setup pending"].includes(value)) {
    return "warning";
  }
  if (["kicked", "past due", "payment failed", "needs billing decision"].includes(value)) {
    return "danger";
  }
  return "neutral";
}



function financeStatus(row: FinanceEnrollmentRow) {
  const status = row.enrollment.status || "active";
  if (status === "kicked") {
    return "Kicked";
  }
  if (status === "withdrawn") {
    return "Withdrawn";
  }
  return "Active";
}



export function formatFinanceDate(value: string | null | undefined) {
  return formatFullDate(value);
}



function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}



function financePrice(row: FinanceEnrollmentRow, program: Program | null) {
  if (hasCurrentPaymentBypass(row)) {
    return row.request?.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_waived) {
    return "Waived";
  }
  if (row.paymentTerms) {
    if (row.paymentTerms.payment_type === "free") {
      return "Free";
    }
    if (row.paymentTerms.payment_type === "waived") {
      return "Waived";
    }
    const amount = formatPrice(row.paymentTerms.amount_cents);
    return row.paymentTerms.payment_type === "monthly" ? `${amount}/month` : amount;
  }
  if ((row.subscription?.payment_type ?? row.request?.payment_type) === "annual") {
    return formatPrice(row.request?.approved_price_annual_cents ?? program?.price_annual_cents ?? null);
  }
  return formatPrice(row.request?.approved_price_monthly_cents ?? program?.price_monthly_cents ?? null);
}



function financePaymentType(row: FinanceEnrollmentRow, program: Program | null) {
  // Legacy waivers updated the reviewed application but did not supersede its
  // earlier paid terms. The explicit final review decision wins in that case.
  if (hasCurrentPaymentBypass(row)) {
    return row.request?.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_waived) {
    return "Waived";
  }
  if (row.paymentTerms) {
    if (row.paymentTerms.payment_type === "pay_in_full" || row.paymentTerms.payment_type === "annual") {
      return row.paymentTerms.payment_type === "annual" && program?.is_ongoing ? "Annual Subscription" : "Pay in Full";
    }
    if (row.paymentTerms.payment_type === "monthly") {
      return "Monthly";
    }
    if (row.paymentTerms.payment_type === "waived") {
      return "Waived";
    }
    return "Free";
  }
  if (!program?.is_paid) {
    return "Free";
  }
  return (row.subscription?.payment_type ?? row.request?.payment_type) === "annual" ? (program?.is_ongoing ? "Annual Subscription" : "Pay in Full") : "Monthly";
}



function financePaymentStatus(row: FinanceEnrollmentRow, program: Program | null) {
  if (hasCurrentPaymentBypass(row)) {
    return row.request?.payment_bypass_external ? "Paid Externally" : "Waived";
  }
  if (row.subscription?.payment_paused || row.subscription?.status === "paused") return "Paused";
  if (row.subscription?.status === "trialing") return "Trial — not charged";
  if (row.subscription?.status === "incomplete") return "Awaiting payment";
  if (row.subscription?.status === "checkout_started") return "Checkout sent";
  if (row.subscription?.payment_waived) {
    return "Waived";
  }
  if (row.paymentTerms) {
    const stripeStatus = row.subscription?.status?.toLowerCase();
    if (["monthly", "annual"].includes(row.paymentTerms.payment_type) && row.subscription?.stripe_subscription_id && hasActiveRecurringSubscription(row.subscription)) {
      if (stripeStatus === "past_due") {
        return "Past due";
      }
      if (stripeStatus === "unpaid") {
        return "Payment failed";
      }
      return "Paid";
    }
    switch (row.paymentTerms.status) {
      case "payment_required":
        return "Awaiting payment";
      case "checkout_pending":
        return "Checkout sent";
      case "active":
        if (row.paymentTerms.payment_type === "waived") return "Waived";
        if (row.subscription?.status === "trialing") return "Trial";
        if (row.subscription?.status === "active") return "Current";
        return ["monthly", "annual", "pay_in_full"].includes(row.paymentTerms.payment_type) ? "Registration completed" : "No payment required";
      case "paid":
        return "Paid";
      case "waived":
        return "Waived";
      case "past_due":
        return "Past due";
      case "failed":
        return "Payment failed";
      case "ended":
      case "cancelled":
      case "superseded":
        return "Ended";
      default:
        return "Needs billing decision";
    }
  }
  if (!program?.is_paid) {
    return "No payment required";
  }
  const stripeStatus = row.subscription?.status?.toLowerCase();
  if (stripeStatus === "past_due") {
    return "Past due";
  }
  if (stripeStatus === "unpaid") {
    return "Payment failed";
  }
  if (stripeStatus === "checkout_started") {
    return "Checkout sent";
  }
  if (row.subscription?.stripe_subscription_id && hasActiveRecurringSubscription(row.subscription)) {
    return "Paid";
  }
  if (row.subscription?.stripe_subscription_id) {
    return "Needs billing decision";
  }
  if (row.request?.approved_price_monthly_cents || row.request?.approved_price_annual_cents || program.price_monthly_cents || program.price_annual_cents) {
    return "Awaiting payment";
  }
  return "Needs billing decision";
}



function financeSubscriptionStatus(row: FinanceEnrollmentRow) {
  if (hasCurrentPaymentBypass(row) && !row.subscription?.stripe_subscription_id) {
    return "N/A";
  }
  if (row.subscription?.stripe_subscription_id) {
    const stripeStatus = row.subscription.status?.toLowerCase();
    if (stripeStatus === "incomplete" || stripeStatus === "checkout_started") return "Setup pending";
    if (stripeStatus === "trialing") return "Trial";
    if (stripeStatus === "paused") return "Paused";
    if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
      return "Past due";
    }
    if (!hasActiveRecurringSubscription(row.subscription)) {
      return "Ended";
    }
    if (row.subscription.payment_paused) {
      return "Paused";
    }
    return row.subscription.cancel_at_period_end ? "Ending" : "Active";
  }
  if (row.paymentTerms) {
    if (!["monthly", "annual"].includes(row.paymentTerms.payment_type)) {
      return "N/A";
    }
  }
  if (!row.subscription?.stripe_subscription_id) {
    const localStatus = row.subscription?.status?.toLowerCase();
    if (localStatus === "active") return "Active";
    if (localStatus === "trialing") return "Trial";
    if (localStatus === "past_due") return "Past due";
    if (localStatus === "unpaid") return "Unpaid";
    if (localStatus === "paid") return "Completed";
    if (localStatus === "checkout_started") return "Setup pending";
    if (row.paymentTerms?.status === "checkout_pending" || row.paymentTerms?.status === "payment_required") {
      return "Setup pending";
    }
    if (row.paymentTerms?.status === "past_due") {
      return "Past due";
    }
    if (row.paymentTerms?.status === "failed") {
      return "Payment failed";
    }
    if (row.paymentTerms && ["ended", "cancelled", "superseded"].includes(row.paymentTerms.status)) {
      return "Ended";
    }
    if (financeStatus(row) === "Active" && ["monthly", "annual"].includes(row.paymentTerms?.payment_type ?? "")) return "Active";
    return "N/A";
  }
  return "N/A";
}



function financeBillingCycleLabel(terms: ProgramPaymentTerms, program: Program | null) {
  if (!["monthly", "annual"].includes(terms.payment_type)) {
    return "Not applicable";
  }
  if (!program?.is_ongoing && terms.billing_end_behavior === "fixed_month_count" && terms.billing_months) {
    return `${terms.billing_months} month${terms.billing_months === 1 ? "" : "s"}`;
  }
  return "Ongoing until cancelled";
}



function financeCurrentPeriodLabel(row: FinanceEnrollmentRow) {
  if (!row.subscription?.stripe_subscription_id && row.paymentTerms?.current_period_start && row.paymentTerms.current_period_end) {
    return `${formatFinanceDate(row.paymentTerms.current_period_start)} – ${formatFinanceDate(row.paymentTerms.current_period_end)}`;
  }
  if (!row.subscription?.current_period_start || !row.subscription.current_period_end) {
    return "—";
  }
  return `${formatFinanceDate(row.subscription.current_period_start)} – ${formatFinanceDate(row.subscription.current_period_end)}`;
}



function financeNextBillingLabel(row: FinanceEnrollmentRow) {
  const subscription = row.subscription;
  if (row.paymentTerms && !["monthly", "annual"].includes(row.paymentTerms.payment_type)) {
    return row.paymentTerms.payment_type === "pay_in_full" ? "Paid once" : "—";
  }
  if (!subscription?.stripe_subscription_id || !hasActiveRecurringSubscription(subscription)) {
    if (row.paymentTerms?.current_period_end && ["ended", "cancelled"].includes(row.paymentTerms.status)) {
      return `Ended ${formatFinanceShortDate(row.paymentTerms.current_period_end)}`;
    }
    return "—";
  }
  if (subscription.payment_paused) {
    return subscription.payment_paused_until ? `Resumes ${formatFinanceShortDate(subscription.payment_paused_until)}` : "Paused indefinitely";
  }
  if (!subscription.current_period_end) {
    return "—";
  }
  return subscription.cancel_at_period_end ? `Ends on ${formatFinanceShortDate(subscription.current_period_end)}` : `Next billing: ${formatFinanceShortDate(subscription.current_period_end)}`;
}


type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];


type StudentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type">;


type ParentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url">;


type Profile = Database["public"]["Tables"]["profiles"]["Row"];


type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];


type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];


type ProgramPaymentTerms = Database["public"]["Tables"]["program_payment_terms"]["Row"];



export type FinanceActionEndpoint = "waive" | "change-price" | "end-subscription" | "payment-history";



function calculateAge(dateOfBirth: string | null) {
  if (!dateOfBirth) {
    return null;
  }
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}



export function hasCurrentPaymentBypass(row: FinanceEnrollmentRow) {
  if (!row.request?.payment_bypassed) return false;
  // A later billing decision supersedes the original waiver, while legacy waivers
  // made after old paid terms continue to take effect.
  return !row.paymentTerms || !row.request.reviewed_at || (row.paymentTerms.approved_at ?? row.paymentTerms.created_at) <= row.request.reviewed_at;
}


export function formatFinanceShortDate(value: string | null | undefined) {
  return formatShortDate(value);
}
