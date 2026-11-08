import {isDeepStrictEqual as equal} from 'node:util';

// Each field carries its last operation ID. Retrying a lost response cannot replay
// an older favorite over a newer unheart, including a value that changed back.
export const SYNC_PROTOCOL=1;
export const editableFields=new Set(['title','author','publication_year','publisher','isbn','isbn13','description','cover','cover_url','status','owned','favorite','format','rating','date_read','date_started','date_finished','subject','notes','tags','url','language','pages','acquired_date','acquisition_source','library_member']);
for(const field of ['read_status','additional_authors','notes_url','review_url','goodreads_shelf','sources','subtitle','cover_status','google_books_id','enriched','enrich_status','enrich_confidence'])editableFields.add(field);
editableFields.add('pause_plan');
export function valueAt(book,field){return field==='favorite'?!!book.favorite:field==='library_member'?book.library_member!==false:book[field];}
export function versionAt(book,field){return book._sync_versions?.[field]||null;}
export function validateOperations(ops,{fields=true}={}){
 if(!Array.isArray(ops)||!ops.length||ops.length>200)throw Error('Invalid change batch');
 const ids=new Set();
 for(const op of ops){
  if(!op||typeof op.id!=='string'||!/^[\w-]{8,120}$/.test(op.id)||ids.has(op.id)||typeof op.book_id!=='string'||op.book_id.length>160)throw Error('Invalid change');
  ids.add(op.id);
  if(!fields)continue;
  if(op.kind==='add'){if(!op.book||op.book.id!==op.book_id||typeof op.book.title!=='string'||!Number.isInteger(op.book.rating)||op.book.rating<0||op.book.rating>5||op.book.library_member===false)throw Error('Invalid new book');continue;}
  if(!editableFields.has(op.field)||typeof op.present!=='boolean'||!Object.hasOwn(op,'before')||!(op.before_version===null||typeof op.before_version==='string'))throw Error('Invalid book field');
  if(op.field==='favorite'&&(!op.present||typeof op.value!=='boolean'))throw Error('Invalid favorite');
  if(op.field==='library_member'&&(!op.present||typeof op.value!=='boolean'))throw Error('Invalid membership');
  if(op.field==='pause_plan'&&op.present&&!['return','unfinished',''].includes(op.value))throw Error('Invalid paused plan');
  if(op.field==='rating'&&(!Number.isInteger(op.value)||op.value<0||op.value>5))throw Error('Invalid rating');
 }
}
export function applyOperations(input,operations,{isolateInvalid=false}={}){
 validateOperations(operations,{fields:!isolateInvalid});
 const books=structuredClone(input),by=new Map(books.map(b=>[b.id,b])),results=[],equivalentVersions=new Map();
 let changed=false;
 for(const op of operations){
  let book=by.get(op.book_id);
  if(isolateInvalid){try{validateOperations([op]);}catch(error){
   results.push({id:op.id,status:'conflict',invalid:true,error:error.message,book_id:op.book_id,field:op.field||'new book',current:book?valueAt(book,op.field)??null:null,current_present:!!book&&valueAt(book,op.field)!==undefined,version:book?versionAt(book,op.field):null});continue;
  }}
  if(op.kind==='add'){
   if(!book){book={...structuredClone(op.book),_sync_versions:{_created:op.id}};books.push(book);by.set(book.id,book);changed=true;results.push({id:op.id,status:'accepted'});}
   else results.push({id:op.id,status:book._sync_versions?._created===op.id?'accepted':'conflict',book_id:op.book_id,field:'new book',current:book.title,version:book._sync_versions?._created||null});
   continue;
  }
  if(!book){results.push({id:op.id,status:'conflict',book_id:op.book_id,field:op.field,missing:true,current:null,version:null});continue;}
  const current=valueAt(book,op.field),version=versionAt(book,op.field),wanted=op.present?op.value:undefined;
  if(version===op.id){results.push({id:op.id,status:'accepted',version});continue;}
  // An unknown baseline is used only for recovered legacy drafts: require review
  // unless their requested value is already saved.
  if(equal(current,wanted)){
   if(version===op.before_version)equivalentVersions.set(op.id,{version,book_id:op.book_id,field:op.field});
   results.push({id:op.id,status:'accepted',version,equivalent:true});continue;
  }
  const equivalent=equivalentVersions.get(op.before_version),beforeVersion=equivalent?.book_id===op.book_id&&equivalent?.field===op.field?equivalent.version:op.before_version;
  if(op.review||!equal(current,op.before_present===false?undefined:op.before)||version!==beforeVersion){
   results.push({id:op.id,status:'conflict',book_id:op.book_id,field:op.field,current:current??null,current_present:current!==undefined,version});continue;
  }
  if(op.present)book[op.field]=structuredClone(op.value);else delete book[op.field];
  book._sync_versions={...book._sync_versions,[op.field]:op.id};changed=true;
  results.push({id:op.id,status:'accepted',version:op.id});
 }
 return {books,results,changed};
}
// Old clients must not erase version stamps. A legacy edit also changes the token.
export function stampLegacyChanges(previous,next,token){
 const by=new Map(previous.map(b=>[b.id,b]));
 return next.map(b=>{const old=by.get(b.id);if(!old)return b;const versions={...old._sync_versions};for(const field of editableFields)if(!equal(valueAt(old,field),valueAt(b,field)))versions[field]=token;return Object.keys(versions).length?{...b,_sync_versions:versions}:b;});
}
