'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP = 'fingerprint-v622.js';
const INDEX = 'index.html';

let s = await fs.readFile(FP, 'utf8');

const broken = `const latest=records.slice().reverse().find(r=>!r.actual)||records.at(-1);box.innerHTML=latest?forecastHtml(latest,true):'<div class="fp-msg">Сервер ещё не сформировал первый прогноз.</div>'};box.querySelectorAll('[data-fp-view]').forEach(b=>b.onclick=()=>{state.viewMode=b.dataset.fpView;render(captureOpenRecords())})`;

const fixed = `const latest=records.slice().reverse().find(r=>!r.actual)||records.at(-1);box.innerHTML=latest?forecastHtml(latest,true):'<div class="fp-msg">Сервер ещё не сформировал первый прогноз.</div>';box.querySelectorAll('[data-fp-view]').forEach(b=>b.onclick=()=>{state.viewMode=b.dataset.fpView;render(captureOpenRecords())})}`;

if (s.includes(broken)) {
  s = s.replace(broken, fixed);
} else if (!s.includes("box.querySelectorAll('[data-fp-view]')")) {
  throw new Error('Не найден обработчик data-fp-view');
}

// Поднимаем версию только для контроля.
s = s.replace("const VERSION='2.1.5';", "const VERSION='2.1.6';");

await fs.writeFile(FP, s, 'utf8');

// Меняем ?v= fingerprint-v622.js в index.html.
let html = await fs.readFile(INDEX, 'utf8');
const hash = crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);

const re = /(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if (!re.test(html)) throw new Error('fingerprint-v622.js не найден в index.html');

html = html.replace(re, `$1?v=${hash}$2`);
await fs.writeFile(INDEX, html, 'utf8');

console.log(`PASS: FINGERPRINT button restored, VERSION 2.1.6, ?v=${hash}`);
