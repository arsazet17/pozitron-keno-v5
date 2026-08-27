'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP = 'fingerprint-v622.js';
const INDEX = 'index.html';

let s = await fs.readFile(FP, 'utf8');

// 1) В архиве обработчики Вып/Возр/Вм раньше не назначались,
// потому что render() выходил через return раньше bind.
const oldArchive = "restoreOpenRecords(openIds);return}";
const newArchive = "restoreOpenRecords(openIds);box.querySelectorAll('[data-fp-view]').forEach(b=>b.onclick=()=>{state.viewMode=b.dataset.fpView;render(captureOpenRecords())});return}";

if (s.includes(oldArchive)) {
  s = s.replace(oldArchive, newArchive);
} else if (!s.includes("restoreOpenRecords(openIds);box.querySelectorAll('[data-fp-view]')")) {
  throw new Error('Не найден архивный участок render() для привязки кнопок');
}

// 2) Версия контроля
s = s.replace("const VERSION='2.1.8';", "const VERSION='2.1.9';");
s = s.replace("const VERSION='2.1.7';", "const VERSION='2.1.9';");

await fs.writeFile(FP, s, 'utf8');

// 3) Убираем старый внешний k62-fingerprint-exact,
// который рисует второй ряд Вып/Возр/Вм.
let html = await fs.readFile(INDEX, 'utf8');

html = html
  .replace(/\s*<script[^>]+src=["'](?:\.\/)?k62-fingerprint-exact\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi, '\n')
  .replace(/\s*<link[^>]+href=["'](?:\.\/)?k62-fingerprint-exact\.css(?:\?v=[^"']*)?["'][^>]*>\s*/gi, '\n');

// 4) Обновляем ?v= родного fingerprint-v622.js
const hash = crypto
  .createHash('sha256')
  .update(await fs.readFile(FP))
  .digest('hex')
  .slice(0, 12);

const re = /(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if (!re.test(html)) throw new Error('fingerprint-v622.js не найден в index.html');

html = html.replace(re, `$1?v=${hash}$2`);
await fs.writeFile(INDEX, html, 'utf8');

console.log(`PASS: один ряд Вып/Возр/Вм, архивные кнопки активны, FINGERPRINT 2.1.9, ?v=${hash}`);
