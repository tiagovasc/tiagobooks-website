// Fails if any URL in data/pika-urls.txt is neither built into dist/ nor redirected via dist/_redirects.
// Usage: node scripts/compare-urls.mjs [list-file]   (run after `npm run build`)
import { readFileSync, existsSync } from 'node:fs';
const list = process.argv[2] ?? 'data/pika-urls.txt';
if (!existsSync(list)) { console.error(`No ${list}. Run scripts/snapshot-urls.mjs first.`); process.exit(2); }
const redirects = new Set(
  (existsSync('dist/_redirects') ? readFileSync('dist/_redirects', 'utf8') : '')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/)[0]),
);
const built = (p) => {
  const clean = p === '/' ? '/index' : p.replace(/\/$/, '');
  return existsSync(`dist${clean}.html`) || existsSync(`dist${clean}`) || existsSync(`dist${clean}/index.html`);
};
const missing = readFileSync(list, 'utf8').split(/\r?\n/).map(p => p.trim()).filter(Boolean)
  .filter((p) => !built(p) && !redirects.has(p));
if (missing.length) {
  console.error(`MISSING ${missing.length} URL(s) that Pika serves today:\n` + missing.join('\n'));
  process.exit(1);
}
console.log('OK: every URL in the snapshot is built or redirected.');
