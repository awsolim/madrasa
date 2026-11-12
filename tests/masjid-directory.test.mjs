import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryMasjids, masjidHomepage } from '../src/lib/masjid-directory.ts';

test('production opens tenant origins; local and preview sites stay in their own environment', () => {
  assert.equal(masjidHomepage('assiddiq', 'madrasa.ca', 'madrasa.ca'), 'https://assiddiq.madrasa.ca/');
  assert.equal(masjidHomepage('assiddiq', 'www.madrasa.ca', 'madrasa.ca'), 'https://assiddiq.madrasa.ca/');
  for (const hostname of ['localhost', '127.0.0.1', 'preview.netlify.app']) {
    assert.equal(masjidHomepage('assiddiq', hostname, 'madrasa.ca'), '/m/assiddiq');
  }
  assert.equal(masjidHomepage('example', 'example.org', 'example.org'), 'https://example.example.org/');
});

test('directory lists registered tenants alphabetically and omits unusable tenant routes', () => {
  const row = (name, slug) => ({ name, slug, logo_url: null, address: null });
  const tenants = [row('Zayed Center', 'zayed-center'), row('Assiddiq', 'assiddiq'), row('Invalid', '../login'), row('Root', 'www'), row('  ', 'blank')];
  assert.deepEqual(directoryMasjids(tenants).map(masjid => masjid.slug), ['assiddiq', 'zayed-center']);
  assert.equal(tenants[0].slug, 'zayed-center', 'normalization does not mutate database results');
});
