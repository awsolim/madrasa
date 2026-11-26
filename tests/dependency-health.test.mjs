import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compile = async path => ts.transpileModule(await readFile(new URL('../' + path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const code = await compile('src/lib/monitoring/dependency-health.ts');
function fixture() {
  const exports = {};
  vm.runInNewContext(code, { exports, URL, AbortSignal, Date });
  return exports.checkDependencies;
}

test('readiness checks Auth and database concurrently without returning public data or keys', async () => {
  const paths = [];
  const check = fixture();
  const result = await check('https://db.example.test', 'public-test-key', async (url, options) => {
    paths.push(url.pathname);
    assert.equal(options.headers.apikey, 'public-test-key');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(url.pathname.startsWith('/auth') ? { version: 'test' } : [{ id: 'private-test-value' }]);
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(paths.sort(), ['/auth/v1/health', '/rest/v1/mosques']);
  assert.doesNotMatch(JSON.stringify(result), /public-test-key|private-test-value/);
});

test('dependency HTTP failures, transport errors and malformed bodies report degraded', async () => {
  for (const failure of ['http', 'transport', 'body', 'shape']) {
    const result = await fixture()('https://db.example.test', 'key', async url => {
      if (url.pathname.startsWith('/auth')) return Response.json({ version: 'test' });
      if (failure === 'http') return Response.json({ message: 'upstream error' }, { status: 503 });
      if (failure === 'transport') throw new TypeError('Network failed');
      if (failure === 'body') return new Response('invalid JSON');
      return Response.json({ unexpected: true });
    });
    assert.equal(result.status, 'degraded');
    assert.equal(result.checks.auth.status, 'up');
    assert.equal(result.checks.database.status, 'down');
  }
});

test('health route returns 503 on missing configuration and does not leak environment errors', async () => {
  const exports = {};
  vm.runInNewContext(await compile('src/app/api/health/route.ts'), { exports, Response, Date, require: name => {
    if (name.includes('dependency-health')) return {};
    if (name.endsWith('/env')) return { getSupabasePublicEnv() { throw new Error('secret diagnostic'); } };
    throw new Error(name);
  } });
  const response = await exports.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /secret diagnostic/);
});

test('health route exposes dependency failure as 503 rather than a misleading successful page', async () => {
  for (const status of ['ok', 'degraded']) {
    const exports = {};
    vm.runInNewContext(await compile('src/app/api/health/route.ts'), { exports, Response, Date, require: name => {
      if (name.includes('dependency-health')) return { checkDependencies: async () => ({ status }) };
      if (name.endsWith('/env')) return { getSupabasePublicEnv: () => ({ url: 'https://db.example.test', anonKey: 'key' }) };
      throw new Error(name);
    } });
    assert.equal((await exports.GET()).status, status === 'ok' ? 200 : 503);
  }
});

test('signup transport errors explain uncertain account creation without exposing raw abort text', async () => {
  const exports = {};
  const authCode = await compile('src/components/auth/auth-panel.tsx');
  vm.runInNewContext(authCode + '\nexports.signupMessage = getSignupErrorMessage;', { exports, require: () => ({}) });
  for (const message of ['signal is aborted without reason', 'The connection to Supabase timed out.', 'Failed to fetch']) {
    assert.match(exports.signupMessage(message), /couldn’t confirm account creation/);
    assert.match(exports.signupMessage(message), /Check your email/);
  }
  assert.match(exports.signupMessage('User already registered'), /already in use/);
  assert.equal(exports.signupMessage('Password is too weak'), 'Password is too weak');
});
