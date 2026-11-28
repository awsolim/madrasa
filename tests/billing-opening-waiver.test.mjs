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
test('December mid-month signups and future Novembers before the cutoff use standard proration',()=>{
  for(const date of ['2026-12-15T18:00:00Z','2027-11-25T18:00:00Z']) {
    const plan=monthlyCheckoutPlan(program,new Date(date));
    assert.equal(plan.waiveOpeningPeriod,false);
    assert.equal(plan.prorateOpeningPeriod,true);
  }
});
for (const id of [program.id, 'c7ab396e-f365-4d73-bdf8-b9da59600240']) {
  test(`25th inclusive is prorated, 26th local midnight is waived for ${id}`, () => {
    const p = { ...program, id };
    assert.equal(monthlyCheckoutPlan(p, new Date('2027-01-26T05:59:59Z')).prorateOpeningPeriod, true);
    const plan = monthlyCheckoutPlan(p, new Date('2027-01-26T06:00:00Z'));
    assert.equal(plan.waiveOpeningPeriod, true);
    assert.equal(plan.waiverReason, 'late_month');
    assert.equal(new Date(plan.firstRecurringChargeAt * 1000).toISOString(), '2027-02-01T15:00:00.000Z');
    assert.equal(monthlyCheckoutPlan(p, new Date('2027-02-01T06:00:00Z')).waiveOpeningPeriod, false);
  });
}
test('cutoff handles February, leap day and year rollover without affecting other programs', () => {
  for (const [date, expected] of [['2027-02-28T18:00:00Z', '2027-03-01'], ['2028-02-29T18:00:00Z', '2028-03-01'], ['2027-12-31T18:00:00Z', '2028-01-01']]) {
    const plan = monthlyCheckoutPlan(program, new Date(date));
    assert.equal(plan.waiveOpeningPeriod, true);
    assert.ok(new Date(plan.billingAnchor * 1000).toISOString().startsWith(expected));
    assert.equal(monthlyCheckoutPlan({ ...program, id: 'other' }, new Date(date)).prorateOpeningPeriod, true);
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
