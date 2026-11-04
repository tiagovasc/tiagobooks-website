export function searchCatalogue(books, query){
  const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if(!terms.length)return [];
  return books.filter(b=>{const text=[b.title,b.subtitle,b.author,b.additional_authors,b.subject,b.description,b.notes,...(b.tags||[]),...(b.sightings||[]).flatMap(s=>[s.city,s.bookshop])].join(' ').toLocaleLowerCase();return terms.every(t=>text.includes(t))});
}
