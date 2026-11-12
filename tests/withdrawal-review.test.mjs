import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real handler with isolated service/Stripe adapters. No outbound
// requests, real database writes, notifications, subscriptions or refunds.
const source = await readFile(new URL('../src/app/api/withdrawal-requests/review/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(options = {}) {
  const events = [];
  const payment = { id: 'payment', amount_cents: 10000, currency: 'cad', stripe_charge_id: 'ch_same', stripe_payment_intent_id: 'pi_same' };
  const records = {
    withdrawal_requests: { id: 'request', program_id: 'program', student_profile_id: 'student', parent_profile_id: 'parent', status: options.reviewed ? 'approved' : 'pending' },
    programs: { title: 'Class', mosque_id: 'mosque', publication_status: options.archived ? 'archived' : 'published', lifecycle_operation_id: null },
    mosques: { slug: 'demo' }, program_subscriptions: { id: 'subscription' }, program_payments: payment,
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }) },
    rpc: async (name) => {
      events.push(name);
      return { data: name === 'can_manage_program_enrollments' ? options.enrollmentAccess !== false : options.financeAccess !== false, error: null };
    },
    from(table) {
      let update;
      const chain = {
        select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
        update(value) { update = value; return chain; },
        maybeSingle: async () => ({ data: records[table], error: null }),
        then(resolve, reject) {
          return Promise.resolve().then(() => { if (update) events.push(`update:${table}:${update.status ?? 'link'}`); return { error: null }; }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const adapters = {
    '@/lib/stripe/subscriptions': { cancelProgramSubscription: async () => { events.push('cancel'); } },
    '@/lib/supabase/service': { createSupabaseServiceClient: () => db },
    '@/lib/push/send-push': { sendPushNotification: async () => {} },
    '@/lib/email/resend': { getTenantAppUrl: () => 'https://example.test' },
    '@/lib/email/notifications': { sendProfileNotificationEmails: async () => {} },
    '@/lib/monitoring/log-error': { logServerError: async () => {} },
    '@/lib/finance/audit': { recordFinanceAuditEvent: async () => { events.push('audit'); } },
    '@/lib/finance/refundable-charge': { resolveRefundableCharge: async () => {
      events.push('validate-charge');
      if (options.chargeError) throw new Error('Charge unavailable');
      return { paymentIntentId: 'pi_same', charge: { id: 'ch_same', amount: 10000, amount_refunded: options.alreadyRefunded ?? 0 } };
    } },
    '@/lib/stripe/server': { shouldUseStripeConnect: () => false, getStripe: () => ({ refunds: { create: async () => { events.push('refund'); return { id: 're_test' }; } } }) },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, Response, require: name => {
    if (!adapters[name]) throw new Error(`Unexpected dependency ${name}`);
    return adapters[name];
  } });
  return {
    events,
    async review(amount = 0, status = 'approved') {
      return exports.POST(new Request('https://example.test/api/withdrawal-requests/review', {
        method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
        body: JSON.stringify({ withdrawalRequestId: 'request', status, refundAmountCents: amount }),
      }));
    },
  };
}

test('enrollment permission, not an unrelated class-editor permission, authorizes review', async () => {
  const f = fixture({ enrollmentAccess: false });
  assert.equal((await f.review()).status, 403);
  assert.deepEqual(f.events, ['can_manage_program_enrollments']);
});

test('refund permission is enforced before cancellation', async () => {
  const f = fixture({ financeAccess: false });
  assert.equal((await f.review(1000)).status, 403);
  assert.equal(f.events.includes('cancel'), false);
});

for (const [name, amount, options] of [
  ['over the recorded payment', 11000, {}],
  ['over the remaining Stripe balance', 2000, { alreadyRefunded: 9000 }],
  ['a charge that cannot be resolved', 1000, { chargeError: true }],
]) test(`refund ${name} cannot end the subscription`, async () => {
  const f = fixture(options);
  assert.equal((await f.review(amount)).status, 500);
  assert.equal(f.events.includes('cancel'), false);
  assert.equal(f.events.includes('refund'), false);
  assert.equal(f.events.some(event => event.startsWith('update:')), false);
});

test('approval without refund cancels once and ends enrollment; rejection changes no billing', async () => {
  const f = fixture();
  assert.equal((await f.review()).status, 200);
  assert.equal(f.events.filter(event => event === 'cancel').length, 1);
  assert.ok(f.events.includes('update:enrollments:withdrawn'));
  assert.equal(f.events.includes('refund'), false);
  const rejected = fixture();
  assert.equal((await rejected.review(0, 'rejected')).status, 200);
  assert.equal(rejected.events.includes('cancel'), false);
  assert.equal(rejected.events.some(event => event.startsWith('update:enrollments:')), false);
});

test('valid custom refund is validated first and only issued once', async () => {
  const f = fixture();
  assert.equal((await f.review(1000)).status, 200);
  assert.ok(f.events.indexOf('validate-charge') < f.events.indexOf('cancel'));
  assert.equal(f.events.filter(event => event === 'refund').length, 1);
});

test('archived classes and already reviewed requests do not change billing', async () => {
  for (const options of [{ archived: true }, { reviewed: true }]) {
    const f = fixture(options);
    assert.equal((await f.review()).status, 409);
    assert.equal(f.events.includes('cancel'), false);
  }
});
