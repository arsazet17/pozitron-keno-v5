'use strict';

(() => {
  const VERSION_URL='./version-v622.json';
  const KEY='pozitron_keno_v622_client_build';
  const CHECK_MS=30_000;
  let reloading=false;

  async function getVersion(){
    const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{
      cache:'no-store',
      headers:{
        'cache-control':'no-cache, no-store, must-revalidate',
        pragma:'no-cache'
      }
    });
    if(!r.ok)throw new Error(`version HTTP ${r.status}`);
    return r.json();
  }

  async function check(){
    if(reloading)return;
    try{
      const fresh=await getVersion();
      const next=String(fresh?.build||'').trim();
      if(!next)return;

      const current=localStorage.getItem(KEY);
      if(!current){
        localStorage.setItem(KEY,next);
        return;
      }

      if(current!==next){
        reloading=true;
        localStorage.setItem(KEY,next);

        if('serviceWorker' in navigator){
          try{
            const regs=await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r=>r.update().catch(()=>{})));
          }catch{}
        }

        const u=new URL(location.href);
        u.searchParams.set('_v',next);
        u.searchParams.set('_t',Date.now());
        location.replace(u.toString());
      }
    }catch(e){
      console.warn('Проверка версии временно недоступна',e);
    }
  }

  // ------------------------------------------------------------
  // KENO 6.2.3 · FRIENDLY ARCHIVE STATUS
  // ------------------------------------------------------------
  function archiveStatusText(){
    try{
      const last=draws?.at?.(-1);
      if(!last)return '';
      const d=typeof showDate==='function'?showDate(last.date):(last.date||'');
      const t=typeof normTime==='function'?normTime(last.time):(last.time||'');
      return `Архив актуален · последний №${last.draw} · ${d} ${t}`.trim();
    }catch{
      return '';
    }
  }

  function cleanStatus(){
    const el=document.getElementById('status');
    if(!el)return;
    const text=String(el.textContent||'');
    if(
      /Обновление не выполнено/i.test(text) ||
      /Failed to fetch/i.test(text) ||
      /таймаут источника/i.test(text) ||
      /источники недоступны/i.test(text)
    ){
      const nice=archiveStatusText();
      if(nice)el.textContent=nice;
    }
  }

  // Внешние резервы без нестандартных cache-control/pragma:
  // Android Chrome может блокировать их по CORS и отдавать "Failed to fetch".
  try{
    window.fetchTextWithTimeout=async function(url,ms=7000){
      const controller=new AbortController();
      const timeoutId=setTimeout(()=>controller.abort(),ms);
      try{
        const separator=url.includes('?')?'&':'?';
        const bustCache=url.startsWith('./')||url.includes('raw.githubusercontent.com');
        const requestUrl=bustCache?`${url}${separator}t=${Date.now()}`:url;

        let sameOrigin=false;
        try{
          sameOrigin=url.startsWith('./') || new URL(url,location.href).origin===location.origin;
        }catch{}

        const options={
          cache:'no-store',
          signal:controller.signal
        };

        if(sameOrigin){
          options.headers={
            'cache-control':'no-cache, no-store, must-revalidate',
            pragma:'no-cache'
          };
        }

        const r=await fetch(requestUrl,options);
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        return await r.text();
      }finally{
        clearTimeout(timeoutId);
      }
    };
  }catch(e){
    console.warn('Не удалось включить безопасный резервный fetch',e);
  }

  const statusEl=document.getElementById('status');
  if(statusEl){
    const observer=new MutationObserver(()=>cleanStatus());
    observer.observe(statusEl,{childList:true,subtree:true,characterData:true});
    cleanStatus();
  }

  check();
  setInterval(check,CHECK_MS);
  window.addEventListener('focus',()=>{
    cleanStatus();
    check();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      cleanStatus();
      check();
    }
  });
})();
