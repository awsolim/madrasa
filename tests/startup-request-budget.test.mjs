import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const code = ts.transpileModule(readFileSync(new URL('../src/components/layout/primary-nav-prefetch.tsx', import.meta.url), 'utf8'), { compilerOptions }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function launch(section, userId) {
  const effects = []; const idle = []; const queries = [];
  const exports = {};
  const dependencies = {
    react: { useEffect: fn => effects.push(fn) },
    '@/components/data/supabase-public-sections': {
      fetchTeacherPrograms: async () => ({}), fetchStudentEnrollments: async () => ({}), fetchMosqueProgramsSnapshot: async () => ({}),
    },
    '@/hooks/use-notification-counts': { fetchStudentNotificationCounts: async () => ({}), fetchTeacherNotificationCounts: async () => ({}) },
    '@/lib/client-cache': { loadCachedSession: async () => userId ? { user: { id: userId } } : null,
      loadCachedProfileSummary: async () => ({}), loadCachedUserAccess: async () => ({}) },
    '@/lib/query-cache': { prefetchQuery: (key, fetcher) => { queries.push(key); void fetcher(); } },
  };
  new Function('require', 'exports', 'navigator', 'window', code)(name => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected launch dependency: ${name}`);
  }, exports, {}, { requestIdleCallback: fn => { idle.push(fn); return 1; }, cancelIdleCallback: () => {} });
  exports.PrimaryNavPrefetch({ slug: 'assiddiq', section });
  const cleanup = effects[0]();
  return { queries, cleanup, warm: async () => { idle[0](); await flush(); } };
}

test('staff launch warms the visible class list and counts, without a second class dataset or full inbox', async () => {
  for (const role of ['admin', 'teacher']) {
    const f = launch(role, 'staff');
    assert.equal(f.queries.length, 0);
    await f.warm();
    assert.deepEqual(f.queries.sort(), ['notification-counts:teacher:assiddiq:staff', 'teacher-programs:assiddiq:staff']);
  }
});
test('family launch preserves schedule and badges without loading unread inbox history', async () => {
  const f = launch('portal', 'parent');
  await f.warm();
  assert.deepEqual(f.queries.sort(), ['mosque-programs:assiddiq', 'notification-counts:student:assiddiq:parent', 'student-enrollments:assiddiq:parent']);
});
test('guest launch has only a public list; leaving before idle starts no prefetch', async () => {
  const guest = launch('public', null);
  await guest.warm();
  assert.deepEqual(guest.queries, ['mosque-programs:assiddiq']);
  const abandoned = launch('teacher', 'teacher');
  abandoned.cleanup();
  await abandoned.warm();
  assert.deepEqual(abandoned.queries, []);
});

const source = ts.createSourceFile('sections.tsx', readFileSync(new URL('../src/components/data/supabase-public-sections.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helper = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'warmClassDetail');
assert.ok(helper);
const intentCode = ts.transpileModule(helper.getText(source) + '\nexport { warmClassDetail };', { compilerOptions }).outputText;
function intentFixture(session, connection = {}) {
  const exports = {}; const calls = [];
  new Function('exports', 'navigator', 'loadCachedSession', 'prefetchQuery', 'fetchProgramDetailSnapshot', intentCode)(
    exports, { connection }, async () => { if (session instanceof Error) throw session; return session; },
    (key, fetcher) => { calls.push(key); void fetcher(); }, async () => ({}),
  );
  return { calls, warm: exports.warmClassDetail };
}
test('intent warming reads only the selected class and keeps account/section cache keys separate', async () => {
  for (const section of ['public', 'portal']) {
    const f = intentFixture({ user: { id: 'parent' } });
    assert.deepEqual(f.calls, []);
    f.warm('assiddiq', 'selected-class', section);
    await flush();
    assert.deepEqual(f.calls, [`program-detail:assiddiq:selected-class:${section}:parent`]);
  }
});
test('intent warming respects reduced-data connections and failed session recovery', async () => {
  for (const connection of [{ saveData: true }, { effectiveType: '2g' }]) {
    const f = intentFixture(null, connection);
    f.warm('assiddiq', 'class', 'public');
    await flush();
    assert.deepEqual(f.calls, []);
  }
  const f = intentFixture(new Error('Session unavailable'));
  f.warm('assiddiq', 'class', 'public');
  await flush();
  assert.deepEqual(f.calls, []);
});
