import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';
// Keep the previous generated build recoverable if content validation fails.
const history=path.resolve(process.env.INTEGRATION_PRIVATE_DIR||'.local','build-history',new Date().toISOString().replace(/[:.]/g,'-'));
const hadBuild=existsSync('dist');
if(hadBuild){mkdirSync(history,{recursive:true});renameSync('dist',path.join(history,'previous'));}
const tasks=[['scripts/prepare-integration.mjs'],['node_modules/astro/astro.js','build'],['scripts/prepare-integration.mjs','--finish'],['scripts/prepare-links.mjs'],['node_modules/pagefind/lib/runner/bin.cjs','--site','dist'],['scripts/check-links.mjs']];
for(const args of tasks){const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(result.status!==0){mkdirSync(history,{recursive:true});if(existsSync('dist'))renameSync('dist',path.join(history,'failed'));if(hadBuild)renameSync(path.join(history,'previous'),'dist');process.exit(result.status||1)}}
