import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable in-memory PostgreSQL; no Docker, external database, email or Stripe.
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [parent, child, teacher, outsider, mosque, program, track] = [1, 2, 3, 4, 5, 6, 7].map(id);
before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table mosques(id uuid primary key, slug text);
    create table profiles(id uuid primary key, account_type text, full_name text);
    create table programs(id uuid primary key, mosque_id uuid, teacher_profile_id uuid, director_profile_id uuid,
      is_active boolean, start_date date, end_date date, created_at timestamptz);
    create table parent_child_links(mosque_id uuid, parent_profile_id uuid, child_profile_id uuid);
    create table enrollments(id uuid primary key, program_id uuid, student_profile_id uuid, program_track_id uuid, status text, created_at timestamptz);
    create table enrollment_tracks(enrollment_id uuid, program_track_id uuid);
    create table enrollment_requests(id uuid primary key, program_id uuid, mosque_id uuid, student_profile_id uuid, parent_profile_id uuid,
      status text, admission_completed_at timestamptz, requested_at timestamptz, reviewed_at timestamptz, student_dismissed_at timestamptz, teacher_dismissed_at timestamptz);
    create table withdrawal_requests(id uuid primary key, program_id uuid, mosque_id uuid, student_profile_id uuid, parent_profile_id uuid,
      requested_by uuid, status text, reviewed_at timestamptz, requested_at timestamptz, student_dismissed_at timestamptz, teacher_dismissed_at timestamptz,
      reason text, reviewed_by uuid, decision_note text);
    create table program_teachers(id uuid primary key, program_id uuid, teacher_profile_id uuid, role text, can_view_applications boolean, can_decide_applications boolean, can_manage_enrollments boolean default false);
    create table program_instructor_events(id uuid primary key, program_id uuid, assignment_id uuid, teacher_profile_id uuid, event_type text);
    create table program_track_switch_requests(id uuid primary key, program_id uuid, status text, requested_at timestamptz);
    create table program_student_notes(id uuid primary key, mosque_id uuid, student_profile_id uuid, seen_at timestamptz);
    create table program_announcements(id uuid primary key, program_id uuid, target_program_track_ids uuid[], created_at timestamptz, deleted_at timestamptz);
    create table program_announcement_receipts(announcement_id uuid, profile_id uuid, read_at timestamptz, dismissed_at timestamptz);
    create table teacher_notification_state(user_id uuid, notification_key text, seen_at timestamptz, dismissed_at timestamptz);
    create table program_payments(id uuid primary key, program_id uuid, student_profile_id uuid, parent_profile_id uuid,
      amount_cents integer, currency text, paid_at timestamptz, receipt_url text);
    create table program_subscriptions(program_id uuid, student_profile_id uuid, stripe_subscription_id text, status text, payment_type text, amount_cents integer, payment_waived boolean, updated_at timestamptz default now());
    create table program_finance_audit_events(id uuid primary key, program_id uuid, student_profile_id uuid, event_type text, created_at timestamptz, metadata jsonb);
    create function can_manage_program_finances(uuid, uuid) returns boolean language sql stable as $$ select $2 = '${teacher}'::uuid $$;
    create function can_manage_program_enrollments(uuid, uuid) returns boolean language sql stable as $$
      select $1 = '${program}'::uuid and ($2 = '${teacher}'::uuid or exists(select 1 from program_teachers where program_id = $1 and teacher_profile_id = $2 and can_manage_enrollments)) $$;
    create function can_view_program_applications(uuid, uuid) returns boolean language sql stable as $$
      select $1 = '${program}'::uuid and ($2 = '${teacher}'::uuid or exists(select 1 from program_teachers where program_id = $1 and teacher_profile_id = $2 and can_view_applications)) $$;
    create function can_decide_program_applications(uuid, uuid) returns boolean language sql stable as $$ select $1 = '${program}'::uuid and $2 = '${teacher}'::uuid $$;
    grant select on all tables in schema public to authenticated;
    insert into mosques values ('${mosque}', 'demo');
    insert into profiles values ('${parent}', 'parent', 'Parent Name'), ('${child}', 'student', 'Child Name'), ('${teacher}', 'teacher', 'Director'), ('${outsider}', 'student', 'Other');
    insert into programs values ('${program}', '${mosque}', '${teacher}', '${teacher}', true, '2026-01-01', null, '2026-01-01');
    insert into parent_child_links values ('${mosque}', '${parent}', '${child}');
    insert into enrollments values ('${id(8)}', '${program}', '${child}', '${track}', 'active', '2026-01-01');
  `);
  for (const file of ['20260930170000_finance_reporting_views.sql', '20261110120000_compact_notification_counts.sql', '20261110130000_finance_summary_and_transaction_pages.sql', '20261112120000_program_withdrawal_review.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
});
after(() => db.close());
async function isolated(user, work) {
  await db.exec('begin');
  try { await db.query(`select set_config('test.user', $1, true)`, [user]); await work(); }
  finally { await db.exec('rollback'); }
}
async function counts(audience = 'student') {
  return (await db.query(`select get_notification_counts('demo', $1) result`, [audience])).rows[0].result;
}

test('parent badge preserves unread, pending confirmation, track targeting and seen keys', () => isolated(parent, async () => {
  await db.exec(`
    insert into enrollment_requests(id,program_id,mosque_id,student_profile_id,parent_profile_id,status,requested_at) values
      ('${id(10)}','${program}','${mosque}','${child}','${parent}','approved','2026-11-01T10:00:00.123456Z'),
      ('${id(11)}','${program}','${mosque}','${child}','${parent}','pending','2026-11-01T10:00:00Z');
    insert into teacher_notification_state values ('${parent}', '${id(10)}:approved:2026-11-01T10:00:00.123456+00:00', now(), null);
    insert into program_student_notes values ('${id(12)}','${mosque}','${child}',null), ('${id(13)}','${mosque}','${child}',now());
    insert into program_announcements values
      ('${id(20)}','${program}',array['${track}'::uuid],'2026-02-01',null),
      ('${id(21)}','${program}',array['${id(99)}'::uuid],'2026-02-01',null),
      ('${id(22)}','${program}',null,'2025-12-01',null),
      ('${id(23)}','${program}',null,'2026-02-01',now()),
      ('${id(24)}','${program}',null,'2026-02-01',null);
    insert into program_announcement_receipts values ('${id(24)}','${parent}',now(),null);
  `);
  assert.deepEqual(await counts(), { announcementCount: 1, noteCount: 1, requestCount: 1, actionRequired: true });
  // A seen confirmation remains actionable; a completed, seen decision does not.
  await db.exec(`update enrollment_requests set admission_completed_at = now() where id = '${id(10)}'`);
  assert.equal((await counts()).requestCount, 0);
  assert.equal((await counts()).actionRequired, false);
  await db.query(`select set_config('test.user', $1, true)`, [outsider]);
  assert.deepEqual(await counts(), { announcementCount: 0, noteCount: 0, requestCount: 0, actionRequired: false });
}));

test('director counts admissions, withdrawals, instructor events and transfers without double-counting joins', () => isolated(teacher, async () => {
  await db.exec(`
    insert into enrollment_requests(id,program_id,mosque_id,status,requested_at) values ('${id(30)}','${program}','${mosque}','pending','2026-11-01T10:00:00Z');
    insert into withdrawal_requests(id,program_id,status,requested_at) values ('${id(31)}','${program}','pending','2026-11-01T10:00:00Z');
    insert into program_teachers values ('${id(32)}','${program}','${outsider}','instructor',false,false);
    insert into program_instructor_events values ('${id(33)}','${program}','${id(32)}','${outsider}','joined');
    insert into program_track_switch_requests values ('${id(34)}','${program}','pending','2026-11-01T10:00:00Z');
  `);
  assert.equal((await counts('teacher')).requestCount, 4);
  await db.exec(`insert into teacher_notification_state values
    ('${teacher}','application:${id(30)}:2026-11-01T10:00:00+00:00',now(),null),
    ('${teacher}','instructor:joined:${id(33)}:${outsider}',null,now());`);
  assert.equal((await counts('teacher')).requestCount, 2);
  assert.equal((await counts('teacher')).actionRequired, true);
  await db.exec(`update enrollment_requests set admission_completed_at='2026-11-02T10:00:00Z'`);
  assert.equal((await counts('teacher')).requestCount, 3);
  await db.query(`select set_config('test.user', $1, true)`, [outsider]);
  assert.equal((await counts('teacher')).requestCount, 0);
  await db.exec(`update program_teachers set can_view_applications=true where teacher_profile_id='${outsider}'`);
  assert.equal((await counts('teacher')).requestCount, 1);
}));

test('finance summary matches legacy totals and projections without including transactions', () => isolated(teacher, async () => {
  await db.exec(`insert into program_payments values ('${id(40)}','${program}','${child}','${parent}',10000,'cad',now(),null);
    insert into program_subscriptions values
      ('${program}','${child}','sub_m','active','monthly',10000,false),
      ('${program}','${parent}','sub_a','active','annual',120000,false),
      ('${program}','${outsider}',null,'active','monthly',10000,true);`);
  const old = (await db.query(`select get_program_finance_analytics($1) result`, [program])).rows[0].result;
  const fresh = (await db.query(`select get_program_finance_overview($1) result`, [program])).rows[0].result;
  delete old.transactions;
  assert.deepEqual(fresh, old);
  assert.equal(fresh.projectedMonthlyCents, 20000);
}));

test('transaction pages include refunds once, deterministic ordering, parent search and bounded pages', () => isolated(teacher, async () => {
  for (let n = 100; n < 220; n++) await db.query(`insert into program_payments values ($1,$2,$3,$4,10000,'cad','2026-11-01',null)`, [id(n), program, child, parent]);
  for (const n of [41, 42]) await db.query(`insert into program_finance_audit_events values ($1,$2,$3,'payment_refund_issued',now(),$4)`, [id(n), program, child, JSON.stringify({ stripeRefundId: 're_same', programPaymentId: id(100), amountCents: 2500 })]);
  await db.query(`insert into program_finance_audit_events values ($1,$2,$3,'payment_refund_issued',now(),$4)`, [id(43), program, child, JSON.stringify({ amountCents: 'invalid' })]);
  const page = async (offset, limit = 50, search = '') => (await db.query(`select get_program_finance_transactions($1,$2,$3,$4) result`, [program, search, offset, limit])).rows[0].result;
  const first = await page(0), second = await page(50), third = await page(100);
  assert.equal(first.total, 121);
  assert.equal(first.entries[0].amountCents, -2500);
  assert.equal(first.entries[0].parentName, 'Parent Name');
  assert.equal(new Set([...first.entries, ...second.entries, ...third.entries].map(e => e.id)).size, 121);
  assert.equal((await page(0, 500)).entries.length, 100);
  assert.equal((await page(0, 50, 'parent name')).total, 121);
  assert.equal((await page(0, 50, 'refund')).total, 1);
  assert.equal((await page(0, 50, 'not a name')).total, 0);
}));

test('functions retain invoker rights, reject anonymous badges and deny unauthorized finance', () => isolated(outsider, async () => {
  await db.exec('set local role authenticated');
  assert.equal((await counts()).requestCount, 0);
  assert.equal((await db.query(`select get_program_finance_overview($1) result`, [program])).rows[0].result.hasAccess, false);
  await assert.rejects(db.query(`select get_program_finance_transactions($1)`, [program]), /Finance access required/);
}));

test('anonymous callers cannot execute either new notification or finance RPC', async () => {
  const privileges = (await db.query(`select
    has_function_privilege('anon','get_notification_counts(text,text)','execute') as badges,
    has_function_privilege('anon','get_program_finance_overview(uuid)','execute') as finances,
    (select bool_or(prosecdef) from pg_proc where proname in ('get_notification_counts','get_program_finance_overview','get_program_finance_transactions')) as definer`)).rows[0];
  assert.deepEqual(privileges, { badges: false, finances: false, definer: false });
});

test('a missing session cannot obtain badge counts', () => isolated('', async () => {
  await assert.rejects(counts(), /Sign in required/);
}));

test('badge aggregation obeys row-level visibility rather than bypassing it', () => isolated(parent, async () => {
  await db.exec(`insert into program_student_notes values ('${id(300)}','${mosque}','${child}',null);
    alter table program_student_notes enable row level security;
    create policy hidden_notes on program_student_notes for select to authenticated using (false);
    set local role authenticated;`);
  assert.equal((await counts()).noteCount, 0);
}));

test('withdrawals remain actionable after notification dismissal and show reviewed history separately', () => isolated(teacher, async () => {
  await db.exec(`insert into withdrawal_requests(id,program_id,student_profile_id,parent_profile_id,status,requested_at,reason,teacher_dismissed_at) values
    ('${id(401)}','${program}','${child}','${parent}','pending','2026-11-01','Moving away',now()),
    ('${id(402)}','${program}','${child}','${parent}','approved','2026-10-01',null,null);`);
  const pending = (await db.query(`select get_program_withdrawals($1) result`, [program])).rows[0].result;
  assert.equal(pending.pendingCount, 1);
  assert.equal(pending.total, 1);
  assert.equal(pending.requests[0].parentName, 'Parent Name');
  assert.equal(pending.requests[0].reason, 'Moving away');
  assert.equal(pending.pendingRequestIds[child], id(401));
  const history = (await db.query(`select get_program_withdrawals($1,true) result`, [program])).rows[0].result;
  assert.equal(history.requests[0].status, 'approved');
  assert.equal(history.pendingCount, 1);
}));

test('withdrawal access follows enrollment capability and hides billing from staff without finance permission', () => isolated(outsider, async () => {
  await db.exec(`insert into withdrawal_requests(id,program_id,student_profile_id,status) values ('${id(403)}','${program}','${child}','pending');
    insert into program_subscriptions(program_id,student_profile_id,stripe_subscription_id,status,payment_type) values ('${program}','${child}','sub_x','active','monthly');`);
  const fetch = async () => (await db.query(`select get_program_withdrawals($1) result`, [program])).rows[0].result;
  assert.equal((await fetch()).hasAccess, false);
  await db.exec(`insert into program_teachers values ('${id(404)}','${program}','${outsider}','instructor',false,false,true)`);
  const page = await fetch();
  assert.equal(page.hasAccess, true);
  assert.equal(page.canRefund, false);
  assert.equal(page.requests[0].hasSubscription, null);
  assert.equal(page.requests[0].latestPaymentCents, null);
  assert.equal((await db.query(`select get_program_withdrawals($1) result`, [id(999)])).rows[0].result.hasAccess, false);
}));

test('class action totals are independent of pending counts', () => isolated(teacher, async () => {
  await db.exec(`insert into enrollment_requests(id,program_id,status) values ('${id(405)}','${program}','pending'), ('${id(406)}','${program}','approved');
    insert into withdrawal_requests(id,program_id,status) values ('${id(407)}','${program}','pending');`);
  const result = (await db.query(`select get_class_action_counts('demo') result`)).rows[0].result[program];
  assert.deepEqual(result, { applications: 2, pendingApplications: 1, pendingWithdrawals: 1 });
  await db.query(`select set_config('test.user', $1, true)`, [outsider]);
  assert.deepEqual((await db.query(`select get_class_action_counts('demo') result`)).rows[0].result, {});
}));

test('deep links resolve requests beyond the first page and cannot cross class boundaries', () => isolated(teacher, async () => {
  for (let n = 500; n < 555; n++) await db.query(`insert into withdrawal_requests(id,program_id,student_profile_id,status,requested_at) values ($1,$2,$3,'pending','2026-11-01')`, [id(n), program, child]);
  const page = (await db.query(`select get_program_withdrawals($1,false,0,$2) result`, [program, id(500)])).rows[0].result;
  assert.equal(page.requests.length, 50);
  assert.equal(page.total, 55);
  assert.equal(page.selectedRequest.id, id(500));
  await db.query(`insert into withdrawal_requests(id,program_id,student_profile_id,status) values ($1,$2,$3,'pending')`, [id(600), id(999), child]);
  assert.equal((await db.query(`select get_program_withdrawals($1,false,0,$2) result`, [program, id(600)])).rows[0].result.selectedRequest, null);
}));
