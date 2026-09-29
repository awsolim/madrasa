import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCurrentPaymentTerms } from '../src/lib/current-payment-terms.ts';
import { workspaceRoute } from '../src/lib/navigation-paths.ts';
const annual = { id: 'annual', status: 'active', created_at: '2026-08-01' };
const monthly = { id: 'monthly', status: 'checkout_pending', created_at: '2026-09-01' };
test('subscription decision wins over original application, regardless of row order', () => {
  for (const rows of [[annual, monthly], [monthly, annual]]) assert.equal(selectCurrentPaymentTerms(rows, { payment_terms_id: 'annual' }, { payment_terms_id: 'monthly' }), monthly);
});
test('superseded terms cannot mask newer billing decision', () => {
  assert.equal(selectCurrentPaymentTerms([{ ...annual, status: 'superseded' }, monthly], { payment_terms_id: 'annual' }, null), monthly);
  assert.equal(selectCurrentPaymentTerms([], null, null), null);
});
test('students uses immediate workspace routing on both staff paths', () => {
  const id = '12345678-1234-1234-1234-123456789012';
  assert.equal(workspaceRoute(`/admin/programs/${id}/students`, 'assiddiq', 'admin'), `students:${id}`);
  assert.equal(workspaceRoute(`/teacher/classes/${id}/students`, 'assiddiq', 'teacher'), `students:${id}`);
  assert.equal(workspaceRoute(`/admin/programs/${id}/students`, 'assiddiq', 'teacher'), null);
});
