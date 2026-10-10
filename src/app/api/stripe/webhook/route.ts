import Stripe from "stripe";
import { getStripe, getStripeWebhookSecret, shouldUseStripeConnect } from "@/lib/stripe/server";
import { finalizePaidEnrollment } from "@/lib/finance/finalize-paid-enrollment";
import { recordFinanceAuditEvent } from "@/lib/finance/audit";
import { resolveRefundableCharge } from "@/lib/finance/refundable-charge";
import { getProgramManagerProfileIds } from "@/lib/push/program-recipients";
import { sendPushNotification } from "@/lib/push/send-push";
import { logServerError } from "@/lib/monitoring/log-error";
import { insertProgramPayment } from "@/lib/finance/payments";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { getAppBaseUrl } from "@/lib/email/resend";
import { sendProfileNotificationEmails } from "@/lib/email/notifications";
import { monthlyBillingEndDate } from "@/lib/stripe/billing-anchor";

type ProgramPaymentTermsRow = Database["public"]["Tables"]["program_payment_terms"]["Row"];

async function ensureFixedDurationSchedule(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  terms: ProgramPaymentTermsRow | null,
  subscription: Stripe.Subscription | null,
  stripeAccountId: string | undefined,
) {
  const { data: program, error: programError } = terms
    ? await supabase.from("programs").select("is_ongoing").eq("id", terms.program_id).maybeSingle()
    : { data: null, error: null };
  if (programError) throw programError;
  if (
    !terms ||
    program?.is_ongoing ||
    terms.payment_type !== "monthly" ||
    terms.billing_end_behavior !== "fixed_month_count" ||
    !terms.billing_months ||
    terms.billing_months <= 0 ||
    !subscription?.id
  ) {
    return null;
  }
  if (terms.stripe_subscription_schedule_id) {
    return terms.stripe_subscription_schedule_id;
  }

  const stripeRequestOptions = shouldUseStripeConnect() && stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;
  const stripe = getStripe();
  const existingSchedule = typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id ?? null;
  const schedule = existingSchedule
    ? await stripe.subscriptionSchedules.retrieve(existingSchedule, undefined, stripeRequestOptions)
    : await stripe.subscriptionSchedules.create(
        { from_subscription: subscription.id },
        stripeRequestOptions,
      );

  const phase = schedule.phases[0];
  const items = (phase?.items ?? subscription.items.data).map((item) => ({
    price: typeof item.price === "string" ? item.price : item.price.id,
    quantity: item.quantity ?? 1,
  }));
  // A first-of-month anchor creates a short prorated opening period. Count that
  // as the first billing month, then end after the remaining full periods.
  const hasProratedOpeningPeriod = terms.monthly_billing_anchor === "first_of_month"
    && subscription.billing_cycle_anchor > subscription.start_date + 60;
  const alignedEndDate = hasProratedOpeningPeriod
    ? monthlyBillingEndDate(subscription.billing_cycle_anchor, terms.billing_months - 1, terms.monthly_billing_timezone)
    : null;

  const updatedSchedule = await stripe.subscriptionSchedules.update(
    schedule.id,
    {
      end_behavior: "cancel",
      phases: [
        {
          start_date: phase?.start_date ?? "now",
          items,
          ...(alignedEndDate ? { end_date: alignedEndDate } : { duration: { interval: "month" as const, interval_count: terms.billing_months } }),
          metadata: {
            payment_terms_id: terms.id,
            enrollment_request_id: terms.enrollment_request_id ?? "",
            program_id: terms.program_id,
            student_profile_id: terms.student_profile_id,
          },
        },
      ],
    },
    stripeRequestOptions,
  );

  const { error: scheduleTermsError } = await supabase
    .from("program_payment_terms")
    .update({
      stripe_subscription_schedule_id: updatedSchedule.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", terms.id);
  if (scheduleTermsError) throw scheduleTermsError;

  await recordFinanceAuditEvent(supabase, {
    programId: terms.program_id,
    studentProfileId: terms.student_profile_id,
    actorProfileId: null,
    eventType: "subscription_schedule_created",
    summary: `Subscription schedule created for ${terms.billing_months} monthly billing period${terms.billing_months === 1 ? "" : "s"}.`,
    metadata: {
      paymentTermsId: terms.id,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionScheduleId: updatedSchedule.id,
      billingMonths: terms.billing_months,
    },
  });

  return updatedSchedule.id;
}

async function notifyProgramManagers(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  programId: string,
  payload: { title: string; body: string; eventKey: string },
) {
  const { data: program } = await supabase
    .from("programs")
    .select("title, mosque_id, director_profile_id, teacher_profile_id")
    .eq("id", programId)
    .maybeSingle();
  if (!program) {
    return;
  }
  const { data: mosque } = await supabase.from("mosques").select("slug").eq("id", program.mosque_id).maybeSingle();
  if (!mosque) {
    return;
  }
  const managerIds = await getProgramManagerProfileIds(supabase, { id: programId, ...program });
  void sendPushNotification(supabase, {
    recipientProfileIds: managerIds,
    title: payload.title,
    body: payload.body,
    url: `/m/${mosque.slug}/teacher/inbox`,
  });
  await sendProfileNotificationEmails(supabase, managerIds, {
    eventKey: payload.eventKey,
    subject: `${payload.title}: ${program.title}`,
    title: payload.title,
    message: payload.body,
    action: { label: "Open Teacher Inbox", href: `${getAppBaseUrl()}/m/${mosque.slug}/teacher/inbox` },
  }).catch(() => null);
}

export const runtime = "nodejs";

function webhookErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  if (typeof error === "string") return error;
  return "Stripe webhook handling failed.";
}

function stripeTimestampToIso(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function getSubscriptionPeriod(subscription: Stripe.Subscription | null) {
  const item = subscription?.items.data[0];
  return {
    start: stripeTimestampToIso(item?.current_period_start),
    end: stripeTimestampToIso(item?.current_period_end),
  };
}

async function upsertPaidEnrollmentFromSession(
  session: Stripe.Checkout.Session,
  stripeAccountId: string | undefined,
  suppressNotifications = false,
) {
  const metadata = session.metadata ?? {};
  const enrollmentRequestId = metadata.enrollment_request_id;
  const mosqueId = metadata.mosque_id;
  const programId = metadata.program_id;
  const studentProfileId = metadata.student_profile_id;
  const parentProfileId = metadata.parent_profile_id || null;
  const paymentTermsId = metadata.payment_terms_id || null;
  const paymentType = metadata.payment_type === "annual" ? "annual" : "monthly";

  if (!enrollmentRequestId || !mosqueId || !programId || !studentProfileId) {
    throw new Error("Completed checkout is missing enrollment metadata.");
  }

  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    throw new Error(`Checkout ${session.id} completed without a valid payment status.`);
  }

  const supabase = createSupabaseServiceClient();
  const { data: paymentTerms, error: paymentTermsError } = paymentTermsId
    ? await supabase.from("program_payment_terms").select("*").eq("id", paymentTermsId).maybeSingle()
    : { data: null, error: null };
  if (paymentTermsError) throw paymentTermsError;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  // "annual" payment_type is ambiguous on its own — it can be a one-time pay_in_full charge
  // (fixed-duration program) or a genuine recurring yearly subscription (ongoing program).
  // Whether a Stripe subscription actually exists is the reliable signal for "recurring or not".
  const isOneTimePayment = !subscriptionId;
  let subscription: Stripe.Subscription | null = null;
  if (subscriptionId) {
    const stripeRequestOptions = shouldUseStripeConnect() && stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;
    subscription = await getStripe().subscriptions.retrieve(subscriptionId, undefined, stripeRequestOptions);
  }
  const scheduleId = await ensureFixedDurationSchedule(supabase, paymentTerms, subscription, stripeAccountId);
  const period = getSubscriptionPeriod(subscription);

  const { data: enrollmentRequest, error: enrollmentRequestError } = await supabase
    .from("enrollment_requests")
    .select("program_track_id, status")
    .eq("id", enrollmentRequestId)
    .maybeSingle();
  if (enrollmentRequestError) throw enrollmentRequestError;
  if (!enrollmentRequest || enrollmentRequest.status !== "approved") throw new Error("Checkout does not belong to an approved enrollment request.");

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const finalized = await finalizePaidEnrollment(supabase, {
    enrollmentRequestId, mosqueId, programId, studentProfileId, parentProfileId,
    paymentTermsId: paymentTerms?.id ?? null,
    stripeAccountId: stripeAccountId ?? metadata.stripe_account_id ?? null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionScheduleId: scheduleId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId,
    stripePriceId: subscription?.items.data[0]?.price.id ?? metadata.stripe_price_id ?? null,
    paymentType,
    amountCents: paymentTerms?.amount_cents ?? session.amount_total,
    billingMonths: paymentTerms?.billing_months ?? null,
    currency: paymentTerms?.currency ?? session.currency ?? "cad",
    status: subscription?.status ?? "paid",
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    isRecurring: !isOneTimePayment,
  });

  if (!subscriptionId) {
    // One-time payment (e.g. "Pay in Full" or a one-time change-price checkout) — no
    // subscription/invoice will follow, so this is the only place the charge is ever
    // visible to record it. Recurring payments are instead captured in handleInvoicePaid,
    // since Stripe also fires invoice.paid for a new subscription's first invoice.
    if (paymentIntentId) {
      const stripeRequestOptions = shouldUseStripeConnect() && stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;
      const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }, stripeRequestOptions);
      const charge = typeof paymentIntent.latest_charge === "string" ? null : paymentIntent.latest_charge;
      if (charge) {
        await insertProgramPayment(supabase, {
          mosqueId,
          programId,
          programSubscriptionId: finalized.subscriptionId,
          studentProfileId,
          parentProfileId,
          stripeChargeId: charge.id,
          stripePaymentIntentId: paymentIntentId,
          paymentTermsId: paymentTerms?.id ?? null,
          amountCents: charge.amount,
          currency: charge.currency,
          paidAt: new Date(charge.created * 1000).toISOString(),
          receiptUrl: charge.receipt_url,
        });
      }
    }
  }

  const { data: student } = await supabase.from("profiles").select("full_name, email").eq("id", studentProfileId).maybeSingle();
  const studentLabel = student?.full_name || student?.email || "this student";
  if (!suppressNotifications) {
    await recordFinanceAuditEvent(supabase, {
      programId,
      studentProfileId,
      actorProfileId: null,
      eventType: isOneTimePayment ? "payment_completed" : "subscription_started",
      summary:
        isOneTimePayment
          ? `Payment completed and enrollment activated for ${studentLabel}.`
          : `Subscription started and enrollment activated for ${studentLabel}.`,
      metadata: { stripeSubscriptionId: subscriptionId, stripeCheckoutSessionId: session.id },
    });

    await notifyProgramManagers(supabase, programId, {
      eventKey: `stripe-checkout:${session.id}`,
      title: "Payment received",
      body: isOneTimePayment ? `${studentLabel} completed payment and enrollment is active.` : `${studentLabel} started a subscription and enrollment is active.`,
    });
  }
}

async function updateSubscription(subscription: Stripe.Subscription, stripeAccountId: string | undefined) {
  const metadata = subscription.metadata ?? {};
  const supabase = createSupabaseServiceClient();
  const period = getSubscriptionPeriod(subscription);
  const scheduleId = typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id ?? null;

  const { error: subscriptionUpdateError } = await supabase
    .from("program_subscriptions")
    .update({
      // A temporary Stripe trial is used only as the no-charge bridge to the newly
      // aligned billing date. Enrollment remains active in Madrasa throughout it.
      status: subscription.status === "trialing" ? "active" : subscription.status,
      stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripe_price_id: subscription.items.data[0]?.price.id ?? null,
      stripe_subscription_schedule_id: scheduleId,
      current_period_start: period.start,
      current_period_end: period.end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      payment_paused: Boolean(subscription.pause_collection),
      payment_paused_until: stripeTimestampToIso(subscription.pause_collection?.resumes_at),
      stripe_account_id: stripeAccountId ?? metadata.stripe_account_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
  if (subscriptionUpdateError) throw subscriptionUpdateError;

  const termsId = metadata.payment_terms_id;
  if (termsId) {
    const { error: termsUpdateError } = await supabase
      .from("program_payment_terms")
      .update({
        status: subscription.status === "past_due" ? "past_due" : subscription.status === "canceled" ? "ended" : "active",
        stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        stripe_subscription_id: subscription.id,
        stripe_subscription_schedule_id: scheduleId,
        current_period_start: period.start,
        current_period_end: period.end,
        updated_at: new Date().toISOString(),
      })
      .eq("id", termsId);
    if (termsUpdateError) throw termsUpdateError;
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice, stripeAccountId: string | undefined, suppressNotifications = false) {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription ?? null;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id ?? null;
  if (!subscriptionId) {
    return;
  }
  const supabase = createSupabaseServiceClient();
  const { data: subscriptionRow, error: subscriptionLookupError } = await supabase
    .from("program_subscriptions")
    .select("id, mosque_id, program_id, student_profile_id, parent_profile_id, payment_terms_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (subscriptionLookupError) throw subscriptionLookupError;
  if (!subscriptionRow?.program_id || !subscriptionRow.student_profile_id) {
    // Stripe does not guarantee that checkout.session.completed arrives before the
    // first invoice.paid event. A 2xx response here would permanently discard the
    // payment because Stripe would consider it handled. Ask Stripe to retry only
    // for Madrasa-owned subscriptions; unrelated account invoices remain ignored.
    const metadata = invoice.parent?.subscription_details?.metadata ?? {};
    if (metadata.program_id && metadata.student_profile_id) {
      throw new Error(`Subscription ${subscriptionId} is not available locally yet. Retry this invoice after checkout completion.`);
    }
    return;
  }
  const stripeRequestOptions = shouldUseStripeConnect() && stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;
  const stripeSubscription = await getStripe().subscriptions.retrieve(subscriptionId, undefined, stripeRequestOptions);
  const subscriptionPeriod = getSubscriptionPeriod(stripeSubscription);

  const { error: periodUpdateError } = await supabase
    .from("program_subscriptions")
    .update({
      current_period_start: subscriptionPeriod.start,
      current_period_end: subscriptionPeriod.end,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionRow.id);
  if (periodUpdateError) throw periodUpdateError;

  if (subscriptionRow.mosque_id) {
    const refundable = invoice.amount_paid > 0
      ? await resolveRefundableCharge(getStripe(), {
          amount_cents: invoice.amount_paid,
          stripe_charge_id: null,
          stripe_payment_intent_id: null,
          stripe_invoice_id: invoice.id,
        }, stripeRequestOptions).catch(() => null)
      : null;
    await insertProgramPayment(supabase, {
      mosqueId: subscriptionRow.mosque_id,
      programId: subscriptionRow.program_id,
      programSubscriptionId: subscriptionRow.id,
      studentProfileId: subscriptionRow.student_profile_id,
      parentProfileId: subscriptionRow.parent_profile_id,
      stripeInvoiceId: invoice.id,
      stripeChargeId: refundable?.charge.id ?? null,
      stripePaymentIntentId: refundable?.paymentIntentId ?? null,
      paymentTermsId: subscriptionRow.payment_terms_id,
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      paidAt: stripeTimestampToIso(invoice.status_transitions.paid_at) ?? new Date().toISOString(),
      receiptUrl: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
    });
  }

  if (subscriptionRow.payment_terms_id) {
    const { error: termsUpdateError } = await supabase
      .from("program_payment_terms")
      .update({
        status: "active",
        stripe_invoice_id: invoice.id,
        current_period_start: subscriptionPeriod.start,
        current_period_end: subscriptionPeriod.end,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionRow.payment_terms_id);
    if (termsUpdateError) throw termsUpdateError;
  }

  const { data: student } = await supabase.from("profiles").select("full_name, email").eq("id", subscriptionRow.student_profile_id).maybeSingle();
  const studentLabel = student?.full_name || student?.email || "this student";
  await recordFinanceAuditEvent(supabase, {
    programId: subscriptionRow.program_id,
    studentProfileId: subscriptionRow.student_profile_id,
    actorProfileId: null,
    eventType: "invoice_paid",
    summary: `Payment received for ${studentLabel}.`,
    metadata: { stripeSubscriptionId: subscriptionId, amountPaidCents: invoice.amount_paid },
  });

  if (!suppressNotifications) {
    await notifyProgramManagers(supabase, subscriptionRow.program_id, {
      eventKey: `stripe-invoice-paid:${invoice.id}`,
      title: "Payment received",
      body: `A recurring payment from ${studentLabel} was received.`,
    });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription ?? null;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id ?? null;
  if (!subscriptionId) {
    return;
  }
  const supabase = createSupabaseServiceClient();
  const { data: subscriptionRow, error: subscriptionLookupError } = await supabase
    .from("program_subscriptions")
    .select("id, program_id, student_profile_id, payment_terms_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (subscriptionLookupError) throw subscriptionLookupError;
  if (!subscriptionRow?.program_id || !subscriptionRow.student_profile_id) {
    const metadata = invoice.parent?.subscription_details?.metadata ?? {};
    if (metadata.program_id && metadata.student_profile_id) {
      throw new Error(`Subscription ${subscriptionId} is not available locally yet. Retry this failed-payment event after checkout completion.`);
    }
    return;
  }

  const { data: student } = await supabase.from("profiles").select("full_name, email").eq("id", subscriptionRow.student_profile_id).maybeSingle();
  const studentLabel = student?.full_name || student?.email || "this student";
  await recordFinanceAuditEvent(supabase, {
    programId: subscriptionRow.program_id,
    studentProfileId: subscriptionRow.student_profile_id,
    actorProfileId: null,
    eventType: "payment_failed",
    summary: `Payment failed for ${studentLabel}. The student remains enrolled; billing will show as past due.`,
    metadata: { stripeSubscriptionId: subscriptionId },
  });

  await notifyProgramManagers(supabase, subscriptionRow.program_id, {
    eventKey: `stripe-invoice-failed:${invoice.id}`,
    title: "Payment failed",
    body: `A payment from ${studentLabel} failed. Billing will show as past due.`,
  });

  if (subscriptionRow.payment_terms_id) {
    const { error: termsUpdateError } = await supabase
      .from("program_payment_terms")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("id", subscriptionRow.payment_terms_id);
    if (termsUpdateError) throw termsUpdateError;
  }
}

async function updateSubscriptionSchedule(schedule: Stripe.SubscriptionSchedule) {
  const termsId = schedule.metadata?.payment_terms_id;
  if (!termsId) {
    return;
  }
  const supabase = createSupabaseServiceClient();
  const nextStatus = schedule.status === "completed" ? "ended" : schedule.status === "canceled" ? "cancelled" : null;
  const { error: scheduleUpdateError } = await supabase
    .from("program_payment_terms")
    .update({
      stripe_subscription_schedule_id: schedule.id,
      ...(nextStatus ? { status: nextStatus } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", termsId);
  if (scheduleUpdateError) throw scheduleUpdateError;
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook.";
    return Response.json({ error: message }, { status: 400 });
  }

  const stripeAccountId = shouldUseStripeConnect() ? event.account ?? undefined : undefined;
  const isReconciliation = request.headers.get("x-madrasa-reconciliation") === "true";

  try {
    if (event.type === "checkout.session.completed") {
      await upsertPaidEnrollmentFromSession(event.data.object as Stripe.Checkout.Session, stripeAccountId, isReconciliation);
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await updateSubscription(event.data.object as Stripe.Subscription, stripeAccountId);
    }

    if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object as Stripe.Invoice, stripeAccountId, isReconciliation);
    }

    if (event.type === "invoice.payment_failed") {
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
    }

    if (event.type.startsWith("subscription_schedule.")) {
      await updateSubscriptionSchedule(event.data.object as Stripe.SubscriptionSchedule);
    }
  } catch (error) {
    const message = webhookErrorMessage(error);
    await logServerError(createSupabaseServiceClient(), {
      source: "stripe.webhook",
      message,
      context: { eventType: event.type, eventId: event.id },
    });
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ received: true });
}
