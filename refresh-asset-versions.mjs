import fs from 'node:fs';
import crypto from 'node:crypto';

const INDEX='index.html';
const VERSION='version-v622.json';
const MANIFEST='manifest.webmanifest';

let html=fs.readFileSync(INDEX,'utf8');
let version={app:'KENO 6.2.2',version:'6.2.2'};

try{
  version=JSON.parse(fs.readFileSync(VERSION,'utf8'));
}catch{}

const current=String(version.version||version.app?.match(/\d+\.\d+\.\d+/)?.[0]||'6.2.2');
const parts=current.split('.').map(Number);
const nextVersion=`${parts[0]||6}.${parts[1]||2}.${(parts[2]||2)+1}`;

version.version=nextVersion;
version.app=`KENO ${nextVersion}`;

// Видимая версия приложения.
html=html.replace(/<title>ПОЗИТРОН КЕНО v[^<]+<\/title>/,`<title>ПОЗИТРОН КЕНО v${nextVersion}</title>`);
html=html.replace(/(<div class="brand">🎯 ПОЗИТРОН КЕНО v)[^<]+(<\/div>)/,`$1${nextVersion}$2`);
html=html.replace(/СБОРКА \d+\.\d+\.\d+/g,`СБОРКА ${nextVersion}`);
html=html.replace(/(<div id="status" class="sub">v)\d+\.\d+\.\d+/,`$1${nextVersion}`);

// Обновляем имя PWA.
if(fs.existsSync(MANIFEST)){
  try{
    const m=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));
    m.name=`ПОЗИТРОН КЕНО v${nextVersion}`;
    m.short_name=`КЕНО ${nextVersion}`;
    fs.writeFileSync(MANIFEST,JSON.stringify(m,null,2)+'\n');
  }catch(e){
    console.warn('manifest update skipped:',e.message);
  }
}

const assets=[
  'cluster-model-v622.js',
  'cluster-tracker-v622.js',
  'fingerprint-v622.js',
  'app-version-v622.js',
  'manifest.webmanifest'
];

const buildParts=[`version:${nextVersion}`];

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
fs.writeFileSync(INDEX,html);

const build=crypto
  .createHash('sha256')
  .update(buildParts.join('|'))
  .digest('hex')
  .slice(0,16);

version.build=build;
version.updatedAt=new Date().toISOString();
version.sha=process.env.GITHUB_SHA||version.sha||'';

fs.writeFileSync(VERSION,JSON.stringify(version,null,2)+'\n');

console.log(`KENO AUTO VERSION: ${current} -> ${nextVersion}`);
console.log(`BUILD: ${build}`);
