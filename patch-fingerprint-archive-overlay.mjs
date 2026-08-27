'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let s=await fs.readFile(FP,'utf8');

s=s.replace("const VERSION='2.2.0';","const VERSION='2.2.1';");

const helperStart=s.indexOf("  function fpModeFor(record)");
const sectionStart=s.indexOf("  function sectionHtml(record)",helperStart);
if(helperStart<0||sectionStart<0) throw new Error('Не найден блок режимов FINGERPRINT');

const helpers=`  function fpModeFor(record){return state.viewModes?.[record.id]||'asc'}
  function fpViewButtons(record,actual,mode){const disabled=!Array.isArray(actual?.balls)||actual.balls.length!==20;return \`<div class="fp-view-modes"><button class="fp-view-btn \${mode==='fall'?'active':''}" data-fp-record="\${record.id}" data-fp-view="fall" \${disabled?'disabled':''}>Вып</button><button class="fp-view-btn \${mode==='asc'?'active':''}" data-fp-record="\${record.id}" data-fp-view="asc" \${disabled?'disabled':''}>Возр</button><button class="fp-view-btn \${mode==='both'?'active':''}" data-fp-record="\${record.id}" data-fp-view="both" \${disabled?'disabled':''}>Вм</button></div>\`}
  function fpArchiveOrder(actual,mode){const raw=[...(actual?.balls||[])].map(Number);if(mode==='asc')return raw.slice().sort((a,b)=>a-b);return raw}
  function fpArchiveOverlay(record,block,isAnti,mode){const actual=record.actual;if(!actual?.balls?.length)return'';const predicted=new Set((isAnti?block.candidates:block.pool20||[]).map(Number));const falling=actual.balls.map(Number);const ascending=[...falling].sort((a,b)=>a-b);const ordered=fpArchiveOrder(actual,mode);return ordered.map(n=>{const hit=predicted.has(Number(n));const fallPos=falling.indexOf(Number(n))+1;const ascPos=ascending.indexOf(Number(n))+1;const both=mode==='both'? \`<small>В\${fallPos} ↔ ↑\${ascPos}</small>\` : '';return\`<span class="fp-num fp-archive-num \${isAnti?'anti':''} \${hit?'hit':''}"><b>\${pad(n)}\${hit?' ✓':''}</b>\${both}</span>\`}).join('')}
`;

s=s.slice(0,helperStart)+helpers+s.slice(sectionStart);

const sectionEnd=s.indexOf("\n  function forecastHtml(",sectionStart);
if(sectionEnd<0) throw new Error('Не найден конец sectionHtml');

const section=`  function sectionHtml(record){const actual=record.actual,isAnti=state.mode==='antilogic',block=isAnti?record.antilogic:record.logic,numbers=(isAnti?block.candidates:block.pool20)||[],viewMode=fpModeFor(record),hits=actual?hitSet(numbers,actual):null;const hitCount=hits?hits.size:0,poolPayout=actual?payoutFor(hitCount,hitCount):0;const groups=[3,4,5].map(size=>\`<div class="fp-label">К\${size}</div>\${(block.combos||[]).filter(c=>num(c.size)===size).map(c=>comboHtml(c,actual,isAnti)).join('')}\`).join('');const listTitle=isAnti?'Кандидаты вне POOL-20':'POOL-20';const neighbors=block.neighbors||[];const totalPayout=(block.combos||[]).reduce((sum,c)=>sum+(actual?payoutFor(c.size,hitSet(c.numbers,actual).size):0),0);const archive=actual?\`<div class="fp-label">Архив тиража · наложение \${listTitle}</div>\${fpViewButtons(record,actual,viewMode)}<div class="fp-numbers fp-main-pool fp-archive-overlay">\${fpArchiveOverlay(record,block,isAnti,viewMode)}</div>\`:\`<div class="fp-label">\${listTitle}</div><div class="fp-numbers fp-main-pool">\${chips(numbers,null,isAnti)}</div>\`;return\`<div class="fp-section \${isAnti?'anti-section':'logic-section'}"><div class="fp-mode-title">\${isAnti?'⚡ ANTILOGIC · вне POOL-20':'🟢 LOGIC · из POOL-20'}</div><div class="fp-target">Комбинации на тираж №\${record.targetDraw}</div>\${archive}\${actual&&poolPayout>0?\`<div class="fp-pool-prize \${isAnti?'anti-pool-prize':''}">👀👀 \${rubles(poolPayout)}</div>\`:''}\${groups}\${actual&&totalPayout>0?\`<div class="fp-total \${isAnti?'anti-total':''}">Суммарная выплата: \${rubles(totalPayout)}</div>\`:''}<details class="fp-nei"><summary>\${isAnti?'5 аналогов второго кольца':'5 ближайших исторических аналогов'}</summary>\${neighbors.map((x,i)=>\`<div>\${i+1}. №\${x.targetDraw} · дистанция \${num(x.distance).toFixed(4)}</div>\`).join('')}</details></div>\`}`;

s=s.slice(0,sectionStart)+section+s.slice(sectionEnd);

// Add overlay cell styling into the existing dynamic CSS.
if(!s.includes('.fp-archive-num small')){
  s=s.replace(
    ".fp-main-pool .fp-num{width:100%;min-width:0}",
    ".fp-main-pool .fp-num{width:100%;min-width:0}.fp-archive-num{display:flex!important;min-height:52px;flex-direction:column;align-items:center;justify-content:center;gap:2px}.fp-archive-num small{font-size:9px;line-height:1;color:var(--muted);font-weight:800}.fp-archive-overlay .fp-num.hit{box-shadow:inset 0 0 0 1px #43d77b}"
  );
}

await fs.writeFile(FP,s,'utf8');

let html=await fs.readFile(INDEX,'utf8');
const hash=crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);
const re=/(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if(!re.test(html)) throw new Error('fingerprint-v622.js не найден в index.html');
html=html.replace(re,`$1?v=${hash}$2`);
await fs.writeFile(INDEX,html,'utf8');

console.log(`PASS: FINGERPRINT 2.2.1 archive overlay on actual draw; ?v=${hash}`);
