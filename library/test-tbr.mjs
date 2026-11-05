import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterBooks,groupBooks,SOURCES,sourceBooks,filterCatalogue,collectionGroups,sourceLabel,SOURCE_VIEWS,catalogueCounts,tripMonthLabel} from './tbr.js';
import {publicTripCatalogue,assertPublicTripDates} from './trip-privacy.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./tbr-bookshops.json',import.meta.url),'utf8'));

test('All TBR combines every source once, searches places and supports undated discoveries',()=>{
 const shared={id:'shared',title:'A Shared Book',author:'A Writer',sources:['bookshops','instagram','online'],sightings:[{visit_id:'visit',city:'London',bookshop:'Watkins',photographed_at:'2026-10-28T12:00:00Z'}]};
 const online={id:'web',title:'Web Discovery',author:'B Writer',description:'Consciousness',sources:['online'],sightings:[]};
 const instagram={id:'ig',title:'Instagram Discovery',author:'C Writer',sources:['instagram'],sightings:[]};
 const books=[shared,online,instagram],before=JSON.stringify(books);
 assert.equal(Object.keys(SOURCE_VIEWS)[0],'all');
 assert.deepEqual(sourceBooks([...books,shared],'all').map(b=>b.id),['shared','web','ig']);
 assert.equal(filterCatalogue(books).length,catalogueCounts(books).total);
 assert.deepEqual(filterCatalogue(books,{source:'all',query:'watkins'}).map(b=>b.id),['shared']);
 assert.deepEqual(filterCatalogue(books,{source:'all',query:'consciousness'}).map(b=>b.id),['web']);
 assert.deepEqual(filterCatalogue(books,{source:'all',query:'instagram'}).map(b=>b.id),['shared','ig']);
 assert.deepEqual(filterCatalogue(books,{source:'all',sort:'oldest'}).map(b=>b.id),['ig','web','shared']);
 assert.deepEqual(filterCatalogue(books,{source:'all',sort:'title'}).map(b=>b.id),['shared','ig','web']);
 assert.deepEqual(collectionGroups(books,'all'),[{key:'all',books}]);
 assert.equal(sourceLabel(shared),'Book shops · Instagram · Online');
 assert.equal(sourceLabel(online),'Online');
 assert.equal(JSON.stringify(books),before);
});
test('bookshop import preserves every photograph, unique public IDs and chronological order',()=>{
 assert.equal(data.photo_records,819);assert.equal(data.books.length,745);
 assert.equal(data.books.reduce((n,b)=>n+b.sightings.length,0),819);
 assert.equal(new Set(data.books.map(b=>b.id)).size,745);
 assert.equal(data.books[0].sightings[0].bookshop,'Watkins Books');
 assert.match(data.books[0].sightings[0].photographed_at,/^2026-10$/);
 for(const b of data.books){
  assert.ok(b.title);assert.ok(b.sightings.length);
  for(let i=1;i<b.sightings.length;i++)assert.ok(Date.parse(b.sightings[i-1].photographed_at)>=Date.parse(b.sightings[i].photographed_at));
  for(const s of b.sightings){assert.ok(s.city&&s.bookshop);assert.match(s.photographed_at,/^\d{4}-\d{2}$/);}
  if(b.cover){assert.match(b.cover,/^covers\/web\/tbr_(?:bookshop|metadata)_[a-f\d]+\.jpg$/);assert.ok(fs.existsSync(new URL('./'+b.cover,import.meta.url)));}
 }
 for(let i=1;i<data.books.length;i++)assert.ok(Date.parse(data.books[i-1].sightings[0].photographed_at)>=Date.parse(data.books[i].sightings[0].photographed_at));
});

test('public trip exports and displayed dates never expose a day or timestamp',()=>{
 const privateData={books:[{id:'example',sightings:[{visit_id:'example',city:'Example city',bookshop:'Example shop',photographed_at:'2001-08-19T11:45:00Z',private_note:'day details'}]}]};
 const before=JSON.stringify(privateData),pub=publicTripCatalogue(privateData);
 assert.equal(pub.books[0].sightings[0].photographed_at,'2001-08');
 assert.equal('private_note' in pub.books[0].sightings[0],false);
 assert.equal(tripMonthLabel('2001-08-19T11:45:00Z'),'Aug 2001');
 assert.equal(tripMonthLabel('2001-08'),'Aug 2001');
 assert.throws(()=>assertPublicTripDates(privateData),/YYYY-MM/);
 assert.doesNotThrow(()=>assertPublicTripDates(pub));
 assert.doesNotThrow(()=>assertPublicTripDates(data));
 assert.equal(JSON.stringify(privateData),before);
});
test('public TBR has no original paths, filenames, GPS or library state',()=>{
 const serialized=JSON.stringify(data);
 for(const token of ['latitude','longitude','photo_id','original','OneDrive','_build','read_status','owned','rating','PXL_','PXL\\','20261029_'])assert.ok(!serialized.includes('"'+token+'"'),token);
 assert.deepEqual(Object.keys(SOURCES).sort(),['bookshops','instagram','online']);
 assert.equal(data.books.filter(b=>b.identity_status==='needs_review').length,0);
 assert.equal(data.books.filter(b=>!b.cover).length,0);
});
test('filters combine words, city and shop; old sightings remain discoverable without mutating source',()=>{
 const books=[{id:'a',title:'The Book',author:'One',sightings:[{visit_id:'new',city:'London',bookshop:'Watkins',photographed_at:'2026-10-29T12:00:00+00:00'},{visit_id:'old',city:'Porto',bookshop:'Old shop',photographed_at:'2021-01-01T12:00:00+00:00'}]},{id:'b',title:'Other',author:'Two',sightings:[{visit_id:'mid',city:'Porto',bookshop:'Old shop',photographed_at:'2025-01-01T12:00:00+00:00'}]}];
 const before=JSON.stringify(books);
 assert.deepEqual(filterBooks(books,{query:'book one'}).map(b=>b.id),['a']);
 assert.deepEqual(filterBooks(books,{city:'Porto'}).map(b=>b.id),['b','a']);
 assert.equal(filterBooks(books,{city:'Porto',shop:'Watkins'}).length,0);
 assert.equal(filterBooks(books,{query:'no-match'}).length,0);
 assert.deepEqual(filterBooks(books,{sort:'oldest'}).map(b=>b.id),['b','a']);
 assert.equal(JSON.stringify(books),before);
 assert.equal(groupBooks(filterBooks(books),true).length,2);
 assert.equal(groupBooks(filterBooks(books),false).length,1);
});
test('TBR files are compressed, cache validated and read-only; source tooling is private',async()=>{
 const {server}=await import('./server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const [route,mime] of [['/tbr.js','text/javascript'],['/tbr.css','text/css'],['/tbr-bookshops.json','application/json']]){
   const r=await fetch(base+route,{headers:{'Accept-Encoding':'gzip'}});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),new RegExp(mime));assert.equal(r.headers.get('content-encoding'),'gzip');assert.ok((await r.text()).length>100);
   assert.equal((await fetch(base+route,{headers:{'If-None-Match':r.headers.get('etag')}})).status,304);
   assert.equal((await fetch(base+route,{method:'POST',body:'[]'})).status,405);
  }
  assert.equal((await fetch(base+'/'+data.books.find(b=>b.cover).cover)).status,200);
  for(const route of ['/books-metadata.json','/grouped-visits.json','/_build/tbr_bookshops_20261102/import-report.json'])assert.equal((await fetch(base+route)).status,404);
 }finally{await new Promise(r=>server.close(r));}
});


test('month-only sorting keeps each visit together across pagination',()=>{
 for(const sort of ['recent','oldest']){
  const books=filterBooks(data.books,{sort});
  const groups=groupBooks(books);
  assert.equal(new Set(groups.map(g=>g.key)).size,groups.length,'A visit must not become repeated separate sections');
  assert.equal(groups.reduce((n,g)=>n+g.books.length,0),books.length);
  for(let i=1;i<books.length;i++){
   const previous=books[i-1].sightings[0].photographed_at,current=books[i].sightings[0].photographed_at;
   assert.ok(sort==='oldest'?previous<=current:previous>=current);
  }
 }
});
