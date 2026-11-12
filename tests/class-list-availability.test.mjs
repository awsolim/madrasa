import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/data/supabase-public-sections.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('sections.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fetcher = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'fetchTeacherPrograms');
const compiled = ts.transpileModule(fetcher.getText(parsed), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(coreError = null) {
  const snapshot = { error: null, accountType: 'admin', mosqueId: 'mosque', programs: [{ id: 'class', title: 'Class' }],
    assignments: [], memberships: [{ role: 'admin', status: 'active' }], tracks: [], activeEnrollments: [{ program_id: 'class' }], pendingRequests: [{ program_id: 'class' }], instructorRows: [], sessions: [], links: [] };
  const exports = {};
  const db = {
    rpc: async name => name === 'get_teacher_programs_snapshot' ? { data: snapshot, error: coreError }
      : { data: null, error: { code: 'PGRST202', message: 'Function is not installed' } },
    from() {
      const query = { select: () => query, eq: async () => ({ data: [], error: null }), in: async () => ({ data: [], error: null }) };
      return query;
    },
  };
  vm.runInNewContext(compiled, { exports,
    loadCachedSession: async () => ({ user: { id: 'admin' } }), createSupabaseBrowserClient: () => db,
    applyLinkedSessionsToTracks: () => [], emptyTeacherProgramsResult: { programs: [], programCounts: {}, error: null },
  });
  return exports.fetchTeacherPrograms;
}

test('missing supplemental counts cannot prevent the class list from loading', async () => {
  const result = await fixture()('demo');
  assert.equal(result.error, null);
  assert.equal(result.programs.length, 1);
  assert.equal(result.programCounts.class.students, 1);
  assert.equal(result.programCounts.class.pendingApplications, 1);
  assert.equal(result.programCounts.class.applications, undefined, 'unknown totals are not presented as zero');
  assert.equal(result.programCounts.class.pendingWithdrawals, undefined);
});

test('an actual class-data failure still reports its error', async () => {
  const result = await fixture({ message: 'Class data unavailable' })('demo');
  assert.equal(result.error, 'Class data unavailable');
  assert.equal(result.programs.length, 0);
});
