import fs from 'node:fs';
import crypto from 'node:crypto';

const INDEX='index.html';
const VERSION_FILE='version-v622.json';
const MANIFEST='manifest.webmanifest';
const bumpPatch=process.argv.includes('--bump-patch')||process.env.BUMP_PATCH==='1';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,12);
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeIfChanged=(file,text)=>{
  const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  if(before===text)return false;
  fs.writeFileSync(file,text,'utf8');
  return true;
};

const version=readJson(VERSION_FILE);
const current=String(version.version||'').trim();
if(!/^\d+\.\d+\.\d+$/.test(current)){
  throw new Error(`${VERSION_FILE}: поле version должно иметь вид X.Y.Z`);
}

const parts=current.split('.').map(Number);
const nextVersion=bumpPatch?`${parts[0]}.${parts[1]}.${parts[2]+1}`:current;
let html=fs.readFileSync(INDEX,'utf8');

// index.html и manifest — производные отображения единого version-v622.json.
html=html.replace(/<title>ПОЗИТРОН КЕНО v[^<]+<\/title>/,`<title>ПОЗИТРОН КЕНО v${nextVersion}</title>`);
html=html.replace(/(<div class="brand">🎯 ПОЗИТРОН КЕНО v)[^<]+(<\/div>)/,`$1${nextVersion}$2`);
html=html.replace(/СБОРКА \d+\.\d+\.\d+/g,`СБОРКА ${nextVersion}`);
html=html.replace(/(const APP_VERSION_FALLBACK=')[^']+(';)/,`$1${nextVersion}$2`);

const manifest=readJson(MANIFEST);
manifest.name=`ПОЗИТРОН КЕНО v${nextVersion}`;
manifest.short_name=`КЕНО ${nextVersion}`;
writeIfChanged(MANIFEST,JSON.stringify(manifest,null,2)+'\n');

const assets=[
  'cluster-model-v622.js',
  'cluster-tracker-v622.js',
  'fingerprint-v622.js',
  'vertical-radar-v624.js',
  'app-version-v622.js',
  'manifest.webmanifest'
];
const buildParts=[`version:${nextVersion}`];

for(const asset of assets){
  if(!fs.existsSync(asset))continue;
  const assetHash=hash(fs.readFileSync(asset));
  buildParts.push(`${asset}:${assetHash}`);
  const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`(${escaped})(?:\\?v=[^"'<>\\s]+)?`,'g');
  html=html.replace(re,`$1?v=${assetHash}`);
}

buildParts.push(`index.html:${hash(html)}`);
const build=hash(buildParts.join('|'));
const oldVersion=String(version.version||'');
const oldBuild=String(version.build||'');

version.version=nextVersion;
version.app=`KENO ${nextVersion}`;
version.build=build;
version.sha=process.env.GITHUB_SHA||version.sha||'';
if(oldVersion!==nextVersion||oldBuild!==build||!version.updatedAt){
  version.updatedAt=new Date().toISOString();
}

writeIfChanged(INDEX,html);
writeIfChanged(VERSION_FILE,JSON.stringify(version,null,2)+'\n');

console.log(`KENO VERSION: ${current}${bumpPatch?` -> ${nextVersion}`:' (без повышения)'}`);
console.log(`BUILD: ${build}`);
