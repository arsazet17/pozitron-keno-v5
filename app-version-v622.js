'use strict';

(() => {
  const VERSION_URL='./version-v622.json';
  const KEY='pozitron_keno_v622_client_build';
  const CHECK_MS=30_000;
  let reloading=false;

  async function getVersion(){
    const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache, no-store, must-revalidate',pragma:'no-cache'}});
    if(!r.ok)throw new Error(`version HTTP ${r.status}`);
    return r.json();
  }

  async function check(){
    if(reloading)return;
    try{
      const fresh=await getVersion(),next=String(fresh?.build||'').trim();
      if(!next)return;
      const current=localStorage.getItem(KEY);
      if(!current){localStorage.setItem(KEY,next);return}
      if(current!==next){
        reloading=true;localStorage.setItem(KEY,next);
        if('serviceWorker' in navigator){try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update().catch(()=>{})))}catch{}}
        const u=new URL(location.href);u.searchParams.set('_v',next);u.searchParams.set('_t',Date.now());location.replace(u.toString());
      }
    }catch(e){console.warn('Проверка версии временно недоступна',e)}
  }

  function archiveStatusText(){
    try{
      const last=draws?.at?.(-1);if(!last)return '';
      const d=typeof showDate==='function'?showDate(last.date):(last.date||'');
      const t=typeof normTime==='function'?normTime(last.time):(last.time||'');
      return `Архив актуален · последний №${last.draw} · ${d} ${t}`.trim();
    }catch{return ''}
  }
  function cleanStatus(){
    const el=document.getElementById('status');if(!el)return;
    if(/Обновление не выполнено|Failed to fetch|таймаут источника|источники недоступны/i.test(String(el.textContent||''))){
      const nice=archiveStatusText();if(nice)el.textContent=nice;
    }
  }

  try{
    window.fetchTextWithTimeout=async function(url,ms=7000){
      const controller=new AbortController(),timeoutId=setTimeout(()=>controller.abort(),ms);
      try{
        const separator=url.includes('?')?'&':'?';
        const bustCache=url.startsWith('./')||url.includes('raw.githubusercontent.com');
        const requestUrl=bustCache?`${url}${separator}t=${Date.now()}`:url;
        let sameOrigin=false;try{sameOrigin=url.startsWith('./')||new URL(url,location.href).origin===location.origin}catch{}
        const options={cache:'no-store',signal:controller.signal};
        if(sameOrigin)options.headers={'cache-control':'no-cache, no-store, must-revalidate',pragma:'no-cache'};
        const r=await fetch(requestUrl,options);if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();
      }finally{clearTimeout(timeoutId)}
    };
  }catch(e){console.warn('Не удалось включить безопасный резервный fetch',e)}

  function loadVerticalRadar(){
    if(document.getElementById('pozitronVerticalRadarScript'))return;
    const s=document.createElement('script');
    s.id='pozitronVerticalRadarScript';
    s.src='./vertical-radar-v624.js?v=vr624-20260829-1137-1';
    s.async=false;
    s.onload=()=>console.log('📡 Вертикальный радар 6.2.4 загружен');
    s.onerror=()=>console.warn('Вертикальный радар временно не загрузился');
    document.body.appendChild(s);
  }

  const statusEl=document.getElementById('status');
  if(statusEl){new MutationObserver(()=>cleanStatus()).observe(statusEl,{childList:true,subtree:true,characterData:true});cleanStatus()}
  loadVerticalRadar();check();setInterval(check,CHECK_MS);
  window.addEventListener('focus',()=>{cleanStatus();loadVerticalRadar();check()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){cleanStatus();loadVerticalRadar();check()}});
})();
