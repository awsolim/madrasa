import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as monthHelpers from '../src/lib/finance/billing-month.ts';
const code = ts.transpileModule(await fs.readFile(new URL('../src/app/api/programs/[programId]/finance/billing-check/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function route({ user = 'director', permitted = true, failRead = false, failStudent = false, oldSubscription = false } = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async token => { calls.push(['auth', token]); return { data: { user: user ? { id: user } : null }, error: null }; } },
    from: table => ({ select: columns => ({ eq: (field, value) => ({ maybeSingle: async () => ({ data: { schedule_timezone: 'UTC' }, error: null }), limit: async () => {
      calls.push(['select', table, columns, field, value]);
      return { error: failRead ? new Error('database unavailable') : null, data: table === 'program_payment_terms' ? oldSubscription ? [{ student_profile_id: 'child-a', stripe_subscription_id: 'sub_old' }] : [] : [
        { student_profile_id: 'child-a', stripe_subscription_id: 'sub_a', stripe_account_id: 'acct_tenant' },
        { student_profile_id: 'child-b', stripe_subscription_id: 'sub_b', stripe_account_id: 'acct_tenant' },
        { student_profile_id: 'waived', stripe_subscription_id: null, stripe_account_id: 'acct_tenant' },
      ] };
    } }) }) }),
  };
  const exports = {};
  vm.runInNewContext(code, { exports, Response, Date, require: name => {
    if (name.endsWith('/finance/auth')) return { requireProgramFinanceAccess: async (_db, program, actor) => {
      calls.push(['permission', program, actor]); return permitted ? { ok: true } : { ok: false, status: 403, error: 'Finance permission required' };
    } };
    if (name.endsWith('/supabase/service')) return { createSupabaseServiceClient: () => db };
    if (name.endsWith('/stripe/server')) return { getStripe: () => ({}), shouldUseStripeConnect: () => true };
    if (name.endsWith('/finance/billing-month')) return monthHelpers;
    if (name.endsWith('/finance/check-stripe-billing')) return { checkStripeBilling: async (_stripe, sub, options, _deadline, month) => {
      calls.push(['stripe', sub, options.stripeAccount, month?.value]);
      if (failStudent && sub === 'sub_b') throw new Error('Stripe timeout');
      return { group: 'current', label: 'Up to date', explanation: 'verified', bills: [], checkedAt: new Date().toISOString() };
    } };
    throw new Error(name);
  } });
  return { calls, run: (auth = 'Bearer signed-token', body) => exports.POST(new Request('https://madrasa.ca/api/programs/class/finance/billing-check', { method: 'POST', headers: auth ? { authorization: auth } : {}, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ programId: 'class' }) }) };
}
test('requires sign-in and finance permission before any Stripe or class reads', async () => {
  for (const [options, auth, status] of [[{}, '', 401], [{ user: null }, 'Bearer bad', 401], [{ permitted: false }, 'Bearer signed-token', 403]]) {
    const h = route(options);
    assert.equal((await h.run(auth)).status, status);
    assert.equal(h.calls.some(call => ['select', 'stripe'].includes(call[0])), false);
  }
});
test('scopes read to the authorized class and preserves the merchant account', async () => {
  const h = route(); const response = await h.run();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(h.calls.filter(call => call[0] === 'stripe'), [['stripe', 'sub_a', 'acct_tenant', undefined], ['stripe', 'sub_b', 'acct_tenant', undefined]]);
  assert.equal(h.calls.find(call => call[0] === 'select')[4], 'class');
  assert.equal((await response.json()).checks['child-a'].group, 'current');
});
test('validates month input before Stripe calls and rejects future months', async () => {
  for (const value of ['2026-13', '2026-00', '2100-01', '../2026-10', 123]) {
    const h = route();
    assert.equal((await h.run('Bearer signed-token', { month: value })).status, 400);
    assert.equal(h.calls.some(call => call[0] === 'stripe'), false);
  }
});
test('passes the selected month to Stripe checks and includes prior subscription IDs', async () => {
  const h = route({ oldSubscription: true });
  const response = await h.run('Bearer signed-token', { month: '2026-10' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).month, '2026-10');
  const calls = h.calls.filter(call => call[0] === 'stripe');
  assert.ok(calls.some(call => call[1] === 'sub_old'));
  assert.ok(calls.every(call => call[3] === '2026-10' && call[2] === 'acct_tenant'));
});
test('one failed check is unknown rather than in order; other students remain available', async () => {
  const h = route({ failStudent: true });
  const { checks } = await (await h.run()).json();
  assert.equal(checks['child-a'].group, 'current');
  assert.equal(checks['child-b'].group, 'review');
  assert.equal(checks.waived, undefined);
});
test('database failure does not return an empty all-clear', async () => {
  const h = route({ failRead: true });
  assert.equal((await h.run()).status, 503);
  assert.equal(h.calls.some(call => call[0] === 'stripe'), false);
});
