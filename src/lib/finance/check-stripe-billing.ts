import "server-only";
import type Stripe from "stripe";
import { checkSubscriptionBilling, type BillingCheck, type InvoiceEvidence } from "@/lib/finance/billing-check";

// Bounded, read-only checks. A truncated history is explicitly 'Review needed'.
// There is no recurring polling and no Stripe or database mutation here.
export async function checkStripeBilling(stripe: Stripe, subscriptionId: string, options: Stripe.RequestOptions | undefined, deadline = Date.now() + 25_000): Promise<BillingCheck> {
  function requestOptions() {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Billing check time limit reached.");
    return { ...options, timeout: Math.min(8_000, remaining), maxNetworkRetries: 0 };
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, requestOptions());
  const invoices: InvoiceEvidence[] = [];
  let startingAfter: string | undefined;
  let complete = false;
  for (let page = 0; page < 3; page++) {
    const result = await stripe.invoices.list({ subscription: subscriptionId, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) }, requestOptions());
    for (const invoice of result.data) {
      const recurringLines = invoice.lines.data.filter(line => line.parent?.type === "subscription_item_details");
      const periods = recurringLines.map(line => line.period);
      const periodStart = periods.length ? Math.min(...periods.map(period => period.start)) : invoice.period_start;
      const periodEnd = periods.length ? Math.max(...periods.map(period => period.end)) : invoice.period_end;
      invoices.push({
        id: invoice.id, status: invoice.status, amountRemaining: invoice.amount_remaining, amountPaid: invoice.amount_paid,
        currency: invoice.currency, dueAt: invoice.due_date ?? invoice.status_transitions.finalized_at ?? invoice.created,
        paidAt: invoice.status_transitions.paid_at, periods, periodStart, periodEnd,
      });
    }
    if (!result.has_more) { complete = true; break; }
    startingAfter = result.data.at(-1)?.id;
    if (!startingAfter) break;
  }
  const item = subscription.items.data[0];
  const firstCharge = Date.parse(subscription.metadata.first_charge_at ?? "") / 1000;
  // Read Stripe's response clock, avoiding host clock skew around collection dates.
  const responseDate = subscription.lastResponse?.headers?.date;
  const now = responseDate ? Date.parse(responseDate) / 1000 : Date.now() / 1000;
  return checkSubscriptionBilling({
    status: subscription.status, paused: Boolean(subscription.pause_collection), cancelAtPeriodEnd: subscription.cancel_at_period_end,
    periodStart: item?.current_period_start ?? null, periodEnd: item?.current_period_end ?? null,
    interval: item?.price.recurring?.interval,
    firstChargeAt: Number.isFinite(firstCharge) ? firstCharge : subscription.billing_cycle_anchor > now ? subscription.billing_cycle_anchor : null,
  }, invoices, complete && subscription.items.data.length === 1 && !subscription.items.has_more, now);
}
