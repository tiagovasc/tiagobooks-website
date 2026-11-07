// Durable, independent keys avoid one tab replacing another tab's pending work.
// Acknowledged records remain as local recovery history; only small field edits,
// never a stale full-library snapshot, are replayed.
const PREFIX='tiagovf-sync-v1:',PROTOCOL=1;
const FIELDS=['title','author','additional_authors','isbn13','read_status','owned','favorite','rating','subject','format','pages','publication_year','date_read','tags','notes','notes_url','review_url','goodreads_shelf','sources','subtitle','publisher','description','cover','cover_status','google_books_id','enriched','enrich_status','enrich_confidence','acquired_date','acquisition_source'];
const clone=v=>JSON.parse(JSON.stringify(v));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const value=(b,f)=>f==='favorite'?!!b.favorite:f==='library_member'?b.library_member!==false:b[f];
const version=(b,f)=>b?._sync_versions?.[f]||null;
export class ChangeStore{
 constructor(storage=localStorage){this.storage=storage;}
 all(){const out=[];for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(PREFIX)){const record=JSON.parse(this.storage.getItem(key));if(record?.op)out.push(record);}}return out.sort((a,b)=>a.order-b.order||a.op.id.localeCompare(b.op.id));}
 pending(){return this.all().filter(r=>r.state!=='done');}
 put(record){const key=PREFIX+record.op.id,raw=JSON.stringify(record);this.storage.setItem(key,raw);if(this.storage.getItem(key)!==raw)throw Error('This browser could not keep your change safely. Export your books before leaving.');}
 async database(){
  if(!globalThis.indexedDB)return null;
  if(!this.db)this.db=new Promise((resolve,reject)=>{const request=indexedDB.open('tiagovf-library-history-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('changes',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Recovery history is open in another browser version'));});
  return this.db;
 }
 async archiveCompleted(){
  // Keep the synchronous outbox small. Only confirmed changes leave it, after
  // their full recovery history has been stored AND read back in IndexedDB.
  const records=this.all().filter(r=>r.state==='done'&&!r.legacy_token);if(!records.length)return;
  const db=await this.database();if(!db)return;
  await new Promise((resolve,reject)=>{const tx=db.transaction('changes','readwrite');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);for(const record of records)tx.objectStore('changes').put({id:record.op.id,record});});
  const copies=await Promise.all(records.map(record=>new Promise((resolve,reject)=>{const q=db.transaction('changes').objectStore('changes').get(record.op.id);q.onsuccess=()=>resolve(q.result?.record);q.onerror=()=>reject(q.error);})));
  records.forEach((record,i)=>{const raw=JSON.stringify(record);if(JSON.stringify(copies[i])===raw&&this.storage.getItem(PREFIX+record.op.id)===raw)this.storage.removeItem(PREFIX+record.op.id);});
 }
 async history(){
  const db=await this.database();if(!db)return this.all();
  const archived=await new Promise((resolve,reject)=>{const q=db.transaction('changes').objectStore('changes').getAll();q.onsuccess=()=>resolve(q.result.map(r=>r.record));q.onerror=()=>reject(q.error);});
  return [...new Map([...archived,...this.all()].map(r=>[r.op.id,r])).values()];
 }
}
export function project(books,records){
 const by=new Map(books.map(b=>[b.id,clone(b)]));
 for(const {op} of records){if(op.kind==='add'){if(!by.has(op.book_id))by.set(op.book_id,{...clone(op.book),_sync_versions:{_created:op.id}});continue;}const b=by.get(op.book_id);if(!b)continue;if(op.present)b[op.field]=clone(op.value);else delete b[op.field];b._sync_versions={...b._sync_versions,[op.field]:op.id};}
 return [...by.values()];
}
export function createSync(hooks,options={}){
 const store=options.store||new ChangeStore(),request=options.request||fetch.bind(window);
 const client=crypto.randomUUID();
 let books=[],rendered=[],revision=0,needsPull=false,busy=false,checking=false,online=true,auth=true,storageError='',newBuild='',stopped=false,order=Date.now()*1000,retryTimer=null,failures=0;
 let channel;try{channel=new BroadcastChannel('tiagovf-library-sync-v1');}catch{}
 const pending=()=>store.pending();
 const notify=()=>{try{channel?.postMessage('changed');}catch{}};
 const status=()=>({pending:pending().length,conflicts:pending().filter(r=>r.state==='conflict'),busy,online,auth,storageError,newBuild});
 function report(){hooks.status?.(status());}
 function current(){return project(books,pending());}
 function show(local=false,favoriteOnly=false){
  if(needsPull||hooks.editing?.())return;
  rendered=current();hooks.apply?.(clone(rendered),revision,{local,favoriteOnly});report();
 }
 function write(record){try{store.put(record);storageError='';}catch(error){storageError=error.message;report();hooks.error?.(error);throw error;}}
 function recordFor(book,field,wanted,present=true,extra={}){
  return {op:{id:crypto.randomUUID(),book_id:book.id,field,before:value(book,field)??null,before_present:value(book,field)!==undefined,before_version:version(book,field),present,value:wanted??null,...extra},client,title:book.title||'Book',order:++order,state:'pending'};
 }
 function enqueue(record){
  const previous=pending().findLast(r=>r.state==='pending'&&!r.attempted&&r.client===client&&r.op.book_id===record.op.book_id&&r.op.field===record.op.field&&r.op.id===record.op.before_version);
  // Until transport starts, one compact draft holds the latest keystrokes. Once
  // attempted, its ID/content are immutable so response-loss retries stay safe.
  if(previous&&!record.op.review)record={...previous,op:{...previous.op,present:record.op.present,value:record.op.value}};
  write(record);notify();report();schedule(400);return record;
 }
 function stage(desired){
  const by=new Map(rendered.map(b=>[b.id,b]));
  for(const wanted of desired){
   let before=by.get(wanted.id);
   if(!before){const record={op:{id:crypto.randomUUID(),kind:'add',book_id:wanted.id,book:clone(wanted)},title:wanted.title,order:++order,state:'pending'};enqueue(record);before={...clone(wanted),_sync_versions:{_created:record.op.id}};rendered.push(before);by.set(before.id,before);continue;}
   for(const field of FIELDS){
    if(same(value(before,field),value(wanted,field)))continue;
    const rec=enqueue(recordFor(before,field,value(wanted,field),value(wanted,field)!==undefined));
    if(rec.op.present)before[field]=clone(rec.op.value);else delete before[field];before._sync_versions={...before._sync_versions,[field]:rec.op.id};
   }
  }
 }
 function favorite(id,selected){
  const before=rendered.find(b=>b.id===id)||current().find(b=>b.id===id);
  if(!before)throw Error('This book is not available yet. Please retry.');
  if(value(before,'favorite')!==selected){const rec=enqueue(recordFor(before,'favorite',selected));before.favorite=selected;before._sync_versions={...before._sync_versions,favorite:rec.op.id};}
  hooks.favorite?.(id,selected);return {favorite:selected,book_id:id,queued:true};
 }
 function remove(id){const before=rendered.find(b=>b.id===id);if(!before)return;enqueue(recordFor(before,'library_member',false));before.library_member=false;}
 function schedule(ms=15000){if(stopped)return;clearTimeout(retryTimer);retryTimer=setTimeout(()=>{flush().catch(()=>{});},ms);}
 async function json(url,init={}){
  const response=await request(url,{cache:'no-store',...init,signal:AbortSignal.timeout(20000)});
  if(!response.ok){const error=new Error(response.status===401?'Sign in again to sync. Your changes are kept on this device.':'Could not reach the library. Your changes are kept on this device.');error.status=response.status;throw error;}
  return response.json();
 }
 async function pull(){
  const data=await json('/api/library-sync');if(data.protocol!==PROTOCOL)throw Error('Update the page to continue syncing.');
  if(Number(data.revision)>=revision){books=data.books;revision=Number(data.revision);needsPull=false;show();}return data;
 }
 async function sendPending(){
  const records=pending().filter(r=>r.state==='pending').slice(0,200);if(!records.length)return;
  records.forEach(r=>write({...r,attempted:true}));
  const data=await json('/api/library-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocol:PROTOCOL,operations:records.map(r=>r.op)})});
  // Persist receipts before updating the UI. A crash at any point can retry the
  // identical operation ID, which the server recognizes without replaying it.
  needsPull=true;
  for(const result of data.results){
   const old=records.find(r=>r.op.id===result.id);if(!old)throw Error('Unrecognized save receipt');
   if(result.status==='accepted'){
    write({...old,state:'done',receipt:result,confirmed_at:new Date().toISOString()});
    // A same-value acknowledgement may refer to a different existing token.
    if(result.version!==undefined){
     // Only rebase a same-value acknowledgement if the field still has the
     // original baseline token. A newer equal value is not permission to replay
     // descendants of a stale edit over another session's intervening change.
     if(!result.equivalent||result.version===old.op.before_version)for(const next of pending())if(next.op.before_version===result.id)write({...next,op:{...next.op,before_version:result.version}});
     for(const b of rendered)if(b._sync_versions?.[old.op.field]===result.id)b._sync_versions[old.op.field]=result.version;
    }
    let ancestor=old.op.before_version;
    while(ancestor){const previous=store.all().find(r=>r.op.id===ancestor&&r.op.book_id===old.op.book_id&&r.op.field===old.op.field);if(!previous)break;if(previous.state!=='done')write({...previous,state:'done',resolution:'superseded-by-confirmed-change',superseded_by:old.op.id});ancestor=previous.op.before_version;}
   }else write({...old,state:'conflict',conflict:result});
  }
  if(Number(data.base_revision)===revision){
   const accepted=new Set(data.results.filter(r=>r.status==='accepted').map(r=>r.id));books=project(books,records.filter(r=>accepted.has(r.op.id)));
   for(const result of data.results){const op=records.find(r=>r.op.id===result.id)?.op,b=books.find(b=>b.id===op?.book_id);if(b&&result.status==='accepted'&&result.version!==undefined)b._sync_versions={...b._sync_versions,[op.field]:result.version};}
   revision=Number(data.revision);needsPull=false;show(true,records.every(r=>r.op.field==='favorite'));
  }else if(Number(data.revision)<=revision){needsPull=false;show();}
  else{revision=Number(data.revision);await pull();}
  notify();await store.archiveCompleted().catch(()=>{});
 }
 async function flush(){
  if(busy||stopped)return;busy=true;report();
  try{
   const work=async()=>{await sendPending();};
   if(globalThis.navigator?.locks)await navigator.locks.request('tiagovf-library-sync-send',work);else await work();
   online=true;auth=true;failures=0;
  }catch(error){online=error.status===401;auth=error.status!==401;failures++;hooks.error?.(error);}
  finally{busy=false;report();schedule(pending().some(r=>r.state==='pending')?Math.min(30000,1000*2**Math.min(failures,5)):15000);}
 }
 async function check(){
  if(checking||stopped||document.visibilityState==='hidden')return;checking=true;
  try{
   const state=await json('/api/library-state');online=true;
   if(state.build!==window.LIBRARY_BUILD_ID)newBuild=state.build;
   auth=state.can_edit;
   if(auth&&(needsPull||Number(state.revision)!==revision))await pull();
   if(auth&&pending().some(r=>r.state==='pending'))await flush();
   show();report();
  }catch(error){online=false;report();}finally{checking=false;}
 }
 async function resolve(bookId,field,keepMine){
  await pull();const related=pending().filter(r=>r.op.book_id===bookId&&r.op.field===field);
  if(!related.length)return;const last=related.at(-1),book=books.find(b=>b.id===bookId);
  let replacement;
  if(keepMine){if(!book||field==='new book')throw Error('Export this change and review the book before continuing.');replacement=enqueue(recordFor(book,field,last.op.value,last.op.present));}
  // Preserve the rejected drafts as recovery history, rather than deleting them.
  related.forEach(r=>write({...r,state:'done',resolution:keepMine?'keep-mine':'use-saved',resolved_at:new Date().toISOString()}));
  const displayed=rendered.find(b=>b.id===bookId),chosen=keepMine?last.op.value:book&&value(book,field);
  if(displayed){if(chosen!==undefined)displayed[field]=chosen;else delete displayed[field];displayed._sync_versions={...displayed._sync_versions,[field]:replacement?.op.id||version(book,field)};}
  hooks.resolved?.(bookId,field,chosen);
  show();notify();report();await flush();
 }
 async function start(){
  // Check storage before enabling editing. No pretend durable saves in private
  // browsing modes that reject writes or when the origin has exhausted quota.
  await store.archiveCompleted().catch(()=>{});
  const probe=PREFIX+'storage-check';store.storage.setItem(probe,'ok');store.storage.removeItem(probe);
  order=Math.max(order,...store.all().map(r=>r.order+1));
  await pull();rendered=current();
  const legacy=JSON.parse(store.storage.getItem('tiagovf-favorite-recovery-v1')||'{}');
  for(const [key,item] of Object.entries(legacy)){
   const legacyToken=item.token||JSON.stringify([key,item.favorite]);
   const id=item.bookId||books.find(b=>(b.tbr_ids||[]).includes(item.membershipId))?.id;if(!id)continue;
   if(store.all().some(r=>r.legacy_token===legacyToken))continue;
   const book=books.find(b=>b.id===id);if(!book)continue;
   const rec=recordFor(book,'favorite',item.favorite,true,{review:true});rec.legacy_token=legacyToken;rec.legacy_key=key;enqueue(rec);
  }
  show();await flush();
 }
 channel?.addEventListener('message',()=>{check();});
 window.addEventListener('storage',e=>{if(e.key?.startsWith(PREFIX)){check();}});
 window.addEventListener('online',()=>{check();flush();});window.addEventListener('focus',check);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();else flush();});
 document.addEventListener('focusout',()=>setTimeout(show,0));
 const interval=setInterval(check,15000);
 return {start,stage,favorite,remove,flush,check,resolve,status,current,history:()=>store.history().catch(()=>store.all()),stop(){stopped=true;clearInterval(interval);clearTimeout(retryTimer);channel?.close();}};
}

export async function mountSync(hooks){
 const bar=document.createElement('div');bar.id='librarySyncStatus';bar.className='library-sync-status';bar.setAttribute('role','status');
 const text=document.createElement('span'),actions=document.createElement('span');bar.append(text,actions);
 const anchor=document.getElementById('notch');if(anchor)anchor.append(bar);else document.querySelector('main')?.prepend(bar);
 const dialog=document.createElement('dialog');dialog.className='library-sync-dialog';dialog.setAttribute('aria-label','Review unsynced changes');document.body.append(dialog);
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;actions.append(b);};
 let engine;
 function editorNotice(state){
  const body=document.getElementById('dBody');if(!body)return;const notice=body.querySelector('.library-sync-editor-notice');
  if(!state.conflicts.length){notice?.remove();return;}
  if(!notice){const b=document.createElement('button');b.type='button';b.className='nbtn library-sync-editor-notice';b.textContent='Changes need review · Review';b.onclick=review;body.prepend(b);}
 }
 function review(){
  dialog.replaceChildren();const h=document.createElement('h2');h.textContent='Review changes';dialog.append(h);
  const grouped=new Map();for(const r of engine.status().conflicts)grouped.set(r.op.book_id+':'+r.op.field,r);
  for(const r of grouped.values()){
   const block=document.createElement('section'),title=document.createElement('h3'),mine=document.createElement('p'),saved=document.createElement('p');
   title.textContent=r.title+' · '+r.op.field.replaceAll('_',' ');mine.textContent='Your change: '+JSON.stringify(r.op.value);saved.textContent='Saved value: '+JSON.stringify(r.conflict?.current);block.append(title,mine,saved);
   for(const [label,keep] of [['Keep my change',true],['Use saved value',false]]){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await engine.resolve(r.op.book_id,r.op.field,keep);review();}catch(error){hooks.error?.(error);b.disabled=false;}};block.append(b);}dialog.append(block);
  }
  const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(close);if(!dialog.open)dialog.showModal();
 }
 function render(state){
  actions.replaceChildren();bar.hidden=false;
  text.textContent=state.storageError||(!state.auth?'Sign in to sync · changes kept on this device':state.conflicts.length?'Changes need review':state.pending?(state.online?'Syncing '+state.pending+' change'+(state.pending===1?'':'s')+'…':'Changes kept on this device · retrying'):'All changes synced');
  bar.dataset.state=state.storageError||state.conflicts.length?'attention':state.pending?'pending':'synced';
  if(!state.auth){const a=document.createElement('a');a.href='/login?next=%2Flibrary';a.target='_blank';a.rel='noopener';a.textContent='Sign in';actions.append(a);}
  if(state.conflicts.length)button('Review',review);
  if(state.pending)button('Retry',()=>engine.flush());
  if(state.newBuild)button('Update available · reload',()=>{hooks.stage();if(!engine.status().storageError)location.reload();});
  if(state.pending||state.storageError)button('Download recovery copy',async()=>{try{hooks.stage();}catch{}const blob=new Blob([JSON.stringify({books:hooks.snapshot?.()||engine.current(),canonical_books:engine.current(),changes:await engine.history()},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='library-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
  hooks.status?.(state);
  editorNotice(state);
 }
 engine=createSync({...hooks,status:render});
 const editor=document.getElementById('dBody'),observer=editor?new MutationObserver(()=>editorNotice(engine.status())):null;observer?.observe(editor,{childList:true});
 try{await engine.start();setTimeout(()=>{if(window.LibrarySync===engine)window.dispatchEvent(new CustomEvent('library-data-updated',{detail:{local:true}}));},0);return engine;}catch(error){engine.stop();observer?.disconnect();bar.remove();dialog.remove();throw error;}
}

export function watchPublicUpdates(apply,initialRevision){
 let revision=String(initialRevision),checking=false;
 const bar=document.createElement('div');bar.className='library-sync-status';bar.hidden=true;document.getElementById('notch')?.append(bar);
 async function check(){
  if(checking||document.visibilityState==='hidden')return;checking=true;
  try{
   const response=await fetch('/api/library-state',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)return;const state=await response.json();
   if(state.build!==window.LIBRARY_BUILD_ID){bar.hidden=false;bar.replaceChildren();const b=document.createElement('button');b.textContent='Site update available · reload';b.onclick=()=>location.reload();bar.append(b);}
   if(String(state.revision)!==revision){const r=await fetch('/books.json?view=public',{cache:'no-store'});if(!r.ok)return;const books=await r.json();revision=r.headers.get('X-Library-Revision');apply(books,revision);window.dispatchEvent(new CustomEvent('library-data-updated',{detail:{revision}}));}
  }catch{}finally{checking=false;}
 }
 setInterval(check,15000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
}
