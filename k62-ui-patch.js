(() => {
  'use strict';

  const SCHEDULE=[
    '00:02','00:17','00:32','01:02','01:17','01:32','02:02','02:17','02:32',
    '03:02','03:32','04:02','04:17','04:32','05:02','05:17','05:32','06:02',
    '06:17','06:32','07:02','07:32','08:02','08:17','08:32','09:02','09:17',
    '09:32','10:02','10:17','10:32','11:02','11:32','12:02','12:17','12:32',
    '13:02','13:17','13:32','14:02','14:17','14:32','15:02','15:32','16:02',
    '16:17','16:32','17:02','17:17','17:32','18:02','18:17','18:32','19:02',
    '19:32','20:02','20:17','20:32','21:02','21:17','21:32','22:02','22:17',
    '22:32','23:02','23:32'
  ];

  const FP_KEYS=[
    'pozitron_v622_fingerprint_server_h1',
    'pozitron_v622_fingerprint_server_h2',
    'pozitron_v622_fingerprint_server_h3'
  ];

  const REMOTE_FILES=[
    './keno-history-v62.json',
    './fingerprint-archive-next-v622.json',
    './fingerprint-archive-minus1-v622.json',
    './fingerprint-archive-minus2-v622.json'
  ];

  let bestRemote=null;
  let highestConfirmed=0;
  let highestShownNext=0;
  let refreshing=false;

  function compactLabels(){
    document.querySelectorAll('button').forEach(b=>{
      const t=b.textContent.trim().toLowerCase();
      if(t==='выпадение') b.textContent='Вып';
      else if(t==='возрастание') b.textContent='Возр';
      else if(t==='вместе') b.textContent='Вм';
    });
  }

  function normTime(v){
    const m=String(v||'').match(/\d{1,2}:\d{2}/);
    return m ? m[0].padStart(5,'0') : '';
  }

  function better(a,b){
    if(!a) return b;
    if(!b) return a;
    return Number(b.draw)>Number(a.draw) ? b : a;
  }

  function pickDraw(draw,time,balls,source){
    draw=Number(draw);
    time=normTime(time);
    if(!Number.isFinite(draw) || !time) return null;
    if(Array.isArray(balls) && balls.length!==20) return null;
    return {draw,time,source};
  }

  function latestFromMainBase(){
    try{
      const arr=JSON.parse(localStorage.getItem('pozitron_v5_draws')||'[]');
      if(!Array.isArray(arr)) return null;
      let best=null;
      for(const d of arr){
        best=better(best,pickDraw(d?.draw,d?.time,d?.balls,'main-local'));
      }
      return best;
    }catch{return null}
  }

  function latestFromFingerprintCache(){
    let best=null;
    for(const key of FP_KEYS){
      try{
        const payload=JSON.parse(localStorage.getItem(key)||'null');
        const records=Array.isArray(payload?.records)?payload.records:[];
        for(const r of records){
          const a=r?.actual;
          if(!a) continue;
          best=better(best,pickDraw(a?.targetDraw??r?.targetDraw,a?.time,a?.balls,'fp-local'));
        }
      }catch{}
    }
    return best;
  }

  function latestFromScreen(){
    const card=document.querySelector('#cards .card');
    if(!card) return null;
    const dm=(card.querySelector('.draw')?.textContent||'').match(/\d+/);
    const time=normTime(card.querySelector('.time')?.textContent||'');
    return dm&&time ? {draw:Number(dm[0]),time,source:'screen'} : null;
  }

  function parseRemoteMain(data){
    const arr=Array.isArray(data)?data:(Array.isArray(data?.draws)?data.draws:[]);
    let best=null;
    for(const d of arr){
      best=better(best,pickDraw(
        d?.draw??d?.number??d?.drawNumber,
        d?.time??d?.drawTime,
        d?.balls??d?.numbers,
        'main-remote'
      ));
    }
    return best;
  }

  function parseRemoteFingerprint(data){
    const records=Array.isArray(data?.records)?data.records:[];
    let best=null;
    for(const r of records){
      const a=r?.actual;
      if(!a) continue;
      best=better(best,pickDraw(
        a?.targetDraw??r?.targetDraw,
        a?.time,
        a?.balls,
        'fp-remote'
      ));
    }
    return best;
  }

  async function refreshRemote(){
    if(refreshing) return;
    refreshing=true;
    try{
      const rs=await Promise.allSettled(
        REMOTE_FILES.map(f=>fetch(`${f}?t=${Date.now()}`,{cache:'no-store'}).then(r=>{
          if(!r.ok) throw new Error(String(r.status));
          return r.json();
        }))
      );

      let best=null;
      rs.forEach((r,i)=>{
        if(r.status!=='fulfilled') return;
        const cand=i===0 ? parseRemoteMain(r.value) : parseRemoteFingerprint(r.value);
        best=better(best,cand);
      });

      bestRemote=better(bestRemote,best);
    }finally{
      refreshing=false;
    }
  }

  function latestConfirmed(){
    let best=null;
    best=better(best,latestFromMainBase());
    best=better(best,latestFromFingerprintCache());
    best=better(best,latestFromScreen());
    best=better(best,bestRemote);
    return best;
  }

  function nextSlot(time){
    const i=SCHEDULE.indexOf(time);
    return i<0 ? null : SCHEDULE[(i+1)%SCHEDULE.length];
  }

  function renderNext(){
    const last=latestConfirmed();
    if(!last) return;

    if(last.draw<highestConfirmed) return;
    highestConfirmed=Math.max(highestConfirmed,last.draw);

    const nextTime=nextSlot(last.time);
    if(!nextTime) return;

    const nextDraw=last.draw+1;
    if(nextDraw<highestShownNext) return;
    highestShownNext=Math.max(highestShownNext,nextDraw);

    let el=document.getElementById('k62-next-draw');
    if(!el){
      el=document.createElement('div');
      el.id='k62-next-draw';
      el.className='k62-next-draw';
      const mode=document.querySelector('.mode');
      if(mode) mode.insertAdjacentElement('afterend',el);
      else document.getElementById('cards')?.insertAdjacentElement('beforebegin',el);
    }

    el.dataset.nextDraw=String(nextDraw);
    el.dataset.source=last.source;
    el.innerHTML=`<span>📅</span><strong>СЛЕД ТИРАЖ №${nextDraw} · ${nextTime}</strong>`;
  }

  let queued=false;
  async function run(){
    compactLabels();
    renderNext();
    await refreshRemote();
    renderNext();
  }

  const observer=new MutationObserver(()=>{
    if(queued) return;
    queued=true;
    requestAnimationFrame(async()=>{
      queued=false;
      await run();
    });
  });

  function start(){
    run();
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('focus',run);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible') run();
    });
    setInterval(run,5000);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
