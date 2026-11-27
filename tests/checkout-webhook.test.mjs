import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code=ts.transpileModule(await readFile(new URL('../src/app/api/stripe/webhook/route.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function webhook({type='checkout.session.completed',paymentStatus='paid',signature=true,invalidSignature=false,approved=true}={}) {
  const completed=[];const logs=[];
  const session={id:'cs_synthetic',payment_status:paymentStatus,subscription:'sub_synthetic',customer:'cus_synthetic',amount_total:10000,currency:'cad',metadata:{enrollment_request_id:'request',mosque_id:'mosque',program_id:'program',student_profile_id:'child',parent_profile_id:'parent'}};
  const event={id:'evt_synthetic',type,data:{object:session}};
  const db={from:table=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='enrollment_requests'?{status:approved?'approved':'pending',program_track_id:null}:null,error:null};}})};
  const exports={};
  vm.runInNewContext(code,{exports,Response,Error,require:name=>{
    if(name==='stripe')return {default:class Stripe{}};
    if(name.endsWith('/stripe/server')) return {getStripeWebhookSecret:()=> 'synthetic-secret',shouldUseStripeConnect:()=>false,getStripe:()=>({webhooks:{constructEvent:()=>{if(invalidSignature)throw Error('Invalid signature');return event;}},subscriptions:{retrieve:async()=>({id:'sub_synthetic',status:'active',customer:'cus_synthetic',items:{data:[{price:{id:'price_synthetic'},current_period_start:1795000000,current_period_end:1797600000}]},cancel_at_period_end:false})}})};
    if(name.endsWith('/finance/finalize-paid-enrollment'))return {finalizePaidEnrollment:async(_db,payload)=>{completed.push(payload);return {subscriptionId:'local-subscription',enrollmentId:'enrollment',trackIds:[]};}};
    if(name.endsWith('/supabase/service'))return {createSupabaseServiceClient:()=>db};
    if(name.endsWith('/monitoring/log-error'))return {logServerError:async(_db,value)=>logs.push(value)};
    if(name.endsWith('/stripe/billing-anchor'))return {};
    if(name.endsWith('/finance/audit'))return {recordFinanceAuditEvent:async()=>{}};
    if(name.endsWith('/finance/refundable-charge'))return {};
    if(name.endsWith('/push/program-recipients'))return {};
    if(name.endsWith('/push/send-push'))return {};
    if(name.endsWith('/finance/payments'))return {};
    if(name.endsWith('/email/resend'))return {};
    if(name.endsWith('/email/notifications'))return {};
    throw Error('Unexpected dependency '+name);
  }});
  const headers={'x-madrasa-reconciliation':'true',...(signature?{'stripe-signature':'synthetic'}:{})};
  return {completed,logs,run:()=>exports.POST(new Request('https://demo.madrasa.ca/api/stripe/webhook',{method:'POST',headers,body:'signed-event'}))};
}
test('signed immediate payment completes enrollment with Stripe subscription evidence',async()=>{
  const {completed,run}=webhook();assert.equal((await run()).status,200);assert.equal(completed.length,1);assert.equal(completed[0].stripeSubscriptionId,'sub_synthetic');assert.equal(completed[0].status,'active');
});
test('completed checkout with a pending delayed payment is acknowledged without granting access',async()=>{
  const {completed,logs,run}=webhook({paymentStatus:'unpaid'});assert.equal((await run()).status,200);assert.equal(completed.length,0);assert.equal(logs.length,0);
});
test('signed delayed-payment success reaches the same atomic enrollment completion',async()=>{
  const {completed,run}=webhook({type:'checkout.session.async_payment_succeeded'});assert.equal((await run()).status,200);assert.equal(completed.length,1);
});
test('a delayed success event still cannot grant access with unpaid evidence',async()=>{
  const {completed,run}=webhook({type:'checkout.session.async_payment_succeeded',paymentStatus:'unpaid'});assert.equal((await run()).status,500);assert.equal(completed.length,0);
});
test('delayed payment failure cannot activate enrollment',async()=>{
  const {completed,run}=webhook({type:'checkout.session.async_payment_failed',paymentStatus:'unpaid'});assert.equal((await run()).status,200);assert.equal(completed.length,0);
});
test('payment cannot activate an application that is not approved',async()=>{
  const {completed,run}=webhook({approved:false});assert.equal((await run()).status,500);assert.equal(completed.length,0);
});
for(const options of [{signature:false},{invalidSignature:true}])test('unsigned or invalidly signed webhook cannot activate enrollment',async()=>{
  const {completed,run}=webhook(options);assert.equal((await run()).status,400);assert.equal(completed.length,0);
});
