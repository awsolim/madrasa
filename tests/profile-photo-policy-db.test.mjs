import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create table public.profiles(id uuid primary key, full_name text, account_type text, avatar_url text);
    insert into profiles values
      ('${id(1)}','Student','student','https://old/photo'),
      ('${id(2)}','Parent','parent','https://old/photo'),
      ('${id(3)}','Child','child','https://old/photo'),
      ('${id(4)}','Teacher','teacher','https://staff/photo'),
      ('${id(5)}','Admin','admin','https://staff/photo');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261112130000_staff_only_profile_photos.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
async function isolated(work) { await db.exec('begin'); try { await work(); } finally { await db.exec('rollback'); } }

test('migration clears existing family photos and preserves staff photos and names', async () => {
  const rows = (await db.query('select * from profiles order by id')).rows;
  assert.deepEqual(rows.map(row => row.avatar_url), [null, null, null, 'https://staff/photo', 'https://staff/photo']);
  assert.deepEqual(rows.map(row => row.full_name), ['Student', 'Parent', 'Child', 'Teacher', 'Admin']);
});

test('new family profiles and direct photo updates cannot persist a custom image', () => isolated(async () => {
  for (const [n, type] of [[10, 'student'], [11, 'parent'], [12, null], [13, 'child']]) {
    await db.query(`insert into profiles(id,account_type,avatar_url) values ($1,$2,'https://lh3.googleusercontent.com/photo')`, [id(n), type]);
    await db.query(`update profiles set avatar_url='data:image/jpeg;base64,YWJjZA==' where id=$1`, [id(n)]);
    assert.equal((await db.query('select avatar_url from profiles where id=$1', [id(n)])).rows[0].avatar_url, null);
  }
}));

test('Google OAuth completion discards family pictures but retains the staff option', () => isolated(async () => {
  for (const [n, type] of [[20, 'student'], [21, 'parent'], [22, 'teacher']]) {
    await db.query(`insert into auth.users values ($1,$2)`, [id(n), JSON.stringify({ picture: 'https://lh3.googleusercontent.com/google-photo' })]);
    await db.query(`insert into profiles(id,avatar_url) values ($1,'https://lh3.googleusercontent.com/google-photo')`, [id(n)]);
    await db.query(`update profiles set account_type=$2 where id=$1`, [id(n), type]);
    const photo = (await db.query('select avatar_url from profiles where id=$1', [id(n)])).rows[0].avatar_url;
    assert.equal(photo, type === 'teacher' ? 'https://lh3.googleusercontent.com/google-photo' : null);
  }
}));

test('staff can configure and remove their photos, and changing to a family account removes the photo', () => isolated(async () => {
  await db.query(`update profiles set avatar_url='https://staff/new-photo' where id=$1`, [id(4)]);
  assert.equal((await db.query('select avatar_url from profiles where id=$1', [id(4)])).rows[0].avatar_url, 'https://staff/new-photo');
  await db.query(`update profiles set avatar_url=null where id=$1`, [id(4)]);
  await db.query(`update profiles set full_name='Updated Teacher' where id=$1`, [id(4)]);
  assert.equal((await db.query('select avatar_url from profiles where id=$1', [id(4)])).rows[0].avatar_url, null);
  await db.query(`update profiles set account_type='student' where id=$1`, [id(5)]);
  assert.equal((await db.query('select avatar_url from profiles where id=$1', [id(5)])).rows[0].avatar_url, null);
}));
