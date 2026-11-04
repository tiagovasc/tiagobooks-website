// Same 5 x 7 year lettering and month navigation as Tiago Books.
const digits={"0":[14,17,17,17,17,17,14],"1":[4,12,4,4,4,4,14],"2":[14,17,1,2,4,8,31],"3":[31,2,4,2,1,17,14],"4":[2,6,10,18,31,2,2],"5":[31,16,30,1,1,17,14],"6":[6,8,16,30,17,17,14],"7":[31,1,2,4,8,8,8],"8":[14,17,17,14,17,17,14],"9":[14,17,17,15,1,2,12]};
function dotMatrix(text,p=4){let x=0,out='';for(const char of text){const g=digits[char];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(g[row]&(16>>col))out+=`<circle cx="${x+col*p+p/2}" cy="${row*p+p/2}" r="${(p*.37).toFixed(2)}"/>`;x+=6*p}return `<svg class="dm" width="${x-p}" height="${7*p}" viewBox="0 0 ${x-p} ${7*p}" fill="currentColor" aria-hidden="true">${out}</svg>`}
const monthName=k=>new Date(Number(k.slice(0,4)),Number(k.slice(5,7))-1,1).toLocaleString('en',{month:'long'});
export function createDateRail(rows,headings){
  const rail=document.createElement('aside');rail.className='date-rail';rail.setAttribute('aria-label','Publication date navigation');rail.hidden=true;document.body.append(rail);
  let counts=new Map(),keys=[],current='',queued=false;
  function update(){queued=false;if(rail.hidden)return;let chosen=null,best=Infinity;
    for(const row of rows){if(row.hidden)continue;const rect=row.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)continue;const distance=Math.abs((rect.top+rect.bottom)/2-innerHeight/2);if(distance<best){best=distance;chosen=row.dataset.month}}
    chosen=chosen||keys[0];if(!chosen||chosen===current)return;current=chosen;
    rail.querySelector('[data-rail-year]').innerHTML=dotMatrix(chosen.slice(0,4));rail.querySelector('.date-month').textContent=monthName(chosen);const n=counts.get(chosen)||0;rail.querySelector('.date-count').textContent=n+' '+(n===1?'post':'posts');
    const select=rail.querySelector('select');if(document.activeElement!==select)select.value=chosen;
    for(const b of rail.querySelectorAll('[data-date]')){const active=b.classList.contains('month-tick')&&b.dataset.date===chosen;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','date');else b.removeAttribute('aria-current')}
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(update)}}
  function jump(key){const h=headings.find(h=>h.dataset.blogMonth===key&&!h.hidden);h?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
  rail.addEventListener('click',e=>{const button=e.target.closest('[data-date]');if(button)jump(button.dataset.date)});
  rail.addEventListener('change',e=>{if(e.target.matches('.mobile-month'))jump(e.target.value)});
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  return {rebuild(next){counts=next;keys=[...counts.keys()];current='';rail.hidden=!keys.length;if(!keys.length)return;let last='',buttons='';for(const key of keys){const year=key.slice(0,4),month=monthName(key);if(year!==last){buttons+=`<button data-date="${key}" title="Jump to ${year}">${year}</button>`;last=year}buttons+=`<button class="month-tick" data-date="${key}" title="${month} ${year}" aria-label="Jump to ${month} ${year}">${month.slice(0,3)}</button>`}
    rail.innerHTML=`<div class="date-context"><div data-rail-year></div><div class="date-month"></div><div class="date-count"></div></div><nav class="date-track" aria-label="Jump to a publication month">${buttons}</nav><select class="mobile-month" aria-label="Jump to publication month">${keys.map(k=>`<option value="${k}">${monthName(k)} ${k.slice(0,4)}</option>`).join('')}</select>`;update();
  }};
}
