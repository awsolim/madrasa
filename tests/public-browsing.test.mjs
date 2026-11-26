import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as navigation from '../src/lib/navigation-paths.ts';
import { getProgramPrimaryCta } from '../src/lib/programs/status.ts';

function moduleWithMocks(path, mocks) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, exports);
  return exports;
}
const auth = moduleWithMocks('../src/lib/authz.ts', { '@/lib/supabase/client': {} });
const publicNav = moduleWithMocks('../src/lib/public-navigation.ts', {
  '@/lib/authz': auth, '@/lib/navigation-paths': navigation,
});
const roles = [
  { ...auth.emptyUserAccess, accountType: 'student' },
  { ...auth.emptyUserAccess, accountType: 'parent' },
  { ...auth.emptyUserAccess, accountType: 'teacher', isTeacher: true },
  { ...auth.emptyUserAccess, accountType: 'admin', isMosqueAdmin: true },
];

test('public root and class list resolve to each signed-in role without duplicated path segments', () => {
  for (const access of roles) {
    for (const path of ['/', '/programs', '/m/assiddiq', '/m/assiddiq/programs']) {
      const result = publicNav.publicAccountDestination(path, 'assiddiq', access);
      assert.equal(result, auth.getDefaultLandingHref('assiddiq', access));
      assert.doesNotMatch(result, /classes\/classes|programs\/programs/);
    }
  }
});

test('login from guest tabs opens the matching private tab for the account role', () => {
  for (const access of roles) {
    const role = access.isMosqueAdmin ? 'admin' : access.isTeacher ? 'teacher' : 'portal';
    assert.equal(publicNav.publicAccountDestination('/schedule', 'assiddiq', access), `/m/assiddiq/${role}`);
    assert.equal(publicNav.publicAccountDestination('/account', 'assiddiq', access), `/m/assiddiq/${role}/${role === 'admin' ? 'settings' : 'account'}`);
    assert.equal(publicNav.publicAccountDestination('/inbox', 'assiddiq', access), role === 'admin' ? '/m/assiddiq/admin/programs' : `/m/assiddiq/${role}/${role === 'teacher' ? 'inbox' : 'announcements'}`);
  }
});

test('class links stay selected after login in either tenant URL format', () => {
  for (const access of roles) {
    for (const path of ['/programs/class-id', '/m/assiddiq/programs/class-id', '/programs/class-id/apply']) {
      assert.equal(publicNav.publicAccountDestination(path, 'assiddiq', access), null);
    }
  }
  const href = publicNav.guestLoginHref('assiddiq', '/programs/class-id?returnTo=%2Fm%2Fassiddiq%2Fprograms');
  const target = new URL(href, 'https://assiddiq.madrasa.ca').searchParams.get('returnTo');
  assert.equal(target, '/m/assiddiq/programs/class-id?returnTo=%2Fm%2Fassiddiq%2Fprograms');
  assert.equal(auth.safeReturnTo(target, 'assiddiq'), target);
});

test('existing account-panel and inbox links retain their selected destination', () => {
  assert.equal(publicNav.publicAccountDestination('/account', 'assiddiq', roles[3], 'panel=notifications'), '/m/assiddiq/admin/settings?panel=notifications');
  assert.equal(publicNav.publicAccountDestination('/inbox', 'assiddiq', roles[0], 'tab=notes'), '/m/assiddiq/portal/announcements?tab=notes');
});

test('guest tabs remain in public navigation and return targets stay tenant-scoped', () => {
  const items = navigation.workspaceNavItems('assiddiq', 'public');
  assert.deepEqual(items.map(x => navigation.workspaceRoute(x.href, 'assiddiq', 'public')), ['classes', 'home', 'inbox', 'account']);
  for (const tab of ['schedule', 'inbox', 'account']) {
    assert.equal(auth.safeReturnTo(`/m/assiddiq/${tab}`, 'assiddiq'), `/m/assiddiq/${tab}`);
  }
  assert.equal(auth.safeReturnTo('/m/other/inbox', 'assiddiq'), undefined);
  assert.equal(auth.safeReturnTo('https://example.com', 'assiddiq'), undefined);
  assert.equal(navigation.isPublicClassesRoot('/m/assiddiq', items[0].href), true);
  assert.equal(navigation.isPublicClassesRoot('/', items[0].href), true);
  assert.equal(navigation.isPublicClassesRoot('/m/assiddiq/inbox', items[0].href), false);
  assert.equal(navigation.isPublicClassesRoot('/m/assiddiq/admin', '/m/assiddiq/admin/programs'), false);
});

test('guest application action requests login; authenticated applicants retain Apply', () => {
  const input = {
    fields: { publicationStatus: 'published', lifecycleStatus: 'active', applicationStatus: 'accepting' },
    isEnrolled: false, requestStatus: null, paymentDue: false, capacityFull: false, waitlistAllowed: false,
    applyHref: '/apply', loginHref: '/login', viewEnrollmentHref: '/enrollment', completePaymentHref: '/payment',
  };
  assert.deepEqual(getProgramPrimaryCta({ ...input, isSignedIn: false }), { kind: 'link', label: 'Log in to apply', href: '/login' });
  assert.deepEqual(getProgramPrimaryCta({ ...input, isSignedIn: true }), { kind: 'link', label: 'Apply', href: '/apply' });
});
