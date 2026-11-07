// Ownership comes only from the canonical library, never reading status or a
// TBR membership. Explicit links survive metadata corrections; other matches
// require the complete normalized title and author (no fuzzy/partial matching).
const text=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const author=value=>text(value).split(' ').filter(Boolean).sort().join(' ');
const key=(title,name)=>text(title)&&author(name)?text(title)+'\0'+author(name):null;
export function ownedTbrIds(library,catalogue){
  const explicit=new Set(),works=new Set();
  for(const book of library){
    if(book.owned!==true)continue;
    for(const id of Array.isArray(book.tbr_ids)?book.tbr_ids:[])if(typeof id==='string')explicit.add(id);
    for(const title of [book.title,book.subtitle?book.title+': '+book.subtitle:null]){
      const match=key(title,book.author);if(match)works.add(match);
    }
  }
  return catalogue.filter(book=>explicit.has(book.id)||works.has(key(book.title,book.author))).map(book=>book.id);
}
