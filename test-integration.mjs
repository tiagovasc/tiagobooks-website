import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {parseFragment,serialize} from 'parse5';
import {searchCatalogue} from './src/lib/catalogue-search.mjs';
import {editorHandler} from './editor-api.mjs';
import {load as yaml} from 'js-yaml';
import {BLOG_VISIBILITY,isBlogPostVisible,blogMenuSections} from './src/lib/post-presentation.mjs';
const listedSourcePosts=(await Promise.all((await readdir('src/content/posts')).filter(f=>f.endsWith('.md')).map(async f=>{
 const text=await readFile('src/content/posts/'+f,'utf8');return {id:f.slice(0,-3),data:yaml(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])};
}))).filter(p=>!p.data.draft&&!p.data.unlisted&&!p.data.protected);
const blogSourcePosts=listedSourcePosts.filter(p=>isBlogPostVisible(p));
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
const fixture=await mkdtemp(path.join(os.tmpdir(),'tiago-unified-test-'));
const source=Array.from({length:40},(_,i)=>({id:String(i+1),title:'Fixture book '+i,author:'Fixture author',rating:i%6}));
const stateFile=path.join(fixture,'library.json');
await writeFile(stateFile,JSON.stringify({id:'library',revision:1,books:source}));
process.env.LOCAL_LIBRARY_FILE=stateFile;process.env.LIBRARY_PASSWORD=randomBytes(24).toString('hex');process.env.SESSION_SECRET=randomBytes(32).toString('hex');
const {server}=await import('./server.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let cookie;
test.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))});
test('library, writing, metadata, scripts, uploads and search files are served on one origin',async()=>{
  const routes=['/','/library','/posts','/search','/editor','/unified.css','/unified.js','/books.json','/tbr-bookshops.json','/pagefind/pagefind.js','/robots.txt','/sitemap-index.xml','/healthz','/favicon.svg'];
  for(const kind of ['posts','pages'])for(const f of await readdir('src/content/'+kind))if(f.endsWith('.md'))routes.push('/'+kind+'/'+f.slice(0,-3));
  for(const f of await readdir('dist/tag'))if(f.endsWith('.html'))routes.push('/tag/'+f.slice(0,-5));
  async function uploads(dir,prefix){for(const f of await readdir(dir,{withFileTypes:true})){if(f.isDirectory())await uploads(path.join(dir,f.name),prefix+'/'+f.name);else routes.push(prefix+'/'+f.name)}}
  await uploads('public/uploads','/uploads');
  for(const route of routes){const r=await fetch(base+route);assert.equal(r.status,200,route);assert.equal(r.headers.get('x-content-type-options'),'nosniff',route)}
  const html=await(await fetch(base+'/library')).text();assert.match(html,/CLOUD_CAN_EDIT=false/);assert.match(html,/var SEED = \[\];/);assert.match(html,/href="\/">Blog/);
  assert.deepEqual(await(await fetch(base+'/books.json')).json(),source);
  assert.equal((await(await fetch(base+'/tbr-bookshops.json')).json()).books.length,745);
});

test('one shared header, selected blog sections and publication months preserve the complete listing',async()=>{
  const library=await(await fetch(base+'/library')).text(),blog=await(await fetch(base+'/blog')).text();
  const shell=html=>serialize(parseFragment((html.match(/<header class="site-shell"[\s\S]*?<\/header>/)?.[0]||'').replace(/ aria-current="page"/g,'').replace(/nav-more-toggle is-current/g,'nav-more-toggle').replace(/(aria-controls="navExtra">)[^<]+/g,'$1More')));
  assert.ok(shell(library));assert.equal(shell(library),shell(blog));assert.doesNotMatch(shell(blog),/>Writing<|>General<|>Reviews<|>TBR</);
  assert.match(library,/data-collection="tbr"/);assert.doesNotMatch(await readFile('library/tbr.css','utf8'),/\.tbr-mode #statusSeg/);
  assert.deepEqual([...blog.matchAll(/data-blog-tag="([^"]*)"/g)].map(m=>m[1]),['',...blogMenuSections().map(s=>s.replace(/\s+/g,'-'))]);
  const tags=await readdir('dist/tag');assert.ok(tags.includes('Non-Fiction.html'),'legacy tag routes remain available');
  assert.equal([...blog.matchAll(/data-blog-entry/g)].length,blogSourcePosts.length);assert.ok([...blog.matchAll(/data-blog-month=/g)].length>12);
  assert.equal((await fetch(base+'/posts',{redirect:'manual'})).headers.get('location'),'/blog');
  assert.equal((await fetch(base+'/tag/Book-Reviews',{redirect:'manual'})).headers.get('location'),'/blog?tag=Book-Reviews');
  assert.equal((await fetch(base+'/date-rail.js')).status,200);
});
test('blog is the homepage and library initial counts do not depend on opening TBR',async()=>{
  const home=await(await fetch(base+'/')).text(),library=await(await fetch(base+'/library')).text();
  assert.equal([...home.matchAll(/data-blog-entry/g)].length,blogSourcePosts.length);
  const catalogue=await(await fetch(base+'/tbr-catalogue.json')).json();
  assert.match(library,new RegExp('id="statusSeg" data-tbr-count="'+catalogue.books.length+'"'));
  assert.match(library,/var STATUSES=\["read","reading","next","unread","paused"\]/);
  assert.match(home,/\/\^#book\\\//);
  const legacy=await fetch(base+'/?collection=tbr',{redirect:'manual'});
  assert.equal(legacy.status,302);assert.equal(legacy.headers.get('location'),'/library?collection=tbr');
});

test('Podcast visibility is a reversible Blog-only choice; episode links and articles remain available',async()=>{
 const podcastPosts=listedSourcePosts.filter(p=>!isBlogPostVisible(p,false));
 assert.equal(blogMenuSections(false).includes('Podcast'),false);assert.equal(blogMenuSections(true).includes('Podcast'),true);
 assert.equal(listedSourcePosts.filter(p=>isBlogPostVisible(p,true)).length,listedSourcePosts.length);
 assert.equal(listedSourcePosts.filter(p=>isBlogPostVisible(p,false)).length,listedSourcePosts.length-podcastPosts.length);
 const blog=await(await fetch(base+'/')).text(),index=await(await fetch(base+'/pages/podcast-overview')).text();
 for(const post of podcastPosts){
  const href='/posts/'+post.id;
  if(!BLOG_VISIBILITY.showPodcastPosts)assert.ok(!blog.includes('href="'+href+'"'),href+' hidden from Blog');
  assert.ok(index.includes('href="'+href+'"'),href+' retained on Podcasts');
  assert.equal((await fetch(base+href)).status,200,href);
 }
 if(!BLOG_VISIBILITY.showPodcastPosts){assert.doesNotMatch(blog,/data-blog-tag="Podcast"/);assert.match(blog,/data-hidden-podcast-url="\/pages\/podcast-overview"/);}
});

test('all retained aliases redirect and the full-content feed has the original 50-entry window',async()=>{
  for(const line of (await readFile('dist/_redirects','utf8')).split(/\r?\n/).filter(l=>l.startsWith('/'))){const [from,to,status]=line.split(/\s+/);const r=await fetch(base+from,{redirect:'manual'});assert.equal(r.status,Number(status),from);assert.equal(r.headers.get('location'),to,from);assert.equal((await fetch(base+to)).status,200,to)}
  for(const route of ['/feed','/rss','/rss.xml','/atom.xml'])assert.equal((await fetch(base+route,{redirect:'manual'})).headers.get('location'),'/posts_feed');
  const r=await fetch(base+'/posts_feed');assert.match(r.headers.get('content-type'),/application\/atom\+xml/);const feed=await r.text();assert.equal([...feed.matchAll(/<entry>/g)].length,50);assert.match(feed,/<content type="html">/);
  assert.equal((await fetch(base+'/missing-page')).status,404);
});
test('private source, receipts and original CMS destination cannot leak or be edited',async()=>{
  for(const route of ['/private/library-state.json','/src/content/posts/test.md','/.env','/server.mjs','/_headers','/_redirects','/library/server.mjs','/data/pika-urls.txt','/%2e%2e/private/library-state.json'])assert.equal((await fetch(base+route)).status,404,route);
  const cmsBefore=process.env.CMS_REPOSITORY;process.env.CMS_REPOSITORY='tiagovasc/book-library';
  try{assert.equal((await fetch(base+'/admin/config.yml')).status,503)}finally{if(cmsBefore===undefined)delete process.env.CMS_REPOSITORY;else process.env.CMS_REPOSITORY=cmsBefore}
  assert.equal((await fetch(base+'/api/editor')).status,401);
  assert.equal((await fetch(base+'/save',{method:'POST',body:'[]'})).status,401);
});

test('production editor requires site login without enabling local source writes',async()=>{
  const before=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try{const response=await fetch(base+'/editor',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/login?next=%2Feditor');assert.equal((await fetch(base+'/api/editor')).status,404)}
  finally{if(before===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=before}
});
test('authenticated library editing persists, rejects stale saves, and preserves revision history',async()=>{
  const login=await fetch(base+'/login',{method:'POST',body:new URLSearchParams({password:process.env.LIBRARY_PASSWORD}),redirect:'manual'});assert.equal(login.status,303);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  const changed=structuredClone(source);changed[0].rating=changed[0].rating===5?4:5;
  const send=(rev)=>fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,'X-Library-Revision':String(rev)},body:JSON.stringify(changed)});
  const result=await send(1);assert.equal(result.status,200);assert.equal((await readFile(stateFile,'utf8')).includes('"revision":2'),true);
  assert.equal((await send(1)).status,409);assert.deepEqual(await(await fetch(base+'/books.json')).json(),changed);
  assert.deepEqual(JSON.parse(await readFile(stateFile+'.revision-1.json','utf8')).books,source);
  assert.equal((await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,Origin:'https://untrusted.invalid','X-Library-Revision':'2'},body:JSON.stringify(changed)})).status,403);
});
test('real catalogue queries find title/author/notes and TBR place without mutating data',async()=>{
  const before=JSON.stringify(source);assert.ok(searchCatalogue(source,source[0].title).some(b=>b.id===source[0].id));
  const tbr=JSON.parse(await readFile('library/tbr-bookshops.json','utf8')).books;
  assert.ok(searchCatalogue(tbr,'Watkins').length>0);assert.equal(searchCatalogue(source,'no-match-7df51b8c').length,0);assert.equal(searchCatalogue(source,'').length,0);assert.equal(JSON.stringify(source),before);
});
test('the real Pagefind WASM index searches all 146 writing entries',async()=>{
  const {createInstance}=await import('./dist/pagefind/pagefind.js');
  const index=createInstance({basePath:base+'/pagefind/',baseUrl:base+'/',language:'en',noWorker:true});
  try{
    const results=await index.search('beauty');assert.ok(results.results.length>0);
    const entry=await results.results[0].data();assert.ok(entry.meta.title);assert.match(entry.url,/\/(posts|pages)\//);assert.equal((await fetch(new URL(entry.url,base))).status,200);
    const all=await index.search(null);assert.equal(all.results.length,146);
    const empty=await index.search('"qzxvjkqzxvjkqzxvjk"');assert.equal(empty.results.length,0);
  }finally{await index.destroy()}
});
test('local Markdown editor round-trips full source, retains history, and rejects stale/path/metadata errors',async()=>{
  const editRoot=path.join(fixture,'editor');await mkdir(path.join(editRoot,'src/content/posts'),{recursive:true});await mkdir(path.join(editRoot,'src/content/pages'),{recursive:true});
  const initial='---\ntitle: Editor fixture\ndate: 2026-11-04\ndraft: true\ncustom: preserve exactly\n---\n\nOriginal **Markdown**.\n';
  await writeFile(path.join(editRoot,'src/content/posts/fixture.md'),initial);
  const app=http.createServer(editorHandler({root:editRoot,privateRoot:path.join(fixture,'history'),authenticated:req=>req.headers.cookie==='test-session'}));
  await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;const endpoint=origin+'/api/editor';
  try{
    const headers={Cookie:'test-session','Content-Type':'application/json'};
    assert.equal((await fetch(endpoint)).status,401);
    const list=await(await fetch(endpoint,{headers})).json();assert.deepEqual(list.files,['posts/fixture.md']);
    const first=await(await fetch(endpoint+'?file=posts/fixture.md',{headers})).json();assert.equal(first.text,initial);
    const text=initial+'\nSaved paragraph with [a link](/posts).\n';
    const save=(body)=>fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(body)});
    const saved=await save({file:'posts/fixture.md',revision:first.revision,text});assert.equal(saved.status,200);
    assert.equal(await readFile(path.join(editRoot,'src/content/posts/fixture.md'),'utf8'),text);
    assert.equal((await save({file:'posts/fixture.md',revision:first.revision,text:initial})).status,409);
    assert.equal((await save({file:'../outside.md',revision:'new',text})).status,400);
    assert.equal((await save({file:'posts/new.md',revision:'new',text:'no metadata'})).status,400);
    assert.equal((await save({file:'posts/new.md',revision:'new',text})).status,200);
    const history=await readdir(path.join(fixture,'history/editor-history'));assert.equal(history.length,1);assert.equal(await readFile(path.join(fixture,'history/editor-history',history[0]),'utf8'),initial);
  }finally{app.closeAllConnections();await new Promise(r=>app.close(r))}
});
test('the authenticated editor rebuild action refreshes the actual site and search',async()=>{
  const r=await fetch(base+'/api/editor/build',{method:'POST',headers:{Cookie:cookie},signal:AbortSignal.timeout(120000)});
  assert.equal(r.status,200,await r.text());
  assert.equal((await fetch(base+'/posts')).status,200);
  assert.equal((await fetch(base+'/pagefind/pagefind.js')).status,200);
});
