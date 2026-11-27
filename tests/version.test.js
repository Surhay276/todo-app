import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Die Seite lädt sich selbst neu, wenn version.json neuer ist als die zwischengespeicherte Seite.
// Das klappt nur, wenn alle Versionsangaben übereinstimmen (siehe scripts/bump-version.mjs).
test('Versionsnummern sind überall gleich', () => {
  const root = new URL('../', import.meta.url);
  const { version } = JSON.parse(readFileSync(new URL('version.json', root), 'utf8'));
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, new RegExp(`<meta name="app-version" content="${version}">`));
  const sources = [html, ...readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(`js/${f}`, root), 'utf8'))];
  const found = new Set(sources.flatMap((s) => [...s.matchAll(/\?v=(\d+)/g)].map((m) => m[1])));
  assert.deepEqual([...found], [version]);
});
