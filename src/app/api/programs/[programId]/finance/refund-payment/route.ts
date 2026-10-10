import type Stripe from "stripe";
import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { recordFinanceAuditEvent } from "@/lib/finance/audit";
import { logServerError } from "@/lib/monitoring/log-error";
import { getStripe, shouldUseStripeConnect } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RefundPaymentBody = {
  paymentId?: string;
  amountCents?: number;
  reason?: string;
  requestId?: string;
  preview?: boolean;
};

async function refundableCharge(
  payment: { stripe_charge_id: string | null; stripe_payment_intent_id: string | null },
  stripeOptions: Stripe.RequestOptions | undefined,
) {
  const stripe = getStripe();
  if (payment.stripe_charge_id) return stripe.charges.retrieve(payment.stripe_charge_id, {}, stripeOptions);
  if (!payment.stripe_payment_intent_id) throw new Error("This payment is not linked to a refundable Stripe charge.");
  const intent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id, { expand: ["latest_charge"] }, stripeOptions);
  if (!intent.latest_charge) throw new Error("Stripe does not show a completed charge for this payment.");
  return typeof intent.latest_charge === "string"
    ? stripe.charges.retrieve(intent.latest_charge, {}, stripeOptions)
    : intent.latest_charge;
}

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

    const body = (await request.json()) as RefundPaymentBody;
    if (!body.paymentId) return Response.json({ error: "Choose a payment first." }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const access = await requireProgramFinanceAccess(supabase, programId, user.id);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

    const { data: payment, error: paymentError } = await supabase
      .from("program_payments")
      .select("id,program_id,program_subscription_id,student_profile_id,amount_cents,currency,paid_at,stripe_charge_id,stripe_payment_intent_id,stripe_invoice_id")
      .eq("id", body.paymentId)
      .eq("program_id", programId)
      .maybeSingle();
    if (paymentError || !payment) return Response.json({ error: paymentError?.message ?? "Payment not found." }, { status: 404 });

    const { data: subscription } = payment.program_subscription_id
      ? await supabase.from("program_subscriptions").select("stripe_account_id").eq("id", payment.program_subscription_id).maybeSingle()
      : { data: null };
    const stripeOptions = shouldUseStripeConnect() && subscription?.stripe_account_id
      ? { stripeAccount: subscription.stripe_account_id }
      : undefined;
    const charge = await refundableCharge(payment, stripeOptions);
    if (charge.currency.toLowerCase() !== payment.currency.toLowerCase()) throw new Error("The Stripe charge currency does not match the payment record.");
    const refundedAmountCents = charge.amount_refunded;
    const refundableAmountCents = Math.max(0, charge.amount - refundedAmountCents);

    if (body.preview) {
      return Response.json({
        paymentId: payment.id,
        originalAmountCents: charge.amount,
        refundedAmountCents,
        refundableAmountCents,
        currency: charge.currency,
        paidAt: payment.paid_at,
      });
    }

    const amountCents = Math.round(Number(body.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return Response.json({ error: "Enter a valid refund amount." }, { status: 400 });
    if (amountCents > refundableAmountCents) return Response.json({ error: "The refund exceeds this payment's remaining refundable balance." }, { status: 409 });
    if (!body.requestId || !/^[a-f0-9-]{20,80}$/i.test(body.requestId)) return Response.json({ error: "The refund confirmation expired. Please review it again." }, { status: 400 });
    const reason = body.reason?.trim().slice(0, 500) || null;

    const refund = await getStripe().refunds.create({
      charge: charge.id,
      amount: amountCents,
      reason: "requested_by_customer",
      metadata: {
        program_id: programId,
        student_profile_id: payment.student_profile_id ?? "",
        program_payment_id: payment.id,
        actor_profile_id: user.id,
        internal_reason: reason ?? "",
      },
    }, { ...stripeOptions, idempotencyKey: `payment-refund:${payment.id}:${body.requestId}` });

    await recordFinanceAuditEvent(supabase, {
      programId,
      studentProfileId: payment.student_profile_id,
      actorProfileId: user.id,
      eventType: "payment_refund_issued",
      summary: `${payment.currency.toUpperCase()} ${(amountCents / 100).toFixed(2)} was refunded to the original payment method.`,
      metadata: {
        programPaymentId: payment.id,
        stripeRefundId: refund.id,
        stripeChargeId: charge.id,
        stripeInvoiceId: payment.stripe_invoice_id,
        amountCents,
        currency: payment.currency,
        reason,
      },
    });

    return Response.json({ ok: true, refundId: refund.id, refundedAmountCents: amountCents, remainingRefundableAmountCents: refundableAmountCents - amountCents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refund this payment.";
    await logServerError(createSupabaseServiceClient(), { source: "programs.finance.refund-payment", message, context: { programId } });
    return Response.json({ error: message }, { status: 500 });
  }
}
