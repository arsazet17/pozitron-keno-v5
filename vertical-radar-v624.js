'use strict';

(() => {
  const ARCHIVE_KEY='pozitron_v624_vertical_radar_archive';
  const MEMORY_KEY='pozitron_v624_vertical_radar_memory';
  const STATE_KEY='pozitron_v624_vertical_radar_state';
  const VERSION='6.2.4-vr1';

  const PAYOUTS=Object.freeze({
    3:Object.freeze({3:1500,2:300}),
    4:Object.freeze({4:3300,3:300,2:100}),
    5:Object.freeze({5:20000,4:1920,3:400})
  });

  const SCHEDULE=["00:02","00:17","00:32","01:02","01:17","01:32","02:02","02:17","02:32","03:02","03:32","04:02","04:17","04:32","05:02","05:17","05:32","06:02","06:17","06:32","07:02","07:32","08:02","08:17","08:32","09:02","09:17","09:32","10:02","10:17","10:32","11:02","11:32","12:02","12:17","12:32","13:02","13:17","13:32","14:02","14:17","14:32","15:02","15:32","16:02","16:17","16:32","17:02","17:17","17:32","18:02","18:17","18:32","19:02","19:32","20:02","20:17","20:32","21:02","21:17","21:32","22:02","22:17","22:32","23:02","23:32"];

  let lastProcessedDraw=0;
  let syncing=false;

  const $=id=>document.getElementById(id);
  const pad=n=>String(Number(n)).padStart(2,'0');
  const rub=n=>`${Number(n||0).toLocaleString('ru-RU')} ₽`;

  function safeDraws(){
    try{ if(typeof draws!=='undefined'&&Array.isArray(draws))return draws; }catch{}
    try{
      const a=JSON.parse(localStorage.getItem('pozitron_v5_draws')||'[]');
      return Array.isArray(a)?a:[];
    }catch{return []}
  }

  function read(key,fallback){
    try{
      const v=JSON.parse(localStorage.getItem(key)||'null');
      return v==null?fallback:v;
    }catch{return fallback}
  }
  function write(key,v){ try{localStorage.setItem(key,JSON.stringify(v));}catch{} }
  function archive(){
    const a=read(ARCHIVE_KEY,[]);
    return Array.isArray(a)?a:[];
  }
  function saveArchive(a){write(ARCHIVE_KEY,a.slice(-1200))}
  function memory(){
    const a=read(MEMORY_KEY,[]);
    return Array.isArray(a)?a:[];
  }
  function saveMemory(a){write(MEMORY_KEY,a.slice(-2000))}

  function parseDate(v){
    const s=String(v||'').trim();
    let m=s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{2}|\d{4})$/);
    if(m){
      let y=Number(m[3]);if(y<100)y+=2000;
      return new Date(y,Number(m[2])-1,Number(m[1]));
    }
    m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    return new Date(NaN);
  }
  function showDate(v){
    if(v instanceof Date){
      if(!Number.isFinite(v.getTime()))return '';
      return `${pad(v.getDate())}.${pad(v.getMonth()+1)}.${v.getFullYear()}`;
    }
    const d=parseDate(v);if(!Number.isFinite(d.getTime()))return String(v||'');
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
  }
  function normTime(v){return String(v||'').match(/\d{1,2}:\d{2}/)?.[0]||String(v||'')}
  function nextMeta(last){
    const t=normTime(last.time).slice(0,5);
    const i=SCHEDULE.indexOf(t);
    const next=i>=0?SCHEDULE[(i+1)%SCHEDULE.length]:'—';
    const d=parseDate(last.date);
    if(i===SCHEDULE.length-1&&Number.isFinite(d.getTime()))d.setDate(d.getDate()+1);
    return {draw:Number(last.draw)+1,date:Number.isFinite(d.getTime())?showDate(d):showDate(last.date),time:next};
  }

  function consecutive(a,s,e){
    for(let i=s+1;i<=e;i++)if(Number(a[i]?.draw)!==Number(a[i-1]?.draw)+1)return false;
    return true;
  }
  function sourceV(a,srcIndex,m,n,d){
    const end=srcIndex+1-d;
    if(d<1||end<0||end>srcIndex)return null;
    const start=end-n+1;
    if(start<0||!consecutive(a,start,end))return null;
    const numbers=[],sourceDraws=[];
    for(let i=start;i<=end;i++){
      const v=Number(a[i]?.balls?.[m-1]);
      if(!(v>=1&&v<=80))return null;
      numbers.push(v);sourceDraws.push(Number(a[i].draw));
    }
    if(new Set(numbers).size!==numbers.length)return null;
    return {numbers,sourceDraws};
  }

  function fullBase(n){
    let p=1;
    for(let i=0;i<n;i++)p*=(20-i)/(80-i);
    return p;
  }

  function outcomeSeries(a,m,n,d,srcIndex){
    const out=[];
    for(let i=0;i<srcIndex;i++){
      const actual=a[i+1];
      if(!actual||Number(actual.draw)!==Number(a[i].draw)+1)continue;
      const combo=sourceV(a,i,m,n,d);
      if(!combo)continue;
      const set=new Set((actual.balls||[]).map(Number));
      const hits=combo.numbers.reduce((s,x)=>s+(set.has(x)?1:0),0);
      out.push({targetDraw:Number(actual.draw),hits,full:hits===n});
    }
    return out;
  }

  function windowStat(series,n,W){
    const z=series.slice(-W);
    if(!z.length)return {count:0,hitLift:0,fullLift:0,full:0};
    const hits=z.reduce((s,x)=>s+x.hits,0);
    const full=z.reduce((s,x)=>s+(x.full?1:0),0);
    return {
      count:z.length,
      hitLift:hits/(z.length*n*.25),
      fullLift:full/(z.length*fullBase(n)),
      full
    };
  }

  function strictStatus(stats){
    const a=stats[10].hitLift,b=stats[20].hitLift,c=stats[30].hitLift,e=stats[66].hitLift;
    if(a>=1.18&&b>=1.10&&c>=1.05&&e>=.95)return 'HOT';
    if(a>=1.12&&b>=1.05&&c>=1.00)return 'PRE-HOT';
    if((a>=1.08&&b>=1.00)||(b>=1.07&&c>=1.02))return 'WATCH';
    if(a<=.82&&b<=.92&&c<.98)return 'COLD';
    return 'OFF';
  }

  function strictScore(stats){
    const a=stats[10].hitLift,b=stats[20].hitLift,c=stats[30].hitLift,e=stats[66].hitLift;
    const persistence=Math.max(0,1-Math.abs(a-c));
    const fullBonus=Math.min(1.5,stats[66].fullLift||0);
    return .34*a+.29*b+.20*c+.10*e+.04*persistence+.03*fullBonus;
  }

  function bestLane(a,srcIndex,n){
    let best=null;
    for(let m=1;m<=20;m++){
      for(let d=1;d<=10;d++){
        const src=sourceV(a,srcIndex,m,n,d);
        if(!src)continue;
        const series=outcomeSeries(a,m,n,d,srcIndex);
        if(series.length<66)continue;
        const stats={};
        [10,20,30,66].forEach(W=>stats[W]=windowStat(series,n,W));
        const item={
          m,n,d,numbers:src.numbers,sourceDraws:src.sourceDraws,
          score:strictScore(stats),status:strictStatus(stats),stats
        };
        if(!best||item.score>best.score)best=item;
      }
    }
    return best;
  }

  function payout(n,h){return Number(PAYOUTS[n]?.[h]||0)}
  function activeStatus(s){return s==='HOT'||s==='PRE-HOT'}

  function buildPrediction(a){
    if(a.length<120)return null;
    const srcIndex=a.length-1,last=a[srcIndex],target=nextMeta(last);
    const lanes=[3,4,5].map(n=>bestLane(a,srcIndex,n)).filter(Boolean).map(x=>({
      ...x,
      score:Number(x.score.toFixed(4)),
      stats:Object.fromEntries(Object.entries(x.stats).map(([k,v])=>[k,{
        count:v.count,
        hitLift:Number(v.hitLift.toFixed(3)),
        fullLift:Number(v.fullLift.toFixed(3)),
        full:v.full
      }])),
      active:activeStatus(x.status)
    }));
    return {
      id:`vr:${target.draw}`,version:VERSION,createdAt:new Date().toISOString(),
      source:{draw:Number(last.draw),date:showDate(last.date),time:normTime(last.time)},
      target,lanes,status:'pending'
    };
  }

  function settleRecord(rec,a){
    if(rec.status==='checked')return rec;
    const actual=a.find(x=>Number(x.draw)===Number(rec.target?.draw));
    if(!actual)return rec;
    const set=new Set((actual.balls||[]).map(Number));
    const lanes=(rec.lanes||[]).map(l=>{
      const hitNumbers=(l.numbers||[]).filter(x=>set.has(Number(x)));
      const hitCount=hitNumbers.length;
      return {...l,outcome:{
        hitNumbers,hitCount,
        result:hitCount===Number(l.n)?'full':hitCount>0?'partial':'none',
        payout:payout(Number(l.n),hitCount)
      }};
    });
    const totalPayout=lanes.reduce((s,l)=>s+Number(l.outcome?.payout||0),0);
    return {
      ...rec,status:'checked',checkedAt:new Date().toISOString(),
      actual:{draw:Number(actual.draw),date:showDate(actual.date),time:normTime(actual.time),balls:(actual.balls||[]).map(Number)},
      lanes,summary:{totalPayout}
    };
  }

  function movementForLane(current,prev,n){
    const a=current?.lanes?.find(x=>Number(x.n)===Number(n));
    const b=prev?.lanes?.find(x=>Number(x.n)===Number(n));
    if(!a||!b)return null;
    const A=new Set(a.numbers||[]),B=new Set(b.numbers||[]);
    return {kept:[...A].filter(x=>B.has(x)),added:[...A].filter(x=>!B.has(x)),left:[...B].filter(x=>!A.has(x))};
  }

  function sync(){
    if(syncing)return;
    syncing=true;
    try{
      const a=safeDraws().slice().sort((x,y)=>Number(x.draw)-Number(y.draw));
      if(!a.length)return;
      const newest=Number(a.at(-1).draw||0);
      let ar=archive().map(r=>settleRecord(r,a));
      const existing=new Set(ar.map(r=>Number(r.target?.draw)));
      if(!existing.has(newest+1)){
        const p=buildPrediction(a);
        if(p)ar.push(p);
      }
      ar.sort((x,y)=>Number(x.target?.draw)-Number(y.target?.draw));
      saveArchive(ar);

      if(newest!==lastProcessedDraw){
        const mem=memory();
        const p=ar.find(r=>Number(r.source?.draw)===newest&&Number(r.target?.draw)===newest+1);
        if(p){
          mem.push({
            draw:newest,at:new Date().toISOString(),
            lanes:(p.lanes||[]).map(l=>({
              n:l.n,m:l.m,d:l.d,status:l.status,score:l.score,
              hit10:l.stats?.[10]?.hitLift||0,hit20:l.stats?.[20]?.hitLift||0,
              hit30:l.stats?.[30]?.hitLift||0,hit66:l.stats?.[66]?.hitLift||0
            }))
          });
          saveMemory(mem);
        }
        lastProcessedDraw=newest;
        write(STATE_KEY,{lastProcessedDraw:newest,updatedAt:new Date().toISOString()});
      }
      render();
    }finally{syncing=false}
  }

  function statusBadge(s){
    if(s==='HOT')return '<span class="vr-badge hot">🟢 HOT</span>';
    if(s==='PRE-HOT')return '<span class="vr-badge pre">🟠 PRE-HOT</span>';
    if(s==='WATCH')return '<span class="vr-badge watch">🟡 WATCH</span>';
    if(s==='COLD')return '<span class="vr-badge cold">🔴 COLD</span>';
    return '<span class="vr-badge off">⚫ OFF</span>';
  }
  function resultIcon(l){
    const o=l.outcome;if(!o)return '⏳';
    if(o.hitCount===l.n)return '✅';
    if((l.n===3&&o.hitCount>=2)||(l.n===4&&o.hitCount>=3)||(l.n===5&&o.hitCount>=4))return '☑️';
    if(o.payout>0)return '🔥';
    return '❌';
  }
  function chips(nums,hitSet=null){
    return (nums||[]).map(n=>{
      const hit=hitSet?.has(Number(n));
      return `<span class="vr-num ${hit?'hit':''}">${pad(n)}${hit?' ✓':''}</span>`;
    }).join('');
  }

  function laneHtml(l,currentRec,prevRec){
    const hitSet=new Set((l.outcome?.hitNumbers||[]).map(Number));
    const mv=movementForLane(currentRec,prevRec,l.n);
    const moveHtml=mv&&mv.added.length
      ? `<div class="vr-move">➡️ новые: ${mv.added.map(pad).join(' ')}${mv.kept.length?` · удержано: ${mv.kept.map(pad).join(' ')}`:''}</div>`
      :'';
    const result=l.outcome
      ? `<div class="vr-result ${l.outcome.payout>0?'win':''}">${resultIcon(l)} ${l.outcome.hitCount}/${l.n}${l.outcome.payout>0?` · 🔥 💰 ${rub(l.outcome.payout)}`:''}</div>`
      : `<div class="vr-result pending">🔒 зафиксировано · ожидает факт</div>`;
    return `<div class="vr-lane ${l.active?'active':'inactive'}">
      <div class="vr-lane-head"><b>🎯 К${l.n} · M${l.m} · d${l.d}</b>${statusBadge(l.status)}</div>
      <div class="vr-nums">${chips(l.numbers,hitSet)}</div>
      <div class="vr-meta">↕ источник №${l.sourceDraws?.[0]||'—'}–${l.sourceDraws?.at?.(-1)||'—'} · 10:${Number(l.stats?.[10]?.hitLift||0).toFixed(2)} · 20:${Number(l.stats?.[20]?.hitLift||0).toFixed(2)} · 30:${Number(l.stats?.[30]?.hitLift||0).toFixed(2)} · 66:${Number(l.stats?.[66]?.hitLift||0).toFixed(2)}</div>
      ${moveHtml}${result}
    </div>`;
  }

  function dayValue(v){
    const d=parseDate(v);
    return Number.isFinite(d.getTime())?new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime():0;
  }
  function totals(ar){
    const checked=ar.filter(r=>r.status==='checked'&&r.actual);
    const latest=checked.at(-1)?.actual?.date||safeDraws().at(-1)?.date||'';
    const ref=dayValue(latest);
    const sumDays=days=>checked.filter(r=>{
      const t=dayValue(r.actual.date);
      return ref&&t>=ref-(days-1)*86400000&&t<=ref;
    }).reduce((s,r)=>s+Number(r.summary?.totalPayout||0),0);

    const md=parseDate(latest);
    const month=checked.filter(r=>{
      const d=parseDate(r.actual.date);
      return Number.isFinite(d.getTime())&&Number.isFinite(md.getTime())&&d.getMonth()===md.getMonth()&&d.getFullYear()===md.getFullYear();
    }).reduce((s,r)=>s+Number(r.summary?.totalPayout||0),0);

    let k33=0,k44=0,k55=0,partials=0;
    checked.forEach(r=>(r.lanes||[]).forEach(l=>{
      const h=Number(l.outcome?.hitCount||0);
      if(l.n===3&&h===3)k33++;
      if(l.n===4&&h===4)k44++;
      if(l.n===5&&h===5)k55++;
      if((l.n===3&&h===2)||(l.n===4&&h===3)||(l.n===5&&h===4))partials++;
    }));
    return {
      today:sumDays(1),week:sumDays(7),month,
      all:checked.reduce((s,r)=>s+Number(r.summary?.totalPayout||0),0),
      k33,k44,k55,partials
    };
  }

  function recordHtml(r,open=false){
    const all=archive().sort((a,b)=>Number(a.target?.draw)-Number(b.target?.draw));
    const prev=all.filter(x=>Number(x.target?.draw)<Number(r.target?.draw)).at(-1)||null;
    const total=Number(r.summary?.totalPayout||0);
    const head=`📅 ${r.target?.date||'—'} · 🕒 ${r.target?.time||'—'} · №${r.target?.draw||'—'}`;
    const body=`<div class="vr-record-body">
      <div class="vr-frozen">🔒 зафиксировано после: 📅 ${r.source?.date||'—'} · 🕒 ${r.source?.time||'—'} · №${r.source?.draw||'—'}</div>
      ${(r.lanes||[]).map(l=>laneHtml(l,r,prev)).join('')}
      ${r.actual?`<div class="vr-actual"><b>Факт:</b> 📅 ${r.actual.date} · 🕒 ${r.actual.time} · №${r.actual.draw}<div class="vr-actual-nums">${chips(r.actual.balls)}</div></div>`:''}
    </div>`;
    if(open)return `<div class="vr-record current"><div class="vr-record-head"><b>${head}</b><span>${r.status==='checked'?(total>0?`🔥 ${rub(total)}`:'❌ мимо'):'⏳ ожидает'}</span></div>${body}</div>`;
    return `<details class="vr-record"><summary><b>${head}</b><span>${r.status==='checked'?(total>0?`🔥 ${rub(total)}`:'❌'):'⏳'}</span></summary>${body}</details>`;
  }

  function render(){
    const box=$('verticalRadarResult');if(!box)return;
    const ar=archive().sort((a,b)=>Number(a.target?.draw)-Number(b.target?.draw));
    const s=totals(ar),pending=ar.find(r=>r.status!=='checked');
    const done=ar.filter(r=>r.status==='checked').slice(-40).reverse();
    box.innerHTML=`
      <div class="vr-totals">
        <div><span>🔥 Сегодня</span><b>${rub(s.today)}</b></div>
        <div><span>🔥 7 дней</span><b>${rub(s.week)}</b></div>
        <div><span>🔥 Месяц</span><b>${rub(s.month)}</b></div>
        <div><span>💰 Всего</span><b>${rub(s.all)}</b></div>
      </div>
      <div class="vr-hits">✅ 3/3: <b>${s.k33}</b> · ✅ 4/4: <b>${s.k44}</b> · ✅ 5/5: <b>${s.k55}</b> · ☑️ сильные частичные: <b>${s.partials}</b></div>
      <div class="section"><span>📡 Текущий прогноз</span></div>
      ${pending?recordHtml(pending,true):'<div class="row small">Новый прогноз появится после загрузки свежего тиража.</div>'}
      <div class="section"><span>📚 Архив радара</span><button id="verticalRadarExport" class="tool" type="button">⬇️ Экспорт</button></div>
      ${done.length?done.map(r=>recordHtml(r,false)).join(''):'<div class="row small">Проверенных прогнозов пока нет. Архив начнёт заполняться автоматически.</div>'}
    `;
    $('verticalRadarExport')?.addEventListener('click',exportData);
  }

  function exportData(){
    const payload={version:VERSION,exportedAt:new Date().toISOString(),archive:archive(),internalMemory:memory()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const u=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=u;a.download='ПОЗИТРОН_КЕНО_6_2_4_ВЕРТИКАЛЬНЫЙ_РАДАР.json';a.click();URL.revokeObjectURL(u);
  }

  function injectStyles(){
    if($('verticalRadarStyles'))return;
    const st=document.createElement('style');st.id='verticalRadarStyles';
    st.textContent=`
      .vr-totals{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:10px}.vr-totals div{background:#101f33;border:1px solid #2a4464;border-radius:10px;padding:8px}.vr-totals span{display:block;font-size:11px;color:#96a9c1}.vr-totals b{display:block;margin-top:2px;color:#ffb04a;font-size:17px}
      .vr-hits{margin-top:7px;background:#0b1727;border:1px solid #29415f;border-radius:9px;padding:8px;font-size:12px}.vr-record{border:1px solid #2a4464;border-radius:12px;background:#0b1727;margin:8px 0;padding:8px}.vr-record.current{border-color:#4ade80}.vr-record summary{display:flex;justify-content:space-between;gap:8px;cursor:pointer;list-style:none}.vr-record summary::-webkit-details-marker{display:none}.vr-record-head{display:flex;justify-content:space-between;gap:8px}.vr-frozen{font-size:11px;color:#96a9c1;margin:6px 0}
      .vr-lane{border:1px solid #29415f;border-radius:10px;background:#101f33;padding:8px;margin-top:7px}.vr-lane.active{box-shadow:inset 3px 0 #4ade80}.vr-lane.inactive{opacity:.72}.vr-lane-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.vr-badge{font-size:10px;font-weight:900;border-radius:999px;padding:3px 7px}.vr-badge.hot{background:#123a28;color:#8ef0ae}.vr-badge.pre{background:#3a2812;color:#ffc36c}.vr-badge.watch{background:#3a3117;color:#ffe487}.vr-badge.cold{background:#3b1c22;color:#ffabb2}.vr-badge.off{background:#1b2838;color:#aab8ca}
      .vr-nums,.vr-actual-nums{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.vr-num{display:inline-block;min-width:39px;text-align:center;padding:5px 6px;border:1px solid #304b6d;border-radius:8px;background:#172a43;font-family:ui-monospace,Consolas,monospace;font-weight:900}.vr-num.hit{border-color:#43d77b;background:#123a28;color:#c9ffda}.vr-meta,.vr-move{font-size:11px;color:#96a9c1;line-height:1.4;margin-top:6px}.vr-move{color:#c7d9ed}.vr-result{font-size:13px;font-weight:900;margin-top:7px}.vr-result.win{color:#ffb04a}.vr-result.pending{color:#ffe18b}.vr-actual{margin-top:9px;padding-top:8px;border-top:1px solid #29415f;font-size:12px}@media(min-width:620px){.vr-totals{grid-template-columns:repeat(4,1fr)}}
    `;
    document.head.appendChild(st);
  }

  function togglePanel(){
    const p=$('verticalRadarPanel');if(!p)return;
    p.classList.toggle('show');
    if(p.classList.contains('show')){sync();p.scrollIntoView({behavior:'smooth',block:'start'})}
  }

  function injectUi(){
    if($('verticalRadarPanel'))return;
    injectStyles();
    const app=document.querySelector('.app'),tools=app?.querySelector('.tools'),search=$('searchPanel');
    if(!app||!tools||!search)return;

    const btn=document.createElement('button');
    btn.id='verticalRadarBtn';btn.className='tool';btn.type='button';btn.textContent='📡 Вертикальный радар';
    btn.addEventListener('click',togglePanel);tools.appendChild(btn);

    const panel=document.createElement('section');
    panel.id='verticalRadarPanel';panel.className='card panel';
    panel.innerHTML=`<div class="label">📡 ВЕРТИКАЛЬНЫЙ РАДАР</div><div class="small" style="margin-top:5px">Отдельная вертикальная модель M1–M20. Старые сборки 6.2 работают параллельно и не изменяются.</div><div id="verticalRadarResult"></div>`;
    search.parentNode.insertBefore(panel,search);
  }

  function start(){
    injectUi();
    const state=read(STATE_KEY,{});lastProcessedDraw=Number(state.lastProcessedDraw||0);
    sync();
    const status=$('status');
    if(status)new MutationObserver(()=>setTimeout(sync,50)).observe(status,{childList:true,subtree:true,characterData:true});
    setInterval(sync,30000);
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync()});
    window.POZITRON_VERTICAL_RADAR={version:VERSION,sync,render,exportData,getArchive:()=>archive(),getMemory:()=>memory()};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
