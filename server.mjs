import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import zlib from 'node:zlib';
import {server as library,authenticated} from './library/server.mjs';
import {editorHandler} from './editor-api.mjs';
import {productionEditorHandler} from './production-editor-api.mjs';
import {personalizeSiteHeader} from './src/lib/site-shell.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),dist=path.join(root,'dist');
process.env.LIBRARY_PAGE_FILE??=path.join(dist,'library.html');
const privateRoot=process.env.INTEGRATION_PRIVATE_DIR||path.resolve(root,'../private');
const editor=process.env.NODE_ENV==='production'?productionEditorHandler({authenticated}):editorHandler({root,privateRoot,authenticated});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.mp3':'audio/mpeg','.mp4':'video/mp4','.pdf':'application/pdf','.webm':'video/webm'};
const csp="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://open.spotify.com https://embed.podcasts.apple.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
const editorCsp="default-src 'self'; script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://api.github.com https://github.com https://raw.githubusercontent.com; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN'};
function reply(res,status,body,extra={}){res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8',...headers,...extra});res.end(body)}
// Text files are read, hashed and compressed once per version (keyed by mtime and size) instead of on every request.
const textCache=new Map(),compressible=/text|javascript|json|xml|svg/;
async function textVariant(file,st){
  const stamp=st.mtimeMs+':'+st.size;let entry=textCache.get(file);
  if(!entry||entry.stamp!==stamp){const raw=await readFile(file);entry={stamp,raw,etag:'"'+createHash('sha256').update(raw).digest('hex').slice(0,24)+'"'};if(textCache.size>1000)textCache.clear();textCache.set(file,entry)}
  return entry;
}
function encodedBody(entry,req){
  const accept=String(req.headers['accept-encoding']||'');
  if(/\bbr\b/.test(accept))return ['br',entry.br??=zlib.brotliCompressSync(entry.raw,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:9,[zlib.constants.BROTLI_PARAM_SIZE_HINT]:entry.raw.length}})];
  if(/\bgzip\b/.test(accept))return ['gzip',entry.gz??=zlib.gzipSync(entry.raw,{level:9})];
  return [null,entry.raw];
}
// Content-hashed build output never changes under the same name, so browsers may keep it for a year.
function cacheControl(p){
  if(p.startsWith('/admin'))return 'no-store';
  if(p.startsWith('/_astro/')||/^\/pagefind\/(fragment|index)\//.test(p)||/^\/pagefind\/pagefind\.[\w-]+\.pf_meta$/.test(p))return 'public, max-age=31536000, immutable';
  if(p.startsWith('/uploads/'))return 'public, max-age=86400, stale-while-revalidate=604800';
  return 'no-cache';
}
let redirectCache=null;
async function redirectMap(){
  const file=path.join(dist,'_redirects'),st=await stat(file),stamp=st.mtimeMs+':'+st.size;
  if(redirectCache?.stamp!==stamp)redirectCache={stamp,map:new Map((await readFile(file,'utf8')).split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#')).map(l=>{const [from,to,status]=l.trim().split(/\s+/);return [from,{to,status:Number(status)||301}]}))};
  return redirectCache.map;
}
export const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),p=url.pathname;
    if(p==='/editor'&&process.env.NODE_ENV==='production'&&!authenticated(req))return reply(res,302,'Sign in to edit',{Location:'/login?next=%2Feditor','Cache-Control':'no-store'});
    if(p==='/api/session')return reply(res,200,JSON.stringify({canEdit:authenticated(req)}),{'Content-Type':'application/json','Cache-Control':'no-store'});
    if(p.startsWith('/api/editor'))return await editor(req,res);
    if(p==='/healthz'){await stat(path.join(dist,'blog.html'));await stat(path.join(dist,'pagefind/pagefind.js'));req.url='/health';return library.emit('request',req,res)}
    if(p==='/'&&url.searchParams.get('collection')==='tbr')return reply(res,302,'Open the library',{Location:'/library'+url.search,'Cache-Control':'no-store'});
    if(p==='/library'){req.url='/'+url.search;return library.emit('request',req,res)}
    if(['/books.json','/book-descriptions.json','/book-description','/save','/login','/logout','/health','/tbr.js','/tbr.css','/tbr-bookshops.json','/favicon.svg','/favicon.ico','/apple-touch-icon.png'].includes(p)||p.startsWith('/covers/'))return library.emit('request',req,res);
    if(!['GET','HEAD'].includes(req.method))return reply(res,405,'Method not allowed');
    if(p==='/admin/config.yml'){
      const repo=process.env.CMS_REPOSITORY;
      if(!repo||!/^[-\w.]+\/[-\w.]+$/.test(repo)||['tiagovasc/tiagovf-site','tiagovasc/book-library'].includes(repo.toLowerCase()))return reply(res,503,'Configure an independent integration CMS_REPOSITORY before remote editing.',{'Cache-Control':'no-store'});
      const branch=process.env.CMS_BRANCH||'main';if(!/^[\w./-]+$/.test(branch))return reply(res,503,'Invalid CMS branch');
      const config=(await readFile(path.join(dist,'admin/config.yml'),'utf8')).replace(/^  repo:.*$/m,'  repo: '+repo).replace(/^  branch:.*$/m,'  branch: '+branch);
      return reply(res,200,config,{'Content-Type':'text/yaml; charset=utf-8','Cache-Control':'no-store'});
    }
    if(p==='/admin/'||p==='/admin'){
      if(!process.env.CMS_REPOSITORY)return reply(res,503,'The remote editor needs its own repository. Use /editor for local Markdown editing.',{'Cache-Control':'no-store'});
    }
    let decoded;try{decoded=decodeURIComponent(p)}catch{return reply(res,400,'Invalid path')}
    const redirects=await redirectMap(),fixed={'/posts':{to:'/blog',status:301},'/index.html':{to:'/',status:308},'/index':{to:'/',status:308}};
    if(p.startsWith('/tag/')){const tagFile=path.resolve(dist,'.'+decoded+'.html');if(tagFile.startsWith(dist+path.sep)&&(await stat(tagFile).catch(()=>null))?.isFile())return reply(res,301,'Redirecting',{Location:'/blog?tag='+encodeURIComponent(decoded.slice(5))});}
    const r=fixed[p]||redirects.get(p);if(r)return reply(res,r.status,'Redirecting',{Location:r.to+url.search});
    if(p.endsWith('/')&&p!=='/'&&p!=='/admin/')return reply(res,308,'Redirecting',{Location:p.slice(0,-1)+url.search});
    if(p.endsWith('.html'))return reply(res,308,'Redirecting',{Location:p.slice(0,-5)+url.search});
    if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(s=>s.startsWith('.'))||['/_headers','/_redirects'].includes(decoded))return reply(res,404,'Not found');
    const base=path.resolve(dist,p==='/'?'index.html':'.'+decoded);if(!base.startsWith(dist+path.sep))return reply(res,404,'Not found');
    let target,st;for(const candidate of [base,base+'.html',path.join(base,'index.html')]){const s=await stat(candidate).catch(()=>null);if(s?.isFile()){target=candidate;st=s;break}}
    const status=target?200:404;if(!target){target=path.join(dist,'404.html');st=await stat(target)}
    const type=p==='/posts_feed'?'application/atom+xml; charset=utf-8':types[path.extname(target)]||'application/octet-stream';const isAdmin=p.startsWith('/admin');
    const text=compressible.test(type),personalized=type.startsWith('text/html');
    let entry=text?await textVariant(target,st):null;
    if(personalized&&authenticated(req)){
      // Keep compressed owner/public variants separate, including their validators.
      entry=entry.owner??=(raw=>({raw,etag:'"'+createHash('sha256').update(raw).digest('hex').slice(0,24)+'"'}))(Buffer.from(personalizeSiteHeader(entry.raw.toString(),true)));
    }
    const tag=entry?entry.etag:'W/"'+st.size.toString(16)+'-'+Math.floor(st.mtimeMs).toString(16)+'"';
    const h={...headers,'Content-Type':type,'Cache-Control':status===404?'no-cache':cacheControl(p),ETag:tag,'Content-Security-Policy':isAdmin?editorCsp:csp,Vary:'Accept-Encoding'};
    if(personalized){h['Cache-Control']='private, no-cache';h.Vary='Accept-Encoding, Cookie';}
    if(isAdmin||p==='/editor')h['X-Robots-Tag']='noindex, nofollow';
    if(p==='/editor')h['Cache-Control']='private, no-store';
    if(status===200&&String(req.headers['if-none-match']||'').split(',').some(t=>[tag,'W/'+tag].includes(t.trim()))){res.writeHead(304,h);return res.end()}
    let body;if(entry){const [encoding,data]=encodedBody(entry,req);body=data;if(encoding)h['Content-Encoding']=encoding}else body=req.method==='HEAD'?null:await readFile(target);
    h['Content-Length']=body?body.length:st.size;res.writeHead(status,h);res.end(req.method==='HEAD'?undefined:body);
  }catch(error){console.error('Integration request failed:',error.message);if(!res.headersSent)reply(res,503,'Request unavailable');else res.end()}
});
server.keepAliveTimeout=65000;server.headersTimeout=66000;
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8740);const host=process.env.HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
  server.listen(port,host,()=>console.log(`Integrated website: http://${host}:${port}`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit());server.closeIdleConnections();setTimeout(()=>process.exit(),10000).unref()});
}
