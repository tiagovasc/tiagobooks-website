import test from 'node:test';
import assert from 'node:assert/strict';
import {correctPhysicalLibrary,applyPhysicalLibraryCorrections,withdrawPhysicalAdditions} from '../library/physical-library-corrections.mjs';
const plan={version:'photo-test-v1',activate:true,updates:[{id:'a',title:'A',author:'Author',fields:{owned:true}},{id:'tbr',title:'TBR book',author:'Writer',fields:{library_member:true,owned:true}}],additions:[{id:'new',title:'Manga',author:'Author',owned:true,library_member:true,rating:0,isbn13:'9780241703731'}]};
const seed=()=>[{id:'a',title:'A',author:'Author',owned:false,favorite:true,notes:'Private',read_status:'paused',_sync_versions:{favorite:'heart-version'}},{id:'tbr',title:'TBR book',author:'Writer',library_member:false,tbr_ids:['discovery'],discovery_records:[{source:'original'}],favorite:true},{id:'other',title:'Original novel',read_status:'read',date_read:'2020-01-01'}];
test('physical corrections retain favorites, reading history, TBR identity, original editions and private data',()=>{
 const before=seed(),r=correctPhysicalLibrary(before,plan);
 assert.equal(r.books.length,4);assert.equal(r.books[0].owned,true);assert.equal(r.books[0].favorite,true);assert.equal(r.books[0].notes,'Private');assert.equal(r.books[0].read_status,'paused');assert.equal(r.books[0]._sync_versions.favorite,'heart-version');assert.equal(r.books[0]._sync_versions.owned,plan.version);
 assert.deepEqual(r.books[1].tbr_ids,['discovery']);assert.deepEqual(r.books[1].discovery_records,[{source:'original'}]);assert.deepEqual(r.books[2],before[2]);assert.equal(r.books[3]._sync_versions._created,plan.version);assert.equal(before[0].owned,false);
});
test('identity and ISBN collisions stop rather than guess or duplicate',()=>{
 const wrong=seed();wrong[0].author='Changed';assert.throws(()=>correctPhysicalLibrary(wrong,plan),/identity/);
 const duplicate=seed();duplicate[2].isbn13='9780241703731';assert.throws(()=>correctPhysicalLibrary(duplicate,plan),/ISBN/);
});
test('fresh CAS retry preserves a favorite changed during maintenance; subsequent startup does not undo owner edits',async()=>{
 let row={books:seed(),revision:5},saved=null,first=true,backups=0;
 const backup={optionalReceipt:async()=>saved,preserve:async()=>{backups++;return {backup_verified:true};},receipt:async(v,r)=>{saved=structuredClone(r);}};
 const db=async(m,q,b)=>{if(m==='GET')return [structuredClone(row)];if(first){first=false;row.books[0].favorite=false;row.books[0]._sync_versions.favorite='new-unheart';row.revision++;return [];}assert.ok(q.endsWith('revision=eq.6'));row={...row,...b};return [structuredClone(row)];};
 await applyPhysicalLibraryCorrections({db,backup,plan});assert.equal(row.revision,7);assert.equal(backups,2);assert.equal(row.books[0].favorite,false);assert.equal(row.books[0]._sync_versions.favorite,'new-unheart');
 row.books[0].owned=false;await applyPhysicalLibraryCorrections({db,backup,plan});assert.equal(row.books[0].owned,false);assert.equal(backups,2);
});
test('backup verification is mandatory before writing',async()=>{
 let writes=0;await assert.rejects(applyPhysicalLibraryCorrections({plan,db:async m=>{if(m==='PATCH')writes++;return [{books:seed(),revision:1}];},backup:{optionalReceipt:async()=>null,preserve:async()=>({backup_verified:false})}}),/backup/);assert.equal(writes,0);
});
test('inactive plan does not access storage',async()=>{
 const r=await applyPhysicalLibraryCorrections({plan:{...plan,activate:false},db:()=>{throw Error('unexpected');},backup:{}});assert.equal(r.state,'ready');
});
test('withdrawal removes only the untouched agent-created entry and preserves every other book',async()=>{
 let row={revision:2,books:[...seed(),{id:'withdrawn',title:'Ignored',rating:0,favorite:false,read_status:'unread',_sync_versions:{_created:plan.version}}]},receipt=null;
 const p={...plan,withdrawn_ids:['withdrawn']};
 const backup={optionalReceipt:async()=>receipt,preserve:async()=>({backup_verified:true}),receipt:async(v,r)=>{receipt=r;}};
 const db=async(m,q,b)=>{if(m==='GET')return [structuredClone(row)];row={...row,...b};return [structuredClone(row)];};
 await withdrawPhysicalAdditions({db,backup,plan:p});assert.deepEqual(row.books,seed());assert.equal(row.revision,3);assert.equal(receipt.all_other_records_preserved,true);
 row.books.push({id:'withdrawn',rating:0,read_status:'unread',_sync_versions:{_created:plan.version,notes:'owner-edit'}});receipt=null;
 await assert.rejects(withdrawPhysicalAdditions({db,backup,plan:p}),/later owner edits/);assert.equal(row.books.length,4);
});
