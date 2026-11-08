import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeLibraryPreview} from '../library/library-preview.mjs';
const warm=readFileSync(new URL('../public/js/library-warm.js',import.meta.url),'utf8');
function fixture({saveData=false,visibility='visible',path='/',saved=null}={}){
  const appended=[],idle=[],events={},windowEvents={},intervals=[];
  const values=new Map(saved?[['tiagovf-library-preview-v2',JSON.stringify(saved)]]:[]),images=[];let requests=0;
  const context={Date,innerWidth:1280,URL,Image:class{constructor(){images.push(this);}},Promise,AbortSignal,sessionStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},fetch:async()=>{requests++;return {ok:true,json:async()=>sample()};},location:{pathname:path,origin:'https://example.com'},navigator:{connection:{saveData}},setInterval:fn=>intervals.push(fn),setTimeout:fn=>idle.push(fn),requestIdleCallback:fn=>idle.push(fn),
    window:{addEventListener:(key,fn)=>windowEvents[key]=fn},
    document:{readyState:'complete',visibilityState:visibility,head:{append:el=>appended.push(el)},createElement:tag=>({tag}),addEventListener:(key,fn)=>events[key]=fn}};
  context.window.requestIdleCallback=context.requestIdleCallback;
  vm.runInNewContext(warm,context);
  return {context,appended,idle,events,values,images,intervals,get requests(){return requests;},async runIdle(){await Promise.all(idle.splice(0).map(fn=>fn()));}};
}
const sample=()=>({schema:2,revision:'7',owned:{books:[],counts:{},facets:{all:0},total:0},tbr:{all:[],instagram:[],bookshops:[],online:[]},totals:{},dates:{all:{},instagram:{},bookshops:{},online:{}},places:[]});
test('home preparation waits for idle, fetches one bounded preview and reuses it',async()=>{
  const f=fixture();assert.equal(f.requests,0);await f.runIdle();assert.equal(f.requests,1);
  await f.context.window.LibraryWarm.prepare();assert.equal(f.requests,1);assert.equal(f.context.window.LibraryWarm.read().revision,'7');
});
test('data saver and existing Library/editor pages do not warm in background',async()=>{
  for(const settings of [{saveData:true},{path:'/library'},{path:'/editor'},{path:'/admin'}]){const f=fixture(settings);await f.runIdle();assert.equal(f.requests,0);}
});
test('expired or malformed previews are ignored, not restored',()=>{
  for(const saved of [{at:Date.now()-100000,data:sample()},{at:Date.now(),data:{...sample(),schema:1}},{at:Date.now(),data:{schema:0}}])assert.equal(fixture({path:'/library',saved}).context.window.LibraryWarm.read(),null);
});
test('hidden home page waits until visible',async()=>{
  const f=fixture({visibility:'hidden'});await f.runIdle();assert.equal(f.requests,0);
  f.context.document.visibilityState='visible';f.events.visibilitychange();await f.runIdle();assert.equal(f.requests,1);
});
test('a long visible visit refreshes the preview without warming hidden tabs',async()=>{
  const f=fixture();await f.runIdle();await f.intervals[0]();assert.equal(f.requests,2);
  f.context.document.visibilityState='hidden';await f.intervals[0]();assert.equal(f.requests,2);
});
test('preview rendering never changes canonical editing state and saves are gated',()=>{
  const html=readFileSync(new URL('../library/index.html',import.meta.url),'utf8');
  const render=html.slice(html.indexOf('  function showWarmLibrary(){'),html.indexOf('  function stageSyncedBooks'));
  assert(render.includes('content.inert=true'));assert(!render.includes('state.books='));assert(!render.includes('metadataBaseSnapshot='));
  assert(html.includes("if(loadingLibrary||content&&content.hasAttribute('data-warm-preview'))return;"));
});
test('public preview is bounded, strips private data, preserves counts and reading order',()=>{
  const books=Array.from({length:200},(_,i)=>({id:String(i),title:'Book '+i,read_status:i===99?'reading':'read',date_read:i===99?'':'2026-01-01',notes:'private',_sync_versions:{secret:true},description:'large'}));
  const tbr={books:[{id:'t',sources:['online'],title:'TBR',notes:'private',sightings:[{visit_id:'v',photographed_at:'2026-01',local_photo:'private'}]}]};
  const p=makeLibraryPreview(books,tbr,3);assert.equal(p.owned.total,200);assert.equal(p.owned.books.length,64);assert.equal(p.owned.books[0].id,'99');
  assert.equal(p.owned.counts['2026-01'],199);assert(!JSON.stringify(p).includes('private'));assert(!JSON.stringify(p).includes('_sync_versions'));
  assert.equal(p.owned.facets.reading,1);assert.equal(p.owned.facets.read,199);
  assert.equal(p.totals.online,1);assert.equal(p.totals.instagram,0);
});
test('preview calendar counts cover the full catalogue, including months outside the first rows',()=>{
  const books=Array.from({length:200},(_,i)=>({id:'t'+i,title:'TBR '+i,sources:['online'],sightings:[],chronology_source:'online',chronology_order:i,online_order:i,discovery_dates:{online:{date:i<50?'2026-11':'2025-04'}}}));
  const p=makeLibraryPreview([],{books},1);assert.equal(p.tbr.all.length,48);assert.deepEqual(p.dates.all,{'2026-11':50,'2025-04':150});assert.deepEqual(p.dates.online,p.dates.all);
});
test('warming uses the actual browsing renditions and only four rows per collection',async()=>{
  const data=sample();data.owned.books=Array.from({length:40},(_,i)=>({id:String(i),title:'Book '+i,cover:'covers/cover_'+i+'.png',read_status:'reading'}));
  data.tbr.all=Array.from({length:40},(_,i)=>({id:'t'+i,title:'TBR '+i,cover:'covers/web/tbr_'+i+'.jpg',sources:['online'],sightings:[]}));
  const f=fixture({saved:{at:Date.now(),data}});await f.runIdle();
  assert.equal(f.images.length,40);assert.equal(f.images[0].src,'https://example.com/covers/web/cover_0.jpg');assert.equal(f.images[20].src,'https://example.com/covers/web/tbr_0.jpg');assert(f.images.every(i=>i.fetchPriority==='low'));
});
test('save attempts during preview cannot stage or flush any changes',()=>{
  const html=readFileSync(new URL('../library/index.html',import.meta.url),'utf8'),source=html.slice(html.indexOf('  function saveNow(){'),html.indexOf('  var resolveLibraryReady;'));
  let staged=0,flushed=0,preview=false;
  const context={loadingLibrary:true,content:{hasAttribute:()=>preview},window:{LibrarySync:{flush(){flushed++;}}},stageSyncedBooks(){staged++;}};
  vm.createContext(context);vm.runInContext(source,context);
  context.saveNow();context.loadingLibrary=false;preview=true;context.saveNow();assert.equal(staged,0);assert.equal(flushed,0);
  preview=false;context.saveNow();assert.equal(staged,1);assert.equal(flushed,1);
});
test('a TBR click before its module starts is honored exactly once',()=>{
  const source=readFileSync(new URL('../library/tbr.js',import.meta.url),'utf8').split('\n').find(line=>line.startsWith('  function fromURL(){'));
  const calls=[],context={URL,location:{href:'https://example.com/library'},window:{TBR_EARLY_REQUEST:true},SOURCE_VIEWS:{all:'All'},enter(...args){calls.push(args);},active:false};
  vm.createContext(context);vm.runInContext(source,context);context.fromURL();assert.equal(calls[0][0],true);assert.equal(calls[0][2],true);assert.equal(context.window.TBR_EARLY_REQUEST,false);
  context.fromURL();assert.equal(calls[1][0],false);assert.equal(calls[1][2],false);
});
