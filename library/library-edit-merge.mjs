import {isLibraryMember,mergeLibrarySave} from './canonical-books.mjs';
import {isDeepStrictEqual as equal} from 'node:util';
const protectedFields=new Set(['id','favorite','library_member','applied_corrections','book_identity_version','tbr_ids','tbr_sources','discovery_records','series_original_record','record_type','component_book_ids']);
export class EditConflict extends Error{}
export function mergeEditedSnapshot(current,base,desired){
 const baseMap=new Map(base.map(b=>[b.id,b])),nextMap=new Map(desired.map(b=>[b.id,b])),currentMap=new Map(current.map(b=>[b.id,b]));
 const fields=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>!protectedFields.has(k)&&!equal(a[k],b[k]));
 const merged=[];
 for(const book of current.filter(isLibraryMember)){
  const before=baseMap.get(book.id),wanted=nextMap.get(book.id);
  if(!before){if(wanted&&!equal(book,wanted))throw new EditConflict('A book with this ID was added elsewhere. Reload before changing it.');merged.push(book);continue;}
  if(!wanted){if(fields(before,book).length)throw new EditConflict('This book changed elsewhere and was not removed. Reload to review it.');continue;}
  const out={...book};
  for(const key of fields(before,wanted)){
   if(!equal(book[key],before[key])&&!equal(book[key],wanted[key]))throw new EditConflict('“'+book.title+'”: '+key+' changed elsewhere. Your edit is still in this tab; reload to review the conflict.');
   if(Object.hasOwn(wanted,key))out[key]=wanted[key];else delete out[key];
  }
  merged.push(out);
 }
 for(const book of desired){
  const live=currentMap.get(book.id),before=baseMap.get(book.id);
  if(live&&isLibraryMember(live))continue;
  if(before){if(fields(before,book).length)throw new EditConflict('This book was removed elsewhere. Reload to review it.');continue;}
  if(live)throw new EditConflict('This ID already belongs to another book.');merged.push(book);
 }
 return mergeLibrarySave(current,merged);
}
