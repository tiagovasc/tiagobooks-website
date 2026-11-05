import {readFile,writeFile,readdir,mkdir,copyFile,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readBody,sameOrigin} from './library/http-utils.mjs';
import {isExternalArticleUrl} from './src/lib/linked-post.mjs';
const hash=t=>createHash('sha256').update(t).digest('hex');
let queue=Promise.resolve(),building=false;
export function editorHandler({root,privateRoot,authenticated}){
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex'});res.end(JSON.stringify(data))};
  return async(req,res)=>{
    if(process.env.NODE_ENV==='production'||!process.env.LOCAL_LIBRARY_FILE)return send(res,404,{error:'Local editing is disabled. Use the configured GitHub editor.'});
    if(!authenticated(req))return send(res,401,{error:'Sign in with the integration library password to edit.'});
    if(!sameOrigin(req))return send(res,403,{error:'Origin rejected'});
    if(!['GET','PUT','POST'].includes(req.method))return send(res,405,{error:'Method not allowed'});
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/editor/build'&&req.method==='POST'){
      if(building)return send(res,409,{error:'A build is already running'});
      building=true;await mkdir(privateRoot,{recursive:true});
      const child=spawn(process.execPath,[path.join(root,'scripts/build-local.mjs')],{cwd:root,env:process.env,windowsHide:true});let output='';
      child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
      child.on('error',()=>{building=false;send(res,500,{error:'Could not start build'})});
      child.on('exit',async code=>{building=false;await writeFile(path.join(privateRoot,'editor-build.log'),output);send(res,code===0?200:422,code===0?{ok:true}:{error:'Build failed. Source is saved; inspect the private editor-build.log.'})});return;
    }
    if(url.pathname!=='/api/editor')return send(res,404,{error:'Not found'});
    if(req.method==='GET'&&!url.searchParams.has('file')){
      const files=[];for(const kind of ['posts','pages'])for(const f of await readdir(path.join(root,'src/content',kind)))if(/\.mdx?$/.test(f))files.push(kind+'/'+f);
      return send(res,200,{files:files.sort()});
    }
    let input={};if(req.method==='PUT'){
      const body=await readBody(req,2*1024*1024);if(body===null)return send(res,413,{error:'Entry too large'});
      try{input=JSON.parse(body)}catch{return send(res,400,{error:'Invalid JSON'})}
    }
    const file=url.searchParams.get('file')||input.file;
    if(typeof file!=='string'||!/^(posts|pages)\/[a-zA-Z0-9_-]+\.mdx?$/.test(file))return send(res,400,{error:'Invalid entry path'});
    const target=path.join(root,'src/content',file);
    if(req.method==='GET'){const text=await readFile(target,'utf8');return send(res,200,{text,revision:hash(text)})}
    if(req.method!=='PUT')return send(res,405,{error:'Method not allowed'});
    if(typeof input.text!=='string'||!/^---\r?\n[\s\S]*?\r?\n---/.test(input.text))return send(res,400,{error:'Keep the complete YAML metadata block.'});
    // Validate through the same YAML parser, while preserving source bytes on save.
    const {load}=await import('js-yaml');let metadata;try{metadata=load(input.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])}catch{return send(res,400,{error:'Invalid YAML metadata'})}
    if(typeof metadata?.title!=='string'||(file.startsWith('posts/')&&!Number.isFinite(Date.parse(metadata.date))))return send(res,400,{error:'A title and valid post date are required'});
    if(metadata.externalUrl!==undefined&&metadata.externalUrl!==''&&!isExternalArticleUrl(metadata.externalUrl))return send(res,400,{error:'Use a complete HTTPS external article URL.'});
    if(metadata.readingMinutes!==undefined&&(!Number.isInteger(metadata.readingMinutes)||metadata.readingMinutes<=0))return send(res,400,{error:'Reading minutes must be a positive whole number.'});
    const op=queue.then(async()=>{
      const prior=await readFile(target,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e});
      if(input.revision!==(prior===null?'new':hash(prior)))return send(res,409,{error:'This entry changed. Reload before saving.'});
      await mkdir(path.join(privateRoot,'editor-history'),{recursive:true});
      if(prior!==null)await copyFile(target,path.join(privateRoot,'editor-history',file.replace('/','--')+'.'+Date.now()+'.'+hash(prior).slice(0,8)));
      await writeFile(target+'.pending',input.text,'utf8');await rename(target+'.pending',target);
      send(res,200,{ok:true,revision:hash(input.text)});
    });queue=op.catch(()=>{});await op;
  };
}
