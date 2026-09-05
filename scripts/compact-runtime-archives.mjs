import fs from 'node:fs';

const CLUSTER_FILES=[
  'cluster-archive-next-v622.json',
  'cluster-archive-minus1-v622.json',
  'cluster-archive-minus2-v622.json'
];
const FINGERPRINT_FILES=[
  'fingerprint-archive-next-v622.json',
  'fingerprint-archive-minus1-v622.json',
  'fingerprint-archive-minus2-v622.json'
];
const VERTICAL_STATE='vertical-radar-state-v624.json';
const VERTICAL_RUNTIME='vertical-radar-runtime-v624.json';
const LIMITS=Object.freeze({cluster:180,fingerprint:120,verticalState:200,verticalRuntime:120});

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const targetDraw=record=>number(record?.targetDraw||record?.target?.draw||record?.actual?.targetDraw);

function writeIfChanged(file,before,after){
  const oldText=JSON.stringify(before,null,2)+'\n';
  const nextText=JSON.stringify(after,null,2)+'\n';
  if(oldText===nextText)return false;
  fs.writeFileSync(file,nextText,'utf8');
  return true;
}

function compactRecordArchive(file,limit,kind){
  if(!fs.existsSync(file))return false;
  const before=readJson(file);
  const after=structuredClone(before);
  const records=Array.isArray(after.records)?after.records.slice().sort((a,b)=>targetDraw(a)-targetDraw(b)):[];
  const checked=records.filter(record=>record?.status==='checked').slice(-limit);
  const pending=records.filter(record=>record?.status!=='checked');
  after.records=[...checked,...pending].sort((a,b)=>targetDraw(a)-targetDraw(b));
  after.recordsCount=after.records.length;
  after.checkedCount=checked.length;
  after.pendingCount=pending.length;
  after.retention={checkedRecords:limit,mode:'compact-snapshot'};
  const changed=writeIfChanged(file,before,after);
  console.log(`${file}: ${records.length} -> ${after.records.length}${changed?'':' (без изменений)'}`);
  return changed;
}

function compactVerticalState(){
  if(!fs.existsSync(VERTICAL_STATE))return{changed:false,stored:0};
  const before=readJson(VERTICAL_STATE);
  const after=structuredClone(before);
  const entries=Object.entries(after.finalized||{}).sort((a,b)=>number(a[0])-number(b[0]));
  after.finalized=Object.fromEntries(entries.slice(-LIMITS.verticalState));
  after.snapshots=after.snapshots||{};
  after.retention={finalizedRecords:LIMITS.verticalState,mode:'compact-snapshot'};
  const changed=writeIfChanged(VERTICAL_STATE,before,after);
  console.log(`${VERTICAL_STATE}: ${entries.length} -> ${Object.keys(after.finalized).length}${changed?'':' (без изменений)'}`);
  return{changed,stored:Object.keys(after.finalized).length};
}

function compactVerticalRuntime(storedFinalized){
  if(!fs.existsSync(VERTICAL_RUNTIME))return false;
  const before=readJson(VERTICAL_RUNTIME);
  const after=structuredClone(before);
  const history=Array.isArray(after.history)?after.history.slice().sort((a,b)=>targetDraw(b)-targetDraw(a)):[];
  after.history=history.slice(0,LIMITS.verticalRuntime);
  after.totals={
    ...(after.totals||{}),
    storedFinalized,
    pending:after.pending?1:0,
    historyPublished:after.history.length
  };
  after.retention={historyRecords:LIMITS.verticalRuntime,mode:'compact-snapshot'};
  const changed=writeIfChanged(VERTICAL_RUNTIME,before,after);
  console.log(`${VERTICAL_RUNTIME}: ${history.length} -> ${after.history.length}${changed?'':' (без изменений)'}`);
  return changed;
}

let changed=0;
for(const file of CLUSTER_FILES)changed+=Number(compactRecordArchive(file,LIMITS.cluster,'cluster'));
for(const file of FINGERPRINT_FILES)changed+=Number(compactRecordArchive(file,LIMITS.fingerprint,'fingerprint'));
const vertical=compactVerticalState();
changed+=Number(vertical.changed);
changed+=Number(compactVerticalRuntime(vertical.stored));
console.log(`Компактирование завершено. Изменено файлов: ${changed}`);
