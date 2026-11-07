import test from 'node:test';
import assert from 'node:assert/strict';
import {fillMissingCovers,applyMissingCovers} from '../library/missing-cover-recovery.mjs';
const version='missing-cover-test-v1';
const target={id:'one',title:'Book',author:'Author',fields:{cover:'covers/tbr_metadata_0123456789abcdef01234567.jpg',cover_status:'ok',cover_source_url:'https://publisher.example/book',cover_image_kind:'front_cover'}};
const seed=()=>[{id:'one',title:'Book',author:'Author',cover:'',favorite:true,owned:true,rating:5,notes:'Private notes',read_status:'read',tbr_ids:['shop','online'],_sync_versions:{favorite:'newest-heart',notes:'notes-version'}},{id:'two',title:'Untouched',author:'Other',cover:'covers/existing.jpg',library_member:false,discovery_records:[{id:'source'}]}];
test('fill only missing covers and preserve all personal data, memberships and unrelated versions',()=>{
 const original=seed(),result=fillMissingCovers(original,[target],version);
 assert.deepEqual(result.changedIds,['one']);assert.equal(result.books[0].cover,target.fields.cover);assert.equal(result.books[0]._sync_versions.cover,version);assert.equal(result.books[0]._sync_versions.favorite,'newest-heart');assert.equal(result.books[0].notes,'Private notes');assert.equal(result.books[0].favorite,true);assert.equal(result.books[0].owned,true);assert.deepEqual(result.books[0].tbr_ids,['shop','online']);assert.deepEqual(result.books[1],original[1]);assert.equal(original[0].cover,'');
});
test('retain a cover assigned elsewhere during research and reject changed empty-book identities',()=>{
 const books=seed();books[0].cover='covers/user-choice.jpg';assert.deepEqual(fillMissingCovers(books,[target],version).books,books);
 books[0].cover='';books[0].title='Changed work';assert.throws(()=>fillMissingCovers(books,[target],version),/identity changed/);
 assert.throws(()=>fillMissingCovers(seed(),[{...target,fields:{...target.fields,owned:false}}],version),/Invalid cover recovery fields/);
});
test('two-phase release does not touch storage until assets are activated',async()=>{
 const result=await applyMissingCovers({db:()=>{throw Error('Must not read');},backup:{},plan:{activate:false,version,books:[target]}});assert.equal(result.state,'ready');
});
test('verified backup precedes CAS, concurrent favorites survive, and completed migration never reasserts a cleared cover',async()=>{
 let row={books:seed(),revision:10},receipt=null,backups=0,conflict=true;const order=[];
 const backup={optionalReceipt:async()=>receipt,preserve:async r=>{backups++;order.push('backup');return {backup_verified:true,backup_sha256:'hash-'+r.revision};},receipt:async(v,r)=>{receipt=structuredClone(r);order.push(r.state);}};
 const db=async(method,query,body)=>{if(method==='GET')return [structuredClone(row)];order.push('patch');if(conflict){conflict=false;row.books[0].favorite=false;row.books[0]._sync_versions.favorite='user-unheart';row.revision++;return [];}assert.match(query,new RegExp('revision=eq.'+row.revision));row={...row,...body};return [structuredClone(row)];};
 const plan={activate:true,version,books:[target]},result=await applyMissingCovers({db,backup,plan});assert.equal(result.state,'applied');assert.equal(backups,2);assert.equal(row.books[0].favorite,false);assert.equal(row.books[0]._sync_versions.favorite,'user-unheart');assert.equal(order[0],'backup');assert.equal(row.revision,12);
 row.books[0].cover='';row.revision++;await applyMissingCovers({db,backup,plan});assert.equal(row.books[0].cover,'');assert.equal(backups,2);
});
test('backup failure prevents database writes',async()=>{
 let patches=0;await assert.rejects(applyMissingCovers({plan:{activate:true,version,books:[target]},db:async method=>{if(method==='PATCH')patches++;return [{books:seed(),revision:1}];},backup:{optionalReceipt:async()=>null,preserve:async()=>{throw Error('Backup unavailable');}}}),/Backup unavailable/);assert.equal(patches,0);
});
