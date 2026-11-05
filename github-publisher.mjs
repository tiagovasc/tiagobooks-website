import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export class PublishError extends Error {
  constructor(status,message){super(message);this.status=status}
}
export const validEntry=file=>typeof file==='string'&&/^(posts|pages)\/[a-zA-Z0-9_-]+\.md$/.test(file);
// Public GitHub host key, pinned to the fingerprint in GitHub's SSH documentation.
const hostKey='[ssh.github.com]:443 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n';

// No working tree or user-supplied Git commands. Only the selected content blob
// changes; a normal, non-forced push protects commits from other editors.
export function createPublisher({repository,branch,sshKey,remoteUrl}={}){
  let ready,queue=Promise.resolve(),directory,env;
  const run=(args,input)=>new Promise((resolve,reject)=>{
    const child=execFile('git',args,{cwd:directory,env,encoding:'utf8',maxBuffer:8*1024*1024,timeout:90000,windowsHide:true},(error,stdout)=>error?reject(error):resolve(stdout));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
  async function initialize(){
    if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'')||!branch||!(/^[\w/-]+$/.test(branch))||branch.split('/').some(p=>!p||p.startsWith('-'))||(!remoteUrl&&!sshKey))throw new PublishError(503,'Publishing is not configured. Please try again later.');
    directory=await mkdtemp(path.join(os.tmpdir(),'tiago-publisher-'));
    env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Tiago Faleiro',GIT_AUTHOR_EMAIL:'39215546+tiagovasc@users.noreply.github.com',GIT_COMMITTER_NAME:'Tiago Faleiro',GIT_COMMITTER_EMAIL:'39215546+tiagovasc@users.noreply.github.com'};
    if(!remoteUrl){
      const keyFile=path.join(directory,'identity'),hosts=path.join(directory,'known_hosts');
      await writeFile(keyFile,sshKey.trim()+'\n',{mode:0o600});await writeFile(hosts,hostKey,{mode:0o600});
      const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
      env.GIT_SSH_COMMAND=`ssh -F /dev/null -i ${quote(keyFile)} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${quote(hosts)} -o ConnectTimeout=15`;
    }
    await run(['init','--bare','.']);
    await mkdir(path.join(directory,'no-hooks'));
    await run(['config','core.hooksPath',path.join(directory,'no-hooks')]);
    await run(['remote','add','origin',remoteUrl||`ssh://git@ssh.github.com:443/${repository}.git`]);
    await run(['config','remote.origin.promisor','true']);
    await run(['config','remote.origin.partialclonefilter','blob:none']);
    env.GIT_INDEX_FILE=path.join(directory,'editor-index');
  }
  function operation(fn){
    const result=queue.then(async()=>{
      try{
        ready??=initialize().catch(error=>{ready=null;throw error});await ready;
        await run(['fetch','--quiet','--depth=1','--filter=blob:none','origin',`refs/heads/${branch}`]);
        const head=(await run(['rev-parse','FETCH_HEAD'])).trim();
        return await fn(head);
      }catch(error){if(error instanceof PublishError)throw error;throw new PublishError(503,'Could not reach the publishing service. Your text is still in the editor. Reload the entry before retrying if a save was interrupted.');}
    });queue=result.catch(()=>{});return result;
  }
  async function blob(head,file){
    if(!validEntry(file))throw new PublishError(400,'Invalid entry path');
    const entry=(await run(['ls-tree',head,'--','src/content/'+file])).trim();
    if(!entry)return null;
    const match=entry.match(/^(100644|100755) blob ([a-f0-9]{40})\t/);
    if(!match)throw new PublishError(400,'This entry cannot be edited here.');
    return {mode:match[1],revision:match[2]};
  }
  return {
    list:()=>operation(async head=>({mode:'github',files:(await run(['ls-tree','-r','--name-only',head,'--','src/content/posts','src/content/pages'])).split('\n').map(f=>f.replace(/^src\/content\//,'')).filter(validEntry).sort()})),
    read:file=>operation(async head=>{
      const entry=await blob(head,file);if(!entry)throw new PublishError(404,'Entry not found');
      return {revision:entry.revision,text:await run(['cat-file','blob',entry.revision])};
    }),
    save:({file,text,revision})=>operation(async head=>{
      const prior=await blob(head,file);
      if(revision!==(prior?.revision||'new'))throw new PublishError(409,'This entry changed in another session. Copy your edits, reload the entry, and compare before publishing.');
      const next=(await run(['hash-object','-w','--stdin'],text)).trim();
      if(prior?.revision===next)return {ok:true,revision:next,unchanged:true};
      await run(['read-tree',head]);
      await run(['update-index','--add','--cacheinfo',prior?.mode||'100644',next,'src/content/'+file]);
      const tree=(await run(['write-tree'])).trim();
      const commit=(await run(['commit-tree',tree,'-p',head],`Publish ${file} through the website editor\n`)).trim();
      try{await run(['push','--porcelain','origin',`${commit}:refs/heads/${branch}`])}
      catch{throw new PublishError(409,'Publishing could not be confirmed, or another edit arrived first. Copy your text and reload the entry before trying again.');}
      return {ok:true,revision:next,commit,unchanged:false};
    }),
  };
}
