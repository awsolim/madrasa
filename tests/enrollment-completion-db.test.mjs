import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute the real completion functions and lifecycle guards in disposable
// PostgreSQL, with schema metadata and entirely synthetic registrations.
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
before(async () => {
  const catalog = JSON.parse(await readFile(new URL('./fixtures/read-access-catalog.json', import.meta.url), 'utf8'));
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    select set_config('request.jwt.claim.role','service_role',false);`);
  for (const table of catalog.tables) await db.exec(`create table public."${table.name}" (${table.columns.map(c => `"${c.name}" ${c.type}${c.name === 'id' ? ' default gen_random_uuid()' : ''}`).join(',')});`);
  for (const index of catalog.indexes) await db.exec(index);
  const read = path => readFile(new URL('../supabase/migrations/' + path, import.meta.url), 'utf8');
  await db.exec(await read('20260928140000_atomic_paid_enrollment_completion.sql'));
  await db.exec(await read('20260928150000_remove_overstrict_enrollment_billing_guard.sql'));
  await db.exec(await read('20261127230907_allow_checkout_subscription_statuses.sql'));
  const lifecycle = await read('20261109120000_program_lifecycle_operations.sql');
  for (const name of ['guard_class_admission','guard_class_checkout_creation','guard_archived_class_records']) {
    const start = lifecycle.indexOf(`create or replace function public.${name}()`);
    const end = lifecycle.indexOf('$$;',start) + 3;
    await db.exec(lifecycle.slice(start,end));
  }
  await db.exec(`alter table programs add column if not exists lifecycle_operation_id uuid;
    alter table programs add column if not exists access_ends_at timestamptz;
    create trigger guard_class_enrollment before insert or update on enrollments for each row execute function guard_class_admission();
    create trigger guard_class_application before insert or update on enrollment_requests for each row execute function guard_class_admission();
    create trigger guard_class_checkout_creation before insert or update on program_subscriptions for each row execute function guard_class_checkout_creation();
    create trigger guard_archived_records before insert or update or delete on enrollments for each row execute function guard_archived_class_records();
    insert into programs(id,mosque_id,is_paid,is_active,publication_status,lifecycle_status) values ('${id(1)}','${id(2)}',true,true,'published','active');
    insert into program_tracks(id,program_id) values ('${id(3)}','${id(1)}'),('${id(4)}','${id(1)}');
    insert into enrollment_requests(id,program_id,mosque_id,student_profile_id,parent_profile_id,status,payment_terms_id,payment_bypassed)
      values ('${id(5)}','${id(1)}','${id(2)}','${id(6)}','${id(7)}','approved','${id(8)}',false);
    insert into program_payment_terms(id,enrollment_request_id,program_id,student_profile_id,payment_type,status,amount_cents)
      values ('${id(8)}','${id(5)}','${id(1)}','${id(6)}','monthly','payment_required',10000);
    insert into enrollment_request_tracks(enrollment_request_id,program_track_id) values ('${id(5)}','${id(3)}'),('${id(5)}','${id(4)}');`);
});
after(() => db.close());
async function isolated(fn) { await db.exec('begin'); try { await fn(); } finally { await db.exec('rollback'); } }
const payload = extra => ({ enrollmentRequestId:id(5),programId:id(1),mosqueId:id(2),studentProfileId:id(6),parentProfileId:id(7),paymentTermsId:id(8),stripeCheckoutSessionId:'cs_synthetic',stripeSubscriptionId:'sub_synthetic',status:'active',isRecurring:true,paymentType:'monthly',amountCents:10000,currency:'cad',...extra });
const paid = extra => db.query('select finalize_paid_program_enrollment($1::jsonb) as result',[JSON.stringify(payload(extra))]);
const free = () => db.query('select finalize_no_payment_program_enrollment($1) as result',[id(5)]);

test('approved monthly registration completes atomically with both tracks, and repeated delivery creates no duplicate enrollment', () => isolated(async () => {
  const first = (await paid()).rows[0].result;
  const again = (await paid()).rows[0].result;
  assert.equal(first.enrollmentId,again.enrollmentId);
  assert.equal(first.subscriptionId,again.subscriptionId);
  assert.deepEqual(first.trackIds,[id(3),id(4)]);
  assert.equal((await db.query('select count(*)::int as n from enrollments')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from program_subscriptions')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from enrollment_tracks')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int as n from program_subscription_tracks')).rows[0].n,2);
  assert.ok((await db.query('select admission_completed_at from enrollment_requests')).rows[0].admission_completed_at);
  assert.equal((await db.query('select status from program_payment_terms')).rows[0].status,'active');
}));
test('annual recurring registration retains its approved amount and annual payment type', () => isolated(async () => {
  await paid({paymentType:'annual',amountCents:100000});
  assert.deepEqual((await db.query('select payment_type,amount_cents from program_subscriptions')).rows[0],{payment_type:'annual',amount_cents:100000});
}));
test('one-time paid registration completes using payment-intent evidence', () => isolated(async () => {
  await paid({isRecurring:false,stripeSubscriptionId:null,stripePaymentIntentId:'pi_synthetic',status:'paid',paymentType:'annual'});
  assert.equal((await db.query('select status from program_subscriptions')).rows[0].status,'paid');
  assert.equal((await db.query('select status from program_payment_terms')).rows[0].status,'paid');
}));
for (const [label,change] of [['wrong student',{studentProfileId:id(99)}],['wrong terms',{paymentTermsId:id(99)}],['missing session',{stripeCheckoutSessionId:null}],['missing subscription',{stripeSubscriptionId:null}],['unpaid recurring subscription',{status:'unpaid'}],['missing one-time payment',{isRecurring:false,stripeSubscriptionId:null,stripePaymentIntentId:null,status:'paid'}]]) {
  test(`paid completion rejects ${label} without writing enrollment`, () => isolated(async () => {
    await assert.rejects(paid(change));
  }));
}
test('pending applications cannot complete registration', () => isolated(async () => {
  await db.exec("update enrollment_requests set status='pending'");
  await assert.rejects(paid(),/Approved enrollment request/);
}));
for (const kind of ['free','waived']) test(`${kind} registration completes without a Stripe subscription`, () => isolated(async () => {
  await db.query('update program_payment_terms set payment_type=$1',[kind]);
  if(kind==='free') await db.exec('update programs set is_paid=false');
  await free(); await free();
  assert.equal((await db.query('select count(*)::int as n from enrollments')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from program_subscriptions')).rows[0].n,0);
}));
test('paid registration cannot use the free-confirmation path without a waiver', () => isolated(async () => {
  await assert.rejects(free(),/Payment or an explicit waiver/);
}));
for (const state of ['paused','cancelled','archived']) test(`${state} classes reject completion and roll back subscription writes`, () => isolated(async () => {
  await db.query('update programs set lifecycle_status=$1',[state]);
  if(state==='archived') await db.exec("update programs set publication_status='archived'");
  await db.exec('savepoint attempt');
  await assert.rejects(paid(),/not accepting|read-only/);
  await db.exec('rollback to attempt');
  assert.equal((await db.query('select count(*)::int as n from enrollments')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from program_subscriptions')).rows[0].n,0);
}));
test('untrusted roles cannot call either completion function', async () => {
  const rows=(await db.query(`select proname,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated from pg_proc where proname in ('finalize_paid_program_enrollment','finalize_no_payment_program_enrollment')`)).rows;
  assert.equal(rows.length,2);
  for(const r of rows) { assert.equal(r.anon,false); assert.equal(r.authenticated,false); }
});
