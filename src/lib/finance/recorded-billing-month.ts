import type { BillingCheck } from "./billing-check";
import { billingMonth, billingMonthBounds } from "./billing-month";

type Terms = { id?: string; created_at?: string; approved_at?: string | null; updated_at?: string; payment_type: string; status?: string; current_period_start?: string | null; current_period_end?: string | null };
type Row = {
  enrollment: { created_at?: string; status?: string };
  paymentTerms: Terms | null;
  paymentTermsHistory?: Terms[];
  request?: { payment_bypass_external?: boolean; payment_terms_id?: string | null } | null;
};

/** Only dated arrangements can establish historical non-Stripe coverage. */
export function checkRecordedBillingMonth(row: Row, isPaid: boolean, month: string, timeZone: string, now = Date.now() / 1000): BillingCheck {
  const { start, end } = billingMonthBounds(month, timeZone);
  const checkedAt = new Date(now * 1000).toISOString();
  const result = (group: BillingCheck["group"], label: string, explanation: string): BillingCheck => ({ group, label, explanation, bills: [], checkedAt });
  const join = Date.parse(row.enrollment.created_at ?? "") / 1000;
  const terms = (row.paymentTermsHistory?.length ? row.paymentTermsHistory : row.paymentTerms ? [row.paymentTerms] : [])
    .map(value => ({ value, at: Date.parse(value.approved_at || value.created_at || "") / 1000 }))
    .filter(value => Number.isFinite(value.at)).sort((a, b) => a.at - b.at);
  if (Number.isFinite(join) && join >= end && !terms.some(term => term.at < end)) return { ...result("current", "Not enrolled", "This student had not joined in the selected month."), applicable: false };
  if (!isPaid && !terms.length && month === billingMonth(now * 1000, timeZone)) return result("current", "Free", "No tuition is required for this class.");
  const expectedStart = Math.max(start, Number.isFinite(join) ? join : start);
  const expectedEnd = Math.min(end, now);
  const coverage: Array<{ start: number; end: number; label: string }> = [];
  for (let i = 0; i < terms.length; i++) {
    const { value, at } = terms[i];
    let until = terms[i + 1]?.at ?? Infinity;
    if (["ended", "cancelled", "superseded"].includes(value.status ?? "") && Number.isFinite(Date.parse(value.updated_at ?? ""))) until = Math.min(until, Date.parse(value.updated_at!) / 1000);
    if (["waived", "free"].includes(value.payment_type)) coverage.push({ start: at, end: until, label: value.payment_type === "free" ? "Free" : row.request?.payment_bypass_external && row.request.payment_terms_id === value.id ? "Paid externally" : "Waived" });
    if (value.payment_type === "pay_in_full" && value.status === "paid") coverage.push({ start: at, end: until, label: "Paid in full" });
    if (value.payment_type === "annual" && value.status === "paid" && value.current_period_start && value.current_period_end) coverage.push({ start: Math.max(at, Date.parse(value.current_period_start) / 1000), end: Math.min(until, Date.parse(value.current_period_end) / 1000), label: "Covered by annual payment" });
  }
  let cursor = expectedStart;
  let label = "Nothing due";
  for (const range of coverage.sort((a, b) => a.start - b.start)) {
    if (range.start > cursor) break;
    if (range.end > cursor) { cursor = range.end; label = range.label; }
  }
  if (cursor >= expectedEnd && expectedStart < expectedEnd) return result("current", label, "Dated payment arrangements cover the selected month.");
  return result("review", "Check payment", "A complete dated payment arrangement could not be verified for this month. A current waiver has not been applied retroactively.");
}
