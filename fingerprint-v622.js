'use strict';
/* ПОЗИТРОН КЕНО v6.2.2 — отдельный модуль 🧭 FINGERPRINT */
(() => {
  const VERSION='1.0.5';
  const CFG=Object.freeze({neighbors:5,window:80,pool:20,sizes:[3,4,5],perSize:2,eps:.02});
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
  const META={1:{button:'🎯'},2:{button:'⏳−1'},3:{button:'⏳−2'}};
  const FILES={1:'./cluster-archive-next-v622.json',2:'./cluster-archive-minus1-v622.json',3:'./cluster-archive-minus2-v622.json'};
  const KEYS={1:'pozitron_v622_fingerprint_archive_h1_v1',2:'pozitron_v622_fingerprint_archive_h2_v1',3:'pozitron_v622_fingerprint_archive_h3_v1'};
  const DB_NAME='pozitron_v622_fingerprint_v1';
  const DB_STORE='forecasts';
  const DB_VERSION=1;
  const RECOVERY=[{h:1,targetDraw:325089}];
  const state={h:1,archive:false,payload:{1:null,2:null,3:null},archiveData:{1:[],2:[],3:[]},syncing:false,last:0,db:null,storageReady:false,storageError:''};
  const $=id=>document.getElementById(id);
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const pad=n=>String(Number(n)).padStart(2,'0');
  const rubles=amount=>`${Number(amount||0).toLocaleString('ru-RU')} ₽`;
  const payoutFor=(selected,guessed)=>Number(KENO_PAYOUTS[Number(selected)]?.[Number(guessed)]||0);
  const phoneDraws=()=>{try{return typeof draws!=='undefined'&&Array.isArray(draws)?draws:[]}catch(_){return[]}};
  const read=h=>(state.archiveData[h]||[]).slice();
  function legacyRead(h){try{const x=JSON.parse(localStorage.getItem(KEYS[h])||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
  function txDone(tx){return new Promise((resolve,reject)=>{let done=false;const ok=()=>{if(!done){done=true;resolve()}};const bad=()=>{if(!done){done=true;reject(tx.error||new Error('IndexedDB transaction failed'))}};tx.oncomplete=ok;tx.onabort=bad;tx.onerror=bad})}
  function requestDone(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB request failed'))})}
  function openDb(){
    if(state.db)return Promise.resolve(state.db);
    if(!window.indexedDB)return Promise.reject(new Error('IndexedDB недоступен'));
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DB_STORE)){const st=db.createObjectStore(DB_STORE,{keyPath:'id'});st.createIndex('horizon','horizon',{unique:false})}};
      req.onsuccess=()=>{state.db=req.result;state.db.onversionchange=()=>{try{state.db.close()}catch(_){}state.db=null};resolve(state.db)};
      req.onerror=()=>reject(req.error||new Error('Не удалось открыть IndexedDB'));
      req.onblocked=()=>reject(new Error('IndexedDB заблокирован другой вкладкой'));
    });
  }
  function normalizeStored(r){
    if(!r||!Number.isFinite(Number(r.targetDraw)))return null;
    return {...r,id:String(r.id||`fp:${num(r.horizon,1)}:${r.targetDraw}`),horizon:num(r.horizon,1),sourceDraw:num(r.sourceDraw),targetDraw:num(r.targetDraw),pool20:Array.isArray(r.pool20)?r.pool20.map(Number):[],combos:Array.isArray(r.combos)?r.combos:[],neighbors:Array.isArray(r.neighbors)?r.neighbors:[],actual:r?.actual&&Array.isArray(r.actual.balls)&&r.actual.balls.length===20?{targetDraw:num(r.actual.targetDraw,r.targetDraw),date:String(r.actual.date||''),time:String(r.actual.time||''),balls:r.actual.balls.map(Number).slice(0,20)}:null};
  }
  function hydrate(rows){
    [1,2,3].forEach(h=>state.archiveData[h]=[]);
    (rows||[]).map(normalizeStored).filter(Boolean).forEach(r=>{if(state.archiveData[r.horizon])state.archiveData[r.horizon].push(r)});
    [1,2,3].forEach(h=>{state.archiveData[h].sort((a,b)=>a.targetDraw-b.targetDraw);if(state.archiveData[h].length>300)state.archiveData[h]=state.archiveData[h].slice(-300)});
  }
  async function loadDbRows(){const db=await openDb(),tx=db.transaction(DB_STORE,'readonly'),done=txDone(tx),rows=await requestDone(tx.objectStore(DB_STORE).getAll());await done;return Array.isArray(rows)?rows:[]}
  async function migrateLegacy(){
    const legacy=[];[1,2,3].forEach(h=>legacyRead(h).forEach(x=>{const r=normalizeStored({...x,horizon:num(x?.horizon,h)});if(r)legacy.push(r)}));
    if(!legacy.length)return;
    const existing=new Set([1,2,3].flatMap(h=>state.archiveData[h].map(x=>String(x.id))));
    const fresh=legacy.filter(x=>!existing.has(String(x.id)));
    if(fresh.length){const db=await openDb(),tx=db.transaction(DB_STORE,'readwrite'),st=tx.objectStore(DB_STORE);fresh.forEach(r=>st.put(r));await txDone(tx)}
    [1,2,3].forEach(h=>{try{localStorage.removeItem(KEYS[h])}catch(_){}});
    hydrate(await loadDbRows());
  }
  async function initStorage(){
    try{state.db=await openDb();hydrate(await loadDbRows());await migrateLegacy();state.storageReady=true;state.storageError=''}
    catch(e){state.storageReady=false;state.storageError=e?.message||'ошибка хранилища';console.error('FINGERPRINT storage:',e)}
  }
  async function saveRecord(record){
    const rec=normalizeStored(record);if(!rec)throw new Error('Некорректная запись FINGERPRINT');if(!state.storageReady)throw new Error(state.storageError||'Хранилище FINGERPRINT не готово');
    const h=rec.horizon,current=read(h).filter(x=>String(x.id)!==String(rec.id));current.push(rec);current.sort((a,b)=>a.targetDraw-b.targetDraw);const drop=current.length>300?current.slice(0,current.length-300):[],keep=current.slice(-300);
    const db=await openDb(),tx=db.transaction(DB_STORE,'readwrite'),st=tx.objectStore(DB_STORE);st.put(rec);drop.forEach(x=>st.delete(String(x.id)));await txDone(tx);
    state.archiveData[h]=keep;return rec;
  }

  function actualPhone(target){
    const d=phoneDraws().find(x=>Number(x?.draw)===Number(target));
    const balls=Array.isArray(d?.balls)?d.balls.map(Number).slice(0,20):[];
    return balls.length===20?{targetDraw:Number(d.draw),date:String(d.date||''),time:String(d.time||''),balls}:null;
  }
  function normCandidate(c){
    const numbers=Array.isArray(c?.numbers)?c.numbers.map(Number).filter(n=>n>=1&&n<=80):[];
    return {kind:c?.kind==='H'?'H':'V',score:Math.max(.0001,num(c?.score)),delay:Math.max(1,Math.min(10,num(c?.delay,1))),numbers};
  }
  function normRecord(r,h){
    const target=num(r?.targetDraw); if(!target)return null;
    return {id:String(r?.id||`${h}:${target}`),horizon:num(r?.horizon,h),sourceDraw:num(r?.sourceDraw),targetDraw:target,
      candidates:Array.isArray(r?.candidates)?r.candidates.map(normCandidate):[],
      actual:r?.actual&&Array.isArray(r.actual.balls)&&r.actual.balls.length===20?{targetDraw:num(r.actual.targetDraw,target),date:String(r.actual.date||''),time:String(r.actual.time||''),balls:r.actual.balls.map(Number).slice(0,20)}:null};
  }
  function actualCluster(r){return r?.actual?.balls?.length===20?r.actual:actualPhone(r?.targetDraw)}
  function actualFP(r){
    if(r?.actual?.balls?.length===20)return r.actual;
    const p=state.payload[Number(r?.horizon)];
    const cr=p?.records?.find(x=>Number(x.targetDraw)===Number(r?.targetDraw));
    return cr?actualCluster(cr)||actualPhone(r?.targetDraw):actualPhone(r?.targetDraw);
  }
  async function fetchH(h){
    const res=await fetch(`${FILES[h]}?t=${Date.now()}`,{cache:'no-store'}); if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const raw=await res.json();
    const records=(Array.isArray(raw?.records)?raw.records:[]).map(x=>normRecord(x,h)).filter(Boolean).sort((a,b)=>a.targetDraw-b.targetDraw);
    return state.payload[h]={h,records};
  }

  function vector(r){
    const cs=r?.candidates||[], total=cs.reduce((s,c)=>s+c.score,0)||1, v=[];
    for(let n=1;n<=80;n++){
      const hit=cs.filter(c=>c.numbers.includes(n));
      const sc=hit.reduce((s,c)=>s+c.score,0)/total;
      const dl=hit.reduce((s,c)=>s+c.score*((11-c.delay)/10),0)/total;
      v.push(hit.length/6,hit.filter(c=>c.kind==='V').length/3,hit.filter(c=>c.kind==='H').length/3,sc,dl);
    }
    return v;
  }
  function currentSupport(r){
    const out=Array(81).fill(0),cs=r?.candidates||[],total=cs.reduce((s,c)=>s+c.score,0)||1;
    cs.forEach(c=>c.numbers.forEach(n=>{if(n>=1&&n<=80)out[n]+=c.score/total})); return out;
  }
  function dist(a,b){let s=0;if(!a.length||a.length!==b.length)return Infinity;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length}
  function neighbors(records,current){
    const cv=vector(current),cutoff=num(current?.sourceDraw,current.targetDraw-1);
    const eligible=records.filter(r=>r.targetDraw<current.targetDraw&&r.targetDraw<=cutoff&&actualCluster(r)?.balls?.length===20).slice(-CFG.window);
    if(eligible.length<CFG.neighbors)return[];
    const top=eligible.map(r=>({record:r,actual:actualCluster(r),distance:dist(cv,vector(r))})).filter(x=>Number.isFinite(x.distance)).sort((a,b)=>a.distance-b.distance||b.record.targetDraw-a.record.targetDraw).slice(0,CFG.neighbors);
    const rw=top.map(x=>1/(x.distance+CFG.eps)),sum=rw.reduce((a,b)=>a+b,0)||1;
    return top.map((x,i)=>({...x,weight:rw[i]/sum}));
  }
  function pool20(ns,current){
    const votes=Array(81).fill(0),support=currentSupport(current);
    ns.forEach(x=>{const set=new Set(x.actual.balls.map(Number));for(let n=1;n<=80;n++)if(set.has(n))votes[n]+=x.weight});
    const pool=Array.from({length:80},(_,i)=>i+1).sort((a,b)=>votes[b]-votes[a]||support[b]-support[a]||a-b).slice(0,CFG.pool);
    return {pool,votes,support};
  }
  function eachCombo(values,k,fn){
    const a=[];function walk(start){if(a.length===k){fn(a.slice());return}const left=k-a.length;for(let i=start;i<=values.length-left;i++){a.push(values[i]);walk(i+1);a.pop()}} if(values.length>=k)walk(0);
  }
  function combos(ns,pool,votes,support,k){
    const ranked=[],threshold=Math.max(2,k-1),pairs=k*(k-1)/2||1;
    eachCombo(pool,k,c=>{
      let fullW=0,fullN=0,supW=0,supN=0,covW=0,pairW=0;
      ns.forEach(x=>{const set=new Set(x.actual.balls.map(Number));let hits=0,ph=0;c.forEach(n=>{if(set.has(n))hits++});for(let i=0;i<c.length;i++)if(set.has(c[i]))for(let j=i+1;j<c.length;j++)if(set.has(c[j]))ph++;
        covW+=x.weight*(hits/k);pairW+=x.weight*(ph/pairs);if(hits>=threshold){supW+=x.weight;supN++}if(hits===k){fullW+=x.weight;fullN++}});
      const vm=c.reduce((s,n)=>s+votes[n],0)/k,cm=c.reduce((s,n)=>s+support[n],0)/k;
      ranked.push({numbers:c,neighborCount:supN,neighborWeight:supW,rank:fullW*5000+fullN*500+supW*1200+supN*80+pairW*600+covW*300+vm*100+cm});
    });
    ranked.sort((a,b)=>b.rank-a.rank||b.neighborCount-a.neighborCount||b.neighborWeight-a.neighborWeight||a.numbers.join('-').localeCompare(b.numbers.join('-')));
    return ranked.slice(0,CFG.perSize).map((x,i)=>({id:`K${k}-${i+1}`,size:k,numbers:x.numbers,neighborCount:x.neighborCount,neighborWeight:Number(x.neighborWeight.toFixed(6))}));
  }
  function calculate(payload,current){
    const ns=neighbors(payload.records,current); if(ns.length<CFG.neighbors)return null;
    const p=pool20(ns,current),all=CFG.sizes.flatMap(k=>combos(ns,p.pool,p.votes,p.support,k));
    if(CFG.sizes.some(k=>all.filter(x=>x.size===k).length<CFG.perSize))return null;
    return {id:`fp:${current.horizon}:${current.targetDraw}`,version:VERSION,horizon:Number(current.horizon),sourceDraw:Number(current.sourceDraw),targetDraw:Number(current.targetDraw),createdAt:new Date().toISOString(),method:'fingerprint-manhattan-distance-weighted',settings:{neighbors:5,historyWindow:80,poolSize:20},neighbors:ns.map(x=>({targetDraw:x.record.targetDraw,sourceDraw:x.record.sourceDraw,distance:Number(x.distance.toFixed(6)),weight:Number(x.weight.toFixed(6))})),pool20:p.pool.slice(),combos:all};
  }
  function pending(payload){return payload?.records?.slice().sort((a,b)=>b.targetDraw-a.targetDraw).find(r=>!actualCluster(r))||null}
  async function ensure(h){
    const p=state.payload[h],cur=pending(p);if(!p||!cur)return null;const id=`fp:${h}:${cur.targetDraw}`,old=read(h).find(x=>String(x.id)===id);if(old)return old;
    const rec=calculate(p,cur);if(!rec)return null;return await saveRecord(rec);
  }
  async function settle(h){
    for(const old of read(h)){
      if(old?.actual?.balls?.length===20)continue;const actual=actualFP(old);if(!actual?.balls?.length)continue;
      await saveRecord({...old,actual:{targetDraw:num(actual.targetDraw,old.targetDraw),date:String(actual.date||''),time:String(actual.time||''),balls:actual.balls.map(Number).slice(0,20)},settledAt:new Date().toISOString()});
    }
  }
  async function recoverKnownLost(h){
    for(const item of RECOVERY.filter(x=>Number(x.h)===Number(h))){
      const id=`fp:${h}:${item.targetDraw}`;if(read(h).some(x=>String(x.id)===id))continue;
      const p=state.payload[h],cr=p?.records?.find(x=>Number(x.targetDraw)===Number(item.targetDraw));if(!cr)continue;
      const actual=actualCluster(cr);if(!actual?.balls?.length)continue;const rec=calculate(p,cr);if(!rec)continue;
      await saveRecord({...rec,recovered:true,recoveredAt:new Date().toISOString(),actual:{targetDraw:num(actual.targetDraw,item.targetDraw),date:String(actual.date||''),time:String(actual.time||''),balls:actual.balls.map(Number).slice(0,20)}});
    }
  }

  const hitSet=(nums,actual)=>{const s=new Set(actual?.balls||[]);return new Set((nums||[]).filter(n=>s.has(Number(n))))};
  const chips=(nums,hits)=>nums.map(n=>`<span class="fp-num ${hits?.has(Number(n))?'hit':''}">${pad(n)}${hits?.has(Number(n))?' ✓':''}</span>`).join('');
  function comboHtml(c,actual){
    const hs=actual?hitSet(c.numbers,actual):null,hc=hs?hs.size:0,sup=`${c.neighborCount}/${CFG.neighbors}`,payout=actual?payoutFor(c.size,hc):0;
    return `<div class="fp-combo ${payout>0?'fp-combo-win':''}"><div class="fp-combo-head"><b>${c.id}</b><span>${actual?`${hc}/${c.size}`:`в аналогах ${sup}`}</span></div><div class="fp-numbers">${chips(c.numbers,hs)}</div>${actual?`<div class="fp-note">поддержка до тиража: ${sup} ближайших аналогов</div>`:''}${payout>0?`<div class="fp-prize">🔥 ${rubles(payout)}</div>`:''}</div>`;
  }
  function forecastHtml(r,open=true){
    const actual=actualFP(r),ph=actual?hitSet(r.pool20,actual):null,pc=ph?ph.size:0,groups=CFG.sizes.map(k=>`<div class="fp-label">К${k}</div>${r.combos.filter(c=>c.size===k).map(c=>comboHtml(c,actual)).join('')}`).join('');
    const poolPrize=actual?payoutFor(pc,pc):0;
    const poolPrizeBlock=actual&&poolPrize>0?`<div class="fp-pool-prize">👀👀 ${rubles(poolPrize)}</div>`:'';
    const body=`<div class="fp-head"><b>${META[r.horizon]?.button||'🎯'} тираж №${r.targetDraw}</b><span>${actual?`пул ${pc}/20`:'ожидает результата'}</span></div><div class="fp-note">Зафиксировано после №${r.sourceDraw}. Прогноз не меняется.</div>${groups}<div class="fp-label">ПУЛ 20</div><div class="fp-numbers">${chips(r.pool20,ph)}</div>${poolPrizeBlock}<details class="fp-nei"><summary>5 ближайших исторических аналогов</summary>${r.neighbors.map((x,i)=>`<div>${i+1}. №${x.targetDraw} · дистанция ${x.distance.toFixed(4)}</div>`).join('')}</details>`;
    return open?`<div class="fp-record">${body}</div>`:`<details class="fp-record"><summary><b>${META[r.horizon]?.button} №${r.targetDraw}</b><span>${actual?`пул ${pc}/20`:'⏳'}</span></summary>${body}</details>`;
  }
  function currentRecord(h){const cur=pending(state.payload[h]);if(!cur)return null;return read(h).find(x=>String(x.id)===`fp:${h}:${cur.targetDraw}`)||null}
  function render(){
    const box=$('fingerprintResult');if(!box)return;
    document.querySelectorAll('[data-fp-h]').forEach(b=>b.classList.toggle('active',!state.archive&&Number(b.dataset.fpH)===state.h));$('fingerprintArchiveBtn')?.classList.toggle('active',state.archive);
    if(!state.storageReady){box.innerHTML=`<div class="fp-msg">Хранилище FINGERPRINT недоступно: ${state.storageError||'инициализация'}</div>`;return}
    if(state.archive){const a=read(state.h).sort((x,y)=>y.targetDraw-x.targetDraw);box.innerHTML=`<div class="fp-archive-head">📚 Архив FINGERPRINT ${META[state.h].button}</div>${a.length?a.map(r=>forecastHtml(r,false)).join(''):'<div class="fp-msg">Архив пока пуст.</div>'}`;return}
    const p=state.payload[state.h];if(!p){box.innerHTML='<div class="fp-msg">Загружаю серверный архив сигналов…</div>';return}const cur=pending(p);if(!cur){box.innerHTML='<div class="fp-msg">Серверный архив ещё не содержит будущего целевого тиража.</div>';return}
    const r=currentRecord(state.h);if(r){box.innerHTML=forecastHtml(r,true);return}
    box.innerHTML=`<div class="fp-msg">Формирую и сохраняю прогноз ${META[state.h].button}…</div>`;
    ensure(state.h).then(x=>{if(x)render();else box.innerHTML=`<div class="fp-msg">Для ${META[state.h].button} не удалось построить прогноз из серверного архива.</div>`}).catch(e=>{state.storageError=e?.message||'ошибка сохранения';box.innerHTML=`<div class="fp-msg">Прогноз не показан, потому что не удалось сохранить его в архив: ${state.storageError}</div>`});
  }
  async function sync(force=false){
    if(state.syncing||(!force&&Date.now()-state.last<30000))return;state.syncing=true;
    try{
      const rs=await Promise.allSettled([1,2,3].map(fetchH));state.last=Date.now();
      for(let i=0;i<3;i++){const h=i+1;if(rs[i].status!=='fulfilled')continue;try{await recoverKnownLost(h);await settle(h);await ensure(h)}catch(e){state.storageError=e?.message||'ошибка сохранения';console.error('FINGERPRINT archive:',e)}}
      if(!$('fingerprintPanel')?.hidden)render();
    }finally{state.syncing=false}
  }

  function styles(){if($('fingerprintStyles'))return;const s=document.createElement('style');s.id='fingerprintStyles';s.textContent=`
#fpMainToolsLayout{display:grid;gap:6px;margin-top:6px}.fp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}#fpMainToolsLayout .tool{min-width:0;min-height:48px;padding:8px 4px;white-space:normal}#fingerprintMainBtn{font-weight:900}#fingerprintMainBtn.active,.fp-tab.active{border-color:#72df95;background:#153a2a}#fingerprintPanel[hidden]{display:none!important}#fingerprintPanel{margin-top:8px}.fp-title{display:flex;justify-content:space-between;gap:8px}.fp-title b{font-size:20px}.fp-warning{font-size:12px;color:#ffe6a0;background:#302812;border:1px solid #6e5b20;border-radius:9px;padding:8px;margin:9px 0}.fp-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.fp-tab{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:8px 3px;font-weight:900}.fp-record{border:1px solid #2a4464;border-radius:12px;background:#0b1727;margin:8px 0;padding:8px}.fp-record>summary,.fp-head,.fp-combo-head{display:flex;justify-content:space-between;gap:8px}.fp-head span,.fp-record>summary span{color:#8eedaa;font-weight:900}.fp-label{font-weight:950;margin:11px 0 5px}.fp-combo{background:#101f33;border:1px solid #263e5b;border-radius:10px;padding:8px;margin-top:6px}.fp-combo.fp-combo-win{border-color:#f0a63b;box-shadow:inset 0 0 0 1px #f0a63b}.fp-prize{margin-top:7px;color:#ffad42;font-size:17px;font-weight:950}.fp-pool-prize{margin-top:10px;text-align:center;color:#ffad42;font-size:20px;font-weight:950}.fp-combo-head span,.fp-note,.fp-nei{font-size:11px;color:var(--muted)}.fp-numbers{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.fp-num{min-width:38px;text-align:center;padding:5px 6px;border:1px solid #304b6d;border-radius:8px;background:#172a43;font-family:ui-monospace,Consolas,monospace;font-weight:900}.fp-num.hit{border-color:#43d77b;background:#123a28;color:#c9ffda}.fp-nei{margin-top:10px;border-top:1px solid #263e5b;padding-top:8px}.fp-msg{background:#101f33;border:1px solid #263e5b;border-radius:9px;padding:10px;color:var(--muted);font-size:12px}.fp-archive-head{font-size:16px;font-weight:950;margin:8px 2px}@media(max-width:390px){#fpMainToolsLayout .tool,.fp-tab{font-size:11px}}
`;document.head.appendChild(s)}
  function panel(layout){
    const p=document.createElement('section');p.id='fingerprintPanel';p.className='card';p.hidden=true;p.innerHTML=`<div class="fp-title"><div><b>🧭 FINGERPRINT</b><div class="small">Манхэттен · 5 ближайших аналогов · окно 80</div></div><span>v${VERSION}</span></div><div class="fp-warning">Экспериментальный статистический алгоритм. Комбинации фиксируются до целевого тиража и не гарантируют выпадение.</div><div class="fp-tabs"><button class="fp-tab active" data-fp-h="1">🎯</button><button class="fp-tab" data-fp-h="2">⏳−1</button><button class="fp-tab" data-fp-h="3">⏳−2</button><button class="fp-tab" id="fingerprintArchiveBtn">📚 Архив</button></div><div id="fingerprintResult"><div class="fp-msg">Загружаю серверный архив сигналов…</div></div>`;layout.insertAdjacentElement('afterend',p);
    p.querySelectorAll('[data-fp-h]').forEach(b=>b.onclick=()=>{state.h=Number(b.dataset.fpH);state.archive=false;render();sync(true)});$('fingerprintArchiveBtn').onclick=()=>{state.archive=!state.archive;render()};return p;
  }
  function layout(){
    if($('fpMainToolsLayout'))return true;const search=document.querySelector('button[data-panel="searchPanel"]'),analog=document.querySelector('button[data-panel="analogsPanel"]'),archive=document.querySelector('button[data-panel="archivePanel"]'),data=document.querySelector('button[data-panel="dataPanel"]'),clusters=[...document.querySelectorAll('button[data-cluster-horizon]')].sort((a,b)=>Number(a.dataset.clusterHorizon)-Number(b.dataset.clusterHorizon));if(!search||!analog||!archive||!data||clusters.length!==3)return false;
    const old=search.parentElement,crow=clusters[0].parentElement;if(!old||!crow)return false;const box=document.createElement('div');box.id='fpMainToolsLayout';const r1=document.createElement('div'),r2=document.createElement('div'),r3=document.createElement('div');r1.className=r2.className=r3.className='fp-row';const btn=document.createElement('button');btn.id='fingerprintMainBtn';btn.className='tool';btn.textContent='🧭 FINGERPRINT';btn.setAttribute('aria-expanded','false');r1.append(search,analog,btn);clusters.forEach(x=>r2.appendChild(x));archive.style.gridColumn='1';data.style.gridColumn='3';r3.append(archive,data);box.append(r1,r2,r3);old.insertAdjacentElement('beforebegin',box);old.remove();crow.remove();const p=panel(box);
    btn.onclick=()=>{const open=p.hidden;p.hidden=!open;btn.classList.toggle('active',open);btn.setAttribute('aria-expanded',String(open));if(open){$('archivePanel')?.classList.remove('show');state.archive=false;render();sync(true);p.scrollIntoView({behavior:'smooth',block:'start'})}};
    archive.addEventListener('click',()=>{if(!p.hidden){p.hidden=true;btn.classList.remove('active');btn.setAttribute('aria-expanded','false')}});return true;
  }
  async function start(){
    styles();await initStorage();let tries=0;const t=setInterval(()=>{tries++;if(layout()||tries>=40){clearInterval(t);if($('fpMainToolsLayout')){sync(true);setInterval(()=>sync(false),60000)}}},50);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{start()},{once:true});else start();
})();
