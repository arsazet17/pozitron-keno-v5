import fs from 'node:fs';
import crypto from 'node:crypto';

const assets=[
  'cluster-model-v622.js',
  'cluster-tracker-v622.js',
  'fingerprint-v622.js',
  'app-version-v622.js',
  'manifest.webmanifest'
];

let html=fs.readFileSync('index.html','utf8');
const buildParts=[];

for(const asset of assets){
  if(!fs.existsSync(asset))continue;

  const buf=fs.readFileSync(asset);
  const hash=crypto.createHash('sha256').update(buf).digest('hex').slice(0,12);
  buildParts.push(`${asset}:${hash}`);

  const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`(${escaped})(?:\\?v=[^"'<>\\s]+)?`,'g');
  html=html.replace(re,`$1?v=${hash}`);
}

const htmlHash=crypto.createHash('sha256').update(html).digest('hex').slice(0,12);
buildParts.push(`index.html:${htmlHash}`);
fs.writeFileSync('index.html',html);

const build=crypto
  .createHash('sha256')
  .update(buildParts.join('|'))
  .digest('hex')
  .slice(0,16);

let version={app:'KENO 6.2.2'};
try{
  version=JSON.parse(fs.readFileSync('version-v622.json','utf8'))
}catch{}

version.build=build;
version.updatedAt=new Date().toISOString();
version.sha=process.env.GITHUB_SHA||version.sha||'';

fs.writeFileSync('version-v622.json',JSON.stringify(version,null,2)+'\n');
console.log(`KENO 6.2.2 AUTO VERSION: ${build}`);
