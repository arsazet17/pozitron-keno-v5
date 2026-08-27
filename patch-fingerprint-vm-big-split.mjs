'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let s=await fs.readFile(FP,'utf8');

s=s.replace("const VERSION='2.2.2';","const VERSION='2.2.5';");

const fnStart=s.indexOf("  function fpArchiveOverlay(record,block,isAnti,mode){");
const fnEnd=s.indexOf("\n  function sectionHtml(record)",fnStart);
if(fnStart<0||fnEnd<0) throw new Error('fpArchiveOverlay не найден');

const newFn = `  function fpArchiveOverlay(record,block,isAnti,mode){const actual=record.actual;if(!actual?.balls?.length)return'';const predicted=new Set((isAnti?block.candidates:block.pool20||[]).map(Number));const falling=actual.balls.map(Number);const ascending=[...falling].sort((a,b)=>a-b);if(mode==='both'){return falling.map((n,i)=>{const pair=ascending[i];const hit=predicted.has(Number(n));return\`<span class="fp-num fp-archive-num fp-vm-split \${isAnti?'anti':''}"><span class="fp-vm-half fp-vm-left \${hit?'hit-half':''}"><b>\${pad(n)}</b>\${hit?'<i>✓</i>':''}</span><span class="fp-vm-half fp-vm-right"><b>\${pad(pair)}</b></span></span>\`}).join('')}const ordered=fpArchiveOrder(actual,mode);return ordered.map(n=>{const hit=predicted.has(Number(n));return\`<span class="fp-num fp-archive-num \${isAnti?'anti':''} \${hit?'hit':''}"><b>\${pad(n)}\${hit?' ✓':''}</b></span>\`}).join('')}`;

s=s.slice(0,fnStart)+newFn+s.slice(fnEnd);

// Удаляем старые стили пары, если они есть.
s=s
 .replace(/\.fp-pair-num b\{[^}]*\}/g,'')
 .replace(/\.fp-pair\{[^}]*\}/g,'')
 .replace(/\.fp-vm-split\{[^}]*\}/g,'')
 .replace(/\.fp-vm-half\{[^}]*\}/g,'')
 .replace(/\.fp-vm-left\{[^}]*\}/g,'')
 .replace(/\.fp-vm-right\{[^}]*\}/g,'')
 .replace(/\.fp-vm-left\.hit-half\{[^}]*\}/g,'')
 .replace(/\.fp-vm-left i\{[^}]*\}/g,'');

// Сохраняем большие клетки и делим только Вм.
const anchor=".fp-archive-num{display:flex!important;min-height:52px;flex-direction:column;align-items:center;justify-content:center;gap:2px}";
if(!s.includes(anchor)) throw new Error('Базовый стиль большой архивной клетки не найден');

const vmCss =
  ".fp-vm-split{display:grid!important;grid-template-columns:1fr 1fr!important;min-height:52px!important;padding:0!important;overflow:hidden;align-items:stretch!important}" +
  ".fp-vm-half{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:7px;min-width:0;font-weight:900;line-height:1}" +
  ".fp-vm-half b{font-size:inherit;line-height:1}" +
  ".fp-vm-left{border-right:1px solid #304b6d}" +
  ".fp-vm-right{color:var(--muted)}" +
  ".fp-vm-left.hit-half{background:#123a28;color:#c9ffda}" +
  ".fp-vm-left i{font-style:normal;font-size:12px;line-height:1;margin-top:5px;color:#c9ffda}" +
  ".anti-section .fp-vm-left{border-right-color:#6d541c}" +
  ".anti-section .fp-vm-right{color:#ffd37b}";

s=s.replace(anchor,anchor+vmCss);

await fs.writeFile(FP,s,'utf8');

let html=await fs.readFile(INDEX,'utf8');
const hash=crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);

const re=/(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if(!re.test(html)) throw new Error('fingerprint-v622.js не найден в index.html');

html=html.replace(re,`$1?v=${hash}$2`);
await fs.writeFile(INDEX,html,'utf8');

console.log(`PASS: FINGERPRINT 2.2.5 big cells split only in VM, ?v=${hash}`);
