import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createDirectory, renderDirectory, validSlug } from './lib/class-directory.mjs';

const slug = process.argv.find(value => value.startsWith('--mosque='))?.slice(9);
if (!slug || !validSlug(slug)) throw new Error('Use --mosque=assiddiq (a registered public tenant slug).');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Public Supabase configuration is required. No service-role key is used.');
async function rpc(name, body) {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Public snapshot unavailable (HTTP ${response.status}); existing files retained.`);
  return response.json();
}
// Complete every read before replacing the last good directory. Sequential,
// bounded requests avoid adding a burst of load to an unhealthy project.
const snapshot = await rpc('get_mosque_programs_snapshot', { p_slug: slug });
const details = new Map();
for (const p of snapshot.programs ?? []) {
  if (p.is_active && (p.publication_status ?? 'published') === 'published' && !['cancelled', 'archived'].includes(p.lifecycle_status)) {
    details.set(p.id, await rpc('get_program_detail_snapshot', { p_slug: slug, p_program_id: p.id, p_section: 'public' }));
  }
}
let contactOverrides = {};
try { contactOverrides = JSON.parse(await readFile(`data/class-directory/overrides/${slug}.json`, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const directory = createDirectory(slug, snapshot, details, new Date().toISOString(), contactOverrides);
const html = renderDirectory(directory);
await mkdir('public/continuity', { recursive: true });
await mkdir('data/class-directory', { recursive: true });
// A developer reviews/commits these public artifacts before deployment. This
// command neither deploys nor changes the production database.
await writeFile(`data/class-directory/${slug}.json.tmp`, JSON.stringify(directory, null, 2) + '\n');
await writeFile(`public/continuity/${slug}.html.tmp`, html);
await rename(`data/class-directory/${slug}.json.tmp`, `data/class-directory/${slug}.json`);
await rename(`public/continuity/${slug}.html.tmp`, `public/continuity/${slug}.html`);
console.log(`Prepared public directory for ${directory.name}: ${directory.classes.length} classes. Review contacts and commit both files before deploying.`);
