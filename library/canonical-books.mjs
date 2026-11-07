import {createHash} from 'node:crypto';

export const isLibraryMember=book=>book.library_member!==false;
const clone=value=>JSON.parse(JSON.stringify(value));
const unique=values=>[...new Set(values)];
const identity=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const unionRecords=(a=[],b=[])=>[...new Map([...a,...b].map(value=>[JSON.stringify(value),value])).values()];

export function reconcileRecords(original,catalogue,plan,legacyFavorites=[]){
  const byId=new Map(original.map(b=>[String(b.id),b]));
  if(byId.size!==original.length)throw Error('Canonical database contains duplicate IDs');
  const groups=new Map();
  for(const membership of catalogue.books){
    if(!membership.book_id)throw Error('A membership lacks its reviewed book reference');
    if(!groups.has(membership.book_id))groups.set(membership.book_id,[]);
    groups.get(membership.book_id).push(membership);
  }
  const series=plan.series_expansion;
  const required=[...groups.keys(),...(series?[series.parent_id,...series.volumes.map(b=>b.id)]:[])];
  if(required.every(id=>byId.get(id)?.book_identity_version===plan.version))return {books:original,changed:false};
  const result=clone(original),positions=new Map(result.map((b,i)=>[String(b.id),i])),favorites=new Set(legacyFavorites);
  if(series&&!byId.get(series.parent_id)?.series_original_record){
    const parent=byId.get(series.parent_id);
    if(!parent||parent.title!==series.expected_title)throw Error('Series original changed');
    const collection={...clone(parent),series_original_record:clone(parent),library_member:false,record_type:'collection',component_book_ids:series.volumes.map(b=>b.id),book_identity_version:plan.version};
    result[positions.get(series.parent_id)]=collection;
    for(const volume of series.volumes){
      if(byId.has(volume.id))throw Error('Volume ID already exists');
      const next={...clone(volume),owned:true,read_status:volume.volume===1?'read':'unread',rating:0,tags:volume.volume===1?[]:['owned_unread'],series:parent.title,series_parent_id:parent.id,format:parent.format,publisher:parent.publisher,publication_year:parent.publication_year,cover:parent.cover,cover_note:'Cover of the complete eight-volume set',subject:parent.subject,book_identity_version:plan.version};
      positions.set(next.id,result.length);result.push(next);byId.set(next.id,next);
    }
    byId.set(series.parent_id,collection);
  }
  for(const [id,memberships] of groups){
    const old=byId.get(id);
    if(old?.book_identity_version===plan.version&&old.tbr_ids?.every(tid=>memberships.some(m=>m.id===tid))&&memberships.every(m=>old.tbr_ids?.includes(m.id)))continue;
    if(old){
      const expected=plan.expected_library[id];
      const volume=series?.volumes.find(b=>b.id===id);
      if(!volume&&(!expected||identity(old.title)!==identity(expected.title)||identity(old.author)!==identity(expected.author)))throw Error('Reviewed library identity changed: '+id);
    }else if(plan.expected_library[id])throw Error('Reviewed library book is missing: '+id);
    const preferred=[...memberships].sort((a,b)=>(a.sources.includes('bookshops')?0:a.sources.includes('online')?1:2)-(b.sources.includes('bookshops')?0:b.sources.includes('online')?1:2))[0];
    const next=old?clone(old):{...clone(preferred),id,library_member:false,rating:0};
    next.tbr_ids=unique([...(next.tbr_ids||[]),...memberships.map(m=>m.id)]);
    next.tbr_sources=unique([...(next.tbr_sources||[]),...memberships.flatMap(m=>m.sources)]);
    next.discovery_records=unionRecords(next.discovery_records,memberships);
    if(memberships.some(m=>favorites.has(m.id)))next.favorite=true;
    next.book_identity_version=plan.version;
    if(old)result[positions.get(id)]=next;else result.push(next);
  }
  if(new Set(result.map(b=>b.id)).size!==result.length)throw Error('Canonical identity collision');
  if(result.filter(isLibraryMember).length!==plan.library_memberships)throw Error('Unexpected Library membership count');
  const allowed=new Set(['tbr_ids','tbr_sources','discovery_records','favorite','book_identity_version']);
  for(const old of original){
    const after=result.find(b=>b.id===old.id);
    if(series&&old.id===series.parent_id){
      if(JSON.stringify(after.series_original_record)!==JSON.stringify(old))throw Error('Original set data not preserved');
      continue;
    }
    for(const key of Object.keys(old))if(!allowed.has(key)&&JSON.stringify(old[key])!==JSON.stringify(after[key]))throw Error('Protected library field changed: '+old.id+'/'+key);
    if(old.favorite===true&&after.favorite!==true)throw Error('Favorite lost');
    for(const field of ['tbr_ids','tbr_sources','discovery_records'])for(const value of old[field]||[])if(!(after[field]||[]).some(v=>JSON.stringify(v)===JSON.stringify(value)))throw Error('Original association lost');
  }
  return {books:result,changed:JSON.stringify(original)!==JSON.stringify(result)};
}

export function mergeLibrarySave(previous,incoming){
  if(incoming.some(b=>b.library_member===false))throw Error('Library save contains hidden canonical records');
  const existing=new Map(previous.map(b=>[String(b.id),b]));
  const ids=new Set(incoming.map(b=>String(b.id)));
  for(const b of incoming)if(existing.has(b.id)&&!isLibraryMember(existing.get(b.id)))throw Error('Canonical ID already belongs to another membership');
  const main=incoming.map(b=>{
    const old=existing.get(String(b.id));if(!old)return b;
    const next={...b};
    for(const field of ['tbr_ids','tbr_sources','applied_corrections'])if(old[field])next[field]=unique([...old[field],...(b[field]||[])]);
    if(old.discovery_records)next.discovery_records=unionRecords(old.discovery_records,b.discovery_records);
    if(old.book_identity_version)next.book_identity_version=old.book_identity_version;
    return next;
  });
  // Removing a book from Library removes that membership only. Its TBR identity
  // and complete historical record remain available to the other lists.
  return [...main,...previous.filter(b=>!ids.has(String(b.id))).map(b=>isLibraryMember(b)&&b.tbr_ids?.length?{...b,library_member:false}:b).filter(b=>!isLibraryMember(b))];
}

export function projectTbrCatalogue(catalogue,books){
  const byId=new Map(books.map(b=>[String(b.id),b]));
  const fields=['title','author','additional_authors','subtitle','cover','description','publisher','publication_year','owned','read_status','rating','favorite'];
  return {...catalogue,books:catalogue.books.map(m=>{
    const book=byId.get(m.book_id);if(!book?.book_identity_version)return {...m,canonical_ready:false};
    const out={...m,canonical_ready:!!book.book_identity_version};
    for(const field of fields)if(book[field]!==undefined)out[field]=book[field];
    if(m.title!==out.title)out.source_title=m.title;
    if(m.author!==out.author)out.source_author=m.author;
    if(isLibraryMember(book))out.library_id=String(book.id);else delete out.library_id;
    return out;
  })};
}

export function canonicalFavoriteIds(catalogue,books,legacy=[]){
  const byId=new Map(books.map(b=>[String(b.id),b])),old=new Set(legacy);
  return catalogue.books.filter(m=>{
    const book=byId.get(m.book_id);
    return book?.book_identity_version?book.favorite===true:old.has(m.id);
  }).map(m=>m.id);
}

export function createReconciliationBackup(url,key,request=fetch){
  const bucket='tiagovf-library-backups',headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  async function get(path){const r=await request(`${url}/storage/v1/object/authenticated/${bucket}/${path}`,{headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Backup readback failed');return r.text();}
  async function put(path,raw){const r=await request(`${url}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{...headers,'x-upsert':'true'},body:raw,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Backup write failed');if(await get(path)!==raw)throw Error('Backup readback differs');}
  return {
    async preserve(row,version){
      const r=await request(`${url}/storage/v1/bucket`,{method:'POST',headers,body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:25000000,allowed_mime_types:['application/json']}),signal:AbortSignal.timeout(10000)});
      if(!r.ok){const data=await r.json().catch(()=>({}));if(![400,409].includes(Number(data.statusCode)||r.status))throw Error('Private backup bucket unavailable');}
      const info=await request(`${url}/storage/v1/bucket/${bucket}`,{headers,signal:AbortSignal.timeout(10000)});
      if(!info.ok||(await info.json()).public!==false)throw Error('Backup bucket must be private');
      const raw=JSON.stringify(row),sha256=hash(raw),object=`${version}/revision-${row.revision}-${sha256}.json`;
      await put(object,raw);
      return {backup_object:object,backup_sha256:sha256,backup_verified:true};
    },
    async receipt(version,value){await put(`${version}/receipt.json`,JSON.stringify(value));},
    async readReceipt(version){return JSON.parse(await get(`${version}/receipt.json`));},
    async optionalReceipt(version){
      const r=await request(`${url}/storage/v1/object/authenticated/${bucket}/${version}/receipt.json`,{headers,signal:AbortSignal.timeout(30000)});
      if(r.ok)return r.json();const data=await r.json().catch(()=>({}));if(r.status===404||Number(data.statusCode)===404)return null;throw Error('Recovery receipt unavailable');
    }
  };
}

export async function runBookReconciliation({db,catalogue,plan,legacyFavorites,backup}){
  if(!plan.activate)return {state:'ready',enabled:false,version:plan.version,compatible:true};
  for(let attempt=0;attempt<5;attempt++){
    const [row]=await db('GET','?id=eq.library&select=*');if(!row)throw Error('Library is not initialized');
    const change=reconcileRecords(row.books,catalogue,plan,await legacyFavorites());
    if(!change.changed){
      const receipt=await backup.readReceipt(plan.version);
      return {...receipt,state:'applied',enabled:true,current_revision:row.revision,already_applied:true,compatible:true};
    }
    const preserved=await backup.preserve(row,plan.version);
    const receipt={...preserved,state:'prepared',version:plan.version,enabled:true,compatible:true,
      before_revision:row.revision,after_revision:row.revision+1,canonical_books:change.books.length,
      library_memberships:change.books.filter(isLibraryMember).length,tbr_memberships:catalogue.books.length,
      all_original_library_fields_preserved:true,all_source_records_preserved:true};
    await backup.receipt(plan.version,receipt);
    const updated=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:change.books,revision:row.revision+1,updated_at:new Date().toISOString()});
    if(!updated.length)continue;
    if(updated[0].revision!==row.revision+1||JSON.stringify(updated[0].books)!==JSON.stringify(change.books))throw Error('Reconciliation write readback differs');
    receipt.state='applied';await backup.receipt(plan.version,receipt);
    return receipt;
  }
  throw Error('Library changed repeatedly during reconciliation; no stale state was overwritten');
}
