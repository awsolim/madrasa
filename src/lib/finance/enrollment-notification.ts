export type EnrollmentPaymentNotice = {
  amountPaidCents: number | null;
  currency: string;
  firstPaymentAt?: string | null;
  firstPaymentCents?: number | null;
};

/** Checkout totals describe money collected today; the approved price does not. */
export function enrollmentPaymentLine(payment: EnrollmentPaymentNotice, timeZone = "UTC") {
  const money = (cents: number) => new Intl.NumberFormat("en-CA", {
    style: "currency", currency: payment.currency.toUpperCase(),
  }).format(cents / 100);
  if (payment.amountPaidCents != null && payment.amountPaidCents > 0) return `${money(payment.amountPaidCents)} paid at enrollment.`;
  const firstPayment = Date.parse(payment.firstPaymentAt ?? "");
  if (Number.isFinite(firstPayment)) {
    const date = new Date(firstPayment).toLocaleDateString("en-CA", { timeZone, month: "long", day: "numeric", year: "numeric" });
    const amount = payment.firstPaymentCents != null && payment.firstPaymentCents > 0 ? ` of ${money(payment.firstPaymentCents)}` : "";
    return `No payment collected at enrollment. First payment${amount} is scheduled for ${date}.`;
  }
  return payment.amountPaidCents === 0 ? "No payment collected at enrollment." : "Payment details are available in Finances.";
}

export function shouldNotifyRecurringPayment(amountPaidCents: number, billingReason: string | null) {
  // The initial invoice is reported by the checkout enrollment confirmation.
  // A zero-value invoice is bookkeeping, not money received.
  return amountPaidCents > 0 && billingReason !== "subscription_create";
}
