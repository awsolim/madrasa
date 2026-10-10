import type Stripe from "stripe";

export type RefundablePaymentReference = {
  amount_cents: number;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
};

export type ResolvedRefundableCharge = {
  charge: Stripe.Charge;
  paymentIntentId: string | null;
};

function paymentIntentId(charge: Stripe.Charge) {
  return typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
}

async function chargeFromPaymentIntent(
  stripe: Stripe,
  intentReference: string | Stripe.PaymentIntent,
  options?: Stripe.RequestOptions,
): Promise<ResolvedRefundableCharge | null> {
  const intent = typeof intentReference === "string"
    ? await stripe.paymentIntents.retrieve(intentReference, { expand: ["latest_charge"] }, options)
    : intentReference.latest_charge
      ? intentReference
      : await stripe.paymentIntents.retrieve(intentReference.id, { expand: ["latest_charge"] }, options);
  if (!intent.latest_charge) return null;
  const charge = typeof intent.latest_charge === "string"
    ? await stripe.charges.retrieve(intent.latest_charge, {}, options)
    : intent.latest_charge;
  return { charge, paymentIntentId: intent.id };
}

export async function resolveRefundableCharge(
  stripe: Stripe,
  payment: RefundablePaymentReference,
  options?: Stripe.RequestOptions,
): Promise<ResolvedRefundableCharge> {
  if (payment.stripe_charge_id) {
    const charge = await stripe.charges.retrieve(payment.stripe_charge_id, {}, options);
    return { charge, paymentIntentId: paymentIntentId(charge) };
  }

  if (payment.stripe_payment_intent_id) {
    const resolved = await chargeFromPaymentIntent(stripe, payment.stripe_payment_intent_id, options);
    if (resolved) return resolved;
    throw new Error("Stripe does not show a completed charge for this payment.");
  }

  if (!payment.stripe_invoice_id) {
    throw new Error("This payment is not linked to a refundable Stripe charge.");
  }

  const invoicePayments = await stripe.invoicePayments.list({
    invoice: payment.stripe_invoice_id,
    status: "paid",
    limit: 100,
    expand: ["data.payment.charge", "data.payment.payment_intent"],
  }, options);
  const candidates: ResolvedRefundableCharge[] = [];
  for (const invoicePayment of invoicePayments.data) {
    if (invoicePayment.payment.type === "charge" && invoicePayment.payment.charge) {
      const charge = typeof invoicePayment.payment.charge === "string"
        ? await stripe.charges.retrieve(invoicePayment.payment.charge, {}, options)
        : invoicePayment.payment.charge;
      candidates.push({ charge, paymentIntentId: paymentIntentId(charge) });
    }
    if (invoicePayment.payment.type === "payment_intent" && invoicePayment.payment.payment_intent) {
      const resolved = await chargeFromPaymentIntent(stripe, invoicePayment.payment.payment_intent, options);
      if (resolved) candidates.push(resolved);
    }
  }

  const unique = [...new Map(candidates.map((candidate) => [candidate.charge.id, candidate])).values()];
  const exactAmount = unique.filter((candidate) => candidate.charge.amount === payment.amount_cents);
  if (exactAmount.length === 1) return exactAmount[0];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) {
    throw new Error("This invoice contains multiple Stripe charges and cannot be refunded safely from this record.");
  }
  throw new Error("Stripe does not show a refundable card charge for this invoice.");
}
