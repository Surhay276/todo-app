// Zählt die Versionsnummer überall gleichzeitig hoch: ?v= an CSS/JS, <meta name="app-version"> und version.json.
// Aufruf nach jeder Änderung: node scripts/bump-version.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('version.json', root), 'utf8'));
const next = String(Number(version) + 1);

const files = ['index.html', ...readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
for (const file of files) {
  const url = new URL(file, root);
  const before = readFileSync(url, 'utf8');
  const after = before
    .replace(/\?v=\d+/g, `?v=${next}`)
    .replace(/<meta name="app-version" content="\d+">/, `<meta name="app-version" content="${next}">`);
  if (after !== before) writeFileSync(url, after);
}
writeFileSync(new URL('version.json', root), `${JSON.stringify({ version: next })}\n`);
console.log(`Version ${version} → ${next}`);
