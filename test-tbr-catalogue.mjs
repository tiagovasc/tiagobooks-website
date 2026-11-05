import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchCatalogue,tbrHref,tbrLabel} from './src/lib/catalogue-search.mjs';
import {catalogueCounts,sourceBooks,filterCatalogue} from './library/tbr.js';
const catalogue=JSON.parse(fs.readFileSync('library/tbr-catalogue.json','utf8'));
const original=JSON.parse(fs.readFileSync('library/tbr-bookshops.json','utf8'));

test('unified TBR retains every bookshop field and counts shared books once',()=>{
  assert.equal(catalogue.schema_version,2);
  assert.deepEqual(catalogueCounts(catalogue.books),catalogue.counts);
  assert.equal(new Set(catalogue.books.map(b=>b.id)).size,catalogue.books.length);
  assert.equal(catalogue.counts.bookshops,753);
  assert.ok(catalogue.counts.online>3200);
  const byId=new Map(catalogue.books.map(b=>[b.id,b]));
  for(const book of original.books){
    const current=byId.get(book.id);
    assert.ok(current?.sources.includes('bookshops'),book.id);
    for(const [key,value] of Object.entries(book))assert.deepEqual(current[key],value,book.id+': '+key);
  }
  const shared=catalogue.books.filter(b=>b.sources.includes('online')&&b.sources.includes('bookshops'));
  assert.ok(shared.length>40);
  const membershipTotal=catalogue.books.reduce((n,b)=>n+b.sources.length,0);
  const repeatedMemberships=catalogue.books.reduce((n,b)=>n+b.sources.length-1,0);
  assert.equal(catalogue.counts.total,membershipTotal-repeatedMemberships);
  assert.equal(sourceBooks(catalogue.books,'bookshops').reduce((n,b)=>n+b.sightings.length,0),819);
});

test('Online records expose only public book metadata and existing local covers',()=>{
  const allowed=new Set(['id','title','author','cover','description','identity_status','sightings','sources','online_order','instagram_order']);
  for(const book of catalogue.books){
    if(!book.sources.includes('online'))continue;
    assert.ok(book.title&&Number.isFinite(book.online_order));
    if(!book.sources.includes('bookshops')){
      assert.deepEqual(book.sightings,[]);
      for(const key of Object.keys(book))assert.ok(allowed.has(key),'unexpected public field: '+key);
      assert.match(book.id,/^online-[a-f\d]+$/);
    }
    if(book.cover){
      assert.match(book.cover,/^covers\/web\/tbr_(?:bookshop|online)_[a-f\d]+\.jpg$/);
      assert.ok(fs.existsSync('library/'+book.cover),book.cover);
    }
  }
  const text=JSON.stringify(catalogue);
  for(const forbidden of ['all_labels','source_entry','winner_entry','de-wishlist','uk-wishlist','de-saved-later','uk-saved-later','price_amount','source_file','OneDrive'])assert.ok(!text.includes(forbidden),forbidden);
});

test('search finds Online-only and shared books once with the appropriate destination',()=>{
  const online=catalogue.books.find(b=>b.sources.includes('online')&&!b.sources.includes('bookshops'));
  const shared=catalogue.books.find(b=>b.sources.includes('online')&&b.sources.includes('bookshops'));
  for(const book of [online,shared]){
    const results=searchCatalogue(catalogue.books,book.title);
    assert.equal(results.filter(b=>b.id===book.id).length,1);
    assert.equal(filterCatalogue(catalogue.books,{source:'online',query:book.title}).filter(b=>b.id===book.id).length,1);
  }
  assert.match(tbrHref(online),/source=online/);assert.equal(tbrLabel(online),'Online');
  assert.match(tbrHref(shared),/source=bookshops/);assert.ok(tbrLabel(shared).includes(shared.sightings[0].bookshop));
});

test('Instagram records expose only public fields and search every source member once',()=>{
  const instagram=sourceBooks(catalogue.books,'instagram');
  assert.ok(instagram.length>0);
  const allowed=new Set(['id','title','author','cover','description','identity_status','sightings','sources','instagram_order']);
  for(const book of instagram){
    assert.ok(book.title&&Number.isFinite(book.instagram_order));
    if(book.sources.length===1){
      assert.deepEqual(book.sightings,[]);
      assert.match(book.id,/^instagram-[a-f\d]+$/);
      for(const key of Object.keys(book))assert.ok(allowed.has(key),'unexpected Instagram field: '+key);
    }
    if(book.cover){
      assert.match(book.cover,/^covers\/web\/tbr_(?:bookshop|online|instagram)_[a-f\d]+\.jpg$/);
      assert.ok(fs.existsSync('library/'+book.cover),book.cover);
    }
  }
  const text=JSON.stringify(catalogue);
  for(const forbidden of ['instagram.com/','post_id','post_url','instagram_url','collection_id','collection_key','raw_caption','raw_ai_response','username'])assert.ok(!text.includes(forbidden),forbidden);
  const only=instagram.find(b=>b.sources.length===1),shared=instagram.find(b=>b.sources.includes('bookshops'));
  assert.ok(only&&shared);
  for(const book of [only,shared]){
    assert.equal(searchCatalogue(catalogue.books,book.title).filter(b=>b.id===book.id).length,1);
    assert.equal(filterCatalogue(catalogue.books,{source:'instagram',query:book.title}).filter(b=>b.id===book.id).length,1);
  }
  assert.match(tbrHref(only),/source=instagram/);assert.equal(tbrLabel(only),'Instagram');
  assert.match(tbrHref(shared),/source=bookshops/);
});

test('unified catalogue HTTP route supports compression and cache validation but no writes',async()=>{
  const {server}=await import('./library/server.mjs');
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const r=await fetch(base+'/tbr-catalogue.json',{headers:{'Accept-Encoding':'gzip'}});
    assert.equal(r.status,200);assert.equal(r.headers.get('content-encoding'),'gzip');
    assert.deepEqual(await r.json(),catalogue);
    assert.equal((await fetch(base+'/tbr-catalogue.json',{headers:{'If-None-Match':r.headers.get('etag')}})).status,304);
    assert.equal((await fetch(base+'/tbr-catalogue.json',{method:'POST',body:'[]'})).status,405);
    for(const route of ['/Amazon_books.csv','/Book_provenance.jsonl','/private/online-import-20261105-provenance.json','/private/instagram-import-20261105-snapshot.json','/private/instagram-import-20261105-mapping.json'])assert.equal((await fetch(base+route)).status,404);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
