'use strict';
(() => {
  const VERSION_URL='./version-v622.json',KEY='pozitron_keno_v622_client_build',CHECK_MS=30000;
  let reloading=false;
  async function getVersion(){const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`version HTTP ${r.status}`);return r.json()}
  function applyVersion(fresh){const version=String(fresh?.version||fresh?.app?.match(/\d+\.\d+\.\d+/)?.[0]||'').trim();if(!version)return;window.POZITRON_APP_VERSION=version;window.dispatchEvent(new CustomEvent('pozitron:version',{detail:{version,build:String(fresh?.build||'')}}))}
  async function check(){if(reloading)return;try{const fresh=await getVersion();applyVersion(fresh);const next=String(fresh?.build||fresh?.version||'').trim();if(!next)return;const current=localStorage.getItem(KEY);if(!current){localStorage.setItem(KEY,next);return}if(current!==next){reloading=true;localStorage.setItem(KEY,next);const u=new URL(location.href);u.searchParams.set('_v',next);u.searchParams.set('_t',Date.now());location.replace(u.toString())}}catch(e){console.warn('Проверка версии временно недоступна',e)}}
  function loadVerticalRadar(){if(document.getElementById('pozitronVerticalRadarScript'))return;const s=document.createElement('script');s.id='pozitronVerticalRadarScript';const build=localStorage.getItem(KEY)||String(Date.now());s.src=`./vertical-radar-v624.js?v=${encodeURIComponent(build)}`;s.async=false;document.body.appendChild(s)}
  loadVerticalRadar();check();setInterval(check,CHECK_MS);window.addEventListener('focus',()=>{loadVerticalRadar();check()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadVerticalRadar();check()}});
})();
