import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reconcileRecords,mergeLibrarySave,projectTbrCatalogue,canonicalFavoriteIds,runBookReconciliation} from './library/canonical-books.mjs';
import {correctedBooks,applyConfirmedCorrections} from './library/confirmed-book-corrections.mjs';
const original=[{id:'1',title:'Book',author:'Writer',rating:5,description:'Keep this',favorite:true},{id:'set',title:'Set',rating:5,notes:'Original notes',owned:true}];
const correctionsFixture=()=>[{id:'762',title:'The Murder of Professor Schlick: The Rise and Fall of the Vienna Circle',author:'David Edmonds',read_status:'read',date_read:'2026-05-27',rating:4,owned:false,format:'',favorite:true},{id:'work-online-7f514a374bea6a8171ec',title:'The History of Western Philosophy in 100 Haiku',author:'Haris Vlavianos',library_member:false,rating:0,favorite:true,tbr_ids:['online-7f514a374bea6a8171ec']},{id:'other',title:'Untouched',rating:5,owned:false}];
test('Confirmed ownership corrections reuse the same books and retain reading/favorite/history data',()=>{
 const before=correctionsFixture(),result=correctedBooks(before);assert.equal(result.books.length,before.length);
 assert.equal(result.books[0].owned,true);assert.equal(result.books[0].format,'Audiobook');assert.equal(result.books[0].date_read,'2026-05-27');assert.equal(result.books[0].rating,4);
 assert.equal(result.books[1].library_member,true);assert.equal(result.books[1].read_status,'unread');assert.equal(result.books[1].owned,true);assert.equal(result.books[1].favorite,true);assert.deepEqual(result.books[1].tbr_ids,before[1].tbr_ids);
 assert.deepEqual(result.books[2],before[2]);assert.equal(correctedBooks(result.books).changed,false);
 result.books[0].owned=false;assert.equal(correctedBooks(result.books).books[0].owned,false,'later owner changes are not reasserted on startup');
 const incoming=result.books.map(({applied_corrections,...book})=>book);assert.deepEqual(mergeLibrarySave(result.books,incoming)[0].applied_corrections,result.books[0].applied_corrections);
});
test('Correction backup failure prevents any database write',async()=>{
 let writes=0;await assert.rejects(applyConfirmedCorrections({db:async method=>{if(method==='PATCH')writes++;return [{revision:1,books:correctionsFixture()}];},backup:{preserve:async()=>{throw Error('Backup failed');}}}),/Backup failed/);assert.equal(writes,0);
});
test('Ownership correction retries concurrent favorite changes from fresh state',async()=>{
 let row={revision:1,books:correctionsFixture()},attempts=0,backups=[];
 const result=await applyConfirmedCorrections({backup:{preserve:async r=>{backups.push(r.revision);return {backup_verified:true};},receipt:async()=>{}},db:async(method,query,body)=>{if(method==='GET')return [structuredClone(row)];if(!attempts++){row.revision++;row.books[2].favorite=true;return [];}row={...row,...body};return [row];}});
 assert.deepEqual(backups,[1,2]);assert.equal(result.state,'applied');assert.equal(row.books[2].favorite,true);
});
const catalogue={books:[{id:'t1',book_id:'1',title:'Book edition',author:'Writer',sources:['online'],sightings:[1]},{id:'t2',book_id:'1',title:'Book',author:'Writer',sources:['bookshops'],sightings:[2]},{id:'t3',book_id:'v2',title:'Volume 2',author:'Editor',sources:['online']},{id:'t4',book_id:'new',title:'Other',author:'Other',sources:['online']}]};
const plan={version:'test',activate:true,library_memberships:3,expected_library:{'1':{title:'Book',author:'Writer'}},series_expansion:{parent_id:'set',expected_title:'Set',volumes:[{id:'v1',title:'Volume 1',author:'Editor',volume:1},{id:'v2',title:'Volume 2',author:'Editor',volume:2}]}};
test('One underlying book retains every source membership; series preserves full original',()=>{
 const {books}=reconcileRecords(original,catalogue,plan,['t4']);
 assert.equal(books.length,5);assert.equal(books.filter(b=>b.library_member!==false).length,3);
 assert.deepEqual(books.find(b=>b.id==='set').series_original_record,original[1]);
 assert.equal(books.find(b=>b.id==='v1').read_status,'read');assert.equal(books.find(b=>b.id==='v2').read_status,'unread');
 assert.ok(books.filter(b=>b.id.startsWith('v')).every(b=>b.owned&&b.rating===0));
 assert.deepEqual(books.find(b=>b.id==='1').discovery_records,catalogue.books.slice(0,2));
 assert.equal(books.find(b=>b.id==='1').description,'Keep this');
 assert.equal(reconcileRecords(books,catalogue,plan,[]).changed,false);
 const projected=projectTbrCatalogue(catalogue,books);
 assert.deepEqual(projected.books.map(b=>b.id),catalogue.books.map(b=>b.id));
 assert.deepEqual(projected.books.map(b=>b.sightings),catalogue.books.map(b=>b.sightings));
 assert.equal(projected.books[0].library_id,'1');assert.equal(projected.books[2].owned,true);
 assert.deepEqual(canonicalFavoriteIds(catalogue,books,[]),['t1','t2','t4']);
 const visible=books.filter(b=>b.library_member!==false).map(b=>({...b,discovery_records:undefined}));
 const saved=mergeLibrarySave(books,visible);assert.equal(saved.length,5);
 assert.deepEqual(saved.find(b=>b.id==='1').discovery_records,books.find(b=>b.id==='1').discovery_records);
 assert.deepEqual(saved.find(b=>b.id==='set'),books.find(b=>b.id==='set'));
});
test('No database write occurs when preservation fails',async()=>{
 let writes=0;await assert.rejects(runBookReconciliation({plan,catalogue,legacyFavorites:async()=>[],db:async method=>{if(method==='PATCH')writes++;return [{revision:1,books:original}];},backup:{preserve:async()=>{throw Error('Backup unavailable');}}}),/Backup unavailable/);assert.equal(writes,0);
});
test('Migration retries a concurrent edit from fresh state',async()=>{
 let row={revision:1,books:structuredClone(original)},writes=0,backups=[];
 const result=await runBookReconciliation({plan,catalogue,legacyFavorites:async()=>[],backup:{preserve:async r=>{backups.push(r.revision);return {backup_verified:true};},receipt:async()=>{}},db:async(method,query,body)=>{if(method==='GET')return [structuredClone(row)];writes++;if(writes===1){row.revision++;row.books[0].notes='Concurrent edit';return [];}assert.ok(query.endsWith('eq.2'));row={...row,...body};return [row];}});
 assert.deepEqual(backups,[1,2]);assert.equal(result.state,'applied');assert.equal(row.books[0].notes,'Concurrent edit');
});
test('Production plan has exactly eight distinct owned volumes and one read volume',async()=>{
 const p=JSON.parse(await readFile(new URL('./library/book-reconciliation.json',import.meta.url),'utf8'));
 assert.equal(p.series_expansion.volumes.length,8);assert.equal(p.series_expansion.read_volume,1);
 assert.equal(new Set(p.series_expansion.volumes.map(b=>b.id)).size,8);
 assert.equal(p.library_memberships,1007);
});
