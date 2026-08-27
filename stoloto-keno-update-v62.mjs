import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const LOGIN_URL='https://oauth.stoloto.ru/login';
const ARCHIVE_URL='https://m.stoloto.ru/keno2/archive/';
const HISTORY_FILE='keno-history-v62.json';
const STATUS_FILE='keno-status-v62.json';

const VERSION='6.2.3-m5m-reader';
const TAIL_SIZE=10;
const PAGE_READ_ATTEMPTS=3;

const EMAIL=process.env.STOLOTO_EMAIL||'';
const PASSWORD=process.env.STOLOTO_PASSWORD||'';

const SCHEDULE=[
'00:02','00:17','00:32','01:02','01:17','01:32','02:02','02:17','02:32','03:02','03:32',
'04:02','04:17','04:32','05:02','05:17','05:32','06:02','06:17','06:32','07:02','07:32',
'08:02','08:17','08:32','09:02','09:17','09:32','10:02','10:17','10:32','11:02','11:32',
'12:02','12:17','12:32','13:02','13:17','13:32','14:02','14:17','14:32','15:02','15:32',
'16:02','16:17','16:32','17:02','17:17','17:32','18:02','18:17','18:32','19:02','19:32',
'20:02','20:17','20:32','21:02','21:17','21:32','22:02','22:17','22:32','23:02','23:32'
];
const SCHEDULE_SET=new Set(SCHEDULE);

const MONTHS={
 'января':1,'февраля':2,'марта':3,'апреля':4,
 'мая':5,'июня':6,'июля':7,'августа':8,
 'сентября':9,'октября':10,'ноября':11,'декабря':12
};

const pad2=n=>String(n).padStart(2,'0');

function norm(s){
 return String(s??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
}

function moscowToday(){
 const f=new Intl.DateTimeFormat('ru-RU',{
  timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'
 });
 const p=Object.fromEntries(f.formatToParts(new Date()).map(x=>[x.type,x.value]));
 return{y:Number(p.year),m:Number(p.month),d:Number(p.day)};
}

function shiftDate({y,m,d},delta){
 const x=new Date(Date.UTC(y,m-1,d));
 x.setUTCDate(x.getUTCDate()+delta);
 return{y:x.getUTCFullYear(),m:x.getUTCMonth()+1,d:x.getUTCDate()};
}

function parseDateLabel(label){
 const raw=norm(label).toLowerCase();
 const today=moscowToday();
 let p=null;

 if(raw==='сегодня')p=today;
 else if(raw==='вчера')p=shiftDate(today,-1);
 else{
  let m=raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if(m){
   let y=Number(m[3]);
   if(y<100)y+=2000;
   p={d:Number(m[1]),m:Number(m[2]),y};
  }else{
   m=raw.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/i);
   if(m&&MONTHS[m[2]]){
    p={d:Number(m[1]),m:MONTHS[m[2]],y:m[3]?Number(m[3]):today.y};
    if(!m[3]&&p.m>today.m+6)p.y-=1;
   }
  }
 }
 return p?`${pad2(p.d)}.${pad2(p.m)}.${String(p.y).slice(-2)}`:null;
}

function parseTime(text){
 const m=String(text||'').match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
 if(!m)return null;
 return{
  short:`${pad2(Number(m[1]))}:${m[2]}`,
  full:`${pad2(Number(m[1]))}:${m[2]}:${m[3]||'00'}`
 };
}

function parseDraw(text){
 const m=String(text||'').match(/№\s*([0-9]{4,})/);
 return m?Number(m[1]):null;
}

function parseColumn(text){
 const m=norm(text).match(/столб(?:ец)?\s*[:№#-]?\s*([1-9]|10)\b/i);
 return m?Number(m[1]):null;
}

function parityFromBalls(balls){
 const even=balls.filter(n=>n%2===0).length;
 const odd=balls.length-even;
 if(even>odd)return'Больше чётных';
 if(odd>even)return'Больше нечётных';
 return'Поровну';
}

function validBalls(balls){
 return Array.isArray(balls) &&
  balls.length===20 &&
  new Set(balls).size===20 &&
  balls.every(n=>Number.isInteger(n)&&n>=1&&n<=80);
}

function coreKey(d){
 return JSON.stringify({
  draw:d.draw,
  date:d.date,
  time:d.time,
  balls:d.balls
 });
}

async function login(page){
 if(!EMAIL||!PASSWORD)throw new Error('FAIL: нет STOLOTO_EMAIL / STOLOTO_PASSWORD');

 await page.goto(LOGIN_URL,{waitUntil:'domcontentloaded',timeout:60000});

 const loginSelectors=[
  'input[type="email"]','input[name*="email" i]','input[name*="login" i]',
  'input[autocomplete="username"]','input[type="text"]'
 ];
 const passSelectors=[
  'input[type="password"]','input[name*="password" i]',
  'input[autocomplete="current-password"]'
 ];

 let loginField=null,passField=null;
 for(const sel of loginSelectors){
  const x=page.locator(sel).first();
  if(await x.count()){loginField=x;break}
 }
 for(const sel of passSelectors){
  const x=page.locator(sel).first();
  if(await x.count()){passField=x;break}
 }

 if(!loginField||!passField)throw new Error(`OAuth fields not found; url=${page.url()}`);

 await loginField.fill(EMAIL);
 await passField.fill(PASSWORD);

 const buttons=[
  page.getByRole('button',{name:/войти/i}).first(),
  page.locator('button[type="submit"]').first(),
  page.locator('input[type="submit"]').first()
 ];

 let clicked=false;
 for(const btn of buttons){
  if(await btn.count()){
   await btn.click();
   clicked=true;
   break;
  }
 }
 if(!clicked)throw new Error('OAuth submit button not found');

 await page.waitForLoadState('domcontentloaded',{timeout:20000}).catch(()=>{});
 await page.waitForTimeout(2500);
}

async function primaryDomCollect(page){
 const raw=await page.locator('body').evaluate(() => {
  const drawRx=/№\s*\d{4,}/;
  const dateRx=/^(Сегодня|Вчера|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?)$/i;
  const norm=s=>String(s||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const all=[...document.querySelectorAll('body *')];

  function nearestDate(el){
   let best=null;
   for(const node of all){
    if(node===el||el.contains(node))continue;
    const pos=node.compareDocumentPosition(el);
    if(!(pos&Node.DOCUMENT_POSITION_FOLLOWING))continue;
    const t=norm(node.innerText||node.textContent||'');
    if(!t||t.length>40||!dateRx.test(t))continue;
    if(node.children&&node.children.length>3)continue;
    best=t;
   }
   return best;
  }

  let rows=[...document.querySelectorAll('tr')].filter(el=>drawRx.test(el.innerText||''));

  if(!rows.length){
   rows=all.filter(el=>{
    const t=norm(el.innerText||'');
    if(!drawRx.test(t))return false;
    return ![...el.children].some(ch=>drawRx.test(norm(ch.innerText||'')));
   });
  }

  return rows.map(el=>({
   text:el.innerText||'',
   dateLabel:nearestDate(el),
   buttons:[...el.querySelectorAll('button')].map(b=>norm(b.innerText||''))
  }));
 });

 const out=[];
 let carry=null;

 for(const row of raw){
  const text=String(row.text||'');
  const label=norm(row.dateLabel||'');
  if(label)carry=label;

  const draw=parseDraw(text);
  const tm=parseTime(text);
  const column=parseColumn(text);
  const date=parseDateLabel(label||carry);

  let balls=(row.buttons||[])
   .map(x=>Number(norm(x)))
   .filter(n=>Number.isInteger(n)&&n>=1&&n<=80);

  if(balls.length>20)balls=balls.slice(-20);

  // В отличие от старого v6.2, отсутствие parity НЕ блокирует факт.
  // Она всегда однозначно вычисляется из 20 чисел.
  if(draw && tm && SCHEDULE_SET.has(tm.short) && column && date && validBalls(balls)){
   out.push({
    draw,
    date,
    time:tm.short,
    timeFull:tm.full,
    column,
    parity:parityFromBalls(balls),
    balls
   });
  }
 }

 return [...new Map(out.map(x=>[x.draw,x])).values()]
  .sort((a,b)=>a.draw-b.draw);
}

function fallbackTextCollect(bodyText){
 const lines=String(bodyText||'')
  .split(/\r?\n/)
  .map(norm)
  .filter(Boolean);

 const dateRx=/^(Сегодня|Вчера|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?)$/i;

 const out=[];
 let currentDate=null;

 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(dateRx.test(line))currentDate=parseDateLabel(line)||currentDate;
  if(!/№\s*\d{4,}/.test(line))continue;

  if(!currentDate){
   for(let j=Math.max(0,i-5);j<i;j++){
    if(dateRx.test(lines[j])){
     currentDate=parseDateLabel(lines[j])||currentDate;
    }
   }
  }

  // Берём небольшой блок текущего тиража — схема M5M.
  const chunkLines=lines.slice(i,Math.min(lines.length,i+18));
  const chunk=chunkLines.join(' ');

  const draw=parseDraw(chunk);
  const tm=parseTime(chunk);
  const column=parseColumn(chunk);

  // В текстовом fallback числа ищем только после номера/служебных меток,
  // оставляем исключительно 1..80 и берём последние 20.
  let nums=(chunk.match(/\b\d{1,2}\b/g)||[])
   .map(Number)
   .filter(n=>n>=1&&n<=80);

  // Убираем HH/MM и номер столбца эвристически недостаточно безопасно,
  // поэтому fallback используется только для дополнения DOM,
  // а строка принимается лишь если получились 20 уникальных чисел.
  if(nums.length>20)nums=nums.slice(-20);

  if(draw && tm && SCHEDULE_SET.has(tm.short) && column && currentDate && validBalls(nums)){
   out.push({
    draw,
    date:currentDate,
    time:tm.short,
    timeFull:tm.full,
    column,
    parity:parityFromBalls(nums),
    balls:nums
   });
  }
 }

 return [...new Map(out.map(x=>[x.draw,x])).values()]
  .sort((a,b)=>a.draw-b.draw);
}

async function collect(page){
 let lastDiag=null;

 for(let attempt=1;attempt<=PAGE_READ_ATTEMPTS;attempt++){
  try{
   await page.goto(`${ARCHIVE_URL}?_t=${Date.now()}-${attempt}`,{
    waitUntil:'domcontentloaded',
    timeout:60000
   });
  }catch(e){
   console.warn(`WARN archive goto ${attempt}: ${e.message}`);
  }

  await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(1800+700*attempt);

  const primary=await primaryDomCollect(page);

  let body='';
  try{body=await page.locator('body').innerText({timeout:10000})}catch{}
  const fallback=fallbackTextCollect(body);

  const merged=new Map(primary.map(x=>[x.draw,x]));
  for(const x of fallback){
   if(!merged.has(x.draw))merged.set(x.draw,x);
  }

  const rows=[...merged.values()].sort((a,b)=>a.draw-b.draw);

  lastDiag={
   pageAttempt:attempt,
   url:page.url(),
   primary:primary.length,
   fallback:fallback.length,
   merged:rows.length,
   latest:rows.at(-1)?.draw||0
  };

  console.log(
   `Stoloto M5M-style ${attempt}/${PAGE_READ_ATTEMPTS}: `+
   `primary=${primary.length} fallback=${fallback.length} merged=${rows.length} `+
   `latest=№${rows.at(-1)?.draw||0}`
  );

  if(rows.length>=TAIL_SIZE)return rows.slice(-TAIL_SIZE);

  await page.reload({waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await page.waitForTimeout(1000);
 }

 throw new Error(
  `Only ${lastDiag?.merged||0} recent draws found; diagnostics=`+
  JSON.stringify(lastDiag)
 );
}

async function stableTail(page){
 const reads=[];

 for(let check=1;check<=3;check++){
  const rows=await collect(page);
  if(rows.length<TAIL_SIZE)throw new Error(`Only ${rows.length} recent draws found`);

  reads.push(new Map(rows.map(r=>[r.draw,r])));
  console.log(
   `CHECK ${check}/3: №${rows[0].draw}–№${rows.at(-1).draw}`
  );

  if(check<3)await page.waitForTimeout(700);
 }

 // M5M-схема: сравниваем только хвост 10.
 const common=[...reads[0].keys()]
  .filter(draw=>reads[1].has(draw)&&reads[2].has(draw))
  .sort((a,b)=>a-b)
  .slice(-TAIL_SIZE);

 if(common.length<TAIL_SIZE){
  throw new Error(`Tail changed between checks: common=${common.length}/${TAIL_SIZE}`);
 }

 const stable=[];
 const mismatches=[];

 for(const draw of common){
  const a=reads[0].get(draw);
  const b=reads[1].get(draw);
  const c=reads[2].get(draw);

  // Факт проверяется по номеру + дате + времени + всем 20 числам.
  // parity вычисляется, а column сверяется отдельно.
  if(coreKey(a)===coreKey(b) && coreKey(a)===coreKey(c) &&
     a.column===b.column && a.column===c.column){
   stable.push(a);
  }else{
   mismatches.push(draw);
  }
 }

 if(stable.length<TAIL_SIZE){
  throw new Error(
   `Triple tail10 check failed: stable=${stable.length}/${TAIL_SIZE}; `+
   `mismatch=${mismatches.join(',')}`
  );
 }

 return stable;
}

async function readHistory(){
 const raw=JSON.parse(await fs.readFile(HISTORY_FILE,'utf8'));
 const arr=Array.isArray(raw)?raw:(raw.draws||[]);
 if(!Array.isArray(arr)||!arr.length)throw new Error('History is empty');
 return arr;
}

function historyCore(d){
 return{
  draw:Number(d.draw),
  date:norm(d.date),
  time:parseTime(d.time)?.short||norm(d.time),
  balls:(d.balls||[]).map(Number)
 };
}

function mergeFresh(history,stable){
 const lastTrusted=historyCore(history.at(-1));
 const officialMap=new Map(stable.map(d=>[d.draw,d]));

 const anchor=officialMap.get(lastTrusted.draw);
 if(!anchor)throw new Error(`No trusted anchor №${lastTrusted.draw}`);

 if(coreKey(anchor)!==coreKey(lastTrusted)){
  throw new Error(`Trusted anchor №${lastTrusted.draw} differs from Stoloto`);
 }

 const fresh=[];
 let expected=lastTrusted.draw+1;

 while(officialMap.has(expected)){
  fresh.push(officialMap.get(expected));
  expected++;
 }

 const map=new Map(history.map(d=>[Number(d.draw),d]));
 const source='Официальный Столото · M5M tail10 triple-check';

 for(const d of fresh){
  map.set(d.draw,{
   draw:d.draw,
   date:d.date,
   time:d.time,
   balls:d.balls,
   parity:d.parity,
   column:d.column,
   source
  });
 }

 return{
  merged:[...map.values()].sort((a,b)=>Number(a.draw)-Number(b.draw)),
  fresh
 };
}

async function writeStatus(history,stable,fresh){
 const last=history.at(-1)||{};
 const latestOfficial=stable.at(-1)||{};

 await fs.writeFile(
  STATUS_FILE,
  JSON.stringify({
   version:VERSION,
   source:'Stoloto',
   sourceUrl:ARCHIVE_URL,
   verification:'M5M tail10 + 3 checks + DOM/fallback',
   updatedAt:new Date().toISOString(),
   drawsStored:history.length,
   latestDraw:Number(last.draw||0),
   latestDate:String(last.date||''),
   latestTime:String(last.time||''),
   latestParity:last.parity||null,
   latestColumn:Number.isInteger(last.column)?last.column:null,
   addedCount:fresh.length,
   latestOfficialDraw:Number(latestOfficial.draw||0),
   latestOfficialDate:String(latestOfficial.date||''),
   latestOfficialTime:String(latestOfficial.time||''),
   stableTailDraws:stable.map(x=>x.draw)
  },null,2)+'\n'
 );
}

const chromePath=process.env.STOLOTO_CHROME_PATH||'';
if(!chromePath){
 throw new Error('FAIL: STOLOTO_CHROME_PATH не задан workflow');
}
const browser=await chromium.launch({
 headless:true,
 executablePath:chromePath
});

try{
 const context=await browser.newContext({
  locale:'ru-RU',
  timezoneId:'Europe/Moscow',
  viewport:{width:390,height:844}
 });

 const page=await context.newPage();
 await login(page);

 const stable=await stableTail(page);
 const history=await readHistory();
 const {merged,fresh}=mergeFresh(history,stable);

 if(fresh.length){
  await fs.writeFile(HISTORY_FILE,JSON.stringify(merged)+'\n');
  await writeStatus(merged,stable,fresh);

  console.log(
   `PASS M5M-style: added=${fresh.length}; `+
   `№${fresh[0].draw}–№${fresh.at(-1).draw}; `+
   `latestOfficial=№${stable.at(-1).draw}`
  );
 }else{
  await writeStatus(history,stable,[]);
  console.log(
   `PASS M5M-style: added=0; `+
   `latestTrusted=№${history.at(-1)?.draw}; `+
   `latestOfficial=№${stable.at(-1).draw}`
  );
 }
}finally{
 await browser.close();
}
