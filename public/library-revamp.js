/* Presentation and address state only. Canonical records and the save queue are never written here. */
window.LibraryRevamp = (() => {
  const $=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const topic=t=>String(t).trim().toLocaleLowerCase();
  const topics=b=>(b.tags||[]).map(topic).filter(t=>t&&!/^(unfinished|not completed|owned.unread|audiobooks?|read|reading|unread|owned|to.read|next|paused)$/.test(t)&&!/(trip|bookshop|goodreads|instagram|edinburgh|london|purchase)/.test(t));
  const keys=['status','view','sort','fav','topic','format','rating','size','own','subject','enrich','pause','q','year'];
  let api,restoring=true,started=false,sheetPushed=false,returnFocus=null,reviews={},pendingAddress=null;
  const defaults={status:'all',view:'covers',sort:'dateread',favorites:false,topic:'all',format:'all',rating:'all',size:'compact',own:'all',subject:'all',enrich:'all',pauseFilter:'all',year:''};
  const tbr=()=>document.body.classList.contains('tbr-mode');
  const data=()=>tbr()&&window.TBRBrowse?window.TBRBrowse.state():api.ui;
  function matches(b,u){return (u.topic==='all'||topics(b).includes(u.topic))&&(u.format==='all'||topic(b.format)===u.format)&&(u.rating!=='5'||Number(b.rating)===5)&&(!u.year||String(b.date_read||'').startsWith(u.year));}
  function read(){
    const p=new URLSearchParams(location.search),explicit=keys.some(k=>p.has(k))||p.has('collection');
    let saved={};try{saved=JSON.parse(localStorage.getItem('library-browse-v2')||'{}')}catch{}
    if(explicit)Object.assign(api.ui,defaults);else Object.assign(api.ui,saved);
    const u=api.ui;
    const enums={status:['all','read','reading','next','unread','paused'],view:['covers','list','table'],sort:['dateread','dateread_asc','acquired','acquired_asc','title','author','year','year_asc','rating','subject'],size:['compact','large'],own:['all','owned','not'],enrich:['all','yes','review','no'],pause:['all','return','unfinished'],rating:['all','5']};
    for(const [k,allowed] of Object.entries(enums))if(p.has(k)&&allowed.includes(p.get(k)))u[k==='pause'?'pauseFilter':k]=p.get(k);
    for(const k of ['topic','format','subject'])if(p.has(k))u[k]=p.get(k);
    if(p.has('fav'))u.favorites=p.get('fav')==='1';
    if(p.has('year'))u.year=/^\d{4}$/.test(p.get('year'))?p.get('year'):'';
    $('search').value=p.get('q')||'';window.FAVORITES_ONLY=u.favorites;
    $('sort').value=u.sort;api.syncView();
    document.documentElement.dataset.coverSize=u.size;
  }
  function write(){
    if(restoring||!started||tbr()||(!window.TBR_READY&&['tbr','toread'].includes(new URLSearchParams(location.search).get('collection'))))return;
    const u=new URL(location.href),s=api.ui;
    keys.forEach(k=>u.searchParams.delete(k));
    const values={status:s.status,view:s.view,sort:s.sort,fav:s.favorites?'1':'',topic:s.topic,format:s.format,rating:s.rating,size:s.size,own:s.own,subject:s.subject,enrich:s.enrich,pause:s.pauseFilter,q:$('search').value.trim(),year:s.year};
    // Include the three defaults: a shared address must override another browser's saved choices.
    for(const [k,v] of Object.entries(values))if(v&&(!['all','compact'].includes(v)||['status','view','sort'].includes(k)))u.searchParams.set(k,v);
    if(u.href!==location.href)history[$('browseSheet')?.open?'replaceState':'pushState'](history.state,'',u);
    try{localStorage.setItem('library-browse-v2',JSON.stringify(s))}catch{}
  }
  function change(patch){
    if(tbr()&&window.TBRBrowse){window.TBRBrowse.set(patch);return refresh();}
    Object.assign(api.ui,patch);window.FAVORITES_ONLY=api.ui.favorites;api.syncView();api.buildFilters();api.render();refresh();
  }
  function reset(){
    if(tbr()&&window.TBRBrowse){window.TBRBrowse.clear();return refresh();}
    Object.assign(api.ui,{topic:'all',format:'all',rating:'all',own:'all',subject:'all',enrich:'all',favorites:false,year:''});$('search').value='';window.FAVORITES_ONLY=false;api.buildFilters();api.render();
  }
  function field(id,label,options,value){return `<label class="field"><span>${label}</span><select id="${id}">${options.map(([v,l])=>`<option value="${escape(v)}"${String(value)===v?' selected':''}>${escape(l)}</option>`).join('')}</select></label>`;}
  function facets(books,kind){const counts=new Map();for(const b of books)for(const v of kind==='topic'?[...new Set(topics(b))]:[topic(b.format)].filter(Boolean))counts.set(v,(counts.get(v)||0)+1);return [['all','All '+(kind==='topic'?'topics':'formats')],...[...counts].sort((a,b)=>a[0].localeCompare(b[0])).map(([v,n])=>[v,v[0].toUpperCase()+v.slice(1)+' ('+n+')'])];}
  function refresh(){
    if(!api)return;
    const s=data(),books=tbr()?window.TBRBrowse?.books()||[]:api.books();
    document.documentElement.dataset.coverSize=s.size||api.ui.size||'compact';
    const count=tbr()?window.TBRBrowse?.count()||0:api.count();
    const extra=['topic','format','rating'].filter(k=>s[k]&&s[k]!=='all');
    const fc=extra.length+Number(!!s.favorites)+Number(s.own&&s.own!=='all')+Number(s.source&&s.source!=='all')+Number(!!s.year)+Number(s.subject&&s.subject!=='all')+Number(s.enrich&&s.enrich!=='all')+Number(!!s.city)+Number(!!s.shop);
    $('filterCount').textContent=fc;$('filterCount').hidden=!fc;
    $('filtersBtn').setAttribute('aria-label','View and filter'+(fc?', '+fc+' active':''));
    $('favoriteFilter').setAttribute('aria-pressed',String(!!s.favorites));
    $('viewLabel').textContent=({covers:'Covers',list:'List',table:'Table'})[s.view]||'Covers';
    const picker=$('browseCollection').closest('label'),host=matchMedia('(max-width:760px)').matches?$(tbr()?'tbrMain':'main'):$('notchMore').querySelector('.n-row2');
    if(host&&picker.parentElement!==host)host.prepend(picker);
    if($('browseSheet').open)$('filtersPop').hidden=false;
    const current=document.activeElement?.id;
    if(!$('browseOptions').contains(document.activeElement)){
      $('browseOptions').innerHTML=field('browseView','View',[['covers','Covers'],['list','List'],['table','Table']],s.view)+field('browseSize','Cover size',[['compact','Compact'],['large','Large']],s.size||'compact')+field('browseSort','Sort',tbr()?[['recent','Newest discoveries'],['oldest','Oldest discoveries'],['title','Title'],['author','Author']]:Array.from($('sort').options).map(o=>[o.value,o.text]),s.sort)+field('browseShow','Show',[['all','All books'],['favorites','Favourites'],['5','Five stars']],s.favorites?'favorites':s.rating==='5'?'5':'all')+field('browseFormat','Format',facets(books,'format'),s.format)+field('browseTopic','Topic',facets(books,'topic'),s.topic);
    }
    $('browseApply').textContent='Show '+count.toLocaleString('en-GB')+' books';
    $('browseColumns').hidden=s.view!=='table'||tbr();
    if(tbr()){
      let chips=$('tbrBrowseChips');if(!chips){chips=document.createElement('div');chips.id='tbrBrowseChips';chips.className='browse-chips';$('tbrIntro').after(chips);chips.onclick=e=>{const b=e.target.closest('[data-browse-clear]');if(b)change({[b.dataset.browseClear]:'all'})};}
      chips.innerHTML=extra.concat(s.source!=='all'?['source']:[],s.own!=='all'?['own']:[]).map(k=>`<button type="button" data-browse-clear="${k}">${escape(k==='rating'?'Five stars':s[k])} ×</button>`).join('');chips.hidden=!chips.innerHTML;
    }
    if(!tbr()){
      const read=books.filter(b=>b.read_status==='read'),year=String(new Date().getFullYear());
      $('librarySummary').innerHTML=`<a href="/library?status=read">${read.length.toLocaleString('en-GB')} read</a><span>·</span><a href="/library?status=read&year=${year}">${read.filter(b=>String(b.date_read||'').startsWith(year)).length} in ${year}</a><span>·</span><a href="/library?fav=1">${books.filter(b=>b.favorite).length} favourites</a>${s.view==='table'?'<button type="button" id="summaryColumns">Columns</button>':''}`;
      if($('summaryColumns'))$('summaryColumns').onclick=()=>{open();$('browseColumns').open=true;$('columnsPop').hidden=false;};
      const years={};for(const b of read){const y=String(b.date_read||'').slice(0,4);if(/^\d{4}$/.test(y))years[y]=(years[y]||0)+1;}
      const max=Math.max(1,...Object.values(years));$('readingYears').innerHTML=Object.entries(years).sort((a,b)=>a[0].localeCompare(b[0])).map(([y,n])=>`<a href="/library?status=read&year=${y}" title="${n} books read in ${y}" aria-label="${n} books read in ${y}"${s.year===y?' aria-current="true"':''}><span style="height:${Math.max(3,n/max*30)}px"></span><small>${y.slice(2)}</small></a>`).join('');
      const chips=extra.concat(s.year?['year']:[]).map(k=>`<button type="button" data-browse-clear="${k}">${escape(k==='rating'?'Five stars':s[k])} ×</button>`).join('');
      $('browseChips').innerHTML=chips; $('browseChips').hidden=!chips;
    }
    write();
  }
  function open(){
    const d=$('browseSheet');if(d.open)return;
    returnFocus=document.activeElement;refresh();$('filtersPop').hidden=false;d.showModal();$('filtersBtn').setAttribute('aria-expanded','true');
    history.pushState({...history.state,browseSheet:true},'',location.href);sheetPushed=true;
  }
  function close(back=true){
    const d=$('browseSheet');if(!d.open)return;d.close();$('filtersPop').hidden=true;$('filtersBtn').setAttribute('aria-expanded','false');returnFocus?.focus({preventScroll:true});
    if(back&&sheetPushed){pendingAddress=location.href;sheetPushed=false;history.back();}else sheetPushed=false;
  }
  function mount(bridge){
    api=bridge;Object.assign(api.ui,{topic:'all',format:'all',rating:'all',size:'compact',year:''});read();
    const row=$('notchMore').querySelector('.n-row2');
    row.insertAdjacentHTML('afterbegin','<label class="collection-picker"><span class="sr">Collection</span><select id="browseCollection" aria-label="Collection"><option value="library">My library</option><option value="toread">To read</option></select></label>');
    $('viewSwitch').insertAdjacentHTML('afterend','<button type="button" id="viewLabel" class="browse-desktop" aria-haspopup="dialog">Covers</button>');
    $('filtersBtn').insertAdjacentHTML('afterbegin','<span class="filter-word">View and filter</span>');
    $('favoriteFilter').insertAdjacentHTML('beforeend','<span>Favourites</span>');
    $('main').insertAdjacentHTML('afterbegin','<p id="librarySummary" class="library-summary"></p><nav id="readingYears" aria-label="Books read by year"></nav><div id="browseChips" class="browse-chips" hidden></div>');
    document.body.insertAdjacentHTML('beforeend','<dialog id="browseSheet" aria-labelledby="browseTitle"><div class="browse-heading"><h2 id="browseTitle">View and filter</h2><button type="button" id="browseClose" aria-label="Close view and filter">×</button></div><div id="browseOptions"></div><details id="browseAdvanced"><summary>More filters</summary></details><details id="browseColumns"><summary>Table columns</summary></details><div class="browse-actions"><button type="button" id="browseClear">Clear filters</button><button type="button" id="browseApply">Show books</button></div></dialog>');
    $('browseAdvanced').append($('filtersPop'));$('browseColumns').append($('columnsPop'));$('columnsPop').hidden=false;
    $('filtersBtn').addEventListener('click',e=>{e.stopImmediatePropagation();open()},true);
    $('viewLabel').addEventListener('click',open);
    $('browseClose').onclick=()=>close();$('browseApply').onclick=()=>close();$('browseClear').onclick=reset;
    $('browseSheet').addEventListener('cancel',e=>{e.preventDefault();close()});
    $('browseSheet').addEventListener('click',e=>{if(e.target!==$('browseSheet'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()});
    $('browseSheet').addEventListener('change',e=>{
      const m={browseView:'view',browseSize:'size',browseSort:'sort',browseFormat:'format',browseTopic:'topic'};
      if(m[e.target.id])change({[m[e.target.id]]:e.target.value});
      if(e.target.id==='browseShow')change({favorites:e.target.value==='favorites',rating:e.target.value==='5'?'5':'all'});
    });
    $('browseChips').onclick=e=>{const b=e.target.closest('[data-browse-clear]');if(b)change({[b.dataset.browseClear]:b.dataset.browseClear==='year'?'':'all'})};
    $('browseCollection').onchange=e=>window.TBRBrowse?.enter(e.target.value==='toread');
    addEventListener('popstate',()=>{if(pendingAddress){history.replaceState(null,'',pendingAddress);pendingAddress=null;return;}if($('browseSheet').open)close(false);restoring=true;read();api.buildFilters();api.render();restoring=false;refresh()});
    addEventListener('library-browse-render',refresh);
    addEventListener('resize',refresh);
    // New code against an older server remains safe: visitor markup never reads private fields.
    fetch('/review-links.json').then(r=>r.ok?r.json():{}).then(map=>{reviews=map;api.refreshDrawer?.()}).catch(()=>{});
    restoring=false;started=true;refresh();
  }
  return {mount,refresh,matches,topics,reset,review:book=>{const r=reviews[book.id];return r&&topic(r.title)===topic(book.title)?r.url:'';},escape,write};
})();
