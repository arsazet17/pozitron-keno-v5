'use strict';
/* ПОЗИТРОН КЕНО — FINGERPRINT CLEAN */
(() => {
  const VERSION='3.0.0';
  const META={1:{button:'🎯'},2:{button:'⏳−1'},3:{button:'⏳−2'}};
  const FILES={1:'./fingerprint-archive-next-v622.json',2:'./fingerprint-archive-minus1-v622.json',3:'./fingerprint-archive-minus2-v622.json'};
  const CACHE_KEYS={1:'pozitron_v622_fingerprint_server_h1',2:'pozitron_v622_fingerprint_server_h2',3:'pozitron_v622_fingerprint_server_h3'};
  const KENO_PAYOUTS=Object.freeze({
    10:Object.freeze({10:10000000,9:1000000,8:50000,7:5000,6:750,5:250,4:100,0:200}),
    9:Object.freeze({9:4000000,8:210000,7:10000,6:1000,5:300,4:150,0:150}),
    8:Object.freeze({8:1500000,7:53300,6:2500,5:500,4:200,0:150}),
    7:Object.freeze({7:250000,6:10000,5:1200,4:200,3:100,0:150}),
    6:Object.freeze({6:75000,5:4180,4:750,3:200}),
    5:Object.freeze({5:20000,4:1920,3:400}),
    4:Object.freeze({4:3300,3:300,2:100}),
    3:Object.freeze({3:1500,2:300}),
    2:Object.freeze({2:300,1:100}),
    1:Object.freeze({1:280})
  });

  const state={
    horizon:1,
    archive:false,
    mode:'logic',
    archiveViews:{},
    forecastViews:{},
    data:{1:null,2:null,3:null},
    syncing:false,
    lastSync:0,
    error:''
  };

  const $=id=>document.getElementById(id);
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const pad=v=>String(Number(v)).padStart(2,'0');
  const rubles=a=>`${Number(a||0).toLocaleString('ru-RU')} ₽`;
  const payoutFor=(s,g)=>Number(KENO_PAYOUTS[num(s)]?.[num(g)]||0);

  function recordComboPayout(record,isAnti){
    const actual=record?.actual;
    if(!actual?.balls?.length)return 0;
    const block=isAnti?record.antilogic:record.logic;
    return (block?.combos||[]).reduce(
      (sum,c)=>sum+payoutFor(c.size,hitSet(c.numbers,actual).size),0
    );
  }

  function readCache(h){
    try{
      const p=JSON.parse(localStorage.getItem(CACHE_KEYS[h])||'null');
      return p&&Array.isArray(p.records)?p:null
    }catch{return null}
  }

  function writeCache(h,p){
    try{localStorage.setItem(CACHE_KEYS[h],JSON.stringify(p))}catch{}
  }

  function normalizeRecord(r,h){
    if(!r||!Number.isFinite(Number(r.targetDraw)))return null;
    const balls=Array.isArray(r?.actual?.balls)?r.actual.balls.map(Number).slice(0,20):[];
    const pool=Array.isArray(r?.logic?.pool20)?r.logic.pool20.map(Number):(Array.isArray(r.pool20)?r.pool20.map(Number):[]);
    const logicCombos=Array.isArray(r?.logic?.combos)?r.logic.combos:(Array.isArray(r.combos)?r.combos:[]);
    return{
      ...r,
      id:String(r.id||`fp:${h}:${r.targetDraw}`),
      horizon:num(r.horizon,h),
      sourceDraw:num(r.sourceDraw),
      targetDraw:num(r.targetDraw),
      logic:{
        ...(r.logic||{}),
        pool20:pool,
        combos:logicCombos,
        neighbors:Array.isArray(r?.logic?.neighbors)?r.logic.neighbors:(Array.isArray(r.neighbors)?r.neighbors:[])
      },
      antilogic:{
        ...(r.antilogic||{}),
        candidates:Array.isArray(r?.antilogic?.candidates)?r.antilogic.candidates.map(Number):[],
        combos:Array.isArray(r?.antilogic?.combos)?r.antilogic.combos:[],
        neighbors:Array.isArray(r?.antilogic?.neighbors)?r.antilogic.neighbors:[]
      },
      actual:balls.length===20?{
        targetDraw:num(r.actual.targetDraw,r.targetDraw),
        date:String(r.actual.date||''),
        time:String(r.actual.time||''),
        balls
      }:null
    }
  }

  function normalizePayload(raw,h){
    return{
      ...raw,
      horizon:h,
      records:(Array.isArray(raw?.records)?raw.records:[])
        .map(r=>normalizeRecord(r,h))
        .filter(Boolean)
        .sort((a,b)=>a.targetDraw-b.targetDraw)
    }
  }

  async function fetchHorizon(h){
    const res=await fetch(`${FILES[h]}?t=${Date.now()}`,{
      cache:'no-store',
      headers:{'cache-control':'no-cache, no-store, must-revalidate',pragma:'no-cache'}
    });
    if(!res.ok)throw new Error(`${META[h].button}: HTTP ${res.status}`);
    const p=normalizePayload(await res.json(),h);
    state.data[h]=p;
    writeCache(h,p);
    return p
  }

  function captureOpenRecords(){
    return new Set(
      [...document.querySelectorAll('#fingerprintResult details[data-fp-id][open]')]
        .map(x=>x.dataset.fpId)
    )
  }

  function restoreOpenRecords(ids){
    if(!ids?.size)return;
    document.querySelectorAll('#fingerprintResult details[data-fp-id]').forEach(x=>{
      if(ids.has(x.dataset.fpId))x.open=true
    })
  }

  async function sync(force=false){
    if(state.syncing||(!force&&Date.now()-state.lastSync<30000))return;
    state.syncing=true;
    const open=captureOpenRecords();
    try{
      const rs=await Promise.allSettled([1,2,3].map(fetchHorizon));
      state.lastSync=Date.now();
      state.error=rs
        .filter(x=>x.status==='rejected')
        .map(x=>x.reason?.message||'ошибка')
        .join(' · ');
      if(!$('fingerprintPanel')?.hidden)render(open)
    }finally{
      state.syncing=false
    }
  }

  const hitSet=(numbers,actual)=>{
    const a=new Set((actual?.balls||[]).map(Number));
    return new Set((numbers||[]).map(Number).filter(n=>a.has(n)))
  };

  const chips=(numbers,hits,anti=false)=>(numbers||[]).map(n=>
    `<span class="fp-num ${anti?'anti':''} ${hits?.has(Number(n))?'hit':''}">${pad(n)}${hits?.has(Number(n))?' ✓':''}</span>`
  ).join('');

  function comboHtml(combo,actual,anti=false){
    const sortedNumbers=[...(combo.numbers||[])].map(Number).sort((a,b)=>a-b);
    const hits=actual?hitSet(sortedNumbers,actual):null;
    const hitCount=hits?hits.size:0;
    const payout=actual?payoutFor(combo.size,hitCount):0;
    return`<div class="fp-combo ${anti?'fp-anti-combo':''} ${payout>0?'fp-combo-win':''}">
      <div class="fp-combo-head"><b>${combo.id}</b><span>${actual?`${hitCount}/${combo.size}`:''}</span></div>
      <div class="fp-numbers">${chips(sortedNumbers,hits,anti)}</div>
      ${payout>0?`<div class="fp-prize">🔥 ${rubles(payout)}</div>`:''}
    </div>`
  }

  function forecastKey(record,isAnti){
    return `${record.id}:${isAnti?'anti':'logic'}`
  }

  function forecastMode(record,isAnti){
    return state.forecastViews[forecastKey(record,isAnti)]||'original'
  }

  function forecastButton(record,isAnti,mode){
    return`<button type="button" class="fp-forecast-asc-btn ${mode==='asc'?'active':''}" data-fp-forecast-key="${forecastKey(record,isAnti)}">Воз</button>`
  }

  function forecastCells(numbers,isAnti,mode){
    const original=[...(numbers||[])].map(Number);
    const ascending=[...original].sort((a,b)=>a-b);
    const shown=mode==='asc'?ascending:original;
    const showStable=mode==='returned';
    return shown.map((n,i)=>{
      const stable=showStable&&original[i]===ascending[i];
      return`<span class="fp-num fp-forecast-num ${isAnti?'anti':''} ${stable?'fp-stable-pos':''}">${pad(n)}</span>`
    }).join('')
  }

  function archiveView(record){
    return state.archiveViews[record.id]||'fall'
  }

  function archiveButtons(record,actual,mode){
    const disabled=!Array.isArray(actual?.balls)||actual.balls.length!==20;
    return`<div class="fp-view-modes">
      <button class="fp-view-btn ${mode==='fall'?'active':''}" data-fp-record="${record.id}" data-fp-view="fall" ${disabled?'disabled':''}>Вып</button>
      <button class="fp-view-btn ${mode==='asc'?'active':''}" data-fp-record="${record.id}" data-fp-view="asc" ${disabled?'disabled':''}>Возр</button>
      <button class="fp-view-btn ${mode==='both'?'active':''}" data-fp-record="${record.id}" data-fp-view="both" ${disabled?'disabled':''}>Вм</button>
    </div>`
  }

  function archiveOverlay(record,block,isAnti,mode){
    const actual=record.actual;
    if(!actual?.balls?.length)return'';

    const predicted=new Set((isAnti?block.candidates:block.pool20||[]).map(Number));
    const falling=actual.balls.map(Number);
    const ascending=[...falling].sort((a,b)=>a-b);

    if(mode==='both'){
      return falling.map((fallNum,i)=>{
        const ascNum=ascending[i];
        const hitFall=predicted.has(fallNum);
        const hitAsc=predicted.has(ascNum);
        return`<span class="fp-num fp-archive-num fp-vm-split ${isAnti?'anti':''}">
          <span class="fp-vm-half fp-vm-left ${hitFall?'hit-half':''}">
            <b>${pad(fallNum)}</b>${hitFall?'<i>✓</i>':''}
          </span>
          <span class="fp-vm-half fp-vm-right ${hitAsc?'hit-half':''}">
            <b>${pad(ascNum)}</b>${hitAsc?'<i>✓</i>':''}
          </span>
        </span>`
      }).join('')
    }

    const ordered=mode==='asc'?ascending:falling;
    return ordered.map(n=>{
      const hit=predicted.has(n);
      return`<span class="fp-num fp-archive-num ${isAnti?'anti':''} ${hit?'hit':''}">
        <b>${pad(n)}${hit?' ✓':''}</b>
      </span>`
    }).join('')
  }

  function sectionHtml(record){
    const actual=record.actual;
    const isAnti=state.mode==='antilogic';
    const block=isAnti?record.antilogic:record.logic;
    const numbers=(isAnti?block.candidates:block.pool20)||[];
    const hits=actual?hitSet(numbers,actual):null;
    const hitCount=hits?hits.size:0;
    const poolPayout=actual?payoutFor(hitCount,hitCount):0;
    const listTitle=isAnti?'Кандидаты вне POOL-20':'POOL-20';

    const groups=[3,4,5].map(size=>
      `<div class="fp-label">К${size}</div>`+
      (block.combos||[])
        .filter(c=>num(c.size)===size)
        .map(c=>comboHtml(c,actual,isAnti))
        .join('')
    ).join('');

    const neighbors=block.neighbors||[];
    const totalPayout=(block.combos||[]).reduce(
      (sum,c)=>sum+(actual?payoutFor(c.size,hitSet(c.numbers,actual).size):0),0
    );

    let main;
    if(actual){
      const mode=archiveView(record);
      main=`<div class="fp-label">Архив тиража · наложение ${listTitle}</div>
        ${archiveButtons(record,actual,mode)}
        <div class="fp-numbers fp-main-pool fp-archive-overlay">${archiveOverlay(record,block,isAnti,mode)}</div>`;
    }else{
      const mode=forecastMode(record,isAnti);
      main=`<div class="fp-label fp-forecast-label"><span>${listTitle}</span>${forecastButton(record,isAnti,mode)}</div>
        <div class="fp-numbers fp-main-pool fp-forecast-pool">${forecastCells(numbers,isAnti,mode)}</div>`;
    }

    return`<div class="fp-section ${isAnti?'anti-section':'logic-section'}">
      <div class="fp-mode-title">${isAnti?'⚡ ANTILOGIC · вне POOL-20':'🟢 LOGIC · из POOL-20'}</div>
      <div class="fp-target">Комбинации на тираж №${record.targetDraw}</div>
      ${main}
      ${actual&&poolPayout>0?`<div class="fp-pool-prize ${isAnti?'anti-pool-prize':''}">👀👀 ${rubles(poolPayout)}</div>`:''}
      ${groups}
      ${actual&&totalPayout>0?`<div class="fp-total ${isAnti?'anti-total':''}">Суммарная выплата: ${rubles(totalPayout)}</div>`:''}
      <details class="fp-nei">
        <summary>${isAnti?'5 аналогов второго кольца':'5 ближайших исторических аналогов'}</summary>
        ${neighbors.map((x,i)=>`<div>${i+1}. №${x.targetDraw} · дистанция ${num(x.distance).toFixed(4)}</div>`).join('')}
      </details>
    </div>`
  }

  function forecastHtml(record,expanded){
    const actual=record.actual;
    const isAnti=state.mode==='antilogic';
    const modeNumbers=isAnti
      ?(record.antilogic?.candidates||[])
      :(record.logic?.pool20||[]);
    const modeHits=actual?hitSet(modeNumbers,actual):null;
    const modeCount=modeHits?modeHits.size:0;
    const modeLabel=isAnti?'ANTILOGIC':'LOGIC';
    const summaryPayout=actual?recordComboPayout(record,isAnti):0;

    const body=`<div class="fp-head">
      <b>${META[record.horizon]?.button||'🎯'} тираж №${record.targetDraw}</b>
      <span>${actual?`${modeLabel} ${modeCount}/20`:'ожидает результата'}</span>
    </div>
    <div class="fp-note">Зафиксировано после №${record.sourceDraw}. Прогноз после сохранения не меняется.</div>
    ${sectionHtml(record)}`;

    if(expanded)return`<div class="fp-record">${body}</div>`;
    return`<details class="fp-record" data-fp-id="${record.id}">
      <summary>
        <b>${META[record.horizon]?.button} №${record.targetDraw}</b>
        <span class="fp-summary-prize">${actual&&summaryPayout>0?`🔥 ${rubles(summaryPayout)}`:''}</span>
        <span class="fp-summary-score">${actual?`${modeLabel} ${modeCount}/20`:'⏳'}</span>
      </summary>
      ${body}
    </details>`
  }

  function bindForecastButtons(box){
    box.querySelectorAll('[data-fp-forecast-key]').forEach(btn=>{
      btn.onclick=()=>{
        const key=btn.dataset.fpForecastKey;
        const current=state.forecastViews[key]||'original';
        state.forecastViews[key]=current==='asc'?'returned':'asc';
        render(captureOpenRecords())
      }
    })
  }

  function bindArchiveButtons(box){
    box.querySelectorAll('[data-fp-view][data-fp-record]').forEach(btn=>{
      btn.onclick=()=>{
        state.archiveViews[btn.dataset.fpRecord]=btn.dataset.fpView;
        render(captureOpenRecords())
      }
    })
  }

  function bindDynamic(box){
    bindForecastButtons(box);
    bindArchiveButtons(box)
  }

  function render(openIds=captureOpenRecords()){
    const box=$('fingerprintResult');
    if(!box)return;

    document.querySelectorAll('[data-fp-h]').forEach(b=>
      b.classList.toggle('active',!state.archive&&num(b.dataset.fpH)===state.horizon)
    );
    $('fingerprintArchiveBtn')?.classList.toggle('active',state.archive);
    document.querySelectorAll('[data-fp-mode]').forEach(b=>
      b.classList.toggle('active',b.dataset.fpMode===state.mode)
    );

    const payload=state.data[state.horizon]||readCache(state.horizon);
    if(!payload){
      box.innerHTML=`<div class="fp-msg">${state.error?`Проверка архива сервера недоступна: ${state.error}`:'Загружаю общий серверный архив FINGERPRINT…'}</div>`;
      return
    }

    const records=payload.records||[];

    if(state.archive){
      box.innerHTML=`<div class="fp-archive-head">📚 Общий архив FINGERPRINT ${META[state.horizon].button}</div>
        <div class="fp-note">LOGIC и ANTILOGIC хранятся раздельно внутри одной записи тиража.</div>
        ${records.length?records.slice().reverse().map(r=>forecastHtml(r,false)).join(''):'<div class="fp-msg">Серверный архив пока пуст.</div>'}`;
      restoreOpenRecords(openIds);
      bindDynamic(box);
      return
    }

    const latest=records.slice().reverse().find(r=>!r.actual)||records.at(-1);
    box.innerHTML=latest?forecastHtml(latest,true):'<div class="fp-msg">Сервер ещё не сформировал первый прогноз.</div>';
    bindDynamic(box)
  }

  function styles(){
    if($('fingerprintStyles'))return;
    const s=document.createElement('style');
    s.id='fingerprintStyles';
    s.textContent=`
#fingerprintMainBtn{font-weight:900}
#fingerprintMainBtn.active,.fp-tab.active,.fp-mode-btn.active{border-color:#72df95;background:#153a2a}
#fingerprintPanel[hidden]{display:none!important}
#fingerprintPanel{margin-top:8px}
.fp-title{display:flex;justify-content:space-between;gap:8px}
.fp-title b{font-size:20px}
.fp-warning{font-size:12px;color:#ffe6a0;background:#302812;border:1px solid #6e5b20;border-radius:9px;padding:8px;margin:9px 0}
.fp-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
.fp-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}
.fp-tab,.fp-mode-btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:8px 3px;font-weight:900}
.fp-mode-btn[data-fp-mode="antilogic"].active{border-color:#f0a63b;background:#332812;color:#ffd37b}
.fp-record{border:1px solid #2a4464;border-radius:12px;background:#0b1727;margin:8px 0;padding:8px}
.fp-record>summary,.fp-head,.fp-combo-head{display:flex;justify-content:space-between;gap:8px}
.fp-head span,.fp-record>summary span{color:#8eedaa;font-weight:900}
.fp-record>summary{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px}
.fp-summary-prize{justify-self:center;color:#ffad42!important;font-weight:950!important;white-space:nowrap}
.fp-summary-score{justify-self:end;white-space:nowrap}
.fp-target{margin:6px 0 9px;padding:7px;border:1px solid #355a3d;border-radius:8px;font-weight:950;color:#8eedaa}
.anti-section .fp-target{border-color:#7b5d1c;color:#ffd37b}
.fp-mode-title{font-size:17px;font-weight:950;margin-top:8px}
.anti-section .fp-mode-title{color:#ffbd3f}
.fp-label{font-weight:950;margin:11px 0 5px}
.fp-forecast-label{display:flex;align-items:center;justify-content:space-between;gap:8px}
.fp-forecast-asc-btn{border:1px solid #304b6d;background:#172a43;color:var(--text);border-radius:8px;padding:6px 14px;font-weight:950}
.fp-forecast-asc-btn.active{background:#254b78;border-color:#5b8fc9}
.anti-section .fp-forecast-asc-btn.active{background:#332812;border-color:#f0a63b;color:#ffd37b}
.fp-forecast-num.fp-stable-pos{box-shadow:inset 0 0 0 2px #4ade80;border-color:#4ade80}
.anti-section .fp-forecast-num.fp-stable-pos{box-shadow:inset 0 0 0 2px #f0a63b;border-color:#f0a63b}
.fp-combo{background:#101f33;border:1px solid #263e5b;border-radius:10px;padding:8px;margin-top:6px}
.fp-anti-combo{border-color:#5e491c;background:#201c12}
.fp-combo.fp-combo-win{border-color:#f0a63b;box-shadow:inset 0 0 0 1px #f0a63b}
.fp-prize{margin-top:7px;color:#ffad42;font-size:17px;font-weight:950}
.fp-pool-prize{margin-top:10px;text-align:center;color:#8eedaa;font-size:20px;font-weight:950}
.fp-pool-prize.anti-pool-prize{color:#ffbd3f}
.fp-total{margin-top:10px;color:#8eedaa;font-size:17px;font-weight:950}
.fp-total.anti-total{color:#ffbd3f}
.fp-combo-head span,.fp-note,.fp-nei{font-size:11px;color:var(--muted)}
.fp-numbers{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.fp-main-pool{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:5px!important;width:100%}
.fp-main-pool .fp-num{width:100%;min-width:0}
.fp-archive-num{display:flex!important;min-height:58px;height:58px;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.fp-vm-split{display:grid!important;grid-template-columns:1fr 1fr!important;min-height:58px!important;height:58px!important;padding:0!important;overflow:hidden;align-items:stretch!important}
.fp-vm-half{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:7px;min-width:0;font-weight:900;line-height:1;position:relative}
.fp-vm-half b{font-size:inherit;line-height:1}
.fp-vm-left{border-right:1px solid #304b6d}
.fp-vm-half.hit-half{background:#123a28;color:#c9ffda}
.fp-vm-half i{font-style:normal;font-size:12px;line-height:1;margin-top:5px;color:#c9ffda}
.fp-vm-right{color:var(--muted)}
.anti-section .fp-vm-left{border-right-color:#6d541c}
.anti-section .fp-vm-right{color:#ffd37b}
.fp-view-btn:disabled{opacity:.42}
.fp-view-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:6px 0}
.fp-view-btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:8px;padding:7px 3px;font-weight:900}
.fp-view-btn.active{background:#254b78;border-color:#5b8fc9}
.anti-section .fp-view-btn.active{border-color:#f0a63b;background:#332812;color:#ffd37b}
.fp-num{min-width:38px;text-align:center;padding:7px 6px;border:1px solid #304b6d;border-radius:8px;background:#172a43;font-family:ui-monospace,Consolas,monospace;font-weight:900}
.fp-num.anti{border-color:#6d541c;background:#2a2213;color:#ffd37b}
.fp-num.hit{border-color:#43d77b;background:#123a28;color:#c9ffda}
.fp-nei{margin-top:10px;border-top:1px solid #263e5b;padding-top:8px}
.fp-msg{background:#101f33;border:1px solid #263e5b;border-radius:9px;padding:10px;color:var(--muted);font-size:12px}
.fp-archive-head{font-size:16px;font-weight:950;margin:8px 2px}
@media(max-width:390px){.fp-tab,.fp-mode-btn{font-size:11px}}
`;
    document.head.appendChild(s)
  }

  function createPanel(tools){
    const p=document.createElement('section');
    p.id='fingerprintPanel';
    p.className='card';
    p.hidden=true;
    p.innerHTML=`<div class="fp-title">
      <div><b>🧭 FINGERPRINT</b><div class="small">Манхэттен · общий серверный архив</div></div>
      <span>v${VERSION}</span>
    </div>
    <div class="fp-warning">Экспериментальный статистический алгоритм. Прогнозы фиксируются сервером до целевого тиража и не гарантируют выпадение.</div>
    <div class="fp-tabs">
      <button class="fp-tab active" data-fp-h="1">🎯</button>
      <button class="fp-tab" data-fp-h="2">⏳−1</button>
      <button class="fp-tab" data-fp-h="3">⏳−2</button>
      <button class="fp-tab" id="fingerprintArchiveBtn">📚 Архив</button>
    </div>
    <div class="fp-modes">
      <button class="fp-mode-btn active" data-fp-mode="logic">🟢 LOGIC</button>
      <button class="fp-mode-btn" data-fp-mode="antilogic">⚡ ANTILOGIC</button>
    </div>
    <div id="fingerprintResult"><div class="fp-msg">Загружаю общий серверный архив FINGERPRINT…</div></div>`;

    tools.insertAdjacentElement('afterend',p);

    p.querySelectorAll('[data-fp-h]').forEach(b=>b.onclick=()=>{
      state.horizon=num(b.dataset.fpH,1);
      state.archive=false;
      render();
      sync(true)
    });

    p.querySelectorAll('[data-fp-mode]').forEach(b=>b.onclick=()=>{
      state.mode=b.dataset.fpMode;
      render()
    });

    $('fingerprintArchiveBtn').onclick=()=>{
      state.archive=!state.archive;
      render()
    };

    return p
  }

  function buildLayout(){
    if($('fingerprintMainBtn')&&$('fingerprintPanel'))return true;

    const search=document.querySelector('button[data-panel="searchPanel"]');
    const tools=search?.parentElement;
    if(!search||!tools)return false;

    let btn=$('fingerprintMainBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='fingerprintMainBtn';
      btn.className='tool';
      btn.type='button';
      btn.textContent='🧭 FINGERPRINT';
      btn.setAttribute('aria-expanded','false');
      tools.appendChild(btn)
    }

    let p=$('fingerprintPanel');
    if(!p)p=createPanel(tools);

    btn.onclick=()=>{
      const open=p.hidden;
      p.hidden=!open;
      btn.classList.toggle('active',open);
      btn.setAttribute('aria-expanded',String(open));

      if(open){
        $('archivePanel')?.classList.remove('show');
        state.archive=false;
        render();
        sync(true);
        p.scrollIntoView({behavior:'smooth',block:'start'})
      }
    };

    return true
  }

  function start(){
    styles();
    [1,2,3].forEach(h=>state.data[h]=readCache(h));

    let ready=false;
    const tryBuild=()=>{
      if(ready)return;
      if(buildLayout()){
        ready=true;
        sync(true);
        setInterval(()=>sync(false),30000)
      }
    };

    tryBuild();

    const timer=setInterval(()=>{
      tryBuild();
      if(ready)clearInterval(timer)
    },250);

    const mo=new MutationObserver(()=>{
      tryBuild();
      if(ready)mo.disconnect()
    });

    mo.observe(document.body,{childList:true,subtree:true})
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true})
  }else{
    start()
  }
})();
