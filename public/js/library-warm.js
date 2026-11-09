// Short-lived, public first-page presentation only. Never restore it into editor state.
(() => {
  const KEY='tiagovf-library-preview-v2',TTL=90000,images=[];
  let pending=null,hinted=false;
  function valid(data){const book=b=>b&&typeof b.id==='string'&&typeof b.title==='string'&&(!b.cover||typeof b.cover==='string');return data?.schema===2&&data.owned?.counts&&data.owned.facets&&Array.isArray(data.places)&&Number.isInteger(data.owned.total)&&Array.isArray(data.owned.books)&&data.owned.books.length<=64&&data.owned.books.every(book)&&['all','instagram','bookshops','online'].every(s=>data.dates?.[s]&&Array.isArray(data.tbr?.[s])&&data.tbr[s].length<=48&&data.tbr[s].every(b=>book(b)&&Array.isArray(b.sightings)&&Array.isArray(b.sources)));}
  function read(){try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');return saved&&Date.now()-saved.at<TTL&&Date.now()>=saved.at&&valid(saved.data)?saved.data:null;}catch{return null;}}
  function group(b){return b.date_read?b.date_read.slice(0,7):b.read_status==='reading'?'~reading':b.read_status==='next'?'~next':'~none';}
  function rows(books,columns,groupOf=()=>'',start=0){let count=0,column=0,last=null,index=start;for(;index<books.length;index++){const key=groupOf(books[index]);if(index===start||key!==last||column===columns){if(count===4)break;count++;column=0;}column++;last=key;}return books.slice(start,index);}
  function columns(tbr=false){const width=document.documentElement?.clientWidth||innerWidth;if(innerWidth<=760)return tbr?2:Math.max(1,Math.floor((width-32+16)/120));const bounds=document.querySelector?.('.section-tools,.site-shell')?.getBoundingClientRect(),edge=Math.max(16,(width-1180)/2),left=Math.max(222,(bounds?.left??edge)+18),available=(bounds?.right??width-edge)-18-left;return Math.max(1,Math.floor((available+28)/174));}
  function covers(books,library=false){for(const book of books){if(!book.cover)continue;const cover=library?book.cover.replace(/^covers\/([^\/]+?)(?:\.[A-Za-z0-9]+)?$/,'covers/web/$1.jpg'):book.cover;const url=new URL(cover,location.origin+'/library');if(url.origin!==location.origin)continue;if(images.some(i=>i.src===url.href))continue;const image=new Image();image.fetchPriority='low';image.decoding='async';if(library)image.onerror=()=>{image.onerror=null;image.src=new URL(book.cover,location.origin+'/library').href;};image.src=url.href;images.push(image);}}
  function warm(data){covers(rows(data.owned.books,columns(),group),true);covers(rows(data.tbr.all,columns(true)));}
  function prepare(refresh=false){
    const connection=navigator.connection;
    if(connection?.saveData||/^(slow-2g|2g|3g)$/.test(connection?.effectiveType||'')||document.visibilityState==='hidden')return Promise.resolve(null);
    if(!hinted){hinted=true;for(const [href,as] of [['/library','document'],['/tbr.css','style'],['/tbr.js','script']]){const hint=document.createElement('link');hint.rel='prefetch';hint.href=href;hint.as=as;document.head.append(hint);}}
    const saved=read();if(saved&&refresh!==true){warm(saved);return Promise.resolve(saved);}
    if(!pending)pending=fetch('/api/library-preview',{cache:'no-cache',priority:'low',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('preview');return r.json();}).then(data=>{if(!valid(data))throw Error('preview schema');try{sessionStorage.setItem(KEY,JSON.stringify({at:Date.now(),data}));}catch{}warm(data);return data;}).catch(()=>null).finally(()=>{pending=null;});
    return pending;
  }
  window.LibraryWarm={read,prepare,rows};
  if(location.pathname.startsWith('/library')||location.pathname.startsWith('/admin')||location.pathname.startsWith('/editor'))return;
  function idle(){if('requestIdleCallback' in window)requestIdleCallback(prepare,{timeout:2000});else setTimeout(prepare,300);}
  if(document.readyState==='complete')idle();else window.addEventListener('load',idle,{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')idle();});
  setInterval(()=>prepare(true),60000); // Keep the short-lived preview ready during a long article visit.
  for(const event of ['pointerover','focusin','touchstart'])document.addEventListener(event,e=>{if(e.target.closest?.('a[href="/library"]'))prepare();},{passive:true});
})();
