import test from 'node:test';import assert from 'node:assert/strict';
import {mergeEditedSnapshot,EditConflict} from './library/library-edit-merge.mjs';
const seed=()=>[{id:'read',title:'Read audiobook',author:'Writer',rating:4,owned:false,read_status:'read',tags:['unfinished'],date_read:'2020-01-01',favorite:false},{id:'other',title:'Other book',rating:0}];
test('A stale rating edit preserves new ownership, a new Haiku entry and current favorites',()=>{
 const base=seed(),desired=structuredClone(base);desired[0].rating=5;
 const current=structuredClone(base);current[0].owned=true;current[0].favorite=true;current.push({id:'haiku',title:'Haiku',rating:0,owned:true,read_status:'unread'});
 const merged=mergeEditedSnapshot(current,base,desired);assert.equal(merged.length,3);assert.equal(merged[0].rating,5);assert.equal(merged[0].owned,true);assert.equal(merged[0].favorite,true);assert.deepEqual(merged[0].tags,['unfinished']);assert.equal(merged[0].date_read,base[0].date_read);assert.deepEqual(merged[2],current[2]);
});
test('Unrelated edits to the same book merge, while conflicting edits to the same field are refused',()=>{
 const base=seed(),desired=structuredClone(base),current=structuredClone(base);desired[0].rating=5;current[0].notes='New server note';
 assert.equal(mergeEditedSnapshot(current,base,desired)[0].notes,'New server note');current[0].rating=2;
 assert.throws(()=>mergeEditedSnapshot(current,base,desired),error=>error instanceof EditConflict&&error.message.includes('rating'));
});
test('A retry after a lost response is idempotent and object key order creates no conflict',()=>{
 const base=seed(),desired=structuredClone(base);desired[0].rating=5;desired[1].custom={a:1,b:2};
 const once=mergeEditedSnapshot(base,base,desired);once[1].custom={b:2,a:1};assert.deepEqual(mergeEditedSnapshot(once,base,desired),once);
});
test('Removing a membership retains its hidden canonical history and protects concurrent edits',()=>{
 const base=seed();base[0].tbr_ids=['source'];const merged=mergeEditedSnapshot(base,base,[base[1]]);
 assert.equal(merged.find(b=>b.id==='read').library_member,false);assert.deepEqual(merged.find(b=>b.id==='read').tbr_ids,['source']);
 const changed=structuredClone(base);changed[0].notes='Concurrent note';assert.throws(()=>mergeEditedSnapshot(changed,base,[base[1]]),EditConflict);
});
test('A removed book is not silently recreated by a stale unchanged snapshot',()=>{
 const base=seed();assert.deepEqual(mergeEditedSnapshot([base[1]],base,base),[base[1]]);
 const desired=structuredClone(base);desired[0].rating=1;assert.throws(()=>mergeEditedSnapshot([base[1]],base,desired),EditConflict);
});
