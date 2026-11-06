const key='tiago-books-ui-v1';
function appearance(){let ui={};try{ui=JSON.parse(localStorage.getItem(key)||'{}')}catch{}return ui}
function apply(){const mode=appearance().theme;if(['light','dark'].includes(mode))document.documentElement.dataset.theme=mode;else document.documentElement.removeAttribute('data-theme');if(!window.CLOUD_LIBRARY){const dark=mode==='dark'||(!['light','dark'].includes(mode)&&matchMedia('(prefers-color-scheme:dark)').matches);const b=document.getElementById('appearanceBtn');if(b){b.setAttribute('aria-label','Switch to '+(dark?'light':'dark')+' mode');b.title=b.getAttribute('aria-label')}}}
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

// One mobile page disclosure; desktop keeps the same links visible inline.
const more=document.querySelector('.nav-more'),moreButton=more?.querySelector('button');
function closeMore(){moreButton?.setAttribute('aria-expanded','false')}
moreButton?.addEventListener('click',()=>moreButton.setAttribute('aria-expanded',String(moreButton.getAttribute('aria-expanded')!=='true')));
document.addEventListener('click',e=>{if(more&&!more.contains(e.target))closeMore()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&moreButton?.getAttribute('aria-expanded')==='true'){closeMore();moreButton.focus()}});
more?.addEventListener('focusout',e=>{if(!more.contains(e.relatedTarget))closeMore()});
more?.querySelectorAll('.nav-extra a').forEach(a=>a.addEventListener('click',closeMore));
window.matchMedia('(max-width:760px)').addEventListener('change',closeMore);
window.addEventListener('pageshow',closeMore);

// Keep the month picker available on scroll-up, without covering text on scroll-down.
let lastScroll=window.scrollY;
window.addEventListener('scroll',()=>{const y=Math.max(0,window.scrollY);if(Math.abs(y-lastScroll)<8)return;
  document.body.classList.toggle('reading-down',y>lastScroll&&y>120);lastScroll=y;
},{passive:true});
document.addEventListener('focusin',e=>{if(e.target.closest?.('.date-rail,.section-tools'))document.body.classList.remove('reading-down')});

// Preserve the media frame and usable link/player if a preview download fails.
function thumbnailFailed(img){if(!(img instanceof HTMLImageElement)||!img.matches('.ep-thumb img,.ep-video img'))return;img.style.visibility='hidden';img.parentElement.classList.add('thumbnail-unavailable')}
document.addEventListener('error',e=>thumbnailFailed(e.target),true);
document.querySelectorAll('.ep-thumb img,.ep-video img').forEach(img=>{if(img.complete&&!img.naturalWidth)thumbnailFailed(img)});

// Links that leave the site open in a new tab so the site stays open (Tiago, 4 Nov 2026). Covers links rendered later too.
(()=>{const own=h=>h.replace(/^www\./,'')===location.hostname.replace(/^www\./,'');const ext=a=>/^https?:$/.test(a.protocol)&&!own(a.hostname);const mark=a=>{if(ext(a)&&!a.target){a.target='_blank';const r=new Set((a.rel||'').split(/\s+/).filter(Boolean));r.add('noopener');a.rel=[...r].join(' ')}};document.querySelectorAll('a[href]').forEach(mark);document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(a)mark(a)},true)})();
