// Executes the search page's own client script against controlled DOM/network fixtures.
// This covers behavior and races; visual layout still needs a browser review.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {searchCatalogue,tbrHref,tbrLabel} from './src/lib/catalogue-search.mjs';

const source=await readFile(process.env.SEARCH_SOURCE_FILE||new URL('./src/pages/search.astro',import.meta.url),'utf8');
const script=source.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/import \{searchCatalogue,tbrHref,tbrLabel\} from [^;]+;/,'');
const compiled=ts.transpile(script,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const book={id:'1',title:'Fixture book',author:'Example author'};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const flush=()=>new Promise(r=>setImmediate(r));

function fixture(options={}){
  const element=()=>({value:'',textContent:'',innerHTML:'',hidden:false,dataset:{},attributes:{},listeners:{},
    addEventListener(type,fn){this.listeners[type]=fn},setAttribute(k,v){this.attributes[k]=v}});
  const ids=Object.fromEntries(['ss-q','ss-status','ss-results','search-suggestions','ss-form','ss-retry'].map(k=>[k,element()]));
  ids['ss-retry'].hidden=true;
  const counters=['all','blog','library','tbr'].map(count=>({...element(),dataset:{count}}));
  const scopes=['all','blog','library','tbr'].map(scope=>({...element(),dataset:{scope}}));
  const location={origin:'http://fixture',href:'http://fixture/search'};
  const network={library:[],tbr:[],...options};
  const context=vm.createContext({document:{getElementById:k=>ids[k],querySelectorAll:s=>s==='[data-count]'?counters:scopes,querySelector:()=>element()},
    location,history:{replaceState(_state,_unused,url){location.href=String(url)}},URL,setTimeout,clearTimeout,
    searchCatalogue,tbrHref,tbrLabel,console,
    async fetch(url){const kind=url.startsWith('/books.json')?'library':url.startsWith('/tbr-')?'tbr':'descriptions';
      if(network[kind] instanceof Error)throw network[kind];
      return {ok:true,json:async()=>kind==='tbr'?{books:network.tbr}:kind==='library'?network.library:{}}}
  });
  vm.runInContext(compiled+`;globalThis.app={run,render,setScope,setPagefind(v){pagefind=v},setLast(v){last=v},setLimit(k,n){limit[k]=n}}`,context);
  context.app.setPagefind(options.pagefind||{search:async()=>({results:[]})});
  ids['ss-q'].value='fixture';
  return {app:context.app,ids,network,counters};
}

test('an empty selected search scope explains that scope even when other sources have matches',async()=>{
  const f=fixture({library:[book]});
  f.app.setScope('blog');await flush();await flush();
  assert.match(f.ids['ss-status'].textContent,/No results in Blog/);
  assert.equal(f.ids['ss-results'].innerHTML,'');
});

test('failed search sources are reported as unavailable, with a retry control',async()=>{
  const f=fixture({library:Error('offline'),tbr:Error('offline'),pagefind:{search:async()=>{throw Error('offline')}}});
  await f.app.run();await flush();
  assert.match(f.ids['ss-status'].textContent,/unavailable/i);
  assert.doesNotMatch(f.ids['ss-status'].textContent,/No results/);
  assert.equal(f.ids['ss-retry'].hidden,false);
  assert.match(source,/id="ss-retry"/);
});

test('partial search failure retains the available results and identifies the failed source',async()=>{
  const f=fixture({library:[book],tbr:Error('offline')});
  await f.app.run();await flush();
  assert.match(f.ids['ss-results'].innerHTML,/Fixture book/);
  assert.match(f.ids['ss-status'].textContent,/TBR search is unavailable/);
  assert.equal(f.ids['ss-retry'].hidden,false);
  assert.equal(f.counters.find(c=>c.dataset.count==='tbr').textContent,'');
});

test('a failed Pagefind result chunk is caught and does not leave obsolete results on screen',async()=>{
  const f=fixture();
  f.ids['ss-results'].innerHTML='Obsolete result';
  f.app.setLast({blog:{total:1,load:async()=>{throw Error('chunk unavailable')}},library:[book],tbr:[]});
  await assert.doesNotReject(()=>f.app.render());
  assert.doesNotMatch(f.ids['ss-results'].innerHTML,/Obsolete result/);
  assert.match(f.ids['ss-results'].innerHTML,/Fixture book/);
  assert.match(f.ids['ss-status'].textContent,/Blog search is unavailable/);
});

test('retry recovers failed sources without discarding the query',async()=>{
  const f=fixture({tbr:Error('offline')});
  await f.app.run();await flush();
  assert.equal(f.ids['ss-retry'].hidden,false);
  f.network.tbr=[book];
  f.ids['ss-retry'].listeners.click();await flush();await flush();
  assert.equal(f.ids['ss-q'].value,'fixture');
  assert.match(f.ids['ss-results'].innerHTML,/Fixture book/);
  assert.equal(f.ids['ss-retry'].hidden,true);
  assert.equal(f.ids['ss-status'].textContent,'');
});

test('a slower old query cannot overwrite the new query results',async()=>{
  const pending=deferred();
  const f=fixture({pagefind:{search:async q=>q==='old'?pending.promise:{results:[{data:async()=>({url:'/posts/new',meta:{title:'New result'}})}]}}});
  f.ids['ss-q'].value='old';const oldRun=f.app.run();await flush();
  f.ids['ss-q'].value='new';await f.app.run();await flush();
  pending.resolve({results:[{data:async()=>({url:'/posts/old',meta:{title:'Old result'}})}]});
  await oldRun;await flush();
  assert.match(f.ids['ss-results'].innerHTML,/New result/);
  assert.doesNotMatch(f.ids['ss-results'].innerHTML,/Old result/);
});

test('the latest render wins when repeated Show more requests finish out of order',async()=>{
  const pending=deferred();let calls=0;const f=fixture();
  f.app.setLast({blog:{total:1,load:()=>++calls===1?pending.promise:Promise.resolve([{url:'/posts/new',meta:{title:'Latest rendering'}}])},library:[],tbr:[]});
  const earlier=f.app.render();await f.app.render();
  pending.resolve([{url:'/posts/old',meta:{title:'Earlier rendering'}}]);await earlier;
  assert.match(f.ids['ss-results'].innerHTML,/Latest rendering/);
  assert.doesNotMatch(f.ids['ss-results'].innerHTML,/Earlier rendering/);
});

test('typing invalidates in-flight results immediately, before the debounce timer runs',async()=>{
  const pending=deferred();let first=true;
  const f=fixture({pagefind:{search:async()=>first?(first=false,pending.promise):{results:[]}}});
  const oldRun=f.app.run();await flush();
  f.ids['ss-q'].value='different';f.ids['ss-q'].listeners.input();
  pending.resolve({results:[{data:async()=>({url:'/posts/stale',meta:{title:'Stale result'}})}]});
  await oldRun;await flush();
  assert.doesNotMatch(f.ids['ss-results'].innerHTML,/Stale result/);
  await new Promise(r=>setTimeout(r,170));
});
