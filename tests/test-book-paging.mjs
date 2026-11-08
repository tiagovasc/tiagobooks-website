import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../library/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('  function bookRowBatch('),html.indexOf('  window.bookColumns='));
function fixture(){
  const timers=new Map();let seq=0,appends=0,near=false,active=true,images=[];
  const context={setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);},Promise};
  vm.createContext(context);vm.runInContext(source,context);
  const pager=context.createBookPager({active:()=>active,more:()=>appends<10,near:()=>near,images:()=>images,append(){appends++;images=[];}});
  return {context,pager,timers,get appends(){return appends;},set near(v){near=v;},set active(v){active=v;},set images(v){images=v;}};
}
class Image extends EventTarget {complete=false;loading='lazy';}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('four responsive rows respect group boundaries and small result sets',()=>{
  const {context:c}=fixture(),list=Array.from({length:100},(_,i)=>({group:i<2?'a':'b'}));
  assert.equal(c.bookRowBatch(list,0,6,b=>b.group),20);
  assert.equal(c.bookRowBatch(list,0,2),8);
  assert.equal(c.bookRowBatch(list,0,1),4);
  assert.equal(c.bookRowBatch(list,98,6),2);
  assert.equal(c.bookRowBatch([],0,6),0);
});
test('warm batch waits for all first covers and then stops away from bottom',async()=>{
  const f=fixture(),a=new Image(),b=new Image();f.images=[a,b];f.pager.start(true);
  assert.equal(a.loading,'eager');assert.equal(f.appends,0);
  a.dispatchEvent(new Event('load'));assert.equal(f.appends,0);
  b.dispatchEvent(new Event('error'));await tick();assert.equal(f.appends,1);
  f.pager.check();assert.equal(f.appends,1);assert.equal(f.timers.size,0);
  f.near=true;f.pager.check();assert.equal(f.appends,2);f.near=false;await tick();
});
test('timeout allows one warm batch even with a stalled image',async()=>{
  const f=fixture(),a=new Image();f.images=[a];f.pager.start(true);
  [...f.timers.values()][0]();await tick();assert.equal(f.appends,1);
  a.dispatchEvent(new Event('load'));assert.equal(f.appends,1);
});
test('filter reset invalidates pending image and cached-image callbacks',async()=>{
  const f=fixture(),a=new Image();f.images=[a];f.pager.start(true);f.pager.reset();
  a.dispatchEvent(new Event('load'));await tick();assert.equal(f.appends,0);assert.equal(f.timers.size,0);
  f.images=[];f.pager.start(true);f.pager.reset();await tick();assert.equal(f.appends,0);
});
test('inactive sections cannot append and preserving a view does not rewarm it',async()=>{
  const f=fixture();f.pager.start(false);await tick();assert.equal(f.appends,0);
  f.pager.start(true);f.active=false;await tick();assert.equal(f.appends,0);
});
