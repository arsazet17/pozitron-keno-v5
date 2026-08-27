'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP = 'fingerprint-v622.js';
const INDEX = 'index.html';

let s = await fs.readFile(FP, 'utf8');

function mustReplace(oldText, newText, label) {
  if (!s.includes(oldText)) {
    throw new Error(`Не найден фрагмент для замены: ${label}`);
  }
  s = s.replace(oldText, newText);
}

// Версия
if (s.includes("const VERSION='2.1.3';")) {
  s = s.replace("const VERSION='2.1.3';", "const VERSION='2.1.4';");
}

// Добавляем режим отображения
if (s.includes("const state={horizon:1,archive:false,mode:'logic',data:{1:null,2:null,3:null},syncing:false,lastSync:0,error:''};")) {
  s = s.replace(
    "const state={horizon:1,archive:false,mode:'logic',data:{1:null,2:null,3:null},syncing:false,lastSync:0,error:''};",
    "const state={horizon:1,archive:false,mode:'logic',viewMode:'asc',data:{1:null,2:null,3:null},syncing:false,lastSync:0,error:''};"
  );
}

// Вставляем native helpers
if (!s.includes('function fpViewNumbers(')) {
  const anchor = "  function sectionHtml(record){";
  if (!s.includes(anchor)) throw new Error('sectionHtml не найден');

  const helpers = `  function fpViewNumbers(numbers){const raw=[...(numbers||[])].map(Number);if(state.viewMode==='fall')return raw;return raw.slice().sort((a,b)=>a-b)}
  function fpViewButtons(){return \`<div class="fp-view-modes"><button class="fp-view-btn \${state.viewMode==='fall'?'active':''}" data-fp-view="fall">Вып</button><button class="fp-view-btn \${state.viewMode==='asc'?'active':''}" data-fp-view="asc">Возр</button><button class="fp-view-btn \${state.viewMode==='both'?'active':''}" data-fp-view="both">Вм</button></div>\`}
`;

  s = s.replace(anchor, helpers + anchor);
}

// Переписываем sectionHtml напрямую.
// Берём всё между sectionHtml и forecastHtml.
{
  const start = s.indexOf('  function sectionHtml(record){');
  const end = s.indexOf('\n  function forecastHtml(', start);

  if (start < 0 || end < 0) throw new Error('Не удалось определить sectionHtml');

  const replacement = `  function sectionHtml(record){const actual=record.actual,isAnti=state.mode==='antilogic',block=isAnti?record.antilogic:record.logic,numbers=(isAnti?block.candidates:block.pool20)||[],displayNumbers=fpViewNumbers(numbers),hits=actual?hitSet(displayNumbers,actual):null;const hitCount=hits?hits.size:0,poolPayout=actual?payoutFor(hitCount,hitCount):0;const groups=[3,4,5].map(size=>\`<div class="fp-label">К\${size}</div>\${(block.combos||[]).filter(c=>num(c.size)===size).map(c=>comboHtml(c,actual,isAnti)).join('')}\`).join('');const listTitle=isAnti?'Кандидаты вне POOL-20':'POOL-20';const neighbors=block.neighbors||[];const totalPayout=(block.combos||[]).reduce((sum,c)=>sum+(actual?payoutFor(c.size,hitSet(c.numbers,actual).size):0),0);return\`<div class="fp-section \${isAnti?'anti-section':'logic-section'}"><div class="fp-mode-title">\${isAnti?'⚡ ANTILOGIC · вне POOL-20':'🟢 LOGIC · из POOL-20'}</div><div class="fp-target">Комбинации на тираж №\${record.targetDraw}</div><div class="fp-label">\${listTitle}</div>\${fpViewButtons()}<div class="fp-numbers fp-main-pool">\${chips(displayNumbers,hits,isAnti)}</div>\${actual&&poolPayout>0?\`<div class="fp-pool-prize \${isAnti?'anti-pool-prize':''}">👀👀 \${rubles(poolPayout)}</div>\`:''}\${groups}\${actual&&totalPayout>0?\`<div class="fp-total \${isAnti?'anti-total':''}">Суммарная выплата: \${rubles(totalPayout)}</div>\`:''}<details class="fp-nei"><summary>\${isAnti?'5 аналогов второго кольца':'5 ближайших исторических аналогов'}</summary>\${neighbors.map((x,i)=>\`<div>\${i+1}. №\${x.targetDraw} · дистанция \${num(x.distance).toFixed(4)}</div>\`).join('')}</details></div>\`}`;

  s = s.slice(0, start) + replacement + s.slice(end);
}

// Добавляем обработчики Вып/Возр/Вм внутрь render().
if (!s.includes("state.viewMode=b.dataset.fpView")) {
  const target = "const latest=records.slice().reverse().find(r=>!r.actual)||records.at(-1);box.innerHTML=latest?forecastHtml(latest,true):'<div class=\"fp-msg\">Сервер ещё не сформировал первый прогноз.</div>'}";
  if (!s.includes(target)) throw new Error('Конец render() не найден');

  s = s.replace(
    target,
    target + ";box.querySelectorAll('[data-fp-view]').forEach(b=>b.onclick=()=>{state.viewMode=b.dataset.fpView;render(captureOpenRecords())})"
  );
}

// Основной POOL-20 теперь строго 5 колонок.
// К3/К4/К5 остаются flex как раньше.
if (!s.includes('.fp-main-pool{display:grid!important')) {
  const oldCss = ".fp-numbers{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}";
  if (!s.includes(oldCss)) throw new Error('CSS .fp-numbers не найден');

  const newCss = oldCss +
    ".fp-main-pool{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:5px!important;width:100%}" +
    ".fp-main-pool .fp-num{width:100%;min-width:0}" +
    ".fp-view-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:6px 0}" +
    ".fp-view-btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:8px;padding:7px 3px;font-weight:900}" +
    ".fp-view-btn.active{background:#254b78;border-color:#5b8fc9}" +
    ".anti-section .fp-view-btn.active{border-color:#f0a63b;background:#332812;color:#ffd37b}";

  s = s.replace(oldCss, newCss);
}

await fs.writeFile(FP, s, 'utf8');

// Меняем ?v= самого fingerprint-v622.js
let html = await fs.readFile(INDEX, 'utf8');
const hash = crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);

const re = /(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if (!re.test(html)) throw new Error('Подключение fingerprint-v622.js в index.html не найдено');

html = html.replace(re, `$1?v=${hash}$2`);
await fs.writeFile(INDEX, html, 'utf8');

console.log(`PASS: FINGERPRINT native 2.1.4, 4x5, Вып/Возр/Вм, ?v=${hash}`);
