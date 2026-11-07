import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./library/index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

function harness(){
  const requests=[],messages=[],events={};let snapshot='first edit';
  const context={Promise,window:{CLOUD_LIBRARY:true,addEventListener:(name,fn)=>events[name]=fn},
    document:{body:{classList:{contains:()=>false}},addEventListener:(name,fn)=>events[name]=fn},
    SERVER_MODE:true,serverSaveState:'idle',saveFailed:false,saveTimer:null,
    publicView:()=>false,renderFileStatus(){},serialize:()=>snapshot,toast:message=>messages.push(message),
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
  vm.createContext(context);
  const start=source.indexOf('  var serverRevision=null, serverSaveQueue=Promise.resolve()');
  assert.ok(start>=0,'Use the actual library save queue');
  vm.runInContext(source.slice(start,source.indexOf('  function writeToFile',start)),context);
  context.serverRevision='137';
  vm.runInContext(source.split('\n').find(line=>line.includes('window.addEventListener("beforeunload"')),context);
  const keyboardStart=source.indexOf('  document.addEventListener("keydown",function(e){\n    if(document.body');
  assert.ok(keyboardStart>=0,'Use the actual library keyboard handler');
  vm.runInContext(source.slice(keyboardStart,source.indexOf('  window.addEventListener("scroll"',keyboardStart)),context);
  context.saveNow=()=>context.saveToServer();
  return {context,requests,messages,events,setSnapshot:value=>snapshot=value,
    respond(index,status=200,revision='138'){
      requests[index].resolve({ok:status===200,status,headers:{get:()=>revision},json:async()=>({})});
    },warns(){let warned=false;events.beforeunload({preventDefault(){warned=true;}});return warned;}};
}

test('queued library saves stay pending until the latest snapshot is acknowledged',async()=>{
  const h=harness();h.context.saveToServer();h.setSnapshot('second edit');h.context.saveToServer();
  await turn();assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.body,'first edit');
  assert.equal(h.requests[0].options.headers['X-Library-Revision'],'137');assert.ok(h.warns());
  h.respond(0);await turn();
  assert.equal(h.requests.length,2);assert.equal(h.requests[1].options.body,'second edit');
  assert.equal(h.requests[1].options.headers['X-Library-Revision'],'138');
  assert.equal(h.context.serverSaveState,'saving');assert.ok(h.warns());
  h.respond(1,200,'139');await h.context.serverSaveQueue;
  assert.equal(h.context.serverRevision,'139');assert.equal(h.context.serverSaveState,'saved');assert.equal(h.warns(),false);
});

test('TBR favorites share the library revision queue and update the underlying book',async()=>{
  const h=harness(),book={id:'one',favorite:false};
  Object.assign(h.context,{libraryReady:Promise.resolve(true),findBook:()=>book,refreshFavoriteControls(){},announceCanonicalFavorite(){}});
  h.context.saveToServer();
  const favorite=h.context.window.saveMembershipFavorite('tbr-one',true,'one');
  await turn();assert.equal(h.requests.length,1);assert.equal(book.favorite,true);
  h.respond(0);await turn();assert.equal(h.requests.length,2);
  assert.equal(h.requests[1].url,'/api/tbr-favorites');assert.equal(h.requests[1].options.headers['X-Library-Revision'],'138');
  h.respond(1,200,'139');await favorite;await h.context.serverSaveQueue;assert.equal(h.context.serverRevision,'139');
});

test('a later full snapshot can recover an earlier network failure',async()=>{
  const h=harness();h.context.saveToServer();h.setSnapshot('second edit');h.context.saveToServer();
  await turn();h.requests[0].reject(new Error('offline'));await turn();
  assert.equal(h.requests.length,2);assert.equal(h.requests[1].options.headers['X-Library-Revision'],'137');
  assert.equal(h.context.serverSaveState,'saving');assert.ok(h.warns());
  h.respond(1);await h.context.serverSaveQueue;
  assert.equal(h.context.serverSaveState,'saved');assert.equal(h.warns(),false);
});

test('failure of the latest snapshot keeps the exit warning after earlier success',async()=>{
  const h=harness();h.context.saveToServer();h.context.saveToServer();await turn();
  h.respond(0);await turn();h.respond(1,503);await h.context.serverSaveQueue;
  assert.equal(h.context.serverSaveState,'error');assert.ok(h.warns());assert.equal(h.context.serverRevision,'138');
});

test('a conflict prevents queued snapshots from overwriting another session',async()=>{
  const h=harness();h.context.saveToServer();h.context.saveToServer();await turn();
  h.respond(0,409);await h.context.serverSaveQueue;
  assert.equal(h.requests.length,1);assert.equal(h.context.serverRevision,null);
  assert.equal(h.context.serverSaveState,'error');assert.ok(h.warns());
});

test('Ctrl+S reports pending work rather than claiming an unacknowledged save',async()=>{
  const h=harness();let prevented=false;
  h.events.keydown({ctrlKey:true,key:'s',target:{tagName:'BODY'},preventDefault(){prevented=true;}});
  await turn();assert.ok(prevented);assert.equal(h.requests.length,1);
  assert.equal(h.messages[0],'Saving changes…');assert.ok(h.warns());
  h.respond(0);await h.context.serverSaveQueue;
});
