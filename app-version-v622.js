'use strict';
(() => {
  const VERSION_URL='./version-v622.json';
  const KEY='pozitron_keno_v622_client_build';
  const CHECK_MS=30000;
  const RAW_HISTORY='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';
  let reloading=false;
  let liveRawPromise=null;

  async function getVersion(){
    const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`version HTTP ${r.status}`);
    return r.json();
  }

  function applyVersion(fresh){
    const version=String(fresh?.version||fresh?.app?.match(/\d+\.\d+\.\d+/)?.[0]||'').trim();
    if(!version)return;
    window.POZITRON_APP_VERSION=version;
    window.dispatchEvent(new CustomEvent('pozitron:version',{detail:{version,build:String(fresh?.build||'')}}));
  }

  async function check(){
    if(reloading)return;
    try{
      const fresh=await getVersion();
      applyVersion(fresh);
      const next=String(fresh?.build||fresh?.version||'').trim();
      if(!next)return;
      const current=localStorage.getItem(KEY);
      if(!current){
        localStorage.setItem(KEY,next);
        return;
      }
      if(current!==next){
        reloading=true;
        localStorage.setItem(KEY,next);
        const u=new URL(location.href);
        u.searchParams.set('_v',next);
        u.searchParams.set('_t',Date.now());
        location.replace(u.toString());
      }
    }catch(e){
      console.warn('Проверка версии временно недоступна',e);
    }
  }

  function loadVerticalRadar(){
    if(document.getElementById('pozitronVerticalRadarScript'))return;
    const s=document.createElement('script');
    s.id='pozitronVerticalRadarScript';
    const build=localStorage.getItem(KEY)||String(Date.now());
    s.src=`./vertical-radar-v624.js?v=${encodeURIComponent(build)}`;
    s.async=false;
    document.body.appendChild(s);
  }

  function normalizeLiveRows(payload){
    const source=Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.draws)
        ? payload.draws
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

    const rows=[];
    for(const o of source){
      if(!o||typeof o!=='object')continue;
      const draw=Number(o.draw??o.number??o.drawNumber);
      let balls=o.balls??o.numbers??o.results??o.result??o.winningNumbers;
      if(typeof balls==='string')balls=(balls.match(/\d+/g)||[]).map(Number);
      balls=(balls||[]).map(Number).slice(0,20);
      if(!Number.isFinite(draw)||balls.length!==20||new Set(balls).size!==20||!balls.every(n=>Number.isInteger(n)&&n>=1&&n<=80))continue;

      const row={
        draw,
        date:String(o.date??o.drawDate??'').trim(),
        time:String(o.time??o.drawTime??'').trim(),
        balls
      };

      const officialColumn=Number(o.column??o.winnerColumn??o.columnNumber);
      if(Number.isInteger(officialColumn)&&officialColumn>=1&&officialColumn<=10)row.column=officialColumn;
      if(o.parity!=null)row.parity=o.parity;
      if(o.timeFull!=null)row.timeFull=o.timeFull;
      rows.push(row);
    }

    const byDraw=new Map();
    for(const row of rows)byDraw.set(row.draw,row);
    return [...byDraw.values()].sort((a,b)=>a.draw-b.draw);
  }

  async function fetchRawHistory(){
    const url=new URL(RAW_HISTORY);
    url.searchParams.set('ts',String(Date.now()));
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch(url.href,{
        method:'GET',
        cache:'no-store',
        mode:'cors',
        credentials:'omit',
        signal:controller.signal,
        headers:{'cache-control':'no-cache, no-store, must-revalidate',pragma:'no-cache'}
      });
      if(!r.ok)throw new Error(`GitHub RAW HTTP ${r.status}`);
      const payload=await r.json();
      const rows=normalizeLiveRows(payload);
      if(!rows.length)throw new Error('GitHub RAW: нет корректных тиражей');
      return rows;
    }finally{
      clearTimeout(timeout);
    }
  }

  async function rawUpdate(){
    if(liveRawPromise)return liveRawPromise;

    liveRawPromise=(async()=>{
      const status=document.getElementById('status');
      if(status)status.textContent='GitHub RAW · проверяю свежий тираж…';

      const rows=await fetchRawHistory();
      const remoteLatest=Number(rows.at(-1)?.draw||0);
      const localLatest=Number((typeof draws!=='undefined'&&draws.at(-1)?.draw)||0);

      if(remoteLatest<localLatest){
        if(status)status.textContent=`GitHub RAW · сервер №${remoteLatest} · локально №${localLatest}`;
        return 0;
      }

      const added=typeof merge==='function' ? merge(rows) : 0;
      if(typeof render==='function')render();

      const latest=Number((typeof draws!=='undefined'&&draws.at(-1)?.draw)||remoteLatest);
      if(status)status.textContent=`GitHub RAW LIVE · добавлено ${added} · всего ${typeof draws!=='undefined'?draws.length:rows.length} · последний №${latest}`;
      return added;
    })().catch(e=>{
      console.warn('GitHub RAW live update:',e);
      const status=document.getElementById('status');
      if(typeof render==='function')render();
      if(status)status.textContent='GitHub RAW временно недоступен · повторю автоматически';
      return 0;
    });

    try{
      return await liveRawPromise;
    }finally{
      liveRawPromise=null;
    }
  }

  function installRawUpdater(){
    if(typeof update!=='function'||typeof auto!=='function')return false;

    const legacyUpdate=update;

    try{
      window.removeEventListener('focus',legacyUpdate);
    }catch{}

    if(typeof timer!=='undefined'&&timer){
      clearInterval(timer);
      timer=null;
    }

    update=rawUpdate;
    auto=function(){
      if(typeof timer!=='undefined'&&timer)clearInterval(timer);
      if(typeof timer!=='undefined')timer=null;
      const ms=Number(localStorage.getItem('pozitron_v5_interval')||60000);
      if(ms&&typeof timer!=='undefined')timer=setInterval(rawUpdate,ms);
    };

    const sync=document.getElementById('sync');
    const sync2=document.getElementById('sync2');
    if(sync)sync.onclick=rawUpdate;
    if(sync2)sync2.onclick=rawUpdate;

    const source=document.getElementById('sourceUrl');
    if(source){
      source.value=RAW_HISTORY;
      source.disabled=true;
      const label=source.previousElementSibling;
      if(label&&label.classList.contains('small'))label.textContent='Источник: GitHub RAW main · автоматически';
    }

    const saveBtn=document.getElementById('saveSettings');
    if(saveBtn){
      saveBtn.onclick=()=>{
        const interval=document.getElementById('interval');
        if(interval)localStorage.setItem('pozitron_v5_interval',interval.value);
        auto();
        rawUpdate();
      };
    }

    auto();
    rawUpdate();
    setTimeout(rawUpdate,8500);
    window.addEventListener('focus',rawUpdate);
    window.addEventListener('online',rawUpdate);
    return true;
  }

  loadVerticalRadar();
  installRawUpdater();
  check();
  setInterval(check,CHECK_MS);

  window.addEventListener('focus',()=>{
    loadVerticalRadar();
    check();
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      loadVerticalRadar();
      check();
      rawUpdate();
    }
  });

  window.POZITRON_RAW_LIVE={
    source:RAW_HISTORY,
    refresh:rawUpdate,
    mode:'M4-style direct GitHub RAW'
  };
})();
