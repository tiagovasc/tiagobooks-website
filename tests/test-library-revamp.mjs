import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/library-revamp.js',import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(source,context);
const {topics,matches}=context.window.LibraryRevamp;
test('browse topics normalize display-only values and exclude reading and acquisition bookkeeping',()=>{
 const book={tags:['Philosophy','Manga','manga','Unfinished','Not completed','owned_unread','audiobooks','London trip']};
 const before=JSON.stringify(book);
 assert.deepEqual([...new Set(topics(book))],['philosophy','manga']);assert.equal(JSON.stringify(book),before);
});
test('combined topic, format, rating and year filters use the actual book fields',()=>{
 const b={tags:['Philosophy'],format:'Paperback',rating:5,date_read:'2020-02-01'};
 const ui={topic:'philosophy',format:'paperback',rating:'5',year:'2020'};
 assert.equal(matches(b,ui),true);
 for(const patch of [{topic:'history'},{format:'ebook'},{year:'2021'}])assert.equal(matches(b,{...ui,...patch}),false);
 assert.equal(matches({...b,rating:4},ui),false);
});
test('a failed visitor library load keeps a retry path and never suggests adding a book',()=>{
 const html=readFileSync(new URL('../library/index.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('  function showLoadError(){'),html.indexOf('  // Source of truth is the stored library'));
 assert.ok(fn.startsWith('  function showLoadError(){'));
 const elements={empty:{},loadmore:{},retryLoad:{addEventListener(type,fn){this[type]=fn}}};
 const content={removeAttribute(){},setAttribute(){}};let ready=0,retried=0;
 vm.runInNewContext(fn+';showLoadError();',{content,$:id=>elements[id],window:{SiteLayout:{ready(){ready++}}},loadLibrary(){retried++}});
 assert.match(content.innerHTML,/did not load/);assert.doesNotMatch(content.innerHTML,/Add a book|Your library is empty/);
 assert.equal(elements.empty.hidden,true);assert.equal(ready,1);elements.retryLoad.click();assert.equal(retried,1);assert.match(content.innerHTML,/Loading the library/);
});
