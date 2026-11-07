import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceBooks,catalogueCounts,filterCatalogue,collectionGroups,sortOptions} from './tbr.js';
import {tbrHref,tbrLabel} from '../src/lib/catalogue-search.mjs';

const sightings=[
  {visit_id:'new',city:'London',bookshop:'Watkins',photographed_at:'2026-10-29T12:00:00Z'},
  {visit_id:'old',city:'Porto',bookshop:'Old shop',photographed_at:'2021-01-01T12:00:00Z'},
];
const books=[
  {id:'shared',title:'Shared Work',author:'Author One',description:'A study of consciousness',sources:['bookshops','online'],sightings,online_order:3},
  {id:'shop',title:'Bookshop Work',author:'Author Two',sources:['bookshops'],sightings:[{visit_id:'middle',city:'Porto',bookshop:'Old shop',photographed_at:'2025-01-01T12:00:00Z'}]},
  {id:'online',title:'An Online Work',author:'Author Three',sources:['online'],sightings:[],online_order:1},
  {id:'unknown',title:'Untitled Author Work',author:'',sources:['online'],sightings:[],online_order:2},
];

test('shared works count once globally and belong to both source views',()=>{
  assert.deepEqual(catalogueCounts(books),{total:4,bookshops:2,instagram:0,online:3});
  assert.deepEqual(sourceBooks(books,'online').map(b=>b.id),['shared','online','unknown']);
  assert.deepEqual(sourceBooks(books,'bookshops').map(b=>b.id),['shared','shop']);
  assert.deepEqual(sourceBooks(books,'instagram'),[]);
  assert.deepEqual(sourceBooks([{id:'legacy',sightings}], 'bookshops').map(b=>b.id),['legacy']);
});

test('Online fallback order retains approved ordering without inventing missing places',()=>{
  const before=JSON.stringify(books);
  assert.deepEqual(filterCatalogue(books,{source:'online'}).map(b=>b.id),['online','unknown','shared']);
  assert.deepEqual(filterCatalogue(books,{source:'online',sort:'oldest'}).map(b=>b.id),['shared','unknown','online']);
  assert.deepEqual(filterCatalogue(books,{source:'online',sort:'title'}).map(b=>b.id),['online','shared','unknown']);
  assert.deepEqual(filterCatalogue(books,{source:'online',sort:'author'}).map(b=>b.id),['unknown','shared','online']);
  assert.equal(JSON.stringify(books),before);
  const groups=collectionGroups(filterCatalogue(books,{source:'online'}),'online');
  assert.equal(groups.length,1);
  assert.equal(groups[0].place,undefined);
  assert.deepEqual(sortOptions('online').slice(0,2),[['recent','Newest saved'],['oldest','Oldest saved']]);
});

test('Online search finds every source member, including shared works, without requiring sightings',()=>{
  assert.deepEqual(filterCatalogue(books,{source:'online',query:'online three'}).map(b=>b.id),['online']);
  assert.deepEqual(filterCatalogue(books,{source:'online',query:'consciousness'}).map(b=>b.id),['shared']);
  assert.deepEqual(filterCatalogue(books,{source:'online',query:'no match'}),[]);
  assert.deepEqual(filterCatalogue(books,{source:'online',query:'Watkins'}),[]);
  assert.deepEqual(filterCatalogue(books,{source:'instagram'}),[]);
});

test('bookshop filtering keeps original visit history and chronological grouping',()=>{
  const before=JSON.stringify(books);
  const all=filterCatalogue(books,{source:'bookshops'});
  assert.deepEqual(all.map(b=>b.id),['shared','shop']);
  assert.deepEqual(filterCatalogue(books,{source:'bookshops',city:'Porto'}).map(b=>b.id),['shop','shared']);
  assert.equal(filterCatalogue(books,{source:'bookshops',city:'Porto',shop:'Watkins'}).length,0);
  assert.deepEqual(filterCatalogue(books,{source:'bookshops',query:'shared porto'}).map(b=>b.id),['shared']);
  assert.equal(collectionGroups(all,'bookshops').length,2);
  assert.equal(collectionGroups(all,'bookshops','title').length,1);
  assert.equal(JSON.stringify(books),before);
});

test('Instagram has independent source ordering, one shared identity and appropriate search links',()=>{
  const all=[{...books[0],sources:['bookshops','online','instagram'],instagram_order:2},
    {...books[2],sources:['online','instagram'],instagram_order:3},
    {id:'ig-only',title:'Instagram Discovery',author:'',description:'Needle',cover:'',sources:['instagram'],sightings:[],instagram_order:1}];
  assert.deepEqual(catalogueCounts(all),{total:3,bookshops:1,instagram:3,online:2});
  assert.deepEqual(filterCatalogue(all,{source:'instagram'}).map(b=>b.id),['ig-only','shared','online']);
  assert.deepEqual(filterCatalogue(all,{source:'instagram',sort:'oldest'}).map(b=>b.id),['online','shared','ig-only']);
  assert.deepEqual(filterCatalogue(all,{source:'instagram',query:'needle'}).map(b=>b.id),['ig-only']);
  assert.equal(collectionGroups(all,'instagram')[0].place,undefined);
  assert.match(tbrHref(all[0]),/source=bookshops/);
  assert.match(tbrHref(all[1]),/source=online/);
  assert.match(tbrHref(all[2]),/source=instagram/);assert.equal(tbrLabel(all[2]),'Instagram');
});
