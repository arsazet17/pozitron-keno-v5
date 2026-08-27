'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let s=await fs.readFile(FP,'utf8');

s=s.replace("const VERSION='2.2.1';","const VERSION='2.2.2';");

const oldFn = `  function fpArchiveOverlay(record,block,isAnti,mode){const actual=record.actual;if(!actual?.balls?.length)return'';const predicted=new Set((isAnti?block.candidates:block.pool20||[]).map(Number));const falling=actual.balls.map(Number);const ascending=[...falling].sort((a,b)=>a-b);const ordered=fpArchiveOrder(actual,mode);return ordered.map(n=>{const hit=predicted.has(Number(n));const fallPos=falling.indexOf(Number(n))+1;const ascPos=ascending.indexOf(Number(n))+1;const both=mode==='both'? \`<small>В\${fallPos} ↔ ↑\${ascPos}</small>\` : '';return\`<span class="fp-num fp-archive-num \${isAnti?'anti':''} \${hit?'hit':''}"><b>\${pad(n)}\${hit?' ✓':''}</b>\${both}</span>\`}).join('')}`;

const newFn = `  function fpArchiveOverlay(record,block,isAnti,mode){const actual=record.actual;if(!actual?.balls?.length)return'';const predicted=new Set((isAnti?block.candidates:block.pool20||[]).map(Number));const falling=actual.balls.map(Number);const ascending=[...falling].sort((a,b)=>a-b);if(mode==='both'){return falling.map((n,i)=>{const pair=ascending[i];const hit=predicted.has(Number(n));return\`<span class="fp-num fp-archive-num fp-pair-num \${isAnti?'anti':''} \${hit?'hit':''}"><b>\${pad(n)}<span class="fp-pair">(\${pad(pair)})</span>\${hit?' ✓':''}</b></span>\`}).join('')}const ordered=fpArchiveOrder(actual,mode);return ordered.map(n=>{const hit=predicted.has(Number(n));return\`<span class="fp-num fp-archive-num \${isAnti?'anti':''} \${hit?'hit':''}"><b>\${pad(n)}\${hit?' ✓':''}</b></span>\`}).join('')}`;

if(!s.includes(oldFn)){
  throw new Error('Текущая fpArchiveOverlay не найдена — версия файла отличается');
}
s=s.replace(oldFn,newFn);

if(!s.includes('.fp-pair{')){
  s=s.replace(
    ".fp-archive-num small{font-size:9px;line-height:1;color:var(--muted);font-weight:800}",
    ".fp-archive-num small{font-size:9px;line-height:1;color:var(--muted);font-weight:800}.fp-pair-num b{white-space:nowrap}.fp-pair{font-weight:800;color:var(--muted);margin-left:1px}"
  );
}

await fs.writeFile(FP,s,'utf8');

let html=await fs.readFile(INDEX,'utf8');
const hash=crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);

const re=/(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if(!re.test(html)) throw new Error('fingerprint-v622.js не найден в index.html');

html=html.replace(re,`$1?v=${hash}$2`);
await fs.writeFile(INDEX,html,'utf8');

console.log(`PASS: FINGERPRINT 2.2.2 Вм = Вып(Возр), ?v=${hash}`);
