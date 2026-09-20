import test from 'node:test';
import assert from 'node:assert/strict';

test('reopening discards broken disk rosters and preserves live Map collections in memory', async () => {
  const prefix = 'madrasa:query-cache:';
  const key = 'teacher-roster:masjid:class';
  const disk = new Map([
    [prefix + key, JSON.stringify({ updatedAt: Date.now(), data: { trackDaysById: {} } })],
    [prefix + 'teacher-inbox:masjid:user', JSON.stringify({ updatedAt: Date.now(), data: { seenRequestIds: {} } })],
  ]);
  globalThis.window = { localStorage: {
    get length() { return disk.size; },
    key: i => [...disk.keys()][i] ?? null,
    getItem: k => disk.get(k) ?? null,
    setItem: (k, v) => disk.set(k, v),
    removeItem: k => disk.delete(k),
  } };
  try {
    const { prefetchQuery, clearAllQueryCache } = await import('../src/lib/query-cache.ts');
    assert.equal(disk.size, 0, 'legacy malformed entries are removed before rendering');
    let fetches = 0;
    const fetchRoster = async () => {
      fetches++;
      return { trackDaysById: new Map([['track', ['Monday']]]) };
    };
    prefetchQuery(key, fetchRoster);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fetches, 1, 'fresh data is requested instead of trusting malformed JSON');
    assert.equal(disk.has(prefix + key), false, 'roster is never serialized to disk');
    prefetchQuery(key, fetchRoster);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fetches, 1, 'repeat visits reuse the valid in-memory snapshot');
    prefetchQuery('private-test', async () => ({ value: 'private' }), { persist: false });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(disk.has(prefix + 'private-test'), false);
    clearAllQueryCache();
  } finally {
    delete globalThis.window;
  }
});
