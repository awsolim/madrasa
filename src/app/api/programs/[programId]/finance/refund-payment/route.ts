import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { recordFinanceAuditEvent } from "@/lib/finance/audit";
import { resolveRefundableCharge } from "@/lib/finance/refundable-charge";
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
    const resolved = await resolveRefundableCharge(getStripe(), payment, stripeOptions);
    const charge = resolved.charge;
    if (payment.stripe_charge_id !== charge.id || payment.stripe_payment_intent_id !== resolved.paymentIntentId) {
      const { error: linkError } = await supabase.from("program_payments").update({
        stripe_charge_id: charge.id,
        stripe_payment_intent_id: resolved.paymentIntentId,
      }).eq("id", payment.id);
      if (linkError) throw linkError;
    }
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
