import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compile = async file => ts.transpileModule(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const clientCode = await compile('src/lib/supabase/client.ts');
const cacheCode = await compile('src/lib/client-cache.ts');
const queryCacheCode = await compile('src/lib/query-cache.ts');

test('development module reloads reuse one browser client and keep projects separate', () => {
  let creates = 0;
  let url = 'https://one.example.test';
  const context = vm.createContext({ window: {}, require: name => {
    if (name === '@supabase/supabase-js') return { createClient: () => ({ instance: ++creates }) };
    if (name.endsWith('/env')) return { getSupabasePublicEnv: () => ({ url, anonKey: 'public-test' }) };
    if (name.endsWith('/fetch-with-timeout')) return { fetchWithTimeout: () => () => {} };
    throw new Error(name);
  } });
  function reload() { context.exports = {}; vm.runInContext(`(function() { ${clientCode}\n})()`, context); return context.exports.createSupabaseBrowserClient(); }
  const first = reload();
  assert.equal(reload(), first);
  assert.equal(creates, 1);
  url = 'https://two.example.test';
  assert.notEqual(reload(), first);
  assert.equal(creates, 2);
});

function cacheFixture(loadAccess = async () => { throw new Error("Access unavailable"); }, environment = {}) {
  let finish;
  let authEvent;
  let logoutOptions;
  const events = new Map();
  const destinations = [];
  const auth = {
    getSession: () => new Promise(resolve => { finish = resolve; }),
    onAuthStateChange: callback => { authEvent = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async options => { logoutOptions = options; return environment.signOut?.(); },
  };
  const exports = {};
  vm.runInNewContext(cacheCode, { exports, navigator: environment.navigator ?? {}, window: {
    addEventListener: (name, callback) => events.set(name, callback),
    location: { hostname: 'assiddiq.madrasa.ca', replace: href => destinations.push(href) },
    ...environment.window,
  }, require: name => {
    if (name.endsWith('/client')) return { createSupabaseBrowserClient: () => ({ auth }) };
    if (name.endsWith('/query-cache')) return { clearAllQueryCache() {} };
    if (name.endsWith('/authz')) return { emptyUserAccess: {}, loadUserAccessByMosqueSlug: loadAccess };
    if (name.endsWith('/profile-images')) return { canHaveProfilePhoto: () => false };
    if (name.endsWith('/navigation-paths')) return { browserHref: (href, slug, hostname) => hostname === `${slug}.madrasa.ca` ? href.replace(`/m/${slug}`, '') : href };
    throw new Error(name);
  } });
  return { exports, destinations, pageshow: persisted => events.get('pageshow')({ persisted }), finish: value => finish({ data: { session: value } }), finishError: error => finish({ data: { session: null }, error }), authEvent: (event, value) => authEvent(event, value), get logoutOptions() { return logoutOptions; } };
}

test('late session read cannot erase a newer successful sign-in', async () => {
  const f = cacheFixture();
  const read = f.exports.loadCachedSession();
  const session = { user: { id: 'new-user' }, access_token: 'test' };
  f.exports.setCachedSessionSnapshot(session);
  f.finish(null);
  assert.equal(await read, session);
  assert.equal(f.exports.getCachedSessionSnapshot(), session);
});

test('late session read cannot restore the previous account after sign-out', async () => {
  const f = cacheFixture();
  const read = f.exports.loadCachedSession();
  f.authEvent('SIGNED_IN', { user: { id: 'old-user' } });
  f.authEvent('SIGNED_OUT', null);
  f.finish({ user: { id: 'old-user' } });
  assert.equal(await read, null);
  assert.equal(f.exports.getCachedSessionSnapshot(), null);
});

test('an old initialization callback cannot replace a newer login', async () => {
  const f = cacheFixture();
  const read = f.exports.loadCachedSession();
  const session = { user: { id: 'signed-in' } };
  f.exports.setCachedSessionSnapshot(session);
  f.authEvent('INITIAL_SESSION', null);
  f.finish(null);
  assert.equal(await read, session);
  assert.equal(f.exports.getCachedSessionSnapshot(), session);
});

test('logout affects only the current session, leaving other devices signed in', async () => {
  const f = cacheFixture();
  await f.exports.performClientLogout();
  assert.equal(f.logoutOptions.scope, 'local');
  assert.equal(f.exports.getCachedSessionSnapshot(), null);
});

test('logout does not wait for worker readiness and replaces history only after local sign-out', async () => {
  let finishLogout;
  let registrationReads = 0;
  const f = cacheFixture(undefined, {
    navigator: { serviceWorker: { ready: new Promise(() => {}), getRegistration: async () => { registrationReads++; return undefined; } } },
    window: { PushManager: {} },
    signOut: () => new Promise(resolve => { finishLogout = resolve; }),
  });
  f.exports.setCachedSessionSnapshot({ user: { id: 'old-account' }, access_token: 'test' });
  const logout = f.exports.performClientLogout('assiddiq');
  assert.equal(registrationReads, 1);
  assert.equal(f.logoutOptions.scope, 'local');
  assert.deepEqual(f.destinations, []);
  finishLogout({ error: null });
  await logout;
  assert.equal(f.exports.getCachedSessionSnapshot(), null);
  assert.deepEqual(f.destinations, ['/programs']);
});

test('failed local sign-out does not falsely navigate to a successful guest session', async () => {
  const f = cacheFixture(undefined, { signOut: async () => ({ error: new Error('Sign-out unavailable') }) });
  f.exports.setCachedSessionSnapshot({ user: { id: 'current-account' } });
  await assert.rejects(f.exports.performClientLogout('assiddiq'), /Sign-out unavailable/);
  assert.deepEqual(f.destinations, []);
});

test('back-forward cache restoration hides stale identity and rereads the persisted session', async () => {
  const f = cacheFixture();
  f.exports.subscribeCachedSession(() => {});
  f.exports.setCachedSessionSnapshot({ user: { id: 'previous-account' } });
  f.pageshow(false);
  assert.equal(f.exports.getCachedSessionSnapshot().user.id, 'previous-account');
  f.pageshow(true);
  assert.equal(f.exports.getCachedSessionSnapshot(), undefined);
  f.finish(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.exports.getCachedSessionSnapshot(), null);
});

test('cached error envelopes are discarded and failed queries remain retryable', async () => {
  const prefix = 'madrasa:query-cache:';
  const disk = new Map([[prefix + 'example', JSON.stringify({ updatedAt: Date.now(), data: { error: 'Log in required.' } })]]);
  const localStorage = {
    get length() { return disk.size; }, key: n => [...disk.keys()][n] ?? null,
    getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value), removeItem: key => disk.delete(key),
  };
  const exports = {};
  vm.runInNewContext(queryCacheCode, { exports, window: { localStorage }, console, performance, require: name => {
    if (name === 'react') return {};
    if (name.includes('query-timing')) return { reportQueryTiming() {} };
    throw new Error(name);
  } });
  assert.equal(disk.size, 0);
  let calls = 0;
  exports.prefetchQuery('example', async () => { calls++; return { error: 'Log in required.' }; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(disk.size, 0);
  exports.prefetchQuery('example', async () => { calls++; return { error: null, ready: true }; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(JSON.parse(disk.get(prefix + 'example')).data.ready, true);
});


test('a failed session read stays unresolved and can recover on retry', async () => {
  const f = cacheFixture();
  const read = f.exports.loadCachedSession();
  f.finishError(new Error('Network unavailable'));
  await assert.rejects(read, /Network unavailable/);
  assert.equal(f.exports.getCachedSessionSnapshot(), undefined);
  const retry = f.exports.loadCachedSession();
  const session = { user: { id: 'recovered' } };
  f.finish(session);
  assert.equal(await retry, session);
});

test('SDK null initialization does not establish a guest before the session read succeeds', async () => {
  const f = cacheFixture();
  const read = f.exports.loadCachedSession();
  f.authEvent('INITIAL_SESSION', null);
  assert.equal(f.exports.getCachedSessionSnapshot(), undefined);
  f.finish(null);
  assert.equal(await read, null);
  assert.equal(f.exports.getCachedSessionSnapshot(), null);
});

test('a stale session error cannot override a newer successful login', async () => {
  const f = cacheFixture();
  const read = f.exports.loadCachedSession();
  const session = { user: { id: 'new-login' } };
  f.authEvent('SIGNED_IN', session);
  f.finishError(new Error('Old refresh failed'));
  assert.equal(await read, session);
});


test('failed access lookup is not immediately repeated and stays retryable', async () => {
  let calls = 0;
  const f = cacheFixture(async () => { calls++; throw new Error('Network timed out'); });
  const access = await f.exports.loadCachedUserAccess('assiddiq', 'admin');
  assert.ok(access.resolutionError);
  assert.equal(calls, 1);
  assert.equal(f.exports.getCachedUserAccess('assiddiq', 'admin'), null);
  await f.exports.loadCachedUserAccess('assiddiq', 'admin');
  assert.equal(calls, 2);
});
