import http from 'node:http';
import {localDB} from '../local-storage.mjs';
import {createTbrFavoritesStore} from './tbr-favorites-store.mjs';
import {ownedTbrIds} from './tbr-ownership.mjs';
import {isLibraryMember,mergeLibrarySave,projectTbrCatalogue,canonicalFavoriteIds,createReconciliationBackup,runBookReconciliation} from './canonical-books.mjs';
import {readBody,sameOrigin} from './http-utils.mjs';
import {personalizeSiteHeader} from '../src/lib/site-shell.mjs';
import {tripMonth,publicTripCatalogue} from './trip-privacy.mjs';
import {applyConfirmedCorrections} from './confirmed-book-corrections.mjs';
import {mergeEditedSnapshot,EditConflict} from './library-edit-merge.mjs';
import {applyFavoriteUnion} from './favorite-union-recovery.mjs';
import {applyMissingCovers} from './missing-cover-recovery.mjs';
import {applyOperations,validateOperations,stampLegacyChanges,SYNC_PROTOCOL} from './sync-operations.mjs';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import zlib from 'node:zlib';
import {promisify} from 'node:util';

const brotli=promisify(zlib.brotliCompress), gzip=promisify(zlib.gzip);
const root=path.dirname(fileURLToPath(import.meta.url));
const local=process.env.LOCAL_LIBRARY_FILE;
const base=process.env.SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY;
if(local && process.env.NODE_ENV==='production')throw Error('Local catalogue is not a production backend');
const port=Number(process.env.PORT||8732);
const table='book_library_state';
const tbrFavorites=createTbrFavoritesStore({url:base,key,localFile:local?local+'.tbr-favorites.json':null});
let reconciliationStatus={state:'not_started',compatible:true};
export async function activateBookReconciliation(){
  const plan=JSON.parse(await readFile(path.join(root,'book-reconciliation.json'),'utf8'));
  const catalogue=JSON.parse(await readFile(path.join(root,'tbr-catalogue.json'),'utf8'));
  reconciliationStatus=await runBookReconciliation({db,catalogue,plan,legacyFavorites:()=>tbrFavorites.list(),backup:createReconciliationBackup(base,key)});
  reconciliationStatus.confirmed_corrections=await applyConfirmedCorrections({db,backup:createReconciliationBackup(base,key)});
  const audiobookPlan=JSON.parse(await readFile(path.join(root,'read-audiobook-ownership.json'),'utf8'));
  reconciliationStatus.audiobook_ownership=await applyConfirmedCorrections({db,backup:createReconciliationBackup(base,key),corrections:audiobookPlan.books,version:audiobookPlan.version});
  const favoritePlan=JSON.parse(await readFile(path.join(root,'favorite-union-recovery.json'),'utf8'));
  reconciliationStatus.favorite_union_recovery=await applyFavoriteUnion({db,backup:createReconciliationBackup(base,key),plan:favoritePlan});
  const coverPlan=JSON.parse(await readFile(path.join(root,'missing-cover-recovery.json'),'utf8'));
  reconciliationStatus.missing_cover_recovery=await applyMissingCovers({db,backup:createReconciliationBackup(base,key),plan:coverPlan});
  snapshot=null;
  return reconciliationStatus;
}
const attempts=new Map(),allFailures={count:0,until:0};
// Railway's edge always sets X-Real-IP and overwrites any copy a visitor sends (Railway staff, Central Station,
// checked 4 Nov 2026). Behind it every request arrives from the proxy, so production counts failed logins per visitor.
// Elsewhere the header is ignored, because without that proxy a visitor could invent it.
export function clientAddress(req){
  const real=String(req.headers['x-real-ip']||'').trim();
  return process.env.NODE_ENV==='production'&&real.length<=45&&/^[0-9a-fA-F:.]+$/.test(real)?real:req.socket.remoteAddress;
}
const digest=value=>createHash('sha256').update(value).digest();
const sign=value=>createHmac('sha256',process.env.SESSION_SECRET||'unconfigured').update(value).digest('hex');

// ---------- headers shared by every response ----------
const SECURITY={
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy':'same-origin'
};
// The page is a single file with inline script and style, so 'unsafe-inline' is required; everything else stays on this origin.
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function authenticated(req){
  if(!process.env.LIBRARY_PASSWORD||!process.env.SESSION_SECRET)return false;
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('library_session='));
  if(!cookie)return false;
  const [expiry,signature]=cookie.slice(16).split('.');
  return Number(expiry)>Date.now()&&typeof signature==='string'&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(sign(expiry)));
}

const escapeHtml=value=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Only same-site paths are accepted as a return destination, so the login form cannot redirect elsewhere.
export function safeNext(value){const v=String(value||'');return v.length<1000&&/^\/(?![\/\\])/.test(v)&&!/[\u0000-\u001f\u007f]/.test(v)?v:'/';}
function loginPage(message='',next='/'){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><meta name="description" content="Sign in to manage Tiago Faleiro’s library and writing."><title>Tiago Faleiro</title><link rel="icon" href="/favicon.svg?v=quill-20261106" type="image/svg+xml"><style>
:root{color-scheme:light dark;--bg:#EDEDEA;--field:#FFFFFF;--ink:#1C1C1E;--muted:#5A5A5F;--line:rgba(28,28,30,.18);--btn:#1C1C1E;--btn-ink:#FFFFFF;--err:#B4343A}
@media (prefers-color-scheme:dark){:root{--bg:#000;--field:#1C1C1E;--ink:#F5F5F7;--muted:#A1A1A6;--line:rgba(255,255,255,.17);--btn:#F5F5F7;--btn-ink:#111;--err:#F0A49F}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;min-height:100dvh}
form{width:min(340px,calc(100vw - 32px))}h1{font-size:24px;margin:0 0 4px}p{color:var(--muted);margin:0 0 14px}
input,button{box-sizing:border-box;width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--ink);font:inherit;margin:6px 0}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
button{background:var(--btn);color:var(--btn-ink);border-color:transparent;cursor:pointer;font-weight:600}button:active{opacity:.85}
.err{color:var(--err);font-weight:600;margin:0 0 10px}a{color:var(--muted);display:inline-block;margin-top:14px;padding:6px 0}
</style></head><body><main><form method="post" action="/login"><h1>Tiago Faleiro</h1><p>Enter the admin password to edit.</p>${message?`<p class="err" role="alert">${escapeHtml(message)}</p>`:''}<input type="hidden" name="next" value="${escapeHtml(next)}"><input type="password" name="password" autocomplete="current-password" autofocus required aria-label="Admin password"><button>Sign in</button><a href="${escapeHtml(next)}">${next==='/'?'Back to the library':'Go back'}</a></form></main></body></html>`;
}

// ---------- storage ----------
async function db(method,query,body){
  if(local)return localDB(local,method,query,body);
  const res=await fetch(`${base}/rest/v1/${table}${query}`,{method,signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!res.ok)throw new Error(`Storage response ${res.status}`);
  return res.json();
}
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...SECURITY,...headers});res.end(JSON.stringify(data));}
export function validBooks(books){
  return Array.isArray(books)&&books.length<=10000&&new Set(books.map(b=>b?.id)).size===books.length&&books.every(b=>b&&typeof b.id==='string'&&typeof b.title==='string'&&Number.isInteger(b.rating)&&b.rating>=0&&b.rating<=5&&(b.favorite===undefined||typeof b.favorite==='boolean')&&(b.merged_record_ids==null||Array.isArray(b.merged_record_ids)));
}
// A save must never silently wipe or gut the library (for example after an accidental import of the wrong file).
export function plausibleSave(previousCount,nextCount){
  if(nextCount===0)return false;
  if(typeof previousCount==='number'&&previousCount>=20&&nextCount<previousCount*0.5)return false;
  return true;
}

// Visitors get the library without descriptions (fetched one book at a time when a book is opened) and without
// merge bookkeeping that no screen shows. The signed-in editor always loads the complete records it saves back.
const PUBLIC_OMIT=['_sync_versions','description','merged_records','merge_conflicts','acquisition_events','discovery_records','book_identity_version','series_original_record'];
const described=b=>typeof b?.description==='string'&&b.description.trim()!=='';
export function publicBooks(books){return books.map(b=>{
  const o={};for(const k of Object.keys(b))if(!PUBLIC_OMIT.includes(k))o[k]=b[k];
  if(['purchase_receipt','user_trip'].includes(b.acquisition_basis)||(b.acquisition_events||[]).length){
    if(o.acquired_date)o.acquired_date=tripMonth(o.acquired_date);
    // Receipt notes can repeat exact dates even after the structured fields are redacted.
    delete o.notes;delete o.acquisition_source;
  }
  if(described(b))o.has_description=true;return o;
});}
// A save that would strip descriptions from most books is refused, like one that would remove most books.
export function keepsDescriptions(previousDescribed,nextDescribed){return !(typeof previousDescribed==='number'&&previousDescribed>=20&&nextDescribed<previousDescribed*0.5);}

// ---------- compression and conditional responses ----------
async function compressed(buf,level){
  return {raw:buf,br:await brotli(buf,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:level,[zlib.constants.BROTLI_PARAM_SIZE_HINT]:buf.length}}),gz:await gzip(buf,{level:9})};
}
function pickEncoding(req,variant){
  const accept=String(req.headers['accept-encoding']||'');
  if(/\bbr\b/.test(accept)&&variant.br)return ['br',variant.br];
  if(/\bgzip\b/.test(accept)&&variant.gz)return ['gzip',variant.gz];
  return [null,variant.raw];
}
function matches(req,etag){
  const header=req.headers['if-none-match'];
  return !!header&&header.split(',').some(tag=>{tag=tag.trim();return tag===etag||tag==='W/'+etag||tag==='*';});
}
function sendVariant(req,res,variant,{type,etag,cache,extra={}}){
  const headers={'Content-Type':type,'Cache-Control':cache,ETag:etag,Vary:'Accept-Encoding',...SECURITY,...extra};
  if(matches(req,etag)){res.writeHead(304,headers);return res.end();}
  const [encoding,body]=pickEncoding(req,variant);
  if(encoding)headers['Content-Encoding']=encoding;
  headers['Content-Length']=body.length;
  res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:body);
}

// ---------- page: the hosted page loads its books from /books.json, so the embedded offline copy is not sent ----------
let page=null;
let buildIdentity;
async function libraryBuild(){
 if(!buildIdentity)buildIdentity=Promise.all([
  ...['index.html','tbr.js','tbr.css','library-sync.js','sync-operations.mjs','server.mjs','../server.mjs'].map(f=>readFile(path.join(root,f))),
  ...['unified.js','unified.css'].map(f=>readFile(path.join(root,'../dist',f)).catch(()=>readFile(path.join(root,'../public',f))))
 ]).then(parts=>createHash('sha256').update(Buffer.concat(parts)).update(process.env.RAILWAY_GIT_COMMIT_SHA||'').digest('hex').slice(0,20));
 return buildIdentity;
}
async function pageVariants(){
  // The integrated site serves the build's dist/index.html (shared header and canonical URL filled in); the source copy is the fallback.
  const choices=[];for(const file of [process.env.LIBRARY_PAGE_FILE,path.join(root,'index.html')]){if(!file)continue;const st=await stat(file).catch(()=>null);if(st?.isFile())choices.push({file,st});}
  if(!choices.length)throw new Error('Library page missing');
  // Prefer the configured build even if another editor has just touched the source.
  // Its canonical URL, search exclusions and catalogue count belong to one build.
  const {file,st}=choices[0], stamp=`${file}:${st.mtimeMs}:${st.size}`;
  if(page&&page.stamp===stamp)return page;
  let html=(await readFile(file)).toString();
  const at=html.indexOf('var SEED = ');
  if(at>0){const end=html.indexOf('\n',at);html=html.slice(0,at)+'var SEED = [];'+(end<0?'':html.slice(end));}
  const build=async editable=>{
    const text=html.replace('<head>',`<head><script>window.LIBRARY_BUILD_ID=${JSON.stringify(await libraryBuild())};window.CLOUD_LIBRARY=true;window.CLOUD_CAN_EDIT=${editable};if(!window.CLOUD_CAN_EDIT)document.documentElement.classList.add('public-library');</script>`);
    const buf=Buffer.from(personalizeSiteHeader(text,editable));
    return {...await compressed(buf,9),etag:`"${createHash('sha1').update(buf).digest('hex').slice(0,20)}"`};
  };
  page={stamp,public:await build(false),admin:await build(true)};
  return page;
}

// ---------- library snapshot cache, keyed by the stored revision ----------
let snapshot=null; // {revision,count,variant|null}
async function librarySnapshot(){
  const [meta]=await db('GET','?id=eq.library&select=revision');
  if(!meta)return null;
  if(snapshot&&snapshot.revision===meta.revision&&snapshot.variant)return snapshot;
  const [row]=await db('GET','?id=eq.library&select=books,revision');
  if(!row)return null;
  const members=row.books.filter(isLibraryMember);
  const descriptions=new Map(members.filter(described).map(b=>[String(b.id),b.description]));
  snapshot={revision:row.revision,count:members.length,described:descriptions.size,descriptions,allBooks:row.books,
    syncVariant:await compressed(Buffer.from(JSON.stringify({books:row.books,revision:row.revision,protocol:SYNC_PROTOCOL})),6),
    variant:await compressed(Buffer.from(JSON.stringify(members)),6),
    publicVariant:await compressed(Buffer.from(JSON.stringify(publicBooks(members))),6),
    descriptionsVariant:await compressed(Buffer.from(JSON.stringify(Object.fromEntries(descriptions))),6)};
  return snapshot;
}
export function resetCaches(){page=null;snapshot=null;attempts.clear();allFailures.count=0;}

const STATIC_TYPES={'.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const TBR_FILES={'library-sync.js':'text/javascript; charset=utf-8','tbr.js':'text/javascript; charset=utf-8','tbr.css':'text/css; charset=utf-8','tbr-bookshops.json':'application/json; charset=utf-8','tbr-catalogue.json':'application/json; charset=utf-8'};
const tbrVariants=new Map();
const ROOT_FILES=['favicon.svg','favicon.ico','apple-touch-icon.png'];
const COVER=/^covers\/(?:web\/)?[a-zA-Z0-9_.-]+\.(jpg|png|webp|jpeg)$/;

export const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const wantsHtml=String(req.headers.accept||'').includes('text/html');
    let next=url.searchParams.get('next');
    const htmlReply=(status,message)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':CSP,...SECURITY});res.end(loginPage(message,safeNext(next)));};
    if(url.pathname==='/login'&&req.method==='POST'){
      if(!sameOrigin(req))return send(res,403,{error:'Origin rejected'});
      const ip=clientAddress(req);const recent=attempts.get(ip)||{count:0,until:Date.now()+60000};if(recent.until<Date.now()){recent.count=0;recent.until=Date.now()+60000;}
      // Backstop if per-visitor addresses were ever unreliable: 200 failures a minute from everyone together also pauses logins.
      if(allFailures.until<Date.now()){allFailures.count=0;allFailures.until=Date.now()+60000;}
      if(recent.count>=10||allFailures.count>=200){res.setHeader('Retry-After','60');return wantsHtml?htmlReply(429,'Too many attempts. Wait a minute and try again.'):send(res,429,{error:'Wait a minute before trying again'},{'Retry-After':'60'});}
      const raw=await readBody(req,2048);if(raw===null)return send(res,413,{error:'Request too large'});
      const form=new URLSearchParams(raw),password=form.get('password')||'';next=form.get('next')||next;
      if(!process.env.LIBRARY_PASSWORD||!process.env.SESSION_SECRET||!timingSafeEqual(digest(password),digest(process.env.LIBRARY_PASSWORD))){
        // Only failures count toward the limit, so a shared proxy address cannot lock the owner out by successful visits.
        recent.count++;allFailures.count++;if(attempts.size>2000)attempts.clear();attempts.set(ip,recent);
        return wantsHtml?htmlReply(401,'Incorrect password. Try again.'):send(res,401,{error:'Incorrect library password'});
      }
      attempts.delete(ip);
      const expiry=String(Date.now()+7*86400000);res.writeHead(303,{Location:safeNext(next), 'Set-Cookie':`library_session=${expiry}.${sign(expiry)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`,'Cache-Control':'no-store',...SECURITY});return res.end();
    }
    if(url.pathname==='/login'&&req.method==='GET'){return htmlReply(200,'');}
    if(url.pathname==='/logout'){res.writeHead(303,{Location:safeNext(next), 'Set-Cookie':'library_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0','Cache-Control':'no-store',...SECURITY});return res.end();}
    if(url.pathname==='/save'&&!authenticated(req))return send(res,401,{error:'Enter the library password to enable edits'});
    if(url.pathname==='/api/book-reconciliation'&&req.method==='GET')return send(res,200,reconciliationStatus);
    if(url.pathname==='/api/library-state'&&req.method==='GET'){
      const [row]=await db('GET','?id=eq.library&select=revision');
      return send(res,200,{revision:row?.revision,build:await libraryBuild(),protocol:SYNC_PROTOCOL,can_edit:authenticated(req)});
    }
    if(url.pathname==='/api/library-sync'){
      if(!authenticated(req))return send(res,401,{error:'Sign in to sync your changes'});
      if(req.method==='GET'){
        const snap=await librarySnapshot();if(!snap)return send(res,503,{error:'Library unavailable'});
        return sendVariant(req,res,snap.syncVariant,{type:'application/json',etag:`"sync-${snap.revision}"`,cache:'private, no-store',extra:{Vary:'Accept-Encoding, Cookie'}});
      }
      if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
      if(!sameOrigin(req))return send(res,403,{error:'Origin rejected'});
      const raw=await readBody(req,2*1024*1024);if(raw===null)return send(res,413,{error:'Change batch too large'});
      let payload;try{payload=JSON.parse(raw);if(payload.protocol!==SYNC_PROTOCOL)throw Error('Please update the page to sync');validateOperations(payload.operations);}catch(error){return send(res,400,{error:error.message});}
      for(let attempt=0;attempt<8;attempt++){
        const [row]=await db('GET','?id=eq.library&select=books,revision');if(!row)return send(res,503,{error:'Library unavailable'});
        const result=applyOperations(row.books,payload.operations);
        if(result.changed){
          const updated=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:result.books,revision:row.revision+1,updated_at:new Date().toISOString()});
          if(!updated.length)continue;snapshot=null;
        }
        return send(res,200,{results:result.results,revision:row.revision+(result.changed?1:0),base_revision:row.revision});
      }
      return send(res,503,{error:'Library is busy. Your changes will retry.'});
    }
    if(url.pathname==='/api/tbr-owned'&&req.method==='GET'){
      const snap=await librarySnapshot();if(!snap)return send(res,503,{error:'Library is not initialized'});
      const catalogue=JSON.parse(await readFile(path.join(root,'tbr-catalogue.json'),'utf8'));
      const books=snap.allBooks;
      return send(res,200,{ids:ownedTbrIds(books,catalogue.books)});
    }
    if(url.pathname==='/api/tbr-favorites'){
      if(req.method==='GET'){
        const catalogue=JSON.parse(await readFile(path.join(root,'tbr-catalogue.json'),'utf8'));
        const snap=await librarySnapshot();if(!snap)return send(res,503,{error:'Library is not initialized'});
        return send(res,200,{ids:canonicalFavoriteIds(catalogue,snap.allBooks,await tbrFavorites.list())});
      }
      if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
      if(!authenticated(req))return send(res,401,{error:'Sign in to favorite books'});
      if(!sameOrigin(req))return send(res,403,{error:'Origin rejected'});
      const raw=await readBody(req,1024);if(raw===null)return send(res,413,{error:'Request too large'});
      let value;try{value=JSON.parse(raw);}catch{return send(res,400,{error:'Invalid JSON'});}
      const target=value?.id||value?.book_id;
      if(!value||typeof target!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(target)||typeof value.favorite!=='boolean')return send(res,400,{error:'Invalid favorite'});
      const catalogue=JSON.parse(await readFile(path.join(root,'tbr-catalogue.json'),'utf8'));
      const membership=catalogue.books.find(b=>b.id===value.id);
      if(value.id&&!membership)return send(res,404,{error:'Book not found'});
      for(let attempt=0;attempt<5;attempt++){
        const [row]=await db('GET','?id=eq.library&select=books,revision');
        const book=row?.books.find(b=>b.id===(membership?.book_id||value.book_id));
        if(!membership&&(!book||!isLibraryMember(book)))return send(res,404,{error:'Book not found'});
        if(membership&&!book?.book_identity_version)break;
        const expected=req.headers['x-library-revision'];
        book.favorite=value.favorite;book._sync_versions={...book._sync_versions,favorite:'legacy-'+createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,24)};
        const updated=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:row.books,revision:row.revision+1,updated_at:new Date().toISOString()});
        if(!updated.length)continue;
        snapshot=null;
        return send(res,200,{id:value.id||value.book_id,favorite:value.favorite,book_id:book.id,base_revision:row.revision,revision:row.revision+1},!expected||String(expected)===String(row.revision)?{'X-Library-Revision':String(row.revision+1)}:{});
      }
      const [current]=await db('GET','?id=eq.library&select=books,revision');
      if(!membership||current?.books.some(b=>b.id===membership.book_id&&b.book_identity_version))return send(res,503,{error:'Favorite is busy. Please retry.'});
      await tbrFavorites.set(value.id,value.favorite);
      return send(res,200,{id:value.id,favorite:value.favorite},{'X-Library-Revision':String(current?.revision||'')});
    }
    if(url.pathname==='/health'){if(!local&&(!base||!key))return send(res,503,{ok:false});const rows=await db('GET','?id=eq.library&select=revision');return send(res,rows.length?200:503,{ok:!!rows.length});}
    if(url.pathname==='/books.json'&&req.method==='GET'){
      const snap=await librarySnapshot();if(!snap)return send(res,503,{error:'Library is not initialized'});
      if(!authenticated(req)||url.searchParams.get('view')==='public')return sendVariant(req,res,snap.publicVariant,{type:'application/json',etag:`"r${snap.revision}-month-public"`,cache:'private, no-cache',extra:{'X-Library-Revision':String(snap.revision),Vary:'Accept-Encoding, Cookie'}});
      return sendVariant(req,res,snap.variant,{type:'application/json',etag:`"r${snap.revision}"`,cache:'private, no-store',extra:{'X-Library-Revision':String(snap.revision),Vary:'Accept-Encoding, Cookie'}});
    }
    if(url.pathname==='/book-descriptions.json'&&req.method==='GET'){
      const snap=await librarySnapshot();if(!snap)return send(res,503,{error:'Library is not initialized'});
      return sendVariant(req,res,snap.descriptionsVariant,{type:'application/json',etag:`"r${snap.revision}-descriptions"`,cache:'no-cache'});
    }
    if(url.pathname==='/book-description'&&req.method==='GET'){
      const snap=await librarySnapshot();if(!snap)return send(res,503,{error:'Library is not initialized'});
      const id=url.searchParams.get('id')||'';if(!id||id.length>200)return send(res,400,{error:'Missing book id'});
      return send(res,200,{id,description:snap.descriptions.get(id)||''},{'Cache-Control':'no-cache'});
    }
    if(url.pathname==='/save'&&req.method==='POST'){
      if(!sameOrigin(req))return send(res,403,{error:'Origin rejected'});
      const body=await readBody(req,12*1024*1024);if(body===null)return send(res,413,{error:'Library too large'});
      let books;try{books=JSON.parse(body);}catch{return send(res,400,{error:'Invalid JSON'});}
      if(books&&!Array.isArray(books)&&Array.isArray(books.base_books)){
        const desired=books.books,baseline=books.base_books;
        if(!validBooks(desired)||!validBooks(baseline))return send(res,400,{error:'Invalid library edit'});
        for(let attempt=0;attempt<5;attempt++){
          const [current]=await db('GET','?id=eq.library&select=books,revision');if(!current)return send(res,503,{error:'Library unavailable. Your edits remain in this tab.'});
          let combined;try{combined=mergeEditedSnapshot(current.books,baseline,desired);}catch(error){return send(res,error instanceof EditConflict?409:400,{error:error.message});}
          const members=current.books.filter(isLibraryMember),next=combined.filter(isLibraryMember);
          if(!validBooks(next)||!plausibleSave(members.length,next.length)||!keepsDescriptions(members.filter(described).length,next.filter(described).length))return send(res,400,{error:'Refusing to remove most library records or descriptions. Your edits remain in this tab.'});
          combined=stampLegacyChanges(current.books,combined,'legacy-'+Date.now()+'-'+Math.random());
          const rows=await db('PATCH',`?id=eq.library&revision=eq.${current.revision}`,{books:combined,revision:current.revision+1,updated_at:new Date().toISOString()});
          if(!rows.length)continue;snapshot=null;return send(res,200,{ok:true,merged:true},{'X-Library-Revision':String(current.revision+1)});
        }
        return send(res,503,{error:'The library is busy. Your edits remain in this tab; try Save again.'});
      }
      if(!validBooks(books))return send(res,400,{error:'Invalid library or rating'});
      const revision=Number(req.headers['x-library-revision']);if(!Number.isSafeInteger(revision)||revision<1)return send(res,409,{error:'Reload the library before saving'});
      const [current]=await db('GET',`?id=eq.library&revision=eq.${revision}&select=books`);
      if(!current)return send(res,409,{error:'Another session changed the library. Export your changes, then reload.'});
      const members=current.books.filter(isLibraryMember),previous=members.length,previousDescribed=members.filter(described).length;
      const nextDescribed=books.filter(described).length;
      if(!keepsDescriptions(previousDescribed,nextDescribed))return send(res,400,{error:'Refusing to save: this would remove most book descriptions. Reload the page and check the change.'});
      if(!plausibleSave(previous,books.length))return send(res,400,{error:'Refusing to save: this would remove most of the library. Reload the page and check the change.'});
      let combined;try{combined=mergeLibrarySave(current.books,books);}catch{return send(res,400,{error:'Invalid canonical library membership'});}
      if(req.headers['x-library-favorites-separate']==='1'){
        const stored=new Map(current.books.map(b=>[b.id,b]));
        combined=combined.map(b=>{const old=stored.get(b.id);if(!old)return b;const next={...b};if(old.favorite===undefined)delete next.favorite;else next.favorite=old.favorite;return next;});
      }
      combined=stampLegacyChanges(current.books,combined,'legacy-'+Date.now()+'-'+Math.random());
      const rows=await db('PATCH',`?id=eq.library&revision=eq.${revision}`,{books:combined,revision:revision+1,updated_at:new Date().toISOString()});
      if(!rows.length)return send(res,409,{error:'Another session changed the library. Export your changes, then reload.'});
      snapshot={revision:revision+1,count:books.length,described:nextDescribed,variant:null};
      return send(res,200,{ok:true},{'X-Library-Revision':String(revision+1)});
    }
    if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'});
    const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(filename==='index.html'){
      const pages=await pageVariants();
      return sendVariant(req,res,authenticated(req)?pages.admin:pages.public,{type:'text/html; charset=utf-8',etag:(authenticated(req)?pages.admin:pages.public).etag,cache:'private, no-cache',extra:{'Content-Security-Policy':CSP,Vary:'Accept-Encoding, Cookie'}});
    }
    if(Object.hasOwn(TBR_FILES,filename)){
      const file=path.join(root,filename),st=await stat(file).catch(()=>null);
      if(!st||!st.isFile())return send(res,404,{error:'Not found'});
      const canonical=filename==='tbr-catalogue.json'||filename==='tbr-bookshops.json';
      const snap=canonical&&(local||(base&&key))?await librarySnapshot():null;
      const etag=`W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}-month${snap?'-r'+snap.revision:''}"`;
      let cached=tbrVariants.get(filename);
      if(!cached||cached.etag!==etag){let raw=await readFile(file);if(filename.endsWith('.json')){let data=JSON.parse(raw);if(snap)data=projectTbrCatalogue(data,snap.allBooks);raw=Buffer.from(JSON.stringify(publicTripCatalogue(data)));}cached={etag,variant:await compressed(raw,5)};tbrVariants.set(filename,cached);}
      return sendVariant(req,res,cached.variant,{type:TBR_FILES[filename],etag,cache:'no-cache'});
    }
    if(!(ROOT_FILES.includes(filename)||COVER.test(filename)))return send(res,404,{error:'Not found'});
    const file=path.join(root,filename), st=await stat(file).catch(()=>null);
    if(!st||!st.isFile())return send(res,404,{error:'Not found'});
    const etag=`W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers={'Content-Type':STATIC_TYPES[path.extname(filename).toLowerCase()]||'application/octet-stream','Cache-Control':'public, max-age=86400, stale-while-revalidate=604800',ETag:etag,'Last-Modified':st.mtime.toUTCString(),...SECURITY};
    if(matches(req,etag)){res.writeHead(304,headers);return res.end();}
    headers['Content-Length']=st.size;res.writeHead(200,headers);
    return res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch(error){console.error('Request failed:',error.message);if(!res.headersSent)send(res,503,{error:'Library storage unavailable. Your changes remain in this browser.'});else res.end();}
});
// Reverse proxies reuse connections for longer than Node's 5 second default, which otherwise causes sporadic 502s.
server.keepAliveTimeout=65000;server.headersTimeout=66000;
if(process.argv[1]===fileURLToPath(import.meta.url)){
  server.listen(port,'0.0.0.0',()=>console.log(`Library listening on ${port}`));
  // A deploy sends SIGTERM: stop accepting connections, let in-flight saves finish, then exit.
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{console.log(`${signal} received, shutting down`);server.close(()=>process.exit(0));server.closeIdleConnections?.();setTimeout(()=>process.exit(0),10000).unref();});
}
