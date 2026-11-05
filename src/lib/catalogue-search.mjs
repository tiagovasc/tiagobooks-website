export function searchCatalogue(books, query){
  const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if(!terms.length)return [];
  return books.filter(b=>{const text=[b.title,b.subtitle,b.author,b.additional_authors,b.subject,b.description,b.notes,...(b.tags||[]),...(b.sightings||[]).flatMap(s=>[s.city,s.bookshop])].join(' ').toLocaleLowerCase();return terms.every(t=>text.includes(t))});
}

// A shared discovery has one search result. Keep its physical bookshop version preferred.
export function tbrSource(book){return book.sources?.includes('bookshops')||book.sightings?.length?'bookshops':'online'}
export function tbrHref(book){return '/library?collection=tbr&source='+tbrSource(book)+'&q='+encodeURIComponent(book.title||'')}
export function tbrLabel(book){return tbrSource(book)==='bookshops'?[book.sightings?.[0]?.bookshop,book.sightings?.[0]?.city].filter(Boolean).join(', '):'Online'}
