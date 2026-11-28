import type { BillingCheck, InvoiceEvidence, SubscriptionEvidence } from "./billing-check";

export function billingMonth(value: string | number | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
}

export function validBillingMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "2000-01" && value <= "2199-12";
}

function localMidnight(year: number, month: number, timeZone: string) {
  const wall = Date.UTC(year, month - 1, 1);
  let result = wall;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(new Date(result));
    const n = (type: string) => Number(parts.find(part => part.type === type)?.value);
    result += wall - Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  }
  return result / 1000;
}

export function billingMonthBounds(month: string, timeZone: string) {
  if (!validBillingMonth(month)) throw new Error("Invalid billing month.");
  const [year, number] = month.split("-").map(Number);
  return { start: localMidnight(year, number, timeZone), end: localMidnight(year + (number === 12 ? 1 : 0), number === 12 ? 1 : number + 1, timeZone) };
}

export function billingMonthOptions(first: string, current: string) {
  if (!validBillingMonth(first) || !validBillingMonth(current)) return [];
  const months: string[] = [];
  let [year, month] = current.split("-").map(Number);
  for (let i = 0; i < 1200; i++) {
    const value = `${year}-${String(month).padStart(2, "0")}`;
    if (value < first) break;
    months.push(value);
    if (--month === 0) { year--; month = 12; }
  }
  return months;
}

// Calendar tuition belongs to the month starting on the first, even when Stripe
// collects at 9 am. November 1 09:00–December 1 09:00 is November's bill.
function calendarPeriod(period: { start: number; end: number }, timeZone: string) {
  const edge = (seconds: number) => {
    const date = new Date(seconds * 1000);
    const day = new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(date);
    return Number(day) === 1 ? billingMonthBounds(billingMonth(date, timeZone), timeZone).start : seconds;
  };
  return { start: edge(period.start), end: edge(period.end) };
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
type MonthSubscription = SubscriptionEvidence & { startedAt?: number; endedAt?: number | null; freeUntil?: number | null };

/** Current settlement of the selected tuition month, not a snapshot of payment dates. */
export function checkSubscriptionBillingMonth(subscription: MonthSubscription, invoices: InvoiceEvidence[], complete: boolean, now: number, month: string, timeZone: string): BillingCheck {
  const bounds = billingMonthBounds(month, timeZone);
  const checkedAt = iso(now);
  const relevant = invoices.filter(invoice => (invoice.periods.length ? invoice.periods : [{ start: invoice.periodStart, end: invoice.periodEnd }])
    .some(period => { const range = calendarPeriod(period, timeZone); return range.start < bounds.end && range.end > bounds.start; }));
  const lastPaid = relevant.filter(invoice => invoice.status === "paid" && invoice.amountPaid > 0 && invoice.paidAt).sort((a, b) => b.paidAt! - a.paidAt!)[0];
  const payment = lastPaid ? { lastPaymentAt: iso(lastPaid.paidAt!), lastPaymentAmountCents: lastPaid.amountPaid, currency: lastPaid.currency } : {};
  const bills = relevant.filter(invoice => ["open", "uncollectible"].includes(invoice.status ?? "") && invoice.amountRemaining > 0 && invoice.dueAt <= now)
    .map(invoice => ({ id: invoice.id, amountCents: invoice.amountRemaining, currency: invoice.currency, dueAt: iso(invoice.dueAt), periodStart: iso(invoice.periodStart), periodEnd: iso(invoice.periodEnd) }));
  const result = (group: BillingCheck["group"], label: string, explanation: string): BillingCheck => ({ group, label, explanation, bills, checkedAt, ...payment });
  if (bills.length) return result("attention", "Payment outstanding", "These unpaid bills cover the selected month. Payments received in a later month still settle the bill they belong to.");
  if (!complete) return result("review", "Check payment", "The selected month's history could not be fully checked.");
  if (!relevant.length && ((subscription.startedAt && subscription.startedAt >= bounds.end) || (subscription.endedAt && subscription.endedAt <= bounds.start))) {
    return { ...result("current", "Outside billing period", "This subscription was not billing during the selected month."), applicable: false };
  }
  const start = Math.max(bounds.start, subscription.startedAt ?? bounds.start);
  const end = Math.min(bounds.end, now, subscription.endedAt ?? Infinity);
  if (start >= end && !relevant.length) return { ...result("current", "Outside billing period", "Billing had not started in this month."), applicable: false };
  if (relevant.some(invoice => invoice.status === "draft" && invoice.amountRemaining > 0)) return result("review", "Check payment", "A bill for this month is still being prepared.");
  const covered: Array<{ start: number; end: number }> = [];
  let upcoming: number | undefined;
  let paidCoverage: InvoiceEvidence | undefined;
  for (const invoice of relevant) {
    const settled = invoice.status === "paid" || invoice.status === "void";
    const notDue = invoice.status === "open" && invoice.dueAt > now;
    if (!settled && !notDue) continue;
    for (const period of invoice.periods) covered.push(calendarPeriod(period, timeZone));
    if (settled && invoice.status === "paid" && invoice.amountPaid > 0) paidCoverage = invoice;
    if (notDue) upcoming = Math.min(upcoming ?? Infinity, invoice.dueAt);
  }
  if (subscription.freeUntil && subscription.startedAt) covered.push({ start: subscription.startedAt, end: subscription.freeUntil });
  let cursor = start;
  for (const range of covered.sort((a, b) => a.start - b.start)) {
    if (range.start > cursor) break;
    cursor = Math.max(cursor, range.end);
  }
  // On the first before the scheduled collection, the prior invoice must not
  // become a claim that this month's payment has already been received.
  const nextCollection = subscription.periodEnd;
  if (cursor < end && month === billingMonth(now * 1000, timeZone) && nextCollection && nextCollection > now && billingMonth(nextCollection * 1000, timeZone) === month && !relevant.length) {
    return { ...result("current", "Next payment upcoming", "This month's scheduled collection time has not arrived yet."), nextPaymentAt: iso(nextCollection) };
  }
  if (cursor < end) return result("review", "Check payment", "No complete payment, waiver or no-charge coverage could be verified for this month. No missing fee has been invented.");
  if (upcoming) return { ...result("current", "Payment upcoming", "This month's bill is not due yet."), nextPaymentAt: iso(upcoming) };
  if (!paidCoverage && subscription.freeUntil && subscription.freeUntil >= end) return { ...result("current", "Nothing due yet", "The selected month is covered by the recorded opening no-charge period."), nextPaymentAt: iso(subscription.freeUntil) };
  if (!paidCoverage) return result("current", "Nothing due — bill adjusted", "The selected month's bill was adjusted or voided; it is not recorded as a cash payment.");
  const annual = paidCoverage.periods.some(period => period.end - period.start > 300 * 86400);
  return { ...result("current", annual ? "Covered by annual payment" : "Paid", "The selected month's recorded billing period is settled."), settledPeriod: { start: iso(start), end: iso(Math.max(end, start + 1)), kind: "paid", interval: annual ? "year" : "month" } };
}

/** Combine re-enrollments without losing an unpaid older subscription. */
export function mergeBillingMonthChecks(checks: BillingCheck[]): BillingCheck {
  const relevant = checks.filter(check => check.applicable !== false);
  const first = relevant.find(check => check.group === "attention") ?? relevant.find(check => check.group === "review") ?? relevant.find(check => check.settledPeriod) ?? relevant[0] ?? checks[0];
  if (!first) throw new Error("No billing checks to combine.");
  const bills = [...new Map(relevant.flatMap(check => check.bills).map(bill => [bill.id, bill])).values()];
  return { ...first, bills };
}
