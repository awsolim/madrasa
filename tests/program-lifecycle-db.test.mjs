import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL triggers and transactions in memory. Stripe is not contacted.
const db = new PGlite();
const actor = '10000000-0000-0000-0000-000000000001';
const student = '10000000-0000-0000-0000-000000000002';
const program = '20000000-0000-0000-0000-000000000001';

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.profiles(id uuid primary key);
    create table public.programs(id uuid primary key, lifecycle_status text default 'active', publication_status text default 'published',
      application_status text default 'accepting', accepting_applications boolean default true, is_active boolean default true, updated_at timestamptz);
    create function public.can_manage_program(uuid, uuid) returns boolean language sql as $$ select $2 = '${actor}'::uuid $$;
    create table public.enrollments(id uuid default gen_random_uuid(), program_id uuid, student_profile_id uuid, status text default 'active' check(status in ('active','withdrawn','kicked')));
    create table public.program_subscriptions(id uuid default gen_random_uuid(), program_id uuid, stripe_subscription_id text, stripe_checkout_session_id text, status text);
    create table public.program_payment_terms(program_id uuid, status text, updated_at timestamptz);
    create table public.enrollment_requests(program_id uuid, student_profile_id uuid, status text, admission_completed_at timestamptz, reviewed_by uuid, reviewed_at timestamptz, review_note text, student_dismissed_at timestamptz);
    create table public.withdrawal_requests(program_id uuid, status text, reviewed_by uuid, reviewed_at timestamptz, decision_note text);
    create table public.program_student_invites(program_id uuid, revoked_at timestamptz);
    create table public.program_finance_audit_events(program_id uuid, student_profile_id uuid, actor_profile_id uuid, event_type text, summary text, metadata jsonb);
    create table public.program_teachers(program_id uuid); create table public.program_tracks(program_id uuid);
    create table public.program_sessions(program_id uuid); create table public.program_announcements(program_id uuid);
    create table public.program_student_notes(program_id uuid); create table public.program_attendance_records(program_id uuid);
    create table public.program_details(program_id uuid); create table public.program_outcomes(program_id uuid);
    create table public.program_faqs(program_id uuid); create table public.program_media(program_id uuid);
    create table public.program_content_sections(program_id uuid); create table public.program_session_cancellations(program_id uuid);
    create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261109120000_program_lifecycle_operations.sql', import.meta.url), 'utf8');
  // pg_cron itself requires the Supabase server. Keep the schedule call in the
  // test, using the stub above, and test the scheduled function directly below.
  await db.exec(migration.replace('create extension if not exists pg_cron with schema pg_catalog;', ''));
  await db.exec(`insert into profiles values ('${actor}'), ('${student}');`);
});
after(() => db.close());

async function fixture(action = 'end', ends = null, subscriptions = []) {
  await db.query(`insert into programs(id) values ($1)`, [program]);
  await db.query(`insert into enrollments(program_id,student_profile_id) values ($1,$2)`, [program, student]);
  const plan = { action, reason: 'Teacher unavailable', accessEndsAt: ends, students: [{ id: student, active: true }], subscriptions, checkouts: [] };
  const result = await db.query(`select begin_program_lifecycle_operation($1,$2,$3::jsonb) id`, [program, actor, JSON.stringify(plan)]);
  return result.rows[0].id;
}
async function isolated(fn) {
  await db.exec('begin');
  try { await fn(); } finally { await db.exec('rollback'); }
}
async function rejected(sql, params, pattern) {
  await db.exec('savepoint expected_failure');
  await assert.rejects(() => db.query(sql, params), pattern);
  await db.exec('rollback to expected_failure');
}

test('end closes applications, cancels requests, preserves records and finishes access', async () => isolated(async () => {
  const id = await fixture();
  await db.query(`insert into withdrawal_requests(program_id,status) values ($1,'pending')`, [program]);
  await db.query(`select finish_program_lifecycle_operation($1)`, [id]);
  await db.query(`select finalize_ended_classes()`);
  const row = (await db.query(`select * from programs where id=$1`, [program])).rows[0];
  assert.equal(row.lifecycle_status, 'cancelled');
  assert.equal(row.application_status, 'closed');
  assert.equal(row.lifecycle_operation_id, null);
  assert.equal((await db.query(`select status from enrollments`)).rows[0].status, 'withdrawn');
  assert.equal((await db.query(`select status from withdrawal_requests`)).rows[0].status, 'approved');
  assert.equal((await db.query(`select count(*)::int count from program_finance_audit_events`)).rows[0].count, 1);
  // Finishing again does not duplicate the operation audit event.
  await db.query(`select finish_program_lifecycle_operation($1)`, [id]);
  assert.equal((await db.query(`select count(*)::int count from program_finance_audit_events`)).rows[0].count, 1);
}));

test('future access remains active until the recorded deadline', async () => isolated(async () => {
  const id = await fixture('end', '2099-01-01T00:00:00Z');
  await db.query(`select finish_program_lifecycle_operation($1)`, [id]);
  await db.query(`select finalize_ended_classes()`);
  assert.equal((await db.query(`select status from enrollments`)).rows[0].status, 'active');
  assert.equal((await db.query(`select status from program_lifecycle_operations`)).rows[0].status, 'scheduled');
  await db.query(`update programs set access_ends_at = now() - interval '1 second' where id=$1`, [program]);
  await db.query(`select finalize_ended_classes()`);
  assert.equal((await db.query(`select status from enrollments`)).rows[0].status, 'withdrawn');
}));

test('unfinished Stripe work prevents finalization', async () => isolated(async () => {
  const id = await fixture('end', null, [{ id: 'subscription-1' }]);
  await rejected(`select finish_program_lifecycle_operation($1)`, [id], /Billing work is unfinished/);
  assert.notEqual((await db.query(`select lifecycle_operation_id from programs`)).rows[0].lifecycle_operation_id, null);
}));

test('admissions cannot slip in during a lifecycle operation', async () => isolated(async () => {
  await fixture();
  await rejected(`insert into enrollments(program_id,student_profile_id) values ($1,$2)`, [program, actor], /not accepting enrollments/);
  await rejected(`insert into enrollment_requests(program_id,student_profile_id,status) values ($1,$2,'pending')`, [program, actor], /not accepting admissions/);
}));

test('pause retains students and closes applications; resume stays closed to applicants', async () => isolated(async () => {
  const id = await fixture('pause');
  await db.query(`select finish_program_lifecycle_operation($1)`, [id]);
  assert.equal((await db.query(`select lifecycle_status from programs`)).rows[0].lifecycle_status, 'paused');
  assert.equal((await db.query(`select status from enrollments`)).rows[0].status, 'active');
  const plan = { action: 'resume', reason: 'Teacher returned', students: [], subscriptions: [], checkouts: [] };
  plan.students = [{ id: student, active: true }];
  const resume = (await db.query(`select begin_program_lifecycle_operation($1,$2,$3::jsonb) id`, [program, actor, JSON.stringify(plan)])).rows[0].id;
  await db.query(`select finish_program_lifecycle_operation($1)`, [resume]);
  assert.equal((await db.query(`select application_status from programs`)).rows[0].application_status, 'closed');
}));

test('archive refuses active enrollment and preserves read-only history after end', async () => isolated(async () => {
  const id = await fixture('archive');
  await rejected(`select finish_program_lifecycle_operation($1)`, [id], /End active enrollments/);
  await db.query(`update enrollments set status='withdrawn'`);
  await db.query(`select finish_program_lifecycle_operation($1)`, [id]);
  assert.equal((await db.query(`select publication_status from programs`)).rows[0].publication_status, 'archived');
  await rejected(`update enrollments set status='kicked'`, [], /read-only/);
}));

test('unauthorized staff cannot start an operation', async () => isolated(async () => {
  await db.query(`insert into programs(id) values ($1)`, [program]);
  await rejected(`select begin_program_lifecycle_operation($1,$2,$3::jsonb)`, [program, student, JSON.stringify({ action: 'end' })], /Director access required/);
}));

test('wizard and old delete writes cannot bypass the lifecycle workflow', async () => isolated(async () => {
  await db.query(`insert into programs(id) values ($1)`, [program]);
  await rejected(`update programs set lifecycle_status='paused'`, [], /Use Class lifecycle/);
  await rejected(`update programs set publication_status='archived'`, [], /Use Class lifecycle/);
}));

test('new payment links are rejected during a class update, while subscription cancellation sync is allowed', async () => isolated(async () => {
  await fixture('end');
  await rejected(`insert into program_subscriptions(program_id,stripe_checkout_session_id,status) values ($1,'cs_new','checkout_started')`, [program], /not accepting payments/);
  await db.query(`insert into program_subscriptions(program_id,stripe_subscription_id,status) values ($1,'sub_existing','active')`, [program]);
  await db.query(`update program_subscriptions set status='canceled'`);
  assert.equal((await db.query(`select status from program_subscriptions`)).rows[0].status, 'canceled');
}));

test('archive cannot leave a recurring subscription behind', async () => isolated(async () => {
  const id = await fixture('archive');
  await db.query(`update enrollments set status='withdrawn'`);
  await db.query(`insert into program_subscriptions(program_id,stripe_subscription_id,status) values ($1,'sub_existing','active')`, [program]);
  await rejected(`select finish_program_lifecycle_operation($1)`, [id], /End all recurring subscriptions/);
}));

test('service helpers and direct operation edits are not available to ordinary authenticated accounts', async () => {
  const permissions = (await db.query(`select
    has_function_privilege('authenticated', 'public.finish_program_lifecycle_operation(uuid)', 'execute') as finish,
    has_function_privilege('authenticated', 'public.begin_program_lifecycle_operation(uuid,uuid,jsonb)', 'execute') as begin,
    has_table_privilege('authenticated', 'public.program_lifecycle_operations', 'update') as edit`)).rows[0];
  assert.deepEqual(permissions, { finish: false, begin: false, edit: false });
});
