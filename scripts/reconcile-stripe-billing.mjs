import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const apply = process.argv.includes("--apply");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const webhookUrl = new URL("/api/stripe/webhook", process.env.NEXT_PUBLIC_APP_URL ?? "https://madrasa.ca").toString();

if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !webhookSecret) {
  throw new Error("Missing Supabase service role, Stripe secret, or Stripe webhook environment variables.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const stripe = new Stripe(stripeSecretKey);

function requireData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
}

function subscriptionIdFromSession(session) {
  return typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
}

function syntheticEvent(type, object) {
  return {
    id: `evt_reconcile_${type.replaceAll(".", "_")}_${object.id}`,
    object: "event",
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: true,
    pending_webhooks: 0,
    request: null,
    type,
  };
}

async function replay(type, object) {
  const payload = JSON.stringify(syntheticEvent(type, object));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
      "x-madrasa-reconciliation": "true",
    },
    body: payload,
  });
  if (!response.ok) {
    throw new Error(`${type} ${object.id} returned ${response.status}: ${await response.text()}`);
  }
}

const terms = requireData(
  await supabase
    .from("program_payment_terms")
    .select("id, program_id, student_profile_id, stripe_checkout_session_id, status")
    .not("stripe_checkout_session_id", "is", null),
  "Load payment terms",
).filter((term) => !["cancelled", "ended", "rejected"].includes(term.status));

const subscriptions = requireData(
  await supabase.from("program_subscriptions").select("program_id, student_profile_id, stripe_subscription_id"),
  "Load subscriptions",
);
const enrollments = requireData(
  await supabase.from("enrollments").select("program_id, student_profile_id, status").eq("status", "active"),
  "Load active enrollments",
);
const payments = requireData(
  await supabase.from("program_payments").select("stripe_invoice_id"),
  "Load payments",
);
const profileIds = [...new Set(terms.map((term) => term.student_profile_id).filter(Boolean))];
const profiles = profileIds.length
  ? requireData(await supabase.from("profiles").select("id, full_name, email").in("id", profileIds), "Load profiles")
  : [];
const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
const localSubscriptionKeys = new Set(subscriptions.map((row) => `${row.program_id}:${row.student_profile_id}`));
const localInvoiceIds = new Set(payments.map((row) => row.stripe_invoice_id).filter(Boolean));
const activeEnrollmentKeys = new Set(enrollments.map((row) => `${row.program_id}:${row.student_profile_id}`));

const missingSubscriptions = [];
const unresolvedActiveEnrollments = [];
const termsByEnrollment = Map.groupBy(
  terms.filter((term) => activeEnrollmentKeys.has(`${term.program_id}:${term.student_profile_id}`)),
  (term) => `${term.program_id}:${term.student_profile_id}`,
);
for (const enrollmentKey of activeEnrollmentKeys) {
  if (localSubscriptionKeys.has(enrollmentKey)) continue;
  const candidates = [];
  for (const term of termsByEnrollment.get(enrollmentKey) ?? []) {
    const session = await stripe.checkout.sessions.retrieve(term.stripe_checkout_session_id);
    if (session.status === "complete" && ["paid", "no_payment_required"].includes(session.payment_status)) {
      candidates.push({ term, session, subscriptionId: subscriptionIdFromSession(session) });
    }
  }
  candidates.sort((a, b) => b.session.created - a.session.created);
  if (candidates[0]) {
    missingSubscriptions.push(candidates[0]);
  } else {
    unresolvedActiveEnrollments.push(enrollmentKey);
  }
}

const subscriptionIds = new Set(subscriptions.map((row) => row.stripe_subscription_id).filter(Boolean));
for (const item of missingSubscriptions) {
  if (item.subscriptionId) subscriptionIds.add(item.subscriptionId);
}

const missingInvoices = [];
for (const subscriptionId of subscriptionIds) {
  for await (const invoice of stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 100 })) {
    if (invoice.amount_paid > 0 && !localInvoiceIds.has(invoice.id)) missingInvoices.push(invoice);
  }
}

console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Webhook: ${webhookUrl}`);
console.log(`Payment terms inspected: ${terms.length}`);
console.log(`Active enrollments inspected: ${activeEnrollmentKeys.size}`);
console.log(`Missing local subscriptions: ${missingSubscriptions.length}`);
for (const { term, session } of missingSubscriptions) {
  const profile = profileById.get(term.student_profile_id);
  console.log(`  - ${profile?.full_name || profile?.email || term.student_profile_id} (${session.id})`);
}
console.log(`Missing paid invoice records: ${missingInvoices.length}`);
for (const invoice of missingInvoices) console.log(`  - ${invoice.id} (${invoice.amount_paid} ${invoice.currency})`);
console.log(`Active enrollments without a completed checkout: ${unresolvedActiveEnrollments.length}`);
for (const key of unresolvedActiveEnrollments) console.log(`  - ${key}`);

if (!apply) {
  console.log("No data changed. Run with --apply after the updated webhook is deployed.");
  process.exit(0);
}

for (const { session } of missingSubscriptions) {
  await replay("checkout.session.completed", session);
  console.log(`Reconciled checkout ${session.id}`);
}
for (const invoice of missingInvoices) {
  await replay("invoice.paid", invoice);
  console.log(`Reconciled invoice ${invoice.id}`);
}
console.log("Reconciliation completed successfully.");
if (unresolvedActiveEnrollments.length) {
  console.warn(`${unresolvedActiveEnrollments.length} active enrollment(s) still require manual billing review; verified Stripe records were reconciled successfully.`);
}
