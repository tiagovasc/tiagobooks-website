// Publication archive: understated year context and native mobile month selection.
const monthName=k=>new Date(Number(k.slice(0,4)),Number(k.slice(5,7))-1,1).toLocaleString('en',{month:'long'});
export function createDateRail(rows,headings){
  const rail=document.createElement('aside');rail.className='date-rail editorial-rail';rail.setAttribute('aria-label','Publication date navigation');rail.hidden=true;document.body.append(rail);
  function position(){const content=document.querySelector('.post-cards,.site-list-of-posts');if(content)rail.style.setProperty('--archive-center',content.getBoundingClientRect().left/2+'px')}
  position();window.addEventListener('resize',position);
  let counts=new Map(),keys=[],current='',queued=false;
  function update(){queued=false;if(rail.hidden)return;let chosen=null,best=Infinity;
    for(const row of rows){if(row.hidden)continue;const rect=row.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)continue;const distance=Math.abs((rect.top+rect.bottom)/2-innerHeight/2);if(distance<best){best=distance;chosen=row.dataset.month}}
    chosen=chosen||keys[0];if(!chosen||chosen===current)return;current=chosen;
    rail.querySelector('[data-rail-year]').textContent=chosen.slice(0,4);rail.querySelector('.date-month').textContent=monthName(chosen);const n=counts.get(chosen)||0;rail.querySelector('.date-count').textContent=n+' '+(n===1?'post':'posts');
    const select=rail.querySelector('select');if(document.activeElement!==select)select.value=chosen;
    for(const b of rail.querySelectorAll('[data-date]')){const active=b.classList.contains('month-tick')&&b.dataset.date===chosen;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','date');else b.removeAttribute('aria-current');if(b.classList.contains('month-tick'))b.hidden=b.dataset.date.slice(0,4)!==chosen.slice(0,4);else b.classList.toggle('current-year',b.dataset.date.slice(0,4)===chosen.slice(0,4))}
    const track=rail.querySelector('.date-track'),active=track.querySelector('.active');if(active&&(active.offsetTop<track.scrollTop||active.offsetTop+active.offsetHeight>track.scrollTop+track.clientHeight))track.scrollTop=Math.max(0,active.offsetTop-30);
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(update)}}
  function jump(key){const h=headings.find(h=>h.dataset.blogMonth===key&&!h.hidden)||rows.find(row=>row.dataset.month===key&&!row.hidden);h?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
  rail.addEventListener('click',e=>{const button=e.target.closest('[data-date]');if(button)jump(button.dataset.date)});
  rail.addEventListener('change',e=>{if(e.target.matches('.mobile-month'))jump(e.target.value)});
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  return {rebuild(next){counts=next;keys=[...counts.keys()];current='';rail.hidden=!keys.length;if(!keys.length)return;let last='',buttons='';for(const key of keys){const year=key.slice(0,4),month=monthName(key);if(year!==last){buttons+=`<button data-date="${key}" title="Jump to ${year}">${year}</button>`;last=year}buttons+=`<button class="month-tick" data-date="${key}" title="${month} ${year}" aria-label="Jump to ${month} ${year}">${month.slice(0,3)}</button>`}
    rail.innerHTML=`<div class="date-context"><div class="archive-label">Archive</div><div data-rail-year></div><div class="date-month"></div><div class="date-count"></div></div><nav class="date-track" aria-label="Jump to a publication month">${buttons}</nav><select class="mobile-month" aria-label="Jump to publication month">${keys.map(k=>`<option value="${k}">${monthName(k)} ${k.slice(0,4)}</option>`).join('')}</select>`;position();update();
  }};
}
