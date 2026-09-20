import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrivateSnapshot, clearAllQueryCache } from '../src/lib/query-cache.ts';

test('opening a tab during prefetch shares its request and subsequent visits reuse it', async () => {
  let finish;
  let calls = 0;
  const fetcher = () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  };
  const warm = loadPrivateSnapshot('prefetch-test:user-a', fetcher);
  const visit = loadPrivateSnapshot('prefetch-test:user-a', fetcher);
  assert.equal(calls, 1);
  finish({ messages: ['ready'] });
  assert.deepEqual(await visit, await warm);
  assert.deepEqual(await loadPrivateSnapshot('prefetch-test:user-a', fetcher), { messages: ['ready'] });
  assert.equal(calls, 1);
  assert.deepEqual(await loadPrivateSnapshot('prefetch-test:user-a', async () => ({ messages: ['updated'] }), true), { messages: ['updated'] });
  clearAllQueryCache();
});

test('failed prefetch can retry, and a different user cannot reuse another snapshot', async () => {
  await assert.rejects(loadPrivateSnapshot('prefetch-failure:a', async () => { throw new Error('offline'); }));
  assert.equal(await loadPrivateSnapshot('prefetch-failure:a', async () => 'recovered'), 'recovered');
  assert.equal(await loadPrivateSnapshot('prefetch-failure:b', async () => 'other user'), 'other user');
  clearAllQueryCache();
});

test('sign-out prevents an unfinished prefetch from repopulating the cache', async () => {
  let finish;
  const old = loadPrivateSnapshot('prefetch-signout', () => new Promise(resolve => { finish = resolve; }));
  clearAllQueryCache();
  finish('old session');
  await old;
  assert.equal(await loadPrivateSnapshot('prefetch-signout', async () => 'new session'), 'new session');
  clearAllQueryCache();
});
