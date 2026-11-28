import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const code = ts.transpileModule(await fs.readFile(new URL('../src/components/data/billing-roster.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function render({ filter = 'attention', checks = {}, error = null, data = true, checkedAt = '2026-11-27T18:00:00Z' } = {}) {
  let state = 0;
  const exports = {};
  vm.runInNewContext(code, { exports, Date, Intl, require: name => {
    if (name === 'react') return { ...React, useState: initial => React.useState(state++ === 0 ? filter : initial) };
    if (name === 'react/jsx-runtime') return jsx;
    if (name.endsWith('/student-record-file')) return { hasCurrentPaymentBypass: row => Boolean(row.request?.payment_bypassed) };
    if (name.endsWith('/client-cache')) return { getCachedSessionSnapshot: () => ({ user: { id: 'viewer' } }) };
    if (name.endsWith('/query-cache')) return { useCachedQuery: () => ({ data: data ? { checks, checkedAt } : undefined, error, refetch: async () => {} }) };
    if (name.endsWith('/use-refresh-on-return')) return { useRefreshOnReturn() {} };
    if (name.endsWith('/utils')) return { cn: (...items) => items.filter(Boolean).join(' ') };
    throw new Error(name);
  } });
  const row = (id, stripe = true) => ({ enrollment: { id, student_profile_id: id, status: 'active' }, student: { full_name: id === 'owing' ? 'A Student With A Long Name' : id }, parent: { full_name: 'Parent Name' }, subscription: stripe ? { stripe_subscription_id: `sub_${id}`, payment_type: 'monthly', amount_cents: 10000, currency: 'cad' } : null, paymentTerms: stripe ? { payment_type: 'monthly', amount_cents: 10000, currency: 'cad' } : { payment_type: 'waived' } });
  return renderToStaticMarkup(React.createElement(exports.BillingRoster, { program: { id: 'class', is_paid: true, monthly_billing_anchor: 'first_of_month', schedule_timezone: 'America/Resolute' }, rows: [row('owing'), row('paid'), row('unknown'), row('waived', false)], onOpenStudent() {}, onRefreshRows: async () => {} }));
}
const checks = {
  owing: { group: 'attention', label: 'Payment outstanding', explanation: '', bills: [{ id: 'in_due', amountCents: 3500, currency: 'cad', dueAt: '2026-11-01T15:00:00Z', periodStart: '2026-11-01T15:00:00Z', periodEnd: '2026-12-01T15:00:00Z' }] },
  paid: { group: 'current', label: 'Up to date', explanation: 'Current bill settled', bills: [], settledPeriod: { start: '2026-11-01T15:00:00Z', end: '2026-12-01T15:00:00Z', kind: 'paid', interval: 'month' } },
};
test('default list identifies the owing student, parent, unpaid balance and named month', () => {
  const html = render({ checks });
  assert.match(html, /A Student With A Long Name/);
  assert.match(html, /Parent: Parent Name/);
  assert.match(html, /\$35\.00 unpaid/);
  assert.match(html, /November 2026/);
  assert.doesNotMatch(html, /Current bill settled/);
  assert.match(html, /Could not verify/);
  assert.match(html, /Needs attention/);
  assert.match(html, /Payment status for November 2026/);
  assert.match(html, /Applications → Waiting Payment/);
});
test('in-order list includes settled and waived students without overdue rows', () => {
  const html = render({ filter: 'current', checks });
  assert.match(html, /Current bill settled/);
  assert.match(html, /November paid/);
  assert.match(html, /Waived/);
  assert.doesNotMatch(html, /A Student With A Long Name/);
});
test('the current month being paid does not conceal an older unpaid bill', () => {
  const older = { ...checks.owing, settledPeriod: checks.paid.settledPeriod, bills: [{ ...checks.owing.bills[0], periodStart: '2026-10-01T15:00:00Z', periodEnd: '2026-11-01T15:00:00Z' }] };
  const html = render({ checks: { ...checks, owing: older } });
  assert.match(html, /November paid/);
  assert.match(html, /October 2026/);
  assert.match(html, /\$35\.00 unpaid/);
});
test('annual coverage and an adjusted bill have explicit reasons instead of a false monthly payment', () => {
  const annual = render({ filter: 'current', checks: { ...checks, paid: { ...checks.paid, settledPeriod: { ...checks.paid.settledPeriod, interval: 'year' } } } });
  assert.match(annual, /Covered by annual payment/);
  assert.doesNotMatch(annual, /November paid/);
  const adjusted = render({ filter: 'current', checks: { ...checks, paid: { ...checks.paid, settledPeriod: { ...checks.paid.settledPeriod, kind: 'adjusted' } } } });
  assert.match(adjusted, /Nothing due for November — bill adjusted/);
  assert.doesNotMatch(adjusted, /November paid/);
});
test('before the first-of-month collection time, a previous paid period does not mark the new month paid', () => {
  const html = render({ filter: 'current', checks, checkedAt: '2026-12-01T06:30:00Z' });
  assert.match(html, /Payment status for December 2026/);
  assert.match(html, /Next payment upcoming/);
  assert.match(html, /previous billing period is settled/);
  assert.doesNotMatch(html, /December paid/);
});
test('unverified records share Needs attention with unpaid bills, with distinct reasons and unpaid first', () => {
  const html = render({ filter: 'attention', checks });
  assert.match(html, /Could not verify/);
  assert.match(html, /has not been checked/);
  assert.doesNotMatch(html, /Current bill settled/);
  assert.match(html, /\$35\.00 unpaid/);
  assert.ok(html.indexOf('A Student With A Long Name') < html.indexOf('>unknown</p>'));
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 3, 'two main groups plus Everyone');
});
test('cold loading and connection failure never claim everyone has paid', () => {
  const loading = render({ data: false });
  assert.match(loading, /Checking payment records/);
  assert.doesNotMatch(loading, /No unpaid bills found/);
  const failure = render({ data: false, error: 'connection failed' });
  assert.match(failure, /Could not check payments/);
  assert.doesNotMatch(failure, /No unpaid bills found in the checked records/);
});
