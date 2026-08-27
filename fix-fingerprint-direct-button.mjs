'use strict';

import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let s=await fs.readFile(FP,'utf8');

const start=s.indexOf("  function buildLayout(){");
const end=s.indexOf("\n  function start(){", start);
if(start<0 || end<0) throw new Error('buildLayout range not found');

const replacement = `  function buildLayout(){
    if($('fingerprintMainBtn') && $('fingerprintPanel')) return true;

    const search=document.querySelector('button[data-panel="searchPanel"]');
    const tools=search?.parentElement;
    const searchPanel=$('searchPanel');

    if(!search || !tools || !searchPanel) return false;

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
    if(!p){
      p=createPanel(tools);
    }

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

    const archive=document.querySelector('button[data-panel="archivePanel"]');
    if(archive && !archive.dataset.fpCloseBound){
      archive.dataset.fpCloseBound='1';
      archive.addEventListener('click',()=>{
        if(!p.hidden){
          p.hidden=true;
          btn.classList.remove('active');
          btn.setAttribute('aria-expanded','false');
        }
      });
    }

    return true;
  }`;

s=s.slice(0,start)+replacement+s.slice(end);
s=s.replace("const VERSION='2.1.7';","const VERSION='2.1.8';");
s=s.replace("const VERSION='2.1.6';","const VERSION='2.1.8';");

await fs.writeFile(FP,s,'utf8');

let html=await fs.readFile(INDEX,'utf8');
const hash=crypto.createHash('sha256').update(await fs.readFile(FP)).digest('hex').slice(0,12);
const re=/(<script src=["']\.\/fingerprint-v622\.js)(?:\?v=[^"']*)?(["']><\/script>)/;
if(!re.test(html)) throw new Error('fingerprint-v622.js script tag not found');
html=html.replace(re,`$1?v=${hash}$2`);
await fs.writeFile(INDEX,html,'utf8');

console.log(`PASS: direct FINGERPRINT button v2.1.8 ?v=${hash}`);
