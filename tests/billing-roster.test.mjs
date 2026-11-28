import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as monthHelpers from '../src/lib/finance/billing-month.ts';
const recorded = {};
vm.runInNewContext(ts.transpileModule(await fs.readFile(new URL('../src/lib/finance/recorded-billing-month.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: recorded, Date, require: () => monthHelpers });
const code = ts.transpileModule(await fs.readFile(new URL('../src/components/data/billing-roster.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function render({ filter, checks = {}, error = null, data = true, applicants = [], checkedAt = '2026-11-27T18:00:00Z', selectedMonth = checkedAt.slice(0, 7), responseMonth = selectedMonth } = {}) {
  let state = 0;
  const exports = {};
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [checkedAt])); } static now() { return Date.parse(checkedAt); } }
  vm.runInNewContext(code, { exports, Date: ClockDate, Intl, require: name => {
    if (name === 'react') return { ...React, useState: initial => React.useState(state++ === 0 ? filter ?? initial : state === 2 ? selectedMonth : initial) };
    if (name === 'react/jsx-runtime') return jsx;
    if (name.endsWith('/billing-month')) return monthHelpers;
    if (name.endsWith('/recorded-billing-month')) return recorded;
    if (name.endsWith('/client-cache')) return { getCachedSessionSnapshot: () => ({ user: { id: 'viewer' } }) };
    if (name.endsWith('/query-cache')) return { useCachedQuery: key => { assert.ok(key.endsWith(':' + selectedMonth)); return { data: data ? { checks, checkedAt, month: responseMonth } : undefined, error, refetch: async () => {} }; } };
    if (name.endsWith('/use-refresh-on-return')) return { useRefreshOnReturn() {} };
    if (name.endsWith('/utils')) return { cn: (...items) => items.filter(Boolean).join(' ') };
    throw new Error(name);
  } });
  const row = (id, stripe = true) => ({ enrollment: { id, student_profile_id: id, status: 'active', created_at: '2026-09-01T18:00:00Z' }, student: { full_name: id === 'owing' ? 'A Student With A Long Name' : id }, parent: { full_name: 'Parent Name' }, subscription: stripe ? { stripe_subscription_id: `sub_${id}`, payment_type: 'monthly', amount_cents: 10000, currency: 'cad' } : null, paymentTerms: stripe ? { payment_type: 'monthly', amount_cents: 10000, currency: 'cad' } : { payment_type: 'waived', created_at: '2026-09-01T18:00:00Z' } });
  return renderToStaticMarkup(React.createElement(exports.BillingRoster, { program: { id: 'class', is_paid: true, start_date: '2026-09-01', monthly_billing_anchor: 'first_of_month', schedule_timezone: 'America/Resolute' }, rows: [row('owing'), row('paid'), row('unknown'), row('waived', false)], applicants, onOpenApplication() {}, onOpenStudent() {}, onRefreshRows: async () => {} }));
}
const checks = {
  owing: { group: 'attention', label: 'Payment outstanding', explanation: '', bills: [{ id: 'in_due', amountCents: 3500, currency: 'cad', dueAt: '2026-11-01T15:00:00Z', periodStart: '2026-11-01T15:00:00Z', periodEnd: '2026-12-01T15:00:00Z' }] },
  paid: { group: 'current', label: 'Up to date', explanation: 'Current bill settled', bills: [], settledPeriod: { start: '2026-11-01T15:00:00Z', end: '2026-12-01T15:00:00Z', kind: 'paid', interval: 'month' } },
};
test('attention list identifies the owing student, parent, unpaid balance and named month', () => {
  const html = render({ filter: 'attention', checks });
  assert.match(html, /A Student With A Long Name/);
  assert.match(html, /Parent: Parent Name/);
  assert.match(html, /\$35\.00 unpaid/);
  assert.match(html, /November 2026/);
  assert.doesNotMatch(html, /Current bill settled/);
  assert.match(html, /Check payment/);
  assert.match(html, /Needs attention/);
  assert.match(html, /November 2026/);
  assert.doesNotMatch(html, /Applications → Waiting Payment|Unbilled historical|Next payment:|Last paid:|Student file →/);
});
test('in-order is the default and includes settled and waived students without overdue rows', () => {
  const html = render({ checks });
  assert.match(html, />Paid</);
  assert.doesNotMatch(html, /Current bill settled/);
  assert.match(html, /Waived/);
  assert.doesNotMatch(html, /A Student With A Long Name/);
});

test('awaiting enrollment appears only in current-month attention and never as debt or paid', () => {
  const applicants = [{ request: { id: 'application' }, student: { full_name: 'Accepted Applicant' }, parent: { full_name: 'Applicant Parent' } }];
  const html = render({ filter: 'attention', checks, applicants });
  assert.match(html, /Accepted Applicant/);
  assert.match(html, /Parent: Applicant Parent/);
  assert.match(html, /Awaiting enrollment/);
  assert.match(html, /Needs attention<\/span><span class="tabular-nums">3</);
  assert.doesNotMatch(html.slice(html.indexOf('Accepted Applicant')), /unpaid|>Paid</);
  assert.doesNotMatch(render({ checks, applicants }), /Accepted Applicant|Awaiting enrollment/);
  assert.doesNotMatch(render({ filter: 'attention', checks, applicants, selectedMonth: '2026-10' }), /Accepted Applicant|Awaiting enrollment/);
});
test('the selected historical month shows the returned balance and keeps compact rows', () => {
  const older = { ...checks.owing, settledPeriod: checks.paid.settledPeriod, bills: [{ ...checks.owing.bills[0], periodStart: '2026-10-01T15:00:00Z', periodEnd: '2026-11-01T15:00:00Z' }] };
  const html = render({ filter: 'attention', selectedMonth: '2026-10', checks: { ...checks, owing: older } });
  assert.match(html, /October 2026/);
  assert.match(html, /\$35\.00 unpaid/);
});
test('annual coverage and an adjusted bill have explicit reasons instead of a false monthly payment', () => {
  const annual = render({ filter: 'current', checks: { ...checks, paid: { ...checks.paid, label: 'Covered by annual payment' } } });
  assert.match(annual, />Paid</);
  assert.match(annual, />Annual</);
  assert.doesNotMatch(annual, /November paid/);
  const adjusted = render({ filter: 'current', checks: { ...checks, paid: { ...checks.paid, label: 'Nothing due — bill adjusted' } } });
  assert.match(adjusted, /Nothing due/);
  assert.doesNotMatch(adjusted, /November paid/);
});
test('before the first-of-month collection time, a previous paid period does not mark the new month paid', () => {
  const html = render({ filter: 'current', checks: { ...checks, paid: { ...checks.paid, label: 'Next payment upcoming' } }, checkedAt: '2026-12-01T06:30:00Z' });
  assert.match(html, /December 2026/);
  assert.match(html, /Not due yet/);
  assert.doesNotMatch(html, /December paid/);
});
test('unverified records share Needs attention with unpaid bills, with distinct reasons and unpaid first', () => {
  const html = render({ filter: 'attention', checks });
  assert.match(html, /Check payment/);
  assert.match(html, /Not verified/);
  assert.doesNotMatch(html, /Current bill settled/);
  assert.match(html, /\$35\.00 unpaid/);
  assert.ok(html.indexOf('A Student With A Long Name') < html.indexOf('>unknown</span>'));
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 2, 'only the two requested lists');
});
test('cold loading and connection failure never claim everyone has paid', () => {
  const loading = render({ data: false });
  assert.match(loading, /Checking payments/);
  assert.match(loading, /animate-spin/);
  assert.match(loading, /aria-busy="true"/);
  assert.doesNotMatch(loading, /No unpaid bills found/);
  const failure = render({ data: false, error: 'connection failed' });
  assert.match(failure, /Couldn’t refresh payments/);
  assert.doesNotMatch(failure, /No unpaid bills found in the checked records/);
});
test('dropdown offers class months and switching does not display another month’s cached balances', () => {
  const html = render({ checks, selectedMonth: '2026-10', responseMonth: '2026-11' });
  assert.match(html, /aria-label="Billing month"/);
  assert.match(html, /value="2026-09"/);
  assert.match(html, /value="2026-10" selected/);
  assert.match(html, /animate-spin/);
  assert.doesNotMatch(html, /\$35\.00 unpaid/);
});
