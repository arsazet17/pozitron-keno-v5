'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let s=await fs.readFile(FP,'utf8');

const oldStart = `  function start(){styles();[1,2,3].forEach(h=>state.data[h]=readCache(h));let tries=0;const t=setInterval(()=>{tries++;if(buildLayout()||tries>=40){clearInterval(t);if($('fpMainToolsLayout')){sync(true);setInterval(()=>sync(false),60000)}}},50)}`;

const newStart = `  function start(){styles();[1,2,3].forEach(h=>state.data[h]=readCache(h));let started=false,timer=null;const tryBuild=()=>{if(started)return;if(buildLayout()){started=true;if(timer)clearInterval(timer);sync(true);setInterval(()=>sync(false),60000)}};tryBuild();timer=setInterval(tryBuild,250);const mo=new MutationObserver(()=>tryBuild());mo.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{if(started)mo.disconnect()},10000)}`;

if (!s.includes(oldStart)) {
  throw new Error('Текущая функция start() не найдена — файл отличается от ожидаемого');
}

s=s.replace(oldStart,newStart);
s=s.replace("const VERSION='2.1.6';","const VERSION='2.1.7';");

await fs.writeFile(FP,s,'utf8');

let html=await fs.readFile(INDEX,'utf8');
const hash=crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);
const re=/(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if(!re.test(html)) throw new Error('fingerprint-v622.js не подключён в index.html');
html=html.replace(re,`$1?v=${hash}$2`);
await fs.writeFile(INDEX,html,'utf8');

console.log(`PASS: FINGERPRINT 2.1.7 waits for tools until available; ?v=${hash}`);
