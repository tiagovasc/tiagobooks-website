import {load} from 'js-yaml';
import {readBody} from './library/http-utils.mjs';
import {createPublisher,PublishError,validEntry} from './github-publisher.mjs';
import {isExternalArticleUrl} from './src/lib/linked-post.mjs';

export function validatePublicEntry(file,text,secrets=[]){
  if(!validEntry(file))throw new PublishError(400,'Invalid entry path');
  if(typeof text!=='string'||text.includes('\0'))throw new PublishError(400,'Enter Markdown text.');
  const front=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!front)throw new PublishError(400,'Keep the complete YAML metadata block.');
  let m;try{m=load(front[1],{maxAliasCount:50})}catch{throw new PublishError(400,'Invalid YAML metadata.');}
  const invalid=()=>{throw new PublishError(400,'Check the metadata: title, dates, tags, image credits and crop values must have valid types.');};
  if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.title!=='string'||!m.title.trim())invalid();
  if(file.startsWith('posts/')&&m.date===undefined)invalid();
  for(const field of ['date','updated'])if(m[field]!==undefined&&(m[field]===null||!Number.isFinite(new Date(m[field]).getTime())))invalid();
  for(const field of ['draft','unlisted','protected'])if(m[field]!==undefined&&m[field]!==false)throw new PublishError(400,'Only public entries can be published here. Keep private drafts outside the public repository.');
  for(const field of ['subtitle','description','image','thumbnail'])if(m[field]!==undefined&&typeof m[field]!=='string')invalid();
  if(m.externalUrl!==undefined&&m.externalUrl!==''&&!isExternalArticleUrl(m.externalUrl))invalid();
  if(m.readingMinutes!==undefined&&(!Number.isInteger(m.readingMinutes)||m.readingMinutes<=0))invalid();
  for(const field of ['tags','aliases'])if(m[field]!==undefined&&(!Array.isArray(m[field])||!m[field].every(v=>typeof v==='string')))invalid();
  const url=value=>{try{return ['https:','http:'].includes(new URL(value).protocol)}catch{return false}};
  for(const field of ['spotify','apple','youtube'])if(m[field]!==undefined&&!url(m[field]))invalid();
  if(m.thumbnailCrop!==undefined){
    const c=m.thumbnailCrop;if(!c||typeof c!=='object'||Array.isArray(c))invalid();
    for(const [key,min,max] of [['x',0,100],['y',0,100],['zoom',1,3]])if(c[key]!==undefined&&(typeof c[key]!=='number'||!Number.isFinite(c[key])||c[key]<min||c[key]>max))invalid();
  }
  if(m.artwork!==undefined){
    const a=m.artwork;if(!a||typeof a!=='object'||Array.isArray(a))invalid();
    for(const key of ['title','artist','alt'])if(typeof a[key]!=='string')invalid();
    for(const key of ['year','thumbnail'])if(a[key]!==undefined&&typeof a[key]!=='string')invalid();
    for(const key of ['width','height'])if(!Number.isInteger(a[key])||a[key]<=0)invalid();
    if(a.source!==undefined&&!url(a.source))invalid();
  }
  if(/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(text)||/(?:[A-Z]:[\\/](?:Users|OneDrive)[\\/]|\/(?:Users|home)\/[^/\s]+\/)/.test(text)||secrets.some(secret=>secret&&text.includes(secret)))throw new PublishError(400,'This entry appears to contain a credential or private machine path. Remove it before publishing.');
}

export function productionEditorHandler({authenticated,publisher,siteUrl=process.env.SITE_URL,secrets}={}){
  const store=publisher||createPublisher({repository:process.env.CMS_REPOSITORY,branch:process.env.CMS_BRANCH,sshKey:process.env.CMS_GIT_SSH_KEY});
  const sensitive=secrets||['LIBRARY_PASSWORD','SESSION_SECRET','SUPABASE_SECRET_KEY','CMS_GIT_SSH_KEY'].map(key=>process.env[key]).filter(Boolean);
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  return async(req,res)=>{
    try{
      if(!authenticated(req))throw new PublishError(401,'Sign in with your site password to edit. Your unsaved text remains in this tab.');
      const url=new URL(req.url,'http://localhost');
      if(url.pathname!=='/api/editor')throw new PublishError(404,'Not found');
      if(!['GET','PUT'].includes(req.method))throw new PublishError(405,'Method not allowed');
      if(req.method==='GET')return send(res,200,url.searchParams.has('file')?await store.read(url.searchParams.get('file')):await store.list());
      let origin;try{origin=new URL(siteUrl).origin}catch{throw new PublishError(503,'Publishing is not configured.');}
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')throw new PublishError(403,'Origin rejected');
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw new PublishError(415,'Send JSON content.');
      const body=await readBody(req,2*1024*1024);if(body===null)throw new PublishError(413,'Entry too large');
      let input;try{input=JSON.parse(body)}catch{throw new PublishError(400,'Invalid JSON');}
      if(!input||typeof input!=='object'||!(/^(?:new|[a-f0-9]{40})$/.test(input.revision||'')))throw new PublishError(400,'Reload the entry before publishing.');
      validatePublicEntry(input.file,input.text,sensitive);
      return send(res,200,await store.save(input));
    }catch(error){return send(res,error instanceof PublishError?error.status:503,{error:error instanceof PublishError?error.message:'Publishing is temporarily unavailable. Your text is still in the editor.'});}
  };
}
