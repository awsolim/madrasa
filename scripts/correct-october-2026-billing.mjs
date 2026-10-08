import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-assiddiq-october-2026");
if (apply && !confirmed) throw new Error("Apply mode requires --confirm-assiddiq-october-2026.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!url || !key || !stripeKey) throw new Error("Missing Supabase or Stripe credentials.");

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const stripe = new Stripe(stripeKey);
const useConnect = process.env.STRIPE_CONNECT_PLATFORM === "true";
const correctionKey = "assiddiq_october_2026_calendar_month";
// This is a closed one-time correction cohort reviewed before October 7. New
// registrations follow the permanent prorated-opening-month policy and must never
// be swept into this historical correction merely because they paid a proration.
const reviewedSubscriptionIds = new Set([
  "sub_1UC7W9PwBs25qQGPoXP03O82", "sub_1UKyDWPwBs25qQGPKac4lrZz", "sub_1UBfJVPwBs25qQGPw5p0tGW4",
  "sub_1UKl5cPwBs25qQGPDcWQ1bSt", "sub_1UHoHmPwBs25qQGPmSu1fpe7", "sub_1UBDNpPwBs25qQGP61ny5YgH",
  "sub_1UJPwjPwBs25qQGPNvgIHgUV", "sub_1UJPxlPwBs25qQGPh6uc85rt", "sub_1UHoGXPwBs25qQGPt3qGxNXk",
  "sub_1UBfKMPwBs25qQGPeAY4QOTe", "sub_1UMDvdPwBs25qQGPrvvUrWIy", "sub_1UMTQyPwBs25qQGPMSUXHm4Y",
  "sub_1UMah7PwBs25qQGPZ9izFleh", "sub_1UMqnPPwBs25qQGPScg89Y2M", "sub_1UEygdPwBs25qQGPXJcZr793",
  "sub_1UMub2PwBs25qQGPOqjIhpPB", "sub_1UCNFSPwBs25qQGPQXMCzN0e", "sub_1UEyiHPwBs25qQGPtuEszlpE",
  "sub_1UKl6sPwBs25qQGPHeVJSdDW", "sub_1UMDuQPwBs25qQGPc6K9vIkI", "sub_1UMDwXPwBs25qQGPy3T7NTfG",
  "sub_1UMTRfPwBs25qQGPF59s07Cs",
]);

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour") };
}

function localFirstAtNine(year, monthIndex, timeZone) {
  const desired = Date.UTC(year, monthIndex, 1, 9);
  let instant = new Date(desired);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = localParts(instant, timeZone);
    const actualWall = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour);
    instant = new Date(instant.getTime() + desired - actualWall);
  }
  return instant;
}

const { data: mosque, error: mosqueError } = await db.from("mosques").select("id,name").eq("slug", "assiddiq").maybeSingle();
if (mosqueError || !mosque) throw new Error(mosqueError?.message ?? "Assiddiq was not found.");
const { data: programs, error: programsError } = await db.from("programs").select("id,title,schedule_timezone,monthly_billing_anchor").eq("mosque_id", mosque.id).eq("offers_monthly_payment", true);
if (programsError) throw programsError;
const programById = new Map((programs ?? []).map((program) => [program.id, program]));
const programIds = [...programById.keys()];
const { data: subscriptions, error: subscriptionsError } = programIds.length
  ? await db.from("program_subscriptions").select("id,program_id,student_profile_id,parent_profile_id,stripe_subscription_id,stripe_account_id,payment_type,amount_cents,currency,status,current_period_start,current_period_end").in("program_id", programIds).eq("payment_type", "monthly").not("stripe_subscription_id", "is", null)
  : { data: [], error: null };
if (subscriptionsError) throw subscriptionsError;
const profileIds = [...new Set((subscriptions ?? []).flatMap((row) => [row.student_profile_id, row.parent_profile_id]).filter(Boolean))];
const { data: profiles, error: profilesError } = profileIds.length ? await db.from("profiles").select("id,full_name,email").in("id", profileIds) : { data: [], error: null };
if (profilesError) throw profilesError;
const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
const { data: localPayments, error: localPaymentsError } = programIds.length
  ? await db
      .from("program_payments")
      .select("student_profile_id,amount_cents,paid_at,stripe_invoice_id,receipt_url")
      .in("program_id", programIds)
      .order("paid_at", { ascending: false })
  : { data: [], error: null };
if (localPaymentsError) throw localPaymentsError;
const { data: priorAudits, error: priorAuditsError } = programIds.length
  ? await db
      .from("program_finance_audit_events")
      .select("program_id,student_profile_id,metadata")
      .in("program_id", programIds)
      .eq("event_type", "october_2026_billing_correction")
  : { data: [], error: null };
if (priorAuditsError) throw priorAuditsError;
const completedAuditKeys = new Set(
  (priorAudits ?? [])
    .filter((event) => event.metadata?.billing_correction_key === correctionKey)
    .map((event) => `${event.program_id}:${event.student_profile_id}:${event.metadata?.stripe_subscription_id ?? ""}`),
);

const report = [];
for (const row of subscriptions ?? []) {
  const program = programById.get(row.program_id);
  const person = profileById.get(row.student_profile_id);
  const parent = row.parent_profile_id ? profileById.get(row.parent_profile_id) : null;
  const timeZone = program?.schedule_timezone || "America/Edmonton";
  const target = localFirstAtNine(2026, 10, timeZone); // November 1, monthIndex is zero-based.
  const options = useConnect && row.stripe_account_id ? { stripeAccount: row.stripe_account_id } : undefined;
  try {
    if (!reviewedSubscriptionIds.has(row.stripe_subscription_id)) {
      report.push({
        student: person?.full_name || person?.email || row.student_profile_id,
        parent: parent?.full_name || parent?.email || null,
        program: program?.title,
        action: "skip",
        reason: "Subscription began after the one-time correction cohort was closed; its legitimate first-month proration is preserved.",
      });
      continue;
    }
    const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id, undefined, options);
    if (!["active", "trialing"].includes(subscription.status) || subscription.cancel_at_period_end) {
      report.push({ student: person?.full_name || person?.email || row.student_profile_id, parent: parent?.full_name || parent?.email || null, program: program?.title, action: "skip", reason: `Subscription is ${subscription.status}${subscription.cancel_at_period_end ? " and ending" : ""}.` });
      continue;
    }
    const paidInvoices = [];
    for await (const invoice of stripe.invoices.list({ subscription: subscription.id, status: "paid", limit: 100 }, options)) {
      if (invoice.amount_paid > 0) paidInvoices.push(invoice);
    }
    const octoberInvoices = paidInvoices.filter((invoice) => {
      const paidAt = invoice.status_transitions.paid_at ?? invoice.created;
      const parts = localParts(new Date(paidAt * 1000), timeZone);
      return parts.year === 2026 && parts.month === 10;
    });
    const priorCorrection = paidInvoices.find((invoice) => invoice.metadata?.billing_correction_key === correctionKey);
    const ends = subscription.items.data.map((item) => item.current_period_end).filter(Number.isFinite);
    const currentNextCharge = subscription.trial_end ?? (ends.length ? Math.max(...ends) : null);
    const alignedToNovember = currentNextCharge ? Math.abs(currentNextCharge * 1000 - target.getTime()) < 60_000 : false;
    const amountCents = row.amount_cents ?? subscription.items.data[0]?.price.unit_amount ?? null;
    const octoberPaidAmountCents = octoberInvoices.reduce((sum, invoice) => sum + invoice.amount_paid, 0);
    const octoberBalanceCents = amountCents ? Math.max(0, amountCents - octoberPaidAmountCents) : null;
    const needsOctoberCharge = !priorCorrection && Boolean(octoberBalanceCents && octoberBalanceCents > 0);
    const auditKey = `${row.program_id}:${row.student_profile_id}:${subscription.id}`;
    const correctionAlreadyCompleted = completedAuditKeys.has(auditKey) && alignedToNovember;
    const entry = {
      student: person?.full_name || person?.email || row.student_profile_id,
      parent: parent?.full_name || parent?.email || null,
      payer: parent?.full_name || parent?.email || person?.full_name || person?.email || row.student_profile_id,
      program: program?.title,
      subscriptionId: subscription.id,
      approvedMonthlyCents: amountCents,
      octoberPaidInvoices: octoberInvoices.map((invoice) => invoice.id),
      octoberPaidAmountCents,
      currentNextCharge: currentNextCharge ? new Date(currentNextCharge * 1000).toISOString() : null,
      proposedNextCharge: target.toISOString(),
      proposedOctoberChargeCents: needsOctoberCharge ? octoberBalanceCents : 0,
      localPaymentHistory: (localPayments ?? [])
        .filter((payment) => payment.student_profile_id === row.student_profile_id)
        .map((payment) => ({
          amountCents: payment.amount_cents,
          paidAt: payment.paid_at,
          stripeInvoiceId: payment.stripe_invoice_id,
          receiptUrl: payment.receipt_url,
        })),
      action: correctionAlreadyCompleted
        ? "skip; correction already completed and audited"
        : `${needsOctoberCharge ? "collect October balance; " : "October paid in full; "}${alignedToNovember ? "anchor already aligned" : "align to November 1"}`,
    };
    report.push(entry);
    if (!apply) continue;
    if (correctionAlreadyCompleted) continue;
    if (!amountCents || amountCents < 50) throw new Error("Approved monthly amount is missing or invalid.");

    let correctionInvoice = priorCorrection ?? null;
    if (needsOctoberCharge) {
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      await stripe.invoiceItems.create({
        customer: customerId,
        subscription: subscription.id,
        amount: octoberBalanceCents,
        currency: row.currency || "cad",
        description: `${program?.title || "Program"} — October 2026 tuition`,
        metadata: { billing_correction_key: correctionKey, program_id: row.program_id, student_profile_id: row.student_profile_id },
      }, { ...options, idempotencyKey: `${correctionKey}:${subscription.id}:item` });
      const draft = await stripe.invoices.create({
        customer: customerId,
        subscription: subscription.id,
        collection_method: "charge_automatically",
        auto_advance: false,
        metadata: { billing_correction_key: correctionKey, program_id: row.program_id, student_profile_id: row.student_profile_id },
        description: `${program?.title || "Program"} — October 2026 tuition`,
      }, { ...options, idempotencyKey: `${correctionKey}:${subscription.id}:invoice` });
      const finalized = await stripe.invoices.finalizeInvoice(draft.id, {}, options);
      correctionInvoice = finalized.status === "paid" ? finalized : await stripe.invoices.pay(finalized.id, {}, options);
      if (correctionInvoice.status !== "paid") throw new Error(`October invoice ${correctionInvoice.id} is ${correctionInvoice.status}.`);
    }

    const updated = alignedToNovember ? subscription : await stripe.subscriptions.update(subscription.id, {
      trial_end: Math.floor(target.getTime() / 1000),
      proration_behavior: "none",
    }, options);
    const starts = updated.items.data.map((item) => item.current_period_start).filter(Number.isFinite);
    const updatedEnds = updated.items.data.map((item) => item.current_period_end).filter(Number.isFinite);
    const { error: finalizeError } = await db.rpc("finalize_first_of_month_subscription_alignment", {
      target_subscription_id: row.id,
      target_period_start: new Date(Math.min(...starts) * 1000).toISOString(),
      target_period_end: new Date(Math.max(...updatedEnds) * 1000).toISOString(),
      target_status: updated.status === "trialing" ? "active" : updated.status,
      target_paid_through: row.current_period_end,
      target_next_charge: target.toISOString(),
    });
    if (finalizeError) throw finalizeError;
    const { error: auditError } = await db.from("program_finance_audit_events").insert({
      program_id: row.program_id,
      student_profile_id: row.student_profile_id,
      actor_profile_id: null,
      event_type: "october_2026_billing_correction",
      summary: correctionInvoice ? "The remaining October 2026 tuition was charged and monthly billing was aligned to the first of the month." : "October 2026 was already paid in full; monthly billing was aligned to the first of the month.",
      metadata: { billing_correction_key: correctionKey, stripe_subscription_id: subscription.id, stripe_invoice_id: correctionInvoice?.id ?? octoberInvoices[0]?.id ?? null, next_charge: target.toISOString() },
    });
    if (auditError) throw auditError;
    completedAuditKeys.add(auditKey);
  } catch (error) {
    report.push({ student: person?.full_name || person?.email || row.student_profile_id, program: program?.title, action: "error", reason: error instanceof Error ? error.message : String(error) });
  }
}

const chargeRecords = report.filter((entry) => Number(entry.proposedOctoberChargeCents ?? 0) > 0);
console.log(JSON.stringify({
  mode: apply ? "APPLY" : "DRY_RUN",
  mosque: mosque.name,
  correctionKey,
  summary: {
    proposedChargeCount: chargeRecords.length,
    proposedChargeTotalCents: chargeRecords.reduce((sum, entry) => sum + Number(entry.proposedOctoberChargeCents ?? 0), 0),
    skippedCount: report.filter((entry) => entry.action === "skip").length,
    errorCount: report.filter((entry) => entry.action === "error").length,
  },
  records: report,
}, null, 2));
console.log(apply ? "Correction run finished. Review every error before retrying." : "No Stripe or database data was changed.");
if (report.some((entry) => entry.action === "error")) process.exitCode = 1;
