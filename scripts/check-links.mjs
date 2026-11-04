import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { parse, parseFragment } from 'parse5';
import { load } from 'js-yaml';
import site from '../src/lib/site-config.mjs';
import { normalizeSiteLink, readRedirects } from '../src/lib/link-policy.mjs';
import { walkHtml, attr } from '../src/lib/html-links.mjs';

const redirects=readRedirects('dist/_redirects');
const pages=new Map(), errors=[];
function files(dir) {return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
function doc(html) {
  const tree=parse(html), ids=new Set();
  walkHtml(tree,n=>{const id=attr(n,'id');if(id)ids.add(id);});return {tree,ids};
}
for(const file of files('dist')) {
  if(!file.endsWith('.html') || file.replaceAll('\\','/').includes('/admin/'))continue;
  let path='/'+file.replaceAll('\\','/').slice(5).replace(/\.html$/,'');
  if(path==='/index')path='/'; pages.set(path,doc(readFileSync(file,'utf8')));
}
let checked=0, unavailable=0;
function targetExists(path) {
  if(pages.has(path))return true;
  if(path==='/login'||path==='/logout')return true;
  const libraryFile=resolve('library','.'+decodeURIComponent(path));
  if(libraryFile.startsWith(resolve('library')+sep)&&existsSync(libraryFile))return true;
  const file=resolve('dist','.'+decodeURIComponent(path));
  return file.startsWith(resolve('dist')+sep) && existsSync(file);
}
function validate(tree,path) {
  walkHtml(tree,node=>{
    if(attr(node,'class')?.split(' ').includes('unavailable-link'))unavailable++;
    for(const name of node.tagName==='a'?['href']:['img','video','audio','source'].includes(node.tagName)?['src','poster']:[]) {
      const value=attr(node,name); if(!value)continue;
      const normal=normalizeSiteLink(value,{basePath:path,redirectMap:redirects});
      let u;try{u=new URL(normal,new URL(path,site.url));}catch{errors.push({path,value,issue:'invalid URL'});continue;}
      if(u.origin!==site.url)continue;
      checked++;
      if(normal!==value)errors.push({path,value,issue:'nonportable or obsolete internal URL',expected:normal});
      if(!targetExists(u.pathname))errors.push({path,value,issue:'missing target'});
      if(name==='href' && u.hash && pages.has(u.pathname) && !pages.get(u.pathname).ids.has(decodeURIComponent(u.hash.slice(1))))errors.push({path,value,issue:'missing fragment'});
    }
    if(node.tagName==='link'&&attr(node,'rel')==='canonical'&&new URL(attr(node,'href')).origin!==site.url)errors.push({path,issue:'wrong canonical domain'});
    if(node.tagName==='meta'&&attr(node,'property')==='og:url'&&new URL(attr(node,'content')).origin!==site.url)errors.push({path,issue:'wrong social domain'});
  });
}
const liveIndex=process.argv.indexOf('--live');
const args=process.argv.slice(2);
if(args.length && !(args.length===2 && args[0]==='--live'))throw new Error('Use node scripts/check-links.mjs, optionally followed by --live and the deployed origin.');
async function artifact(file) {
  if(liveIndex<0)return readFileSync(file,'utf8');
  const response=await fetch(site.url+'/'+file.replaceAll('\\','/').slice(5),{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Cannot verify ${file}: HTTP ${response.status}`);
  return response.text();
}
if(liveIndex>=0) {
  const origin=new URL(process.argv[liveIndex+1]).origin;
  if(origin!==site.url)throw new Error('Set SITE_URL to the live origin before verification.');
  const routes=[...pages.keys()];let next=0;
  await Promise.all(Array.from({length:5},async()=>{
    while(next<routes.length){const path=routes[next++];
      try{const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});
        if(!response.ok && !(path==='/404'&&response.status===404))errors.push({path,issue:'HTTP '+response.status});
        const page=doc(await response.text()); pages.set(path,page);
      }catch(e){errors.push({path,issue:e.name});}
    }
  }));
}
for(const [path,page] of pages)validate(page.tree,path);
const cms=load(await artifact('dist/admin/config.yml'));
if(cms.site_url!==site.url||cms.display_url!==site.url)errors.push({issue:'CMS domain mismatch'});
for(const file of files('dist').filter(f=>/sitemap.*\.xml$/.test(f))){
  for(const m of (await artifact(file)).matchAll(/<loc>([^<]+)<\/loc>/g)){
    const u=new URL(m[1]);if(u.origin!==site.url)errors.push({issue:'sitemap domain mismatch',value:m[1]});
  }
}
const feed=await artifact('dist/posts_feed');
if(!feed.includes(`xml:base="${site.url}/"`))errors.push({issue:'feed base mismatch'});
for(const m of feed.matchAll(/<content type="html">([\s\S]*?)<\/content>/g)){
  const decoded=parseFragment(m[1]).childNodes.map(n=>n.value||'').join('');validate(parseFragment(decoded),'/posts_feed');
}
if(!(await artifact('dist/robots.txt')).includes(`Sitemap: ${site.url}/`))errors.push({issue:'robots sitemap domain mismatch'});
const report={origin:site.url,live:liveIndex>=0,pages:pages.size,internalReferences:checked,unavailableLabels:unavailable,errors};
writeFileSync('data/link-check-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
