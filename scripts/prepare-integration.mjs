import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import site from '../src/lib/site-config.mjs';
import {renderSiteHeader} from '../src/lib/site-shell.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The tracked library/index.html only receives the shared header, which depends on src/data/site.json alone.
// Origin-dependent tags (canonical, og:url) go into the generated dist/library.html, so a local build with a
// localhost SITE_URL can no longer leave localhost URLs in the source (as happened before 9ce445e).
if(!process.argv.includes('--finish')){
  mkdirSync('data',{recursive:true});
  const source=readFileSync('library/index.html','utf8');
  if(!/^var SEED = \[\];\r?$/m.test(source))throw Error('Personal library must not be embedded');
  const tbrCount=JSON.parse(readFileSync('library/tbr-bookshops.json','utf8')).books.length;
  const html=source.replace(/<!-- site-shell:start -->[\s\S]*?<!-- site-shell:end -->/,'<!-- site-shell:start -->'+renderSiteHeader(site,'/library')+'<!-- site-shell:end -->').replace(/data-tbr-count="\d*"/,`data-tbr-count="${tbrCount}"`);
  if(html!==source)writeFileSync('library/index.html',html);
}else{
  let html=readFileSync('library/index.html','utf8').replace('<body>','<body data-pagefind-ignore>');
  html=html.replace(/<link rel="canonical"[^>]*>/g,'').replace('</head>',`<link rel="canonical" href="${escape(site.url)}/library"></head>`);
  html=html.replace(/<meta property="og:url" content="[^"]*">/,`<meta property="og:url" content="${escape(site.url)}/library">`);
  writeFileSync('dist/library.html',html);
  copyFileSync('library/favicon.svg','dist/favicon.svg');
}
