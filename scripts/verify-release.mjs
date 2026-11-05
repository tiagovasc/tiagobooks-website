import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { load } from 'js-yaml';
let count=0;
for(const kind of ['posts','pages']) for(const name of readdirSync(`src/content/${kind}`)) {
  if(!name.endsWith('.md')) continue;
  const text=readFileSync(`src/content/${kind}/${name}`,'utf8');
  const data=load(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  const output=`dist/${kind}/${name.replace(/\.md$/,'.html')}`;
  if(data.draft) {assert(!existsSync(output)); continue;}
  assert(existsSync(output), `Missing ${output}`); count++;
}
for(const file of ['index.html','library.html','search.html','404.html','posts_feed','robots.txt','sitemap-index.xml','pagefind/pagefind.js','admin/index.html','admin/sveltia-cms.js']) assert(existsSync('dist/'+file),`Missing ${file}`);
assert(!readFileSync('dist/index.html','utf8').includes('Sample Post'));
assert(readFileSync('dist/posts_feed','utf8').includes('<content type="html">'));
console.log(`Verified ${count} published entries and essential runtime files`);
