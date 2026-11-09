// End-to-end smoke test. Creates labeled fixtures only in LOCAL Supabase and
// Stripe TEST mode. Keeps the archived fixture for inspection; sends no emails.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import './validate-test-environment.mjs';

const local = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(local.hostname), 'This test requires local Supabase.');
const origin = new URL(process.argv[2] || 'http://localhost:3100');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'This test requires a local test app.');
const db = createClient(local.href, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const admin = check(await db.from('profiles').select('id,email').eq('account_type', 'admin').limit(1).single());
const membership = check(await db.from('mosque_memberships').select('mosque_id').eq('profile_id', admin.id).eq('role', 'admin').eq('status', 'active').limit(1).single());
const link = check(await db.auth.admin.generateLink({ type: 'magiclink', email: admin.email }));
const userClient = createClient(local.href, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const signedIn = check(await userClient.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }));
const token = signedIn.session.access_token;
const suffix = randomUUID().slice(0, 8);
const program = check(await db.from('programs').insert({ mosque_id: membership.mosque_id, director_profile_id: admin.id, teacher_profile_id: admin.id,
  title: `[Sandbox] Lifecycle smoke ${suffix}`, publication_status: 'published', lifecycle_status: 'active', application_status: 'accepting',
  is_active: true, is_ongoing: true, is_paid: true, schedule_timezone: 'America/Edmonton', price_monthly_cents: 1000,
}).select('id').single());
const createdSubscriptions = [];

async function student(label, interval) {
  const id = randomUUID();
  check(await db.from('profiles').insert({ id, full_name: `[Sandbox] ${label} ${suffix}`, account_type: 'student' }));
  if (interval) {
    const paymentMethod = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
    const customer = await stripe.customers.create({ name: `[Sandbox] Lifecycle ${label} ${suffix}`, metadata: { lifecycle_smoke: suffix }, payment_method: paymentMethod.id, invoice_settings: { default_payment_method: paymentMethod.id } });
    const price = await stripe.prices.create({ currency: 'cad', unit_amount: interval === 'year' ? 10000 : 1000, recurring: { interval }, product_data: { name: `[Sandbox] Lifecycle ${suffix}` } });
    const live = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], metadata: { program_id: program.id, student_profile_id: id, lifecycle_smoke: suffix } });
    assert.equal(live.status, 'active');
    createdSubscriptions.push(live.id);
    check(await db.from('program_subscriptions').insert({ program_id: program.id, mosque_id: membership.mosque_id, student_profile_id: id, profile_id: id, stripe_subscription_id: live.id,
      stripe_customer_id: customer.id, stripe_price_id: price.id, payment_type: interval === 'year' ? 'annual' : 'monthly', amount_cents: price.unit_amount,
      status: live.status, currency: 'cad', current_period_start: new Date(live.items.data[0].current_period_start * 1000).toISOString(), current_period_end: new Date(live.items.data[0].current_period_end * 1000).toISOString() }));
  }
  check(await db.from('enrollments').insert({ program_id: program.id, student_profile_id: id, status: 'active' }));
  return id;
}
async function api(body) {
  const response = await fetch(new URL(`/api/programs/${program.id}/lifecycle`, origin), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.ok(response.ok, result.error || `HTTP ${response.status}`);
  return result;
}
async function action(kind) {
  const input = { action: kind, reason: 'Sandbox lifecycle verification', lastAccessDay: 'now' };
  const review = await api({ ...input, mode: 'preview' });
  assert.deepEqual(review.plan.blockers, [], review.plan.blockers.join('; '));
  const { operationId } = await api({ ...input, mode: 'start', hash: review.hash, confirm: true });
  for (let count = 0; count < 30; count++) {
    const progress = await api({ mode: 'continue', operationId });
    if (progress.done) return;
  }
  throw new Error('Operation did not complete in 30 steps.');
}

try {
  await student('Monthly', 'month');
  const individuallyPausedId = await student('Individual pause', 'month');
  await stripe.subscriptions.update(createdSubscriptions[1], { pause_collection: { behavior: 'void' } });
  check(await db.from('program_subscriptions').update({ payment_paused: true }).eq('program_id', program.id).eq('student_profile_id', individuallyPausedId));
  await student('Waived', null);
  await action('pause');
  assert.equal((await stripe.subscriptions.retrieve(createdSubscriptions[0])).pause_collection?.behavior, 'void');
  assert.equal(check(await db.from('enrollments').select('id').eq('program_id', program.id).eq('status', 'active')).length, 3);
  await action('resume');
  assert.equal((await stripe.subscriptions.retrieve(createdSubscriptions[0])).pause_collection, null);
  assert.equal((await stripe.subscriptions.retrieve(createdSubscriptions[1])).pause_collection?.behavior, 'void');
  await student('Annual', 'year');
  const annualReview = await api({ mode: 'preview', action: 'pause', reason: 'Sandbox annual guard check' });
  assert.ok(annualReview.plan.blockers.some((message) => message.includes('annual')));
  await action('end');
  for (const id of createdSubscriptions) assert.equal((await stripe.subscriptions.retrieve(id)).status, 'canceled');
  assert.equal(check(await db.from('enrollments').select('id').eq('program_id', program.id).eq('status', 'active')).length, 0);
  await action('archive');
  assert.equal((await api()).program.publication_status, 'archived');
  console.log(`PASS: sandbox program ${program.id} paused, resumed, guarded annual billing, ended, and archived. Fixtures retained locally for inspection. No notifications were requested.`);
} finally {
  // Only objects created by this test, only with a validated sk_test key. Avoid
  // leaving sandbox subscriptions renewing after a failed assertion.
  for (const id of createdSubscriptions) {
    const live = await stripe.subscriptions.retrieve(id);
    if (!['canceled', 'incomplete_expired'].includes(live.status)) await stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false });
  }
}
