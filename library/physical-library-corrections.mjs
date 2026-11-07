import {isDeepStrictEqual as equal} from 'node:util';
import {stampLegacyChanges} from './sync-operations.mjs';

// Reviewed physical copies: edits are applied to the fresh canonical row only.
export function correctPhysicalLibrary(original,plan){
 const books=structuredClone(original),by=new Map(books.map(b=>[b.id,b])),changed=[],added=[];
 if(by.size!==books.length)throw Error('Duplicate canonical identity');
 const targets=new Map(plan.updates.map(t=>[t.id,t]));
 if(targets.size!==plan.updates.length)throw Error('Duplicate correction target');
 for(const target of plan.updates){
  const b=by.get(target.id);
  if(!b||b.title!==target.title||b.author!==target.author)throw Error('Physical book identity changed: '+target.id);
  for(const [field,value] of Object.entries(target.fields)){
   if(!['owned','library_member','author','cover','cover_status'].includes(field))throw Error('Unsupported physical correction');
   if(field==='cover'&&b.cover&&b.cover!==value)throw Error('Cover already filled; review newer edit');
   if(!equal(b[field],value)){b[field]=structuredClone(value);if(!changed.includes(b.id))changed.push(b.id);}
  }
 }
 for(const entry of plan.additions){
  if(by.has(entry.id))throw Error('New physical identity already exists');
  if(!entry.title||entry.owned!==true||entry.library_member!==true||entry.rating!==0)throw Error('Invalid physical addition');
  // Refuse duplicate ISBNs instead of silently creating another underlying book.
  if(entry.isbn13&&books.some(b=>String(b.isbn13||'').replace(/\D/g,'')===entry.isbn13))throw Error('ISBN already catalogued');
  const b={...structuredClone(entry),_sync_versions:{_created:plan.version}};books.push(b);by.set(b.id,b);added.push(b.id);
 }
 const stamped=stampLegacyChanges(original,books,plan.version);
 for(let i=0;i<original.length;i++){
  const allowed=new Set(Object.keys(targets.get(original[i].id)?.fields||{}));
  for(const key of new Set([...Object.keys(original[i]),...Object.keys(stamped[i])]))if(key!=='_sync_versions'&&!allowed.has(key)&&!equal(original[i][key],stamped[i][key]))throw Error('Protected physical data changed');
  for(const [key,value] of Object.entries(original[i]._sync_versions||{}))if(!allowed.has(key)&&!equal(value,stamped[i]._sync_versions?.[key]))throw Error('Protected edit token changed');
 }
 return {books:stamped,changed,added};
}

export async function applyPhysicalLibraryCorrections({db,backup,plan}){
 if(!plan.activate)return {state:'ready',enabled:false,version:plan.version};
 const prior=await backup.optionalReceipt(plan.version);
 for(let attempt=0;attempt<8;attempt++){
  const [row]=await db('GET','?id=eq.library&select=*');if(!row)throw Error('Library missing');
  if(prior?.state==='applied')return {...prior,already_applied:true,current_revision:row.revision};
  if(prior?.state==='prepared'){
   // A lost response is only recoverable when this exact operation is committed.
   const additions=plan.additions.every(b=>row.books.some(x=>x.id===b.id&&x._sync_versions?._created===plan.version));
   const updates=plan.updates.every(t=>{const b=row.books.find(x=>x.id===t.id);return b&&Object.entries(t.fields).every(([f,v])=>equal(b[f],v));});
   if(!additions||!updates)throw Error('Interrupted physical correction needs review');
   const receipt={...prior,state:'applied',current_revision:row.revision};await backup.receipt(plan.version,receipt);return receipt;
  }
  const change=correctPhysicalLibrary(row.books,plan);
  const preserved=await backup.preserve(row,plan.version);if(!preserved.backup_verified)throw Error('Physical correction backup not verified');
  const receipt={...preserved,state:'prepared',enabled:true,version:plan.version,before_revision:row.revision,after_revision:row.revision+1,changed_ids:change.changed,added_ids:change.added,all_original_records_retained:true,unrelated_fields_preserved:true,field_versions_preserved:true};
  await backup.receipt(plan.version,receipt);
  const result=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:change.books,revision:row.revision+1,updated_at:new Date().toISOString()});
  if(!result.length)continue;
  if(result[0].revision!==row.revision+1||!equal(result[0].books,change.books))throw Error('Physical correction readback differs');
  receipt.state='applied';await backup.receipt(plan.version,receipt);return receipt;
 }
 throw Error('Concurrent edits prevented safe physical corrections');
}

// An owner can withdraw a proposed addition while a release is already rolling out.
export async function withdrawPhysicalAdditions({db,backup,plan}){
 if(!plan.activate||!plan.withdrawn_ids?.length)return {state:'not_needed'};
 const version=plan.version+'-withdrawal';
 const prior=await backup.optionalReceipt(version);if(prior?.state==='applied')return prior;
 for(let attempt=0;attempt<8;attempt++){
  const [row]=await db('GET','?id=eq.library&select=*');
  const targets=row.books.filter(b=>plan.withdrawn_ids.includes(b.id));
  if(!targets.length)return {state:'not_present'};
  if(targets.some(b=>b._sync_versions?._created!==plan.version||Object.keys(b._sync_versions).some(k=>k!=='_created')||b.favorite||b.rating||b.read_status!=='unread'))throw Error('Withdrawn addition has later owner edits; review before removal');
  const preserved=await backup.preserve(row,version);if(!preserved.backup_verified)throw Error('Withdrawal backup not verified');
  const books=row.books.filter(b=>!plan.withdrawn_ids.includes(b.id));
  const result=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books,revision:row.revision+1,updated_at:new Date().toISOString()});
  if(!result.length)continue;
  if(!equal(result[0].books,books))throw Error('Withdrawal readback differs');
  const receipt={...preserved,state:'applied',removed_ids:targets.map(b=>b.id),before_revision:row.revision,after_revision:row.revision+1,all_other_records_preserved:true};await backup.receipt(version,receipt);return receipt;
 }
 throw Error('Concurrent edits prevented withdrawal');
}
