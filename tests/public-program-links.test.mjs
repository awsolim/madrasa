import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { publicProgramHref, isProgramId } from '../src/lib/programs/public-links.ts';
import { browserHref } from '../src/lib/navigation-paths.ts';

const id = '00000000-0000-0000-0000-000000000010';
test('public URLs use stable slugs, keep UUID fallbacks and retain private preview paths', () => {
  assert.equal(publicProgramHref('assiddiq',{id,public_slug:'al-tarteel-quran-program'}),'/m/assiddiq/programs/al-tarteel-quran-program');
  for (const program of [{id},{id,public_slug:'old-name',publication_status:'draft'},{id,public_slug:'old-name',is_active:false}]) {
    assert.equal(publicProgramHref('assiddiq',program),`/m/assiddiq/programs/${id}`);
  }
  assert.equal(browserHref(publicProgramHref('assiddiq',{id,public_slug:'al-tarteel'}),'assiddiq','assiddiq.madrasa.ca'),'/programs/al-tarteel');
  assert.equal(isProgramId(id),true);
  assert.equal(isProgramId('al-tarteel'),false);
});

function resolver(result) {
  let calls=0;
  const code=ts.transpileModule(readFileSync(new URL('../src/lib/programs/resolve-public-link.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports={};
  const mocks={
    'server-only':{},
    'next/navigation':{notFound(){throw new Error('NOT_FOUND');}},
    '@/lib/supabase/server':{createSupabaseServerClient:()=>({rpc:async()=>{calls++;return result;}})},
    './public-links':{isProgramId},
  };
  new Function('require','exports',code)(name=>mocks[name],exports);
  return {...exports,calls:()=>calls};
}

test('legacy UUID links avoid a new lookup, while slugs resolve to internal IDs',async()=>{
  const r=resolver({data:[{program_id:id}],error:null});
  assert.equal(await r.resolvePublicProgramId('assiddiq',id),id);
  assert.equal(r.calls(),0);
  assert.equal(await r.resolvePublicProgramId('assiddiq','al-tarteel'),id);
  assert.equal(r.calls(),1);
});

test('missing links are 404s; a backend outage remains a retryable load error',async()=>{
  await assert.rejects(resolver({data:[],error:null}).resolvePublicProgramId('assiddiq','missing'),/NOT_FOUND/);
  const outage=resolver({data:null,error:{message:'timeout'}});
  await assert.rejects(outage.resolvePublicProgramId('assiddiq','al-tarteel'),/could not be loaded/);
  const invalid=resolver({});
  await assert.rejects(invalid.resolvePublicProgramId('assiddiq','../invalid'),/NOT_FOUND/);
  assert.equal(invalid.calls(),0);
});
