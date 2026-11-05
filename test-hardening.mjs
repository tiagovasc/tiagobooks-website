// Production-hardening regressions found on 4 November 2026 (MVP-to-production pass).
// Each test reproduces a real failure: corrupted characters on save, 503s for malformed requests,
// blocked KaTeX fonts, missing long-term caching, login always returning to the library, and
// local builds writing localhost URLs into the tracked library page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,utimes} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {parseFragment,serialize} from 'parse5';
import { postSubtitle, displayTitle, visibleTags } from './src/lib/post-presentation.mjs';
import { parseInterviews } from './src/lib/interviews.mjs';
import { parseTalks, parseBooks } from './src/lib/page-sections.mjs';
const fixture=await mkdtemp(path.join(os.tmpdir(),'tiago-hardening-test-'));
test('subtitles use authored opening lines without confusing section headings or provenance',()=>{
  const post=body=>({data:{title:'Example'},body});
  assert.equal(postSubtitle(post('#### Rescuing the Ultimate Good\n\nEssay text.')),'Rescuing the Ultimate Good');
  assert.equal(postSubtitle(post('**_A book review of&nbsp;‘On Bullshit’ by Harry Frankfurt_**\n\nEssay text.')),'A book review of ‘On Bullshit’ by Harry Frankfurt');
  assert.equal(postSubtitle(post('## Abstract\n\nPodcast discussion.')),'');
  assert.equal(postSubtitle(post('Opening paragraph.\n\n## Later section')),'');
  assert.equal(postSubtitle(post('**This post was first published elsewhere.**')),'');
  assert.equal(postSubtitle({data:{title:'Example',subtitle:'Explicit subtitle'},body:'## Other heading'}),'Explicit subtitle');
  assert.equal(displayTitle('Podcast: Topic with Guest'),'Topic with Guest');
  assert.deepEqual(visibleTags(['Non-Fiction','Science','Book Reviews']),['Book Reviews']);
});
const stateFile=path.join(fixture,'library.json');
const books=Array.from({length:40},(_,i)=>({id:String(i+1),title:'Fixture book '+i,author:'Fixture author',rating:0,description:'Quote: “I’ll go on.” — '+'x'.repeat(i)}));
await writeFile(stateFile,JSON.stringify({id:'library',revision:1,books}));
process.env.LOCAL_LIBRARY_FILE=stateFile;process.env.LIBRARY_PASSWORD=randomBytes(24).toString('hex');process.env.SESSION_SECRET=randomBytes(32).toString('hex');
const {server}=await import('./server.mjs');
const {safeNext}=await import('./library/server.mjs');
const {readBody}=await import('./library/http-utils.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
test.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))});
async function login(next){
  const body=new URLSearchParams({password:process.env.LIBRARY_PASSWORD});if(next!==undefined)body.set('next',next);
  return fetch(base+'/login',{method:'POST',body,redirect:'manual'});
}
// Sends the body in two writes, split inside a multi-byte character, the way a slow upload arrives.
function splitPost(pathname,headers,buffer,at){
  return new Promise((resolve,reject)=>{
    const req=http.request(base+pathname,{method:'POST',headers:{...headers,'Content-Length':buffer.length}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}))});
    req.on('error',reject);req.write(buffer.subarray(0,at));setTimeout(()=>{req.end(buffer.subarray(at))},50);
  });
}

test('readBody decodes multi-byte characters that arrive split across chunks',async()=>{
  const bytes=Buffer.from('I’ll go on — café');const cut=bytes.indexOf(0xe2)+1;
  async function* chunks(){yield bytes.subarray(0,cut);yield bytes.subarray(cut);}
  assert.equal(await readBody(chunks(),1024),'I’ll go on — café');
  async function* big(){yield Buffer.alloc(600);yield Buffer.alloc(600);}
  assert.equal(await readBody(big(),1000),null);
});

test('a library save split inside a character is stored without replacement characters',async()=>{
  const cookie=(await login()).headers.get('set-cookie').split(';')[0];
  const next=books.map(b=>({...b,description:b.description+' ‘edited’'}));
  const buffer=Buffer.from(JSON.stringify(next));const at=buffer.indexOf(Buffer.from('’'))+1;
  const saved=await splitPost('/save',{Cookie:cookie,'Content-Type':'application/json','X-Library-Revision':'1'},buffer,at);
  assert.equal(saved.status,200,saved.body);
  const stored=await(await fetch(base+'/books.json',{headers:{Cookie:cookie}})).json();
  assert.deepEqual(stored,next);assert.doesNotMatch(JSON.stringify(stored),/�/);
});

test('malformed origins and paths get client errors, not a storage outage message',async()=>{
  for(const pathname of ['/login','/save']){
    const r=await fetch(base+pathname,{method:'POST',headers:{Origin:'null'},body:'password=x'});
    assert.equal(r.status,pathname==='/save'?401:403,pathname);
  }
  const cookie=(await login()).headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/save',{method:'POST',headers:{Origin:'null',Cookie:cookie},body:'[]'})).status,403);
  for(const bad of ['/tag/%E0%A4%A','/posts/%E0%A4%A'])assert.equal((await fetch(base+bad,{redirect:'manual'})).status,400,bad);
});

test('signing in and out returns to a same-site page only',async()=>{
  assert.equal((await login('/blog?tag=Philosophy')).headers.get('location'),'/blog?tag=Philosophy');
  assert.equal((await login('/#book/12')).headers.get('location'),'/#book/12');
  for(const hostile of ['//evil.example','https://evil.example','/\\evil.example','javascript:alert(1)','/x\nSet-Cookie: a=b'])assert.equal((await login(hostile)).headers.get('location'),'/',hostile);
  assert.equal((await login()).headers.get('location'),'/');
  assert.equal((await fetch(base+'/logout?next=%2Fposts%2Fabc',{redirect:'manual'})).headers.get('location'),'/posts/abc');
  assert.equal((await fetch(base+'/logout?next=%2F%2Fevil.example',{redirect:'manual'})).headers.get('location'),'/');
  const form=await(await fetch(base+'/login?next=%2Fblog')).text();assert.match(form,/name="next" value="\/blog"/);assert.match(form,/>Go back</);
  const escaped=await(await fetch(base+'/login?next=%2F%22%3E%3Cscript%3E')).text();assert.doesNotMatch(escaped,/"><script>/);
  assert.equal(safeNext('/a?b=c#d'),'/a?b=c#d');assert.equal(safeNext(''),'/');
});

test('blog pages allow KaTeX data fonts, compress with Brotli and cache hashed assets for a year',async()=>{
  const blog=await fetch(base+'/blog',{headers:{'Accept-Encoding':'br'}});
  assert.match(blog.headers.get('content-security-policy'),/font-src 'self' data:/);
  assert.equal(blog.headers.get('cache-control'),'private, no-cache');
  const html=await(await fetch(base+'/blog')).text();
  const asset=html.match(/\/_astro\/[^"']+\.css/)[0];
  const r=await fetch(base+asset,{headers:{'Accept-Encoding':'br'}});
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'public, max-age=31536000, immutable');
  const raw=await fetch(base+asset,{headers:{'Accept-Encoding':'identity'}});assert.equal(raw.headers.get('content-encoding'),null);assert.ok((await raw.text()).length>1000);
  const tag=r.headers.get('etag');assert.equal((await fetch(base+asset,{headers:{'If-None-Match':tag}})).status,304);
  assert.equal((await fetch(base+'/pagefind/pagefind.js')).headers.get('cache-control'),'no-cache');
  const missing=await fetch(base+'/no-such-page');assert.equal(missing.status,404);assert.equal(missing.headers.get('cache-control'),'private, no-cache');
});

test('the build keeps origin-specific URLs out of the tracked library page',async()=>{
  const source=await readFile('library/index.html','utf8');
  assert.doesNotMatch(source,/<link rel="canonical" href="http:\/\/localhost/);assert.doesNotMatch(source,/og:url" content="http:\/\/localhost/);
  const built=await readFile('dist/library.html','utf8');assert.match(built,/<body data-pagefind-ignore(="")?>/);
  const served=await(await fetch(base+'/library')).text();assert.match(served,/<body data-pagefind-ignore(="")?>/);assert.match(served,/rel="canonical"/);
});

test('configured library build wins even when its timestamp predates editable source',async()=>{
  const before=process.env.LIBRARY_PAGE_FILE;
  const configured=path.join(fixture,'configured-library.html');
  await writeFile(configured,'<!doctype html><head></head><body data-pagefind-ignore>Configured build fixture</body>');
  await utimes(configured,new Date('2000-01-01'),new Date('2000-01-01'));
  process.env.LIBRARY_PAGE_FILE=configured;
  try{assert.match(await(await fetch(base+'/library')).text(),/Configured build fixture/)}
  finally{process.env.LIBRARY_PAGE_FILE=before}
});

test('unknown blog tags show a way back to all posts',async()=>{
  const blog=await(await fetch(base+'/blog')).text();
  assert.match(blog,/id="blog-empty" hidden/);assert.match(blog,/href="\/blog">Show all posts</);
  const filter=await(await fetch(base+'/blog-filter.js')).text();assert.match(filter,/toLowerCase\(\)/);
});

test('behind Railway, failed logins are counted per visitor, not for everyone behind the proxy',async()=>{
  const before=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try{
    const attempt=(ip,password='wrong')=>fetch(base+'/login',{method:'POST',headers:{'X-Real-IP':ip},body:new URLSearchParams({password}),redirect:'manual'});
    for(let i=0;i<10;i++)assert.equal((await attempt('203.0.113.7')).status,401);
    assert.equal((await attempt('203.0.113.7')).status,429);
    assert.equal((await attempt('198.51.100.4')).status,401,'another visitor is not locked out');
    assert.equal((await attempt('198.51.100.4',process.env.LIBRARY_PASSWORD)).status,303,'the owner can still sign in');
    assert.equal((await attempt('not-an-ip<script>')).status,401);
  }finally{if(before===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=before}
  const local=(await import('./library/server.mjs')).clientAddress({headers:{'x-real-ip':'203.0.113.9'},socket:{remoteAddress:'127.0.0.1'}});
  assert.equal(local,'127.0.0.1','outside production the header is ignored');
});

test('book chapters without hand-written chapter links get previous/next cards; others are unchanged',async()=>{
  const appendix=await(await fetch(base+'/posts/in-search-of-the-infinite-appendix')).text();
  assert.match(appendix,/href="\/posts\/in-search-of-the-infinite-the-awakening-volume-4-chapter-3" rel="prev"/);assert.match(appendix,/chapter-title">The Awakening \(Volume 4, Chapter 3\)</);assert.doesNotMatch(appendix,/rel="next"/);
  const middle=await(await fetch(base+'/posts/in-search-of-the-infinite-volume-3-chapter-2')).text();
  assert.doesNotMatch(middle,/class="chapter-nav"/,'hand-written links already present');
  const other=await(await fetch(base+'/posts/a-700-page-argument-that-beauty-should-come-first')).text();assert.doesNotMatch(other,/class="chapter-nav"/);
});

test('the GitHub icon points to this website repository on every page',async()=>{
  for(const route of ['/','/blog','/pages/about']){const html=await(await fetch(base+route)).text();assert.match(html,/href="https:\/\/github.com\/tiagovasc\/tiagobooks-website"/,route);assert.doesNotMatch(html,/tiagovasc\/book-library/,route)}
});

test('header actions arrive complete and identical across pages before JavaScript, with separate owner caches',async()=>{
  const cookie=(await login()).headers.get('set-cookie').split(';')[0];
  let publicHeader,ownerHeader;
  for(const route of ['/','/blog','/pages/books','/pages/talks','/pages/podcast-overview','/pages/interviews','/pages/about','/search']){
    const guest=await fetch(base+route),owner=await fetch(base+route,{headers:{Cookie:cookie,'Accept-Encoding':'br'}});
    const guestHTML=await guest.text(),ownerHTML=await owner.text();
    const actions=html=>serialize(parseFragment(html.match(/<div class="shell-actions">([\s\S]*?)<\/div>/)?.[1]||''));
    const g=actions(guestHTML),o=actions(ownerHTML);
    assert.ok(g&&o,route);
    publicHeader??=g;ownerHeader??=o;
    assert.equal(g,publicHeader,route+' public controls');assert.equal(o,ownerHeader,route+' owner controls');
    assert.match(g,/id="editAccess" hidden/);assert.doesNotMatch(o,/id="editAccess" hidden/);
    assert.match(g,/id="adminAccess" href="\/login"/);assert.match(o,/id="adminAccess" href="\/logout"/);
    assert.match(o,/class="theme-sun"/);assert.match(o,/class="theme-moon"/);
    assert.match(owner.headers.get('cache-control'),/private/);assert.match(owner.headers.get('vary'),/Cookie/);
    assert.notEqual(guest.headers.get('etag'),owner.headers.get('etag'),route);
    assert.equal((await fetch(base+route,{headers:{'If-None-Match':owner.headers.get('etag')}})).status,200,'logout cannot reuse owner HTML');
    assert.equal((await fetch(base+route,{headers:{Cookie:cookie,'If-None-Match':guest.headers.get('etag')}})).status,200,'login cannot reuse public HTML');
    assert.equal((await fetch(base+route,{headers:{Cookie:cookie,'If-None-Match':owner.headers.get('etag')}})).status,304);
  }
});

test('visitors load the library without descriptions; each description loads on its own',async()=>{
  const cookie=(await login()).headers.get('set-cookie').split(';')[0];
  const full=await(await fetch(base+'/books.json',{headers:{Cookie:cookie}})).json();
  const pub=await fetch(base+'/books.json?view=public');assert.equal(pub.headers.get('etag')?.endsWith('-public"'),true);
  const list=await pub.json();assert.equal(list.length,full.length);
  for(const b of list){assert.equal('description' in b,false);assert.equal('merged_records' in b,false);assert.equal('merge_conflicts' in b,false)}
  const withText=full.find(b=>b.description&&b.description.trim());assert.equal(list.find(b=>b.id===withText.id).has_description,true);
  const one=await(await fetch(base+'/book-description?id='+encodeURIComponent(withText.id))).json();assert.equal(one.description,withText.description);
  assert.equal((await(await fetch(base+'/book-description?id=no-such-book')).json()).description,'');
  assert.equal((await fetch(base+'/book-description')).status,400);
  const map=await(await fetch(base+'/book-descriptions.json')).json();assert.equal(map[withText.id],withText.description);
  assert.equal(Object.keys(map).length,full.filter(b=>b.description&&b.description.trim()).length);
  const page=await(await fetch(base+'/library')).text();assert.match(page,/books\.json\?view=public/);
});

test('a save that would strip most descriptions is refused',async()=>{
  const cookie=(await login()).headers.get('set-cookie').split(';')[0];
  const res=await fetch(base+'/books.json',{headers:{Cookie:cookie}});const revision=res.headers.get('x-library-revision');const full=await res.json();
  const stripped=full.map(({description,...b})=>b);
  const r=await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Library-Revision':revision},body:JSON.stringify(stripped)});
  assert.equal(r.status,400);assert.match((await r.json()).error,/descriptions/);
  const ok=await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Library-Revision':revision},body:JSON.stringify(full)});assert.equal(ok.status,200);
});

test('the Podcast page lists every episode with post, Spotify, Apple Podcasts and YouTube links',async()=>{
  const html=await(await fetch(base+'/pages/podcast-overview')).text();
  assert.match(html,/The Anagoge Podcast explores philosophy, theology, consciousness, and the human condition/);
  const eps=[...html.matchAll(/<article class="ep">([\s\S]*?)<\/article>/g)].map(m=>m[1]);
  const {readdir,readFile:read}=await import('node:fs/promises');
  let tagged=0;for(const f of await readdir('src/content/posts')){const t=await read('src/content/posts/'+f,'utf8');const fm=t.split('---')[1]||'';if(/^\s*-\s*Podcast\s*$/m.test(fm)&&!/^draft:\s*true/m.test(fm)&&!/^unlisted:\s*true/m.test(fm)&&!/^protected:\s*true/m.test(fm))tagged++}
  assert.equal(eps.length,tagged);assert.ok(eps.length>=31);
  const dates=eps.map(e=>e.match(/datetime="([^"]+)"/)[1]);assert.deepEqual([...dates].sort().reverse(),dates,'newest first');
  for(const e of eps){
    const post=e.match(/class="ep-thumb" href="([^"]+)"/)[1];assert.match(post,/^\/posts\/[\w-]+$/);
    assert.match(e,/src="\/uploads\/podcasts\/episode-[\w-]+\.webp"/,'verified local episode image');
    assert.doesNotMatch(e,/i\.ytimg\.com|onerror=/,'current episodes need no external thumbnail fallback');
    assert.match(e,/href="https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}"/,'every episode has its own YouTube link');
    assert.match(e,new RegExp(`class="ep-read" href="${post}"`));assert.match(e,new RegExp(`<h2><a href="${post}">`));
    assert.match(e,/href="https:\/\/open\.spotify\.com\/episode\/\w{22}"[^>]*><img src="\/icons\/spotify\.png"/);
    assert.match(e,/href="https:\/\/podcasts\.apple\.com\/[^"\s]+\?i=\d+"[^>]*><img src="\/icons\/apple-podcasts\.png"/);
    const order=['youtube','spotify','apple-podcasts'].map(i=>e.indexOf('/icons/'+i+'.png'));
    assert.deepEqual([...order].sort((a,b)=>a-b),order,'YouTube first');
    assert.match(e,/href="https:\/\/www\.youtube\.com\/[^"]+"[^>]*><img src="\/icons\/youtube\.png"/);
    const desc=e.match(/<p class="ep-desc">([\s\S]*?)<\/p>/)[1];assert.doesNotMatch(desc,/&amp;(nbsp|amp|#\d+);/,'raw entity in teaser');const words=desc.trim().split(/\s+/).length;assert.ok(words>=40&&words<=60,words+' words');
  }
  for(const icon of ['spotify','apple-podcasts','youtube'])assert.equal((await fetch(base+'/icons/'+icon+'.png')).status,200);
  assert.match(html,/href="https:\/\/www\.youtube\.com\/watch\?v=DMXK9tZzGec"/,'recovered Patitsas episode link');
  const config=await read('public/admin/config.yml','utf8');
  for(const field of ['spotify','apple','youtube'])assert.match(config,new RegExp('name: '+field+','),'CMS exposes '+field);
});

test('published subtitles and podcast titles stay consistent across cards, articles and feeds',async()=>{
  const blog=await(await fetch(base+'/blog')).text();
  assert.match(blog,/<p class="pc-sub p-summary">Rescuing the Ultimate Good<\/p>/);
  assert.match(blog,/<p class="pc-sub p-summary">On symbols, cognition, and the bouba-kiki effect<\/p>/);
  assert.doesNotMatch(blog,/<a class="p-name u-url"[^>]*>Podcast:/);
  const chips=[...blog.matchAll(/class="pc-tag"[^>]*>([^<]+)</g)].map(m=>m[1]);
  assert.ok(chips.length>100);assert.ok(chips.every(t=>['General','Podcast','Book Reviews','In Search of the Infinite'].includes(t)));
  const article=await(await fetch(base+'/posts/podcast-selfhood-and-psychedelic-phenomenology-with-jason-k-day')).text();
  assert.match(article,/<h1[^>]*>Selfhood and Psychedelic Phenomenology with Jason K\. Day<\/h1>/);
  assert.doesNotMatch(article,/<title>Podcast:|"headline":"Podcast:/);
  assert.doesNotMatch(await(await fetch(base+'/posts_feed')).text(),/<title>Podcast:/);
});

test('Interviews uses the episode layout with complete descriptions and one YouTube Watch link',async()=>{
  const markdown=await readFile('src/content/pages/interviews.md','utf8');
  const source=markdown.replace(/^---[\s\S]*?\r?\n---/,'');
  const expected=parseInterviews(source);assert.equal(expected.length,4);
  const html=await(await fetch(base+'/pages/interviews')).text();
  const entries=[...html.matchAll(/<article class="ep">([\s\S]*?)<\/article>/g)].map(m=>m[1]);
  assert.equal(entries.length,expected.length);
  const {parseFragment}=await import('parse5');
  const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
  for(let i=0;i<entries.length;i++){
    const item=expected[i],entry=entries[i];
    assert.equal((entry.match(/<a /g)||[]).length,1,'only the Watch action');
    assert.ok(entry.includes(`href="${item.href}"`));assert.match(entry,/>Watch<\/a>/);
    assert.match(entry,new RegExp(`data-video-id="${item.id}"`));
    assert.doesNotMatch(entry,/\/posts\/|Read more|spotify|apple-podcasts|<iframe/);
    const visible=text(parseFragment(entry));
    assert.ok(visible.includes(item.title));for(const p of item.paragraphs)assert.ok(visible.includes(p),'complete description');
    const image=await fetch(base+item.image);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/webp/);
  }
  assert.throws(()=>parseInterviews('## Missing video\n\nDescription.\n'),/missing a YouTube/);
});

test('Talks retains its text and transcript links with local click-to-play previews',async()=>{
  const source=await readFile('src/content/pages/talks.md','utf8');
  const talks=await parseTalks(source);assert.equal(talks.length,4);
  const html=await(await fetch(base+'/pages/talks')).text();
  assert.equal((html.match(/<article class="ep">/g)||[]).length,4);
  assert.doesNotMatch(html,/<iframe/,'players load only on demand');
  for(const t of talks){
    assert.ok(html.includes(`data-video-id="${t.id}"`));
    assert.ok(html.includes(`href="${t.transcript}"`));assert.ok(html.includes(`href="${t.href}"`));
    assert.equal((await fetch(base+t.transcript)).status,200);
    assert.equal((await fetch(base+t.image)).status,200);
    const strip=s=>serialize(parseFragment(s));assert.ok(strip(html).includes(strip(t.description)));
  }
  await assert.rejects(parseTalks('## Missing video\n\nDescription.\n'),/needs a video and transcript/);
});

test('Books renders the selected cover layout with working original download and reading links',async()=>{
  const books=await parseBooks(await readFile('src/content/pages/books.md','utf8'));assert.equal(books.length,2);
  const html=await(await fetch(base+'/pages/books')).text();
  assert.equal((html.match(/<article class="bk">/g)||[]).length,2);
  assert.match(html,/Cover coming soon/);assert.doesNotMatch(html,/href="\/pages\/the-altar-and-the-machine"/);
  for(const book of books)for(const link of book.actions)assert.ok(html.includes(link.href.replaceAll('&','&amp;')));
  assert.deepEqual(books[1].actions.map(a=>a.label),['Blog','PDF','EPUB','Paperback']);
  assert.equal((await fetch(base+books[1].image)).status,200);
});

test('active navigation is present in the delivered HTML before any client scripts run',async()=>{
  const routes={'/':'Blog','/library':'Library','/blog':'Blog','/pages/books':'Books','/pages/talks':'Talks','/pages/podcast-overview':'Podcasts','/pages/interviews':'Interviews','/pages/about':'About','/posts/podcast-object-oriented-ontology-and-the-nature-of-reality-with-graham-harman':'Blog'};
  for(const [route,label] of Object.entries(routes)){
    const html=await(await fetch(base+route)).text();
    const nav=html.match(/<nav class="unified-nav"[\s\S]*?<\/nav>/)[0];
    const active=[...nav.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map(m=>m[1]);
    assert.deepEqual(active,[label],route);
    assert.match(nav,/aria-controls="navExtra"/);
  }
});

test('audit polish supplies post context, semantic lists and recovery paths',async()=>{
  const html=await(await fetch(base+'/posts/podcast-object-oriented-ontology-and-the-nature-of-reality-with-graham-harman')).text();
  assert.ok(html.indexOf('entry-meta')<html.indexOf('class="e-content"'));
  assert.match(html,/<time class="dt-published"[^>]+>December 28, 2025<\/time>/);
  assert.match(html,/\d+ min read/);assert.match(html,/Top 3 theses/);
  assert.match(html,/id="top-3-thesis"/,'old heading links still work');
  assert.match(html,/<li>\s*(?:<p>)?Objects always withdraw/);assert.doesNotMatch(html,/•/);
  const library=await(await fetch(base+'/library')).text();assert.match(library,/class="skip-link" href="#main"/);assert.match(library,/class="library-intro"/);
  const login=await(await fetch(base+'/login')).text();assert.match(login,/<main><form/);assert.match(login,/<meta name="description"/);
  const missing=await fetch(base+'/this-page-does-not-exist');assert.equal(missing.status,404);assert.match(await missing.text(),/class="recovery-links"/);
  const search=await(await fetch(base+'/search')).text();assert.match(search,/<h1 class="entry-title">Search<\/h1>/);assert.match(search,/search\?q=beauty/);
  assert.equal(displayTitle('In Search of the Infinite - Anchors of Being'),'In Search of the Infinite: Anchors of Being');
});
