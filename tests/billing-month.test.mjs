import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as month from '../src/lib/finance/billing-month.ts';

const recorded = {};
vm.runInNewContext(ts.transpileModule(await fs.readFile(new URL('../src/lib/finance/recorded-billing-month.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: recorded, Date, require: () => month });
const seconds = value => Date.parse(value) / 1000;
const zone = 'America/Resolute';
const now = seconds('2026-11-27T18:00:00Z');
const startedAt = seconds('2026-09-01T15:00:00Z');
const subscription = { status: 'active', paused: false, cancelAtPeriodEnd: false, periodStart: seconds('2026-11-01T15:00:00Z'), periodEnd: seconds('2026-12-01T15:00:00Z'), firstChargeAt: null, startedAt };
function invoice(key = '2026-11', changes = {}) {
  const start = seconds(key + '-01T15:00:00Z');
  const next = new Date(start * 1000); next.setUTCMonth(next.getUTCMonth() + 1);
  return { id: 'in_' + key, status: 'paid', amountRemaining: 0, amountPaid: 10000, currency: 'cad', dueAt: start, paidAt: start + 60, periods: [{ start, end: next.getTime() / 1000 }], periodStart: start, periodEnd: next.getTime() / 1000, ...changes };
}
const check = (key, invoices, changes = {}, complete = true, time = now) => month.checkSubscriptionBillingMonth({ ...subscription, ...changes }, invoices, complete, time, key, zone);

test('month bounds use local midnight, including leap February and year rollover', () => {
  assert.equal(new Date(month.billingMonthBounds('2026-11', zone).start * 1000).toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(month.billingMonthBounds('2028-02', 'UTC').end - month.billingMonthBounds('2028-02', 'UTC').start, 29 * 86400);
  assert.equal(new Date(month.billingMonthBounds('2026-12', zone).end * 1000).toISOString(), '2027-01-01T06:00:00.000Z');
  assert.equal(month.billingMonth('2026-11-01T04:59:59Z', zone), '2026-10');
});
test('month options stop at the class start and never include future months', () => {
  assert.deepEqual(month.billingMonthOptions('2026-09', '2026-11'), ['2026-11', '2026-10', '2026-09']);
  assert.deepEqual(month.billingMonthOptions('2026-12', '2026-11'), []);
  for (const value of ['2026-00', '2026-13', '../2026-10', null]) assert.equal(month.validBillingMonth(value), false);
});
test('a November receipt settling October counts for October, not as November tuition', () => {
  const october = invoice('2026-10', { paidAt: seconds('2026-11-12T18:00:00Z') });
  assert.equal(check('2026-10', [october]).group, 'current');
  assert.equal(check('2026-11', [october]).group, 'review');
});
test('October debt is shown only in October; November can be independently in order', () => {
  const invoices = [invoice(), invoice('2026-10', { status: 'open', amountRemaining: 3500, amountPaid: 6500, paidAt: null })];
  assert.equal(check('2026-10', invoices).bills[0].amountCents, 3500);
  assert.equal(check('2026-11', invoices, { status: 'past_due' }).group, 'current');
  assert.deepEqual(check('2026-11', invoices).bills, []);
});
test('9 am calendar renewals do not leak the previous month invoice into the next month', () => {
  const invoices = [invoice('2026-10', { status: 'open', amountRemaining: 10000, paidAt: null })];
  assert.equal(check('2026-11', invoices).bills.length, 0);
});
test('new students and ended subscriptions are excluded outside their billing dates', () => {
  assert.equal(check('2026-10', [], { startedAt: seconds('2026-11-15T18:00:00Z') }).applicable, false);
  assert.equal(check('2026-11', [], { endedAt: seconds('2026-10-15T18:00:00Z') }).applicable, false);
});
test('annual payment covers earlier selected months without charging monthly again', () => {
  const annual = invoice('2026-09', { periods: [{ start: startedAt, end: seconds('2027-09-01T15:00:00Z') }] });
  for (const key of ['2026-09', '2026-10', '2026-11']) {
    const result = check(key, [annual]);
    assert.equal(result.group, 'current'); assert.equal(result.label, 'Covered by annual payment');
  }
});
test('partial annual coverage cannot prove a whole later month when renewal is missing', () => {
  const partial = invoice('2026-09', { periods: [{ start: startedAt, end: seconds('2026-10-15T15:00:00Z') }] });
  assert.equal(check('2026-10', [partial]).group, 'review');
});
test('opening waiver covers only the recorded opening period', () => {
  const changes = { startedAt: seconds('2026-10-27T18:00:00Z'), freeUntil: seconds('2026-11-01T15:00:00Z') };
  assert.equal(check('2026-10', [], changes).group, 'current');
  assert.equal(check('2026-11', [], changes).group, 'review');
});
test('voided pause invoices establish no payment due; today’s pause alone does not waive old months', () => {
  assert.equal(check('2026-10', [invoice('2026-10', { status: 'void', amountPaid: 0 })]).group, 'current');
  assert.equal(check('2026-10', [], { paused: true }).group, 'review');
  assert.equal(check('2026-10', [invoice('2026-10', { status: 'open', amountRemaining: 10000 })], { paused: true }).group, 'attention');
});
test('truncated evidence and a draft bill cannot produce a paid classification', () => {
  assert.equal(check('2026-10', [invoice('2026-10')], {}, false).group, 'review');
  assert.equal(check('2026-10', [invoice('2026-10', { status: 'draft', amountRemaining: 10000 })]).group, 'review');
});
test('before first-of-month collection time the new month is upcoming, not paid', () => {
  assert.equal(check('2026-11', [invoice('2026-10')], { periodEnd: seconds('2026-11-01T15:00:00Z') }, true, seconds('2026-11-01T06:30:00Z')).label, 'Next payment upcoming');
});
test('re-enrollment cannot hide an unpaid historical subscription or an incomplete check', () => {
  const paid = check('2026-10', [invoice('2026-10')]);
  const owing = check('2026-10', [invoice('2026-10', { status: 'open', amountRemaining: 10000 })]);
  assert.equal(month.mergeBillingMonthChecks([paid, owing]).group, 'attention');
  assert.equal(month.mergeBillingMonthChecks([paid, check('2026-10', [], {}, false)]).group, 'review');
});

const row = (terms, join = '2026-09-01T18:00:00Z') => ({ enrollment: { created_at: join, status: 'active' }, paymentTerms: terms.at(-1) ?? null, paymentTermsHistory: terms });
const recordedCheck = (key, terms, join) => recorded.checkRecordedBillingMonth(row(terms, join), true, key, zone, now);
test('a November waiver cannot retrospectively clear October', () => {
  const terms = [{ payment_type: 'monthly', created_at: '2026-09-01T18:00:00Z', status: 'superseded', updated_at: '2026-11-01T05:00:00Z' }, { payment_type: 'waived', created_at: '2026-11-01T05:00:00Z', status: 'waived' }];
  assert.equal(recordedCheck('2026-10', terms).group, 'review');
  assert.equal(recordedCheck('2026-11', terms).label, 'Waived');
});
test('a mid-month waiver does not erase the earlier paid portion without evidence', () => {
  assert.equal(recordedCheck('2026-11', [{ payment_type: 'waived', created_at: '2026-11-15T18:00:00Z' }]).group, 'review');
});
test('new waived students are absent before joining and in order from their actual start', () => {
  const terms = [{ payment_type: 'waived', created_at: '2026-11-15T18:00:00Z' }];
  assert.equal(recordedCheck('2026-10', terms, '2026-11-15T18:00:00Z').applicable, false);
  assert.equal(recordedCheck('2026-11', terms, '2026-11-15T18:00:00Z').group, 'current');
});
test('superseded waivers stop at their dated replacement', () => {
  const terms = [{ payment_type: 'waived', created_at: '2026-09-01T18:00:00Z', status: 'superseded', updated_at: '2026-11-01T06:00:00Z' }, { payment_type: 'monthly', created_at: '2026-11-01T06:00:00Z' }];
  assert.equal(recordedCheck('2026-10', terms).group, 'current');
  assert.equal(recordedCheck('2026-11', terms).group, 'review');
});
