import test from 'node:test';
import assert from 'node:assert/strict';
import { classAccessEndsAt, classBillingMutation, isClosedClass } from '../src/lib/programs/lifecycle-policy.ts';

test('last access day ends at the next midnight in the class timezone across DST', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(classAccessEndsAt('2026-03-07', 'America/Toronto', now), '2026-03-08T05:00:00.000Z');
  assert.equal(classAccessEndsAt('2026-03-08', 'America/Toronto', now), '2026-03-09T04:00:00.000Z');
  assert.equal(classAccessEndsAt('2026-10-31', 'America/Toronto', now), '2026-11-01T04:00:00.000Z');
  assert.equal(classAccessEndsAt('2026-11-01', 'America/Toronto', now), '2026-11-02T05:00:00.000Z');
});

test('invalid and expired dates cannot schedule access', () => {
  assert.throws(() => classAccessEndsAt('2026-02-30', 'UTC'), /Invalid/);
  assert.throws(() => classAccessEndsAt('2026-01-01', 'UTC', new Date('2026-02-01')), /today or later/);
  assert.equal(isClosedClass({ lifecycle_status: 'paused' }), false);
  assert.equal(isClosedClass({ publication_status: 'archived' }), true);
});

test('ending stops billing without generating a final charge, proration or automatic refund', () => {
  assert.deepEqual(classBillingMutation('end', true, { status: 'active', paused: false }), { kind: 'cancel', params: { prorate: false, invoice_now: false } });
  assert.equal(classBillingMutation('end', true, { status: 'canceled', paused: false }).kind, 'none');
});

test('pause skips invoices, and resume cannot revive an individual preexisting pause', () => {
  assert.deepEqual(classBillingMutation('pause', true, { status: 'active', paused: false }), { kind: 'pause', params: { pause_collection: { behavior: 'void' } } });
  assert.equal(classBillingMutation('pause', false, { status: 'active', paused: true }).kind, 'none');
  assert.equal(classBillingMutation('resume', false, { status: 'active', paused: true }).kind, 'none');
  assert.deepEqual(classBillingMutation('resume', true, { status: 'active', paused: true }), { kind: 'resume', params: { pause_collection: '', proration_behavior: 'none' } });
  assert.equal(classBillingMutation('resume', true, { status: 'canceled', paused: true }).kind, 'none');
});
