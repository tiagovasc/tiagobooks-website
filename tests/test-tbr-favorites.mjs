import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createTbrFavoritesStore} from '../library/tbr-favorites-store.mjs';
import {filterCatalogue,tbrFavoriteHTML} from '../library/tbr.js';

const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'tbr-favorites-'));
const file=path.join(fixture,'library.json');
const original=JSON.stringify({id:'library',revision:1,books:[{id:'1',title:'Owned book',rating:4,favorite:true}]});
fs.writeFileSync(file,original);
process.env.LOCAL_LIBRARY_FILE=file;
process.env.LIBRARY_PASSWORD='isolated-test-password';process.env.SESSION_SECRET='isolated-test-session-secret';
const {server}=await import('../server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
test.after(()=>{server.close();server.closeAllConnections?.();});

test('TBR favorites persist through owner API, reject visitors/cross-origin writes, and never rewrite catalogues',async()=>{
  const catalogue=fs.readFileSync('library/tbr-catalogue.json');const id=JSON.parse(catalogue).books[0].id;
  const login=await fetch(base+'/login',{method:'POST',body:'password=isolated-test-password',redirect:'manual'});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const set=(favorite,extra={},target=id)=>fetch(base+'/api/tbr-favorites',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json',...extra},body:JSON.stringify({id:target,favorite})});
  assert.deepEqual(await (await fetch(base+'/api/tbr-favorites')).json(),{ids:[]});
  assert.equal((await set(true,{Cookie:''})).status,401);
  assert.equal((await set(true,{Origin:'https://other.example'})).status,403);
  assert.equal((await set('true')).status,400);
  assert.equal((await set(true,{},'missing-book')).status,404);
  assert.equal((await set(true)).status,200);
  assert.deepEqual(await (await fetch(base+'/api/tbr-favorites')).json(),{ids:[id]});
  const fresh=createTbrFavoritesStore({localFile:file+'.tbr-favorites.json'});assert.deepEqual(await fresh.list(),[id]);
  assert.equal(fs.readFileSync(file,'utf8'),original);assert.deepEqual(fs.readFileSync('library/tbr-catalogue.json'),catalogue);
  assert.equal((await set(false)).status,200);assert.deepEqual(await fresh.list(),[]);
  assert.equal(fs.readFileSync(file,'utf8'),original);
});

test('one TBR favorite follows its book across every source and combines with search',()=>{
  const book={id:'shared',title:'Favorite Book',author:'Author',sources:['bookshops','online','instagram'],sightings:[{city:'London',bookshop:'Shop',photographed_at:'2026-10',visit_id:'visit'}]};
  const other={...book,id:'other',title:'Other Book'};const books=[book,other],favoriteIds=new Set(['shared']);
  for(const source of ['all','bookshops','online','instagram']){
    assert.deepEqual(filterCatalogue(books,{source,favoritesOnly:true,favoriteIds}).map(b=>b.id),['shared']);
    assert.equal(filterCatalogue(books,{source,favoritesOnly:true,favoriteIds,query:'other'}).length,0);
    assert.equal(filterCatalogue(books,{source,favoritesOnly:false,favoriteIds}).length,2);
  }
});

test('TBR heart controls expose owner pressed state and read-only public badges',()=>{
  const b={id:'shared',title:'A book'};
  assert.match(tbrFavoriteHTML(b,true,true),/aria-pressed="true"/);
  assert.match(tbrFavoriteHTML(b,false,true),/aria-pressed="false"/);
  assert.match(tbrFavoriteHTML(b,true,true,true),/disabled aria-busy="true"/);
  assert.equal(tbrFavoriteHTML(b,false,false),'');
  assert.match(tbrFavoriteHTML(b,true,false),/role="img"/);
  assert.doesNotMatch(tbrFavoriteHTML(b,true,false),/<button|data-tbr-favorite/);
});

test('remote favorites use private storage and independent per-book writes',async()=>{
  let created=false;const ids=new Set(),calls=[];
  const request=async(url,options)=>{
    const route=url.split('/storage/v1/')[1],body=options.body?JSON.parse(options.body):null;calls.push({route,options,body});
    assert.equal(options.headers.apikey,'test-service');
    if(route==='bucket'){if(created)return new Response(JSON.stringify({statusCode:409}),{status:400});assert.equal(body.public,false);created=true;return Response.json({name:body.name});}
    if(route.startsWith('object/list/'))return Response.json([...ids].map(name=>({id:name,name})));
    if(options.method==='POST'){ids.add(route.split('/').at(-1));return Response.json({Key:route});}
    for(const name of body.prefixes)ids.delete(name);return Response.json([]);
  };
  const store=createTbrFavoritesStore({url:'https://storage.example',key:'test-service',request});
  await store.set('one',true);await store.set('two',true);assert.deepEqual((await store.list()).sort(),['one','two']);
  await store.set('one',false);assert.deepEqual(await store.list(),['two']);
  assert.ok(calls.some(c=>c.options.headers['x-upsert']==='true'));
  assert.throws(()=>store.set('../invalid',true));
});

test('missing storage starts empty; outages are not mistaken for empty favorites',async()=>{
  const missing=createTbrFavoritesStore({url:'https://storage.example',key:'test',request:async()=>new Response(JSON.stringify({statusCode:'404'}),{status:400})});
  assert.deepEqual(await missing.list(),[]);
  const down=createTbrFavoritesStore({url:'https://storage.example',key:'test',request:async()=>new Response('{}',{status:503})});
  await assert.rejects(down.list(),/unavailable/);
});
