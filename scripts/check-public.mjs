import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {load} from 'js-yaml';
import {assertPublicTripDates} from '../library/trip-privacy.mjs';

// Inspect tracked and non-ignored new files. Never print matched secret values.
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const errors=[];
for(const file of files){
  if(/^(?:private|data|deploy|\.local|node_modules|dist|\.astro)\//.test(file)||(/(?:^|\/)\.env(?:\.|$)/.test(file)&&file!=='.env.example')||/\.(?:bundle|dpapi|pem|key)$/.test(file))errors.push(`${file}: private/generated file`);
  let data;try{data=readFileSync(file)}catch(error){if(error.code==='ENOENT')continue;throw error}
  if(data.includes(0))continue;
  const text=data.toString('utf8');
  if(/^library\/tbr-(?:bookshops|catalogue)\.json$/.test(file)){
    try{assertPublicTripDates(JSON.parse(text))}catch(error){errors.push(`${file}: ${error.message}`)}
  }
  if(/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(text))errors.push(`${file}: credential pattern`);
  if(/(?:[A-Z]:[\\/](?:Users|OneDrive)[\\/]|\/(?:Users|home)\/[^/\s]+\/)/.test(text))errors.push(`${file}: personal machine path`);
  if(/^src\/content\/.*\.mdx?$/.test(file)){
    const frontmatter=text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if(!frontmatter){errors.push(`${file}: missing frontmatter`);continue}
    const meta=load(frontmatter[1]);
    if(['draft','unlisted','protected'].some(key=>meta?.[key]))errors.push(`${file}: non-public content belongs outside this repository`);
  }
}
if(!/^var SEED = \[\];\r?$/m.test(readFileSync('library/index.html','utf8')))errors.push('library/index.html: embedded personal catalogue');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`Public-source guard passed (${files.length} files). Review diffs and commit identity before pushing.`);
