import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterBooks,groupBooks,SOURCES} from './tbr.js';
const data=JSON.parse(fs.readFileSync(new URL('./tbr-bookshops.json',import.meta.url),'utf8'));
test('bookshop import preserves every photograph, unique public IDs and chronological order',()=>{
 assert.equal(data.photo_records,819);assert.equal(data.books.length,753);
 assert.equal(data.books.reduce((n,b)=>n+b.sightings.length,0),819);
 assert.equal(new Set(data.books.map(b=>b.id)).size,753);
 assert.equal(data.books[0].sightings[0].bookshop,'Watkins Books');
 assert.match(data.books[0].sightings[0].photographed_at,/^2026-10-29/);
 for(const b of data.books){
  assert.ok(b.title);assert.ok(b.sightings.length);
  for(let i=1;i<b.sightings.length;i++)assert.ok(Date.parse(b.sightings[i-1].photographed_at)>=Date.parse(b.sightings[i].photographed_at));
  for(const s of b.sightings){assert.ok(s.city&&s.bookshop);assert.ok(Number.isFinite(Date.parse(s.photographed_at)));}
  if(b.cover){assert.match(b.cover,/^covers\/web\/tbr_bookshop_[a-f\d]+\.jpg$/);assert.ok(fs.existsSync(new URL('./'+b.cover,import.meta.url)));}
 }
 for(let i=1;i<data.books.length;i++)assert.ok(Date.parse(data.books[i-1].sightings[0].photographed_at)>=Date.parse(data.books[i].sightings[0].photographed_at));
});
test('public TBR has no original paths, filenames, GPS or library state',()=>{
 const serialized=JSON.stringify(data);
 for(const token of ['latitude','longitude','photo_id','original','OneDrive','_build','read_status','owned','rating','PXL_','PXL\\','20261029_'])assert.ok(!serialized.includes('"'+token+'"'),token);
 assert.deepEqual(Object.keys(SOURCES).sort(),['bookshops','instagram','online']);
 assert.equal(data.books.filter(b=>b.identity_status==='needs_review').length,1);
 assert.equal(data.books.filter(b=>!b.cover).length,28);
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
