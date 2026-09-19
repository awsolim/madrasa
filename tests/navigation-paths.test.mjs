import test from 'node:test';
import assert from 'node:assert/strict';
import { browserHref, workspacePath, workspaceRoute } from '../src/lib/navigation-paths.ts';

test('both tenant URL forms resolve the same workspace screen', () => {
  assert.equal(workspacePath('/admin/programs', 'assiddiq'), '/m/assiddiq/admin/programs');
  assert.equal(workspaceRoute('/admin/programs', 'assiddiq', 'admin'), 'classes');
  assert.equal(workspaceRoute('/m/assiddiq/admin/programs', 'assiddiq', 'admin'), 'classes');
});

test('local navigation cannot cross a tenant, role or unknown route', () => {
  assert.equal(workspaceRoute('/m/other/admin', 'assiddiq', 'admin'), null);
  assert.equal(workspaceRoute('/admin', 'assiddiq', 'teacher'), null);
  assert.equal(workspaceRoute('/teacher/inbox', 'assiddiq', 'admin'), null);
  assert.equal(workspaceRoute('/admin/programs/unrecognized', 'assiddiq', 'admin'), null);
  assert.equal(workspaceRoute('/admin/masjid/information', 'assiddiq', 'admin'), null);
});

test('editor and finance routes are registered independently of primary tabs', () => {
  const id = '12345678-1234-1234-1234-123456789012';
  assert.equal(workspaceRoute(`/teacher/classes/${id}`, 'assiddiq', 'teacher'), `edit:${id}`);
  assert.equal(workspaceRoute(`/admin/programs/${id}/finances`, 'assiddiq', 'admin'), `finances:${id}`);
  assert.equal(workspaceRoute('/teacher/classes/new', 'assiddiq', 'teacher'), 'create');
});

test('canonical URLs preserve queries and do not strip a different tenant', () => {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'madrasa.ca';
  assert.equal(browserHref('/m/assiddiq/admin/settings?panel=family', 'assiddiq', `assiddiq.${root}`), '/admin/settings?panel=family');
  assert.equal(browserHref('/m/assiddiq', 'assiddiq', 'assiddiq.localhost'), '/');
  assert.equal(browserHref('/m/other/admin', 'assiddiq', `assiddiq.${root}`), '/m/other/admin');
  assert.equal(browserHref('/m/assiddiq/admin', 'assiddiq', 'localhost'), '/m/assiddiq/admin');
});
