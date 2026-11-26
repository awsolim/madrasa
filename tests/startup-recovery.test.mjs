import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/components/auth/public-area-gate.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function fixture() {
  let resolveSession;
  const session = new Promise(resolve => { resolveSession = resolve; });
  const states = []; const timers = new Map(); const effects = []; const routes = [];
  let gateState = 'checking'; let identity;
  const exports = {};
  let stateIndex = 0;
  const mocks = {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react': { useState: initial => { const index = stateIndex++; return [index === 0 ? gateState : initial, value => { if (index === 0) { gateState = value; states.push(value); } }]; }, useEffect: fn => effects.push(fn), useSyncExternalStore: () => null },
    'next/image': {}, 'next/link': {},
    'next/navigation': { usePathname: () => '/m/assiddiq', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: route => routes.push(route) }) },
    '@/components/layout/page-shell': { AppChrome: 'AppChrome' },
    '@/lib/public-navigation': { publicAccountDestination: () => '/m/assiddiq/admin/programs', publicPrimaryTab: () => 'classes' },
    '@/lib/client-cache': { loadCachedSession: () => session, loadCachedUserAccess: async () => ({ isMosqueAdmin: true }) },
    '@/components/auth/tenant-startup-state': {},
    '@/components/auth/account-connection-error': { accountConnectionMessage: 'Connection interrupted' },
    '@/lib/navigation-paths': { browserHref: path => path },
    '@/hooks/use-session-identity': { useSessionIdentity: () => identity },
  };
  vm.runInNewContext(code, { exports, window: { location: { hostname: 'localhost' } }, setTimeout: (fn, ms) => { timers.set(fn, ms); return fn; }, clearTimeout: id => timers.delete(id), require: name => {
    if (name in mocks) return mocks[name]; throw new Error(name);
  } });
  exports.PublicAreaGate({ slug: 'assiddiq', mosqueName: 'Assiddiq', mosqueLogoUrl: '/logo.png', children: null });
  const cleanup = effects[0]();
  return { states, timers, routes, cleanup, resolveSession, renderGuest: () => {
    identity = null; stateIndex = 0;
    return exports.PublicAreaGate({ slug: 'assiddiq', mosqueName: 'Assiddiq', mosqueLogoUrl: '/logo.png', children: 'public classes' });
  } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('startup offers recovery after ten seconds and still accepts a late successful account', async () => {
  const f = fixture();
  assert.equal([...f.timers.values()][0], 10000);
  [...f.timers.keys()][0]();
  assert.equal(f.states.at(-1), 'error');
  assert.equal(f.routes.length, 0);
  f.resolveSession({ user: { id: 'admin' } });
  await flush();
  assert.equal(f.states.at(-1), 'redirecting');
  assert.equal(f.routes[0], '/m/assiddiq/admin/programs');
  assert.equal(f.timers.size, 0);
});

test('leaving startup cancels its deadline and ignores late account results', async () => {
  const f = fixture();
  f.cleanup();
  assert.equal(f.timers.size, 0);
  f.resolveSession({ user: { id: 'admin' } });
  await flush();
  assert.equal(f.states.length, 0);
  assert.equal(f.routes.length, 0);
});

test('confirmed guests finish promptly without a later timeout screen', async () => {
  const f = fixture();
  f.resolveSession(null);
  await flush();
  assert.equal(f.states.at(-1), 'signed-out');
  assert.equal(f.timers.size, 0);
  const view = f.renderGuest();
  assert.equal(view.type, 'AppChrome');
  assert.equal(view.props.children, 'public classes');
  assert.equal(f.routes.length, 0);
});
