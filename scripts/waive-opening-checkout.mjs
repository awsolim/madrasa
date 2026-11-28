import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { monthlyCheckoutPlan } from '../src/lib/stripe/billing-anchor.ts';

try {

// One registration's opening-period waiver. No Supabase writes: normal signed
// Stripe completion still performs the app's atomic enrollment transition.
// Defaults to inspection. --apply expires old unpaid links and prepares a $0
// opening-period checkout; the parent must still consent and supply their card.
const args = process.argv.slice(2);
const value = key => args.find(a => a.startsWith(`${key}=`))?.slice(key.length + 1);
const requestId = value('--request-id');
const firstChargeAt = value('--first-charge-at');
const expectedAccount = value('--stripe-account');
const apply = args.includes('--apply');
if (!requestId || !firstChargeAt || !expectedAccount) throw Error('Supply --request-id, --first-charge-at and --stripe-account.');
if (process.env.STRIPE_CONNECT_PLATFORM === 'true') throw Error('This reviewed one-account operation does not support Connect routing.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {timeout:20000,maxNetworkRetries:1});
function checked(result) { if(result.error) throw Error(result.error.message); return result.data; }
const request = checked(await db.from('enrollment_requests').select('*').eq('id',requestId).single());
if(request.status !== 'approved' || request.admission_completed_at || request.payment_bypassed) throw Error('Registration is no longer approved and awaiting payment.');
const terms = checked(await db.from('program_payment_terms').select('*').eq('id',request.payment_terms_id).single());
const program = checked(await db.from('programs').select('*').eq('id',request.program_id).single());
const local = checked(await db.from('program_subscriptions').select('*').eq('program_id',request.program_id).eq('student_profile_id',request.student_profile_id).single());
if(terms.payment_type!=='monthly' || terms.monthly_billing_anchor!=='first_of_month' || terms.amount_cents!==10000 || terms.currency!=='cad') throw Error('Reviewed CAD $100 calendar-month terms no longer match.');
if(terms.enrollment_request_id!==request.id || terms.program_id!==program.id || terms.student_profile_id!==request.student_profile_id || ['ended','superseded','cancelled'].includes(terms.status)) throw Error('Payment terms do not match the current registration.');
if(program.lifecycle_operation_id || program.access_ends_at || program.publication_status!=='published' || program.lifecycle_status!=='active' || !program.is_ongoing) throw Error('Class is no longer active and ongoing.');
if(local.stripe_subscription_id || local.status!=='checkout_started') throw Error('A subscription already exists or the registration state changed.');
const account=await stripe.accounts.retrieve();
if(account.id!==expectedAccount) throw Error('Stripe account does not match the explicitly selected merchant.');
const anchor=Math.floor(new Date(firstChargeAt).getTime()/1000);
const plan=monthlyCheckoutPlan({monthly_billing_anchor:terms.monthly_billing_anchor,schedule_timezone:program.schedule_timezone});
if(!Number.isFinite(anchor) || anchor!==plan.billingAnchor || anchor<=Date.now()/1000+3600) throw Error('First charge must be the upcoming normal monthly billing date.');
const old=await stripe.checkout.sessions.retrieve(local.stripe_checkout_session_id);
if(old.client_reference_id!==requestId || old.mode!=='subscription' || !old.livemode || old.subscription || old.payment_status==='paid') throw Error('Original Checkout does not match an unpaid live subscription registration.');
const matches=s=>s.client_reference_id===requestId && s.metadata?.payment_terms_id===terms.id && s.metadata?.student_profile_id===request.student_profile_id && s.metadata?.program_id===program.id;
if(!matches(old)) throw Error('Original checkout metadata does not match the approved request and payment terms.');
const price=await stripe.prices.retrieve(old.metadata.stripe_price_id);
if(price.unit_amount!==terms.amount_cents || price.currency!=='cad' || price.recurring?.interval!=='month' || price.recurring.interval_count!==1 || price.product!==program.stripe_product_id || !price.active) throw Error('Stripe price differs from the approved CAD $100 monthly price.');
const recent=await stripe.checkout.sessions.list({limit:100,created:{gte:old.created-86400}});
if(recent.has_more) throw Error('Too many recent checkout sessions for a bounded duplicate check. Review manually.');
const related=recent.data.filter(s=>s.client_reference_id===requestId);
if(related.some(s=>s.status==='complete' || s.payment_status==='paid' || s.subscription)) throw Error('A matching checkout was completed. Inspect the resulting subscription instead.');
const waiver=related.find(s=>s.status==='open' && s.metadata?.opening_period_waived==='true' && s.metadata?.first_charge_at===firstChargeAt);
const summary={registration:requestId,program:program.title,merchant:account.business_profile?.name??account.id,dueNowCents:0,recurringCents:terms.amount_cents,currency:'cad',firstChargeAt,classTimeZone:program.schedule_timezone,oldOpenLinks:related.filter(s=>s.status==='open' && s.id!==waiver?.id).length};
if(!apply){console.log(JSON.stringify({mode:'inspection',...summary}));process.exit(0);}

// Fail rather than modify a checkout that may already have completed. Expiring
// old links first prevents the parent paying the November charge from that tab.
for(const session of related.filter(s=>s.status==='open' && s.id!==waiver?.id)) {
  if(!matches(session)) throw Error('An open checkout uses different payment terms. Review it before continuing.');
  await stripe.checkout.sessions.expire(session.id);
}
const refreshed=checked(await db.from('enrollment_requests').select('status,admission_completed_at,payment_terms_id').eq('id',requestId).single());
if(refreshed.status!=='approved' || refreshed.admission_completed_at || refreshed.payment_terms_id!==terms.id) throw Error('Registration changed while preparing the waiver. No new link created.');
const metadata={...old.metadata,opening_period_waived:'true',first_charge_at:firstChargeAt,waiver_reason:'November opening period waived by administrator; normal CAD 100 monthly billing starts December 1, 2026.',replaces_checkout_session_id:old.id};
const replacement=waiver??await stripe.checkout.sessions.create({
  mode:'subscription',line_items:[{price:price.id,quantity:1}],
  ...(old.customer?{customer:typeof old.customer==='string'?old.customer:old.customer.id}:{customer_email:old.customer_email}),
  client_reference_id:requestId,success_url:old.success_url,cancel_url:old.cancel_url,
  payment_method_collection:'always',
  automatic_tax:{enabled:old.automatic_tax?.enabled??false},
  subscription_data:{metadata,billing_cycle_anchor:anchor,proration_behavior:'none'},
  metadata,
  custom_text:{submit:{message:'No payment today. The November opening period is waived. CAD $100 will be charged on December 1, 2026, then on the first of each month.'}},
  // Use Stripe's default expiry rather than this machine's potentially skewed
  // clock. The fixed billing anchor independently controls the first charge.
},{idempotencyKey:`opening-waiver-v2:${requestId}:${old.id}:${anchor}`});
const verified=await stripe.checkout.sessions.retrieve(replacement.id,{expand:['line_items']});
if(verified.status!=='open' || verified.amount_total!==0 || !matches(verified) || verified.line_items?.data.length!==1 || verified.line_items.data[0].price?.id!==price.id || verified.metadata?.first_charge_at!==firstChargeAt){
  if(verified.status==='open')await stripe.checkout.sessions.expire(verified.id);
  throw Error('Replacement failed its no-payment verification; no usable payment link retained.');
}
console.log(JSON.stringify({mode:'prepared',...summary,checkoutSessionId:verified.id,url:verified.url,expiresAt:new Date(verified.expires_at*1000).toISOString(),requiresParentCompletion:true,supabaseModified:false}));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Opening-period waiver could not be prepared.');
  process.exitCode=1;
}
