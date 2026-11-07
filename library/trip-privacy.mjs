// Exact visit dates belong in the private tracker, never in public discovery data.
export function tripMonth(value){
  return /^(\d{4}-(?:0[1-9]|1[0-2]))(?:$|-|T)/.exec(String(value||''))?.[1]||'';
}
const sightingFields=['visit_id','city','country','bookshop','shop_status','photo_order'];
export function publicTripCatalogue(catalogue){
  return {...catalogue,books:catalogue.books.map(book=>({...book,sightings:(book.sightings||[]).map(s=>({
    ...Object.fromEntries(sightingFields.filter(k=>k in s).map(k=>[k,s[k]])),
    photographed_at:tripMonth(s.photographed_at),
  }))}))};
}
export function assertPublicTripDates(catalogue){
  for(const book of catalogue.books)for(const s of book.sightings||[]){
    if(!s.photographed_at||s.photographed_at!==tripMonth(s.photographed_at))throw Error('Public bookshop dates must contain only YYYY-MM');
    if(Object.keys(s).some(k=>k!=='photographed_at'&&!sightingFields.includes(k)))throw Error('Unexpected private bookshop sighting field');
    if(s.photo_order!==undefined&&(!Number.isInteger(s.photo_order)||s.photo_order<0))throw Error('Photo order must be a nonnegative rank');
  }
}
