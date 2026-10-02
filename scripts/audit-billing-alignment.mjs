import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-assiddiq-first-of-month");
const mosqueSlug = process.argv.find((arg) => arg.startsWith("--mosque="))?.split("=")[1]?.trim();
if (!mosqueSlug) throw new Error("Pass --mosque=<slug>.");
if (apply && !confirmed) throw new Error("Apply mode requires --confirm-assiddiq-first-of-month.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!url || !key || !stripeKey) throw new Error("Missing Supabase or Stripe credentials.");
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const stripe = new Stripe(stripeKey);
const useStripeConnect = process.env.STRIPE_CONNECT_PLATFORM === "true";

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(date);
  const value = (kind) => Number(parts.find((part) => part.type === kind)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function firstAtNineAfter(date, timeZone) {
  const current = localParts(date, timeZone);
  const desiredWallTime = Date.UTC(current.year, current.month, 1, 9);
  let instant = new Date(desiredWallTime);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = localParts(instant, timeZone);
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    instant = new Date(instant.getTime() + desiredWallTime - actualWallTime);
  }
  return instant;
}

const { data: mosque, error: mosqueError } = await supabase.from("mosques").select("id, name").eq("slug", mosqueSlug).maybeSingle();
if (mosqueError || !mosque) throw new Error(mosqueError?.message ?? `Masjid ${mosqueSlug} was not found.`);
const { data: programs, error: programsError } = await supabase.from("programs").select("id, title, monthly_billing_anchor, offers_monthly_payment, schedule_timezone").eq("mosque_id", mosque.id);
if (programsError) throw programsError;
const monthlyProgramIds = (programs ?? []).filter((program) => program.offers_monthly_payment).map((program) => program.id);
const { data: rows, error: rowsError } = monthlyProgramIds.length
  ? await supabase.from("program_subscriptions").select("id, program_id, student_profile_id, stripe_subscription_id, stripe_subscription_schedule_id, stripe_account_id, payment_type, status, cancel_at_period_end, current_period_start, current_period_end").in("program_id", monthlyProgramIds).eq("payment_type", "monthly").not("stripe_subscription_id", "is", null)
  : { data: [], error: null };
if (rowsError) throw rowsError;

const programById = new Map((programs ?? []).map((program) => [program.id, program]));
const aligned = [], changes = [], skipped = [], failures = [];
for (const row of rows ?? []) {
  const label = `${programById.get(row.program_id)?.title ?? row.program_id} / ${row.student_profile_id}`;
  try {
    const options = useStripeConnect && row.stripe_account_id ? { stripeAccount: row.stripe_account_id } : undefined;
    const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id, undefined, options);
    const scheduleId = row.stripe_subscription_schedule_id ?? (typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id) ?? null;
    const monthlyItems = subscription.items.data.filter((item) => item.price.recurring?.interval === "month");
    const ends = monthlyItems.map((item) => item.current_period_end).filter(Number.isFinite);
    if (monthlyItems.length !== subscription.items.data.length || !ends.length) { skipped.push({ label, reason: "Stripe subscription is not exclusively monthly." }); continue; }
    if (scheduleId) { skipped.push({ label, reason: `Managed by Stripe schedule ${scheduleId}.` }); continue; }
    if (!["active", "trialing"].includes(subscription.status) || subscription.cancel_at_period_end || row.cancel_at_period_end) { skipped.push({ label, reason: `Status is ${subscription.status}${subscription.cancel_at_period_end ? " and ending" : ""}.` }); continue; }
    const paidThrough = new Date(Math.max(...ends) * 1000);
    const timeZone = programById.get(row.program_id)?.schedule_timezone || "America/Edmonton";
    const stripeAlreadyAligned = localParts(paidThrough, timeZone).day === 1;
    const target = stripeAlreadyAligned ? paidThrough : firstAtNineAfter(paidThrough, timeZone);
    const originalPaidThrough = row.current_period_end ? new Date(row.current_period_end) : paidThrough;
    const localStatus = subscription.status === "trialing" ? "active" : subscription.status;
    const needsLocalSync = programById.get(row.program_id)?.monthly_billing_anchor !== "first_of_month" || row.status !== localStatus || !row.current_period_end || Math.abs(new Date(row.current_period_end).getTime() - target.getTime()) > 1000;
    if (stripeAlreadyAligned && !needsLocalSync) { aligned.push({ label, nextCharge: target.toISOString() }); continue; }
    changes.push({ label, subscriptionId: subscription.id, paidThrough: originalPaidThrough.toISOString(), nextCharge: target.toISOString(), freeBridgeDays: Math.max(0, Math.round((target.getTime() - originalPaidThrough.getTime()) / 86400000)), reconciliationOnly: stripeAlreadyAligned });
    if (!apply) continue;
    const updated = stripeAlreadyAligned ? subscription : await stripe.subscriptions.update(subscription.id, { trial_end: Math.floor(target.getTime() / 1000), proration_behavior: "none" }, options);
    const updatedStarts = updated.items.data.map((item) => item.current_period_start).filter(Number.isFinite);
    const updatedEnds = updated.items.data.map((item) => item.current_period_end).filter(Number.isFinite);
    const { error } = await supabase.rpc("finalize_first_of_month_subscription_alignment", {
      target_subscription_id: row.id,
      target_period_start: new Date(Math.min(...updatedStarts) * 1000).toISOString(),
      target_period_end: new Date(Math.max(...updatedEnds) * 1000).toISOString(),
      target_status: updated.status === "trialing" ? "active" : updated.status,
      target_paid_through: originalPaidThrough.toISOString(),
      target_next_charge: target.toISOString(),
    });
    if (error) throw error;
  } catch (error) { failures.push({ label, error: error instanceof Error ? error.message : JSON.stringify(error) }); }
}

if (apply && !failures.length && !skipped.length) {
  for (const program of programs ?? []) {
    if (!program.offers_monthly_payment || program.monthly_billing_anchor === "first_of_month") continue;
    const { error } = await supabase.rpc("set_program_first_of_month_after_alignment", { target_program_id: program.id });
    if (error) failures.push({ label: program.title, error: error.message });
  }
}
console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", mosque: mosque.name, programPolicies: (programs ?? []).map(({ title, monthly_billing_anchor, offers_monthly_payment }) => ({ title, monthlyBillingAnchor: monthly_billing_anchor, offersMonthlyPayment: offers_monthly_payment })), inspected: rows?.length ?? 0, alreadyAligned: aligned.length, proposedChanges: changes.length, changes, skipped, failures }, null, 2));
console.log(apply ? "Alignment finished; review all skipped records and failures." : "No Stripe or database records were changed.");
if (failures.length || (apply && skipped.length)) process.exitCode = 1;
