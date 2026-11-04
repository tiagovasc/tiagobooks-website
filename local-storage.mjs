import {readFile,writeFile,rename,copyFile} from 'node:fs/promises';
let queue=Promise.resolve();
export function localDB(file,method,query,body){
  const op=queue.then(async()=>{
    const row=JSON.parse(await readFile(file,'utf8'));
    const requested=new URLSearchParams(query).get('revision')?.replace('eq.','');
    if(requested&&Number(requested)!==row.revision)return [];
    if(method==='GET')return [row];
    if(method!=='PATCH')throw Error('Unsupported local storage method');
    const next={...row,...body};const temp=file+'.pending';
    await copyFile(file,file+'.revision-'+row.revision+'.json');
    await writeFile(temp,JSON.stringify(next)+'\n',{flag:'w'});
    await rename(temp,file);return [next];
  });queue=op.catch(()=>{});return op;
}
