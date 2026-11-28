import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { enrollmentPaymentLine } from '../src/lib/finance/enrollment-notification.ts';

const code = ts.transpileModule(await readFile(new URL('../src/app/api/enrollment-requests/complete-admission/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const [paymentType, external, expected] of [
  ['waived', false, 'Payment waived.'],
  ['free', false, 'No payment required.'],
  ['waived', true, 'Payment is handled outside Madrasa.'],
]) test(`confirmed ${external ? 'external' : paymentType} enrollment reports its arrangement without claiming a charge`, async () => {
  const emails = [], pushes = [], activated = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'parent' } }, error: null }) },
    from: table => ({ select() { return this; }, eq() { return this; }, async maybeSingle() {
      return { error: null, data: {
        enrollment_requests: { id: 'request', program_id: 'program', student_profile_id: 'child', parent_profile_id: 'parent', status: 'approved', payment_bypassed: true, payment_type: paymentType, payment_bypass_external: external },
        programs: { title: 'Class', mosque_id: 'mosque' },
        mosques: { slug: 'demo' }, profiles: { full_name: 'Student' },
      }[table] };
    } }),
  };
  const exports = {};
  vm.runInNewContext(code, { exports, Response, require: name => {
    if (name.endsWith('/supabase/service')) return { createSupabaseServiceClient: () => db };
    if (name.endsWith('/push/program-recipients')) return { getProgramEnrollmentRecipientProfileIds: async () => ['director'] };
    if (name.endsWith('/push/send-push')) return { sendPushNotification: async (_db, payload) => pushes.push(payload) };
    if (name.endsWith('/email/resend')) return { getTenantAppUrl: () => 'https://demo.madrasa.ca' };
    if (name.endsWith('/email/notifications')) return { sendProfileNotificationEmails: async (_db, _ids, payload) => emails.push(payload) };
    if (name.endsWith('/programs/enrollment-activation')) return { activateEnrollmentForRequest: async (_db, payload) => activated.push(payload) };
    if (name.endsWith('/monitoring/log-error')) return { logServerError: async () => {} };
    throw Error(name);
  } });
  const response = await exports.POST(new Request('https://demo.madrasa.ca/api/enrollment-requests/complete-admission', {
    method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: JSON.stringify({ enrollmentRequestId: 'request' }),
  }));
  assert.equal(response.status, 200);
  assert.equal(activated.length, 1);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].title, 'Enrollment confirmed');
  assert.match(emails[0].subject, /Student/);
  assert.ok(emails[0].message.endsWith(expected));
  assert.equal(pushes[0].title, 'Enrollment confirmed');
  assert.doesNotMatch(emails[0].message, /Payment received|paid today/);
});

test('missing payment evidence never invents a charge or a scheduled payment', () => {
  assert.equal(enrollmentPaymentLine({ amountPaidCents: null, currency: 'cad' }), 'Payment details are available in Finances.');
  assert.equal(enrollmentPaymentLine({ amountPaidCents: 0, currency: 'cad', firstPaymentAt: 'invalid' }), 'No payment collected at enrollment.');
});
