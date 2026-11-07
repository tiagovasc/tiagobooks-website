import {isLibraryMember} from './canonical-books.mjs';
export const correctionVersion='owned-haiku-schlick-20261107-v1';
const changes=[
 {id:'762',title:'The Murder of Professor Schlick: The Rise and Fall of the Vienna Circle',author:'David Edmonds',fields:{owned:true,format:'Audiobook'}},
 {id:'work-online-7f514a374bea6a8171ec',title:'The History of Western Philosophy in 100 Haiku',author:'Haris Vlavianos',fields:{owned:true,read_status:'unread',library_member:true}}
];
export function correctedBooks(original){
 const books=structuredClone(original),byId=new Map(books.map(b=>[b.id,b]));let changed=false;
 for(const correction of changes){
  const book=byId.get(correction.id);
  if(!book||book.title!==correction.title||book.author!==correction.author)throw Error('Confirmed correction identity changed');
  if(book.applied_corrections?.includes(correctionVersion))continue;
  Object.assign(book,correction.fields);book.applied_corrections=[...(book.applied_corrections||[]),correctionVersion];changed=true;
 }
 if(books.length!==original.length)throw Error('Correction must reuse the existing underlying books');
 for(const old of original){
  const next=byId.get(old.id),allowed=new Set(['applied_corrections',...Object.keys(changes.find(c=>c.id===old.id)?.fields||{})]);
  for(const [key,value] of Object.entries(old))if(!allowed.has(key)&&JSON.stringify(next[key])!==JSON.stringify(value))throw Error('Correction changed an unrelated field');
 }
 return {books,changed};
}
export async function applyConfirmedCorrections({db,backup}){
 for(let attempt=0;attempt<5;attempt++){
  const [row]=await db('GET','?id=eq.library&select=*');if(!row)throw Error('Library missing');
  const change=correctedBooks(row.books);
  if(!change.changed)return {...await backup.readReceipt(correctionVersion),state:'applied',already_applied:true,current_revision:row.revision};
  const preserved=await backup.preserve(row,correctionVersion);
  const receipt={...preserved,state:'prepared',version:correctionVersion,before_revision:row.revision,after_revision:row.revision+1,underlying_books:change.books.length,library_memberships:change.books.filter(isLibraryMember).length,corrected_ids:changes.map(c=>c.id),all_other_fields_preserved:true};
  await backup.receipt(correctionVersion,receipt);
  const updated=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:change.books,revision:row.revision+1,updated_at:new Date().toISOString()});
  if(!updated.length)continue;
  if(JSON.stringify(updated[0].books)!==JSON.stringify(change.books)||updated[0].revision!==row.revision+1)throw Error('Correction readback mismatch');
  receipt.state='applied';await backup.receipt(correctionVersion,receipt);return receipt;
 }
 throw Error('Concurrent library changes prevented a safe correction');
}
