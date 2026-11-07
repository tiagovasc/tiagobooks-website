import {isDeepStrictEqual as equal} from 'node:util';
import {stampLegacyChanges} from './sync-operations.mjs';
const allowed=new Set(['library_member','owned','resolved_book_id','catalogue_hold','cover','cover_status','cover_source_url','cover_image_kind']);
export function identifyBooks(original,plan){
 const books=structuredClone(original),by=new Map(books.map(b=>[b.id,b])),changed=[];
 if(new Set(plan.books.map(b=>b.id)).size!==plan.books.length)throw Error('Duplicate maintenance target');
 for(const target of plan.books){
  const book=by.get(target.id);
  if(!book||book.title!==target.title||book.author!==target.author)throw Error('Maintenance identity changed');
  if(Object.keys(target.fields).some(f=>!allowed.has(f)))throw Error('Invalid maintenance field');
  if(target.fields.resolved_book_id&&!by.has(target.fields.resolved_book_id))throw Error('Resolved book missing');
  for(const [field,value] of Object.entries(target.fields)){
   if(field==='cover'&&book.cover)continue;
   if(['cover_status','cover_source_url','cover_image_kind'].includes(field)&&book.cover&&book.cover!==target.fields.cover)continue;
   if(!equal(book[field],value)){book[field]=structuredClone(value);if(!changed.includes(book.id))changed.push(book.id);}
  }
 }
 const stamped=stampLegacyChanges(original,books,plan.version),targets=new Map(plan.books.map(b=>[b.id,new Set(Object.keys(b.fields))]));
 for(let i=0;i<original.length;i++)for(const field of new Set([...Object.keys(original[i]),...Object.keys(stamped[i])])){
  if(field==='_sync_versions'||targets.get(original[i].id)?.has(field))continue;
  if(!equal(original[i][field],stamped[i][field]))throw Error('Maintenance changed protected data');
 }
 return {books:stamped,changed};
}
export async function applyBookIdentification({db,backup,plan}){
 if(!plan.activate)return {state:'ready',enabled:false,version:plan.version};
 const prior=await backup.optionalReceipt(plan.version);
 for(let attempt=0;attempt<8;attempt++){
  const [row]=await db('GET','?id=eq.library&select=*');if(!row)throw Error('Library missing');
  if(prior?.state==='applied')return {...prior,already_applied:true,current_revision:row.revision};
  const change=identifyBooks(row.books,plan);
  if(prior?.state==='prepared'&&change.changed.length)throw Error('Interrupted identification needs review');
  if(prior?.state==='prepared'){const receipt={...prior,state:'applied',current_revision:row.revision};await backup.receipt(plan.version,receipt);return receipt;}
  const preserved=await backup.preserve(row,plan.version),revision=row.revision+(change.changed.length?1:0);
  const receipt={...preserved,state:'prepared',enabled:true,version:plan.version,before_revision:row.revision,after_revision:revision,changed_ids:change.changed,all_original_records_retained:true,unrelated_fields_preserved:true};
  await backup.receipt(plan.version,receipt);
  if(change.changed.length){const result=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:change.books,revision,updated_at:new Date().toISOString()});if(!result.length)continue;if(result[0].revision!==revision||!equal(result[0].books,change.books))throw Error('Identification readback differs');}
  receipt.state='applied';await backup.receipt(plan.version,receipt);return receipt;
 }
 throw Error('Concurrent changes prevented safe identification');
}
