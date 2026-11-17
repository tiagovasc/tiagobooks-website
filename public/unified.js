const key='tiago-books-ui-v1';
function appearance(){let ui={};try{ui=JSON.parse(localStorage.getItem(key)||'{}')}catch{}return ui}
function apply(){const mode=appearance().theme;if(['light','dark'].includes(mode))document.documentElement.dataset.theme=mode;else document.documentElement.removeAttribute('data-theme');for(const m of document.querySelectorAll('meta[name="theme-color"]')){if(!m.dataset.auto)m.dataset.auto=m.content;m.content=mode==='dark'?'#000000':mode==='light'?'#EDEDEA':m.dataset.auto}if(!window.CLOUD_LIBRARY){const dark=mode==='dark'||(!['light','dark'].includes(mode)&&matchMedia('(prefers-color-scheme:dark)').matches);const b=document.getElementById('appearanceBtn');if(b){b.setAttribute('aria-label','Switch to '+(dark?'light':'dark')+' mode');b.title=b.getAttribute('aria-label')}}}
apply();
if(!window.CLOUD_LIBRARY)document.getElementById('appearanceBtn')?.addEventListener('click',()=>{const ui=appearance();const dark=ui.theme==='dark'||(!['dark','light'].includes(ui.theme)&&matchMedia('(prefers-color-scheme:dark)').matches);ui.theme=dark?'light':'dark';try{localStorage.setItem(key,JSON.stringify(ui))}catch{}apply()});
window.addEventListener('storage',apply);
// Active navigation is rendered with each document, before its first paint.
function measureShell(){const style=document.documentElement.style,shell=document.getElementById('siteShell'),section=document.getElementById('sectionTools')||document.getElementById('notch');const set=(key,value)=>{if(style.getPropertyValue(key)!==value)style.setProperty(key,value)};if(shell)set('--shell-h',shell.getBoundingClientRect().bottom+'px');if(!section)set('--section-h','0px');if(section){set('--section-h',section.offsetHeight+'px');set('--notch-h',section.getBoundingClientRect().bottom+'px')}}
measureShell();if(window.ResizeObserver){const observer=new ResizeObserver(measureShell);for(const el of [document.getElementById('siteShell'),document.getElementById('sectionTools')||document.getElementById('notch')])if(el)observer.observe(el)}window.addEventListener('resize',measureShell);


// Signing in or out returns to the page you were on, including an open book.
document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||!['/login','/logout'].includes(u.pathname))return;u.searchParams.set('next',location.pathname+location.search+location.hash);a.href=u.pathname+u.search},true);
// Rows that scroll sideways (main menu, blog tags, library status) fade at an edge that hides more items,
// and scroll the selected item into view, so a selection such as TBR is never hidden off-screen on a phone.
function sideRow(row){
  const fade=()=>{const max=row.scrollWidth-row.clientWidth;row.classList.toggle('fade-start',row.scrollLeft>2);row.classList.toggle('fade-end',max-row.scrollLeft>2)};
  const reveal=()=>{const sel=row.querySelector('[aria-current="page"],[aria-current="true"],[aria-pressed="true"]');if(!sel||row.scrollWidth<=row.clientWidth)return;const r=row.getBoundingClientRect(),s=sel.getBoundingClientRect();if(s.left<r.left+8||s.right>r.right-8)row.scrollLeft+=s.left-r.left-(r.width-s.width)/2;fade()};
  row.addEventListener('scroll',fade,{passive:true});if(window.ResizeObserver)new ResizeObserver(fade).observe(row);
  new MutationObserver(()=>requestAnimationFrame(reveal)).observe(row,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-current','aria-pressed']});
  reveal();fade();
}
for(const row of document.querySelectorAll('.unified-nav,.tag-chips,#statusSeg'))sideRow(row);

// The approved phone menu uses a native modal: one set of links and live utility controls.
// Moving, rather than cloning, keeps appearance/owner listeners and IDs intact.
const more=document.querySelector('.nav-more'),moreButton=more?.querySelector('button');
const phoneMenu=matchMedia('(max-width:760px)'),menuLinks=more?.querySelector('.nav-extra'),menuActions=document.querySelector('#siteShell .shell-actions'),actionsHome=menuActions?.parentElement;
let menuDialog;
function closeMore(){if(menuDialog?.open)menuDialog.close();moreButton?.setAttribute('aria-expanded','false')}
if(moreButton&&menuLinks&&menuActions){
  menuDialog=document.createElement('dialog');menuDialog.id='mobileSiteMenu';menuDialog.setAttribute('aria-labelledby','mobileSiteMenuTitle');
  menuDialog.innerHTML='<div class="mobile-menu-heading"><h2 id="mobileSiteMenuTitle">Explore the website</h2><button type="button" class="mobile-menu-close" aria-label="Close website menu" autofocus>×</button></div><div class="mobile-menu-utilities"></div><nav class="mobile-menu-links" aria-label="Website sections"></nav>';
  more.append(menuDialog);moreButton.setAttribute('aria-controls',menuDialog.id);document.body.classList.add('mobile-nav-ready');
  for(const action of menuActions.children){const text=document.createElement('span');text.className='mobile-action-label';text.textContent=action.id==='appearanceBtn'?'Appearance':action.id==='editAccess'?'Edit writing':'Search';text.setAttribute('aria-hidden','true');action.append(text)}
  moreButton.addEventListener('click',()=>{
    if(!phoneMenu.matches)return;
    if(menuDialog.open){closeMore();return}
    menuDialog.querySelector('.mobile-menu-links').append(menuLinks);menuDialog.querySelector('.mobile-menu-utilities').append(menuActions);
    moreButton.setAttribute('aria-expanded','true');document.body.classList.add('mobile-menu-open');menuDialog.showModal();
  });
  menuDialog.querySelector('.mobile-menu-close').addEventListener('click',closeMore);
  menuDialog.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const controls=[...menuDialog.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.hidden),first=controls[0],last=controls.at(-1);
    if((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first)?.focus()}
  });
  menuDialog.addEventListener('close',()=>{more.insertBefore(menuLinks,menuDialog);actionsHome.append(menuActions);document.body.classList.remove('mobile-menu-open');moreButton.setAttribute('aria-expanded','false');if(phoneMenu.matches)moreButton.focus({preventScroll:true})});
  menuDialog.addEventListener('click',e=>{if(e.target.closest('a[href]'))closeMore();else if(e.target===menuDialog){const r=menuDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeMore()}});
}
phoneMenu.addEventListener('change',closeMore);
window.addEventListener('pageshow',closeMore);

// Keep the month picker available on scroll-up, without covering text on scroll-down.
let lastScroll=window.scrollY;
const nearTop=y=>document.body.classList.toggle('near-top',y<160);nearTop(Math.max(0,window.scrollY));
window.addEventListener('scroll',()=>{const y=Math.max(0,window.scrollY);nearTop(y);if(Math.abs(y-lastScroll)<8)return;
  document.body.classList.toggle('reading-down',y>lastScroll&&y>120);lastScroll=y;
},{passive:true});
document.addEventListener('focusin',e=>{if(e.target.closest?.('.date-rail,.section-tools'))document.body.classList.remove('reading-down')});

// Preserve the media frame and usable link/player if a preview download fails.
function thumbnailFailed(img){if(!(img instanceof HTMLImageElement)||!img.matches('.ep-thumb img,.ep-video img'))return;img.style.visibility='hidden';img.parentElement.classList.add('thumbnail-unavailable')}
document.addEventListener('error',e=>thumbnailFailed(e.target),true);
document.querySelectorAll('.ep-thumb img,.ep-video img').forEach(img=>{if(img.complete&&!img.naturalWidth)thumbnailFailed(img)});

// Links that leave the site open in a new tab so the site stays open (Tiago, 4 Nov 2026). Covers links rendered later too.
(()=>{const own=h=>h.replace(/^www\./,'')===location.hostname.replace(/^www\./,'');const ext=a=>/^https?:$/.test(a.protocol)&&!own(a.hostname);const mark=a=>{if(ext(a)&&!a.target){a.target='_blank';const r=new Set((a.rel||'').split(/\s+/).filter(Boolean));r.add('noopener');a.rel=[...r].join(' ')}};document.querySelectorAll('a[href]').forEach(mark);document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(a)mark(a)},true)})();

// Main menu speed (Tiago, 9 Nov 2026): the pressed page is shown as selected at once, and pages are
// loaded ahead of the click (on hover, or when the phone menu opens) so the switch itself is instant.
(()=>{
  const nav=document.querySelector('#siteShell .unified-nav');if(!nav)return;
  const links=[...nav.querySelectorAll('.nav-extra a[href^="/"]')],toggle=nav.querySelector('.nav-more-toggle');
  const saved={current:links.filter(a=>a.hasAttribute('aria-current')),on:toggle?.classList.contains('is-current')};
  const here=a=>new URL(a.href).pathname===location.pathname;
  let pressed=null,leaving=false;
  function show(a){for(const l of links)if(l===a)l.setAttribute('aria-current','page');else l.removeAttribute('aria-current');toggle?.classList.add('is-current')}
  function restore(){pressed=null;leaving=false;for(const l of links)if(saved.current.includes(l))l.setAttribute('aria-current','page');else l.removeAttribute('aria-current');toggle?.classList.toggle('is-current',!!saved.on)}
  const plain=e=>!(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey);
  nav.addEventListener('pointerdown',e=>{const a=e.target.closest('a[href]');if(e.button!==0||!plain(e)||!links.includes(a))return;pressed=a;show(a)});
  nav.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!links.includes(a))return;if(e.defaultPrevented||!plain(e)||e.button!==0){restore();return}leaving=true;show(a)});
  // A press that ends elsewhere, or turns into a scroll, did not choose a page.
  addEventListener('pointerup',()=>setTimeout(()=>{if(pressed&&!leaving)restore()}),true);
  addEventListener('pointercancel',()=>{if(pressed&&!leaving)restore()},true);
  addEventListener('pageshow',e=>{if(e.persisted)restore()});
  // Chromium: prepare the page under the pointer (prerender) and, once the menu is reached, fetch every choice.
  // The Library is only ever fetched, never run ahead: its save and sync code must start only in a page the
  // owner actually opened (a sign-in in another tab would otherwise make a hidden copy an editing session).
  if(!HTMLScriptElement.supports?.('speculationrules'))return;
  const urls=links.filter(a=>!here(a)).map(a=>new URL(a.href).pathname);
  const rules=r=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify(r);document.head.append(s)};
  const ahead=urls.filter(u=>u!=='/library');
  rules({prerender:[{source:'list',urls:ahead,eagerness:'moderate'}],prefetch:[{source:'list',urls,eagerness:'moderate'}]});
  // Reaching for the menu (pointer over it, keyboard focus in it, or opening the phone menu) fetches every
  // choice once: a handful of small documents, kept by the browser for a few minutes.
  let opened=false;const open=()=>{if(opened)return;opened=true;const c=navigator.connection;if(c?.saveData||/^(slow-2g|2g)$/.test(c?.effectiveType||''))return;rules({prefetch:[{source:'list',urls,eagerness:'immediate'}]})};
  nav.addEventListener('pointerenter',open);nav.addEventListener('focusin',open);toggle?.addEventListener('pointerdown',open);toggle?.addEventListener('click',open);
})();
/* Shared progressive enhancements. Content remains usable without these controls. */
window.enhanceDateRail=function(rail){
  if(!rail||rail.hidden||rail.querySelector('.date-open'))return;
  const open=document.createElement('button');open.className='date-open';open.type='button';open.setAttribute('aria-label','Choose a month or year');
  const top=document.createElement('button');top.className='date-up';top.type='button';top.textContent='↑';top.setAttribute('aria-label','Back to top');
  top.onclick=()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  rail.append(open,top);
  const label=()=>{const sel=rail.querySelector('select');open.textContent=sel?.selectedOptions[0]?.textContent||'Choose date'};label();if(rail._dateLabel)removeEventListener('scroll',rail._dateLabel);rail._dateLabel=label;addEventListener('scroll',label,{passive:true});
  open.onclick=()=>{
    let dialog=document.getElementById('dateSheet');if(!dialog){dialog=document.createElement('dialog');dialog.id='dateSheet';dialog.setAttribute('aria-labelledby','dateSheetTitle');document.body.append(dialog);}
    const counts=JSON.parse(rail.dataset.monthCounts||'{}'),years={};for(const [k,n] of Object.entries(counts))if(/^\d{4}-\d{2}$/.test(k))(years[k.slice(0,4)]??=[]).push([k,n]);
    const totals=Object.values(years).map(months=>months.reduce((n,p)=>n+Number(p[1]),0)),max=Math.max(1,...totals);
    dialog.innerHTML='<div class="browse-heading"><h2 id="dateSheetTitle">Browse by date</h2><button type="button" aria-label="Close date picker">×</button></div>'+Object.entries(years).sort((a,b)=>b[0].localeCompare(a[0])).map(([year,months])=>{const n=months.reduce((sum,p)=>sum+Number(p[1]),0);return `<section class="date-year"><button type="button" data-jump="${months[0][0]}"><b>${year}</b><span class="year-bar" style="width:${n/max*45}%"></span><span>${n}</span></button><div>${months.map(([k,n])=>`<button type="button" data-jump="${k}">${new Date(k+'-01T12:00:00').toLocaleString('en',{month:'short'})} <small>${n}</small></button>`).join('')}</div></section>`}).join('');
    const close=()=>{dialog.close();open.focus({preventScroll:true})};dialog.querySelector('.browse-heading button').onclick=close;
    dialog.onclick=e=>{const b=e.target.closest('[data-jump]');if(b){const selector=rail.querySelector('select');if(selector){selector.value=b.dataset.jump;selector.dispatchEvent(new Event('change',{bubbles:true}));}close();}else if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}};
    dialog.showModal();
  };
};
document.querySelectorAll('.date-rail').forEach(window.enhanceDateRail);
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches?.('.date-rail'))window.enhanceDateRail(node)}).observe(document.body,{childList:true});

// Explicit affordance for clipped Blog chips, retaining the existing choices.
const chips=document.querySelector('.section-tools .tag-chips');
if(chips){const next=document.createElement('button');next.type='button';next.className='chips-next';next.textContent='›';next.setAttribute('aria-label','Show more Blog filters');next.onclick=()=>chips.scrollBy({left:180,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});chips.parentElement.append(next);const update=()=>next.hidden=chips.scrollWidth-chips.clientWidth-chips.scrollLeft<3;chips.addEventListener('scroll',update,{passive:true});addEventListener('resize',update);update();}

// Long articles get a contents list made only from their authored headings.
const article=document.querySelector('article[data-entry-kind=post]');
if(article){
  document.body.classList.add('reading-article');
  const headings=[...article.querySelectorAll('.e-content h2')];
  if(headings.length>=2){const aside=document.createElement('aside');aside.className='article-contents';aside.setAttribute('aria-label','On this page');const title=document.createElement('p');title.textContent='On this page';aside.append(title);headings.forEach((h,i)=>{h.id||='section-'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;aside.append(a)});article.append(aside);if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){aside.querySelectorAll('a').forEach(a=>a.toggleAttribute('aria-current',a.hash==='#'+entry.target.id));}},{rootMargin:'-10% 0px -65% 0px'});headings.forEach(h=>observer.observe(h));}}
}
