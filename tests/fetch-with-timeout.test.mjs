import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/lib/supabase/fetch-with-timeout.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(fetcher) {
  const exports = {};
  vm.runInNewContext(code, { exports, fetch: fetcher, AbortController, Request, TypeError, setTimeout, clearTimeout });
  return exports.fetchWithTimeout;
}
const pendingFetch = (_input, { signal }) => new Promise((_, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('a stalled request produces a descriptive retryable network error', async () => {
  const fetcher = fixture(pendingFetch)(5);
  await assert.rejects(fetcher('https://example.test'), error => error instanceof TypeError && /connection to Supabase timed out/.test(error.message));
});

test('caller cancellation preserves the original reason including Request signals', async () => {
  const controller = new AbortController();
  const reason = new Error('Navigation cancelled');
  const fetcher = fixture(pendingFetch)(100);
  const pending = fetcher(new Request('https://example.test', { signal: controller.signal }));
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  await assert.rejects(fetcher('https://example.test', { signal: controller.signal }), error => error === reason);
});

test('successful and failed fetches both remove their caller signal listener', async () => {
  for (const fail of [false, true]) {
    let adds = 0; let removes = 0;
    const signal = { aborted: false, addEventListener() { adds++; }, removeEventListener() { removes++; } };
    const response = { ok: true };
    const fetcher = fixture(async () => { if (fail) throw new TypeError('Network failure'); return response; })(100);
    if (fail) await assert.rejects(fetcher('https://example.test', { signal }), /Network failure/);
    else assert.equal(await fetcher('https://example.test', { signal }), response);
    assert.equal(adds, 1); assert.equal(removes, 1);
  }
});
