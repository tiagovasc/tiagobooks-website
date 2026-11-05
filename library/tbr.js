// Separate discovery data: no library IDs, ownership flags, ratings or save requests.
export const SOURCES = {bookshops:'Book shops',instagram:'Instagram',online:'Online'};
export const SOURCE_VIEWS = {all:'All',...SOURCES};
export function sourceLabel(book){return (book.sources||((book.sightings||[]).length?['bookshops']:[])).map(s=>SOURCES[s]).filter(Boolean).join(' · ');}
export function filterBooks(books,{query='',city='',shop='',sort='recent'}={}) {
  const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return books.flatMap(b=>{
    const sightings=b.sightings.filter(s=>(!city||s.city===city)&&(!shop||s.bookshop===shop));
    const text=[b.title,b.author,...b.sightings.flatMap(s=>[s.city,s.bookshop])].join(' ').toLocaleLowerCase();
    return sightings.length&&words.every(w=>text.includes(w))?[{...b,sightings}]:[];
  }).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='author'?a.author.localeCompare(b.author):
    (Date.parse(b.sightings[0].photographed_at)-Date.parse(a.sightings[0].photographed_at))*(sort==='oldest'?-1:1)||a.sightings[0].visit_id.localeCompare(b.sightings[0].visit_id)||a.id.localeCompare(b.id));
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
export function filterCatalogue(books,{source='all',query='',city='',shop='',sort='recent'}={}) {
  const collection=sourceBooks(books,source);
  const order=new Map(collection.map((b,i)=>[b.id,i]));
  if(source==='bookshops')return filterBooks(collection,{query,city,shop,sort});
  const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return collection.filter(b=>{
    const text=[b.title,b.author,b.description,...(source==='all'?[sourceLabel(b),...(b.sightings||[]).flatMap(s=>[s.city,s.bookshop])]:[])].join(' ').toLocaleLowerCase();
    return words.every(w=>text.includes(w));
  }).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='author'?(a.author||'').localeCompare(b.author||''):
    (source==='all'?order.get(a.id)-order.get(b.id):(a[source+'_order']??0)-(b[source+'_order']??0))*(sort==='oldest'?-1:1)||a.id.localeCompare(b.id));
}
export function collectionGroups(books,source,sort='recent') {
  return groupBooks(books,source==='bookshops'&&['recent','oldest'].includes(sort));
}
export function sortOptions(source) {
  return [['recent',source==='bookshops'?'Newest photos':'Default order'],['oldest',source==='bookshops'?'Oldest photos':'Reverse order'],['title','Title'],['author','Author']];
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n||0).toLocaleString('en-GB');
export const tripMonthLabel=s=>new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s.slice(0,7)+'-01T12:00:00Z'));
const date=tripMonthLabel;
// Metadata dates describe local photo dates, never date read or acquired.
export function placeLabel(s){return [s.city,s.bookshop].filter(Boolean).join(' · ');}
if(typeof document!=='undefined')init();
function init(){
  const $=id=>document.getElementById(id), body=document.body, search=$('search');
  const status=$('statusSeg'),bar=status.parentElement;
  $('notchMore').querySelector('.n-more-inner').insertAdjacentHTML('beforeend','<div id="tbrSources"><nav class="seg" id="tbrSourceTabs" aria-label="TBR source">'+['all','instagram','bookshops','online'].map(k=>`<button type="button" data-source="${k}" aria-pressed="${k==='all'}">${SOURCE_VIEWS[k]}</button>`).join('')+'</nav><select id="tbrSourceMobile" aria-label="TBR source">'+['all','instagram','bookshops','online'].map(k=>`<option value="${k}" ${k==='all'?'selected':''}>${SOURCE_VIEWS[k]}</option>`).join('')+'</select></div>');
  $('sort').closest('label').id='sortLabel';
  $('sortLabel').insertAdjacentHTML('afterend','<label id="tbrSortLabel" class="pill-select icon-select" title="Sort"><svg class="i" aria-hidden="true"><use href="#i-sort"/></svg><span class="lbl">Sort</span><select id="tbrSort" aria-label="Sort TBR books"><option value="recent">Newest photos</option><option value="oldest">Oldest photos</option><option value="title">Title</option><option value="author">Author</option></select></label>');
  $('main').insertAdjacentHTML('afterend','<main class="wrap" id="tbrMain" hidden><div id="tbrIntro"></div><div id="tbrFilters" class="tbr-toolbar"></div><div id="tbrContent" aria-live="polite"></div></main><dialog id="tbrDialog" aria-labelledby="tbrDetailTitle"><div class="tbr-dialog-head"><span>TBR · Book shops</span><button type="button" class="tbr-close" aria-label="Close book details">×</button></div><div class="tbr-detail" id="tbrDetail"></div></dialog>');
  let moreObserver=null;
  let active=false,source='all',books=null,loading=null,error=false,limit=48,view='covers',sort='recent',city='',shop='',libSearch='',libView='covers',tbrSearch='';
  function pressViews(v){$('viewSwitch').querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));}
  function views(v){view=v;pressViews(v);}
  function sources(k){source=Object.hasOwn(SOURCE_VIEWS,k)?k:'all';city='';shop='';limit=48;$('tbrSourceMobile').value=source;$('tbrSourceTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.source===source)));if(active)search.placeholder=source==='bookshops'||source==='all'?'Search TBR books, authors, cities or shops':'Search TBR books and authors';}
  function address(){const u=new URL(location.href);if(active){u.searchParams.set('collection','tbr');u.searchParams.set('source',source);}else{u.searchParams.delete('collection');u.searchParams.delete('source');}history.pushState(null,'',u);}
  function enter(on,k='all',push=true){
    if(on&&!active){libSearch=search.value;libView=$('viewSwitch').querySelector('[aria-pressed="true"]')?.dataset.view||'covers';search.value=tbrSearch;}
    if(!on&&active){tbrSearch=search.value;search.value=libSearch;pressViews(libView);}
    active=on;body.classList.toggle('tbr-mode',on);$('tbrMain').hidden=!on;$('main').inert=on;
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
    loading=fetch('/tbr-catalogue.json').then(r=>{if(!r.ok)throw Error('load');return r.json();}).then(data=>{if(!Array.isArray(data.books)||data.books.some(b=>!b.id||!b.title||!Array.isArray(b.sightings)||!Array.isArray(b.sources)))throw Error('schema');books=data.books;const total=catalogueCounts(books).total;status.dataset.tbrCount=total;const tbrButton=status.querySelector('[data-collection="tbr"]');if(tbrButton)tbrButton.innerHTML='TBR <span class="n">'+number(total)+'</span>';}).catch(()=>{error=true;}).finally(()=>{loading=null;if(active)render();});
  }
  function cover(b){return b.cover?`<span class="tbr-cover"><img src="${escape(b.cover)}" alt="" width="320" height="480" loading="lazy" decoding="async"></span>`:`<span class="tbr-cover"><span class="tbr-placeholder">${escape(b.title)}<br><small>Cover unavailable</small></span></span>`;}
  function place(b){if(source!=='bookshops')return `<span class="tbr-place">${escape(source==='all'?sourceLabel(b):SOURCES[source])}</span>`;const s=b.sightings[0];return `<span class="tbr-place" title="${escape(placeLabel(s))}"><span class="tbr-city">${escape(s.city)}</span><span class="tbr-shop">${escape(s.bookshop)}</span><span class="tbr-date"><time datetime="${escape(s.photographed_at.slice(0,7))}">${date(s.photographed_at)}</time>${b.sightings.length>1?` · ${b.sightings.length} photos`:''}</span></span>`;}
  function card(b){return `<button type="button" class="tbr-book" data-tbr-id="${escape(b.id)}" aria-label="${escape(b.title+' by '+(b.author||'uncredited')+'. '+(source==='bookshops'?placeLabel(b.sightings[0]):source==='all'?sourceLabel(b):SOURCES[source]))}">${cover(b)}<span class="tbr-copy"><h3>${escape(b.title)}</h3><span class="tbr-author">${escape(b.author||'Author not identified')}</span></span>${place(b)}</button>`;}
  function filtered(){return filterCatalogue(books||[],{source,query:search.value,city,shop,sort});}
  function sorting(){return sortOptions(source).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');}
  function render(){
    moreObserver?.disconnect();
    if(!active)return;
    const list=filtered(),collection=books?sourceBooks(books,source):[];
    $('tbrIntro').innerHTML=`<div class="tbr-intro"><div><p class="tbr-eyebrow">To be read</p><h2>${SOURCE_VIEWS[source]}</h2><p>${source==='all'?'Everything saved from book shops, Instagram and online, together.':source==='bookshops'?'Books that caught my eye on bookshop visits, starting with the most recent photos.':source==='online'?'Books I found online and saved to explore.':'Books discovered on Instagram and saved to explore.'}</p></div>${books?`<span class="tbr-count">${number(list.length)} ${list.length===1?'book':'books'}${list.length!==collection.length?' of '+number(collection.length):''}</span>`:''}</div>`;
    $('tbrSort').innerHTML=sorting();$('tbrSort').value=sort;$('tbrSortLabel').classList.toggle('is-active',sort!=='recent');
    const filter=$('tbrFilters');filter.innerHTML='';
    if(books&&source==='bookshops'){
      const cities=[...new Set(collection.flatMap(b=>b.sightings.map(s=>s.city)))].sort();
      const shops=[...new Set(collection.flatMap(b=>b.sightings.filter(s=>!city||s.city===city).map(s=>s.bookshop)))].sort();
      const options=(xs,v)=>xs.map(x=>`<option ${x===v?'selected':''} value="${escape(x)}">${escape(x)}</option>`).join('');
      filter.innerHTML=`<select id="tbrCity" class="${city?'is-active':''}" aria-label="Filter by city"><option value="">All cities</option>${options(cities,city)}</select><select id="tbrShop" class="${shop?'is-active':''}" aria-label="Filter by bookshop"><option value="">All bookshops</option>${options(shops,shop)}</select><select id="tbrSortMobile" aria-label="Sort TBR books"><option value="recent">Newest photos</option><option value="oldest">Oldest photos</option><option value="title">Title</option><option value="author">Author</option></select>${city||shop||search.value||sort!=='recent'?'<button type="button" data-tbr-clear>Reset browsing</button>':''}`;
      $('tbrSortMobile').value=sort;
    }
    if(books&&source!=='bookshops'){
      filter.innerHTML=`<select id="tbrSortMobile" aria-label="Sort TBR books">${sorting()}</select>${search.value||sort!=='recent'?'<button type="button" data-tbr-clear>Reset browsing</button>':''}`;
      $('tbrSortMobile').value=sort;
    }
    if(!books){$('tbrContent').innerHTML=error?'<div class="empty-state"><h2>Couldn’t load these books</h2><p>Please try again.</p><button class="tbr-retry" type="button">Retry</button></div>':`<div class="empty-state" role="status">Loading ${source==='all'?'all TBR books':source==='bookshops'?'bookshop discoveries':SOURCES[source]+' books'}…</div>`;return;}
    if(!list.length){$('tbrContent').innerHTML=`<div class="empty-state"><h2>No books match</h2><p>${source==='bookshops'?'Try another title, city or bookshop.':'Try another title or author.'}</p><button type="button" data-tbr-clear>Clear search and filters</button></div>`;return;}
    drawBatch(list,0);
  }
  function drawBatch(list,start){
    moreObserver?.disconnect();
    const content=$('tbrContent'),shown=list.slice(start,limit);
    content.querySelector('.tbr-more')?.remove();
    if(!start)content.innerHTML='';
    if(view==='table'){
      if(!start)content.innerHTML=`<div class="tbr-table-scroll" tabindex="0" role="region" aria-label="TBR books table"><table class="tbr-table"><thead><tr><th scope="col">Book</th><th scope="col">Author</th>${source==='bookshops'?'<th scope="col">City</th><th scope="col">Bookshop</th><th scope="col">Month</th>':'<th scope="col">Source</th>'}</tr></thead><tbody></tbody></table></div>`;
      content.querySelector('tbody').insertAdjacentHTML('beforeend',shown.map(b=>{const s=b.sightings[0];return `<tr><td><button type="button" data-tbr-id="${escape(b.id)}">${escape(b.title)}</button></td><td>${escape(b.author||'Author not identified')}</td>${source==='bookshops'?`<td>${escape(s.city)}</td><td>${escape(s.bookshop)}</td><td><time datetime="${escape(s.photographed_at.slice(0,7))}">${date(s.photographed_at)}</time></td>`:`<td>${escape(source==='all'?sourceLabel(b):SOURCES[source])}</td>`}</tr>`;}).join(''));
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
    if(more&&window.IntersectionObserver){
      if(!moreObserver)moreObserver=new IntersectionObserver(entries=>{
        if(active&&entries.some(e=>e.isIntersecting&&e.target.isConnected))appendMore();
      },{rootMargin:'0px 0px 1000px 0px'});
      moreObserver.observe(more);
    }
  }
  function appendMore(){
    if(!active||!books)return;
    const list=filtered(),start=limit;
    if(start>=list.length)return;
    limit+=48;drawBatch(list,start);
  }

  function openBook(id){
    const b=books?.find(x=>x.id===id);if(!b)return;
    $('tbrDialog').querySelector('.tbr-dialog-head span').textContent='TBR · '+(source==='all'?sourceLabel(b):SOURCES[source]);
    const sightings=b.sightings.length?`<h3>Spotted in book shops</h3><ul>${b.sightings.map(s=>`<li><strong>${escape(s.bookshop)}</strong><br>${escape(s.city)}${s.country?', '+escape(s.country):''} · ${date(s.photographed_at)}${/unresolved|probable|possible|uncertain|unknown/i.test(s.shop_status)?`<br>Shop identification: ${escape(s.shop_status)}`:''}</li>`).join('')}</ul>`:'';
    $('tbrDetail').innerHTML=`${b.cover?`<img src="${escape(b.cover)}" alt="Cover of ${escape(b.title)}">`:''}<h2 id="tbrDetailTitle">${escape(b.title)}</h2><p>${escape(b.author||'Author not identified')}</p>${b.identity_status==='needs_review'?'<p class="tbr-note">The exact book is still being identified.</p>':''}${b.description?`<p>${escape(b.description)}</p>`:''}${source==='all'?`<p class="tbr-note">Saved from: ${escape(sourceLabel(b))}.</p>`:source!=='bookshops'?`<p class="tbr-note">${source==='instagram'?'Discovered on Instagram':'Found online'} and saved to explore.</p>`:''}${sightings}<p class="tbr-note">Saved as a reading interest. This doesn’t indicate ownership or a completed read.${b.sightings.length?' Cover and description may represent a different edition from the photographed copy.':''}</p>`;
    $('tbrDialog').showModal();
  }
  status.addEventListener('click',e=>{if(active&&e.target.closest('[data-status]'))enter(false,source);},true);
  document.addEventListener('click',e=>{
    const collection=e.target.closest('[data-collection]');if(collection){enter(collection.dataset.collection==='tbr',source);return;}
    const tab=e.target.closest('[data-source]');if(tab){sources(tab.dataset.source);address();render();load();return;}
    if(!active)return;
    const b=e.target.closest('[data-tbr-id]');if(b){openBook(b.dataset.tbrId);return;}
    if(e.target.closest('[data-tbr-more]')){const old=limit;appendMore();$('tbrContent').querySelectorAll('[data-tbr-id]')[old]?.focus({preventScroll:true});}
    if(e.target.closest('[data-tbr-clear]')){city='';shop='';search.value='';sort='recent';limit=48;$('searchClear').hidden=true;render();}
    if(e.target.closest('.tbr-retry')){error=false;render();load();}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='tbrSourceMobile'){sources(e.target.value);address();render();load();}
    if(e.target.id==='tbrCity'){city=e.target.value;shop='';limit=48;render();}
    if(e.target.id==='tbrShop'){shop=e.target.value;limit=48;render();}
    if(['tbrSort','tbrSortMobile'].includes(e.target.id)){sort=e.target.value;limit=48;render();}
  });
  search.addEventListener('input',e=>{if(!active)return;e.stopImmediatePropagation();limit=48;$('searchClear').hidden=!search.value;render();},true);
  $('searchClear').addEventListener('click',e=>{if(!active)return;e.stopImmediatePropagation();search.value='';$('searchClear').hidden=true;limit=48;render();search.focus();},true);
  $('viewSwitch').addEventListener('click',e=>{if(!active)return;const b=e.target.closest('[data-view]');if(b){e.stopImmediatePropagation();views(b.dataset.view);render();}},true);
  document.addEventListener('keydown',e=>{
    if(!active)return;
    const typing=e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(!typing&&['1','2','3'].includes(e.key)&&!$('tbrDialog').open){e.preventDefault();views(['covers','list','table'][Number(e.key)-1]);render();}
    if(!typing&&e.key==='/'&&!$('tbrDialog').open){e.preventDefault();search.focus();search.select();}
    if(e.key==='Escape'&&e.target===search){search.value='';$('searchClear').hidden=true;render();}
  },true);
  $('tbrDialog').querySelector('.tbr-close').addEventListener('click',()=>$('tbrDialog').close());
  $('tbrDialog').addEventListener('click',e=>{if(e.target===$('tbrDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  function fromURL(){const u=new URL(location.href);tbrSearch=u.searchParams.get('q')||'';enter(u.searchParams.get('collection')==='tbr',Object.hasOwn(SOURCE_VIEWS,u.searchParams.get('source'))?u.searchParams.get('source'):'all',false);if(active&&u.searchParams.has('q')){search.value=tbrSearch;render();}}
  window.addEventListener('popstate',fromURL);fromURL();
}
