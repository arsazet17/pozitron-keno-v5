'use strict';
/* ПОЗИТРОН КЕНО v6.2.2 — общий серверный модуль 🧭 FINGERPRINT */
(() => {
  const VERSION = '2.0.0';
  const META = { 1: { button: '🎯' }, 2: { button: '⏳−1' }, 3: { button: '⏳−2' } };
  const FILES = {
    1: './fingerprint-archive-next-v622.json',
    2: './fingerprint-archive-minus1-v622.json',
    3: './fingerprint-archive-minus2-v622.json'
  };
  const CACHE_KEYS = {
    1: 'pozitron_v622_fingerprint_server_h1',
    2: 'pozitron_v622_fingerprint_server_h2',
    3: 'pozitron_v622_fingerprint_server_h3'
  };
  const KENO_PAYOUTS = Object.freeze({
    10: Object.freeze({ 10: 10000000, 9: 1000000, 8: 50000, 7: 5000, 6: 750, 5: 250, 4: 100, 0: 200 }),
    9: Object.freeze({ 9: 4000000, 8: 210000, 7: 10000, 6: 1000, 5: 300, 4: 150, 0: 150 }),
    8: Object.freeze({ 8: 1500000, 7: 53300, 6: 2500, 5: 500, 4: 200, 0: 150 }),
    7: Object.freeze({ 7: 250000, 6: 10000, 5: 1200, 4: 200, 3: 100, 0: 150 }),
    6: Object.freeze({ 6: 75000, 5: 4180, 4: 750, 3: 200 }),
    5: Object.freeze({ 5: 20000, 4: 1920, 3: 400 }),
    4: Object.freeze({ 4: 3300, 3: 300, 2: 100 }),
    3: Object.freeze({ 3: 1500, 2: 300 }),
    2: Object.freeze({ 2: 300, 1: 100 }),
    1: Object.freeze({ 1: 280 })
  });

  const state = {
    horizon: 1,
    archive: false,
    data: { 1: null, 2: null, 3: null },
    syncing: false,
    lastSync: 0,
    error: ''
  };
  const $ = id => document.getElementById(id);
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const pad = value => String(Number(value)).padStart(2, '0');
  const rubles = amount => `${Number(amount || 0).toLocaleString('ru-RU')} ₽`;
  const payoutFor = (selected, guessed) => Number(KENO_PAYOUTS[num(selected)]?.[num(guessed)] || 0);

  function readCache(horizon) {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEYS[horizon]) || 'null');
      return parsed && Array.isArray(parsed.records) ? parsed : null;
    } catch (_) { return null; }
  }
  function writeCache(horizon, payload) {
    try { localStorage.setItem(CACHE_KEYS[horizon], JSON.stringify(payload)); }
    catch (_) { /* кэш необязателен */ }
  }
  function normalizeRecord(record, horizon) {
    if (!record || !Number.isFinite(Number(record.targetDraw))) return null;
    const actualBalls = Array.isArray(record?.actual?.balls) ? record.actual.balls.map(Number).slice(0, 20) : [];
    return {
      ...record,
      id: String(record.id || `fp:${horizon}:${record.targetDraw}`),
      horizon: num(record.horizon, horizon),
      sourceDraw: num(record.sourceDraw),
      targetDraw: num(record.targetDraw),
      pool20: Array.isArray(record.pool20) ? record.pool20.map(Number) : [],
      combos: Array.isArray(record.combos) ? record.combos : [],
      neighbors: Array.isArray(record.neighbors) ? record.neighbors : [],
      actual: actualBalls.length === 20 ? {
        targetDraw: num(record.actual.targetDraw, record.targetDraw),
        date: String(record.actual.date || ''),
        time: String(record.actual.time || ''),
        balls: actualBalls
      } : null
    };
  }
  function normalizePayload(raw, horizon) {
    return {
      ...raw,
      horizon,
      records: (Array.isArray(raw?.records) ? raw.records : [])
        .map(record => normalizeRecord(record, horizon))
        .filter(Boolean)
        .sort((a, b) => a.targetDraw - b.targetDraw)
    };
  }
  async function fetchHorizon(horizon) {
    const response = await fetch(`${FILES[horizon]}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${META[horizon].button}: HTTP ${response.status}`);
    const payload = normalizePayload(await response.json(), horizon);
    state.data[horizon] = payload;
    writeCache(horizon, payload);
    return payload;
  }
  function captureOpenRecords() {
    return new Set([...document.querySelectorAll('#fingerprintResult details[data-fp-id][open]')].map(item => item.dataset.fpId));
  }
  function restoreOpenRecords(openIds) {
    if (!openIds?.size) return;
    document.querySelectorAll('#fingerprintResult details[data-fp-id]').forEach(item => {
      if (openIds.has(item.dataset.fpId)) item.open = true;
    });
  }
  async function sync(force = false) {
    if (state.syncing || (!force && Date.now() - state.lastSync < 30000)) return;
    state.syncing = true;
    const openIds = captureOpenRecords();
    try {
      const results = await Promise.allSettled([1, 2, 3].map(fetchHorizon));
      state.lastSync = Date.now();
      const errors = results.filter(item => item.status === 'rejected').map(item => item.reason?.message || 'ошибка');
      state.error = errors.join(' · ');
      if (!$('fingerprintPanel')?.hidden) render(openIds);
    } finally { state.syncing = false; }
  }

  const hitSet = (numbers, actual) => {
    const actualSet = new Set(actual?.balls || []);
    return new Set((numbers || []).filter(number => actualSet.has(Number(number))));
  };
  const chips = (numbers, hits) => (numbers || []).map(number =>
    `<span class="fp-num ${hits?.has(Number(number)) ? 'hit' : ''}">${pad(number)}${hits?.has(Number(number)) ? ' ✓' : ''}</span>`
  ).join('');
  function comboHtml(combo, actual) {
    const hits = actual ? hitSet(combo.numbers, actual) : null;
    const hitCount = hits ? hits.size : 0;
    const payout = actual ? payoutFor(combo.size, hitCount) : 0;
    const support = `${num(combo.neighborCount)}/5`;
    return `<div class="fp-combo ${payout > 0 ? 'fp-combo-win' : ''}">
      <div class="fp-combo-head"><b>${combo.id}</b><span>${actual ? `${hitCount}/${combo.size}` : `в аналогах ${support}`}</span></div>
      <div class="fp-numbers">${chips(combo.numbers, hits)}</div>
      ${actual ? `<div class="fp-note">поддержка до тиража: ${support} ближайших аналогов</div>` : ''}
      ${payout > 0 ? `<div class="fp-prize">🔥 ${rubles(payout)}</div>` : ''}
    </div>`;
  }
  function forecastHtml(record, expanded) {
    const actual = record.actual;
    const poolHits = actual ? hitSet(record.pool20, actual) : null;
    const poolHitCount = poolHits ? poolHits.size : 0;
    const poolPayout = actual ? payoutFor(poolHitCount, poolHitCount) : 0;
    const groups = [3, 4, 5].map(size =>
      `<div class="fp-label">К${size}</div>${record.combos.filter(combo => num(combo.size) === size).map(combo => comboHtml(combo, actual)).join('')}`
    ).join('');
    const body = `<div class="fp-head"><b>${META[record.horizon]?.button || '🎯'} тираж №${record.targetDraw}</b><span>${actual ? `пул ${poolHitCount}/20` : 'ожидает результата'}</span></div>
      <div class="fp-note">Зафиксировано после №${record.sourceDraw}. Серверный прогноз общий для всех и не меняется.</div>
      ${groups}
      <div class="fp-label">ПУЛ 20</div>
      <div class="fp-numbers">${chips(record.pool20, poolHits)}</div>
      ${actual && poolPayout > 0 ? `<div class="fp-pool-prize">👀👀 ${rubles(poolPayout)}</div>` : ''}
      <details class="fp-nei"><summary>5 ближайших исторических аналогов</summary>${record.neighbors.map((item, index) => `<div>${index + 1}. №${item.targetDraw} · дистанция ${num(item.distance).toFixed(4)}</div>`).join('')}</details>`;
    if (expanded) return `<div class="fp-record">${body}</div>`;
    return `<details class="fp-record" data-fp-id="${record.id}"><summary><b>${META[record.horizon]?.button} №${record.targetDraw}</b><span>${actual ? `пул ${poolHitCount}/20` : '⏳'}</span></summary>${body}</details>`;
  }
  function render(openIds = captureOpenRecords()) {
    const box = $('fingerprintResult');
    if (!box) return;
    document.querySelectorAll('[data-fp-h]').forEach(button => button.classList.toggle('active', !state.archive && num(button.dataset.fpH) === state.horizon));
    $('fingerprintArchiveBtn')?.classList.toggle('active', state.archive);
    const payload = state.data[state.horizon] || readCache(state.horizon);
    if (!payload) {
      box.innerHTML = `<div class="fp-msg">${state.error ? `Серверный архив временно недоступен: ${state.error}` : 'Загружаю общий серверный архив FINGERPRINT…'}</div>`;
      return;
    }
    const records = payload.records || [];
    if (state.archive) {
      box.innerHTML = `<div class="fp-archive-head">📚 Общий архив FINGERPRINT ${META[state.horizon].button}</div>
        <div class="fp-note">Одинаковый архив видят все пользователи приложения.</div>
        ${records.length ? records.slice().reverse().map(record => forecastHtml(record, false)).join('') : '<div class="fp-msg">Серверный архив пока пуст.</div>'}`;
      restoreOpenRecords(openIds);
      return;
    }
    const latestPending = records.slice().reverse().find(record => !record.actual);
    const latest = latestPending || records.at(-1);
    box.innerHTML = latest ? forecastHtml(latest, true) : '<div class="fp-msg">Сервер ещё не сформировал первый прогноз.</div>';
  }

  function styles() {
    if ($('fingerprintStyles')) return;
    const style = document.createElement('style');
    style.id = 'fingerprintStyles';
    style.textContent = `
#fpMainToolsLayout{display:grid;gap:6px;margin-top:6px}.fp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}#fpMainToolsLayout .tool{min-width:0;min-height:48px;padding:8px 4px;white-space:normal}#fingerprintMainBtn{font-weight:900}#fingerprintMainBtn.active,.fp-tab.active{border-color:#72df95;background:#153a2a}#fingerprintPanel[hidden]{display:none!important}#fingerprintPanel{margin-top:8px}.fp-title{display:flex;justify-content:space-between;gap:8px}.fp-title b{font-size:20px}.fp-warning{font-size:12px;color:#ffe6a0;background:#302812;border:1px solid #6e5b20;border-radius:9px;padding:8px;margin:9px 0}.fp-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.fp-tab{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:8px 3px;font-weight:900}.fp-record{border:1px solid #2a4464;border-radius:12px;background:#0b1727;margin:8px 0;padding:8px}.fp-record>summary,.fp-head,.fp-combo-head{display:flex;justify-content:space-between;gap:8px}.fp-head span,.fp-record>summary span{color:#8eedaa;font-weight:900}.fp-label{font-weight:950;margin:11px 0 5px}.fp-combo{background:#101f33;border:1px solid #263e5b;border-radius:10px;padding:8px;margin-top:6px}.fp-combo.fp-combo-win{border-color:#f0a63b;box-shadow:inset 0 0 0 1px #f0a63b}.fp-prize{margin-top:7px;color:#ffad42;font-size:17px;font-weight:950}.fp-pool-prize{margin-top:10px;text-align:center;color:#ffad42;font-size:20px;font-weight:950}.fp-combo-head span,.fp-note,.fp-nei{font-size:11px;color:var(--muted)}.fp-numbers{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.fp-num{min-width:38px;text-align:center;padding:5px 6px;border:1px solid #304b6d;border-radius:8px;background:#172a43;font-family:ui-monospace,Consolas,monospace;font-weight:900}.fp-num.hit{border-color:#43d77b;background:#123a28;color:#c9ffda}.fp-nei{margin-top:10px;border-top:1px solid #263e5b;padding-top:8px}.fp-msg{background:#101f33;border:1px solid #263e5b;border-radius:9px;padding:10px;color:var(--muted);font-size:12px}.fp-archive-head{font-size:16px;font-weight:950;margin:8px 2px}@media(max-width:390px){#fpMainToolsLayout .tool,.fp-tab{font-size:11px}}
`;
    document.head.appendChild(style);
  }
  function createPanel(layoutBox) {
    const panel = document.createElement('section');
    panel.id = 'fingerprintPanel';
    panel.className = 'card';
    panel.hidden = true;
    panel.innerHTML = `<div class="fp-title"><div><b>🧭 FINGERPRINT</b><div class="small">Манхэттен · общий серверный архив</div></div><span>v${VERSION}</span></div>
      <div class="fp-warning">Экспериментальный статистический алгоритм. Прогнозы фиксируются сервером до целевого тиража и не гарантируют выпадение.</div>
      <div class="fp-tabs"><button class="fp-tab active" data-fp-h="1">🎯</button><button class="fp-tab" data-fp-h="2">⏳−1</button><button class="fp-tab" data-fp-h="3">⏳−2</button><button class="fp-tab" id="fingerprintArchiveBtn">📚 Архив</button></div>
      <div id="fingerprintResult"><div class="fp-msg">Загружаю общий серверный архив FINGERPRINT…</div></div>`;
    layoutBox.insertAdjacentElement('afterend', panel);
    panel.querySelectorAll('[data-fp-h]').forEach(button => {
      button.onclick = () => { state.horizon = num(button.dataset.fpH, 1); state.archive = false; render(); sync(true); };
    });
    $('fingerprintArchiveBtn').onclick = () => { state.archive = !state.archive; render(); };
    return panel;
  }
  function buildLayout() {
    if ($('fpMainToolsLayout')) return true;
    const search = document.querySelector('button[data-panel="searchPanel"]');
    const analog = document.querySelector('button[data-panel="analogsPanel"]');
    const archive = document.querySelector('button[data-panel="archivePanel"]');
    const data = document.querySelector('button[data-panel="dataPanel"]');
    const clusters = [...document.querySelectorAll('button[data-cluster-horizon]')].sort((a, b) => num(a.dataset.clusterHorizon) - num(b.dataset.clusterHorizon));
    if (!search || !analog || !archive || !data || clusters.length !== 3) return false;
    const oldTools = search.parentElement;
    const clusterRow = clusters[0].parentElement;
    if (!oldTools || !clusterRow) return false;
    const box = document.createElement('div');
    box.id = 'fpMainToolsLayout';
    const row1 = document.createElement('div');
    const row2 = document.createElement('div');
    const row3 = document.createElement('div');
    row1.className = row2.className = row3.className = 'fp-row';
    const button = document.createElement('button');
    button.id = 'fingerprintMainBtn';
    button.className = 'tool';
    button.textContent = '🧭 FINGERPRINT';
    button.setAttribute('aria-expanded', 'false');
    row1.append(search, analog, button);
    clusters.forEach(item => row2.appendChild(item));
    archive.style.gridColumn = '1';
    data.style.gridColumn = '3';
    row3.append(archive, data);
    box.append(row1, row2, row3);
    oldTools.insertAdjacentElement('beforebegin', box);
    oldTools.remove();
    clusterRow.remove();
    const panel = createPanel(box);
    button.onclick = () => {
      const open = panel.hidden;
      panel.hidden = !open;
      button.classList.toggle('active', open);
      button.setAttribute('aria-expanded', String(open));
      if (open) {
        $('archivePanel')?.classList.remove('show');
        state.archive = false;
        render();
        sync(true);
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    archive.addEventListener('click', () => {
      if (!panel.hidden) {
        panel.hidden = true;
        button.classList.remove('active');
        button.setAttribute('aria-expanded', 'false');
      }
    });
    return true;
  }
  function start() {
    styles();
    [1, 2, 3].forEach(horizon => { state.data[horizon] = readCache(horizon); });
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (buildLayout() || tries >= 40) {
        clearInterval(timer);
        if ($('fpMainToolsLayout')) {
          sync(true);
          setInterval(() => sync(false), 60000);
        }
      }
    }, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
