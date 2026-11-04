// Run BEFORE cutting DNS over: saves every URL Pika currently serves, so nothing silently 404s later.
// Usage: node scripts/snapshot-urls.mjs [https://tiagovf.com]
import { writeFileSync, mkdirSync } from 'node:fs';
const base = (process.argv[2] ?? 'https://tiagovf.com').replace(/\/$/, '');
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} -> ${r.status}`); return r.text(); };
const paths = new Set();
const sm = await get(`${base}/sitemap.xml`);
for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) paths.add(new URL(m[1]).pathname);
// The feed is not in the sitemap but must keep working.
paths.add('/posts_feed');
mkdirSync('data', { recursive: true });
const out = [...paths].sort();
writeFileSync('data/pika-urls.txt', out.join('\n') + '\n');
console.log(`Saved ${out.length} URLs to data/pika-urls.txt`);
