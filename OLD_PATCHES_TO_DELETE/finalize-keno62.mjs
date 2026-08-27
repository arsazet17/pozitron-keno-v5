'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let s=await fs.readFile(FP,'utf8');

// ---------- FINGERPRINT: one native implementation ----------
s=s.replace(/const VERSION='[^']+';/,"const VERSION='2.2.0';");
s=s.replace(
  /const state=\{horizon:1,archive:false,mode:'logic',viewMode:'asc',data:/,
  "const state={horizon:1,archive:false,mode:'logic',viewModes:{},data:"
);
s=s.replace(
  /const state=\{horizon:1,archive:false,mode:'logic',viewModes:\{\},data:/,
  "const state={horizon:1,archive:false,mode:'logic',viewModes:{},data:"
);

function replaceRange(startNeedle,endNeedle,replacement,label){
  const a=s.indexOf(startNeedle);
  const b=s.indexOf(endNeedle,a);
  if(a<0||b<0) throw new Error(`Не найден блок ${label}`);
  s=s.slice(0,a)+replacement+s.slice(b);
}

const helpers = `  function fpModeFor(record){return state.viewModes?.[record.id]||'asc'}
  function fpViewNumbers(numbers,actual,mode){const raw=[...(numbers||[])].map(Number),set=new Set(raw);if(mode==='asc')return raw.slice().sort((a,b)=>a-b);if((mode==='fall'||mode==='both')&&Array.isArray(actual?.balls)&&actual.balls.length){const ordered=actual.balls.map(Number).filter(n=>set.has(n));const missing=raw.filter(n=>!ordered.includes(n));return [...ordered,...missing]}return raw}
  function fpViewButtons(record,actual,mode){const disabled=!Array.isArray(actual?.balls)||!actual.balls.length;return \`<div class="fp-view-modes"><button class="fp-view-btn \${mode==='fall'?'active':''}" data-fp-record="\${record.id}" data-fp-view="fall" \${disabled?'disabled':''}>Вып</button><button class="fp-view-btn \${mode==='asc'?'active':''}" data-fp-record="\${record.id}" data-fp-view="asc">Возр</button><button class="fp-view-btn \${mode==='both'?'active':''}" data-fp-record="\${record.id}" data-fp-view="both" \${disabled?'disabled':''}>Вм</button></div>\`}
  function fpPoolChips(numbers,hits,anti,actual,mode){if(mode!=='both'||!Array.isArray(actual?.balls)||!actual.balls.length)return chips(numbers,hits,anti);const asc=[...actual.balls].map(Number).sort((a,b)=>a-b);return(numbers||[]).map(n=>{const pos=asc.indexOf(Number(n))+1;return\`<span class="fp-num fp-num-both \${anti?'anti':''} \${hits?.has(Number(n))?'hit':''}"><b>\${pad(n)}\${hits?.has(Number(n))?' ✓':''}</b><small>↑\${pos||'—'}</small></span>\`}).join('')}
`;

const helperStart = s.includes("  function fpModeFor(") ? "  function fpModeFor(" : "  function fpViewNumbers(";
replaceRange(helperStart,"  function sectionHtml(",helpers,"helpers");

const section = `  function sectionHtml(record){const actual=record.actual,isAnti=state.mode==='antilogic',block=isAnti?record.antilogic:record.logic,numbers=(isAnti?block.candidates:block.pool20)||[],viewMode=fpModeFor(record),displayNumbers=fpViewNumbers(numbers,actual,viewMode),hits=actual?hitSet(displayNumbers,actual):null;const hitCount=hits?hits.size:0,poolPayout=actual?payoutFor(hitCount,hitCount):0;const groups=[3,4,5].map(size=>\`<div class="fp-label">К\${size}</div>\${(block.combos||[]).filter(c=>num(c.size)===size).map(c=>comboHtml(c,actual,isAnti)).join('')}\`).join('');const listTitle=isAnti?'Кандидаты вне POOL-20':'POOL-20';const neighbors=block.neighbors||[];const totalPayout=(block.combos||[]).reduce((sum,c)=>sum+(actual?payoutFor(c.size,hitSet(c.numbers,actual).size):0),0);return\`<div class="fp-section \${isAnti?'anti-section':'logic-section'}"><div class="fp-mode-title">\${isAnti?'⚡ ANTILOGIC · вне POOL-20':'🟢 LOGIC · из POOL-20'}</div><div class="fp-target">Комбинации на тираж №\${record.targetDraw}</div><div class="fp-label">\${listTitle}</div>\${fpViewButtons(record,actual,viewMode)}<div class="fp-numbers fp-main-pool">\${fpPoolChips(displayNumbers,hits,isAnti,actual,viewMode)}</div>\${actual&&poolPayout>0?\`<div class="fp-pool-prize \${isAnti?'anti-pool-prize':''}">👀👀 \${rubles(poolPayout)}</div>\`:''}\${groups}\${actual&&totalPayout>0?\`<div class="fp-total \${isAnti?'anti-total':''}">Суммарная выплата: \${rubles(totalPayout)}</div>\`:''}<details class="fp-nei"><summary>\${isAnti?'5 аналогов второго кольца':'5 ближайших исторических аналогов'}</summary>\${neighbors.map((x,i)=>\`<div>\${i+1}. №\${x.targetDraw} · дистанция \${num(x.distance).toFixed(4)}</div>\`).join('')}</details></div>\`}`;
replaceRange("  function sectionHtml(record){","\n  function forecastHtml(",section,"sectionHtml");

const render = `  function bindFpViewButtons(box){box.querySelectorAll('[data-fp-view][data-fp-record]').forEach(b=>b.onclick=()=>{state.viewModes[b.dataset.fpRecord]=b.dataset.fpView;render(captureOpenRecords())})}
  function render(openIds=captureOpenRecords()){const box=$('fingerprintResult');if(!box)return;document.querySelectorAll('[data-fp-h]').forEach(b=>b.classList.toggle('active',!state.archive&&num(b.dataset.fpH)===state.horizon));$('fingerprintArchiveBtn')?.classList.toggle('active',state.archive);document.querySelectorAll('[data-fp-mode]').forEach(b=>b.classList.toggle('active',b.dataset.fpMode===state.mode));const payload=state.data[state.horizon]||readCache(state.horizon);if(!payload){box.innerHTML=\`<div class="fp-msg">\${state.error?\`Серверный архив временно недоступен: \${state.error}\`:'Загружаю общий серверный архив FINGERPRINT…'}</div>\`;return}const records=payload.records||[];if(state.archive){box.innerHTML=\`<div class="fp-archive-head">📚 Общий архив FINGERPRINT \${META[state.horizon].button}</div><div class="fp-note">LOGIC и ANTILOGIC хранятся раздельно внутри одной записи тиража.</div>\${records.length?records.slice().reverse().map(r=>forecastHtml(r,false)).join(''):'<div class="fp-msg">Серверный архив пока пуст.</div>'}\`;restoreOpenRecords(openIds);bindFpViewButtons(box);return}const latest=records.slice().reverse().find(r=>!r.actual)||records.at(-1);box.innerHTML=latest?forecastHtml(latest,true):'<div class="fp-msg">Сервер ещё не сформировал первый прогноз.</div>';bindFpViewButtons(box)}
`;
replaceRange("  function render(","  function styles()",render,"render");

// Make FINGERPRINT button independent from cluster buttons.
const buildStart=s.indexOf("  function buildLayout(){");
const buildEnd=s.indexOf("\n  function start(){",buildStart);
if(buildStart<0||buildEnd<0) throw new Error("Не найден buildLayout");

const build=`  function buildLayout(){
    if($('fingerprintMainBtn') && $('fingerprintPanel')) return true;
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
      tools.appendChild(btn);
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
        p.scrollIntoView({behavior:'smooth',block:'start'});
      }
    };
    return true;
  }`;
s=s.slice(0,buildStart)+build+s.slice(buildEnd);

// Unlimited reliable wait for UI.
const startPos=s.indexOf("  function start(){");
const tailPos=s.indexOf("\n  if(document.readyState",startPos);
if(startPos<0||tailPos<0) throw new Error("Не найден start()");
const start=`  function start(){styles();[1,2,3].forEach(h=>state.data[h]=readCache(h));let ready=false;const tryBuild=()=>{if(ready)return;if(buildLayout()){ready=true;sync(true);setInterval(()=>sync(false),60000)}};tryBuild();const timer=setInterval(()=>{tryBuild();if(ready)clearInterval(timer)},250);const mo=new MutationObserver(()=>{tryBuild();if(ready)mo.disconnect()});mo.observe(document.body,{childList:true,subtree:true})}`;
s=s.slice(0,startPos)+start+s.slice(tailPos);

await fs.writeFile(FP,s,'utf8');

// ---------- INDEX: remove all obsolete FINGERPRINT/UI overlays ----------
let html=await fs.readFile(INDEX,'utf8');

html=html
  .replace(/\s*<script[^>]+src=["'](?:\.\/)?k62-fingerprint-exact\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi,'\n')
  .replace(/\s*<link[^>]+href=["'](?:\.\/)?k62-fingerprint-exact\.css(?:\?v=[^"']*)?["'][^>]*>\s*/gi,'\n')
  .replace(/\s*<script[^>]+src=["'](?:\.\/)?k62-ui-patch\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi,'\n')
  .replace(/\s*<link[^>]+href=["'](?:\.\/)?k62-ui-patch\.css(?:\?v=[^"']*)?["'][^>]*>\s*/gi,'\n');

html=html.replace(/<\/head>/i,'<link rel="stylesheet" href="k62-ui-patch.css?v=final220">\\n</head>');
html=html.replace(/<\/body>/i,'<script src="k62-ui-patch.js?v=final220"></script>\\n</body>');
html=html.replace(
  /(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/,
  '$1?v=final220$2'
);

await fs.writeFile(INDEX,html,'utf8');

// ---------- CLEAN OUT OBSOLETE FILES ----------
const obsolete=[
  'k62-fingerprint-exact.js',
  'k62-fingerprint-exact.css',
  'install-k62-fingerprint-exact.mjs',
  'install-k62-ui-patch.mjs',
  'patch-fingerprint-native.mjs',
  'refresh-fingerprint-version.mjs',
  'patch-fingerprint-real-order.mjs',
  'fix-fingerprint-button.mjs',
  'fix-fingerprint-wait.mjs',
  'fix-fingerprint-direct-button.mjs',
  'fix-fingerprint-one-active-row.mjs',
  '.github/workflows/fingerprint-exact.yml',
  '.github/workflows/fingerprint-native.yml',
  '.github/workflows/fingerprint-real-order.yml',
  '.github/workflows/fix-fingerprint-button.yml',
  '.github/workflows/fix-fingerprint-wait.yml',
  '.github/workflows/fix-fingerprint-direct-button.yml',
  '.github/workflows/fix-fingerprint-one-active-row.yml'
];

for(const file of obsolete){
  try{await fs.rm(file,{force:true})}catch{}
}

console.log('PASS: KENO 6.2 final cleanup installed');
