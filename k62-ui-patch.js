
(() => {
  'use strict';

  // KENO 6.2 UI patch:
  // 1) "СЛЕД ТИРАЖ" banner
  // 2) compact mode buttons: Вып / Возр / Вм
  // 3) same buttons in forecast/archive blocks
  // 4) exactly 5 numbers per row => POOL-20 = 4 x 5
  // Does NOT alter LOGIC / ANTILOGIC calculations.

  const SCHEDULE = [
    "00:02","00:17","00:32","01:02","01:17","01:32","02:02","02:17","02:32",
    "03:02","03:32","04:02","04:17","04:32","05:02","05:17","05:32","06:02",
    "06:17","06:32","07:02","07:32","08:02","08:17","08:32","09:02","09:17",
    "09:32","10:02","10:17","10:32","11:02","11:32","12:02","12:17","12:32",
    "13:02","13:17","13:32","14:02","14:17","14:32","15:02","15:32","16:02",
    "16:17","16:32","17:02","17:17","17:32","18:02","18:17","18:32","19:02",
    "19:32","20:02","20:17","20:32","21:02","21:17","21:32","22:02","22:17",
    "22:32","23:02","23:32"
  ];

  const qsa = (s, r=document) => [...r.querySelectorAll(s)];

  function compactLabels(root=document) {
    qsa('button', root).forEach(b => {
      const t = b.textContent.trim().toLowerCase();
      if (t === 'выпадение') b.textContent = 'Вып';
      else if (t === 'возрастание') b.textContent = 'Возр';
      else if (t === 'вместе') b.textContent = 'Вм';
    });
  }

  function forceFiveColumns(root=document) {
    qsa('.numbers, .pool-grid, .prediction-numbers, .forecast-numbers, .archive-numbers', root)
      .forEach(el => el.classList.add('k62-five'));
  }

  function addModeBar(block) {
    if (!block || block.querySelector(':scope > .k62-modebar')) return;
    const bar = document.createElement('div');
    bar.className = 'k62-modebar';
    bar.innerHTML = `
      <button type="button" data-k62-mode="fall" class="on">Вып</button>
      <button type="button" data-k62-mode="asc">Возр</button>
      <button type="button" data-k62-mode="both">Вм</button>`;
    const target = block.querySelector('.numbers, .pool-grid, .prediction-numbers, .forecast-numbers, .archive-numbers');
    if (target) target.before(bar); else block.prepend(bar);

    bar.addEventListener('click', e => {
      const btn = e.target.closest('[data-k62-mode]');
      if (!btn) return;
      bar.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn));
      const mode = btn.dataset.k62Mode;
      // Reuse the application's own top mode buttons when available.
      const appBtn = qsa('button[data-mode]').find(x => x.dataset.mode === mode);
      if (appBtn) appBtn.click();
      block.dataset.k62Mode = mode;
    });
  }

  function addBarsEverywhere() {
    // Forecast + LOGIC/ANTILOGIC archive entries.
    const selectors = [
      '.prediction-card','.forecast-card','.logic-card','.antilogic-card',
      '.archive-entry','.fingerprint-card','.analog-item'
    ];
    selectors.forEach(s => qsa(s).forEach(addModeBar));

    // Fallback for current markup: blocks that visibly contain POOL-20 / LOGIC / ANTILOGIC.
    qsa('section, article, .card, .row').forEach(el => {
      const t = el.textContent || '';
      if (/POOL-20|LOGIC|ANTILOGIC|Комбинации на тираж/i.test(t) &&
          el.querySelector('.numbers, .pool-grid, .prediction-numbers, .forecast-numbers, .archive-numbers')) {
        addModeBar(el);
      }
    });
  }

  function parseLastDraw() {
    const txt = document.body.innerText;
    const m = txt.match(/ПОСЛЕДНИЙ ТИРАЖ[\s\S]{0,120}?№\s*(\d+)[\s\S]{0,100}?(\d{1,2}:\d{2})/i)
           || txt.match(/последний №\s*(\d+)[\s\S]{0,80}?(\d{1,2}:\d{2})/i);
    return m ? {draw:+m[1], time:m[2].padStart(5,'0')} : null;
  }

  function nextSlot(time) {
    const i = SCHEDULE.indexOf(time);
    if (i < 0) return null;
    return {time: SCHEDULE[(i+1)%SCHEDULE.length], nextDay: i === SCHEDULE.length-1};
  }

  function renderNextDraw() {
    const last = parseLastDraw();
    if (!last) return;
    const nxt = nextSlot(last.time);
    if (!nxt) return;

    let banner = document.getElementById('k62-next-draw');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'k62-next-draw';
      banner.className = 'k62-next-draw';

      const mode = document.querySelector('.mode');
      if (mode) mode.insertAdjacentElement('afterend', banner);
      else {
        const cards = document.getElementById('cards');
        if (cards) cards.insertAdjacentElement('beforebegin', banner);
      }
    }
    banner.innerHTML = `<span>📅</span><strong>СЛЕД ТИРАЖ №${last.draw+1} · ${nxt.time}</strong>`;
  }

  function run() {
    compactLabels();
    forceFiveColumns();
    addBarsEverywhere();
    renderNextDraw();
  }

  let pending = false;
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending=false; run(); });
  });

  document.addEventListener('DOMContentLoaded', () => {
    run();
    mo.observe(document.body, {childList:true, subtree:true});
  });
  if (document.readyState !== 'loading') {
    run();
    mo.observe(document.body, {childList:true, subtree:true});
  }
})();
