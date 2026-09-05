'use strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const HISTORY=path.join(ROOT,'keno-history-v62.json');
const STATE=path.join(ROOT,'vertical-radar-state-v624.json');
const RUNTIME=path.join(ROOT,'vertical-radar-runtime-v624.json');
const MAX_FINALIZED=200;
const MAX_RUNTIME_HISTORY=120;
const PAYOUTS={3:{3:1500,2:300},4:{4:3300,3:300,2:100},5:{5:20000,4:1920,3:400}};
const SCHEDULE=['00:02','00:17','00:32','01:02','01:17','01:32','02:02','02:17','02:32','03:02','03:32','04:02','04:17','04:32','05:02','05:17','05:32','06:02','06:17','06:32','07:02','07:32','08:02','08:17','08:32','09:02','09:17','09:32','10:02','10:17','10:32','11:02','11:32','12:02','12:17','12:32','13:02','13:17','13:32','14:02','14:17','14:32','15:02','15:32','16:02','16:17','16:32','17:02','17:17','17:32','18:02','18:17','18:32','19:02','19:32','20:02','20:17','20:32','21:02','21:17','21:32','22:02','22:17','22:32','23:02','23:32'];
const read=(f,fb=null)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){if(fb!==null)return fb;throw e}};
const atomic=(f,o)=>{const t=f+'.tmp';fs.writeFileSync(t,JSON.stringify(o,null,2)+'\n','utf8');fs.renameSync(t,f)};
function norm(x){const draw=Number(x?.draw),balls=Array.isArray(x?.balls)?x.balls.map(Number).slice(0,20):[];if(!Number.isFinite(draw)||balls.length!==20||balls.some(n=>n<1||n>80))return null;return{draw,date:String(x.date||''),time:String(x.time||''),balls}}
function loadHistory(){const m=new Map();for(const x of read(HISTORY,[])){const d=norm(x);if(d)m.set(d.draw,d)}return[...m.values()].sort((a,b)=>a.draw-b.draw)}
function consecutive(a,s,e){for(let i=s+1;i<=e;i++)if(a[i].draw!==a[i-1].draw+1)return false;return true}
function sourceV(a,i,m,n,d){const e=i+1-d;if(d<1||e<0||e>i)return null;const s=e-n+1;if(s<0||!consecutive(a,s,e))return null;const numbers=[],sourceDraws=[];for(let j=s;j<=e;j++){const v=Number(a[j]?.balls?.[m-1]);if(!(v>=1&&v<=80))return null;numbers.push(v);sourceDraws.push(a[j].draw)}if(new Set(numbers).size!==numbers.length)return null;return{numbers,sourceDraws}}
function fullBase(n){let p=1;for(let i=0;i<n;i++)p*=(20-i)/(80-i);return p}
function outcomes(a,m,n,d,src){const out=[];for(let i=0;i<src;i++){const act=a[i+1];if(!act||act.draw!==a[i].draw+1)continue;const s=sourceV(a,i,m,n,d);if(!s)continue;const A=new Set(act.balls),hits=s.numbers.reduce((q,x)=>q+(A.has(x)?1:0),0);out.push({hits,full:hits===n})}return out}
function ws(arr,n,W){const z=arr.slice(-W);if(!z.length)return{count:0,hitLift:0,fullLift:0,full:0};const hits=z.reduce((s,x)=>s+x.hits,0),full=z.reduce((s,x)=>s+(x.full?1:0),0);return{count:z.length,hitLift:hits/(z.length*n*.25),fullLift:full/(z.length*fullBase(n)),full}}
function status(s){const a=s[10].hitLift,b=s[20].hitLift,c=s[30].hitLift,e=s[66].hitLift;if(a>=1.18&&b>=1.10&&c>=1.05&&e>=.95)return'HOT';if(a>=1.12&&b>=1.05&&c>=1.00)return'PRE-HOT';if((a>=1.08&&b>=1.00)||(b>=1.07&&c>=1.02))return'WATCH';if(a<=.82&&b<=.92&&c<.98)return'COLD';return'OFF'}
function score(s){const a=s[10].hitLift,b=s[20].hitLift,c=s[30].hitLift,e=s[66].hitLift,p=Math.max(0,1-Math.abs(a-c)),f=Math.min(1.5,s[66].fullLift||0);return .34*a+.29*b+.20*c+.10*e+.04*p+.03*f}
function bestLane(a,src,n){let best=null;for(let m=1;m<=20;m++)for(let d=1;d<=10;d++){const s=sourceV(a,src,m,n,d);if(!s)continue;const arr=outcomes(a,m,n,d,src);if(arr.length<66)continue;const stats={};for(const W of[10,20,30,66])stats[W]=ws(arr,n,W);const x={n,m,d,numbers:s.numbers,sourceDraws:s.sourceDraws,status:status(stats),score:Number(score(stats).toFixed(4)),stats:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,{count:v.count,hitLift:Number(v.hitLift.toFixed(3)),fullLift:Number(v.fullLift.toFixed(3)),full:v.full}]))};x.active=x.status==='HOT'||x.status==='PRE-HOT';if(!best||x.score>best.score)best=x}return best}
function nextMeta(last){const i=SCHEDULE.indexOf(String(last.time));let date=last.date,time=i>=0?SCHEDULE[(i+1)%SCHEDULE.length]:'—';if(i===SCHEDULE.length-1){const m=String(date).match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[1])));d.setUTCDate(d.getUTCDate()+1);date=`${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.${String(d.getUTCFullYear()).slice(-2)}`}}return{draw:last.draw+1,date,time}}
function build(a,src,sourceType='SERVER_PRE_DRAW'){const last=a[src],target=nextMeta(last);return{id:`vr:${target.draw}`,version:2,sourceType,capturedAt:new Date().toISOString(),source:{draw:last.draw,date:last.date,time:last.time},target,lanes:[3,4,5].map(n=>bestLane(a,src,n)).filter(Boolean),status:'pending'}}
function payout(n,h){return Number(PAYOUTS[n]?.[h]||0)}
function finalize(r,act,sourceType=r.sourceType){const A=new Set(act.balls),lanes=(r.lanes||[]).map(l=>{const hitNumbers=l.numbers.filter(x=>A.has(x)),hitCount=hitNumbers.length;return{...l,outcome:{hitNumbers,hitCount,result:hitCount===l.n?'full':hitCount>0?'partial':'none',payout:payout(l.n,hitCount)}}});return{...r,status:'checked',sourceType,finalizedAt:new Date().toISOString(),actual:{draw:act.draw,date:act.date,time:act.time,balls:act.balls},lanes,summary:{totalPayout:lanes.reduce((s,l)=>s+(l.outcome?.payout||0),0)}}}
function blank(){return{version:2,createdAt:new Date().toISOString(),snapshots:{},finalized:{}}}
function trim(st){const ks=Object.keys(st.finalized).map(Number).sort((a,b)=>a-b);for(const k of ks.slice(0,Math.max(0,ks.length-MAX_FINALIZED)))delete st.finalized[k]}
const hist=loadHistory();if(hist.length<120)throw new Error(`Недостаточно истории: ${hist.length}`);
const idx=new Map(hist.map((x,i)=>[x.draw,i])),actual=new Map(hist.map(x=>[x.draw,x]));
const existed=fs.existsSync(STATE);let state=existed?read(STATE,blank()):blank();if(state.version!==2)state=blank();state.snapshots=state.snapshots||{};state.finalized=state.finalized||{};
for(const[k,p]of Object.entries({...state.snapshots})){const act=actual.get(Number(k));if(act){state.finalized[k]=finalize(p,act,'SERVER_PRE_DRAW');delete state.snapshots[k];console.log(`VR FINALIZE REAL №${k}`)}}
if(existed){const anchors=[...Object.keys(state.finalized),...Object.keys(state.snapshots)].map(Number).filter(Number.isFinite);const anchor=anchors.length?Math.max(...anchors):0;if(anchor){for(const act of hist){if(act.draw<=anchor||state.finalized[act.draw])continue;const si=idx.get(act.draw-1);if(si==null)continue;const rec=build(hist,si,'SERVER_RECONSTRUCTED_GAP');if(rec.target.draw===act.draw){state.finalized[act.draw]=finalize(rec,act,'SERVER_RECONSTRUCTED_GAP');console.log(`VR RESTORE GAP №${act.draw}`)}}}}
trim(state);
const latest=hist.at(-1),next=nextMeta(latest);if(!state.finalized[next.draw]&&!state.snapshots[next.draw]){state.snapshots[next.draw]=build(hist,hist.length-1,'SERVER_PRE_DRAW');console.log(`VR CAPTURE №${next.draw} ${next.date} ${next.time}`)}
trim(state);atomic(STATE,state);
const pending=state.snapshots[next.draw]||Object.values(state.snapshots).sort((a,b)=>b.target.draw-a.target.draw)[0]||null;
const history=Object.values(state.finalized).sort((a,b)=>b.target.draw-a.target.draw).slice(0,MAX_RUNTIME_HISTORY);
atomic(RUNTIME,{version:2,generatedAt:new Date().toISOString(),source:'SERVER_VERTICAL_RADAR_M5M_STYLE',latestOfficial:latest,target:pending?.target||next,pending,history,totals:{storedFinalized:Object.keys(state.finalized).length,pending:Object.keys(state.snapshots).length,historyPublished:history.length}});
console.log(`VR SERVER OK latest=№${latest.draw} target=№${next.draw} finalized=${Object.keys(state.finalized).length}`);
