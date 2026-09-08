import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();

const CFG=Object.freeze({
  neighbors:5,
  antiOffset:5,
  antiNeighbors:5,
  window:80,
  pool:20,
  antiPool:20,
  sizes:[3,4,5],
  perSize:2,
  eps:0.02
});

const SOURCE_FILES={
  1:path.join(ROOT,'cluster-archive-next-v622.json'),
  2:path.join(ROOT,'cluster-archive-minus1-v622.json'),
  3:path.join(ROOT,'cluster-archive-minus2-v622.json')
};

const OUTPUT_FILES={
  1:path.join(ROOT,'fingerprint-archive-next-v622.json'),
  2:path.join(ROOT,'fingerprint-archive-minus1-v622.json'),
  3:path.join(ROOT,'fingerprint-archive-minus2-v622.json')
};

const LIVE_FILES={
  1:path.join(ROOT,'fingerprint-live-next-v622.json'),
  2:path.join(ROOT,'fingerprint-live-minus1-v622.json'),
  3:path.join(ROOT,'fingerprint-live-minus2-v622.json')
};

const HISTORY_FILE=path.join(ROOT,'keno-history-v62.json');

const META={
  1:{button:'🎯',title:'Следующий тираж'},
  2:{button:'⏳−1',title:'Через один тираж'},
  3:{button:'⏳−2',title:'Через два тиража'}
};

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

function readJson(file,fallback){
  try{
    return JSON.parse(fs.readFileSync(file,'utf8'));
  }catch(err){
    if(fallback!==undefined)return fallback;
    throw new Error(`${path.basename(file)}: JSON read failed: ${err.message}`);
  }
}

function stableText(value){
  return JSON.stringify(value,null,2)+'\n';
}

function writeIfChanged(file,value){
  const next=stableText(value);
  const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  if(before===next)return false;
  fs.writeFileSync(file,next,'utf8');
  return true;
}

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const payoutFor=(s,g)=>Number(KENO_PAYOUTS[num(s)]?.[num(g)]||0);

function parseDate(value){
  const m=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if(!m)return null;
  let y=Number(m[3]);
  if(y<100)y+=2000;
  const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[1])));
  return Number.isFinite(d.getTime())?d:null;
}

function formatDate(date){
  const d=String(date.getUTCDate()).padStart(2,'0');
  const m=String(date.getUTCMonth()+1).padStart(2,'0');
  const y=String(date.getUTCFullYear()).slice(-2);
  return `${d}.${m}.${y}`;
}

function normalizeHistory(raw){
  const source=Array.isArray(raw)?raw:
    Array.isArray(raw?.draws)?raw.draws:
    Array.isArray(raw?.results)?raw.results:[];
  return source.map(r=>({
    draw:num(r?.draw??r?.drawNumber??r?.number),
    date:String(r?.date??r?.drawDate??'').trim(),
    time:String(r?.time??r?.drawTime??'').trim().slice(0,5)
  }))
  .filter(r=>r.draw&&r.date&&/^\d{2}:\d{2}$/.test(r.time))
  .sort((a,b)=>a.draw-b.draw);
}

function inferTargetMeta(history,targetDraw){
  const direct=history.find(r=>r.draw===targetDraw);
  if(direct)return {date:direct.date,time:direct.time};

  const latest=history.at(-1);
  if(!latest||targetDraw<=latest.draw)return {date:'',time:''};

  const delta=targetDraw-latest.draw;
  if(delta<1||delta>10)return {date:'',time:''};

  // Берём самый свежий прошлый цикл, где встречалось то же время,
  // и повторяем следующие слоты. Это устойчивее жёстко прошитого расписания.
  for(let i=history.length-2;i>=0;i--){
    const base=history[i];
    if(base.time!==latest.time||base.date===latest.date)continue;
    if(i+delta>=history.length)continue;

    const refDate=parseDate(base.date);
    const curDate=parseDate(latest.date);
    const next=history[i+delta];
    const nextDate=parseDate(next.date);
    if(!refDate||!curDate||!nextDate)continue;

    const dayOffset=Math.round((nextDate-refDate)/86400000);
    const predictedDate=new Date(curDate.getTime()+dayOffset*86400000);
    return {date:formatDate(predictedDate),time:next.time};
  }

  // Резерв: сетка времени самого свежего предыдущего дня.
  const latestDate=latest.date;
  const previousDates=[...new Set(history.filter(r=>r.date!==latestDate).map(r=>r.date))];
  const prevDate=previousDates.at(-1);
  if(prevDate){
    const slots=history.filter(r=>r.date===prevDate).map(r=>r.time);
    const idx=slots.lastIndexOf(latest.time);
    if(idx>=0){
      const curDate=parseDate(latest.date);
      if(curDate){
        let pos=idx;
        let dayAdd=0;
        let time=latest.time;
        for(let k=0;k<delta;k++){
          pos++;
          if(pos>=slots.length){pos=0;dayAdd++}
          time=slots[pos];
        }
        const date=new Date(curDate.getTime()+dayAdd*86400000);
        return {date:formatDate(date),time};
      }
    }
  }

  return {date:'',time:''};
}

function normalizeCandidate(c){
  return {
    kind:c?.kind==='H'?'H':'V',
    score:Math.max(.0001,num(c?.score)),
    delay:Math.max(1,Math.min(10,num(c?.delay,1))),
    numbers:Array.isArray(c?.numbers)
      ?c.numbers.map(Number).filter(n=>n>=1&&n<=80)
      :[]
  };
}

function normalizeClusterRecord(r,h){
  const targetDraw=num(r?.targetDraw);
  if(!targetDraw)return null;
  const balls=Array.isArray(r?.actual?.balls)?r.actual.balls.map(Number).slice(0,20):[];
  return {
    id:String(r?.id||`${h}:${targetDraw}`),
    horizon:num(r?.horizon,h),
    sourceDraw:num(r?.sourceDraw,targetDraw-h),
    targetDraw,
    candidates:Array.isArray(r?.candidates)?r.candidates.map(normalizeCandidate):[],
    actual:balls.length===20?{
      targetDraw,
      date:String(r?.actual?.date||''),
      time:String(r?.actual?.time||''),
      balls
    }:null
  };
}

function vector(r){
  const cs=r?.candidates||[];
  const total=cs.reduce((s,x)=>s+x.score,0)||1;
  const out=[];
  for(let n=1;n<=80;n++){
    const hit=cs.filter(x=>x.numbers.includes(n));
    const score=hit.reduce((s,x)=>s+x.score,0)/total;
    const delay=hit.reduce((s,x)=>s+x.score*((11-x.delay)/10),0)/total;
    out.push(
      hit.length/6,
      hit.filter(x=>x.kind==='V').length/3,
      hit.filter(x=>x.kind==='H').length/3,
      score,
      delay
    );
  }
  return out;
}

function currentSupport(r){
  const out=Array(81).fill(0);
  const cs=r?.candidates||[];
  const total=cs.reduce((s,x)=>s+x.score,0)||1;
  for(const x of cs){
    for(const n of x.numbers){
      if(n>=1&&n<=80)out[n]+=x.score/total;
    }
  }
  return out;
}

function distance(a,b){
  if(!a.length||a.length!==b.length)return Infinity;
  let s=0;
  for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);
  return s/a.length;
}

function rankedNeighbors(records,current){
  const cv=vector(current);
  const cutoff=num(current?.sourceDraw,current.targetDraw-1);
  const eligible=records
    .filter(r=>r.targetDraw<current.targetDraw&&r.targetDraw<=cutoff&&r.actual?.balls?.length===20)
    .slice(-CFG.window);

  return eligible
    .map(r=>({record:r,actual:r.actual,distance:distance(cv,vector(r))}))
    .filter(x=>Number.isFinite(x.distance))
    .sort((a,b)=>a.distance-b.distance||b.record.targetDraw-a.record.targetDraw);
}

function weighted(items){
  if(!items.length)return[];
  const raw=items.map(x=>1/(x.distance+CFG.eps));
  const sum=raw.reduce((a,b)=>a+b,0)||1;
  return items.map((x,i)=>({
    ...x,
    weight:raw[i]/sum,
    actualSet:new Set(x.actual.balls.map(Number))
  }));
}

function buildPool(neighbors,current){
  const votes=Array(81).fill(0);
  const support=currentSupport(current);
  for(const x of neighbors){
    for(let n=1;n<=80;n++){
      if(x.actualSet.has(n))votes[n]+=x.weight;
    }
  }
  const pool=Array.from({length:80},(_,i)=>i+1)
    .sort((a,b)=>votes[b]-votes[a]||support[b]-support[a]||a-b)
    .slice(0,CFG.pool);
  return {pool,votes,support};
}

function buildAntiPool(antiNeighbors,logicPool,logicVotes,support){
  const antiVotes=Array(81).fill(0);
  for(const x of antiNeighbors){
    for(let n=1;n<=80;n++){
      if(x.actualSet.has(n))antiVotes[n]+=x.weight;
    }
  }
  const excluded=new Set(logicPool);
  const candidates=Array.from({length:80},(_,i)=>i+1)
    .filter(n=>!excluded.has(n))
    .sort((a,b)=>{
      const sa=antiVotes[a]-logicVotes[a]*.65-support[a]*.08;
      const sb=antiVotes[b]-logicVotes[b]*.65-support[b]*.08;
      return sb-sa||antiVotes[b]-antiVotes[a]||a-b;
    })
    .slice(0,CFG.antiPool);
  return {candidates,antiVotes};
}

function eachCombination(values,size,cb){
  const s=[];
  function walk(start){
    if(s.length===size){cb(s.slice());return}
    const left=size-s.length;
    for(let i=start;i<=values.length-left;i++){
      s.push(values[i]);
      walk(i+1);
      s.pop();
    }
  }
  if(values.length>=size)walk(0);
}

function rankAll(neighbors,values,votes,support,size){
  const ranked=[];
  const threshold=Math.max(2,size-1);
  const pairs=size*(size-1)/2||1;

  eachCombination(values,size,c=>{
    let fullW=0,fullN=0,supW=0,supN=0,covW=0,pairW=0;
    for(const x of neighbors){
      let hits=0,ph=0;
      for(const n of c)if(x.actualSet.has(n))hits++;
      for(let i=0;i<c.length;i++){
        if(!x.actualSet.has(c[i]))continue;
        for(let j=i+1;j<c.length;j++){
          if(x.actualSet.has(c[j]))ph++;
        }
      }
      covW+=x.weight*(hits/size);
      pairW+=x.weight*(ph/pairs);
      if(hits>=threshold){supW+=x.weight;supN++}
      if(hits===size){fullW+=x.weight;fullN++}
    }

    const voteMean=c.reduce((s,n)=>s+votes[n],0)/size;
    const supportMean=c.reduce((s,n)=>s+support[n],0)/size;

    ranked.push({
      numbers:c,
      neighborCount:supN,
      neighborWeight:supW,
      rank:
        fullW*5000+
        fullN*500+
        supW*1200+
        supN*80+
        pairW*600+
        covW*300+
        voteMean*100+
        supportMean
    });
  });

  ranked.sort((a,b)=>
    b.rank-a.rank||
    b.neighborCount-a.neighborCount||
    b.neighborWeight-a.neighborWeight||
    a.numbers.join('-').localeCompare(b.numbers.join('-'))
  );
  return ranked;
}

function diversified(ranked,size,prefix){
  const chosen=[];
  const maxOverlap=Math.floor(size/2);

  for(const item of ranked){
    if(chosen.every(prev=>
      item.numbers.filter(n=>prev.numbers.includes(n)).length<=maxOverlap
    )){
      chosen.push(item);
    }
    if(chosen.length===CFG.perSize)break;
  }

  return chosen.map((x,i)=>({
    id:`${prefix}K${size}-${i+1}`,
    size,
    numbers:x.numbers,
    neighborCount:x.neighborCount,
    neighborWeight:Number(x.neighborWeight.toFixed(6))
  }));
}

function calculate(records,current,targetMeta){
  const ranked=rankedNeighbors(records,current);
  if(ranked.length<CFG.antiOffset+CFG.antiNeighbors)return null;

  const logicNeighbors=weighted(ranked.slice(0,CFG.neighbors));
  const antiNeighbors=weighted(ranked.slice(CFG.antiOffset,CFG.antiOffset+CFG.antiNeighbors));

  const pd=buildPool(logicNeighbors,current);

  const logicCombos=CFG.sizes.flatMap(size=>
    diversified(
      rankAll(logicNeighbors,pd.pool,pd.votes,pd.support,size),
      size,
      ''
    )
  );

  const ad=buildAntiPool(antiNeighbors,pd.pool,pd.votes,pd.support);

  const antiCombos=CFG.sizes.flatMap(size=>
    diversified(
      rankAll(antiNeighbors,ad.candidates,ad.antiVotes,pd.support,size),
      size,
      'A-'
    )
  );

  if(CFG.sizes.some(size=>
    logicCombos.filter(x=>x.size===size).length<2||
    antiCombos.filter(x=>x.size===size).length<2
  ))return null;

  return {
    id:`fp:${current.horizon}:${current.targetDraw}`,
    version:'2.1-server',
    horizon:current.horizon,
    sourceDraw:current.sourceDraw,
    targetDraw:current.targetDraw,
    targetDate:targetMeta.date||'',
    targetTime:targetMeta.time||'',
    createdAt:new Date().toISOString(),
    method:'fingerprint-logic-antilogic',
    settings:{
      neighbors:5,
      antiNeighbors:5,
      historyWindow:80,
      poolSize:20
    },
    neighbors:logicNeighbors.map(x=>({
      targetDraw:x.record.targetDraw,
      sourceDraw:x.record.sourceDraw,
      distance:Number(x.distance.toFixed(6)),
      weight:Number(x.weight.toFixed(6))
    })),
    pool20:pd.pool.slice(),
    combos:logicCombos,
    logic:{
      pool20:pd.pool.slice(),
      combos:logicCombos,
      neighbors:logicNeighbors.map(x=>({
        targetDraw:x.record.targetDraw,
        distance:Number(x.distance.toFixed(6)),
        weight:Number(x.weight.toFixed(6))
      }))
    },
    antilogic:{
      candidates:ad.candidates.slice(),
      combos:antiCombos,
      neighbors:antiNeighbors.map(x=>({
        targetDraw:x.record.targetDraw,
        distance:Number(x.distance.toFixed(6)),
        weight:Number(x.weight.toFixed(6))
      }))
    },
    actual:null,
    status:'pending',
    summary:null
  };
}

function settleCombos(combos,actualSet){
  return (combos||[]).map(c=>{
    const hitNumbers=c.numbers.filter(n=>actualSet.has(Number(n)));
    const payout=payoutFor(c.size,hitNumbers.length);
    return {
      ...c,
      outcome:{
        hitNumbers,
        hitCount:hitNumbers.length,
        payout
      }
    };
  });
}

function settle(record,actual){
  if(!actual?.balls?.length)return record;

  const set=new Set(actual.balls.map(Number));
  const pool=(record.logic?.pool20||record.pool20||[]);
  const poolHits=pool.filter(n=>set.has(Number(n)));
  const logicCombos=settleCombos(record.logic?.combos||record.combos||[],set);
  const antiCombos=settleCombos(record.antilogic?.combos||[],set);
  const logicPayout=logicCombos.reduce((s,c)=>s+num(c.outcome?.payout),0);
  const antiPayout=antiCombos.reduce((s,c)=>s+num(c.outcome?.payout),0);
  const poolPayout=payoutFor(poolHits.length,poolHits.length);

  return {
    ...record,
    targetDate:String(record.targetDate||actual.date||''),
    targetTime:String(record.targetTime||actual.time||''),
    pool20:pool.slice(),
    combos:logicCombos,
    logic:{...(record.logic||{}),pool20:pool.slice(),combos:logicCombos},
    antilogic:{...(record.antilogic||{}),combos:antiCombos},
    actual:{
      targetDraw:actual.targetDraw,
      date:actual.date,
      time:actual.time,
      balls:actual.balls.slice()
    },
    status:'checked',
    settledAt:record.settledAt||new Date().toISOString(),
    summary:{
      poolHits,
      poolHitCount:poolHits.length,
      poolPayout,
      logicPayout,
      antilogicPayout:antiPayout,
      comboPayout:logicPayout,
      totalPayout:poolPayout+logicPayout+antiPayout
    }
  };
}

function normalizeExisting(raw,h){
  return {
    version:'2.1-server',
    appVersion:'6.2.7',
    horizon:h,
    button:META[h].button,
    title:META[h].title,
    method:'fingerprint-logic-antilogic',
    updatedAt:raw?.updatedAt||null,
    latestHistoryDraw:num(raw?.latestHistoryDraw),
    records:Array.isArray(raw?.records)?raw.records:[]
  };
}

function enrichTargetMeta(record,history){
  if(record?.actual?.date&&record?.actual?.time){
    if(record.targetDate&&record.targetTime)return record;
    return {
      ...record,
      targetDate:String(record.targetDate||record.actual.date||''),
      targetTime:String(record.targetTime||record.actual.time||'')
    };
  }

  if(record?.targetDate&&record?.targetTime)return record;

  const meta=inferTargetMeta(history,num(record?.targetDraw));
  if(!meta.date&&!meta.time)return record;

  return {
    ...record,
    targetDate:String(record.targetDate||meta.date||''),
    targetTime:String(record.targetTime||meta.time||'')
  };
}

function createLiveArchive(archive){
  const records=archive.records||[];
  const pending=records.filter(r=>r.status!=='checked'&&!r.actual);
  const checked=records.filter(r=>r.status==='checked'||r.actual).slice(-2);

  const map=new Map();
  for(const r of [...checked,...pending])map.set(String(r.id),r);

  const liveRecords=[...map.values()]
    .sort((a,b)=>num(a.targetDraw)-num(b.targetDraw))
    .slice(-6);

  return {
    version:'2.1-live',
    appVersion:'6.2.7',
    horizon:archive.horizon,
    button:archive.button,
    title:archive.title,
    method:archive.method,
    updatedAt:archive.updatedAt,
    latestHistoryDraw:archive.latestHistoryDraw,
    recordsCount:liveRecords.length,
    records:liveRecords
  };
}

function updateHorizon(h,history){
  const sourceRaw=readJson(SOURCE_FILES[h]);
  const sourceRecords=(Array.isArray(sourceRaw?.records)?sourceRaw.records:[])
    .map(r=>normalizeClusterRecord(r,h))
    .filter(Boolean)
    .sort((a,b)=>a.targetDraw-b.targetDraw);

  if(!sourceRecords.length){
    throw new Error(`Пустой серверный архив сборок для горизонта ${h}`);
  }

  const outputFile=OUTPUT_FILES[h];
  const original=readJson(outputFile,{});
  const archive=normalizeExisting(original,h);

  const byId=new Map(
    archive.records.map(r=>[String(r.id||`fp:${h}:${r.targetDraw}`),r])
  );
  const sourceByTarget=new Map(sourceRecords.map(r=>[r.targetDraw,r]));

  for(const current of sourceRecords){
    const id=`fp:${h}:${current.targetDraw}`;
    const old=byId.get(id);

    // Уже зафиксированный прогноз НЕ пересчитываем.
    if(old&&old.logic&&old.antilogic){
      byId.set(id,enrichTargetMeta(old,history));
      continue;
    }

    const meta=current.actual
      ?{date:current.actual.date,time:current.actual.time}
      :inferTargetMeta(history,current.targetDraw);

    const rec=calculate(sourceRecords,current,meta);
    if(rec){
      byId.set(id,current.actual?settle(rec,current.actual):rec);
    }
  }

  // Закрываем зависшие pending, но прогнозные числа не меняем.
  for(const [id,record0] of byId){
    let record=enrichTargetMeta(record0,history);

    if(record?.status==='checked'&&record?.actual?.balls?.length===20){
      byId.set(id,record);
      continue;
    }

    const source=sourceByTarget.get(num(record.targetDraw));
    if(source?.actual?.balls?.length===20){
      record=settle(record,source.actual);
    }
    byId.set(id,record);
  }

  const nextRecords=[...byId.values()]
    .sort((a,b)=>num(a.targetDraw)-num(b.targetDraw))
    .slice(-300);

  const latestHistoryDraw=num(sourceRaw?.latestHistoryDraw)||num(history.at(-1)?.draw);

  const comparableBefore={
    version:String(original?.version||''),
    appVersion:String(original?.appVersion||''),
    latestHistoryDraw:num(original?.latestHistoryDraw),
    records:Array.isArray(original?.records)?original.records:[]
  };

  const comparableAfter={
    version:'2.1-server',
    appVersion:'6.2.7',
    latestHistoryDraw,
    records:nextRecords
  };

  const changed=JSON.stringify(comparableBefore)!==JSON.stringify(comparableAfter);

  archive.records=nextRecords;
  archive.latestHistoryDraw=latestHistoryDraw;
  archive.recordsCount=nextRecords.length;
  archive.checkedCount=nextRecords.filter(r=>r.status==='checked'||r.actual).length;
  archive.pendingCount=nextRecords.filter(r=>r.status!=='checked'&&!r.actual).length;

  if(changed||!archive.updatedAt)archive.updatedAt=new Date().toISOString();

  const fullChanged=writeIfChanged(outputFile,archive);
  const live=createLiveArchive(archive);
  const liveChanged=writeIfChanged(LIVE_FILES[h],live);

  console.log(
    `${META[h].button}: ${archive.recordsCount} записей, `+
    `проверено ${archive.checkedCount}, ожидает ${archive.pendingCount}, `+
    `full=${fullChanged?'changed':'same'}, live=${liveChanged?'changed':'same'}`
  );
}

const history=normalizeHistory(readJson(HISTORY_FILE,[]));
if(!history.length)throw new Error('keno-history-v62.json: нет валидной истории');

for(const h of [1,2,3])updateHorizon(h,history);
