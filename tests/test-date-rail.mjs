// Execute the actual archive script with controlled row/scroll geometry.
// This models hidden button flow and native scroll clamping, not browser layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(process.env.DATE_RAIL_SOURCE_FILE||new URL('../public/date-rail.js',import.meta.url),'utf8');
const compiled=source.replace('export function createDateRail','function createDateRail')+'\nglobalThis.createDateRail=createDateRail;';
const months=['2026-12','2026-11','2026-10','2026-09','2025-12','2024-12','2024-11','2024-10','2023-12','2022-12','2021-12'];
const dataset=new Map(months.map((key,index)=>[key,index+1]));

function classList(initial=''){
  const names=new Set(initial.split(/\s+/).filter(Boolean));
  return {contains:name=>names.has(name),add:name=>names.add(name),remove:name=>names.delete(name),
    toggle(name,on){const enabled=on===undefined?!names.has(name):on;if(enabled)names.add(name);else names.delete(name);return enabled;}};
}

function matches(element,selector){
  for(const [,excluded] of selector.matchAll(/:not\(([^)]+)\)/g))if(matches(element,excluded))return false;
  const positive=selector.replace(/:not\([^)]+\)/g,'');
  const tag=positive.match(/^([a-z]+)/i)?.[1];if(tag&&element.tagName!==tag.toUpperCase())return false;
  for(const [,name] of positive.matchAll(/\.([\w-]+)/g))if(!element.classList.contains(name))return false;
  for(const [,name,operator,value] of positive.matchAll(/\[([\w-]+)(?:(\^?=)["']([^"']*)["'])?\]/g)){
    const actual=name==='data-date'?element.dataset.date:element.attributes[name];
    if(actual===undefined)return false;if(operator==='='&&actual!==value)return false;
    if(operator==='^='&&!actual.startsWith(value))return false;
  }
  return true;
}

function fixture({trackHeight=140,reducedMotion=false,scrollHeight}={}){
  const windowListeners={},raf=[],jumps=[];let rail,reads=0;
  const content={getBoundingClientRect:()=>({left:240})};
  function target(key,heading=false){
    return {dataset:heading?{blogMonth:key}:{month:key},hidden:false,rect:{top:-200,bottom:-100},
      getBoundingClientRect(){reads++;return this.rect;},
      scrollIntoView(options){jumps.push({key,heading,...options});}};
  }
  const rows=months.map(key=>target(key)),headings=months.map(key=>target(key,true));
  function makeRail(){
    const properties=new Map();
    const element={hidden:true,attributes:{},listeners:{},
      style:{setProperty:(key,value)=>properties.set(key,String(value)),getPropertyValue:key=>properties.get(key)||''},
      setAttribute(name,value){this.attributes[name]=value;},
      addEventListener(type,listener){this.listeners[type]=listener;},
      querySelector(selector){
        const mapped={'.date-track':this.track,'[data-rail-year]':this.year,'.date-month':this.month,'.date-count':this.count,select:this.select,'.mobile-month':this.select};
        return mapped[selector]||this.buttons?.find(button=>matches(button,selector))||null;
      },
      querySelectorAll(selector){return this.buttons.filter(button=>matches(button,selector));}};
    Object.defineProperty(element,'innerHTML',{set(html){
      let scroll=0;
      const track={viewportHeight:trackHeight,writes:[],
        get clientHeight(){return this.viewportHeight;},
        get scrollHeight(){return element.buttons.reduce((height,button)=>height+button.offsetHeight,0);},
        get scrollTop(){return Math.max(0,Math.min(scroll,this.scrollHeight-this.clientHeight));},
        set scrollTop(value){this.writes.push(value);scroll=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));},
        querySelector:selector=>element.buttons.find(button=>matches(button,selector))||null,
        querySelectorAll:selector=>element.buttons.filter(button=>matches(button,selector)),
        getBoundingClientRect:()=>({top:0,bottom:track.clientHeight})};
      element.track=track;
      element.buttons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match,index)=>{
        const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([,name,value])=>[name,value]));
        const button={tagName:'BUTTON',dataset:{date:attrs['data-date']},attributes:attrs,hidden:false,
          classList:classList(attrs.class),textContent:match[2],parentElement:track,
          setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},
          get offsetHeight(){return this.hidden?0:this.classList.contains('month-tick')?28:30;},
          get offsetTop(){return element.buttons.slice(0,index).reduce((height,item)=>height+item.offsetHeight,0);},
          getBoundingClientRect(){return {top:this.offsetTop-track.scrollTop,bottom:this.offsetTop-track.scrollTop+this.offsetHeight};},
          matches(selector){return matches(this,selector);},closest(selector){return this.matches(selector)?this:null;}};
        return button;
      });
      element.year={textContent:''};element.month={textContent:''};element.count={textContent:''};
      element.select={tagName:'SELECT',classList:classList('mobile-month'),dataset:{},attributes:{},value:'',matches(selector){return matches(this,selector);}};
    }});
    return element;
  }
  const document={activeElement:null,body:{append(element){rail=element;}},
    createElement:()=>makeRail(),querySelector:()=>content,
    documentElement:scrollHeight===undefined?undefined:{scrollHeight}};
  const win={scrollY:0,addEventListener(type,listener){(windowListeners[type]??=[]).push(listener);}};
  const context=vm.createContext({document,innerHeight:800,
    window:win,
    requestAnimationFrame(callback){raf.push(callback);return raf.length;},
    matchMedia:()=>({matches:reducedMotion})});
  vm.runInContext(compiled,context);
  const app=context.createDateRail(rows,headings);
  const f={app,rows,headings,jumps,document,raf,win,
    get rail(){return rail;},get track(){return rail.track;},get reads(){return reads;},resetReads(){reads=0;},
    monthButton:key=>rail.buttons.find(button=>button.dataset.date===key&&button.classList.contains('month-tick')),
    yearButton:year=>rail.buttons.find(button=>button.dataset.date.startsWith(year)&&!button.classList.contains('month-tick')),
    focus(key){for(const row of rows)row.rect=row.dataset.month===key?{top:390,bottom:410}:{top:-200,bottom:-100};},
    emit(type){for(const listener of windowListeners[type]||[])listener({type});},
    flush(){const callbacks=raf.splice(0);for(const callback of callbacks)callback();},
    rebuild(counts=dataset){for(const row of rows)row.hidden=!counts.has(row.dataset.month);for(const h of headings)h.hidden=!counts.has(h.dataset.blogMonth);app.rebuild(counts);},
    select(key){this.focus(key);this.emit('scroll');this.flush();}};
  f.focus(months[0]);f.rebuild();return f;
}

test('archive reserves capacity for the largest year throughout the filtered collection',()=>{
  const f=fixture();
  const size=()=>[f.rail.style.getPropertyValue('--archive-year-count'),f.rail.style.getPropertyValue('--archive-month-count')];
  assert.deepEqual(size(),['6','4']);
  f.select('2025-12');assert.deepEqual(size(),['6','4']);
  assert.equal(f.rail.buttons.filter(button=>button.classList.contains('month-tick')&&!button.hidden).length,1);
  f.select('2024-11');assert.deepEqual(size(),['6','4']);
  const subset=new Map([['2025-12',2],['2024-11',3],['2024-10',1]]);
  f.rebuild(subset);assert.deepEqual(size(),['2','2']);
});

test('changing years preserves the entering year header position when scroll range allows it',()=>{
  const f=fixture();f.track.scrollTop=120;
  const header=f.yearButton('2025'),before=header.offsetTop-f.track.scrollTop;
  assert.equal(before,22);
  f.select('2025-12');
  assert.equal(header.offsetTop-f.track.scrollTop,before);
  assert.equal(f.track.scrollTop,8);
  const active=f.monthButton('2025-12');
  assert.ok(active.offsetTop>=f.track.scrollTop);
  assert.ok(active.offsetTop+active.offsetHeight<=f.track.scrollTop+f.track.clientHeight);
});

test('a clipped active month scrolls only far enough to reveal its hidden edge',()=>{
  const f=fixture({trackHeight:100});f.track.scrollTop=0;
  f.select('2026-09');assert.equal(f.track.scrollTop,42);
  f.select('2026-12');assert.equal(f.track.scrollTop,30);
});

test('a visible active month in the same year does not move the archive track',()=>{
  const f=fixture({trackHeight:100});f.track.scrollTop=30;f.track.writes.length=0;
  f.select('2026-10');
  assert.equal(f.track.scrollTop,30);assert.equal(f.track.writes.length,0);
  assert.equal(f.monthButton('2026-10').attributes['aria-current'],'date');
  assert.equal(f.monthButton('2026-12').attributes['aria-current'],undefined);
});

test('scroll updates coalesce into one animation frame and one visible-row scan',()=>{
  const f=fixture();f.resetReads();f.focus('2025-12');
  for(let i=0;i<8;i++)f.emit('scroll');
  assert.equal(f.raf.length,1);assert.equal(f.reads,0);
  f.flush();assert.equal(f.reads,f.rows.length);assert.equal(f.rail.select.value,'2025-12');
  f.emit('scroll');assert.equal(f.raf.length,1);f.flush();assert.equal(f.raf.length,0);
});

test('gaps and the footer retain the last selected date instead of jumping to the first year',()=>{
  const f=fixture();f.select('2024-11');
  const saved=[f.rail.year.textContent,f.rail.month.textContent,f.rail.count.textContent,f.track.scrollTop];
  for(const rect of [{top:-200,bottom:-100},{top:900,bottom:1000}]){
    for(const row of f.rows)row.rect=rect;
    f.emit('scroll');f.flush();
    assert.deepEqual([f.rail.year.textContent,f.rail.month.textContent,f.rail.count.textContent,f.track.scrollTop],saved);
    assert.equal(f.rail.select.value,'2024-11');
  }
});

test('empty and filtered rebuilds discard stale selections and choose an available month',()=>{
  const f=fixture();f.select('2025-12');f.emit('scroll');
  f.rebuild(new Map());assert.equal(f.rail.hidden,true);f.flush();
  f.focus(null);f.rebuild(new Map([['2024-11',1]]));
  assert.equal(f.rail.hidden,false);assert.equal(f.rail.select.value,'2024-11');
  assert.equal(f.rail.year.textContent,'2024');assert.equal(f.rail.month.textContent,'November');
  assert.equal(f.rail.count.textContent,'1 post');
  assert.deepEqual(f.rail.buttons.filter(button=>button.classList.contains('active')).map(button=>button.dataset.date),['2024-11']);
});

test('resizing reveals the selected month even when its date has not changed',()=>{
  const f=fixture();f.select('2026-09');
  f.track.viewportHeight=60;f.emit('resize');f.flush();
  assert.equal(f.rail.select.value,'2026-09');assert.equal(f.track.scrollTop,82);
});

test('archive clicks and the native picker target visible entries and honor reduced motion',()=>{
  const normal=fixture();normal.rail.listeners.click({target:normal.monthButton('2024-11')});
  assert.deepEqual(normal.jumps,[{key:'2024-11',heading:true,block:'start',behavior:'smooth'}]);
  const reduced=fixture({reducedMotion:true});
  reduced.headings.find(heading=>heading.dataset.blogMonth==='2025-12').hidden=true;
  reduced.rail.select.value='2025-12';reduced.rail.listeners.change({target:reduced.rail.select});
  assert.deepEqual(reduced.jumps,[{key:'2025-12',heading:false,block:'start',behavior:'auto'}]);
  reduced.rail.listeners.click({target:reduced.yearButton('2024')});
  assert.deepEqual(reduced.jumps[1],{key:'2024-12',heading:true,block:'start',behavior:'auto'});
});

test('the first and last entries become current at the top and bottom of the page',()=>{
  const f=fixture({scrollHeight:3000});
  // Three entries in view: the centre one is nearest the viewport middle, but the page is at its top.
  const place=(top)=>{f.rows.forEach(row=>row.rect={top:-200,bottom:-100});[['2026-12',150],['2026-11',360],['2026-10',600]].forEach(([key,y])=>{f.rows.find(r=>r.dataset.month===key).rect={top:y-top,bottom:y-top+140};});};
  f.win.scrollY=0;place(0);f.emit('scroll');f.flush();assert.equal(f.rail.select.value,'2026-12');
  f.win.scrollY=600;place(0);f.emit('scroll');f.flush();assert.equal(f.rail.select.value,'2026-11');
  f.win.scrollY=2200;place(0);f.emit('scroll');f.flush();assert.equal(f.rail.select.value,'2026-10');
});
