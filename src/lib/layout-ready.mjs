// One bounded first reveal after deferred controls and their geometry are ready.
export function layoutGuard(){
  const root=document.documentElement,library=/^\/library\/?$/.test(location.pathname);
  let dom=document.readyState!=='loading',frame=!library,queued=false,finished=false;
  root.classList.add('layout-pending');
  const waiting=setTimeout(()=>{if(!finished)root.classList.add('layout-waiting');},400);
  const fallback=setTimeout(reveal,2400);
  function reveal(){if(finished)return;finished=true;clearTimeout(waiting);clearTimeout(fallback);root.classList.remove('layout-pending','layout-waiting');root.dataset.layoutReady='true';}
  function flush(){
    if(finished||queued||!dom||!frame)return;queued=true;
    requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));requestAnimationFrame(reveal);});
  }
  window.SiteLayout={ready(){frame=true;flush();}};
  document.addEventListener('DOMContentLoaded',()=>{dom=true;flush();},{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted)reveal();});
  flush();
}
export const layoutGuardMarkup=()=>'<script>('+layoutGuard.toString()+')();</script>';
