import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const catalog = JSON.parse(await readFile(new URL('../fixtures/read-access-catalog.json', import.meta.url), 'utf8'));
export const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const actors = { admin: id(1), director: id(2), instructor: id(3), reviewer: id(4), decider: id(5), finance: id(6), student: id(7), parent: id(8), child: id(9), outsider: id(10), otherAdmin: id(11), otherDirector: id(12), inactiveInstructor: id(13), unverifiedInstructor: id(14), legacyAdmin: id(15) };
const quote = value => '"' + value.replaceAll('"', '""') + '"';
export function policySql(p) {
  return `create policy ${quote(p.policyname)} on public.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''};`;
}
export async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',auth.uid()) $$;
    grant usage on schema auth to public;
    set check_function_bodies=false;`);
  for (const t of catalog.tables) await db.exec(`create table public.${quote(t.name)} (${t.columns.map(c => `${quote(c.name)} ${c.type}`).join(',')});`);
  for (const f of catalog.functions) await db.exec(f);
  for (const f of JSON.parse(await readFile(new URL('../fixtures/read-snapshot-functions.json',import.meta.url),'utf8'))) await db.exec(f);
  for (const index of catalog.indexes) await db.exec(index);
  for (const p of catalog.policies) await db.exec(policySql(p));
  const flags=JSON.parse(await readFile(new URL('../fixtures/read-access-table-flags.json',import.meta.url),'utf8'));
  for (const f of flags) {
    if(f.rls)await db.exec(`alter table public.${quote(f.table)} enable row level security;`);
    if(f.forceRls)await db.exec(`alter table public.${quote(f.table)} force row level security;`);
  }
  await db.exec('grant select,insert,update,delete on all tables in schema public to anon,authenticated;');
  for(const f of flags) {
    if(!f.anonSelect)await db.exec(`revoke select on public.${quote(f.table)} from anon;`);
    if(!f.authSelect)await db.exec(`revoke select on public.${quote(f.table)} from authenticated;`);
  }
  // Preserve the authenticated-only helper's original execution boundary.
  await db.exec('revoke execute on function can_read_application_profile(uuid) from public,anon; grant execute on function can_read_application_profile(uuid) to authenticated;');
  async function insert(table, row) {
    const keys = Object.keys(row);
    await db.query(`insert into ${quote(table)} (${keys.map(quote).join(',')}) values (${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
  }
  for (const [name, actor] of Object.entries(actors)) await insert('profiles',{id:actor,full_name:name,account_type:/admin/i.test(name) ? 'admin' : name==='unverifiedInstructor' ? 'student' : /director|instructor|reviewer|decider|finance/i.test(name) ? 'teacher' : name==='parent' ? 'parent' : 'student'});
  for (const n of [100,200]) await insert('mosques',{id:id(n),slug:`masjid-${n}`,name:`Masjid ${n}`});
  await insert('programs',{id:id(101),mosque_id:id(100),title:'First class',director_profile_id:actors.director,teacher_profile_id:actors.director,is_active:true,publication_status:'published',lifecycle_status:'active'});
  await insert('programs',{id:id(201),mosque_id:id(200),title:'Other class',director_profile_id:actors.otherDirector,teacher_profile_id:actors.otherDirector,is_active:true,publication_status:'published',lifecycle_status:'active'});
  let counter=300;
  for(const [name,actor] of Object.entries(actors)) {
    if(['student','parent','child','outsider'].includes(name))continue;
    await insert('mosque_memberships',{id:id(counter++),mosque_id:id(name.startsWith('other')?200:100),profile_id:actor,role:name==='legacyAdmin'?'mosque_admin':/admin/i.test(name)?'admin':'teacher',status:name==='inactiveInstructor'?'inactive':'active',can_manage_programs:false});
    if(!/admin/i.test(name)) await insert('program_teachers',{
      id:id(counter++),program_id:id(name==='otherDirector'?201:101),teacher_profile_id:actor,role:['director','otherDirector'].includes(name)?'director':'instructor',
      can_view_applications:name==='reviewer',can_decide_applications:name==='decider',can_manage_finances:name==='finance',can_view_student_records:false,can_manage_enrollments:false,
    });
  }
  await insert('parent_child_links',{id:id(401),mosque_id:id(100),parent_profile_id:actors.parent,child_profile_id:actors.child});
  for(const [n,student,program,mosque,parent] of [[501,actors.student,101,100,null],[502,actors.child,101,100,actors.parent],[503,actors.outsider,201,200,null]]) {
    await insert('enrollments',{id:id(n),program_id:id(program),student_profile_id:student,status:'active'});
    await insert('enrollment_requests',{id:id(n+100),program_id:id(program),mosque_id:id(mosque),student_profile_id:student,parent_profile_id:parent,status:'pending'});
  }
  return db;
}
export async function asUser(db,user,work,role=user?'authenticated':'anon') {
  await db.exec('begin');
  try { await db.query("select set_config('test.user',$1,true)",[user??'']); await db.exec(`set local role ${quote(role)}`); return await work(); }
  finally { await db.exec('rollback'); }
}
export async function visibleRows(db,user) {
  return asUser(db,user,async()=>{
    const result={};
    for(const table of ['profiles','mosque_memberships','enrollments']) result[table]=(await db.query(`select id from ${table} order by id`)).rows.map(r=>r.id);
    const permissions = user ? (await db.query(`select can_manage_program_finances($1,$2) as finances,can_decide_program_applications($1,$2) as applications,can_manage_program_enrollments($1,$2) as enrollments`,[id(101),user])).rows[0] : null;
    return{...result,permissions};
  });
}
