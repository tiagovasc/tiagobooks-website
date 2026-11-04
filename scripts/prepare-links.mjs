import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import site from '../src/lib/site-config.mjs';
import { readRedirects } from '../src/lib/link-policy.mjs';
import { rewriteHtml } from '../src/lib/html-links.mjs';

const redirects = readRedirects('dist/_redirects');
function walk(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]); }
let count=0;
for (const file of walk('dist')) {
  if (!file.endsWith('.html') || file.replaceAll('\\','/').includes('/admin/')) continue;
  let route = '/' + file.replaceAll('\\','/').slice(5).replace(/\.html$/,'');
  if (route === '/index') route='/';
  writeFileSync(file,rewriteHtml(readFileSync(file,'utf8'),{basePath:route,redirectMap:redirects})); count++;
}
let cms = readFileSync('public/admin/config.yml','utf8').replace(/^(site_url|display_url):.*$/gm, '$1: '+site.url);
if(process.env.CMS_REPOSITORY){
  if(!/^[-\w.]+\/[-\w.]+$/.test(process.env.CMS_REPOSITORY)||['tiagovasc/tiagovf-site','tiagovasc/book-library'].includes(process.env.CMS_REPOSITORY.toLowerCase()))throw Error('Use an independent integration CMS repository');
  cms=cms.replace(/^  repo:.*$/m,'  repo: '+process.env.CMS_REPOSITORY);
}
writeFileSync('dist/admin/config.yml',cms);
console.log(`Prepared portable links in ${count} pages and CMS domain settings.`);
