// Publication archive: understated year context and native mobile month selection.
const monthName=k=>new Date(Number(k.slice(0,4)),Number(k.slice(5,7))-1,1).toLocaleString('en',{month:'long'});
export function createDateRail(rows,headings){
  const rail=document.createElement('aside');rail.className='date-rail editorial-rail';rail.setAttribute('aria-label','Publication date navigation');rail.hidden=true;document.body.append(rail);
  function position(){const content=document.querySelector('.post-cards,.site-list-of-posts');if(content)rail.style.setProperty('--archive-center',content.getBoundingClientRect().left/2+'px')}
  position();window.addEventListener('resize',position);
  let counts=new Map(),keys=[],current='',queued=false,resizePending=false;
  function revealActiveMonth(track){
    if(!track.clientHeight)return;const active=track.querySelector('.active');
    // Only reveal the clipped edge; never snap a newly active month to the top.
    if(active){const top=active.offsetTop,bottom=top+active.offsetHeight;if(top<track.scrollTop)track.scrollTop=top;else if(bottom>track.scrollTop+track.clientHeight)track.scrollTop=bottom-track.clientHeight}
  }
  // The reading line sits near the top at the start of the page and near the bottom at its end, so the first and
  // last entries can become current; in between it is the viewport centre.
  function readingLine(){const top=Math.max(0,window.scrollY||0),page=document.documentElement,room=page?Math.max(0,page.scrollHeight-innerHeight-top):Infinity;let line=innerHeight/2;if(top<line)line=Math.min(line,96+top);else if(room<line)line=Math.max(line,innerHeight-96-room);return line}
  function update(){queued=false;const resized=resizePending;resizePending=false;if(rail.hidden)return;let chosen=null,best=Infinity;const line=readingLine();
    for(const row of rows){if(row.hidden)continue;const rect=row.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)continue;const distance=Math.abs((rect.top+rect.bottom)/2-line);if(distance<best){best=distance;chosen=row.dataset.month}}
    chosen=chosen||current||keys[0];if(!chosen)return;if(chosen===current){if(resized)revealActiveMonth(rail.querySelector('.date-track'));return}
    const track=rail.querySelector('.date-track'),buttons=[...rail.querySelectorAll('[data-date]')],year=chosen.slice(0,4);
    const yearButton=buttons.find(b=>!b.classList.contains('month-tick')&&b.dataset.date.slice(0,4)===year);
    // Keep the entering year in place while the previous year's months collapse.
    const anchor=current&&current.slice(0,4)!==year&&track.clientHeight?yearButton.offsetTop-track.scrollTop:null;
    current=chosen;
    rail.querySelector('[data-rail-year]').textContent=chosen.slice(0,4);rail.querySelector('.date-month').textContent=monthName(chosen);const n=counts.get(chosen)||0;rail.querySelector('.date-count').textContent=n+' '+(n===1?'post':'posts');
    const select=rail.querySelector('select');if(document.activeElement!==select)select.value=chosen;
    for(const b of buttons){const active=b.classList.contains('month-tick')&&b.dataset.date===chosen;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','date');else b.removeAttribute('aria-current');if(b.classList.contains('month-tick'))b.hidden=b.dataset.date.slice(0,4)!==year;else b.classList.toggle('current-year',b.dataset.date.slice(0,4)===year)}
    if(!track.clientHeight)return;
    if(anchor!==null)track.scrollTop=yearButton.offsetTop-anchor;
    revealActiveMonth(track);
  }
  function schedule(event){if(event?.type==='resize')resizePending=true;if(!queued){queued=true;requestAnimationFrame(update)}}
  function jump(key){const h=headings.find(h=>h.dataset.blogMonth===key&&!h.hidden)||rows.find(row=>row.dataset.month===key&&!row.hidden);h?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
  rail.addEventListener('click',e=>{const button=e.target.closest('[data-date]');if(button)jump(button.dataset.date)});
  rail.addEventListener('change',e=>{if(e.target.matches('.mobile-month'))jump(e.target.value)});
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  return {rebuild(next){counts=next;keys=[...counts.keys()];current='';rail.hidden=!keys.length;if(!keys.length)return;let last='',buttons='';for(const key of keys){const year=key.slice(0,4),month=monthName(key);if(year!==last){buttons+=`<button data-date="${key}" title="Jump to ${year}">${year}</button>`;last=year}buttons+=`<button class="month-tick" data-date="${key}" title="${month} ${year}" aria-label="Jump to ${month} ${year}">${month.slice(0,3)}</button>`}
    const monthsPerYear=new Map();for(const key of keys){const year=key.slice(0,4);monthsPerYear.set(year,(monthsPerYear.get(year)||0)+1)}
    // Reserve the largest expanded year once per filter, not once per scroll.
    rail.style.setProperty('--archive-year-count',monthsPerYear.size);
    rail.style.setProperty('--archive-month-count',Math.max(...monthsPerYear.values()));
    rail.innerHTML=`<div class="date-context"><div data-rail-year></div><div class="date-month"></div><div class="date-count"></div></div><nav class="date-track" aria-label="Jump to a publication month">${buttons}</nav><select class="mobile-month" aria-label="Jump to publication month">${keys.map(k=>`<option value="${k}">${monthName(k)} ${k.slice(0,4)}</option>`).join('')}</select>`;position();update();
  }};
}
