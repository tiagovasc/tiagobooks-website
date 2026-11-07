import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

const source=readFileSync(new URL('../src/pages/editor.astro',import.meta.url),'utf8');
const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];
const compiled=transformSync(script+'\nglobalThis.state=()=>({revision,current,remote,dirty,busy,loaded});',{loader:'ts',format:'esm'}).code;
const turn=()=>new Promise(resolve=>setImmediate(resolve));

function harness(){
  const nodes={},requests=[],events={};let allow=true;
  for(const id of ['status','entry','new-entry','kind','slug','build','markdown','save','publish-help','editor','retry-load']){
    nodes[id]={value:'',disabled:false,hidden:id==='retry-load',options:[],events:{},
      addEventListener(name,fn){this.events[name]=fn;},append(node){this.options.push(node);}};
  }
  nodes.kind.value='posts';
  const context={document:{getElementById:id=>nodes[id],createElement:()=>({})},
    window:{addEventListener:(name,fn)=>events[name]=fn},confirm:()=>allow,
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
  vm.createContext(context);vm.runInContext(compiled,context);
  return {context,nodes,requests,events,confirm(value){allow=value;},
    respond(index,data,status=200){requests[index].resolve({ok:status<400,json:async()=>data});},
    warns(){let warned=false;events.beforeunload({preventDefault(){warned=true;}});return warned;}};
}

for(const mode of ['local','github']){
  test(`${mode} editor preserves unsaved text through interrupted loads, expired sessions and retries`,async()=>{
    const h=harness();assert.ok(h.context.state().busy);assert.ok(h.warns());
    h.respond(0,{mode,files:['posts/a.md','posts/b.md']});await turn();
    assert.equal(h.nodes.save.textContent,mode==='github'?'Publish changes':'Save locally');
    assert.equal(h.nodes.build.hidden,mode==='github');
    h.nodes.entry.value='posts/a.md';const load=h.nodes.entry.events.change();
    assert.ok(h.nodes.markdown.disabled);assert.ok(h.nodes.entry.disabled);
    h.respond(1,{revision:'old',text:'original\r\nbody'});await load;
    h.nodes.markdown.value='edited\nbody';h.nodes.markdown.events.input();
    assert.ok(h.context.state().dirty);assert.ok(h.warns());
    h.confirm(false);h.nodes.entry.value='posts/b.md';await h.nodes.entry.events.change();
    assert.equal(h.requests.length,2);assert.equal(h.nodes.entry.value,'posts/a.md');
    assert.equal(h.nodes.markdown.value,'edited\nbody');
    h.confirm(true);h.nodes.entry.value='posts/b.md';const failedLoad=h.nodes.entry.events.change();
    h.respond(2,{error:'offline'},503);await failedLoad;
    assert.equal(h.context.state().current,'posts/a.md');assert.ok(h.context.state().dirty);
    assert.equal(h.nodes.markdown.value,'edited\nbody');assert.equal(h.nodes['retry-load'].hidden,true);
    const failedSave=h.nodes.editor.events.submit({preventDefault(){}});
    assert.ok(h.nodes.markdown.disabled);assert.ok(h.nodes.entry.disabled);assert.ok(h.warns());
    await h.nodes.editor.events.submit({preventDefault(){}});assert.equal(h.requests.length,4);
    assert.equal(JSON.parse(h.requests[3].options.body).text,'edited\r\nbody');
    h.respond(3,{error:'Sign in again'},401);await failedSave;
    assert.ok(h.context.state().dirty);assert.equal(h.nodes.markdown.value,'edited\nbody');
    assert.equal(h.nodes.markdown.disabled,false);assert.ok(h.warns());
    const retry=h.nodes.editor.events.submit({preventDefault(){}});
    h.respond(4,{revision:'new'});await retry;
    assert.equal(h.context.state().dirty,false);assert.equal(h.context.state().revision,'new');assert.equal(h.warns(),false);
    h.nodes.slug.value='new-post';h.nodes['new-entry'].events.click();
    assert.equal(h.context.state().revision,'new');assert.ok(h.context.state().dirty);
    assert.ok(h.nodes.markdown.value.includes('draft: '+(mode==='github'?'false':'true')));
    const count=h.requests.length;await h.nodes.build.events.click();
    assert.equal(h.requests.length,count);assert.equal(h.nodes.status.textContent,'Save your edits before rebuilding.');
  });

  test(`${mode} editor can retry an initial load failure without refreshing`,async()=>{
    assert.match(source,/<button\b[^>]*type="button"[^>]*id="retry-load"[^>]*hidden/);
    const h=harness();h.respond(0,{error:'Temporarily unavailable'},503);await turn();
    assert.equal(h.context.state().loaded,false);assert.ok(h.nodes.entry.disabled);
    assert.equal(h.nodes['retry-load'].hidden,false);assert.equal(h.nodes['retry-load'].disabled,false);
    const retry=h.nodes['retry-load'].events.click();
    assert.equal(h.nodes['retry-load'].hidden,true);assert.ok(h.nodes['retry-load'].disabled);
    assert.equal(h.nodes.status.textContent,'Loading entries…');
    await h.nodes['retry-load'].events.click();assert.equal(h.requests.length,2);
    h.respond(1,{mode,files:['posts/a.md']});await retry;
    assert.equal(h.context.state().loaded,true);assert.equal(h.nodes.entry.disabled,false);
    assert.equal(h.nodes['new-entry'].disabled,false);assert.equal(h.nodes['retry-load'].hidden,true);
    assert.deepEqual(h.nodes.entry.options.map(option=>option.value),['posts/a.md']);
    assert.equal(h.nodes.save.textContent,mode==='github'?'Publish changes':'Save locally');
    h.nodes.entry.value='posts/a.md';const load=h.nodes.entry.events.change();
    h.respond(2,{revision:'saved',text:'original'});await load;
    h.nodes.markdown.value='unsaved';h.nodes.markdown.events.input();
    await h.nodes['retry-load'].events.click();assert.equal(h.requests.length,3);
    assert.equal(h.nodes.markdown.value,'unsaved');assert.ok(h.context.state().dirty);
  });
}
