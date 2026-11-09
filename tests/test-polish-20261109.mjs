// Polish regressions found on 9 November 2026 (second MVP-to-production pass).
// Each test reproduces a confirmed problem: a phone menu labelled Blog on pages outside the menu,
// a sign-in page that ignored the saved appearance and offered "Back to the library" for the Blog,
// and a Library page without a top-level heading for screen readers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {renderSiteHeader} from '../src/lib/site-shell.mjs';

const fixture=await mkdtemp(path.join(os.tmpdir(),'tiago-polish-test-'));
const stateFile=path.join(fixture,'library.json');
await writeFile(stateFile,JSON.stringify({id:'library',revision:1,books:[]}));
process.env.LOCAL_LIBRARY_FILE=stateFile;process.env.LIBRARY_PASSWORD||=randomBytes(24).toString('hex');process.env.SESSION_SECRET||=randomBytes(32).toString('hex');
const {server}=await import('../library/server.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
test.after(()=>new Promise(r=>server.close(r)));

test('the phone menu names the current section, and says Menu on pages outside it',()=>{
  const site=JSON.parse('{"author":"Tiago Faleiro","nav":[{"label":"Blog","href":"/blog"},{"label":"Library","href":"/library"}]}');
  const label=html=>html.match(/class="nav-more-toggle[^"]*"[^>]*>([^<]*)</)[1];
  assert.equal(label(renderSiteHeader(site,'/posts/example')),'Blog');
  assert.equal(label(renderSiteHeader(site,'/library')),'Library');
  for(const page of ['/search','/404','/editor'])assert.equal(label(renderSiteHeader(site,page)),'Menu',page);
});

test('sign-in follows the saved appearance, returns to the site and guards against double submission',async()=>{
  const html=await (await fetch(base+'/login')).text();
  assert.match(html,/localStorage\.getItem\("tiago-books-ui-v1"\)/);
  assert.match(html,/:root\[data-theme=dark\]\{color-scheme:dark;--bg:#000/);
  assert.match(html,/:root:not\(\[data-theme=light\]\)/,'a saved light choice overrides a dark system setting');
  assert.match(html,/>Back to the site</);assert.doesNotMatch(html,/Back to the library/);
  assert.match(html,/b\.disabled=true;b\.textContent='Signing in…'/);
  assert.match(html,/addEventListener\("pageshow"/,'returning with Back re-enables the button');
  const elsewhere=await (await fetch(base+'/login?next=%2Fposts%2Fexample')).text();
  assert.match(elsewhere,/href="\/posts\/example">Go back</);
});

test('the Library page has one top-level heading outside the hideable book and TBR regions',async()=>{
  const page=await readFile(new URL('../library/index.html',import.meta.url),'utf8');
  const headings=page.match(/<h1\b[^>]*>[^<]*<\/h1>/g)||[];
  assert.ok(headings.includes('<h1 class="sr-only">Library</h1>'));
  assert.match(page,/aria-label="Library tools"><h1 class="sr-only">Library<\/h1>/,'inside the always-visible tools landmark, not the hideable book list');
  assert.doesNotMatch(page,/\.seg button\.zero\{opacity/,'empty sections stay readable instead of fading below contrast limits');
});

// Main menu speed (9 November 2026).
import {assetVersion,versionedCache} from '../library/asset-version.mjs';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('shared assets are cached for a year only under the exact content version',()=>{
  const bytes=Buffer.from('body{color:red}'),v=assetVersion(bytes),u=q=>new URL('http://x/unified.css'+q);
  assert.match(v,/^[0-9a-f]{12}$/);
  assert.equal(versionedCache(u('?v='+v),bytes),'public, max-age=31536000, immutable');
  for(const q of ['','?v=','?v=000000000000','?v='+v+'0'])assert.equal(versionedCache(u(q),bytes),null,q);
});

test('every built page links the shared stylesheet and scripts by their current content version',async()=>{
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
  const dist=fileURLToPath(new URL('../dist/',import.meta.url)),current=new Map();
  for(const [url,file] of [['/unified.css','dist/unified.css'],['/unified.js','dist/unified.js'],['/js/enhancements.js','dist/js/enhancements.js'],['/js/library-warm.js','dist/js/library-warm.js'],['/blog-filter.js','dist/blog-filter.js'],['/date-rail.js','dist/date-rail.js'],['/tbr.css','library/tbr.css'],['/tbr.js','library/tbr.js']])
    current.set(url,assetVersion(await readFile(new URL('../'+file,import.meta.url))));
  let pages=0;
  for(const file of walk(dist).filter(f=>f.endsWith('.html')&&!f.includes('/admin/'))){
    const tags=(await readFile(file,'utf8')).match(/<(link|script)\b[^>]*>/g)||[];
    for(const tag of tags){const ref=tag.match(/(?:href|src)="([^"?]+)(\?v=([0-9a-f]+))?"/);if(!ref||!current.has(ref[1]))continue;
      assert.equal(ref[3],current.get(ref[1]),`${file}: ${ref[1]}`);}
    pages++;
  }
  assert.ok(pages>100);
  assert.match(await readFile(new URL('../dist/blog-filter.js',import.meta.url),'utf8'),new RegExp(`from '/date-rail\\.js\\?v=${current.get('/date-rail.js')}'`));
});

// A small DOM model of the header menu, enough to run the real menu script from unified.js.
function menuFixture({owner=false,path='/pages/about'}={}){
  const listeners={},windowListeners={},head=[];
  const el=(props)=>({attributes:{},classList:new Set(),setAttribute(n,v){this.attributes[n]=v},removeAttribute(n){delete this.attributes[n]},hasAttribute(n){return n in this.attributes},getAttribute(n){return this.attributes[n]},addEventListener(t,fn){(this.on??={})[t]=fn},...props});
  const routes=[['Blog','/'],['Books','/pages/books'],['Library','/library'],['About','/pages/about']];
  const links=routes.map(([text,href])=>{const a=el({textContent:text,href:'https://example.com'+href,closest:()=>a});if(href===path)a.attributes['aria-current']='page';return a});
  const label={textContent:'About'};
  const toggle=el({firstChild:label,classList:{set:new Set(['is-current']),add(c){this.set.add(c)},toggle(c,on){on?this.set.add(c):this.set.delete(c)},contains(c){return this.set.has(c)}}});
  const nav=el({querySelectorAll:()=>links,querySelector:s=>s==='.nav-more-toggle'?toggle:null});
  const document={querySelector:s=>s==='#siteShell .unified-nav'?nav:null,getElementById:id=>id==='editAccess'?{hidden:!owner}:null,
    createElement:()=>({}),head:{append:s=>head.push(JSON.parse(s.textContent))}};
  const source=readFileSync(new URL('../public/unified.js',import.meta.url),'utf8');
  const menu=source.slice(source.indexOf('// Main menu speed'));
  vm.runInNewContext(menu,{document,URL,JSON,location:{pathname:path},navigator:{},setTimeout:fn=>fn(),
    HTMLScriptElement:{supports:t=>t==='speculationrules'},addEventListener:(t,fn)=>{(windowListeners[t]??=[]).push(fn)}});
  const fire=(target,type,e={})=>target.on[type]({button:0,target:{closest:()=>e.link},...e});
  return {links,label,toggle,nav,head,current:()=>links.filter(a=>a.hasAttribute('aria-current')).map(a=>a.textContent),
    down:a=>fire(nav,'pointerdown',{link:a}),click:(a,e={})=>fire(nav,'click',{link:a,...e}),window:(t,e={})=>windowListeners[t].forEach(fn=>fn(e))};
}
import vm from 'node:vm';

test('a pressed menu item shows as selected at once and reverts if the press is abandoned',()=>{
  const f=menuFixture(),books=f.links[1];
  f.down(books);assert.deepEqual(f.current(),['Books']);assert.equal(f.label.textContent,'Books');
  f.window('pointerup');assert.deepEqual(f.current(),['About'],'released elsewhere');assert.equal(f.label.textContent,'About');
  f.down(books);f.click(books);f.window('pointerup');assert.deepEqual(f.current(),['Books'],'a real click keeps the choice');
  f.window('pageshow',{persisted:true});assert.deepEqual(f.current(),['About'],'Back restores the page being shown');
  f.click(books,{ctrlKey:true});assert.deepEqual(f.current(),['About'],'opening in a new tab changes nothing here');
});

test('menu pages load ahead of the click, and the Library never runs ahead',()=>{
  const publicMenu=menuFixture();
  const [first]=publicMenu.head;
  assert.deepEqual(first.prerender[0].urls,['/','/pages/books']);assert.deepEqual(first.prefetch[0].urls,['/','/pages/books','/library']);assert.equal(first.prerender[0].eagerness,'moderate');
  publicMenu.nav.on.pointerenter();publicMenu.nav.on.focusin();
  assert.equal(publicMenu.head.length,2,'reaching for the menu fetches every choice once');
  assert.equal(publicMenu.head[1].prefetch[0].eagerness,'immediate');
  const owner=menuFixture({owner:true,path:'/'});
  assert.deepEqual(owner.head[0].prerender[0].urls,['/pages/books','/pages/about'],'Library is not prerendered');
  assert.deepEqual(owner.head[0].prefetch[0].urls,['/pages/books','/library','/pages/about'],'but is still fetched');
});

test('every page shares the Blog and Library left edge on desktop and tablet',async()=>{
  const css=await readFile(new URL('../public/unified.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('/* One left edge for every page'));
  assert.match(block,/@media\(min-width:761px\)\{\s*\.writing-site main\{max-width:none;margin-left:max\(222px,calc\(\(100vw - 1180px\)\/2\)\)/);
  assert.match(css,/\.writing-site:has\(#blog-result-count\) main\{max-width:1000px;margin-left:max\(222px,calc\(\(100vw - 1180px\)\/2\)\)/,'the Blog edge it matches');
  assert.match(block,/:not\(:has\(\.ep-list,\.bk-list,#blog-result-count\)\) main\{max-width:734px\}/,'reading pages keep their line length');
});

test('the phone month picker stays hidden at the top of a page',()=>{
  const source=readFileSync(new URL('../public/unified.js',import.meta.url),'utf8');
  assert.match(source,/const nearTop=y=>document\.body\.classList\.toggle\('near-top',y<160\);nearTop\(/);
  assert.match(readFileSync(new URL('../public/unified.css',import.meta.url),'utf8'),/@media\(max-width:760px\)\{\s*\.near-top \.date-rail:not\(:focus-within\)\{opacity:0;pointer-events:none\}/);
});

test('the editor offers sign-in only after the session has ended',()=>{
  const page=readFileSync(new URL('../src/pages/editor.astro',import.meta.url),'utf8');
  const help=page.match(/<p id="editor-help">[\s\S]*?<\/p>/)[0];
  assert.doesNotMatch(help,/href="\/login/,'no sign-in link for someone already signed in');
  assert.match(page,/<p id="signin-again" role="alert" hidden>[^]*href="\/login\?next=%2Feditor"/);
  assert.match(page,/const signin=\$\('signin-again'\);if\(signin\)signin\.hidden=r\.status!==401/,'any editor request that is refused for sign-in reveals it');
});
