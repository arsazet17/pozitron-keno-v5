import fs from 'node:fs';

const FP='fingerprint-v622.js';
const INDEX='index.html';

let fp=fs.readFileSync(FP,'utf8');
if(!fp.includes('.filter(Bolean)')){
  console.log('Bolean typo not found; file may already be fixed.');
}else{
  fp=fp.replaceAll('.filter(Bolean)', '.filter(Boolean)');
  fs.writeFileSync(FP,fp,'utf8');
  console.log('Fixed fingerprint-v622.js: Bolean -> Boolean');
}

let html=fs.readFileSync(INDEX,'utf8');
const stamp=String(Date.now());
html=html.replace(
  /(fingerprint-v622\.js)(?:\?v=[^"'<>]*)?/g,
  `$1?v=${stamp}`
);
fs.writeFileSync(INDEX,html,'utf8');
console.log('Bumped fingerprint-v622.js ?v= in index.html to '+stamp);
