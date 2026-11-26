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
  assert.match(html, /Sheikh Abdulrahman/);
  assert.match(html, /href="tel:\+17806804962"/);
  assert.match(html, /href="tel:\+15875667545"/);
  assert.doesNotMatch(html, /<script|supabase\.co|stripe/);
});
