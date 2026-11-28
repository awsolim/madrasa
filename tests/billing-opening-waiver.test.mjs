import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyCheckoutPlan } from '../src/lib/stripe/billing-anchor.ts';

const program={id:'6cb4630d-5d08-4f36-9b5b-35b59e8e8620',monthly_billing_anchor:'first_of_month',schedule_timezone:'America/Resolute'};
for(const date of ['2026-11-01T18:00:00Z','2026-11-27T18:00:00Z','2026-12-01T05:59:59Z']) {
  test(`November Al Tarteel waiver applies at ${date}`,()=>{
    const plan=monthlyCheckoutPlan(program,new Date(date));
    assert.equal(plan.waiveOpeningPeriod,true);
    assert.equal(plan.prorateOpeningPeriod,false);
    assert.equal(plan.firstRecurringChargeAt,1796137200);
    assert.equal(plan.billingAnchor,1796137200);
  });
}
test('exception expires at local midnight December 1, rather than UTC midnight or 9 AM',()=>{
  const plan=monthlyCheckoutPlan(program,new Date('2026-12-01T06:00:00Z'));
  assert.equal(plan.waiveOpeningPeriod,false);
  assert.equal(plan.billingAnchor,undefined);
});
test('December mid-month signups and future Novembers use standard proration',()=>{
  for(const date of ['2026-12-15T18:00:00Z','2027-11-27T18:00:00Z']) {
    const plan=monthlyCheckoutPlan(program,new Date(date));
    assert.equal(plan.waiveOpeningPeriod,false);
    assert.equal(plan.prorateOpeningPeriod,true);
  }
});
test('same title or another class never inherits the waiver; anniversary billing is unchanged',()=>{
  const now=new Date('2026-11-27T18:00:00Z');
  assert.equal(monthlyCheckoutPlan({...program,id:'other-class'},now).prorateOpeningPeriod,true);
  assert.equal(monthlyCheckoutPlan({...program,id:undefined},now).prorateOpeningPeriod,true);
  const anniversary=monthlyCheckoutPlan({...program,monthly_billing_anchor:'signup_date'},now);
  assert.equal(anniversary.waiveOpeningPeriod,false);
  assert.equal(anniversary.billingAnchor,undefined);
});
