import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyBooks,applyBookIdentification} from './library/book-identification-recovery.mjs';
const plan={activate:true,version:'identification-test',books:[{id:'lost',title:'Lost',author:'',fields:{library_member:false,catalogue_hold:{reason:'Unknown book'}}},{id:'no',title:'Not owned',author:'',fields:{library_member:false,owned:false}}]};
const seed=()=>[{id:'lost',title:'Lost',author:'',favorite:true,owned:true,notes:'Preserve',_sync_versions:{favorite:'heart'}},{id:'no',title:'Not owned',author:'',owned:true},{id:'other',title:'Other',library_member:false,tbr_ids:['one']}];
test('hide records without deleting data, stamp membership, reject identity changes',()=>{
 const before=seed(),result=identifyBooks(before,plan);assert.equal(result.books.length,3);assert.equal(result.books[0].library_member,false);assert.equal(result.books[0].notes,'Preserve');assert.equal(result.books[0].favorite,true);assert.equal(result.books[0]._sync_versions.favorite,'heart');assert.equal(result.books[0]._sync_versions.library_member,plan.version);assert.equal(result.books[1].owned,false);assert.deepEqual(result.books[2],before[2]);assert.equal(before[0].library_member,undefined);
 before[0].title='Changed';assert.throws(()=>identifyBooks(before,plan),/identity/);
});
test('fresh CAS retries preserve a concurrent favorite; migration is one-time',async()=>{
 let row={books:seed(),revision:5},receipt=null,first=true,count=0;
 const backup={optionalReceipt:async()=>receipt,preserve:async()=>{count++;return {backup_verified:true};},receipt:async(v,r)=>{receipt=structuredClone(r);}};
 const db=async(method,q,body)=>{if(method==='GET')return [structuredClone(row)];if(first){first=false;row.books[0].favorite=false;row.books[0]._sync_versions.favorite='unheart';row.revision++;return [];}assert.ok(q.endsWith('revision=eq.6'));row={...row,...body};return [structuredClone(row)];};
 await applyBookIdentification({db,backup,plan});assert.equal(count,2);assert.equal(row.books[0].favorite,false);assert.equal(row.books[0]._sync_versions.favorite,'unheart');assert.equal(row.revision,7);
 row.books[0].library_member=true;await applyBookIdentification({db,backup,plan});assert.equal(row.books[0].library_member,true);assert.equal(count,2);
});
test('inactive plan and failed backup do not write',async()=>{
 await applyBookIdentification({db:()=>{throw Error('Must not read');},backup:{},plan:{...plan,activate:false}});
 let writes=0;await assert.rejects(applyBookIdentification({db:async m=>{if(m==='PATCH')writes++;return [{books:seed(),revision:1}];},backup:{optionalReceipt:async()=>null,preserve:async()=>{throw Error('Backup failed');}},plan}),/Backup failed/);assert.equal(writes,0);
});
