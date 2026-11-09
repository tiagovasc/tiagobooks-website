// Content-versioned URLs for the shared stylesheet and scripts.
// Every page links these files, and without a version each page view had to ask the server
// whether they changed before it could paint. A ?v= content hash lets browsers keep them for a
// year; the servers grant that only when the requested hash matches the file they hold.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {assetVersion} from '../library/asset-version.mjs';

// Order matters: a file is hashed only after the files it imports carry their versions.
const ASSETS=[
  ['/tbr.css','library/tbr.css'],
  ['/tbr.js','library/tbr.js'],
  ['/date-rail.js','dist/date-rail.js'],
  ['/blog-filter.js','dist/blog-filter.js'],
  ['/unified.css','dist/unified.css'],
  ['/unified.js','dist/unified.js'],
  ['/js/enhancements.js','dist/js/enhancements.js'],
  ['/js/library-warm.js','dist/js/library-warm.js'],
];
const quoted=url=>new RegExp(`(["'])${url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\1`,'g');
const versions=new Map();
function versioned(text){for(const [url,v] of versions)text=text.replace(quoted(url),(m,q)=>`${q}${url}?v=${v}${q}`);return text}
for(const [url,file] of ASSETS){
  if(file.startsWith('dist/')){const before=readFileSync(file,'utf8'),after=versioned(before);if(after!==before)writeFileSync(file,after)}
  versions.set(url,assetVersion(readFileSync(file)));
}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)])}
let pages=0;
for(const file of walk('dist')){
  if(!file.endsWith('.html')||file.replaceAll('\\','/').includes('/admin/'))continue;
  const before=readFileSync(file,'utf8');
  // Only attribute values in markup: <link href> and <script src>.
  const after=before.replace(/<(link|script)\b[^>]*>/g,tag=>versioned(tag));
  if(after!==before){writeFileSync(file,after);pages++}
}
console.log(`Versioned ${versions.size} shared assets in ${pages} pages`);
