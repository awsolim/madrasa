import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(await fs.readFile(new URL('../src/app/api/programs/[programId]/finance/billing-check/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function route({ user = 'director', permitted = true, failRead = false, failStudent = false } = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async token => { calls.push(['auth', token]); return { data: { user: user ? { id: user } : null }, error: null }; } },
    from: table => ({ select: columns => ({ eq: (field, value) => ({ limit: async () => {
      calls.push(['select', table, columns, field, value]);
      return { error: failRead ? new Error('database unavailable') : null, data: [
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
    if (name.endsWith('/finance/check-stripe-billing')) return { checkStripeBilling: async (_stripe, sub, options) => {
      calls.push(['stripe', sub, options.stripeAccount]);
      if (failStudent && sub === 'sub_b') throw new Error('Stripe timeout');
      return { group: 'current', label: 'Up to date', explanation: 'verified', bills: [], checkedAt: new Date().toISOString() };
    } };
    throw new Error(name);
  } });
  return { calls, run: (auth = 'Bearer signed-token') => exports.POST(new Request('https://madrasa.ca/api/programs/class/finance/billing-check', { method: 'POST', headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ programId: 'class' }) }) };
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
  assert.deepEqual(h.calls.filter(call => call[0] === 'stripe'), [['stripe', 'sub_a', 'acct_tenant'], ['stripe', 'sub_b', 'acct_tenant']]);
  assert.equal(h.calls.find(call => call[0] === 'select')[4], 'class');
  assert.equal((await response.json()).checks['child-a'].group, 'current');
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
