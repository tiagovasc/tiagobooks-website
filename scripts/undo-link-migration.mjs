import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {undoChanges} from '../src/lib/markdown-links.mjs';
const file=process.argv[2];if(!file)throw new Error('Provide the migration receipt path.');
const receipt=JSON.parse(readFileSync(file,'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const restored=[];
for(const record of receipt.records){
  const target=resolve(record.file);
  if(!target.startsWith(resolve('src/content')+sep))throw new Error('Receipt target is outside content.');
  const current=readFileSync(target,'utf8');
  if(hash(current)!==record.afterSha)throw new Error(`Content has changed since migration: ${record.file}`);
  const before=undoChanges(current,record.changes);
  if(hash(before)!==record.beforeSha)throw new Error('Receipt cannot restore the original bytes.');
  restored.push({target,before});
}
for(const {target,before} of restored){writeFileSync(target,before);if(hash(readFileSync(target,'utf8'))!==hash(before))throw new Error('Restore verification failed');}
console.log(`Restored ${restored.length} files; retained the receipt.`);
