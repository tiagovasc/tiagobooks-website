import { openSync, readSync, closeSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { planMarkdownLinks, applyChanges } from '../src/lib/markdown-links.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const records=[], skipped=[];
const apply=process.argv.includes('--apply');
const baseline=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const kind of ['posts','pages'])for(const name of readdirSync(`src/content/${kind}`)) {
  if(!name.endsWith('.md')||/private/i.test(name))continue;
  const file=`src/content/${kind}/${name}`;
  // Inspect only frontmatter before deciding whether any body may be processed.
  const fd=openSync(file,'r'),byte=Buffer.alloc(1),bytes=[];let header='';
  try {while(bytes.length<65536&&readSync(fd,byte,0,1,null)){
    bytes.push(byte[0]);if(byte[0]===10){header=Buffer.from(bytes).toString('utf8');if(/^---\r?\n[\s\S]*?\r?\n---\r?\n$/.test(header))break;}
  }}finally{closeSync(fd);}
  const fm=header.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if(!fm)throw new Error(`Missing frontmatter in ${file}`);
  const meta=load(fm[1]);if(meta.protected||meta.draft||meta.unlisted||/private/i.test(meta.title||'')){skipped.push({file,reason:'Non-public content excluded'});continue;}
  const source=readFileSync(file,'utf8');
  const plan=planMarkdownLinks(source,`/${kind}/${name.slice(0,-3)}`);
  if(plan.skipped.length)throw new Error(`Manual URL review required in ${file}`);
  if(!plan.changes.length)continue;
  const next=applyChanges(source,plan.changes);
  // A real, matching Git object is required before source changes are written.
  if(apply&&execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8',maxBuffer:10*1024*1024}).replace(/\r\n/g,'\n')!==source.replace(/\r\n/g,'\n'))throw new Error(`Commit current content before migration: ${file}`);
  records.push({file,beforeSha:hash(source),afterSha:hash(next),changes:plan.changes});
}
const report={baseline,files:records.length,links:records.reduce((n,r)=>n+r.changes.length,0),skipped,records};
writeFileSync('data/links-plan.json',JSON.stringify(report,null,2));
if(apply&&records.length) {
  const receipt=`data/link-migration-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  writeFileSync(receipt,JSON.stringify(report,null,2),{flag:'wx'});
  for(const record of records){
    const source=readFileSync(record.file,'utf8');if(hash(source)!==record.beforeSha)throw new Error('Content changed after planning');
    writeFileSync(record.file,applyChanges(source,record.changes));
    if(hash(readFileSync(record.file,'utf8'))!==record.afterSha)throw new Error('Post-write verification failed');
  }
  console.log(`Applied ${report.links} URL changes in ${report.files} files. Receipt: ${receipt}`);
}else console.log(`${apply?'No changes needed.':'Preview only.'} ${report.links} URL changes in ${report.files} files; ${skipped.length} non-public files excluded.`);
