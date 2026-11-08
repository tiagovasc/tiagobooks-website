import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {layoutGuard} from '../src/lib/layout-ready.mjs';
function fixture(path='/'){
  const classes=new Set(),frames=[],timers=new Map(),listeners={},windowListeners={};let seq=0,resizes=0;
  const root={dataset:{},classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}}};
  const context={location:{pathname:path},document:{documentElement:root,readyState:'loading',addEventListener:(name,fn)=>listeners[name]=fn},window:{addEventListener:(name,fn)=>windowListeners[name]=fn,dispatchEvent(){resizes++;}},Event,setTimeout(fn,ms){timers.set(++seq,{fn,ms});return seq;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(fn){frames.push(fn);}};
  vm.createContext(context);vm.runInContext('('+layoutGuard.toString()+')()',context);
  return {context,classes,frames,timers,root,listeners,windowListeners,get resizes(){return resizes;},flush(){frames.splice(0).forEach(fn=>fn());}};
}
test('static pages reveal together after deferred widgets and final geometry',()=>{
  const f=fixture('/pages/talks');assert(f.classes.has('layout-pending'));
  f.listeners.DOMContentLoaded();f.flush();assert.equal(f.resizes,1);assert(f.classes.has('layout-pending'));
  f.flush();assert.equal(f.root.dataset.layoutReady,'true');assert.equal(f.timers.size,0);
});
test('Library waits for a complete preview or fresh frame, not for individual images',()=>{
  const f=fixture('/library');f.listeners.DOMContentLoaded();f.flush();assert(f.classes.has('layout-pending'));assert.equal(f.resizes,0);
  f.context.window.SiteLayout.ready();f.flush();f.flush();assert.equal(f.root.dataset.layoutReady,'true');
});
test('warm Library frame cannot reveal before deferred source controls exist',()=>{
  const f=fixture('/library');f.context.window.SiteLayout.ready();f.flush();assert(f.classes.has('layout-pending'));
  f.listeners.DOMContentLoaded();f.flush();f.flush();assert.equal(f.root.dataset.layoutReady,'true');
});
test('failed initialization has a bounded fallback and back/forward never stays hidden',()=>{
  const f=fixture('/library');[...f.timers.values()].find(t=>t.ms===400).fn();assert(f.classes.has('layout-waiting'));
  [...f.timers.values()].find(t=>t.ms===2400).fn();assert.equal(f.root.dataset.layoutReady,'true');assert.equal(f.timers.size,0);
  const b=fixture('/');b.windowListeners.pageshow({persisted:true});assert.equal(b.root.dataset.layoutReady,'true');
});
