import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database, Json } from "@/lib/supabase/types";
import { getStripe, shouldUseStripeConnect } from "@/lib/stripe/server";
import { classAccessEndsAt, classBillingMutation, isClosedClass, type ClassLifecycleAction, type ClassLifecyclePlan } from "./lifecycle-policy";
import { sendProfileNotificationEmails } from "@/lib/email/notifications";
import { sendPushNotification } from "@/lib/push/send-push";
import { resolveRefundableCharge } from "@/lib/finance/refundable-charge";

type Client = SupabaseClient<Database>;
const options = (accountId: string | null) => shouldUseStripeConnect() && accountId ? { stripeAccount: accountId } : {};
const active = (status: string) => !["canceled", "incomplete_expired"].includes(status);
function checked<T extends { error: { message: string } | null }>(result: T): T {
  if (result.error) throw new Error(result.error.message);
  return result;
}
export const lifecyclePlanHash = (plan: ClassLifecyclePlan) => createHash("sha256").update(JSON.stringify(plan)).digest("hex");

export async function previewClassLifecycle(db: Client, programId: string, action: ClassLifecycleAction, lastAccessDay: string, reason: string) {
  const program = checked(await db.from("programs").select("*").eq("id", programId).single()).data!;
  const [enrollmentResult, subscriptionResult, requestResult, withdrawalResult, termsResult, linkResult] = await Promise.all([
    db.from("enrollments").select("student_profile_id,status", { count: "exact" }).eq("program_id", programId).order("id"),
    db.from("program_subscriptions").select("*", { count: "exact" }).eq("program_id", programId).order("id"),
    db.from("enrollment_requests").select("student_profile_id,parent_profile_id,status,admission_completed_at", { count: "exact" }).eq("program_id", programId).order("id"),
    db.from("withdrawal_requests").select("id").eq("program_id", programId).eq("status", "pending"),
    db.from("program_payment_terms").select("stripe_checkout_session_id,status", { count: "exact" }).eq("program_id", programId).order("id"),
    db.from("parent_child_links").select("child_profile_id,parent_profile_id").eq("mosque_id", program.mosque_id).order("id"),
  ]);
  for (const result of [enrollmentResult, subscriptionResult, requestResult, termsResult]) {
    checked(result);
    if (result.count !== result.data?.length) throw new Error("The class is too large for a complete billing review in one request. No changes were made.");
  }
  const enrollments = checked(enrollmentResult).data ?? [];
  const subscriptions = checked(subscriptionResult).data ?? [];
  const requests = checked(requestResult).data ?? [];
  const links = checked(linkResult).data ?? [];
  const ids = Array.from(new Set([...enrollments.map((e) => e.student_profile_id), ...subscriptions.map((s) => s.student_profile_id), ...requests.map((r) => r.student_profile_id)].filter((id): id is string => Boolean(id))));
  const parentIds = links.filter((link) => ids.includes(link.child_profile_id)).map((link) => link.parent_profile_id);
  const profiles = ids.length ? checked(await db.from("profiles").select("id,full_name,email").in("id", [...ids, ...parentIds])).data ?? [] : [];
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.full_name || profiles.find((p) => p.id === id)?.email || "Unlinked student";
  const students = ids.map((id) => ({ id, name: name(id), parent: parentIds.length ? links.filter((link) => link.child_profile_id === id).map((link) => name(link.parent_profile_id)).join(", ") || null : null, active: enrollments.some((e) => e.student_profile_id === id && e.status === "active") })).sort((a, b) => a.name.localeCompare(b.name));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const previousPause = action === "resume" ? checked(await db.from("program_lifecycle_operations").select("plan").eq("program_id", programId).eq("action", "pause").eq("status", "completed").order("created_at", { ascending: false }).limit(1)).data?.[0]?.plan as unknown as ClassLifecyclePlan | undefined : undefined;
  if (action === "resume" && !previousPause) blockers.push("This pause predates the managed class workflow. Review billing individually before resuming.");
  if (program.lifecycle_operation_id) blockers.push("A class operation is already in progress. Continue it before starting another.");
  if (action === "resume" && program.lifecycle_status !== "paused") blockers.push("Only paused classes can be resumed.");
  if (["pause", "resume"].includes(action) && (isClosedClass(program) || program.access_ends_at)) blockers.push("An ended or ending class cannot be paused or resumed.");
  if (action === "pause" && program.lifecycle_status === "paused") blockers.push("This class is already paused.");
  if (action === "end" && (program.access_ends_at || isClosedClass(program))) blockers.push("This class is already ending or ended.");
  if (action === "archive" && students.some((s) => s.active)) blockers.push("End the class and wait until student access has ended before archiving.");
  if (action === "archive" && (requests.some((r) => !r.admission_completed_at && ["pending", "waitlisted", "approved"].includes(r.status)) || (checked(withdrawalResult).data ?? []).length)) blockers.push("Resolve pending applications and withdrawals, or use End before archiving.");
  if (action === "archive" && program.publication_status === "archived") blockers.push("This class is already archived.");
  if (!reason.trim()) blockers.push("Enter a reason for the class update.");
  const liveSubscriptions: ClassLifecyclePlan["subscriptions"] = [];
  // Stripe is authoritative; inspect even locally canceled rows to catch drift.
  for (const row of subscriptions.filter((s) => s.stripe_subscription_id)) {
    const stripe = getStripe();
    const live = await stripe.subscriptions.retrieve(row.stripe_subscription_id!, {}, options(row.stripe_account_id));
    if (live.metadata.program_id && live.metadata.program_id !== programId) throw new Error("A Stripe subscription is linked to a different class. Resolve it before continuing.");
    if (!active(live.status)) continue;
    if (!row.student_profile_id) blockers.push(`Subscription ${live.id} is not linked to a student. Resolve it before continuing.`);
    const item = live.items.data[0];
    if (live.items.data.length !== 1 || item?.price.recurring?.usage_type !== "licensed") blockers.push(`${name(row.student_profile_id)} has a billing configuration that needs individual review.`);
    const paymentType = item?.price.recurring?.interval === "year" ? "annual" : item?.price.recurring?.interval === "month" ? "monthly" : "other";
    if (live.schedule) blockers.push(`${name(row.student_profile_id)} has a Stripe schedule. Review it individually before changing the class.`);
    if (action === "pause" && paymentType !== "monthly") blockers.push(`${name(row.student_profile_id)} has ${paymentType} billing. Resolve their paid coverage and renewal before pausing.`);
    if (["pause", "resume"].includes(action) && live.pause_collection && live.pause_collection.behavior !== "void") blockers.push(`${name(row.student_profile_id)} has a different payment pause policy. Review their invoices first.`);
    if (action === "resume" && !row.payment_paused && live.pause_collection) blockers.push(`${name(row.student_profile_id)} has a payment pause that was not recorded in the app.`);
    if (action === "archive") blockers.push(`${name(row.student_profile_id)} still has a recurring Stripe subscription.`);
    const invoices = await stripe.invoices.list({ subscription: live.id, limit: 100 }, options(row.stripe_account_id));
    if (invoices.has_more || invoices.data.some((invoice) => ["open", "draft"].includes(invoice.status ?? ""))) blockers.push(`${name(row.student_profile_id)} has open or draft invoices. Resolve them in Stripe first to avoid unexpected collection.`);
    const pendingItems = await stripe.invoiceItems.list({ customer: typeof live.customer === "string" ? live.customer : live.customer.id, pending: true, limit: 1 }, options(row.stripe_account_id));
    if (pendingItems.data.length) blockers.push(`${name(row.student_profile_id)}'s payer has pending invoice items. Review them in Stripe first.`);
    if (action === "end" && paymentType === "annual") warnings.push(`${name(row.student_profile_id)} has annual prepaid coverage. Review any refund separately before confirming.`);
    if (live.status !== "active") warnings.push(`${name(row.student_profile_id)}: subscription status is ${live.status}.`);
    const changeCollection = action === "resume" ? Boolean(previousPause?.subscriptions.some((sub) => sub.id === row.id && sub.changeCollection)) : !live.pause_collection;
    if (action === "resume" && live.pause_collection && !changeCollection) warnings.push(`${name(row.student_profile_id)} was individually paused before the class pause. Their billing will remain paused.`);
    liveSubscriptions.push({ id: row.id, studentId: row.student_profile_id || "", stripeId: live.id, accountId: row.stripe_account_id, status: live.status, paymentType, amountCents: (item?.price.unit_amount ?? 0) * (item?.quantity ?? 1), currency: live.currency, periodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null, paused: Boolean(live.pause_collection), changeCollection, cancelAt: live.cancel_at, cancelAtPeriodEnd: live.cancel_at_period_end });
  }
  // Expire every outstanding hosted checkout before changing class state.
  const checkouts: ClassLifecyclePlan["checkouts"] = [];
  for (const id of Array.from(new Set((checked(termsResult).data ?? []).map((t) => t.stripe_checkout_session_id).filter((id): id is string => Boolean(id))))) {
    const accountId = subscriptions.find((s) => s.stripe_checkout_session_id === id)?.stripe_account_id ?? null;
    const session = await getStripe().checkout.sessions.retrieve(id, {}, options(accountId));
    if (session.status === "open") checkouts.push({ id, accountId });
    if (session.status === "complete" && !["paid", "no_payment_required"].includes(session.payment_status)) blockers.push("A checkout payment is still processing. Wait for its outcome before continuing.");
  }
  if (action === "archive" && checkouts.length) blockers.push("Outstanding payment links must be closed through End class first.");
  const plan: ClassLifecyclePlan = {
    programId, title: program.title, action, reason: reason.trim().slice(0, 1000),
    accessEndsAt: action === "end" ? (lastAccessDay === "now" ? null : classAccessEndsAt(lastAccessDay, program.schedule_timezone || "America/Edmonton")) : null,
    blockers: Array.from(new Set(blockers)), warnings: Array.from(new Set(warnings)), students, subscriptions: liveSubscriptions,
    checkouts, pendingApplications: requests.filter((r) => !r.admission_completed_at && ["pending", "waitlisted", "approved"].includes(r.status)).length,
    pendingWithdrawals: (checked(withdrawalResult).data ?? []).length,
    recipients: [],
  };
  const affectedStudentIds = new Set([
    ...students.filter((s) => s.active).map((s) => s.id),
    ...liveSubscriptions.map((s) => s.studentId),
    ...requests.filter((r) => !r.admission_completed_at && ["pending", "approved", "waitlisted"].includes(r.status)).map((r) => r.student_profile_id),
  ]);
  plan.recipients = Array.from(new Set([
    ...affectedStudentIds,
    ...links.filter((l) => affectedStudentIds.has(l.child_profile_id)).map((l) => l.parent_profile_id),
    ...requests.filter((r) => affectedStudentIds.has(r.student_profile_id)).map((r) => r.parent_profile_id),
  ].filter((id): id is string => Boolean(id)))).sort();
  return { plan, hash: lifecyclePlanHash(plan) };
}

export async function processClassLifecycle(db: Client, operationId: string, programId: string) {
  const op = checked(await db.from("program_lifecycle_operations").select("*").eq("id", operationId).eq("program_id", programId).single()).data!;
  if (op.status !== "processing") return { done: true, operation: op };
  const lease = new Date(Date.now() + 120000).toISOString();
  const claim = checked(await db.from("program_lifecycle_operations").update({ lease_until: lease }).eq("id", op.id).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select("id"));
  if (!claim.data?.length) throw new Error("This operation is already running. Please wait a moment.");
  const plan = op.plan as unknown as ClassLifecyclePlan;
  const completed = [...op.completed_steps];
  try {
    const checkout = plan.checkouts.find((c) => !completed.includes(`checkout:${c.id}`));
    const row = plan.subscriptions.find((s) => !completed.includes(`subscription:${s.id}`));
    let step: string | null = null;
    if (checkout) {
      const live = await getStripe().checkout.sessions.retrieve(checkout.id, {}, options(checkout.accountId));
      if (live.status === "open") await getStripe().checkout.sessions.expire(checkout.id, {}, { ...options(checkout.accountId), idempotencyKey: `${op.id}:checkout:${checkout.id}` });
      // A completed checkout can have created a subscription after the preview.
      if (live.status === "complete") {
        const subscriptionId = typeof live.subscription === "string" ? live.subscription : live.subscription?.id;
        if (subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId, {}, options(checkout.accountId));
          if (active(subscription.status)) throw new Error(`Payment link ${live.id} completed during this update. Cancel its new subscription in Stripe and review/refund that payment before continuing.`);
        }
        if ((live.amount_total ?? 0) > 0) {
          const { charge } = await resolveRefundableCharge(getStripe(), {
            amount_cents: live.amount_total!, stripe_charge_id: null,
            stripe_invoice_id: typeof live.invoice === "string" ? live.invoice : live.invoice?.id ?? null,
            stripe_payment_intent_id: typeof live.payment_intent === "string" ? live.payment_intent : live.payment_intent?.id ?? null,
          }, options(checkout.accountId));
          if (!charge.refunded) throw new Error(`Payment link ${live.id} completed during this update. Fully refund that unexpected payment in Stripe before continuing.`);
        }
      }
      step = `checkout:${checkout.id}`;
    } else if (row) {
      let live: Stripe.Subscription = await getStripe().subscriptions.retrieve(row.stripeId, {}, options(row.accountId));
      if (active(live.status)) {
        if (live.schedule) throw new Error("A subscription now has a schedule. Review it in Stripe before continuing.");
        const requestOptions = { ...options(row.accountId), idempotencyKey: `${op.id}:${row.id}` };
        const mutation = classBillingMutation(plan.action, row.changeCollection, { status: live.status, paused: Boolean(live.pause_collection) });
        if (mutation.kind === "cancel") live = await getStripe().subscriptions.cancel(live.id, mutation.params, requestOptions);
        if (mutation.kind === "pause" || mutation.kind === "resume") live = await getStripe().subscriptions.update(live.id, mutation.params, requestOptions);
      }
      checked(await db.from("program_subscriptions").update({ status: live.status, payment_paused: Boolean(live.pause_collection), payment_paused_until: null, cancel_at_period_end: live.cancel_at_period_end, updated_at: new Date().toISOString() }).eq("id", row.id));
      step = `subscription:${row.id}`;
    }
    if (step) {
      completed.push(step);
      checked(await db.from("program_lifecycle_operations").update({ completed_steps: completed, last_error: null, lease_until: null }).eq("id", op.id));
      return { done: false, completed: completed.length, total: plan.subscriptions.length + plan.checkouts.length };
    }
    // Recheck local membership before finalizing; admission is locked meanwhile.
    for (const reviewed of plan.subscriptions) {
      const live = await getStripe().subscriptions.retrieve(reviewed.stripeId, {}, options(reviewed.accountId));
      if (plan.action === "end" && active(live.status)) throw new Error("A reviewed subscription is still active in Stripe. Review it before completing the class update.");
      if (active(live.status) && reviewed.changeCollection &&
        ((plan.action === "pause" && live.pause_collection?.behavior !== "void") ||
        (plan.action === "resume" && live.pause_collection))) throw new Error("Billing was changed in Stripe after this update. Review the affected subscription before continuing.");
    }
    const current = checked(await db.from("program_subscriptions").select("id,stripe_subscription_id,stripe_account_id,status").eq("program_id", programId)).data ?? [];
    for (const extra of current.filter((s) => s.stripe_subscription_id && !plan.subscriptions.some((p) => p.id === s.id))) {
      const live = await getStripe().subscriptions.retrieve(extra.stripe_subscription_id!, {}, options(extra.stripe_account_id));
      if (active(live.status)) throw new Error("An additional subscription appeared. Review it before completing this operation.");
      checked(await db.from("program_subscriptions").update({ status: live.status, updated_at: new Date().toISOString() }).eq("id", extra.id));
    }
    checked(await db.rpc("finish_program_lifecycle_operation", { p_operation_id: op.id }));
    checked(await db.rpc("finalize_ended_classes", {}));
    return { done: true, operation: checked(await db.from("program_lifecycle_operations").select("*").eq("id", op.id).single()).data };
  } catch (error) {
    await db.from("program_lifecycle_operations").update({ lease_until: null, last_error: error instanceof Error ? error.message : "Class operation failed." }).eq("id", op.id);
    throw error;
  }
}

export async function notifyClassLifecycle(db: Client, operationId: string) {
  const op = checked(await db.from("program_lifecycle_operations").select("*").eq("id", operationId).single()).data!;
  if (op.status === "processing" || op.notifications_sent_at) return;
  const plan = op.plan as unknown as ClassLifecyclePlan;
  if (plan.action === "archive") return;
  const claim = checked(await db.from("program_lifecycle_operations").update({ lease_until: new Date(Date.now() + 120000).toISOString() }).eq("id", op.id).is("notifications_sent_at", null).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select("id"));
  if (!claim.data?.length) return;
  try {
  const program = checked(await db.from("programs").select("mosque_id,schedule_timezone").eq("id", op.program_id).single()).data!;
  const mosque = checked(await db.from("mosques").select("slug").eq("id", program.mosque_id).single()).data!;
  const until = plan.accessEndsAt ? new Date(plan.accessEndsAt).toLocaleString("en-CA", { timeZone: program.schedule_timezone || "America/Edmonton", dateStyle: "medium", timeStyle: "short" }) : "now";
  const message = plan.action === "pause" ? `${plan.title} is paused. Monthly charges are suspended. Your enrollment and records are retained. ${plan.reason}`
    : plan.action === "resume" ? `${plan.title} has resumed. Recurring billing continues on your existing scheduled date. ${plan.reason}`
    : `${plan.title} is ending. Future recurring billing has stopped. Class access ends ${until}. Refunds, if applicable, are handled separately. ${plan.reason}`;
  const email = await sendProfileNotificationEmails(db, plan.recipients, { eventKey: `class-lifecycle:${op.id}`, category: "class_updates", subject: `${plan.title}: class update`, title: plan.title, message });
  const push = await sendPushNotification(db, { recipientProfileIds: plan.recipients, category: "class_updates", title: plan.title, body: message, url: `/m/${mosque.slug}/portal/classes`, tag: `class-lifecycle:${op.id}` });
  if (email.failed || (push.configured && push.failed)) throw new Error("Class updated, but some notifications failed. Reopen Class lifecycle to retry notifications.");
  checked(await db.from("program_lifecycle_operations").update({ notifications_sent_at: new Date().toISOString() }).eq("id", op.id));
  } finally {
    await db.from("program_lifecycle_operations").update({ lease_until: null }).eq("id", op.id);
  }
}

export function asPlanJson(plan: ClassLifecyclePlan) { return plan as unknown as Json; }
