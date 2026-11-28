import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSubscriptionBilling } from '../src/lib/finance/billing-check.ts';

const start = Date.parse('2026-11-01T15:00:00Z') / 1000;
const end = Date.parse('2026-12-01T15:00:00Z') / 1000;
const now = Date.parse('2026-11-27T18:00:00Z') / 1000;
const subscription = { status: 'active', paused: false, cancelAtPeriodEnd: false, periodStart: start, periodEnd: end, firstChargeAt: null };
const paid = { id: 'in_paid', status: 'paid', amountRemaining: 0, amountPaid: 10000, currency: 'cad', dueAt: start, paidAt: start + 30, periods: [{ start, end }], periodStart: start, periodEnd: end };
const unpaid = { ...paid, id: 'in_due', status: 'open', amountRemaining: 10000, amountPaid: 0, paidAt: null };
const check = (invoices, changes = {}, complete = true) => checkSubscriptionBilling({ ...subscription, ...changes }, invoices, complete, now);

test('active alone never proves payment', () => {
  assert.equal(check([]).group, 'review');
});
test('settled current cycle and no older debt is in order', () => {
  const result = check([paid]);
  assert.equal(result.group, 'current');
  assert.equal(result.label, 'Up to date');
  assert.equal(result.lastPaymentAmountCents, 10000);
  assert.equal(result.nextPaymentAt, new Date(end * 1000).toISOString());
});
test('older debt remains outstanding even after the current cycle is paid', () => {
  const october = { ...unpaid, periodStart: start - 31 * 86400, periodEnd: start, dueAt: start - 31 * 86400 };
  const result = check([paid, october]);
  assert.equal(result.group, 'attention');
  assert.equal(result.bills[0].amountCents, 10000);
  assert.equal(result.bills[0].periodEnd, new Date(start * 1000).toISOString());
  assert.equal(result.settledPeriod.kind, 'paid');
  assert.equal(result.settledPeriod.start, new Date(start * 1000).toISOString());
});
test('partial payments report the remaining balance, not the original price', () => {
  assert.equal(check([{ ...unpaid, amountRemaining: 3500, amountPaid: 6500 }]).bills[0].amountCents, 3500);
});
test('multiple overdue periods are kept separate', () => {
  assert.equal(check([unpaid, { ...unpaid, id: 'older', dueAt: start - 86400 }]).bills.length, 2);
});
test('written-off unpaid bills require attention instead of disappearing', () => {
  assert.equal(check([{ ...unpaid, status: 'uncollectible' }]).group, 'attention');
});
test('future first charge with saved subscription is in order, not paid or overdue', () => {
  const result = check([], { firstChargeAt: end });
  assert.equal(result.group, 'current');
  assert.equal(result.label, 'First payment upcoming');
  assert.equal(result.lastPaymentAt, undefined);
});
test('a paid prorated opening period is not described as never having paid', () => {
  const result = check([paid], { firstChargeAt: end });
  assert.equal(result.label, 'Up to date');
  assert.equal(result.lastPaymentAmountCents, 10000);
});
test('an open invoice before its due date is not overdue', () => {
  assert.equal(check([{ ...unpaid, dueAt: end }]).label, 'Payment upcoming');
});
test('due time equality is outstanding', () => {
  assert.equal(check([{ ...unpaid, dueAt: now }]).group, 'attention');
});
test('void and zero-price settled periods do not manufacture arrears', () => {
  assert.equal(check([{ ...paid, status: 'void' }]).group, 'current');
  assert.equal(check([{ ...paid, amountPaid: 0 }]).group, 'current');
  assert.equal(check([{ ...paid, status: 'void' }]).settledPeriod.kind, 'adjusted');
  assert.equal(check([{ ...paid, amountPaid: 0 }]).settledPeriod.kind, 'adjusted');
});
test('paid previous period cannot stand in for this period', () => {
  assert.equal(check([{ ...paid, periods: [{ start: start - 86400 * 31, end: start }] }]).group, 'review');
});
test('collection stopped or waived does not conceal existing debt', () => {
  assert.equal(check([unpaid], { paused: true }).group, 'attention');
  assert.equal(check([unpaid], { status: 'canceled' }).group, 'attention');
});
test('paused or ended subscriptions with no outstanding bills explain their state', () => {
  assert.equal(check([], { paused: true }).label, 'Payments paused');
  assert.equal(check([], { status: 'canceled' }).label, 'Billing ended');
});
test('truncated history cannot produce an in-order classification', () => {
  assert.equal(check([paid], {}, false).group, 'review');
  assert.equal(check([unpaid], {}, false).group, 'attention');
});
test('past due without a returned invoice is review, never an invented balance', () => {
  const result = check([], { status: 'past_due' });
  assert.equal(result.group, 'review');
  assert.deepEqual(result.bills, []);
});
test('a billing cycle that has rolled over without invoice evidence is review', () => {
  assert.equal(check([paid], { periodEnd: now - 1 }).group, 'review');
});
test('annual periods are verified against annual invoice coverage', () => {
  const annualEnd = end + 86400 * 334;
  const result = check([{ ...paid, periods: [{ start, end: annualEnd }] }], { periodEnd: annualEnd, interval: 'year' });
  assert.equal(result.group, 'current');
  assert.equal(result.settledPeriod.interval, 'year');
  assert.equal(check([paid], { periodEnd: annualEnd }).group, 'review');
});
