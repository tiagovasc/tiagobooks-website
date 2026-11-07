import {readFile,writeFile,rename,copyFile} from 'node:fs/promises';

// TBR metadata stays immutable. Each selected discovery gets an independent private
// Supabase Storage object, using the website's existing server-only service key.
const BUCKET='tiagovf-book-favorites';
export function createTbrFavoritesStore({url,key,localFile,request=fetch}){
  let queue=Promise.resolve();
  let bucketReady=false;
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  async function remote(route,method,body,extra={}){
    const r=await request(`${url}/storage/v1/${route}`,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(!r.ok){const data=await r.json().catch(()=>({}));const error=new Error('Favorite storage unavailable');error.status=Number(data.statusCode)||r.status;throw error;}
    return r.json();
  }
  async function local(){try{return JSON.parse(await readFile(localFile,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  return {
    async list(){
      if(localFile)return local();
      const ids=[];
      for(let offset=0;offset<10000;offset+=1000){
        let rows;try{rows=await remote(`object/list/${BUCKET}`,'POST',{prefix:'',limit:1000,offset,sortBy:{column:'name',order:'asc'}});}catch(e){if(e.status===404)return [];throw e;}
        for(const item of rows)if(item.id&&/^[A-Za-z0-9_-]+\.json$/.test(item.name))ids.push(item.name.slice(0,-5));
        if(rows.length<1000)return ids;
      }
      throw Error('Favorite storage exceeded its supported size');
    },
    set(id,favorite){
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(id)||typeof favorite!=='boolean')throw Error('Invalid favorite');
      if(localFile){
        const op=queue.then(async()=>{
          const ids=new Set(await local());favorite?ids.add(id):ids.delete(id);
          await copyFile(localFile,localFile+'.previous').catch(e=>{if(e.code!=='ENOENT')throw e;});
          await writeFile(localFile+'.pending',JSON.stringify([...ids].sort())+'\n');await rename(localFile+'.pending',localFile);
        });queue=op.catch(()=>{});return op;
      }
      return (async()=>{
        if(favorite){
          if(!bucketReady){
            try{await remote('bucket','POST',{id:BUCKET,name:BUCKET,public:false,file_size_limit:1024,allowed_mime_types:['application/json']});}catch(e){if(![400,409].includes(e.status))throw e;}
            bucketReady=true;
          }
          await remote(`object/${BUCKET}/${id}.json`,'POST',{favorite:true},{'x-upsert':'true'});
        }else{
          try{await remote(`object/${BUCKET}`,'DELETE',{prefixes:[id+'.json']});}catch(e){if(e.status!==404)throw e;}
        }
      })();
    }
  };
}
