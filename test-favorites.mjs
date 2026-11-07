import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./library/index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function section(start,end){const a=source.indexOf(start);assert.ok(a>=0,start);const b=source.indexOf(end,a);assert.ok(b>a,end);return source.slice(a,b);}
function harness(visitor=false){
 const c={WeakMap,JSON,has:Object.prototype.hasOwnProperty,STATUSES:['read','reading','next','unread','paused'],uid:()=> 'new',num:v=>parseInt(v,10),publicView:()=>visitor,esc:s=>String(s??'').replace(/"/g,'&quot;'),state:{books:[]},ui:{status:'all'},saveNow(){c.saves++},refreshCounts(){c.counts++},renderView(){c.renders++},refreshBookEls(){c.refreshes++},saves:0,counts:0,renders:0,refreshes:0,searchTerms:()=>[],passes:()=>true,sortList:()=>{},facets:{},fmtYear:v=>v,splitTitle:v=>[v],ariaFor:b=>b.title,coverHTML:()=>'<img class="cv-img">',readHTML:()=>'',starsHTML:()=>'',searchTerms:()=>[]};vm.createContext(c);
 vm.runInContext(section('  var originalBooks=new WeakMap();','  var byId='),c);
 vm.runInContext(section('  function serialize(){','  function scheduleSave'),c);
 vm.runInContext(section('  function emptyFacets(){','  function cmp('),c);
 vm.runInContext(section('  function favoriteHTML(','  function starLine('),c);
 return c;
}
test('legacy books serialize exactly; toggling changes only favorite and persists on reload',()=>{
 const c=harness(),raw={id:'1',title:'Book',rating:4,notes:'Original notes',custom:{a:1}};
 c.state.books=[c.normalize(raw)];assert.deepEqual(JSON.parse(c.serialize()),[raw]);
 c.toggleFavorite(c.state.books[0]);assert.deepEqual(JSON.parse(c.serialize()),[{...raw,favorite:true}]);assert.equal(c.saves,1);
 c.state.books=JSON.parse(c.serialize()).map(c.normalize);assert.equal(c.state.books[0].favorite,true);
 c.toggleFavorite(c.state.books[0]);assert.deepEqual(JSON.parse(c.serialize()),[{...raw,favorite:false}]);
});
test('owner buttons expose pressed state and frame only selected covers',()=>{
 const c=harness();for(const favorite of [false,true]){const b=c.normalize({id:'1',title:'Book',rating:4,favorite});const html=c.tileHTML(b,false);assert.match(html,new RegExp('aria-pressed="'+favorite+'"'));assert.equal(html.includes('class="tile is-favorite"'),favorite);assert.match(html,/favorite-overlay/);}
});
test('visitors see favorite badges, never mutation controls, and cannot toggle',()=>{
 const c=harness(true),b=c.normalize({id:'1',title:'Book',rating:4,favorite:true});
 assert.match(c.favoriteHTML(b,true),/role="img"/);assert.doesNotMatch(c.favoriteHTML(b,true),/<button|data-act/);
 assert.equal(c.favoriteHTML({...b,favorite:false},true),'');c.toggleFavorite(b);assert.equal(b.favorite,true);assert.equal(c.saves,0);
});
test('Favorites filters the current reading status and updates after removal',()=>{
 const c=harness();c.state.books=[{id:'1',read_status:'read',favorite:true},{id:'2',read_status:'unread',favorite:true},{id:'3',read_status:'read',favorite:false}];c.ui.favorites=true;
 assert.deepEqual(Array.from(c.getView(),b=>b.id),['1','2']);assert.equal(c.facets.favorites,2);assert.equal(c.facets.all,2);c.ui.status='read';assert.deepEqual(Array.from(c.getView(),b=>b.id),['1']);c.ui.status='unread';assert.deepEqual(Array.from(c.getView(),b=>b.id),['2']);c.ui.status='all';
 c.toggleFavorite(c.state.books[0]);assert.equal(c.renders,1);assert.deepEqual(Array.from(c.getView(),b=>b.id),['2']);
});
test('keyboard handler leaves native heart-button activation to the button',()=>{
 const handler=section('  content.addEventListener("keydown"','  content.addEventListener("click"');let listener,opened=0;
 vm.runInNewContext(handler,{content:{addEventListener:(_,fn)=>listener=fn},openDrawer:()=>opened++});
 for(const key of ['Enter',' '])listener({key,target:{matches:()=>false},preventDefault(){throw Error('button keyboard intercepted')}});
 assert.equal(opened,0);
});
