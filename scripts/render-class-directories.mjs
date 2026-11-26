import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { renderDirectory, validSlug } from './lib/class-directory.mjs';

// Entirely local; safe to run during an outage or a build. The reviewed JSON
// files are the source of truth for these independent, script-free pages.
const names = (await readdir('data/class-directory')).filter(name => name.endsWith('.json') && name !== 'tenants.json');
const prepared = [];
for (const name of names.sort()) {
  const directory = JSON.parse(await readFile(`data/class-directory/${name}`, 'utf8'));
  if (!validSlug(directory.slug) || name !== `${directory.slug}.json`) throw new Error(`Invalid directory filename: ${name}`);
  prepared.push({ slug: directory.slug, html: renderDirectory(directory) });
}
await mkdir('public/continuity', { recursive: true });
for (const item of prepared) await writeFile(`public/continuity/${item.slug}.html`, item.html);
await writeFile('data/class-directory/tenants.json', JSON.stringify(prepared.map(item => item.slug)) + '\n');
console.log(`Rendered ${prepared.length} independent class directories.`);
