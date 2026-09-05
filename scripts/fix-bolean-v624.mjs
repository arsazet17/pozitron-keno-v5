import fs from 'node:fs';

const FP='fingerprint-v622.js';

let fp=fs.readFileSync(FP,'utf8');
if(!fp.includes('.filter(Bolean)')){
  console.log('Bolean typo not found; file may already be fixed.');
}else{
  fp=fp.replaceAll('.filter(Bolean)', '.filter(Boolean)');
  fs.writeFileSync(FP,fp,'utf8');
  console.log('Fixed fingerprint-v622.js: Bolean -> Boolean');
}

console.log('Версия и cache-busting обновляются только через refresh-asset-versions.mjs');
