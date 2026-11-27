import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
before(async () => {
  await db.exec(`create role anon; create role authenticated;
    create table mosques(id uuid primary key, slug text);
    create table programs(id uuid primary key, mosque_id uuid, title text, publication_status text,
      is_active boolean default true, created_at timestamptz default now());
    insert into mosques values ('${id(1)}','assiddiq'),('${id(2)}','other');
    insert into programs(id,mosque_id,title,publication_status) values
      ('${id(10)}','${id(1)}','Al Tarteel Quran Program','published'),
      ('${id(11)}','${id(1)}','Al Tarteel Quran Program','hidden'),
      ('${id(12)}','${id(2)}','Al Tarteel Quran Program','published'),
      ('${id(13)}','${id(1)}','Private draft','draft');
    alter table programs enable row level security;
    create policy public_programs on programs for select to anon,authenticated
      using(is_active and publication_status in ('published','hidden'));
    grant select on programs,mosques to anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261126233652_public_program_links_and_thumbnail_display.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
async function isolated(work) {
  await db.exec('begin');
  try { await work(); } finally { await db.exec('rollback'); }
}
async function program(n) { return (await db.query('select * from programs where id=$1',[id(n)])).rows[0]; }

test('existing public classes receive distinct tenant-scoped slugs; drafts remain unlisted', async () => {
  assert.equal((await program(10)).public_slug,'al-tarteel-quran-program');
  assert.equal((await program(11)).public_slug,'al-tarteel-quran-program-2');
  assert.equal((await program(12)).public_slug,'al-tarteel-quran-program');
  assert.equal((await program(13)).public_slug,null);
});

test('publishing allocates the URL once and later title edits retain it', () => isolated(async () => {
  await db.query("update programs set publication_status='published' where id=$1",[id(13)]);
  assert.equal((await program(13)).public_slug,'private-draft');
  await db.query("update programs set title='A completely new title',publication_status='draft' where id=$1",[id(13)]);
  assert.equal((await program(13)).public_slug,'private-draft');
}));

test('allocated links cannot be renamed or moved across tenants', async () => {
  await assert.rejects(isolated(() => db.query("update programs set public_slug='replacement' where id=$1",[id(10)])), /permanent/);
  await assert.rejects(isolated(() => db.query('update programs set mosque_id=$1 where id=$2',[id(2),id(10)])), /permanent/);
});

test('new classes handle collisions, non-Latin titles, and reserved UUID/new paths', () => isolated(async () => {
  const cases = [
    [20,'Al Tarteel Quran Program','al-tarteel-quran-program-3'],
    [21,'New','class-new'], [22,'مدرسة','class'], [23,id(99),`class-${id(99)}`],
  ];
  for (const [n,title,expected] of cases) {
    await db.query("insert into programs(id,mosque_id,title,publication_status) values($1,$2,$3,'published')",[id(n),id(1),title]);
    assert.equal((await program(n)).public_slug,expected);
  }
}));

test('anonymous resolver is tenant-scoped and respects visibility after a class is unpublished', () => isolated(async () => {
  await db.query("update programs set publication_status='draft' where id=$1",[id(10)]);
  await db.exec('set local role anon');
  const resolve = async (tenant, reference) => (await db.query('select * from resolve_public_program_link($1,$2)',[tenant,reference])).rows;
  assert.deepEqual(await resolve('assiddiq','al-tarteel-quran-program'),[]);
  assert.equal((await resolve('other','AL-TARTEEL-QURAN-PROGRAM'))[0].program_id,id(12));
  assert.equal((await resolve('assiddiq','al-tarteel-quran-program-2'))[0].program_id,id(11));
  assert.deepEqual(await resolve('unknown','al-tarteel-quran-program'),[]);
}));

