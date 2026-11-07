import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createPublisher} from '../github-publisher.mjs';
import {productionEditorHandler,validatePublicEntry} from '../production-editor-api.mjs';

const text='---\ntitle: A public essay\ndate: 2026-11-05\ntags: [General]\n---\n\nCafé — 日本語.\n';
const fixture=await mkdtemp(path.join(os.tmpdir(),'tiago-publishing-test-'));
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const work=path.join(fixture,'work'),remote=path.join(fixture,'remote.git');await mkdir(work);
git(fixture,['init','--bare',remote]);git(work,['init','-b','codex/test']);
git(work,['config','user.name','Editor test']);git(work,['config','user.email','test@example.com']);
await mkdir(path.join(work,'src/content/posts'),{recursive:true});await mkdir(path.join(work,'src/content/pages'),{recursive:true});
await writeFile(path.join(work,'src/content/posts/example.md'),text);await writeFile(path.join(work,'unrelated.txt'),'Keep this unchanged.\n');
git(work,['add','.']);git(work,['commit','-m','Fixture']);git(work,['remote','add','origin',remote]);git(work,['push','origin','codex/test']);
const publisher=createPublisher({repository:'fixture/site',branch:'codex/test',remoteUrl:remote});

test('publishing preserves Unicode, unrelated files, versions and concurrent edits',async()=>{
  assert.deepEqual(await publisher.list(),{mode:'github',files:['posts/example.md']});
  const original=await publisher.read('posts/example.md');assert.equal(original.text,text);
  const change=text+'\nPublished paragraph.\n';
  const saved=await publisher.save({file:'posts/example.md',text:change,revision:original.revision});
  assert.match(saved.commit,/^[a-f0-9]{40}$/);assert.equal(git(remote,['show',saved.commit+':src/content/posts/example.md']),change.trim());
  assert.equal(git(remote,['show',saved.commit+':unrelated.txt']),'Keep this unchanged.');
  const noop=await publisher.save({file:'posts/example.md',text:change,revision:saved.revision});assert.equal(noop.unchanged,true);
  assert.equal(git(remote,['rev-parse','refs/heads/codex/test']),saved.commit);
  await assert.rejects(publisher.save({file:'posts/example.md',text,revision:original.revision}),e=>e.status===409);
  const competing=createPublisher({repository:'fixture/site',branch:'codex/test',remoteUrl:remote});
  const race=await Promise.allSettled([publisher.save({file:'posts/example.md',text:change+'First\n',revision:saved.revision}),competing.save({file:'posts/example.md',text:change+'Second\n',revision:saved.revision})]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.status,409);
  const current=await publisher.read('posts/example.md');await publisher.save({file:'posts/example.md',text,revision:current.revision});assert.equal((await publisher.read('posts/example.md')).text,text);
  const created=await publisher.save({file:'pages/new-page.md',text:text.replace('A public essay','A public page'),revision:'new'});assert.ok(created.commit);
  await assert.rejects(publisher.save({file:'pages/new-page.md',text,revision:'new'}),e=>e.status===409);
  await assert.rejects(publisher.read('../unrelated.txt'),e=>e.status===400);
  await assert.rejects(publisher.read('posts/missing.md'),e=>e.status===404);
});

test('all published source entries pass validation without transformation',async()=>{
  let count=0;for(const kind of ['posts','pages'])for(const name of await readdir('src/content/'+kind)){if(name.endsWith('.md')){validatePublicEntry(kind+'/'+name,await readFile('src/content/'+kind+'/'+name,'utf8'));count++;}}
  assert.ok(count>=146);
  for(const body of [text.replace('title: A public essay','title: [wrong]'),text.replace('date: 2026-11-05','date: invalid'),text.replace('tags: [General]','tags: invalid'),text.replace('tags: [General]','draft: true'),text.replace('tags: [General]','protected: "false"'),text.replace('tags: [General]','thumbnailCrop: {zoom: 7}'),text+'secret-fixture-value'])assert.throws(()=>validatePublicEntry('posts/example.md',body,['secret-fixture-value']),e=>e.status===400);
  assert.throws(()=>validatePublicEntry('posts/example.mdx',text),e=>e.status===400);
});

test('password session, exact origin, metadata and revision are required before publishing',async()=>{
  let writes=0;
  const store={list:async()=>({mode:'github',files:['posts/example.md']}),read:async()=>({text,revision:'a'.repeat(40)}),save:async()=>{writes++;return {ok:true,revision:'b'.repeat(40)}}};
  let base;const server=http.createServer((req,res)=>productionEditorHandler({authenticated:r=>r.headers.cookie==='session=fixture',publisher:store,siteUrl:base,secrets:[]})(req,res));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  const body=JSON.stringify({file:'posts/example.md',text,revision:'a'.repeat(40)});
  const put=(extra={},payload=body)=>fetch(base+'/api/editor',{method:'PUT',headers:{cookie:'session=fixture',origin:base,'content-type':'application/json',...extra},body:payload});
  try{
    assert.equal((await fetch(base+'/api/editor')).status,401);
    assert.equal((await put({cookie:''})).status,401);
    assert.equal((await put({origin:'https://evil.example'})).status,403);
    assert.equal((await put({origin:''})).status,403);
    assert.equal((await put({'sec-fetch-site':'cross-site'})).status,403);
    assert.equal((await put({'content-type':'text/plain'})).status,415);
    assert.equal((await put({},'{')).status,400);
    assert.equal((await put({},JSON.stringify({file:'../server.mjs',text,revision:'new'}))).status,400);
    assert.equal((await put({},JSON.stringify({file:'posts/example.md',text}))).status,400);
    assert.equal((await put({},JSON.stringify({file:'posts/example.md',text:text.replace('tags: [General]','unlisted: true'),revision:'new'}))).status,400);
    assert.equal(writes,0);
    const ok=await put();assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');assert.equal(writes,1);
    const list=await fetch(base+'/api/editor',{headers:{cookie:'session=fixture'}});assert.equal((await list.json()).mode,'github');
    assert.equal((await fetch(base+'/api/editor/build',{method:'POST',headers:{cookie:'session=fixture'}})).status,404);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('missing publisher credentials fail closed',async()=>{
  await assert.rejects(createPublisher({repository:'fixture/site',branch:'main'}).list(),e=>e.status===503);
});
