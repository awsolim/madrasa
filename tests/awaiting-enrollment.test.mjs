import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingEnrollmentRequests } from '../src/lib/finance/awaiting-enrollment.ts';

test('only approved incomplete applications require enrollment follow-up', () => {
  const request = (id, status, completed = null) => ({ id, student_profile_id: id, status, admission_completed_at: completed });
  const rows = [request('waiting', 'approved'), request('finished', 'approved', '2026-11-27T12:00:00Z'), request('pending', 'pending'), request('waitlisted', 'waitlisted'), request('rejected', 'rejected'), request('cancelled', 'cancelled')];
  assert.deepEqual(awaitingEnrollmentRequests(rows, []).map(row => row.id), ['waiting']);
});

test('an active enrollment excludes stale incomplete applications, including deferred subscriptions', () => {
  const request = { id: 'application', student_profile_id: 'student', status: 'approved', admission_completed_at: null };
  assert.deepEqual(awaitingEnrollmentRequests([request], [{ student_profile_id: 'student', status: 'active' }]), []);
  assert.equal(awaitingEnrollmentRequests([request], [{ student_profile_id: 'student', status: 'withdrawn' }]).length, 1);
});
