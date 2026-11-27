import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actors,id,fixture,asUser,visibleRows} from './helpers/read-access-fixture.mjs';

const migration=await readFile(new URL('../supabase/migrations/20261127174834_consolidate_read_access_checks.sql',import.meta.url),'utf8');
let db,baseline,writesBefore,snapshotBaseline,writeBaseline;
async function writeChecks(user) {
  const results=[];
  for(const [sql,args] of [
    ['update profiles set full_name=$1 where id=$2 returning id',['Updated',user??actors.outsider]],
    ['update profiles set full_name=$1 where id=$2 returning id',['Updated',actors.director]],
    ["update enrollments set status='withdrawn' where id=$1 returning id",[id(502)]],
  ]) {
    try { results.push(await asUser(db,user,async()=>({rows:(await db.query(sql,args)).rows}))); }
    catch(error){ results.push({error:error.code}); }
  }
  return results;
}
async function snapshots(user) {
  return asUser(db,user,async()=>{
    const result={};
    for(const [name,sql,args] of [
      ['browse','select get_mosque_programs_snapshot($1) as result',['masjid-100']],
      ['detail','select get_program_detail_snapshot($1,$2,$3) as result',['masjid-100',id(101),'public']],
      ...(user ? [
        ['apply','select get_program_apply_snapshot($1,$2) as result',['masjid-100',id(101)]],
        ['teacher','select get_teacher_programs_snapshot($1) as result',['masjid-100']],
        ['badges','select get_notification_counts($1,$2) as result',['masjid-100',user===actors.parent || user===actors.student || user===actors.child ? 'student' : 'teacher']],
        ['finances','select get_program_finances_snapshot($1,$2) as result',['masjid-100',id(101)]],
      ] : []),
    ]) result[name]=(await db.query(sql,args)).rows[0].result;
    return result;
  });
}
before(async()=>{
  db=await fixture();baseline=new Map();
  snapshotBaseline=new Map();writeBaseline=new Map();
  for(const user of [null,...Object.values(actors)]) {
    baseline.set(user,await visibleRows(db,user));
    snapshotBaseline.set(user,await snapshots(user));
    writeBaseline.set(user,await writeChecks(user));
  }
  writesBefore=(await db.query("select tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and cmd<>'SELECT' order by tablename,policyname")).rows;
  await db.exec(migration);
});
after(async()=>{await db?.close();});

for(const [name,user] of [['guest',null],...Object.entries(actors)]) test(`${name}: visible profiles, memberships, enrollments and granular permissions match the original policies`,async()=>{
  assert.deepEqual(await visibleRows(db,user),baseline.get(user));
  assert.deepEqual(await snapshots(user),snapshotBaseline.get(user));
  assert.deepEqual(await writeChecks(user),writeBaseline.get(user));
});
test('own profile remains visible and another masjid admin gains no cross-tenant enrollment access',async()=>{
  assert.ok((await visibleRows(db,actors.student)).profiles.includes(actors.student));
  assert.equal((await visibleRows(db,actors.otherAdmin)).enrollments.includes(id(501)),false);
  assert.equal((await visibleRows(db,null)).enrollments.length,0);
});
test('write and ALL policies remain byte-for-byte equivalent',async()=>{
  const actual=(await db.query("select tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and cmd<>'SELECT' order by tablename,policyname")).rows;
  assert.deepEqual(actual,writesBefore);
});
test('helpers are invoker functions in a non-public schema, and RLS stays enabled',async()=>{
  const functions=(await db.query("select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='madrasa_rls'")).rows;
  assert.equal(functions.length,3);assert.ok(functions.every(f=>f.prosecdef===false));
  assert.ok((await db.query("select relrowsecurity from pg_class where oid in ('profiles'::regclass,'mosque_memberships'::regclass,'enrollments'::regclass)")).rows.every(r=>r.relrowsecurity));
});
test('migration can be rerun without capturing its own policy or changing permissions',async()=>{
  await db.exec(migration);
  assert.deepEqual(await visibleRows(db,actors.parent),baseline.get(actors.parent));
});
test('new restrictive rules still constrain the fast own-row path',async()=>{
  await db.exec('begin');
  try {
    await db.exec("create policy test_restriction on profiles as restrictive for select to authenticated using (false)");
    await db.query("select set_config('test.user',$1,true)",[actors.student]);await db.exec('set local role authenticated');
    assert.equal((await db.query('select id from profiles where id=$1',[actors.student])).rows.length,0);
  } finally {await db.exec('rollback');}
});
test('a policy restricted to authenticated does not execute for anonymous users',async()=>{
  await asUser(db,null,async()=>{const rows=(await db.query('select id from profiles')).rows;assert.ok(rows.length>0);});
});
test('rollback restores captured policies and visible rows exactly; cleanup can be applied again',async()=>{
  const rollback=await readFile(new URL('../supabase/rollback/20261127174834_restore_read_access_checks.sql',import.meta.url),'utf8');
  await db.exec(rollback);
  for(const user of [null,actors.admin,actors.parent,actors.inactiveInstructor]) assert.deepEqual(await visibleRows(db,user),baseline.get(user));
  await db.exec(migration);
  assert.deepEqual(await snapshots(actors.director),snapshotBaseline.get(actors.director));
});
