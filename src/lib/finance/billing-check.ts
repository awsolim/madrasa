export type OutstandingBill = {
  id: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  periodStart: string;
  periodEnd: string;
};

export type BillingCheck = {
  group: "attention" | "current" | "review";
  label: string;
  explanation: string;
  bills: OutstandingBill[];
  checkedAt: string;
  nextPaymentAt?: string;
  lastPaymentAt?: string;
  lastPaymentAmountCents?: number;
  currency?: string;
  settledPeriod?: { start: string; end: string; kind: "paid" | "adjusted"; interval?: string };
};

export type InvoiceEvidence = {
  id: string;
  status: string | null;
  amountRemaining: number;
  amountPaid: number;
  currency: string;
  dueAt: number;
  paidAt: number | null;
  periods: Array<{ start: number; end: number }>;
  periodStart: number;
  periodEnd: number;
};

export type SubscriptionEvidence = {
  status: string;
  paused: boolean;
  cancelAtPeriodEnd: boolean;
  periodStart: number | null;
  periodEnd: number | null;
  firstChargeAt: number | null;
  interval?: string;
};

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Invoice evidence, not an 'active' subscription, establishes payment standing. */
export function checkSubscriptionBilling(subscription: SubscriptionEvidence, invoices: InvoiceEvidence[], complete: boolean, now: number): BillingCheck {
  const checkedAt = iso(now);
  const lastPaid = invoices.filter(invoice => invoice.status === "paid" && invoice.amountPaid > 0 && invoice.paidAt)
    .sort((a, b) => b.paidAt! - a.paidAt!)[0];
  const currentSettled = subscription.periodStart && subscription.periodEnd && subscription.periodStart <= now && subscription.periodEnd > now
    ? invoices.find(invoice => ["paid", "void"].includes(invoice.status ?? "") && invoice.periods.some(period => period.start <= subscription.periodStart! && period.end >= subscription.periodEnd!))
    : undefined;
  // Preserve evidence for the current period even when an older bill is unpaid.
  const payment = {
    ...(lastPaid ? { lastPaymentAt: iso(lastPaid.paidAt!), lastPaymentAmountCents: lastPaid.amountPaid, currency: lastPaid.currency } : {}),
    ...(currentSettled ? { settledPeriod: { start: iso(subscription.periodStart!), end: iso(subscription.periodEnd!), kind: currentSettled.status === "paid" && currentSettled.amountPaid > 0 ? "paid" as const : "adjusted" as const, interval: subscription.interval } } : {}),
  };
  const bills = invoices.filter(invoice => ["open", "uncollectible"].includes(invoice.status ?? "") && invoice.amountRemaining > 0 && invoice.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map(invoice => ({ id: invoice.id, amountCents: invoice.amountRemaining, currency: invoice.currency, dueAt: iso(invoice.dueAt), periodStart: iso(invoice.periodStart), periodEnd: iso(invoice.periodEnd) }));
  if (bills.length) return { group: "attention", label: "Payment outstanding", explanation: complete ? "Payment has not been received for the bills below. Check before collecting separately; an automatic payment may still be processing." : "These bills are unpaid. The remaining history could not be fully checked.", bills, checkedAt, ...payment };
  const review = (explanation: string): BillingCheck => ({ group: "review", label: "Review needed", explanation, bills: [], checkedAt, ...payment });
  if (!complete) return review("Payment history could not be fully checked. This student has not been marked in order.");
  if (["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(subscription.status)) return review("Subscription setup or collection needs review. No confirmed overdue amount was returned.");
  if (subscription.paused || subscription.status === "paused") return { group: "current", label: "Payments paused", explanation: "No overdue Stripe bills were found. Future collection is paused.", bills: [], checkedAt, ...payment };
  if (subscription.firstChargeAt && subscription.firstChargeAt > now) return { group: "current", label: lastPaid ? "Up to date" : "First payment upcoming", explanation: lastPaid ? "The opening payment is settled. The next full monthly payment is upcoming." : "Subscription is set up. Nothing is due before the first payment date.", nextPaymentAt: iso(subscription.firstChargeAt), bills: [], checkedAt, ...payment };
  if (subscription.status === "trialing" && subscription.periodEnd && subscription.periodEnd > now) return { group: "current", label: "Nothing due yet", explanation: "The subscription is in its no-charge period.", nextPaymentAt: iso(subscription.periodEnd), bills: [], checkedAt, ...payment };
  if (subscription.status === "canceled") return { group: "current", label: "Billing ended", explanation: "No outstanding Stripe bills were found for this subscription.", bills: [], checkedAt, ...payment };
  const { periodStart, periodEnd } = subscription;
  if (!periodStart || !periodEnd || periodEnd <= now) return review("The current billing period could not be verified. Refresh to check whether the next bill has been created.");
  const futureBill = invoices.find(invoice => invoice.status === "open" && invoice.dueAt > now && invoice.periods.some(period => period.start <= periodStart && period.end >= periodEnd));
  if (futureBill) return { group: "current", label: "Payment upcoming", explanation: "The current bill is not due yet.", nextPaymentAt: iso(futureBill.dueAt), bills: [], checkedAt, ...payment };
  if (!currentSettled) return review("No settled bill covering the current billing period was found. A bill may still be preparing or the records may need correction.");
  return { group: "current", label: "Up to date", explanation: "The current billing period is settled and no outstanding Stripe bills were found.", bills: [], checkedAt, ...payment, ...(!subscription.cancelAtPeriodEnd ? { nextPaymentAt: iso(periodEnd) } : {}) };
}
