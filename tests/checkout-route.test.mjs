import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { monthlyCheckoutPlan } from '../src/lib/stripe/billing-anchor.ts';

const code = ts.transpileModule(await readFile(new URL('../src/app/api/stripe/checkout/route.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function checkout(options={}) {
  const calls={prices:[],sessions:[],expired:[],saved:[],terms:[],logs:[]};
  const application={id:'request',program_id:'program',mosque_id:'mosque',student_profile_id:'child',parent_profile_id:'parent',status:'approved',admission_completed_at:null,...options.application};
  const program={id:'program',stripe_product_id:'prod_synthetic',publication_status:'published',lifecycle_status:'active',schedule_timezone:'UTC',...options.program};
  const terms={id:'terms',status:'payment_required',payment_type:'monthly',amount_cents:10000,currency:'cad',monthly_billing_anchor:'signup_date',...options.terms};
  const db={auth:{getUser:async()=>({data:{user:options.user===null?null:{id:options.user??'parent',email:'parent@example.test'}},error:null})},from:table=>{
    const query={select(){return this;},eq(){return this;},
      async maybeSingle(){return {data:table==='enrollment_requests'?application:table==='programs'?program:table==='mosques'?{slug:'demo',stripe_account_id:null}:table==='profiles'?{email:'parent@example.test'}:options.existing??null,error:null};},
      async single(){return {data:options.closedDuringCheckout?{...program,lifecycle_status:'paused',access_ends_at:'2026-11-27T00:00:00Z'}:program,error:null};},
      async upsert(value){calls.saved.push(value);return {error:options.saveError??null};},
    };return query;}};
  const exports={};
  vm.runInNewContext(code,{exports,Response,Error,require:name=>{
    if(name.endsWith('/stripe/server')) return {getStripe:()=>({prices:{create:async value=>{calls.prices.push(value);return {id:'price_synthetic'};}},checkout:{sessions:{create:async value=>{calls.sessions.push(value);return {id:'cs_synthetic',url:'https://checkout.stripe.com/synthetic'};},expire:async id=>{calls.expired.push(id);}}}}),shouldUseStripeConnect:()=>false};
    if(name.endsWith('/stripe/checkout-url')) return {getCheckoutOrigin:()=> 'https://demo.madrasa.ca',getRegistrationConfirmationPath:()=>'/registration/request'};
    if(name.endsWith('/finance/payment-terms')) return {ensurePaymentTermsForRequest:async()=>terms,markPaymentTermsCheckoutStarted:async(_db,value)=>{calls.terms.push(value);if(options.termsError)throw options.termsError;}};
    if(name.endsWith('/programs/status')) return {toProgramStatusFields:p=>({publicationStatus:p.publication_status,lifecycleStatus:p.lifecycle_status})};
    if(name.endsWith('/supabase/service')) return {createSupabaseServiceClient:()=>db};
    if(name.endsWith('/monitoring/log-error')) return {logServerError:async(_db,value)=>calls.logs.push(value)};
    if(name.endsWith('/stripe/billing-anchor')) return {monthlyCheckoutPlan};
    throw Error('Unexpected dependency '+name);
  }});
  return {calls,run:()=>exports.POST(new Request('https://demo.madrasa.ca/api/stripe/checkout',{method:'POST',headers:options.guest?{}:{authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify({enrollmentRequestId:'request'})}))};
}

for(const [kind,mode,interval] of [['monthly','subscription','month'],['annual','subscription','year'],['pay_in_full','payment',null]]) {
  test(`${kind} checkout preserves the approved price and only returns Stripe after local persistence`,async()=>{
    const {calls,run}=checkout({terms:{payment_type:kind,amount_cents:12500}});
    const response=await run();assert.equal(response.status,200);
    assert.equal((await response.json()).url,'https://checkout.stripe.com/synthetic');
    assert.equal(calls.prices[0].unit_amount,12500);
    assert.equal(calls.prices[0].recurring?.interval??null,interval);
    assert.equal(calls.sessions[0].mode,mode);
    assert.equal(calls.saved[0].status,'checkout_started');
    assert.equal(calls.terms.length,1);assert.equal(calls.expired.length,0);
  });
}
for(const [label,options,status] of [
  ['guest',{guest:true},401],['different family',{user:'outsider'},403],
  ['pending application',{application:{status:'pending'}},409],
  ['already completed',{application:{admission_completed_at:'2026-11-27T00:00:00Z'}},409],
  ['paused class',{program:{lifecycle_status:'paused'}},409],
  ['existing active subscription',{existing:{status:'active'}},409],
  ['waived registration',{terms:{payment_type:'waived'}},409],
  ['invalid approved amount',{terms:{amount_cents:0}},409],
])test(`checkout blocks ${label} before contacting Stripe`,async()=>{
  const {calls,run}=checkout(options);assert.equal((await run()).status,status);assert.equal(calls.prices.length,0);assert.equal(calls.sessions.length,0);
});
test('abandoned checkout does not prevent a fresh checkout attempt',async()=>{
  const {run}=checkout({existing:{status:'checkout_started'}});assert.equal((await run()).status,200);
});
test('database rejection expires the unused session and logs the real PostgREST diagnostic',async()=>{
  const {calls,run}=checkout({saveError:{message:'subscription status violates constraint',code:'23514'}});
  const response=await run();assert.equal(response.status,500);assert.equal((await response.json()).url,undefined);
  assert.deepEqual(calls.expired,['cs_synthetic']);assert.equal(calls.logs[0].message,'subscription status violates constraint');assert.equal(calls.logs[0].context.code,'23514');assert.equal(calls.terms.length,0);
});
test('failure to save payment terms expires checkout rather than letting payment proceed',async()=>{
  const {calls,run}=checkout({termsError:{message:'payment terms write failed',code:'XX000'}});
  assert.equal((await run()).status,500);assert.deepEqual(calls.expired,['cs_synthetic']);
});
test('a class ending during preparation invalidates the checkout before returning its URL',async()=>{
  const {calls,run}=checkout({closedDuringCheckout:true});assert.equal((await run()).status,500);assert.deepEqual(calls.expired,['cs_synthetic']);
});
