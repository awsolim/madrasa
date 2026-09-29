import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { programMediaType, validateProgramMediaFile } from '../src/lib/program-media.ts';

function moduleWithMocks(path, mocks) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency ${name}`);
  }, exports);
  return exports;
}
function query(result) {
  const chain = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'not', 'maybeSingle']) chain[key] = () => chain;
  return chain;
}
function authModule(failureTable) {
  const results = {
    mosques: { data: { id: 'mosque' } },
    profiles: { data: { id: 'admin', account_type: 'admin' } },
    mosque_memberships: { data: [{ role: 'admin', status: 'active' }] },
  };
  if (failureTable) results[failureTable] = { data: null, error: { message: 'network failed' } };
  return moduleWithMocks('../src/lib/authz.ts', { '@/lib/supabase/client': { createSupabaseBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'admin', user_metadata: { account_type: 'parent' } } } } }) },
    from: table => query(results[table]),
  }) } });
}
test('database account type beats stale metadata and routes admin correctly', async () => {
  const mod = authModule();
  const access = await mod.loadUserAccessByMosqueSlug('masjid');
  assert.equal(access.isMosqueAdmin, true);
  assert.equal(mod.getAccountLabel(access), 'Admin Account');
  assert.equal(mod.getDefaultLandingHref('masjid', access), '/m/masjid/admin');
});
for (const table of ['profiles', 'mosque_memberships', 'mosques']) {
  test(`failed ${table} lookup never resolves as a parent or guest`, async () => {
    await assert.rejects(authModule(table).loadUserAccessByMosqueSlug('masjid'));
  });
}
test('application recipients include authorized admins and deduplicate overlapping assignments', async () => {
  const mod = moduleWithMocks('../src/lib/push/program-recipients.ts', { 'server-only': {} });
  const checked = [];
  const client = {
    from: table => query({ data: table === 'mosque_memberships' ? [{ profile_id: 'admin' }, { profile_id: 'denied' }] : [
      { teacher_profile_id: 'director', role: 'director' },
      { teacher_profile_id: 'lead', role: 'instructor', can_decide_applications: true },
      { teacher_profile_id: 'view-only', role: 'instructor', can_decide_applications: false },
    ] }),
    rpc: async (_, args) => { checked.push(args.check_profile_id); return { data: args.check_profile_id !== 'denied' }; },
  };
  const ids = await mod.getProgramApplicationReviewerProfileIds(client, { id: 'class', mosque_id: 'mosque', director_profile_id: 'director', teacher_profile_id: null });
  assert.deepEqual([...ids].sort(), ['admin', 'director', 'lead']);
  assert.equal(checked.filter(id => id === 'director').length, 1);
});
test('media validation rejects unsupported and oversized files on client and server', () => {
  assert.equal(programMediaType({ name: 'unsafe.jpg', type: 'image/svg+xml' }), null);
  assert.equal(programMediaType({ name: 'clip.mov', type: '' }), 'video');
  assert.equal(validateProgramMediaFile({ name: 'photo.png', type: 'image/png', size: 10 * 1024 * 1024 }), null);
  assert.match(validateProgramMediaFile({ name: 'clip.mp4', type: 'video/mp4', size: 51 * 1024 * 1024 }), /50 MB/);
  assert.match(validateProgramMediaFile({ name: 'photo.jpg', type: 'image/jpeg', size: 0 }), /empty/);
});
