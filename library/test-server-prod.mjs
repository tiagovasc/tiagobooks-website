import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';

// ---- an in-memory stand-in for the hosted storage table ----
const seed=Array.from({length:40},(_,i)=>({id:String(i+1),title:'Book '+(i+1),rating:i%6}));
let row={id:'library',books:seed,revision:7};
let storageDown=false, reads=0;
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
  assert.equal(first.headers.get('x-library-revision'),'7');assert.equal(first.headers.get('etag'),'"r7"');
  assert.equal((await first.json()).length,40,'fetch transparently decodes, so a readable body proves the encoding is valid');
  const br=await fetch(base+'/books.json',{headers:{'Accept-Encoding':'br'}});
  assert.equal(br.headers.get('content-encoding'),'br');
  const plain=await fetch(base+'/books.json',{headers:{'Accept-Encoding':'identity'}});
  assert.equal(plain.headers.get('content-encoding'),null);assert.equal((await plain.json()).length,40);
  const before=reads;
  const cached=await fetch(base+'/books.json',{headers:{'If-None-Match':'"r7"'}});
  assert.equal(cached.status,304);assert.equal(cached.headers.get('x-library-revision'),'7');
  assert.equal(reads,before,'an unchanged library is not re-read from storage');
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
