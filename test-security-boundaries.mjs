import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import vm from 'node:vm';

// The real HTTP handlers use a private, in-memory storage fixture on an ephemeral
// loopback port. No production configuration or catalogue is read or changed.
let row={id:'library',revision:1,books:[{id:'current-id',title:'Fixture book',rating:0,merged_record_ids:['old-id',123],author:null,future_metadata:{nested:['keep',1]}}]};
const originalRow=JSON.stringify(row);let writes=0;
const storage=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET')return res.end(JSON.stringify([row]));
  if(req.method==='PATCH'){
    writes++;let body='';for await(const chunk of req)body+=chunk;
    row={...row,...JSON.parse(body)};return res.end(JSON.stringify([row]));
  }
  res.writeHead(405);res.end('{}');
});
await new Promise(resolve=>storage.listen(0,'127.0.0.1',resolve));
const environment={NODE_ENV:'test',LOCAL_LIBRARY_FILE:undefined,SUPABASE_URL:`http://127.0.0.1:${storage.address().port}`,SUPABASE_SECRET_KEY:'boundary-fixture-storage-key',LIBRARY_PASSWORD:'boundary-fixture-password',SESSION_SECRET:'boundary-fixture-session-secret'};
const previousEnvironment=Object.fromEntries(Object.keys(environment).map(name=>[name,process.env[name]]));
for(const [name,value] of Object.entries(environment))if(value===undefined)delete process.env[name];else process.env[name]=value;
const {authenticated,validBooks}=await import('./library/server.mjs');
const {server}=await import('./server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
test.after(async()=>{
  await Promise.all([server,storage].map(s=>new Promise(resolve=>{s.close(resolve);s.closeAllConnections();})));
  for(const [name,value] of Object.entries(previousEnvironment))if(value===undefined)delete process.env[name];else process.env[name]=value;
});

test('malformed session signatures fail closed without throwing',()=>{
  const previous={LIBRARY_PASSWORD:process.env.LIBRARY_PASSWORD,SESSION_SECRET:process.env.SESSION_SECRET};
  process.env.LIBRARY_PASSWORD='boundary-fixture-password';
  process.env.SESSION_SECRET='boundary-fixture-session-secret';
  try{
    const expiry=String(Date.now()+60000);
    const check=signature=>authenticated({headers:{cookie:`library_session=${expiry}.${signature}`}});
    const signed=createHmac('sha256',process.env.SESSION_SECRET).update(expiry).digest('hex');
    assert.equal(check(signed),true);
    for(const signature of ['é'.repeat(64),'f'.repeat(63),'g'.repeat(64),'a'.repeat(64)])assert.equal(check(signature),false);
  }finally{
    for(const [name,value] of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});

test('saves reject malformed merge aliases before they can break library loading',()=>{
  for(const merged_record_ids of ['old-id',{},42,true]){
    const book={id:'current-id',title:'Fixture book',rating:0,merged_record_ids};
    assert.equal(validBooks([book]),false);
  }
});

test('save validation preserves nullable legacy aliases and unfamiliar metadata',async()=>{
  const source=await readFile(new URL('./library/index.html',import.meta.url),'utf8');
  const reindex=source.match(/  function reindex\(\)\{[^\n]+\}/)?.[0];
  assert.ok(reindex,'Exercise the real page indexing function');
  for(const merged_record_ids of [undefined,null,[],['old-id',123]]){
    const book={id:'current-id',title:'Fixture book',rating:0,merged_record_ids,author:null,pages:'240',future_metadata:{nested:['keep',1]}};
    const before=JSON.stringify(book);
    assert.equal(validBooks([book]),true);
    assert.equal(JSON.stringify(book),before);
    assert.doesNotThrow(()=>vm.runInNewContext(`${reindex}; reindex();`,{state:{books:[book]},byId:{}}));
  }
});

test('HTTP rejects malformed cookies and alias saves without altering stored data',async()=>{
  const malformed=`library_session=${Date.now()+60000}.${'é'.repeat(64)}`;
  const session=await fetch(base+'/api/session',{headers:{Cookie:malformed}});
  assert.equal(session.status,200);assert.deepEqual(await session.json(),{canEdit:false});
  const login=await fetch(base+'/login',{method:'POST',redirect:'manual',headers:{Origin:base},body:new URLSearchParams({password:environment.LIBRARY_PASSWORD})});
  assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const before=await fetch(base+'/books.json',{headers:{Cookie:cookie}});
  assert.equal(before.status,200);assert.equal(before.headers.get('x-library-revision'),'1');
  const books=await before.json();assert.equal(JSON.stringify(books),JSON.stringify(row.books));
  for(const merged_record_ids of ['old-id',{},42,true]){
    const invalid=books.map(book=>({...book,merged_record_ids}));
    const rejected=await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-Library-Revision':'1'},body:JSON.stringify(invalid)});
    assert.equal(rejected.status,400);await rejected.json();
    assert.equal(writes,0);assert.equal(JSON.stringify(row),originalRow);
  }
  const after=await fetch(base+'/books.json',{headers:{Cookie:cookie}});
  assert.equal(after.status,200);assert.equal(after.headers.get('x-library-revision'),'1');
  assert.equal(JSON.stringify(await after.json()),JSON.stringify(books));
  assert.equal(JSON.stringify(row),originalRow);
});
