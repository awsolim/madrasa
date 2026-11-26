import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/lib/tenant-branding.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(fetcher) {
  const exports = {};
  vm.runInNewContext(code, { exports, URL, AbortSignal, process: { env: {} }, fetch: fetcher, require: name => {
    if (name === 'server-only') return {};
    if (name === 'react') return { cache: fn => fn };
    if (name.endsWith('/env')) return { getSupabasePublicEnv: () => ({ url: 'https://db.example.test', anonKey: 'public-key' }) };
    throw new Error(name);
  } });
  return exports;
}

test('tenant branding failure retains tenant identity and never adopts platform branding', async () => {
  const f = fixture(async () => { throw new Error('timeout'); });
  const result = await f.loadTenantBrandingBySlug('assiddiq');
  assert.equal(result.name, 'Assiddiq');
  assert.equal(result.chromeName, 'Assiddiq');
  assert.equal(result.iconUrl, '/tenant-icon.svg');
  assert.equal((await f.loadTenantBrandingFromHost('madrasa.ca')).name, 'Madrasa');
  assert.equal(f.tenantSlugFromHost('assiddiq.madrasa.ca, proxy.internal'), 'assiddiq');
});

test('branding reads only public identity, caches it, and keeps the last known logo during an outage', async () => {
  let fail = false;
  let options;
  let endpoint;
  const f = fixture(async (url, init) => {
    options = init; endpoint = url;
    if (fail) return { ok: false };
    return { ok: true, json: async () => [{ name: 'Assiddiq Islamic Center', short_name: 'Assiddiq', slug: 'assiddiq', logo_url: '/assiddiq.png' }] };
  });
  const first = await f.loadTenantBrandingBySlug('assiddiq');
  assert.equal(first.chromeName, 'Assiddiq');
  assert.equal(endpoint.searchParams.get('slug'), 'eq.assiddiq');
  assert.equal(options.headers.apikey, 'public-key');
  assert.equal(options.next.revalidate, 300);
  assert.ok(options.signal instanceof AbortSignal);
  fail = true;
  const fallback = await f.loadTenantBrandingBySlug('assiddiq');
  assert.equal(fallback, first);
  assert.equal(fallback.iconUrl, '/assiddiq.png');
});
