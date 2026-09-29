import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { finalizePaidEnrollment } from "@/lib/finance/finalize-paid-enrollment";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

type ConfirmCheckoutBody = {
  checkoutSessionId?: string;
};

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

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as ConfirmCheckoutBody;
    if (!body.checkoutSessionId) {
      return Response.json({ error: "Missing checkout session." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const session = await getStripe().checkout.sessions.retrieve(body.checkoutSessionId, {
      expand: ["subscription"],
    });

    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return Response.json({ error: "Payment has not completed yet." }, { status: 409 });
    }

    const metadata = session.metadata ?? {};
    const enrollmentRequestId = metadata.enrollment_request_id;
    const mosqueId = metadata.mosque_id;
    const programId = metadata.program_id;
    const studentProfileId = metadata.student_profile_id;
    const parentProfileId = metadata.parent_profile_id || null;
    const paymentType = metadata.payment_type === "annual" ? "annual" : "monthly";

    if (!enrollmentRequestId || !mosqueId || !programId || !studentProfileId) {
      return Response.json({ error: "Checkout session is missing enrollment details." }, { status: 400 });
    }

    const { data: enrollmentRequest, error: enrollmentRequestError } = await supabase
      .from("enrollment_requests")
      .select("*")
      .eq("id", enrollmentRequestId)
      .maybeSingle();

    if (enrollmentRequestError || !enrollmentRequest) {
      return Response.json({ error: enrollmentRequestError?.message ?? "Enrollment request not found." }, { status: 404 });
    }

    const ownsRequest = enrollmentRequest.student_profile_id === user.id || enrollmentRequest.parent_profile_id === user.id;
    if (!ownsRequest) {
      return Response.json({ error: "You cannot confirm this payment." }, { status: 403 });
    }

    const subscription = typeof session.subscription === "string"
      ? await getStripe().subscriptions.retrieve(session.subscription)
      : session.subscription;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
    const isRecurring = Boolean(subscriptionId);
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    if (isRecurring && (!subscription || !["active", "trialing", "past_due"].includes(subscription.status))) {
      return Response.json({ error: "The Stripe subscription is not active yet." }, { status: 409 });
    }
    if (!isRecurring && (session.payment_status !== "paid" || !paymentIntentId)) {
      return Response.json({ error: "The one-time payment has not completed." }, { status: 409 });
    }
    const period = getSubscriptionPeriod(subscription);
    const { data: paymentTerms, error: paymentTermsError } = metadata.payment_terms_id
      ? await supabase.from("program_payment_terms").select("id, amount_cents, billing_months, currency").eq("id", metadata.payment_terms_id).maybeSingle()
      : { data: null, error: null };
    if (paymentTermsError) throw paymentTermsError;

    await finalizePaidEnrollment(supabase, {
      enrollmentRequestId, mosqueId, programId, studentProfileId, parentProfileId,
      paymentTermsId: paymentTerms?.id ?? null,
      stripeAccountId: metadata.stripe_account_id ?? null,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      stripeSubscriptionId: subscriptionId,
      stripeSubscriptionScheduleId: typeof subscription?.schedule === "string" ? subscription.schedule : subscription?.schedule?.id ?? null,
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
      isRecurring,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not confirm payment.";
    await logServerError(createSupabaseServiceClient(), {
      source: "stripe.confirm",
      message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
