import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {applyOperations} from '../library/sync-operations.mjs';
test('paused intent sync is versioned, idempotent and does not change reading history',()=>{
  const before=[{id:'a',title:'Book',read_status:'paused',date_read:'',favorite:true,notes:'keep'}];
  const op={id:'pause-return-0001',book_id:'a',field:'pause_plan',before:null,before_present:false,before_version:null,present:true,value:'return'};
  const after=applyOperations(before,[op]);assert.equal(after.results[0].status,'accepted');assert.equal(after.books[0].pause_plan,'return');assert.equal(after.books[0].favorite,true);assert.equal(after.books[0].read_status,'paused');assert.equal(after.books[0].notes,'keep');
  assert.equal(applyOperations(after.books,[op]).changed,false);
  assert.throws(()=>applyOperations(before,[{...op,value:'arbitrary'}]));
});
test('Paused groups distinguish intentions without changing other sections',()=>{
  const html=readFileSync(new URL('../library/index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('  function groupOf(b){'),html.indexOf('  var NONE_LABEL='));
  const context={ui:{status:'paused',sort:'dateread'},queueRank:b=>b.date_read?2:3};vm.createContext(context);vm.runInContext(source,context);
  assert.equal(context.groupOf({pause_plan:'return'}),'~pause_return');assert.equal(context.groupOf({pause_plan:'unfinished'}),'~pause_unfinished');assert.equal(context.groupOf({}),'~pause_other');
  context.ui.status='read';assert.equal(context.groupOf({date_read:'2026-11-08',pause_plan:'return'}),'2026-11');
});
