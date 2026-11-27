import {readFile} from 'node:fs/promises';
import {fixture,actors,asUser} from '../tests/helpers/read-access-fixture.mjs';

// Local PostgreSQL/WASM measurements with synthetic identities, the captured
// policy definitions and real RPC bodies. Never connects to a hosted database.
const db=await fixture();
async function measure() {
  const out={};
  for(const [name,user,sql,args] of [
    ['ownProfile',actors.admin,'select id,account_type from profiles where id=$1',[actors.admin]],
    ['profileList',actors.admin,'select id,account_type from profiles order by id',[]],
    ['browse',actors.admin,"select get_mosque_programs_snapshot('masjid-100')",[]],
    ['teacherClasses',actors.director,"select get_teacher_programs_snapshot('masjid-100')",[]],
    ['notificationCounts',actors.director,"select get_notification_counts('masjid-100','teacher')",[]],
    ['guestBrowse',null,"select get_mosque_programs_snapshot('masjid-100')",[]],
  ]) out[name]=await asUser(db,user,async()=>{
    const times=[];let nodes=0;
    for(let i=0;i<5;i++) {
      const [{['QUERY PLAN']: [plan]}]=(await db.query(`explain(analyze,buffers,timing off,format json) ${sql}`,args)).rows;
      times.push(plan['Planning Time']+plan['Execution Time']);
      nodes=0;function walk(n){nodes++;for(const child of n.Plans??[])walk(child);}walk(plan.Plan);
    }
    times.sort((a,b)=>a-b);
    return{medianMs:Number(times[2].toFixed(3)),planNodes:nodes};
  });
  return out;
}
try {
  const before=await measure();
  await db.exec(await readFile(new URL('../supabase/migrations/20261127174834_consolidate_read_access_checks.sql',import.meta.url),'utf8'));
  const after=await measure();
  console.log(JSON.stringify({environment:'Local PGlite; synthetic data; not production latency',samplesPerQuery:5,before,after},null,2));
} finally {await db.close();}
