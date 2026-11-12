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

function cacheFixture() {
  let finish;
  let authEvent;
  let logoutOptions;
  const auth = {
    getSession: () => new Promise(resolve => { finish = resolve; }),
    onAuthStateChange: callback => { authEvent = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async options => { logoutOptions = options; },
  };
  const exports = {};
  vm.runInNewContext(cacheCode, { exports, navigator: {}, window: {}, require: name => {
    if (name.endsWith('/client')) return { createSupabaseBrowserClient: () => ({ auth }) };
    if (name.endsWith('/query-cache')) return { clearAllQueryCache() {} };
    if (name.endsWith('/authz')) return { emptyUserAccess: {} };
    if (name.endsWith('/profile-images')) return { canHaveProfilePhoto: () => false };
    throw new Error(name);
  } });
  return { exports, finish: value => finish({ data: { session: value } }), authEvent: (event, value) => authEvent(event, value), get logoutOptions() { return logoutOptions; } };
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
