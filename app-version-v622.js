'use strict';
(() => {
  const VERSION_URL='./version-v622.json',KEY='pozitron_keno_v622_client_build',CHECK_MS=30000;
  let reloading=false;
  async function getVersion(){const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`version HTTP ${r.status}`);return r.json()}
  async function check(){if(reloading)return;try{const fresh=await getVersion(),next=String(fresh?.build||'').trim();if(!next)return;const current=localStorage.getItem(KEY);if(!current){localStorage.setItem(KEY,next);return}if(current!==next){reloading=true;localStorage.setItem(KEY,next);const u=new URL(location.href);u.searchParams.set('_v',next);u.searchParams.set('_t',Date.now());location.replace(u.toString())}}catch(e){console.warn('Проверка версии временно недоступна',e)}}
  function loadVerticalRadar(){if(document.getElementById('pozitronVerticalRadarScript'))return;const s=document.createElement('script');s.id='pozitronVerticalRadarScript';s.src='./vertical-radar-v624.js?v=vr-server-m5m-20260829-2205-1';s.async=false;document.body.appendChild(s)}
  loadVerticalRadar();check();setInterval(check,CHECK_MS);window.addEventListener('focus',()=>{loadVerticalRadar();check()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadVerticalRadar();check()}});
})();
