import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { createDirectory, renderDirectory, directoryHref } from '../scripts/lib/class-directory.mjs';

const source = { mosque: { slug: 'assiddiq', name: 'Assiddiq' }, programs: [
  { id: 'public', title: 'Class', is_active: true, publication_status: 'published', lifecycle_status: 'active' },
  ...['hidden', 'draft', 'archived'].map(publication_status => ({ id: publication_status, is_active: true, publication_status })),
  { id: 'cancelled', is_active: true, publication_status: 'published', lifecycle_status: 'cancelled' },
] };
const details = new Map([['public', { program: {
  id: 'public', title: 'Class', summary: 'A public class', contact_email: 'teacher@example.com', contact_phone: '+1 587 566 7545',
  schedule: [{ day: 'Saturday', start: '10:00', end: '12:00' }],
  stripe_product_id: 'private-stripe-id', teacher: { full_name: 'Teacher', email: 'account@example.com', private_data: 'secret' },
}, enrolledCount: 48, childStatuses: { private: 'student' } }]]);

test('directory exports only public listings and explicitly selected public information', () => {
  const result = createDirectory('assiddiq', source, details, '2026-11-26T20:00:00Z');
  assert.equal(result.classes.length, 1);
  assert.match(result.classes[0].schedule[0], /Saturday/);
  assert.equal(result.classes[0].email, 'teacher@example.com');
  assert.doesNotMatch(JSON.stringify(result), /private|secret|enrolledCount|childStatuses|stripe/);
});

test('failed or partial refresh cannot produce a replacement snapshot', () => {
  assert.throws(() => createDirectory('other-tenant', source, details));
  assert.throws(() => createDirectory('assiddiq', { error: 'Unavailable' }, details));
  assert.throws(() => createDirectory('assiddiq', source, new Map()));
});

test('track schedules and price overrides are retained without private availability or payment identifiers', () => {
  const trackDetails = new Map([['public', {
    ...details.get('public'),
    program: { ...details.get('public').program, is_paid: true, is_ongoing: true, offers_monthly_payment: true, offers_annual_payment: true, price_monthly_cents: 10000 },
    tracks: [
      { name: 'Saturday', is_active: true, schedule: [{ day: 'Saturday', start: '12:00', end: '14:00' }], pricing_override_enabled: true, price_monthly_cents: 5000, price_annual_cents: 50000, capacity: 20, stripe_price_id: 'private' },
      { name: 'Hidden option', is_active: false, schedule: [] },
    ],
  }]]);
  const result = createDirectory('assiddiq', source, trackDetails);
  assert.equal(result.classes[0].options.length, 1);
  assert.deepEqual(result.classes[0].options[0].pricing, ['$50/month', '$500/year']);
  assert.match(result.classes[0].options[0].schedule[0], /Saturday/);
  assert.doesNotMatch(JSON.stringify(result), /capacity|stripe|private|Hidden option/);
  assert.match(renderDirectory(result), /\$50\/month or \$500\/year/);
});

test('confirmed contact overrides survive placeholder phones; invalid phones do not hide a valid fallback', () => {
  const brokenPhone = new Map([['public', { ...details.get('public'), program: { ...details.get('public').program, teacher: { phone_number: '0' } } }]]);
  const fallback = createDirectory('assiddiq', source, brokenPhone);
  assert.equal(fallback.classes[0].phone, '+1 587 566 7545');
  const confirmed = createDirectory('assiddiq', source, brokenPhone, '2026-11-27T00:40:22Z', { public: { phone: '+1 780 680 4962', reason: 'Owner confirmed' } });
  assert.equal(confirmed.classes[0].phone, '+1 780 680 4962');
  assert.doesNotMatch(JSON.stringify(confirmed), /Owner confirmed/);
});

test('standalone directory escapes content, contains real contact actions, and loads no remote resources or scripts', () => {
  const result = createDirectory('assiddiq', source, details);
  result.classes[0].title = '<script>alert(1)</script>';
  result.classes[0].description = '" onmouseover="alert(1)';
  const html = renderDirectory(result);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="mailto:teacher@example.com\?subject=/);
  assert.match(html, /href="tel:\+15875667545"/);
  assert.doesNotMatch(html, /<script|<link|<img|<iframe|supabase\.co/);
  assert.match(html, /does not confirm enrollment or change any payments/);
});

test('invalid contact values cannot become executable links', () => {
  const html = renderDirectory({ slug: 'assiddiq', name: 'Assiddiq', updatedAt: null, classes: [{ title: 'Class', phone: 'javascript:alert(1)', email: 'a@example.com?body=bad' }] });
  assert.doesNotMatch(html, /href="(?:javascript|tel|mailto):/);
  assert.equal(directoryHref('../other'), null);
});

const code = ts.transpileModule(await readFile(new URL('../src/lib/continuity.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exported = {};
vm.runInNewContext(code, { exports: exported, require: () => ({ default: ['assiddiq'] }) });
test('maintenance applies only to configured tenants with prepared directories', () => {
  assert.equal(exported.maintenanceDirectoryHref('assiddiq', undefined), null);
  assert.equal(exported.maintenanceDirectoryHref('assiddiq', 'other, assiddiq'), '/continuity/assiddiq.html');
  assert.equal(exported.maintenanceDirectoryHref('unknown', 'unknown'), null);
});

test('generated Assiddiq directory has both confirmed classes and no Supabase dependency', async () => {
  const html = await readFile(new URL('../public/continuity/assiddiq.html', import.meta.url), 'utf8');
  assert.match(html, /Al Tarteel/);
  assert.match(html, /Weekend School/);
  assert.match(html, /Sheikh Abdelrahman Deyah/);
  assert.match(html, /href="mailto:mohbadawy981@gmail.com/);
  assert.match(html, /href="mailto:abdarrahmanedeyah@gmail.com/);
  assert.match(html, /Sunday Only Class/);
  assert.match(html, /Saturday &amp; Sunday Class/);
  assert.match(html, /href="tel:\+17806804962"/);
  assert.match(html, /href="tel:\+15875667545"/);
  assert.doesNotMatch(html, /<script|supabase\.co|stripe/);
});
