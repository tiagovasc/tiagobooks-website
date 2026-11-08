import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';

// ---- an in-memory stand-in for the hosted storage table ----
const seed=Array.from({length:40},(_,i)=>({id:String(i+1),title:'Book '+(i+1),rating:i%6}));
Object.assign(seed[0],{acquisition_basis:'purchase_receipt',acquired_date:'2001-08-19',acquisition_events:[{date:'2001-08-19',shop:'Example shop'}],notes:'Purchased on 19 August',acquisition_source:'Receipt 19 August'});
let row={id:'library',books:seed,revision:7};
let storageDown=false, reads=0,conflictFavoriteOnce=false;
const storage=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');
  if(storageDown){res.statusCode=500;return res.end('{}');}
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET'){
    const select=(url.searchParams.get('select')||'*').split(',');
    const want=url.searchParams.get('revision');
    if(want&&want!=='eq.'+row.revision)return res.end('[]');
    if(select.includes('books'))reads++;
    return res.end(JSON.stringify([Object.fromEntries(select.map(k=>[k,row[k]]))]));
  }
  let body='';for await(const c of req)body+=c;
  if(req.method==='PATCH'){
    if(conflictFavoriteOnce){conflictFavoriteOnce=false;row.revision++;row.books[1].notes='Concurrent edit retained';return res.end('[]');}
    if(url.searchParams.get('revision')!=='eq.'+row.revision)return res.end('[]');
    row={...row,...JSON.parse(body)};return res.end(JSON.stringify([row]));
  }
  res.statusCode=405;res.end('{}');
});
await new Promise(r=>storage.listen(0,'127.0.0.1',r));
process.env.SUPABASE_URL=`http://127.0.0.1:${storage.address().port}`;
process.env.SUPABASE_SECRET_KEY='test-key';
process.env.LIBRARY_PASSWORD='isolated-test-password';
process.env.SESSION_SECRET='isolated-test-session-secret';
const {server,plausibleSave,resetCaches}=await import('./server.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
test.after(()=>{server.close();storage.close();server.closeAllConnections?.();});

async function login(){
  const r=await fetch(base+'/login',{method:'POST',body:'password=isolated-test-password',redirect:'manual'});
  assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];
}
const save=(books,revision,cookie)=>fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,'X-Library-Revision':String(revision),'Content-Type':'application/json'},body:JSON.stringify(books)});

test('public first-page preview is compact, private-field-free and revision validated',async()=>{
  const response=await fetch(base+'/api/library-preview');assert.equal(response.status,200);
  const preview=await response.json();assert.equal(preview.schema,2);assert.equal(preview.revision,String(row.revision));assert.equal(preview.owned.total,row.books.length);
  assert(preview.owned.books.length<=64);assert(Object.values(preview.tbr).every(books=>books.length<=48));
  for(const book of preview.owned.books){assert.equal(book.notes,undefined);assert.equal(book.acquisition_source,undefined);assert.equal(book._sync_versions,undefined);}
  for(const books of Object.values(preview.tbr))for(const book of books)for(const sighting of book.sightings)assert.match(sighting.photographed_at,/^\d{4}-\d{2}$/);
  assert.equal((await fetch(base+'/api/library-preview',{headers:{'If-None-Match':response.headers.get('etag')}})).status,304);
});

test('plausibleSave refuses empty or gutted libraries but allows normal edits',()=>{
  assert.equal(plausibleSave(100,0),false);
  assert.equal(plausibleSave(100,49),false);
  assert.equal(plausibleSave(100,50),true);
  assert.equal(plausibleSave(100,97),true);
  assert.equal(plausibleSave(5,2),true,'tiny test libraries are not guarded by the percentage rule');
  assert.equal(plausibleSave(null,10),true);
});

test('books.json is compressed, revision-tagged and answers conditional requests with 304',async()=>{
  const first=await fetch(base+'/books.json',{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(first.status,200);assert.equal(first.headers.get('content-encoding'),'gzip');
  assert.equal(first.headers.get('x-library-revision'),'7');assert.equal(first.headers.get('etag'),'"r7-month-public"');
  assert.equal((await first.json()).length,40,'fetch transparently decodes, so a readable body proves the encoding is valid');
  const br=await fetch(base+'/books.json',{headers:{'Accept-Encoding':'br'}});
  assert.equal(br.headers.get('content-encoding'),'br');
  const plain=await fetch(base+'/books.json',{headers:{'Accept-Encoding':'identity'}});
  assert.equal(plain.headers.get('content-encoding'),null);assert.equal((await plain.json()).length,40);
  const before=reads;
  const cached=await fetch(base+'/books.json',{headers:{'If-None-Match':'"r7-month-public"'}});
  assert.equal(cached.status,304);assert.equal(cached.headers.get('x-library-revision'),'7');
  assert.equal(reads,before,'an unchanged library is not re-read from storage');
});

test('anonymous library reads cannot reveal exact trip dates; owner data stays intact',async()=>{
 const cookie=await login();
 const owner=await fetch(base+'/books.json',{headers:{Cookie:cookie}});
 const full=await owner.json();assert.equal(full[0].acquired_date,'2001-08-19');assert.equal(full[0].acquisition_events[0].date,'2001-08-19');
 assert.match(owner.headers.get('cache-control'),/private, no-store/);
 for(const suffix of ['', '?view=public', '?view=full']){
  const r=await fetch(base+'/books.json'+suffix);const book=(await r.json())[0];
  assert.equal(book.acquired_date,'2001-08');
  for(const field of ['acquisition_events','notes','acquisition_source'])assert.equal(field in book,false);
  assert.match(r.headers.get('vary'),/Cookie/);
 }
 assert.equal((await fetch(base+'/books.json',{headers:{'If-None-Match':owner.headers.get('etag')}})).status,200);
 assert.equal((await fetch(base+'/books.json',{headers:{'If-None-Match':'"r7-public"'}})).status,200,'old public cache must refresh after privacy change');
 assert.deepEqual(row.books,seed);
});

test('the hosted page leaves out the embedded offline copy and keeps the edit flag correct',async()=>{
  const pub=await fetch(base+'/',{headers:{'Accept-Encoding':'identity'}});const html=await pub.text();
  assert.match(html,/window.CLOUD_CAN_EDIT=false/);assert.match(html,/var SEED = \[\];/);assert.ok(html.length<400000,'page is '+html.length+' bytes');
  const gz=await fetch(base+'/',{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(gz.headers.get('content-encoding'),'gzip');assert.equal(await gz.text(),html);
  const tag=pub.headers.get('etag');assert.ok(tag);
  assert.equal((await fetch(base+'/',{headers:{'If-None-Match':tag}})).status,304);
  const cookie=await login();
  const admin=await (await fetch(base+'/',{headers:{Cookie:cookie,'Accept-Encoding':'identity'}})).text();
  assert.match(admin,/window.CLOUD_CAN_EDIT=true/);
  assert.notEqual((await fetch(base+'/',{headers:{Cookie:cookie}})).headers.get('etag'),tag,'admin and public pages never share a cache entry');
});

test('security headers are present on pages, data and images',async()=>{
  const page=await fetch(base+'/');
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  for(const route of ['/','/books.json','/login','/favicon.svg','/nothing']){
    const r=await fetch(base+route);
    assert.equal(r.headers.get('x-content-type-options'),'nosniff',route);
    assert.equal(r.headers.get('x-frame-options'),'DENY',route);
    assert.equal(r.headers.get('referrer-policy'),'strict-origin-when-cross-origin',route);
  }
});

test('covers and their web renditions are served, nothing else is',async()=>{
  const dir=new URL('./covers/web/',import.meta.url);
  const sample=fs.existsSync(dir)?fs.readdirSync(dir).find(n=>/\.jpg$/.test(n)&&n.startsWith('cover_')):null;
  if(sample){
    const r=await fetch(`${base}/covers/web/${sample}`);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');
    assert.match(r.headers.get('cache-control'),/max-age=86400/);
    assert.equal((await fetch(`${base}/covers/web/${sample}`,{headers:{'If-None-Match':r.headers.get('etag')}})).status,304);
  }
  for(const route of ['/covers/../server.mjs','/covers/web/../../server.mjs','/covers/web/%2e%2e/server.mjs','/covers/web/_manifest.json','/covers/web/sub/x.jpg','/test-server-prod.mjs','/package.json'])
    assert.equal((await fetch(base+route)).status,404,route);
  assert.equal((await fetch(base+'/covers/web/cover_missing_000.jpg')).status,404);
});

test('a wrong password shows the login page with a message, and only failures are rate limited',async()=>{
  resetCaches();
  const form=await fetch(base+'/login',{method:'POST',body:'password=nope',headers:{Accept:'text/html'}});
  assert.equal(form.status,401);assert.match(form.headers.get('content-type'),/text\/html/);
  assert.match(await form.text(),/Incorrect password/);
  const api=await fetch(base+'/login',{method:'POST',body:'password=nope'});
  assert.equal(api.status,401);assert.equal((await api.json()).error,'Incorrect library password');
  for(let i=0;i<5;i++)assert.equal((await fetch(base+'/login',{method:'POST',body:'password=isolated-test-password',redirect:'manual'})).status,303,'successful sign-ins do not count');
  for(let i=0;i<10;i++)await fetch(base+'/login',{method:'POST',body:'password=nope'});
  const blocked=await fetch(base+'/login',{method:'POST',body:'password=nope',headers:{Accept:'text/html'}});
  assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'60');
  resetCaches();
});

test('saving: normal edits persist, stale revisions conflict, empty or gutted libraries are refused',async()=>{
  resetCaches();const cookie=await login();
  assert.equal((await save(seed,7,'')).status,401);
  const edited=seed.map((b,i)=>i===0?{...b,rating:5}:b);
  const ok=await save(edited,7,cookie);assert.equal(ok.status,200);assert.equal(ok.headers.get('x-library-revision'),'8');
  assert.equal(row.books[0].rating,5);
  assert.equal((await save(edited,7,cookie)).status,409,'a stale revision must not overwrite');
  const empty=await save([],8,cookie);assert.equal(empty.status,400);assert.match((await empty.json()).error,/remove most of the library/);
  assert.equal((await save(edited.slice(0,10),8,cookie)).status,400);
  assert.equal(row.books.length,40,'refused saves leave the stored library untouched');
  const again=await save(edited.slice(0,35),8,cookie);assert.equal(again.status,200);
  const fresh=await fetch(base+'/books.json');assert.equal(fresh.headers.get('x-library-revision'),'9');assert.equal((await fresh.json()).length,35);
});

test('storage outages give a clear 503 and the server keeps running',async()=>{
  resetCaches();storageDown=true;
  try{
    const r=await fetch(base+'/books.json');assert.equal(r.status,503);assert.match((await r.json()).error,/unavailable/);
    assert.equal((await fetch(base+'/health')).status,503);
  }finally{storageDown=false;}
  assert.equal((await fetch(base+'/health')).status,200);
});

test('favorite saves persist, publish, clear, and preserve all other fields',async()=>{
 storageDown=false;const cookie=await login(),before=structuredClone(row.books),revision=row.revision;
 const changed=structuredClone(before);changed[0].favorite=true;
 assert.equal((await save(changed,revision,cookie)).status,200);
 const owner=await (await fetch(base+'/books.json',{headers:{Cookie:cookie}})).json();
 const withoutVersions=books=>books.map(({_sync_versions,...book})=>book);
 assert.deepEqual(withoutVersions(owner),withoutVersions(changed));assert.ok(owner[0]._sync_versions.favorite);
 const pub=await (await fetch(base+'/books.json')).json();assert.equal(pub[0].favorite,true);
 assert.equal((await save(before,row.revision,cookie)).status,200);
 assert.deepEqual(withoutVersions(row.books),withoutVersions(before));assert.notEqual(row.books[0]._sync_versions.favorite,owner[0]._sync_versions.favorite);
 assert.equal((await (await fetch(base+'/books.json')).json())[0].favorite,undefined);
 assert.equal((await save(changed,row.revision,null)).status,401);
});

test('Library reads hide discovery-only books and saves retain their complete data',async()=>{
 const cookie=await login(),before=structuredClone(row);
 const hidden={id:'hidden',title:'TBR only',rating:0,library_member:false,book_identity_version:'test',favorite:true,discovery_records:[{id:'source',sources:['online']}]};
 try{
  row.books.push(hidden);row.revision++;resetCaches();
  const visible=await (await fetch(base+'/books.json',{headers:{Cookie:cookie}})).json();
  assert.equal(visible.length,before.books.length);assert.ok(!visible.some(b=>b.id==='hidden'));
  visible[0].rating=2;assert.equal((await save(visible,row.revision,cookie)).status,200);
  assert.deepEqual(row.books.find(b=>b.id==='hidden'),hidden);
 }finally{row=before;resetCaches();}
});

test('favorite field saves tolerate stale tabs, retry conflicts and protect later full saves',async()=>{
 const before=structuredClone(row),cookie=await login();
 try{
  conflictFavoriteOnce=true;
  const response=await fetch(base+'/api/tbr-favorites',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Library-Revision':'1'},body:JSON.stringify({book_id:row.books[0].id,favorite:true})});
  assert.equal(response.status,200);assert.equal(response.headers.get('X-Library-Revision'),null);
  const result=await response.json();assert.equal(result.favorite,true);assert.equal(row.books[0].favorite,true);assert.equal(row.books[1].notes,'Concurrent edit retained');
  const stale=structuredClone(row.books);stale[0].favorite=false;stale[0].title='Intentional title edit';
  const saved=await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Library-Revision':String(row.revision),'X-Library-Favorites-Separate':'1'},body:JSON.stringify(stale)});
  assert.equal(saved.status,200);assert.equal(row.books[0].favorite,true);assert.equal(row.books[0].title,'Intentional title edit');
 }finally{row=before;conflictFavoriteOnce=false;resetCaches();}
});

test('Stale full-library edits merge ratings without reverting ownership, new records or favorites',async()=>{
 const before=structuredClone(row),cookie=await login();
 try{
  const baseline=structuredClone(row.books),desired=structuredClone(baseline);desired[0].rating=(desired[0].rating+1)%6;
  row.books[0].owned=true;row.books[0].favorite=true;row.books.push({id:'haiku-new',title:'New Haiku entry',rating:0,owned:true});row.revision++;resetCaches();
  const response=await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Library-Revision':'1'},body:JSON.stringify({books:desired,base_books:baseline})});
  assert.equal(response.status,200);assert.equal(row.books[0].rating,desired[0].rating);assert.equal(row.books[0].owned,true);assert.equal(row.books[0].favorite,true);assert.ok(row.books.some(b=>b.id==='haiku-new'));
  row.books[0].rating=(desired[0].rating+1)%6;
  const conflicted=await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({books:desired,base_books:baseline})});
  assert.equal(conflicted.status,409);assert.match((await conflicted.json()).error,/rating changed elsewhere/);
 }finally{row=before;resetCaches();}
});

test('sync protocol is authenticated, same-origin, revision-safe and hides private field versions',async()=>{
 const before=structuredClone(row),cookie=await login();
 try{
  assert.equal((await fetch(base+'/api/library-sync')).status,401);
  const state=await (await fetch(base+'/api/library-state')).json();assert.equal(state.protocol,1);assert.match(state.build,/^[a-f0-9]{20}$/);assert.equal(state.can_edit,false);
  const target=row.books[0],op={id:'http-favorite-0001',book_id:target.id,field:'favorite',before:!!target.favorite,before_version:target._sync_versions?.favorite||null,present:true,value:!target.favorite};
  const post=(operations,origin=base)=>fetch(base+'/api/library-sync',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({protocol:1,operations})});
  assert.equal((await post([op],'https://other.example')).status,403);
  conflictFavoriteOnce=true;const response=await post([op]);assert.equal(response.status,200);assert.equal((await response.json()).results[0].status,'accepted');
  const revision=row.revision;assert.equal(row.books[0].favorite,op.value);assert.equal(row.books[1].notes,'Concurrent edit retained');
  assert.equal((await post([op])).status,200);assert.equal(row.revision,revision,'replaying a receipt does not create another write');
  const pub=await (await fetch(base+'/books.json')).json();assert.equal(pub[0]._sync_versions,undefined);
  const owner=await (await fetch(base+'/api/library-sync',{headers:{Cookie:cookie}})).json();assert.equal(owner.books[0]._sync_versions.favorite,op.id);
  const stale={...op,id:'http-favorite-0002',value:!op.value};const conflict=await (await post([stale])).json();assert.equal(conflict.results[0].status,'conflict');assert.equal(row.books[0].favorite,op.value);
  const invalid=await post([{...op,id:'bad-field-00001',field:'tbr_ids'}]);assert.equal(invalid.status,200);assert.equal((await invalid.json()).results[0].invalid,true);
 }finally{row=before;conflictFavoriteOnce=false;resetCaches();}
});
