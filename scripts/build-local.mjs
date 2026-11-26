import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,renameSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const astroPackage = require.resolve('astro/package.json');
const astroCli = path.resolve(path.dirname(astroPackage), require(astroPackage).bin.astro);
// Keep the previous generated build recoverable if content validation fails.
const history=path.resolve(process.env.INTEGRATION_PRIVATE_DIR||'.local','build-history',new Date().toISOString().replace(/[:.]/g,'-'));
const hadBuild=existsSync('dist');
if(hadBuild){mkdirSync(history,{recursive:true});renameSync('dist',path.join(history,'previous'));}
const tasks=[['scripts/prepare-integration.mjs'],[astroCli,'build'],['scripts/prepare-integration.mjs','--finish'],['scripts/prepare-links.mjs'],['scripts/version-assets.mjs'],['node_modules/pagefind/lib/runner/bin.cjs','--site','dist'],['scripts/check-links.mjs']];
for(const args of tasks){const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(result.status!==0){mkdirSync(history,{recursive:true});if(existsSync('dist'))renameSync('dist',path.join(history,'failed'));if(hadBuild)renameSync(path.join(history,'previous'),'dist');process.exit(result.status||1)}}
