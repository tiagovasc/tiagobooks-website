import {readFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const extra=readdirSync(root).filter(f=>f.endsWith('.md')&&f!=='README.md');
if(extra.length)throw Error('Keep detailed project Markdown in docs/: '+extra.join(', '));
const files=['README.md',...readdirSync('docs').filter(f=>f.endsWith('.md')).map(f=>'docs/'+f)];
let checked=0;
for(const file of files){
 const text=readFileSync(file,'utf8').replace(/```[\s\S]*?```/g,'');
 for(const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){
  const href=match[1];if(/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href))continue;
  const relative=decodeURIComponent(href.split('#')[0]),target=path.resolve(path.dirname(file),relative);
  if(!target.startsWith(root+path.sep)&&target!==root)throw Error(file+': documentation link leaves repository');
  if(!existsSync(target))throw Error(file+': missing documentation target '+relative);
  checked++;
 }
}
console.log(`Documentation links checked (${files.length} guides, ${checked} local links).`);
