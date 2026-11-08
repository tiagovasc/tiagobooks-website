// Bounded, public presentation data. Never an editing baseline or a save payload.
import {filterCatalogue,discoveryMonth} from './tbr.js';
const pick=(book,keys)=>Object.fromEntries(keys.filter(key=>book[key]!==undefined).map(key=>[key,book[key]]));
const fields=['id','title','subtitle','author','additional_authors','cover','read_status','owned','favorite','rating','publication_year','date_read','format','subject'];
const rank=b=>b.date_read?2:b.read_status==='reading'?0:b.read_status==='next'?1:3;
const title=b=>String(b.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase().replace(/^[^a-z0-9]+/,'').replace(/^(the|a|an)\s+/,'');
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export const previewGroup=b=>rank(b)===0?'~reading':rank(b)===1?'~next':b.date_read?String(b.date_read).slice(0,7):'~none';
export function makeLibraryPreview(books,catalogue,revision){
  const statuses=['read','reading','next','unread','paused'];
  const owned=books.filter(b=>b.library_member!==false).map(b=>({...pick(b,fields),read_status:statuses.includes(b.read_status)?b.read_status:statuses.includes(b.status)?b.status:'unread'})).sort((a,b)=>rank(a)-rank(b)||cmp(b.date_read||'',a.date_read||'')||cmp(title(a),title(b)));
  const counts={},facets={all:owned.length};for(const book of owned){const key=previewGroup(book);counts[key]=(counts[key]||0)+1;facets[book.read_status]=(facets[book.read_status]||0)+1;}
  const tbr={},totals={},dates={};let places=[];
  for(const source of ['all','instagram','bookshops','online']){
    const list=filterCatalogue(catalogue.books,{source});
    totals[source]=list.length;
    dates[source]={};for(const book of list){const month=discoveryMonth(book,source);if(month)dates[source][month]=(dates[source][month]||0)+1;}
    if(source==='bookshops')places=[...new Map(list.flatMap(b=>b.sightings).map(s=>[JSON.stringify([s.city,s.bookshop]),{city:s.city,bookshop:s.bookshop}])).values()];
    tbr[source]=list.slice(0,48).map(b=>({...pick(b,[...fields,'sources','book_id','library_id','canonical_ready','chronology_source','chronology_order','discovery_dates']),sightings:(b.sightings||[]).map(s=>pick(s,['visit_id','city','bookshop','photographed_at','photo_order']))}));
  }
  return {schema:2,revision:String(revision),owned:{books:owned.slice(0,64),counts,facets,total:owned.length},tbr,totals,dates,places};
}
