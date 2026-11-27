import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('checkout and webhook states work without losing existing subscriptions or allowing arbitrary states', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.program_subscriptions (
      id integer primary key, status text not null default 'checkout_started',
      amount_cents integer not null,
      constraint program_subscriptions_status_check check(status in ('active','canceled','ended'))
    );
    insert into program_subscriptions values (1,'active',10000),(2,'canceled',5000),(3,'ended',3000);
    alter table program_subscriptions enable row level security;`);
    await assert.rejects(db.exec(`insert into program_subscriptions(id,amount_cents) values (4,10000)`), error => error.code === '23514');
    const before = (await db.query('select * from program_subscriptions order by id')).rows;
    const migration = await readFile(new URL('../supabase/migrations/20261127230907_allow_checkout_subscription_statuses.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from program_subscriptions order by id')).rows, before);
    await db.exec(`insert into program_subscriptions(id,amount_cents) values (4,10000)`);
    assert.equal((await db.query('select status from program_subscriptions where id=4')).rows[0].status, 'checkout_started');
    for (const status of ['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused','paid','ended']) {
      await db.query('update program_subscriptions set status=$1 where id=4', [status]);
      assert.equal((await db.query('select status from program_subscriptions where id=4')).rows[0].status, status);
    }
    await assert.rejects(db.query('update program_subscriptions set status=$1 where id=4', ['misspelled_status']), error => error.code === '23514');
    await db.exec(migration);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='program_subscriptions'::regclass")).rows[0].relrowsecurity, true);
    assert.deepEqual((await db.query('select * from program_subscriptions where id<4 order by id')).rows, before);
  } finally { await db.close(); }
});
