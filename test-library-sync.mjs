import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOperations,stampLegacyChanges} from './library/sync-operations.mjs';
import {ChangeStore,createSync,project} from './library/library-sync.js';

const seed=()=>[{id:'one',title:'One',favorite:false,owned:true,rating:3,notes:'original',tbr_ids:['shop-one'],applied_corrections:['receipt']},{id:'hidden',title:'TBR book',library_member:false,favorite:false,owned:false,rating:0}];
const operation=(id,field,before,value,token=null,book_id='one')=>({id,book_id,field,before,before_version:token,present:true,value});
class MemoryStorage{
 map=new Map();get length(){return this.map.size;}key(i){return [...this.map.keys()][i];}getItem(k){return this.map.get(k)||null;}setItem(k,v){this.map.set(k,v);}removeItem(k){this.map.delete(k);}
}
globalThis.window={LIBRARY_BUILD_ID:'build-one',addEventListener(){}};
globalThis.document={visibilityState:'visible',addEventListener(){}};
globalThis.BroadcastChannel=class{addEventListener(){}postMessage(){}close(){}};
function harness(storage=new MemoryStorage()){
 let books=seed(),revision=1,offline=false,loseReply=false,build='build-one',auth=true,editing=false,applied;
 const store=new ChangeStore(storage),requests=[];
 const request=async(url,init={})=>{
  requests.push({url,init});if(offline)throw Error('network unavailable');if(!auth)return {ok:false,status:401};
  let data;
  if(url==='/api/library-state')data={revision,build,can_edit:auth};
  else if(init.method==='POST'){const result=applyOperations(books,JSON.parse(init.body).operations);books=result.books;revision+=result.changed?1:0;data={results:result.results,revision};if(loseReply){loseReply=false;throw Error('reply lost after commit');}}
  else data={books:structuredClone(books),revision,protocol:1};
  return {ok:true,status:200,json:async()=>structuredClone(data)};
 };
 const make=()=>createSync({apply:b=>applied=b,editing:()=>editing},{store,request});
 return {make,store,requests,get books(){return books;},get applied(){return applied;},set offline(v){offline=v;},set loseReply(v){loseReply=v;},set build(v){build=v;},set auth(v){auth=v;},set editing(v){editing=v;},remote(ops){const r=applyOperations(books,ops);books=r.books;revision++;}};
}

test('field changes merge without touching unrelated books, ownership, memberships or notes',()=>{
 const input=seed(),result=applyOperations(input,[operation('favorite-0001','favorite',false,true)]);
 assert.equal(result.books[0].favorite,true);assert.equal(result.books[0].owned,true);assert.equal(result.books[0].notes,'original');assert.deepEqual(result.books[0].tbr_ids,['shop-one']);assert.deepEqual(result.books[1],input[1]);assert.equal(input[0].favorite,false);
});
test('lost response retry is idempotent; a later unheart cannot be overwritten by the old favorite',()=>{
 const old=operation('favorite-0002','favorite',false,true),first=applyOperations(seed(),[old]);
 assert.equal(applyOperations(first.books,[old]).changed,false);
 const newer=applyOperations(first.books,[operation('unheart-00002','favorite',true,false,old.id)]);
 const retried=applyOperations(newer.books,[old]);assert.equal(retried.books[0].favorite,false);assert.equal(retried.results[0].status,'conflict');
});
test('changing a value back still conflicts with an old snapshot (ABA)',()=>{
 let books=applyOperations(seed(),[operation('notes-change1','notes','original','new')]).books;
 books=applyOperations(books,[operation('notes-change2','notes','new','original','notes-change1')]).books;
 const result=applyOperations(books,[operation('notes-stale01','notes','original','stale')]);assert.equal(result.results[0].status,'conflict');assert.equal(result.books[0].notes,'original');
});
test('legacy saves preserve and advance version stamps',()=>{
 const old=applyOperations(seed(),[operation('notes-change3','notes','original','new')]).books;
 const next=structuredClone(old);delete next[0]._sync_versions;next[0].notes='legacy edit';
 const stamped=stampLegacyChanges(old,next,'legacy-token');assert.equal(stamped[0]._sync_versions.notes,'legacy-token');
});
test('different fields succeed even while a genuinely conflicting field needs review',()=>{
 const result=applyOperations(seed(),[operation('conflict-0001','notes','stale','mine'),operation('favorite-0003','favorite',false,true)]);
 assert.deepEqual(result.results.map(r=>r.status),['conflict','accepted']);assert.equal(result.books[0].notes,'original');assert.equal(result.books[0].favorite,true);
});
test('offline changes survive controller destruction and restart, then sync exactly once',async()=>{
 const h=harness(),a=h.make();await a.start();h.offline=true;a.favorite('hidden',true);a.stage([{...a.current()[0],rating:5}]);await a.flush();assert.equal(a.status().pending,2);a.stop();
 h.offline=false;const b=h.make();try{await b.start();assert.equal(b.status().pending,0);assert.equal(h.books[1].favorite,true);assert.equal(h.books[0].rating,5);assert.equal(h.store.all().filter(r=>r.state==='done').length,2);}finally{b.stop();}
});
test('lost response remains durable, retries safely, and does not report synced too early',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.loseReply=true;engine.favorite('one',true);await engine.flush();assert.equal(h.books[0].favorite,true);assert.equal(engine.status().pending,1);assert.equal(engine.status().online,false);await engine.flush();assert.equal(engine.status().pending,0);}finally{engine.stop();}
});
test('recovered legacy favorite requires review instead of overriding a newer server choice',async()=>{
 const storage=new MemoryStorage();globalThis.localStorage=storage;storage.setItem('tiagovf-favorite-recovery-v1',JSON.stringify({one:{bookId:'one',favorite:true,token:'legacy-token'}}));
 const h=harness(storage),engine=h.make();try{await engine.start();assert.equal(h.books[0].favorite,false);assert.equal(engine.status().conflicts.length,1);await engine.resolve('one','favorite',true);assert.equal(h.books[0].favorite,true);assert.equal(engine.status().pending,0);assert.ok(h.store.all().some(r=>r.resolution==='keep-mine'));}finally{engine.stop();}
});
test('same-field conflict retains local edit until the user chooses saved value',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.offline=true;engine.stage([{...engine.current()[0],notes:'my notes'}]);h.remote([operation('other-notes01','notes','original','other notes')]);h.offline=false;await engine.flush();assert.equal(h.books[0].notes,'other notes');assert.equal(engine.current()[0].notes,'my notes');assert.equal(engine.status().conflicts.length,1);await engine.resolve('one','notes',false);assert.equal(engine.current()[0].notes,'other notes');assert.equal(engine.status().pending,0);}finally{engine.stop();}
});
test('rapid favorite then unheart preserves the final intent across lost replies',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.loseReply=true;engine.favorite('one',true);await engine.flush();engine.favorite('one',false);await engine.flush();assert.equal(h.books[0].favorite,false);assert.equal(engine.status().pending,0);}finally{engine.stop();}
});
test('remote updates refresh data; an application update prompts without reloading or losing drafts',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.remote([operation('remote-owned1','owned',true,false)]);h.build='build-two';await engine.check();assert.equal(h.applied[0].owned,false);assert.equal(engine.status().newBuild,'build-two');assert.equal(engine.status().pending,0);}finally{engine.stop();}
});
test('remote changes do not replace a focused editor; stale editor saves conflict safely',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.editing=true;h.remote([operation('remote-notes2','notes','original','remote')]);await engine.check();assert.equal(h.applied[0].notes,'original');engine.stage([{...h.applied[0],notes:'typing'}]);await engine.flush();assert.equal(h.books[0].notes,'remote');assert.equal(engine.status().conflicts.length,1);}finally{engine.stop();}
});
test('expired login keeps local drafts and recovers after sign-in',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.auth=false;engine.favorite('one',true);await engine.flush();assert.equal(engine.status().auth,false);assert.equal(engine.status().pending,1);h.auth=true;await engine.check();assert.equal(h.books[0].favorite,true);assert.equal(engine.status().pending,0);}finally{engine.stop();}
});
test('storage failure is explicit and no network save pretends that the change was durable',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();const before=h.requests.length;h.store.storage.setItem=()=>{throw Error('Storage full');};assert.throws(()=>engine.favorite('one',true),/Storage full/);assert.equal(engine.status().storageError,'Storage full');assert.equal(h.requests.length,before);assert.equal(h.books[0].favorite,false);}finally{engine.stop();}
});
test('independent tabs append their changes without replacing another pending key',async()=>{
 const h=harness(),a=h.make(),b=h.make();try{await a.start();await b.start();h.offline=true;a.favorite('one',true);b.favorite('hidden',true);assert.equal(h.store.pending().length,2);h.offline=false;await a.flush();await b.check();assert.equal(h.books[0].favorite,true);assert.equal(h.books[1].favorite,true);assert.equal(b.status().pending,0);}finally{a.stop();b.stop();}
});
test('removing a library membership preserves the complete underlying TBR book',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();engine.remove('one');await engine.flush();assert.equal(h.books[0].library_member,false);assert.equal(h.books[0].notes,'original');assert.deepEqual(h.books[0].tbr_ids,['shop-one']);}finally{engine.stop();}
});
test('invalid fields, ratings and malformed batches cannot alter canonical identity',()=>{
 for(const op of [operation('invalid-field1','tbr_ids',[],[]),operation('invalid-rating','rating',3,9)])assert.throws(()=>applyOperations(seed(),[op]));
});

test('typing keeps one compact unsent draft and preserves its original baseline',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.offline=true;for(let i=1;i<=100;i++)engine.stage([{...engine.current()[0],notes:'x'.repeat(i)}]);assert.equal(engine.status().pending,1);assert.equal(h.store.pending()[0].op.before,'original');h.offline=false;await engine.flush();assert.equal(h.books[0].notes,'x'.repeat(100));assert.equal(engine.status().pending,0);}finally{engine.stop();}
});
test('a resolved field can be edited again in the still-open editor without another false conflict',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();h.editing=true;engine.stage([{...h.applied[0],notes:'mine'}]);h.remote([operation('remote-notes3','notes','original','theirs')]);await engine.flush();await engine.resolve('one','notes',true);engine.stage([{...engine.current()[0],notes:'mine again'}]);await engine.flush();assert.equal(h.books[0].notes,'mine again');assert.equal(engine.status().pending,0);}finally{engine.stop();}
});
test('a new blank book is durable immediately and its later title edits sync correctly',async()=>{
 const h=harness(),engine=h.make();try{await engine.start();const added={id:'new-blank',title:'',rating:0,read_status:'unread',owned:true};engine.stage([...engine.current(),added]);h.loseReply=true;await engine.flush();assert.equal(engine.status().pending,1);engine.stage(engine.current().map(b=>b.id===added.id?{...b,title:'New book title'}:b));await engine.flush();assert.equal(engine.status().pending,0);assert.equal(h.books.find(b=>b.id===added.id).title,'New book title');assert.equal(h.books.filter(b=>b.id===added.id).length,1);}finally{engine.stop();}
});
