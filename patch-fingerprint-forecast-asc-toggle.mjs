'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let s=await fs.readFile(FP,'utf8');

// Поднимаем версию независимо от того, применился ли предыдущий фикс 2.2.6.
s=s.replace(/const VERSION='2\.2\.\d+';/,"const VERSION='2.2.7';");

// Добавляем отдельное состояние для сортировки ПРОГНОЗА.
s=s.replace(
  "const state={horizon:1,archive:false,mode:'logic',viewModes:{},data:",
  "const state={horizon:1,archive:false,mode:'logic',viewModes:{},forecastViews:{},data:"
);

const sectionStart=s.indexOf("  function sectionHtml(record){");
if(sectionStart<0) throw new Error('sectionHtml не найден');

// Вставляем helpers перед sectionHtml, если их ещё нет.
if(!s.includes("function fpForecastKey(")){
  const helpers = `  function fpForecastKey(record,isAnti){return \`\${record.id}:\${isAnti?'anti':'logic'}\`}
  function fpForecastMode(record,isAnti){return state.forecastViews?.[fpForecastKey(record,isAnti)]||'original'}
  function fpForecastButton(record,isAnti,mode){return \`<button type="button" class="fp-forecast-asc-btn \${mode==='asc'?'active':''}" data-fp-forecast-key="\${fpForecastKey(record,isAnti)}">Воз</button>\`}
  function fpForecastCells(numbers,isAnti,mode){const original=[...(numbers||[])].map(Number),ascending=[...original].sort((a,b)=>a-b),shown=mode==='asc'?ascending:original;return shown.map((n,i)=>{const stable=mode==='original'&&original[i]===ascending[i];return\`<span class="fp-num fp-forecast-num \${isAnti?'anti':''} \${stable?'fp-stable-pos':''}">\${pad(n)}</span>\`}).join('')}
`;
  s=s.slice(0,sectionStart)+helpers+s.slice(sectionStart);
}

// Полностью меняем sectionHtml так, чтобы:
// - если actual есть -> архив как раньше;
// - если actual НЕТ -> прогноз получает кнопку Воз;
// - LOGIC/ANTILOGIC используют одинаковую механику.
const start=s.indexOf("  function sectionHtml(record){");
const end=s.indexOf("\n  function forecastHtml(",start);
if(start<0||end<0) throw new Error('Границы sectionHtml не найдены');

const section = `  function sectionHtml(record){const actual=record.actual,isAnti=state.mode==='antilogic',block=isAnti?record.antilogic:record.logic,numbers=(isAnti?block.candidates:block.pool20)||[],viewMode=fpModeFor(record),hits=actual?hitSet(numbers,actual):null;const hitCount=hits?hits.size:0,poolPayout=actual?payoutFor(hitCount,hitCount):0;const groups=[3,4,5].map(size=>\`<div class="fp-label">К\${size}</div>\${(block.combos||[]).filter(c=>num(c.size)===size).map(c=>comboHtml(c,actual,isAnti)).join('')}\`).join('');const listTitle=isAnti?'Кандидаты вне POOL-20':'POOL-20';const neighbors=block.neighbors||[];const totalPayout=(block.combos||[]).reduce((sum,c)=>sum+(actual?payoutFor(c.size,hitSet(c.numbers,actual).size):0),0);let main;if(actual){main=\`<div class="fp-label">Архив тиража · наложение \${listTitle}</div>\${fpViewButtons(record,actual,viewMode)}<div class="fp-numbers fp-main-pool fp-archive-overlay">\${fpArchiveOverlay(record,block,isAnti,viewMode)}</div>\`}else{const fmode=fpForecastMode(record,isAnti);main=\`<div class="fp-label fp-forecast-label"><span>\${listTitle}</span>\${fpForecastButton(record,isAnti,fmode)}</div><div class="fp-numbers fp-main-pool fp-forecast-pool">\${fpForecastCells(numbers,isAnti,fmode)}</div>\`}return\`<div class="fp-section \${isAnti?'anti-section':'logic-section'}"><div class="fp-mode-title">\${isAnti?'⚡ ANTILOGIC · вне POOL-20':'🟢 LOGIC · из POOL-20'}</div><div class="fp-target">Комбинации на тираж №\${record.targetDraw}</div>\${main}\${actual&&poolPayout>0?\`<div class="fp-pool-prize \${isAnti?'anti-pool-prize':''}">👀👀 \${rubles(poolPayout)}</div>\`:''}\${groups}\${actual&&totalPayout>0?\`<div class="fp-total \${isAnti?'anti-total':''}">Суммарная выплата: \${rubles(totalPayout)}</div>\`:''}<details class="fp-nei"><summary>\${isAnti?'5 аналогов второго кольца':'5 ближайших исторических аналогов'}</summary>\${neighbors.map((x,i)=>\`<div>\${i+1}. №\${x.targetDraw} · дистанция \${num(x.distance).toFixed(4)}</div>\`).join('')}</details></div>\`}`;

s=s.slice(0,start)+section+s.slice(end);

// Добавляем bind для кнопки Воз в прогнозе.
if(!s.includes("function bindFpForecastButtons(")){
  const bindAnchor="  function bindFpViewButtons(box)";
  const pos=s.indexOf(bindAnchor);
  if(pos<0) throw new Error('bindFpViewButtons не найден');
  const helper=`  function bindFpForecastButtons(box){box.querySelectorAll('[data-fp-forecast-key]').forEach(b=>b.onclick=()=>{const key=b.dataset.fpForecastKey;state.forecastViews[key]=state.forecastViews[key]==='asc'?'original':'asc';render(captureOpenRecords())})}
`;
  s=s.slice(0,pos)+helper+s.slice(pos);
}

// В render() после каждого bindFpViewButtons(box) добавляем bind прогноза.
s=s.replaceAll("bindFpViewButtons(box);return","bindFpViewButtons(box);bindFpForecastButtons(box);return");
s=s.replaceAll("bindFpViewButtons(box)}","bindFpViewButtons(box);bindFpForecastButtons(box)}");

// Добавляем CSS.
if(!s.includes(".fp-forecast-asc-btn{")){
  const cssAnchor=".fp-label{font-weight:950;margin:11px 0 5px}";
  if(!s.includes(cssAnchor)) throw new Error('CSS anchor fp-label не найден');
  const css = cssAnchor +
    ".fp-forecast-label{display:flex;align-items:center;justify-content:space-between;gap:8px}" +
    ".fp-forecast-asc-btn{border:1px solid #304b6d;background:#172a43;color:var(--text);border-radius:8px;padding:6px 14px;font-weight:950}" +
    ".fp-forecast-asc-btn.active{background:#254b78;border-color:#5b8fc9}" +
    ".anti-section .fp-forecast-asc-btn.active{background:#332812;border-color:#f0a63b;color:#ffd37b}" +
    ".fp-forecast-num.fp-stable-pos{box-shadow:inset 0 0 0 2px #4ade80;border-color:#4ade80}" +
    ".anti-section .fp-forecast-num.fp-stable-pos{box-shadow:inset 0 0 0 2px #f0a63b;border-color:#f0a63b}";
  s=s.replace(cssAnchor,css);
}

await fs.writeFile(FP,s,'utf8');

// Обновляем ?v=.
let html=await fs.readFile(INDEX,'utf8');
const hash=crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);
const re=/(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if(!re.test(html)) throw new Error('fingerprint-v622.js не найден в index.html');
html=html.replace(re,`$1?v=${hash}$2`);
await fs.writeFile(INDEX,html,'utf8');

console.log(`PASS: FINGERPRINT 2.2.7 forecast Воз toggle for LOGIC + ANTILOGIC; ?v=${hash}`);
