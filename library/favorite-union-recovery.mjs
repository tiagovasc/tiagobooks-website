import {isDeepStrictEqual} from 'node:util';
export function unionFavorites(original,targets){
 const books=structuredClone(original),byId=new Map(books.map(b=>[b.id,b]));let added=0;
 for(const target of targets){const book=byId.get(target.id);if(!book||book.title!==target.title||book.author!==target.author)throw Error('Favorite recovery identity changed');if(book.favorite!==true){book.favorite=true;added++;}}
 for(let i=0;i<books.length;i++){const before={...original[i]},after={...books[i]};delete before.favorite;delete after.favorite;if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Favorite recovery changed another field');if(original[i].favorite===true&&books[i].favorite!==true)throw Error('Existing favorite lost');}
 return {books,added};
}
export async function applyFavoriteUnion({db,backup,plan}){
 const prior=await backup.optionalReceipt(plan.version);
 for(let attempt=0;attempt<5;attempt++){
  const [row]=await db('GET','?id=eq.library&select=*');if(!row)throw Error('Library missing');
  if(prior?.state==='applied')return {...prior,already_applied:true,current_revision:row.revision};
  const change=unionFavorites(row.books,plan.books);
  if(prior?.state==='prepared'&&change.added)throw Error('Interrupted favorite recovery requires review before retry');
  if(prior?.state==='prepared'){const complete={...prior,state:'applied',already_applied:true,current_revision:row.revision};await backup.receipt(plan.version,complete);return complete;}
  const preserved=await backup.preserve(row,plan.version),revision=row.revision+(change.added?1:0);
  const receipt={...preserved,state:'prepared',version:plan.version,before_revision:row.revision,after_revision:revision,requested_books:plan.books.length,favorite_flags_added:change.added,only_favorite_flags_changed:true,all_existing_favorites_preserved:true};
  await backup.receipt(plan.version,receipt);
  if(change.added){const result=await db('PATCH',`?id=eq.library&revision=eq.${row.revision}`,{books:change.books,revision,updated_at:new Date().toISOString()});if(!result.length)continue;if(result[0].revision!==revision||!isDeepStrictEqual(result[0].books,change.books))throw Error('Favorite recovery readback differs');}
  receipt.state='applied';await backup.receipt(plan.version,receipt);return receipt;
 }
 throw Error('Concurrent changes prevented safe favorite recovery');
}
