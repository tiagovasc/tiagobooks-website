// Flags Pika-specific leftovers in imported Markdown that will not work (or will vanish) after leaving Pika.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const dirs = ['src/content/posts', 'src/content/pages'];
const rules = [
  [/\{\{\s*[a-z_]+[^}]*\}\}/gi, 'Pika variable (e.g. {{ search_form }}); needs a template equivalent'],
  [/https?:\/\/[a-z0-9.-]*pika\.page[^\s)"']*/gi, 'link/asset on pika.page; will break when the account is cancelled'],
  [/https?:\/\/[a-z0-9.-]*(?:pikapage|pika-cdn|pikaassets)[^\s)"']*/gi, 'asset on a Pika CDN host'],
  [/<(?:iframe|script|embed)\b/gi, 'raw embed/script; check it renders and is trusted'],
];
let problems = 0;
const imgRe = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;
for (const d of dirs) {
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) {
    if (!/\.mdx?$/.test(f)) continue;
    const text = readFileSync(join(d, f), 'utf8');
    for (const [re, why] of rules) for (const m of text.matchAll(re)) { problems++; console.log(`${d}/${f}: ${why}: ${m[0].slice(0, 90)}`); }
    for (const m of text.matchAll(imgRe)) {
      const src = decodeURIComponent(m[1]);
      if (src.startsWith('/') && !existsSync(join('public', src))) { problems++; console.log(`${d}/${f}: missing local image ${src}`); }
    }
    if (f !== f.toLowerCase() || /\s/.test(f)) { problems++; console.log(`${d}/${f}: filename is the URL slug; use lowercase, no spaces`); }
  }
}
console.log(problems ? `${problems} issue(s) found.` : 'No issues found.');
process.exit(problems ? 1 : 0);
