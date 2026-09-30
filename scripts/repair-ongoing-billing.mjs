import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const apply = process.argv.includes("--apply");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
  throw new Error("Missing Supabase URL, service role key, or Stripe secret key.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const stripe = new Stripe(stripeSecretKey);

function requireData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

function subscriptionPeriod(subscription) {
  const starts = subscription.items.data.map((item) => item.current_period_start).filter(Number.isFinite);
  const ends = subscription.items.data.map((item) => item.current_period_end).filter(Number.isFinite);
  return {
    start: starts.length ? new Date(Math.min(...starts) * 1000).toISOString() : null,
    end: ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null,
  };
}

const programs = requireData(
  await supabase.from("programs").select("id, title, billing_end_behavior, billing_duration_months, duration_months").eq("is_ongoing", true),
  "Load ongoing programs",
);
const programIds = programs.map((program) => program.id);
const subscriptions = programIds.length
  ? requireData(
      await supabase
        .from("program_subscriptions")
        .select("id, program_id, student_profile_id, payment_terms_id, stripe_subscription_id, stripe_subscription_schedule_id, billing_months, status")
        .in("program_id", programIds)
        .in("status", ["active", "trialing", "past_due", "paid"])
        .not("stripe_subscription_id", "is", null),
      "Load ongoing subscriptions",
    )
  : [];

console.log(`${apply ? "APPLY" : "DRY RUN"}: ${programs.length} ongoing programs, ${subscriptions.length} linked subscriptions.`);

const failures = [];
let releasedSchedules = 0;
let refreshedSubscriptions = 0;

for (const row of subscriptions) {
  const label = `${row.program_id}:${row.student_profile_id ?? row.id}`;
  try {
    let subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const scheduleId = row.stripe_subscription_schedule_id
      ?? (typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id)
      ?? null;

    if (scheduleId) {
      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
      if (["active", "not_started"].includes(schedule.status)) {
        console.log(`${apply ? "Release" : "Would release"} fixed schedule ${scheduleId} for ${label}.`);
        if (apply) {
          await stripe.subscriptionSchedules.release(scheduleId, { preserve_cancel_date: false });
          subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        }
        releasedSchedules += 1;
      }
    }

    const period = subscriptionPeriod(subscription);
    console.log(`${apply ? "Refresh" : "Would refresh"} ${label}: ${period.start ?? "unknown"} to ${period.end ?? "unknown"}.`);
    if (!apply) continue;

    const subscriptionUpdate = await supabase
      .from("program_subscriptions")
      .update({
        stripe_subscription_schedule_id: null,
        billing_months: null,
        current_period_start: period.start,
        current_period_end: period.end,
      })
      .eq("id", row.id);
    if (subscriptionUpdate.error) throw subscriptionUpdate.error;

    if (row.payment_terms_id) {
      const termsUpdate = await supabase
        .from("program_payment_terms")
        .update({
          stripe_subscription_schedule_id: null,
          billing_months: null,
          billing_end_behavior: "ongoing_until_cancelled",
          current_period_start: period.start,
          current_period_end: period.end,
        })
        .eq("id", row.payment_terms_id);
      if (termsUpdate.error) throw termsUpdate.error;
    }

    const auditInsert = await supabase.from("program_finance_audit_events").insert({
      program_id: row.program_id,
      student_profile_id: row.student_profile_id,
      actor_profile_id: null,
      event_type: "ongoing_billing_repaired",
      summary: "Corrected ongoing billing settings and refreshed the current period from Stripe.",
      metadata: { stripe_subscription_id: row.stripe_subscription_id, released_schedule_id: scheduleId },
    });
    if (auditInsert.error) throw auditInsert.error;
    refreshedSubscriptions += 1;
  } catch (error) {
    failures.push({ record: label, error: error instanceof Error ? error.message : String(error) });
  }
}

if (apply && programIds.length) {
  const result = await supabase
    .from("programs")
    .update({ billing_end_behavior: "manual_cancel", billing_duration_months: null, duration_months: null, end_date: null })
    .in("id", programIds);
  if (result.error) throw new Error(`Normalize ongoing programs: ${result.error.message}`);
}

console.log(JSON.stringify({ apply, programs: programs.length, subscriptions: subscriptions.length, releasedSchedules, refreshedSubscriptions, failures }, null, 2));
if (failures.length) process.exitCode = 1;
