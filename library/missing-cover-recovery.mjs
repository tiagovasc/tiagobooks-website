import {isDeepStrictEqual as equal} from 'node:util';
import {stampLegacyChanges} from './sync-operations.mjs';
const coverFields=new Set(['cover','cover_status','cover_source_url','cover_image_kind']);
export function fillMissingCovers(original,targets,version){
 const books=structuredClone(original),by=new Map(books.map(b=>[b.id,b])),changedIds=[],skippedIds=[];
 if(new Set(targets.map(t=>t.id)).size!==targets.length)throw Error('Duplicate cover recovery identity');
 for(const target of targets){
  const book=by.get(target.id);if(!book)throw Error('Cover recovery book missing');
  if(book.cover){skippedIds.push(book.id);continue;}
  if(book.title!==target.title||book.author!==target.author)throw Error('Cover recovery identity changed');
  if(!target.fields?.cover||!/^covers\/tbr_metadata_[a-f0-9]{24}\.jpg$/.test(target.fields.cover)||Object.keys(target.fields).some(k=>!coverFields.has(k)))throw Error('Invalid cover recovery fields');
  Object.assign(book,target.fields);changedIds.push(book.id);
 }
 const stamped=stampLegacyChanges(original,books,version);
 for(let i=0;i<original.length;i++){
  const before=original[i],after=stamped[i];
  for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
   if(coverFields.has(field)||field==='_sync_versions')continue;
   if(!equal(before[field],after[field]))throw Error('Cover recovery changed a protected field');
  }
  for(const field of new Set([...Object.keys(before._sync_versions||{}),...Object.keys(after._sync_versions||{})]))if(!coverFields.has(field)&&before._sync_versions?.[field]!==after._sync_versions?.[field])throw Error('Cover recovery changed an unrelated field version');
 }
 return {books:stamped,changedIds,skippedIds};
}
export async function applyMissingCovers({db,backup,plan}){
 if(!plan.activate)return {state:'ready',enabled:false,version:plan.version,requested_books:plan.books.length};
 const prior=await backup.optionalReceipt(plan.version);
 for(let attempt=0;attempt<8;attempt++){
  const [row]=await db('GET','?id=eq.library&select=*');if(!row)throw Error('Library missing');
  if(prior?.state==='applied')return {...prior,already_applied:true,current_revision:row.revision};
  const change=fillMissingCovers(row.books,plan.books,plan.version);
  if(prior?.state==='prepared'&&change.changedIds.length)throw Error('Interrupted cover recovery needs review');
  if(prior?.state==='prepared'){const complete={...prior,state:'applied',already_applied:true,current_revision:row.revision};await backup.receipt(plan.version,complete);return complete;}
  const preserved=await backup.preserve(row,plan.version),revision=row.revision+(change.changedIds.length?1:0);
  const receipt={...preserved,state:'prepared',version:plan.version,enabled:true,before_revision:row.revision,after_revision:revision,requested_books:plan.books.length,filled_ids:change.changedIds,skipped_already_covered_ids:change.skippedIds,all_noncover_data_preserved:true,field_versions_preserved:true};
  await backup.receipt(plan.version,receipt);
  if(change.changedIds.length){
   const result=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:change.books,revision,updated_at:new Date().toISOString()});
   if(!result.length)continue;
   if(result[0].revision!==revision||!equal(result[0].books,change.books))throw Error('Cover recovery readback differs');
  }
  receipt.state='applied';await backup.receipt(plan.version,receipt);return receipt;
 }
 throw Error('Concurrent changes prevented safe cover recovery');
}
