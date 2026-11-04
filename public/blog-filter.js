import {createDateRail} from '/date-rail.js';
const chips=[...document.querySelectorAll('[data-blog-tag]')],rows=[...document.querySelectorAll('[data-blog-entry]')];
const headings=[...document.querySelectorAll('[data-blog-month]')];
const rail=createDateRail(rows,headings);
// Tag links from older posts, feeds or typed URLs may differ in case or use spaces; resolve them to the chip's key.
function currentTag(){const raw=(new URL(location.href).searchParams.get('tag')||'').trim().replace(/\s+/g,'-');const keys=rows.flatMap(row=>JSON.parse(row.dataset.tags));return keys.find(tag=>tag.toLowerCase()===raw.toLowerCase())||raw}
function filterBlog(){const tag=currentTag();let count=0;const years=new Set();
  for(const row of rows){const visible=!tag||JSON.parse(row.dataset.tags).includes(tag);row.hidden=!visible;if(visible){count++;years.add(row.dataset.year)}}
  for(const heading of document.querySelectorAll('[data-blog-year]'))heading.hidden=!years.has(heading.dataset.blogYear);
  const counts=new Map();for(const row of rows)if(!row.hidden)counts.set(row.dataset.month,(counts.get(row.dataset.month)||0)+1);
  for(const heading of headings){const n=counts.get(heading.dataset.blogMonth)||0;heading.hidden=!n;heading.querySelector('.month-count').textContent=n+' '+(n===1?'post':'posts')}
  for(const chip of chips){if(chip.dataset.blogTag===tag)chip.setAttribute('aria-current','true');else chip.removeAttribute('aria-current')}
  const selected=chips.find(c=>c.dataset.blogTag===tag);document.getElementById('blog-result-count').textContent=count+' '+(count===1?'post':'posts')+(tag?' · '+(selected?.childNodes[0]?.textContent||tag):'');
  const empty=document.getElementById('blog-empty');if(empty)empty.hidden=count>0;
  rail.rebuild(counts);
}
for(const chip of chips)chip.addEventListener('click',e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,'',chip.href);filterBlog();window.scrollTo({top:0,behavior:'instant'})});
window.addEventListener('popstate',filterBlog);filterBlog();
