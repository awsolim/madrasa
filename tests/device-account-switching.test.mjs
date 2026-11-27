import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as policy from '../src/lib/account-switching/policy.ts';

function moduleWithMocks(path, mocks, globals={}) {
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports={};
  new Function('require','exports',...Object.keys(globals),code)(name=>{
    if(name in mocks)return mocks[name]; throw new Error(`Unexpected import ${name}`);
  },exports,...Object.values(globals));
  return exports;
}
const owner=policy.SWITCH_OWNER_ID;
const teacher=policy.SWITCH_ACCOUNT_IDS[1];
const session=(id, suffix='one')=>({user:{id},access_token:`access-${suffix}`,refresh_token:`refresh-${suffix}`});
function storeFixture() {
  const values=new Map();
  const window={localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},dispatchEvent(){}};
  const store=moduleWithMocks('../src/lib/account-switching/device-store.ts',{'./policy':policy},{window,Event});
  return {store,values};
}
const project='https://project.supabase.co';
test('only the requested admin can initialize a device, and other projects/devices remain empty',()=>{
  const {store}=storeFixture();
  assert.throws(()=>store.enableDeviceAccounts(project,session(teacher)),/Only Amr/);
  store.enableDeviceAccounts(project,session(owner));
  assert.deepEqual(store.readDeviceAccounts(project).accounts.map(x=>x.id),[owner]);
  assert.equal(store.readDeviceAccounts('https://other.supabase.co'),null);
  assert.equal(storeFixture().store.readDeviceAccounts(project),null);
});
test('rotated sessions replace tokens; unrelated logins and passwords are never stored',()=>{
  const {store,values}=storeFixture();
  store.rememberDeviceSession(project,session(teacher));
  assert.equal(store.readDeviceAccounts(project),null);
  store.enableDeviceAccounts(project,session(owner));
  store.rememberDeviceSession(project,{...session(teacher),password:'not-to-be-saved'});
  store.rememberDeviceSession(project,session(teacher,'rotated'));
  store.rememberDeviceSession(project,session('unlisted-user'));
  const device=store.readDeviceAccounts(project);
  assert.equal(device.accounts.length,2);
  assert.equal(device.accounts.find(a=>a.id===teacher).refreshToken,'refresh-rotated');
  assert.equal([...values.values()].join('').includes('not-to-be-saved'),false);
  store.removeDeviceAccount(project,teacher);
  assert.equal(store.readDeviceAccounts(project).activeId,null);
  assert.equal(store.readDeviceAccounts(project).accounts.length,1);
  store.forgetDeviceAccounts(project);
  assert.equal(store.readDeviceAccounts(project),null);
});

function switchFixture({currentId=owner,nextId=teacher,mainError=null,restoreError=null,noLock=false}={}) {
  const events=[];
  const saved={id:teacher,accessToken:'old-access',refreshToken:'old-refresh'};
  const next=session(nextId,'rotated');
  const main={auth:{getSession:async()=>({data:{session:session(currentId)},error:null}),setSession:async()=>{
    events.push('adopt');return{data:{session:mainError?null:next},error:mainError};
  }}};
  const mocks={
    '@supabase/supabase-js':{createClient:(_url,_key,options)=>{
      assert.equal(options.auth.persistSession,false);assert.equal(options.auth.autoRefreshToken,false);
      assert.notEqual(options.auth.storageKey,undefined);
      return{auth:{setSession:async()=>{events.push('restore');return{data:{session:restoreError?null:next},error:restoreError};},
        signInWithPassword:async()=>{events.push('password');return{data:{session:next},error:null};},
        signOut:async()=>events.push('reject-login'),stopAutoRefresh:async()=>events.push('stop')}};
    }},
    '@/lib/supabase/client':{createSupabaseBrowserClient:()=>main},
    '@/lib/supabase/env':{getSupabasePublicEnv:()=>({url:project,anonKey:'public'})},
    '@/lib/supabase/fetch-with-timeout':{fetchWithTimeout:()=>fetch},
    '@/lib/client-cache':{detachLogoutNotifications:async token=>{assert.equal(token,'access-one');events.push('detach');},setCachedSessionSnapshot:()=>events.push('cache')},
    '@/lib/navigation-paths':{browserHref:()=>'/programs'},'./policy':policy,
    './device-store':{readDeviceAccounts:()=>({accounts:[saved]}),rememberDeviceSession:(_url,s,active)=>events.push(active===false?'stage-rotated':'remember'),removeDeviceAccount:()=>events.push('remove')},
  };
  const result=moduleWithMocks('../src/lib/account-switching/switch-session.ts',mocks,{
    navigator:{locks:{request:async(_key,_options,work)=>work(noLock?null:{})}},
    window:{location:{hostname:'assiddiq.madrasa.ca',replace:()=>events.push('navigate')}},crypto,fetch,
  });
  return{...result,events};
}
test('restores the selected session, preserves rotated credentials, detaches old notifications, and reloads',async()=>{
  const f=switchFixture();await f.switchDeviceAccount(teacher,'assiddiq');
  assert.deepEqual(f.events,['remember','restore','stage-rotated','stop','detach','adopt','cache','navigate']);
});
test('a different account login never replaces the current account',async()=>{
  const f=switchFixture({nextId:policy.SWITCH_ACCOUNT_IDS[2]});
  await assert.rejects(f.switchDeviceAccount(teacher,'assiddiq',{email:'provided',password:'secret'}),/different account/);
  assert.equal(f.events.includes('adopt'),false);assert.equal(f.events.includes('detach'),false);
  assert.equal(f.events.includes('reject-login'),true);
});
test('a teacher session cannot add sign-ins and another running switch is rejected',async()=>{
  const f=switchFixture({currentId:policy.SWITCH_ACCOUNT_IDS[2]});
  await assert.rejects(f.switchDeviceAccount(teacher,'assiddiq',{email:'provided',password:'secret'}),/admin account/);
  assert.equal(f.events.includes('password'),false);
  const locked=switchFixture({noLock:true});
  await assert.rejects(locked.switchDeviceAccount(teacher,'assiddiq'),/already running/);
  assert.deepEqual(locked.events,[]);
});
test('network restoration failures preserve saved tokens; confirmed invalid refresh sessions require reconnection',async()=>{
  const outage=switchFixture({restoreError:{code:'request_timeout'}});
  await assert.rejects(outage.switchDeviceAccount(teacher,'assiddiq'),/could not be restored/);
  assert.equal(outage.events.includes('remove'),false);assert.equal(outage.events.includes('adopt'),false);
  const expired=switchFixture({restoreError:{code:'refresh_token_not_found'}});
  await assert.rejects(expired.switchDeviceAccount(teacher,'assiddiq'),/reconnect/);
  assert.equal(expired.events.includes('remove'),true);
});
test('failure adopting a refreshed session keeps its new token for retry and does not navigate',async()=>{
  const f=switchFixture({mainError:{message:'network'}});
  await assert.rejects(f.switchDeviceAccount(teacher,'assiddiq'),/Could not open/);
  assert.equal(f.events.includes('stage-rotated'),true);assert.equal(f.events.includes('navigate'),false);
});
test('account labels endpoint authenticates the caller and never creates an impersonated session',async()=>{
  let caller=owner;
  const route=moduleWithMocks('../src/app/api/account/switcher/route.ts',{
    '@/lib/account-switching/policy':policy,
    '@/lib/supabase/server':{createSupabaseServerClient:()=>({auth:{getUser:async()=>({data:{user:caller?{id:caller}:null},error:null})}})},
  },{Response});
  const request=()=>new Request('https://app.test/api/account/switcher',{headers:{authorization:'Bearer test'}});
  assert.equal((await route.GET(new Request('https://app.test/api/account/switcher'))).status,401);
  caller='unrelated-admin';assert.equal((await route.GET(request())).status,403);
  caller=owner;const response=await route.GET(request());assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal((await response.json()).accounts.length,4);
});
