import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ownedTbrIds} from '../library/tbr-ownership.mjs';
import {tbrOwnedHTML} from '../library/tbr.js';

test('only owned records contribute; explicit TBR links survive corrected metadata',()=>{
  const catalogue=[{id:'linked',title:'Corrected title',author:'A'},{id:'not-owned',title:'Read Book',author:'B'}];
  assert.deepEqual(ownedTbrIds([{owned:true,title:'Original title',author:'Other',tbr_ids:['linked','missing']},{owned:false,read_status:'read',title:'Read Book',author:'B',tbr_ids:['not-owned']}],catalogue),['linked']);
});
test('complete title/author matches handle punctuation, accents, surname ordering and stored subtitles',()=>{
  const library=[{owned:true,title:'The Ethics of Attention',subtitle:'A study',author:'Panizza, Silvia Capriglio'}];
  const catalogue=[{id:'main',title:'THE ETHICS OF ATTENTION',author:'Silvia Capriglio Panizza'},{id:'subtitle',title:'The Ethics of Attention — A study',author:'Silvia Capríglio Panizza'},{id:'different-author',title:'The Ethics of Attention',author:'Another Author'},{id:'different-subtitle',title:'The Ethics of Attention: Another study',author:'Silvia Capriglio Panizza'},{id:'partial',title:'Attention',author:'Silvia Capriglio Panizza'}];
  assert.deepEqual(ownedTbrIds(library,catalogue),['main','subtitle']);
});
test('unknown authors, partial titles and reading status do not imply ownership; source data stays intact',()=>{
  const library=[{title:'A Book',owned:true},{title:'Another',author:'Author',read_status:'read',owned:false}],catalogue=[{id:'a',title:'A Book',author:''},{id:'b',title:'Another',author:'Author'}];
  const before=JSON.stringify({library,catalogue});assert.deepEqual(ownedTbrIds(library,catalogue),[]);assert.equal(JSON.stringify({library,catalogue}),before);
  assert.equal(tbrOwnedHTML(false),'');assert.match(tbrOwnedHTML(true),/aria-label="Owned" title="Owned"/);assert.doesNotMatch(tbrOwnedHTML(true),/<button|data-act|favorite/);
});

test('ownership endpoint exposes only current matched IDs and reflects authenticated library changes',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tbr-owned-')),file=path.join(folder,'library.json');
  const catalogue=JSON.parse(fs.readFileSync('library/tbr-catalogue.json','utf8'));
  const book={id:'one',title:'Owned Book',author:'Author',rating:4,owned:true,tbr_ids:[catalogue.books[0].id]};
  fs.writeFileSync(file,JSON.stringify({id:'library',revision:1,books:[book]}));
  process.env.LOCAL_LIBRARY_FILE=file;process.env.LIBRARY_PASSWORD='isolated-test-password';process.env.SESSION_SECRET='isolated-test-session-secret';
  const {server}=await import('../server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const before=fs.readFileSync(file,'utf8');const response=await fetch(base+'/api/tbr-owned');assert.equal(response.status,200);assert.deepEqual(await response.json(),{ids:[catalogue.books[0].id]});assert.equal(fs.readFileSync(file,'utf8'),before);
    assert.equal((await fetch(base+'/api/tbr-owned',{method:'POST',body:'{}'})).status,405);
    const login=await fetch(base+'/login',{method:'POST',body:'password=isolated-test-password',redirect:'manual'});const cookie=login.headers.get('set-cookie').split(';')[0];
    const save=await fetch(base+'/save',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json','X-Library-Revision':'1'},body:JSON.stringify([{...book,owned:false}])});assert.equal(save.status,200);
    assert.deepEqual(await (await fetch(base+'/api/tbr-owned')).json(),{ids:[]});
  }finally{await new Promise(resolve=>server.close(resolve));server.closeAllConnections?.();}
});
