'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP = 'fingerprint-v622.js';
const INDEX = 'index.html';

let s = await fs.readFile(FP, 'utf8');

// Поднимаем версию, если стоит наша предыдущая 2.1.4.
s = s.replace("const VERSION='2.1.4';", "const VERSION='2.1.5';");
s = s.replace("const VERSION='2.1.3';", "const VERSION='2.1.5';");

// Заменяем helper fpViewNumbers на правильный:
// Вып = порядок реального выпадения actual.balls для данного тиража.
// Возр = по числу.
// Вм = порядок выпадения; подпись второй строкой показывает место в возрастании.
const helperRe = /  function fpViewNumbers\(numbers\)\{[^\n]*\}\n  function fpViewButtons\(\)\{[^\n]*\}\n/;

const helperNew = `  function fpViewNumbers(numbers,actual){const raw=[...(numbers||[])].map(Number),set=new Set(raw);if(state.viewMode==='asc')return raw.slice().sort((a,b)=>a-b);if((state.viewMode==='fall'||state.viewMode==='both')&&Array.isArray(actual?.balls)&&actual.balls.length){const ordered=actual.balls.map(Number).filter(n=>set.has(n));const missing=raw.filter(n=>!ordered.includes(n));return [...ordered,...missing]}return raw}
  function fpViewButtons(actual){const disabled=!Array.isArray(actual?.balls)||!actual.balls.length;return \`<div class="fp-view-modes"><button class="fp-view-btn \${state.viewMode==='fall'?'active':''}" data-fp-view="fall" \${disabled?'disabled':''}>Вып</button><button class="fp-view-btn \${state.viewMode==='asc'?'active':''}" data-fp-view="asc">Возр</button><button class="fp-view-btn \${state.viewMode==='both'?'active':''}" data-fp-view="both" \${disabled?'disabled':''}>Вм</button></div>\`}
  function fpPoolChips(numbers,hits,anti,actual){if(state.viewMode!=='both'||!Array.isArray(actual?.balls)||!actual.balls.length)return chips(numbers,hits,anti);const asc=[...actual.balls].map(Number).sort((a,b)=>a-b);return(numbers||[]).map(n=>{const pos=asc.indexOf(Number(n))+1;return\`<span class="fp-num fp-num-both \${anti?'anti':''} \${hits?.has(Number(n))?'hit':''}"><b>\${pad(n)}\${hits?.has(Number(n))?' ✓':''}</b><small>↑\${pos||'—'}</small></span>\`}).join('')}
`;

if (helperRe.test(s)) {
  s = s.replace(helperRe, helperNew);
} else if (!s.includes('function fpPoolChips(')) {
  // If previous helper names differ, inject before sectionHtml.
  const anchor = "  function sectionHtml(record){";
  if (!s.includes(anchor)) throw new Error('sectionHtml not found');
  s = s.replace(anchor, helperNew + anchor);
}

// Replace sectionHtml so it passes actual draw to ordering and buttons.
const start = s.indexOf('  function sectionHtml(record){');
const end = s.indexOf('\n  function forecastHtml(', start);
if (start < 0 || end < 0) throw new Error('sectionHtml range not found');

const replacement = `  function sectionHtml(record){const actual=record.actual,isAnti=state.mode==='antilogic',block=isAnti?record.antilogic:record.logic,numbers=(isAnti?block.candidates:block.pool20)||[],displayNumbers=fpViewNumbers(numbers,actual),hits=actual?hitSet(displayNumbers,actual):null;const hitCount=hits?hits.size:0,poolPayout=actual?payoutFor(hitCount,hitCount):0;const groups=[3,4,5].map(size=>\`<div class="fp-label">К\${size}</div>\${(block.combos||[]).filter(c=>num(c.size)===size).map(c=>comboHtml(c,actual,isAnti)).join('')}\`).join('');const listTitle=isAnti?'Кандидаты вне POOL-20':'POOL-20';const neighbors=block.neighbors||[];const totalPayout=(block.combos||[]).reduce((sum,c)=>sum+(actual?payoutFor(c.size,hitSet(c.numbers,actual).size):0),0);return\`<div class="fp-section \${isAnti?'anti-section':'logic-section'}"><div class="fp-mode-title">\${isAnti?'⚡ ANTILOGIC · вне POOL-20':'🟢 LOGIC · из POOL-20'}</div><div class="fp-target">Комбинации на тираж №\${record.targetDraw}</div><div class="fp-label">\${listTitle}</div>\${fpViewButtons(actual)}<div class="fp-numbers fp-main-pool">\${fpPoolChips(displayNumbers,hits,isAnti,actual)}</div>\${actual&&poolPayout>0?\`<div class="fp-pool-prize \${isAnti?'anti-pool-prize':''}">👀👀 \${rubles(poolPayout)}</div>\`:''}\${groups}\${actual&&totalPayout>0?\`<div class="fp-total \${isAnti?'anti-total':''}">Суммарная выплата: \${rubles(totalPayout)}</div>\`:''}<details class="fp-nei"><summary>\${isAnti?'5 аналогов второго кольца':'5 ближайших исторических аналогов'}</summary>\${neighbors.map((x,i)=>\`<div>\${i+1}. №\${x.targetDraw} · дистанция \${num(x.distance).toFixed(4)}</div>\`).join('')}</details></div>\`}`;

s = s.slice(0, start) + replacement + s.slice(end);

// Add compact styling for "Вм".
if (!s.includes('.fp-num-both small')) {
  const cssAnchor = ".fp-main-pool .fp-num{width:100%;min-width:0}";
  if (s.includes(cssAnchor)) {
    s = s.replace(
      cssAnchor,
      cssAnchor + ".fp-num-both{display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:1px}.fp-num-both small{font-size:9px;line-height:1;color:var(--muted);font-weight:700}.fp-view-btn:disabled{opacity:.42}"
    );
  }
}

await fs.writeFile(FP, s, 'utf8');

// Update ?v= for the real fingerprint file.
let html = await fs.readFile(INDEX, 'utf8');
const hash = crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);

const re = /(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if (!re.test(html)) throw new Error('fingerprint-v622.js script tag not found');

html = html.replace(re, `$1?v=${hash}$2`);
await fs.writeFile(INDEX, html, 'utf8');

console.log(`PASS: FINGERPRINT 2.1.5 real draw order, ?v=${hash}`);
