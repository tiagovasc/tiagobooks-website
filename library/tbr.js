// Discovery metadata stays separate; owner favorites persist independently of source memberships.
export const SOURCES = {bookshops:'Book shops',instagram:'Instagram',online:'Online'};
export const SOURCE_VIEWS = {all:'All',...SOURCES};
export function sourceLabel(book){return (book.sources||((book.sightings||[]).length?['bookshops']:[])).map(s=>SOURCES[s]).filter(Boolean).join(' · ');}
const photoCompare=(a,b)=>(Number.isInteger(a.photo_order)&&Number.isInteger(b.photo_order)?a.photo_order-b.photo_order:Date.parse(b.photographed_at)-Date.parse(a.photographed_at))||a.visit_id.localeCompare(b.visit_id);
export function filterBooks(books,{query='',city='',shop='',sort='recent'}={}) {
  const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return books.flatMap(b=>{
    const sightings=b.sightings.filter(s=>(!city||s.city===city)&&(!shop||s.bookshop===shop)).sort(photoCompare);
    const text=[b.title,b.author,...b.sightings.flatMap(s=>[s.city,s.bookshop])].join(' ').toLocaleLowerCase();
    return sightings.length&&words.every(w=>text.includes(w))?[{...b,sightings}]:[];
  }).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='author'?a.author.localeCompare(b.author):
    (photoCompare(a.sightings[0],b.sightings[0])||a.id.localeCompare(b.id))*(sort==='oldest'?-1:1));
}
export function groupBooks(books,chronological=true) {
  if(!chronological)return [{key:'all',books}];
  const groups=[];
  for(const book of books){
    const s=book.sightings[0],key=s.visit_id;
    let group=groups[groups.length-1];
    if(!group||group.key!==key){group={key,place:s,books:[]};groups.push(group);}
    group.books.push(book);
  }
  return groups;
}
// A work can belong to several collections while remaining one catalogue record.
export function sourceBooks(books,source) {
  if(source==='all')return [...new Map(books.map(b=>[b.id,b])).values()];
  return books.filter(b=>(b.sources||((b.sightings||[]).length?['bookshops']:[])).includes(source));
}
export function catalogueCounts(books) {
  return {total:new Set(books.map(b=>b.id)).size,...Object.fromEntries(Object.keys(SOURCES).map(source=>[source,new Set(sourceBooks(books,source).map(b=>b.id)).size]))};
}
export function filterCatalogue(books,{source='all',query='',city='',shop='',sort='recent',favoritesOnly=false,favoriteIds=new Set()}={}) {
  const collection=sourceBooks(books,source).filter(b=>!favoritesOnly||favoriteIds.has(b.id));
  const order=new Map(collection.map((b,i)=>[b.id,i]));
  if(source==='bookshops')return filterBooks(collection,{query,city,shop,sort});
  const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return collection.filter(b=>{
    const text=[b.title,b.author,b.source_title,b.source_author,b.description,...(source==='all'?[sourceLabel(b),...(b.sightings||[]).flatMap(s=>[s.city,s.bookshop])]:[])].join(' ').toLocaleLowerCase();
    return words.every(w=>text.includes(w));
  }).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='author'?(a.author||'').localeCompare(b.author||''):
    (source==='all'?(a.chronology_order??order.get(a.id))-(b.chronology_order??order.get(b.id)):
      (Date.parse(b.discovery_dates?.[source]?.date)-Date.parse(a.discovery_dates?.[source]?.date))||((a[source+'_order']??0)-(b[source+'_order']??0)))*(sort==='oldest'?-1:1)||a.id.localeCompare(b.id));
}
export function collectionGroups(books,source,sort='recent') {
  return groupBooks(books,source==='bookshops'&&['recent','oldest'].includes(sort));
}
export function sortOptions(source) {
  return [['recent',source==='bookshops'?'Newest photos':source==='all'?'Newest discoveries':'Newest saved'],['oldest',source==='bookshops'?'Oldest photos':source==='all'?'Oldest discoveries':'Oldest saved'],['title','Title'],['author','Author']];
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n||0).toLocaleString('en-GB');
export const tripMonthLabel=s=>new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s.slice(0,7)+'-01T12:00:00Z'));
const date=tripMonthLabel;
export function discoveryMonth(book,source='all'){
  const value=source==='bookshops'?(book.sightings?.[0]?.photographed_at||book.discovery_dates?.bookshops?.date):book.discovery_dates?.[source==='all'?book.chronology_source:source]?.date;
  return /^\d{4}-\d{2}/.test(value||'')?value.slice(0,7):'';
}
export function discoveryDateHTML(book,source='all'){
  const month=discoveryMonth(book,source);if(!month)return '';
  return `<span class="tbr-date"><time datetime="${month}">${escape(tripMonthLabel(month))}</time></span>`;
}
// Metadata dates describe local photo dates, never date read or acquired.
export function placeLabel(s){return [s.city,s.bookshop].filter(Boolean).join(' · ');}
export function tbrFavoriteHTML(book,active,canEdit,pending=false){
  if(!canEdit&&!active)return '';
  const label=canEdit?(active?'Remove from favorites':'Add to favorites'):'Tiago’s favorite';
  const attrs=`class="favorite${active?' is-favorite':''}" title="${escape(label)}" aria-label="${escape(label+': '+book.title)}"`;
  const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  return canEdit?`<button type="button" ${attrs} data-tbr-favorite="${escape(book.id)}" aria-pressed="${active}" ${pending?'disabled aria-busy="true"':''}>${icon}</button>`:`<span ${attrs} role="img">${icon}</span>`;
}
export function tbrOwnedHTML(owned){
  if(!owned)return '';
  return '<span class="tbr-owned" role="img" aria-label="Owned" title="Owned"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 17h14M9 9l2 2 4-4"/></svg></span>';
}
if(typeof document!=='undefined')init();
function init(){
  const $=id=>document.getElementById(id), body=document.body, search=$('search');
  const status=$('statusSeg'),bar=status.parentElement;
  $('notchMore').querySelector('.n-more-inner').insertAdjacentHTML('beforeend','<div id="tbrSources"><nav class="seg" id="tbrSourceTabs" aria-label="TBR source">'+['all','instagram','bookshops','online'].map(k=>`<button type="button" data-source="${k}" aria-pressed="${k==='all'}">${SOURCE_VIEWS[k]}</button>`).join('')+'</nav><select id="tbrSourceMobile" aria-label="TBR source">'+['all','instagram','bookshops','online'].map(k=>`<option value="${k}" ${k==='all'?'selected':''}>${SOURCE_VIEWS[k]}</option>`).join('')+'</select></div>');
  $('filtersPop').insertAdjacentHTML('beforeend','<div id="tbrFilterPanel"><label class="field"><span>Ownership</span><select id="tbrOwnership" aria-label="Filter TBR by ownership"><option value="all">All books</option><option value="owned">Owned</option><option value="not-owned">Not owned</option></select></label><div class="pop-actions"><button class="linkbtn" type="button" data-tbr-clear>Clear filters</button></div></div>');
  $('sort').closest('label').id='sortLabel';
  $('sortLabel').insertAdjacentHTML('afterend','<label id="tbrSortLabel" class="pill-select icon-select" title="Sort"><svg class="i" aria-hidden="true"><use href="#i-sort"/></svg><span class="lbl">Sort</span><select id="tbrSort" aria-label="Sort TBR books"><option value="recent">Newest photos</option><option value="oldest">Oldest photos</option><option value="title">Title</option><option value="author">Author</option></select></label>');
  $('main').insertAdjacentHTML('afterend','<main class="wrap" id="tbrMain" hidden><div id="tbrIntro"></div><p id="tbrFavoriteMessage" role="status"></p><div id="tbrFilters" class="tbr-toolbar"></div><div id="tbrContent" aria-live="polite"></div></main><dialog id="tbrDialog" aria-labelledby="tbrDetailTitle"><div class="tbr-dialog-head"><span>TBR · Book shops</span><button type="button" class="tbr-close" aria-label="Close book details">×</button></div><div class="tbr-detail" id="tbrDetail"></div></dialog>');
  let moreObserver=null,openId=null,pagingList=[];
  let ownedIds=new Set();
  let favoriteIds=new Set();const pendingFavorites=new Set();
  const favorite=b=>tbrFavoriteHTML(b,books?favoriteIds.has(b.id):b.favorite===true,!!window.CLOUD_CAN_EDIT,pendingFavorites.has(b.id));
  let active=false,source='all',books=null,loading=null,error=false,limit=0,view='covers',sort='recent',city='',shop='',ownership='all',libSearch='',libView='covers',tbrSearch='';
  function pressViews(v){$('viewSwitch').querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));}
  function views(v){if(view!==v)limit=0;view=v;pressViews(v);}
  function sources(k){source=Object.hasOwn(SOURCE_VIEWS,k)?k:'all';city='';shop='';limit=0;$('tbrSourceMobile').value=source;$('tbrSourceTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.source===source)));if(active)search.placeholder=source==='bookshops'||source==='all'?'Search TBR books, authors, cities or shops':'Search TBR books and authors';}
  function address(){const u=new URL(location.href);if(active){u.searchParams.set('collection','tbr');u.searchParams.set('source',source);}else{u.searchParams.delete('collection');u.searchParams.delete('source');}history.pushState(null,'',u);}
  function enter(on,k='all',push=true){
    if(on&&!active){libSearch=search.value;libView=$('viewSwitch').querySelector('[aria-pressed="true"]')?.dataset.view||'covers';search.value=tbrSearch;}
    if(!on&&active){tbrSearch=search.value;search.value=libSearch;pressViews(libView);}
    pager.reset();active=on;body.classList.toggle('tbr-mode',on);$('tbrMain').hidden=!on;$('main').inert=on;
    if(!on)window.setDiscoveryTimeline?.(null);
    bar.querySelectorAll('[data-collection]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.collection==='tbr')===on)));
    if(on)status.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed','false'));
    ['menuPop','filtersPop','columnsPop'].forEach(id=>$(id).hidden=true);
    ['menuBtn','filtersBtn','columnsBtn'].forEach(id=>$(id).setAttribute('aria-expanded','false'));
    search.placeholder=on?'Search TBR books, authors, cities or shops':'Search title, author, subject, notes';$('searchClear').hidden=!search.value;
    if(on){sources(k);views(view);render();load();}else{search.dispatchEvent(new Event('input',{bubbles:true}));}
    if(push){address();window.scrollTo({top:0,behavior:'instant'});}window.dispatchEvent(new Event('resize'));
  }
  async function load(){
    if(books||loading)return;
    error=false;
    loading=Promise.all([fetch('/api/tbr-owned').then(r=>{if(!r.ok)throw Error('ownership');return r.json();}).then(data=>{if(!Array.isArray(data.ids))throw Error('ownership');ownedIds=new Set(data.ids);}),fetch('/api/tbr-favorites').then(r=>{if(!r.ok)throw Error('favorites');return r.json();}).then(data=>{if(!Array.isArray(data.ids))throw Error('favorites');favoriteIds=new Set(data.ids);}),fetch('/tbr-catalogue.json').then(r=>{if(!r.ok)throw Error('load');return r.json();}).then(data=>{if(!Array.isArray(data.books)||data.books.some(b=>!b.id||!b.title||!Array.isArray(b.sightings)||!Array.isArray(b.sources)))throw Error('schema');books=data.books;const total=catalogueCounts(books).total;status.dataset.tbrCount=total;const tbrButton=status.querySelector('[data-collection="tbr"]');if(tbrButton)tbrButton.innerHTML='TBR <span class="n">'+number(total)+'</span>';})]).catch(()=>{books=null;error=true;}).finally(()=>{loading=null;overlayLocalChanges();if(active)render();});
  }
  const warmImages=[];
  function warmTbr(){
    const connection=navigator.connection;
    if(connection?.saveData||/^(slow-)?2g$/.test(connection?.effectiveType||''))return;
    load().then(()=>{
      if(!books||active||warmImages.length)return;
      const root=$('content'),columns=window.bookColumns(root,'grid');
      for(const book of filterCatalogue(books,{source:'all'}).slice(0,columns*4)){
        if(!book.cover)continue;
        const url=new URL(book.cover,location.href);if(url.origin!==location.origin)continue;
        const image=new Image();image.fetchPriority='low';image.decoding='async';image.src=url.href;warmImages.push(image);
      }
    });
  }
  window.addEventListener('library-first-covers-ready',warmTbr,{once:true});
  function overlayLocalChanges(){
    if(!books||!window.LibrarySync)return;
    const canonical=new Map(window.LibrarySync.current().map(b=>[b.id,b]));
    for(const b of books){const c=canonical.get(b.book_id);if(!c)continue;c.favorite?favoriteIds.add(b.id):favoriteIds.delete(b.id);c.owned?ownedIds.add(b.id):ownedIds.delete(b.id);for(const key of ['title','author','cover','favorite','owned','read_status','rating'])if(c[key]!==undefined)b[key]=c[key];}
  }
  window.addEventListener('library-data-updated',async event=>{
    if(loading)await loading;
    if(!books)return;const y=window.scrollY;
    if(event.detail?.local){overlayLocalChanges();if(active)render();window.scrollTo(0,y);return;}
    // Keep the selected source, filters, expanded batch and scroll position.
    books=null;await load();window.scrollTo(0,y);
  });
  function cover(b){return b.cover?`<span class="tbr-cover"><img src="${escape(b.cover)}" alt="" width="320" height="480" loading="lazy" decoding="async">${tbrOwnedHTML(ownedIds.has(b.id)||!books&&b.owned===true)}</span>`:`<span class="tbr-cover"><span class="tbr-placeholder">${escape(b.title)}<br><small>Cover unavailable</small></span>${tbrOwnedHTML(ownedIds.has(b.id)||!books&&b.owned===true)}</span>`;}
  function place(b){if(source!=='bookshops')return `<span class="tbr-place">${escape(source==='all'?sourceLabel(b):SOURCES[source])}${discoveryDateHTML(b,source)}</span>`;const s=b.sightings[0];return `<span class="tbr-place" title="${escape(placeLabel(s))}"><span class="tbr-city">${escape(s.city)}</span><span class="tbr-shop">${escape(s.bookshop)}</span><span class="tbr-date"><time datetime="${escape(s.photographed_at.slice(0,7))}">${date(s.photographed_at)}</time>${b.sightings.length>1?` · ${b.sightings.length} photos`:''}</span></span>`;}
  function card(b){return `<div role="button" tabindex="0" class="tbr-book ${favoriteIds.has(b.id)?'is-favorite':''}" data-tbr-id="${escape(b.id)}" data-tbr-month="${discoveryMonth(b,source)}" title="${escape(b.title)}" aria-label="${escape(b.title+' by '+(b.author||'uncredited')+'. '+(source==='bookshops'?placeLabel(b.sightings[0]):source==='all'?sourceLabel(b):SOURCES[source]))}">${cover(b)}${favorite(b)}<span class="tbr-copy"><h3 title="${escape(b.title)}">${escape(b.title)}</h3><span class="tbr-author">${escape(b.author||'Author not identified')}</span></span>${place(b)}</div>`;}
  function filtered(){return filterCatalogue((books||[]).filter(b=>ownership==='all'||(ownership==='owned')===ownedIds.has(b.id)),{source,query:search.value,city,shop,sort,favoritesOnly:!!window.FAVORITES_ONLY,favoriteIds});}
  function sorting(){return sortOptions(source).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');}
  function syncTimeline(list){
    window.setDiscoveryTimeline?.({active:true,chronological:['recent','oldest'].includes(sort),entries:list.map(b=>({id:b.id,month:discoveryMonth(b,source)})),jump(month){
      const current=filtered(),index=current.findIndex(b=>discoveryMonth(b,source)===month);if(index<0)return;
      limit=Math.max(limit,index+1);render(true);
      $('tbrContent').querySelector('[data-tbr-month="'+month+'"]')?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }});
  }
  function render(jump=false){
    pager.reset();moreObserver?.disconnect();
    if(!active)return;
    $('tbrContent').inert=false;$('tbrContent').removeAttribute('data-warm-preview');
    const warm=!books&&window.LibraryWarm?.read(),list=filtered(),collection=books?sourceBooks(books,source):(warm?.tbr[source]||[]);pagingList=list;
    syncTimeline(list);
    const total=books?list.length:warm?.totals[source];
    $('tbrIntro').innerHTML=`<div class="tbr-intro"><div><p class="tbr-eyebrow">To be read</p><h2>${SOURCE_VIEWS[source]}</h2><p>${source==='all'?'Interesting books I’ve saved over the years.':source==='bookshops'?'Books that caught my eye on bookshop visits, starting with the most recent photos.':source==='online'?'Books I found online and saved to explore.':'Books discovered on Instagram and saved to explore.'}</p></div>${total!==undefined?`<span class="tbr-count">${number(total)} ${total===1?'book':'books'}${books&&list.length!==collection.length?' of '+number(collection.length):''}</span>`:''}</div>`;
    $('tbrSort').innerHTML=sorting();$('tbrSort').value=sort;$('tbrSortLabel').classList.toggle('is-active',sort!=='recent');
    $('tbrOwnership').value=ownership;
    const activeFilters=Number(ownership!=='all')+Number(!!city)+Number(!!shop);
    $('filtersBtn').classList.toggle('is-active',!!activeFilters);$('filtersBtn').setAttribute('aria-label',activeFilters?'Filters, '+activeFilters+' active':'Filters');$('filterCount').textContent=activeFilters;$('filterCount').hidden=!activeFilters;
    const filter=$('tbrFilters');filter.innerHTML='';
    if((books||warm)&&source==='bookshops'){
      const places=books?collection.flatMap(b=>b.sightings):warm.places;
      const cities=[...new Set(places.map(s=>s.city))].sort();
      const shops=[...new Set(places.filter(s=>!city||s.city===city).map(s=>s.bookshop))].sort();
      const options=(xs,v)=>xs.map(x=>`<option ${x===v?'selected':''} value="${escape(x)}">${escape(x)}</option>`).join('');
      filter.innerHTML=`<select id="tbrCity" class="${city?'is-active':''}" aria-label="Filter by city"><option value="">All cities</option>${options(cities,city)}</select><select id="tbrShop" class="${shop?'is-active':''}" aria-label="Filter by bookshop"><option value="">All bookshops</option>${options(shops,shop)}</select><select id="tbrSortMobile" aria-label="Sort TBR books"><option value="recent">Newest photos</option><option value="oldest">Oldest photos</option><option value="title">Title</option><option value="author">Author</option></select>${city||shop||search.value||sort!=='recent'?'<button type="button" data-tbr-clear>Reset browsing</button>':''}`;
      $('tbrSortMobile').value=sort;
    }
    if((books||warm)&&source!=='bookshops'){
      filter.innerHTML=`<select id="tbrSortMobile" aria-label="Sort TBR books">${sorting()}</select>${search.value||sort!=='recent'?'<button type="button" data-tbr-clear>Reset browsing</button>':''}`;
      $('tbrSortMobile').value=sort;
    }
    if(!books){if(!error&&showWarmTbr())return;$('tbrContent').innerHTML=error?'<div class="empty-state"><h2>Couldn’t load these books</h2><p>Please try again.</p><button class="tbr-retry" type="button">Retry</button></div>':`<div class="empty-state" role="status">Loading ${source==='all'?'all TBR books':source==='bookshops'?'bookshop discoveries':SOURCES[source]+' books'}…</div>`;return;}
    if(!list.length){$('tbrContent').innerHTML=`<div class="empty-state"><h2>${window.FAVORITES_ONLY?'No favorites match in this section':'No books match'}</h2><p>${window.FAVORITES_ONLY?'Turn off Favorites to see all books, or try another search.':source==='bookshops'?'Try another title, city or bookshop.':'Try another title or author.'}</p><button type="button" data-tbr-clear>Clear search and filters</button></div>`;return;}
    const fresh=!limit;
    if(fresh)limit=batchSize(list,0);
    drawBatch(list,0);
    if(!jump)pager.start(fresh);
  }
  function showWarmTbr(){
    const data=window.LibraryWarm?.read();
    if(!data||view!=='covers'||sort!=='recent'||search.value||city||shop||ownership!=='all'||window.FAVORITES_ONLY)return false;
    const content=$('tbrContent'),group=source==='bookshops'?b=>b.sightings[0]?.visit_id:undefined;
    const shown=window.LibraryWarm.rows(data.tbr[source],window.bookColumns(content,'tbr-grid'),group);
    content.innerHTML=collectionGroups(shown,source,sort).map(g=>`<section class="tbr-section">${g.place?`<div class="tbr-heading"><h3>${escape(g.place.bookshop)}<br><span>${escape(g.place.city)} · ${date(g.place.photographed_at)}</span></h3></div>`:''}<div class="tbr-grid">${g.books.map(card).join('')}</div></section>`).join('');
    content.inert=true;content.dataset.warmPreview='true';
    content.querySelectorAll('.tbr-cover>img').forEach(img=>{img.loading='eager';});
    window.setDiscoveryTimeline?.({active:true,chronological:true,preview:true,counts:data.dates[source],entries:[],jump(){}});
    window.dispatchEvent(new Event('resize'));window.SiteLayout?.ready();return true;
  }
  function drawBatch(list,start){
    moreObserver?.disconnect();
    const content=$('tbrContent'),shown=list.slice(start,limit);
    content.querySelector('.tbr-more')?.remove();
    if(!start)content.innerHTML='';
    if(view==='table'){
      if(!start)content.innerHTML=`<div class="tbr-table-scroll" tabindex="0" role="region" aria-label="TBR books table"><table class="tbr-table"><thead><tr><th scope="col">Book</th><th scope="col">Author</th><th scope="col">Favorite</th>${source==='bookshops'?'<th scope="col">City</th><th scope="col">Bookshop</th><th scope="col">Month</th>':'<th scope="col">Source</th><th scope="col">Date</th>'}</tr></thead><tbody></tbody></table></div>`;
      content.querySelector('tbody').insertAdjacentHTML('beforeend',shown.map(b=>{const s=b.sightings[0];return `<tr data-tbr-month="${discoveryMonth(b,source)}"><td>${tbrOwnedHTML(ownedIds.has(b.id)||!books&&b.owned===true)}<button type="button" data-tbr-id="${escape(b.id)}">${escape(b.title)}</button></td><td>${escape(b.author||'Author not identified')}</td><td>${favorite(b)}</td>${source==='bookshops'?`<td>${escape(s.city)}</td><td>${escape(s.bookshop)}</td><td><time datetime="${escape(s.photographed_at.slice(0,7))}">${date(s.photographed_at)}</time></td>`:`<td>${escape(source==='all'?sourceLabel(b):SOURCES[source])}</td><td>${discoveryDateHTML(b,source)}</td>`}</tr>`;}).join(''));
    }else{
      for(const g of collectionGroups(shown,source,sort)){
        let section=content.lastElementChild;
        if(!section||section.dataset.group!==g.key){
          content.insertAdjacentHTML('beforeend',`<section class="tbr-section" data-group="${escape(g.key)}">${g.place?`<div class="tbr-heading"><h3>${escape(g.place.bookshop)}<br><span>${escape(g.place.city)} · ${date(g.place.photographed_at)}</span></h3></div>`:''}<div class="${view==='list'?'tbr-list':'tbr-grid'}"></div></section>`);
          section=content.lastElementChild;
        }
        section.lastElementChild.insertAdjacentHTML('beforeend',g.books.map(card).join(''));
      }
    }
    content.insertAdjacentHTML('beforeend',`<div class="tbr-more"><span role="status">Showing ${number(Math.min(limit,list.length))} of ${number(list.length)} books</span>${limit<list.length?'<button type="button" data-tbr-more>Load more books</button>':''}</div>`);
    content.querySelectorAll('img:not([data-error-bound])').forEach(img=>{img.dataset.errorBound='true';img.addEventListener('error',()=>{const p=document.createElement('span');p.className='tbr-placeholder';p.textContent='Cover unavailable';img.replaceWith(p);},{once:true});});
    const more=content.querySelector('[data-tbr-more]');
    window.trackDiscoveryTimeline?.();
    if(more&&window.IntersectionObserver){
      if(!moreObserver)moreObserver=new IntersectionObserver(entries=>{
        if(active&&entries.some(e=>e.isIntersecting&&e.target.isConnected))pager.check();
      },{rootMargin:'0px 0px 1000px 0px'});
      moreObserver.observe(more);
    }
  }
  function batchSize(list,start){return window.bookRowBatch(list,start,view==='covers'?window.bookColumns($('tbrContent'),'tbr-grid'):1,view!=='table'&&source==='bookshops'&&['recent','oldest'].includes(sort)?b=>b.sightings[0].visit_id:null);}
  const pager=window.createBookPager({active:()=>active,more:()=>!!books&&limit<pagingList.length,images:()=>Array.from($('tbrContent').querySelectorAll('.tbr-cover>img[loading="lazy"]')),append:appendMore,near:()=>{const more=$('tbrContent').querySelector('[data-tbr-more]');return !!more&&more.getBoundingClientRect().top<innerHeight+Math.min(1000,innerHeight);}});
  window.addEventListener('scroll',()=>pager.check(),{passive:true});
  window.addEventListener('resize',()=>pager.check());
  function appendMore(){
    if(!active||!books)return;
    const list=pagingList,start=limit;
    if(start>=list.length)return;
    limit+=batchSize(list,start);drawBatch(list,start);
  }

  function openBook(id){
    const b=books?.find(x=>x.id===id);if(!b)return;
    if(b.canonical_ready&&b.library_id&&window.openCanonicalBook){window.openCanonicalBook(b.library_id);return;}
    $('tbrDialog').querySelector('.tbr-dialog-head span').textContent='TBR · '+(source==='all'?sourceLabel(b):SOURCES[source]);
    const sightings=b.sightings.length?`<h3>Spotted in book shops</h3><ul>${b.sightings.map(s=>`<li><strong>${escape(s.bookshop)}</strong><br>${escape(s.city)}${s.country?', '+escape(s.country):''} · ${date(s.photographed_at)}${/unresolved|probable|possible|uncertain|unknown/i.test(s.shop_status)?`<br>Shop identification: ${escape(s.shop_status)}`:''}</li>`).join('')}</ul>`:'';
    $('tbrDetail').innerHTML=`${favorite(b)}${tbrOwnedHTML(ownedIds.has(b.id)||!books&&b.owned===true)}${b.cover?`<img class="${favoriteIds.has(b.id)?'is-favorite':''}" src="${escape(b.cover)}" alt="Cover of ${escape(b.title)}">`:''}<h2 id="tbrDetailTitle">${escape(b.title)}</h2><p>${escape(b.author||'Author not identified')}</p>${b.identity_status==='needs_review'?'<p class="tbr-note">The exact book is still being identified.</p>':''}${b.description?`<p>${escape(b.description)}</p>`:''}${source==='all'?`<p class="tbr-note">Saved from: ${escape(sourceLabel(b))}.</p>`:source!=='bookshops'?`<p class="tbr-note">${source==='instagram'?'Discovered on Instagram':'Found online'} and saved to explore.</p>`:''}${sightings}<p class="tbr-note">Saved as a reading interest. This doesn’t indicate ownership or a completed read.${b.sightings.length?' Cover and description may represent a different edition from the photographed copy.':''}</p>`;
    $('tbrDetail').insertAdjacentHTML('beforeend',Object.keys(b.discovery_dates||{}).map(key=>`<p class="tbr-note">${escape(SOURCES[key]||key)}: ${discoveryDateHTML(b,key)}</p>`).join(''));
    openId=id;$('tbrDialog').showModal();
  }
  status.addEventListener('click',e=>{if(active&&e.target.closest('[data-status]'))enter(false,source);},true);
  document.addEventListener('click',e=>{
    const heart=e.target.closest('[data-tbr-favorite]');if(heart){e.preventDefault();setFavorite(heart.dataset.tbrFavorite);return;}
    const collection=e.target.closest('[data-collection]');if(collection){enter(collection.dataset.collection==='tbr',source);return;}
    const tab=e.target.closest('[data-source]');if(tab){sources(tab.dataset.source);address();render();load();return;}
    if(!active)return;
    const b=e.target.closest('[data-tbr-id]');if(b){openBook(b.dataset.tbrId);return;}
    if(e.target.closest('[data-tbr-more]')){const old=limit;pager.append();$('tbrContent').querySelectorAll('[data-tbr-id]')[old]?.focus({preventScroll:true});}
    if(e.target.closest('[data-tbr-clear]')){window.setFavoritesFilter(false);city='';shop='';ownership='all';search.value='';sort='recent';limit=0;$('searchClear').hidden=true;render();}
    if(e.target.closest('.tbr-retry')){error=false;render();load();}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='tbrSourceMobile'){sources(e.target.value);address();render();load();}
    if(e.target.id==='tbrCity'){city=e.target.value;shop='';limit=0;render();}
    if(e.target.id==='tbrOwnership'){ownership=e.target.value;limit=0;render();}
    if(e.target.id==='tbrShop'){shop=e.target.value;limit=0;render();}
    if(['tbrSort','tbrSortMobile'].includes(e.target.id)){sort=e.target.value;limit=0;render();}
  });
  search.addEventListener('input',e=>{if(!active)return;e.stopImmediatePropagation();limit=0;$('searchClear').hidden=!search.value;render();},true);
  $('searchClear').addEventListener('click',e=>{if(!active)return;e.stopImmediatePropagation();search.value='';$('searchClear').hidden=true;limit=0;render();search.focus();},true);
  $('viewSwitch').addEventListener('click',e=>{if(!active)return;const b=e.target.closest('[data-view]');if(b){e.stopImmediatePropagation();views(b.dataset.view);render();}},true);
  document.addEventListener('keydown',e=>{
    if(!active)return;
    const typing=e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.target.matches('.tbr-book')&&['Enter',' '].includes(e.key)){e.preventDefault();openBook(e.target.dataset.tbrId);return;}
    if(!typing&&['1','2','3'].includes(e.key)&&!$('tbrDialog').open){e.preventDefault();views(['covers','list','table'][Number(e.key)-1]);render();}
    if(!typing&&e.key==='/'&&!$('tbrDialog').open){e.preventDefault();search.focus();search.select();}
    if(e.key==='Escape'&&e.target===search){search.value='';$('searchClear').hidden=true;render();}
  },true);
  window.addEventListener('canonical-favorite-change',event=>{
    const related=(books||[]).filter(b=>b.canonical_ready&&b.book_id===event.detail.id);
    related.forEach(b=>{event.detail.favorite?favoriteIds.add(b.id):favoriteIds.delete(b.id);});
    if(active&&window.FAVORITES_ONLY)render();else related.forEach(b=>syncFavorite(b.id));
  });
  window.addEventListener('favorite-filter-change',()=>{limit=0;if(active)render();});
  $('tbrDialog').addEventListener('close',()=>{openId=null;});
  function syncFavorite(id){
    const selected=favoriteIds.has(id),pending=pendingFavorites.has(id);
    document.querySelectorAll('[data-tbr-favorite="'+CSS.escape(id)+'"]').forEach(button=>{
      const label=selected?'Remove from favorites':'Add to favorites';
      button.classList.toggle('is-favorite',selected);button.setAttribute('aria-pressed',String(selected));button.title=label;
      button.setAttribute('aria-label',label+': '+books.find(b=>b.id===id).title);button.disabled=pending;
      if(pending)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');
      button.closest('.tbr-book')?.classList.toggle('is-favorite',selected);
    });
    if(openId===id)$('tbrDetail').querySelector('img')?.classList.toggle('is-favorite',selected);
  }
  async function setFavorite(id){
    if(!window.CLOUD_CAN_EDIT||pendingFavorites.has(id)||!books?.some(b=>b.id===id))return;
    const book=books.find(b=>b.id===id),related=book.canonical_ready?books.filter(b=>b.book_id===book.book_id).map(b=>b.id):[id];
    if(related.some(key=>pendingFavorites.has(key)))return;
    const previous=new Map(related.map(key=>[key,favoriteIds.has(key)])),selected=!favoriteIds.has(id);
    related.forEach(key=>{selected?favoriteIds.add(key):favoriteIds.delete(key);pendingFavorites.add(key);});
    $('tbrFavoriteMessage').textContent='Saving favorite…';
    if(window.FAVORITES_ONLY)render();
    related.forEach(syncFavorite);
    try{
      let result;
      if(window.saveMembershipFavorite)result=await window.saveMembershipFavorite(id,selected,book.book_id);
      else{
        const response=await fetch('/api/tbr-favorites',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({id,favorite:selected})});
        if(!response.ok)throw Error(response.status===401?'Sign in again to save favorites.':'Could not save favorite. Please try again.');
        result=await response.json();
      }
      if(result.id!==id||result.favorite!==selected)throw Error('Favorite was not confirmed. Please try again.');
      $('tbrFavoriteMessage').textContent=result.queued?'Favorite kept on this device · syncing.':'Favorite saved.';
    }catch(error){
      if(!error.favoriteRetained)previous.forEach((was,key)=>{was?favoriteIds.add(key):favoriteIds.delete(key);});
      if(window.FAVORITES_ONLY)render();
      $('tbrFavoriteMessage').textContent=error.message;
    }finally{
      related.forEach(key=>pendingFavorites.delete(key));related.forEach(syncFavorite);
      if(active){
        const control=(openId===id?$('tbrDetail'):$('tbrContent')).querySelector('[data-tbr-favorite="'+CSS.escape(id)+'"]');
        (control||$('favoriteFilter')).focus({preventScroll:true});
      }
    }
  }
  window.addEventListener('beforeunload',event=>{if(pendingFavorites.size){event.preventDefault();event.returnValue='';}});
  $('tbrDialog').querySelector('.tbr-close').addEventListener('click',()=>$('tbrDialog').close());
  $('tbrDialog').addEventListener('click',e=>{if(e.target===$('tbrDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  function fromURL(){const u=new URL(location.href),early=!!window.TBR_EARLY_REQUEST;window.TBR_EARLY_REQUEST=false;tbrSearch=u.searchParams.get('q')||'';enter(early||u.searchParams.get('collection')==='tbr',Object.hasOwn(SOURCE_VIEWS,u.searchParams.get('source'))?u.searchParams.get('source'):'all',early);if(active&&u.searchParams.has('q')){search.value=tbrSearch;render();}}
  window.TBR_READY=true;window.addEventListener('popstate',fromURL);fromURL();
}
