(() => {
  'use strict';

  const SCHEDULE=[
    '00:02','00:17','00:32','01:02','01:17','01:32','02:02','02:17','02:32',
    '03:02','03:32','04:02','04:17','04:32','05:02','05:17','05:32','06:02',
    '06:17','06:32','07:02','07:32','08:02','08:17','08:32','09:02','09:17',
    '09:32','10:02','10:17','10:32','11:02','11:32','12:02','12:17','12:32',
    '13:02','13:17','13:32','14:02','14:17','14:32','15:02','15:32','16:02',
    '16:17','16:32','17:02','17:17','17:32','18:02','18:17','18:32','19:02',
    '19:32','20:02','20:17','20:32','21:02','21:17','21:32','22:02','22:17',
    '22:32','23:02','23:32'
  ];

  function compactLabels(){
    document.querySelectorAll('button').forEach(b=>{
      const t=b.textContent.trim().toLowerCase();
      if(t==='выпадение')b.textContent='Вып';
      else if(t==='возрастание')b.textContent='Возр';
      else if(t==='вместе')b.textContent='Вм';
    });
  }

  function lastDraw(){
    const text=document.body.innerText;
    const m=
      text.match(/ПОСЛЕДНИЙ ТИРАЖ[\s\S]{0,140}?№\s*(\d+)[\s\S]{0,120}?(\d{1,2}:\d{2})/i) ||
      text.match(/последний №\s*(\d+)[\s\S]{0,100}?(\d{1,2}:\d{2})/i);
    return m?{draw:Number(m[1]),time:m[2].padStart(5,'0')}:null;
  }

  function renderNext(){
    const last=lastDraw();
    if(!last)return;
    const i=SCHEDULE.indexOf(last.time);
    if(i<0)return;

    const time=SCHEDULE[(i+1)%SCHEDULE.length];
    let el=document.getElementById('k62-next-draw');

    if(!el){
      el=document.createElement('div');
      el.id='k62-next-draw';
      el.className='k62-next-draw';

      const mode=document.querySelector('.mode');
      if(mode)mode.insertAdjacentElement('afterend',el);
      else document.getElementById('cards')?.insertAdjacentElement('beforebegin',el);
    }

    el.innerHTML=`<span>📅</span><strong>СЛЕД ТИРАЖ №${last.draw+1} · ${time}</strong>`;
  }

  let queued=false;
  function run(){compactLabels();renderNext()}

  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      run();
    });
  });

  function start(){
    run();
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
