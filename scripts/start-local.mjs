import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
if(process.env.NODE_ENV==='production')throw Error('Use the production entrypoint for a production deployment');
if(existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
process.env.LOCAL_LIBRARY_FILE=path.resolve(root,process.env.LOCAL_LIBRARY_FILE||'.local/library-state.json');
process.env.INTEGRATION_PRIVATE_DIR||=path.join(root,'.local');
if(!existsSync(process.env.LOCAL_LIBRARY_FILE)){
  mkdirSync(path.dirname(process.env.LOCAL_LIBRARY_FILE),{recursive:true});
  writeFileSync(process.env.LOCAL_LIBRARY_FILE,JSON.stringify({id:'library',revision:1,books:[]})+'\n',{flag:'wx'});
}
process.env.SESSION_SECRET||=randomBytes(32).toString('hex');
const {server}=await import('../server.mjs');
const port=Number(process.env.PORT||8740);
server.listen(port,'127.0.0.1',()=>console.log(`Tiago Books: http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit());server.closeIdleConnections();setTimeout(()=>process.exit(),10000).unref()});
