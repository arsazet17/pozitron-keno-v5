'use strict';

/*
  ПОЗИТРОН КЕНО v6.2.2 — отдельный модуль 🧭 FINGERPRINT

  ВАЖНО:
  - не изменяет cluster-model-v622.js;
  - не изменяет cluster-tracker-v622.js;
  - не изменяет существующие архивы сборок;
  - не изменяет Аналоги+, базу, автообновление и workflow;
  - читает существующие серверные архивы сборок только как источник сигналов;
  - пишет только в собственные localStorage-ключи FINGERPRINT.
*/

(() => {
  const VERSION = '1.0.0';

  const CONFIG = Object.freeze({
    neighbors: 5,
    historyWindow: 80,
    poolSize: 20,
    distanceEpsilon: 0.02,
    comboSizes: Object.freeze([3, 4, 5]),
    combosPerSize: 2
  });

  const HORIZONS = Object.freeze({
    1: Object.freeze({ button: '🎯', title: 'Следующий тираж' }),
    2: Object.freeze({ button: '⏳−1', title: 'Через один тираж' }),
    3: Object.freeze({ button: '⏳−2', title: 'Через два тиража' })
  });

  const SERVER_FILES = Object.freeze({
    1: './cluster-archive-next-v622.json',
    2: './cluster-archive-minus1-v622.json',
    3: './cluster-archive-minus2-v622.json'
  });

  const STORAGE_KEYS = Object.freeze({
    1: 'pozitron_v622_fingerprint_archive_h1_v1',
    2: 'pozitron_v622_fingerprint_archive_h2_v1',
    3: 'pozitron_v622_fingerprint_archive_h3_v1'
  });

  const state = {
    activeHorizon: 1,
    archiveMode: false,
    payloads: { 1: null, 2: null, 3: null },
    syncing: false,
    lastSyncAt: 0
  };

  const byId = id => document.getElementById(id);
  const pad2 = n => String(Number(n)).padStart(2, '0');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function safeDraws() {
    try {
      if (typeof draws !== 'undefined' && Array.isArray(draws)) return draws;
    } catch (_) {}
    return [];
  }

  function readArchive(horizon) {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS[horizon]) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeArchive(horizon, records) {
    try {
      const clean = Array.isArray(records) ? records.slice(-300) : [];
      localStorage.setItem(STORAGE_KEYS[horizon], JSON.stringify(clean));
    } catch (_) {}
  }

  function saveForecast(record) {
    const horizon = Number(record.horizon);
    const records = readArchive(horizon);
    const id = String(record.id);
    const existing = records.find(item => String(item?.id) === id);
    if (existing) return { record: existing, created: false };

    records.push(record);
    records.sort((a, b) => Number(a.targetDraw) - Number(b.targetDraw));
    writeArchive(horizon, records);
    return { record, created: true };
  }

  function normalizeCandidate(raw) {
    const numbers = Array.isArray(raw?.numbers)
      ? raw.numbers.map(Number).filter(n => n >= 1 && n <= 80)
      : [];

    return {
      kind: raw?.kind === 'H' ? 'H' : 'V',
      length: finite(raw?.length, numbers.length),
      place: finite(raw?.place, 0),
      delay: clamp(finite(raw?.delay, 1), 1, 10),
      score: Math.max(0, finite(raw?.score, 0)),
      lift: finite(raw?.lift, 1),
      validationLift: finite(raw?.validationLift, 1),
      numbers
    };
  }

  function normalizeClusterRecord(raw, horizon) {
    const targetDraw = finite(raw?.targetDraw, 0);
    if (!targetDraw) return null;

    return {
      id: String(raw?.id || `${horizon}:${targetDraw}`),
      horizon: finite(raw?.horizon, horizon),
      sourceDraw: finite(raw?.sourceDraw, 0),
      targetDraw,
      status: String(raw?.status || ''),
      candidates: Array.isArray(raw?.candidates) ? raw.candidates.map(normalizeCandidate) : [],
      actual: raw?.actual && Array.isArray(raw.actual.balls)
        ? {
            targetDraw: finite(raw.actual.targetDraw, targetDraw),
            date: String(raw.actual.date || ''),
            time: String(raw.actual.time || ''),
            balls: raw.actual.balls.map(Number).filter(n => n >= 1 && n <= 80).slice(0, 20)
          }
        : null
    };
  }

  function actualFromPhone(targetDraw) {
    const draw = safeDraws().find(item => Number(item?.draw) === Number(targetDraw));
    const balls = Array.isArray(draw?.balls) ? draw.balls.map(Number).slice(0, 20) : [];
    if (balls.length !== 20) return null;
    return {
      targetDraw: Number(draw.draw),
      date: String(draw.date || ''),
      time: String(draw.time || ''),
      balls
    };
  }

  function actualForClusterRecord(record) {
    if (record?.actual?.balls?.length === 20) return record.actual;
    return actualFromPhone(record?.targetDraw);
  }

  function actualForFingerprintRecord(record) {
    const payload = state.payloads[Number(record?.horizon)];
    const clusterRecord = payload?.records?.find(item => Number(item.targetDraw) === Number(record?.targetDraw));
    if (clusterRecord) {
      const actual = actualForClusterRecord(clusterRecord);
      if (actual) return actual;
    }
    return actualFromPhone(record?.targetDraw);
  }

  async function fetchHorizon(horizon) {
    const url = `${SERVER_FILES[horizon]}?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    const records = (Array.isArray(raw?.records) ? raw.records : [])
      .map(item => normalizeClusterRecord(item, horizon))
      .filter(Boolean)
      .sort((a, b) => Number(a.targetDraw) - Number(b.targetDraw));

    const payload = {
      horizon,
      latestHistoryDraw: finite(raw?.latestHistoryDraw, 0),
      records
    };
    state.payloads[horizon] = payload;
    return payload;
  }

  function buildFingerprintVector(record) {
    const candidates = Array.isArray(record?.candidates) ? record.candidates : [];
    const totalScore = candidates.reduce((sum, candidate) => sum + Math.max(0.0001, finite(candidate.score, 0)), 0) || 1;
    const vector = [];

    for (let number = 1; number <= 80; number += 1) {
      const containing = candidates.filter(candidate => candidate.numbers.includes(number));
      const support = containing.length / 6;
      const vertical = containing.filter(candidate => candidate.kind === 'V').length / 3;
      const horizontal = containing.filter(candidate => candidate.kind === 'H').length / 3;
      const scoreShare = containing.reduce((sum, candidate) => sum + Math.max(0.0001, finite(candidate.score, 0)), 0) / totalScore;
      const delayShare = containing.reduce((sum, candidate) => {
        const score = Math.max(0.0001, finite(candidate.score, 0));
        const delayFactor = (11 - clamp(candidate.delay, 1, 10)) / 10;
        return sum + score * delayFactor;
      }, 0) / totalScore;

      vector.push(support, vertical, horizontal, scoreShare, delayShare);
    }

    return vector;
  }

  function currentNumberSupport(record) {
    const out = Array(81).fill(0);
    const candidates = Array.isArray(record?.candidates) ? record.candidates : [];
    const totalScore = candidates.reduce((sum, candidate) => sum + Math.max(0.0001, finite(candidate.score, 0)), 0) || 1;

    for (const candidate of candidates) {
      const share = Math.max(0.0001, finite(candidate.score, 0)) / totalScore;
      for (const number of candidate.numbers) {
        if (number >= 1 && number <= 80) out[number] += share;
      }
    }
    return out;
  }

  function manhattanDistance(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return Infinity;
    let total = 0;
    for (let i = 0; i < a.length; i += 1) total += Math.abs(finite(a[i], 0) - finite(b[i], 0));
    return total / a.length;
  }

  function selectNeighbors(records, current) {
    const currentVector = buildFingerprintVector(current);
    const eligible = records
      .filter(record => Number(record.targetDraw) < Number(current.targetDraw))
      .filter(record => actualForClusterRecord(record)?.balls?.length === 20)
      .slice(-CONFIG.historyWindow);

    if (eligible.length < CONFIG.neighbors) return [];

    const ranked = eligible
      .map(record => ({
        record,
        actual: actualForClusterRecord(record),
        distance: manhattanDistance(currentVector, buildFingerprintVector(record))
      }))
      .filter(item => Number.isFinite(item.distance))
      .sort((a, b) => a.distance - b.distance || Number(b.record.targetDraw) - Number(a.record.targetDraw))
      .slice(0, CONFIG.neighbors);

    const rawWeights = ranked.map(item => 1 / (item.distance + CONFIG.distanceEpsilon));
    const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0) || 1;

    return ranked.map((item, index) => ({
      ...item,
      weight: rawWeights[index] / weightTotal
    }));
  }

  function buildPool20(neighbors, current) {
    const votes = Array(81).fill(0);
    const currentSupport = currentNumberSupport(current);

    for (const neighbor of neighbors) {
      const actualSet = new Set(neighbor.actual.balls.map(Number));
      for (let number = 1; number <= 80; number += 1) {
        if (actualSet.has(number)) votes[number] += neighbor.weight;
      }
    }

    const pool20 = Array.from({ length: 80 }, (_, index) => index + 1)
      .sort((a, b) => votes[b] - votes[a] || currentSupport[b] - currentSupport[a] || a - b)
      .slice(0, CONFIG.poolSize);

    return { pool20, votes, currentSupport };
  }

  function forEachCombination(values, size, callback) {
    const chosen = [];

    function walk(start) {
      if (chosen.length === size) {
        callback(chosen.slice());
        return;
      }
      const remaining = size - chosen.length;
      for (let index = start; index <= values.length - remaining; index += 1) {
        chosen.push(values[index]);
        walk(index + 1);
        chosen.pop();
      }
    }

    if (size > 0 && values.length >= size) walk(0);
  }

  function buildCombos(neighbors, pool20, votes, currentSupport, size) {
    const poolSet = new Set(pool20);
    const map = new Map();

    for (const neighbor of neighbors) {
      const intersection = [...new Set(neighbor.actual.balls.map(Number).filter(number => poolSet.has(number)))].sort((a, b) => a - b);
      forEachCombination(intersection, size, combo => {
        const key = combo.join('-');
        const item = map.get(key) || {
          numbers: combo,
          neighborWeight: 0,
          neighborCount: 0
        };
        item.neighborWeight += neighbor.weight;
        item.neighborCount += 1;
        map.set(key, item);
      });
    }

    const ranked = [...map.values()].map(item => {
      const voteMean = item.numbers.reduce((sum, number) => sum + votes[number], 0) / size;
      const currentMean = item.numbers.reduce((sum, number) => sum + currentSupport[number], 0) / size;
      return {
        ...item,
        voteMean,
        currentMean,
        rankScore: item.neighborWeight * 1000 + item.neighborCount * 10 + voteMean + currentMean / 100
      };
    }).sort((a, b) =>
      b.rankScore - a.rankScore ||
      b.neighborCount - a.neighborCount ||
      b.neighborWeight - a.neighborWeight ||
      a.numbers.join('-').localeCompare(b.numbers.join('-'))
    );

    return ranked.slice(0, CONFIG.combosPerSize).map((item, index) => ({
      id: `K${size}-${index + 1}`,
      size,
      numbers: item.numbers.slice(),
      neighborCount: item.neighborCount,
      neighborWeight: Number(item.neighborWeight.toFixed(6))
    }));
  }

  function calculateForecast(payload, current) {
    const neighbors = selectNeighbors(payload.records, current);
    if (neighbors.length < CONFIG.neighbors) return null;

    const { pool20, votes, currentSupport } = buildPool20(neighbors, current);
    const combos = CONFIG.comboSizes.flatMap(size => buildCombos(neighbors, pool20, votes, currentSupport, size));

    if (combos.filter(item => item.size === 3).length < 2) return null;
    if (combos.filter(item => item.size === 4).length < 2) return null;
    if (combos.filter(item => item.size === 5).length < 2) return null;

    return {
      id: `fp:${current.horizon}:${current.targetDraw}`,
      version: VERSION,
      horizon: Number(current.horizon),
      sourceDraw: Number(current.sourceDraw),
      targetDraw: Number(current.targetDraw),
      createdAt: new Date().toISOString(),
      method: 'fingerprint-manhattan-distance-weighted',
      settings: {
        neighbors: CONFIG.neighbors,
        historyWindow: CONFIG.historyWindow,
        poolSize: CONFIG.poolSize
      },
      neighbors: neighbors.map(item => ({
        targetDraw: Number(item.record.targetDraw),
        sourceDraw: Number(item.record.sourceDraw),
        distance: Number(item.distance.toFixed(6)),
        weight: Number(item.weight.toFixed(6))
      })),
      pool20: pool20.slice(),
      combos
    };
  }

  function findCurrentClusterRecord(payload) {
    if (!payload?.records?.length) return null;
    return [...payload.records]
      .sort((a, b) => Number(b.targetDraw) - Number(a.targetDraw))
      .find(record => !actualForClusterRecord(record));
  }

  function ensureCurrentForecast(horizon) {
    const payload = state.payloads[horizon];
    if (!payload) return null;

    const current = findCurrentClusterRecord(payload);
    if (!current) return null;

    const id = `fp:${horizon}:${current.targetDraw}`;
    const existing = readArchive(horizon).find(item => String(item?.id) === id);
    if (existing) return { record: existing, created: false };

    const calculated = calculateForecast(payload, current);
    if (!calculated) return null;
    return saveForecast(calculated);
  }

  function hitSetFor(numbers, actual) {
    const actualSet = new Set((actual?.balls || []).map(Number));
    return new Set((numbers || []).map(Number).filter(number => actualSet.has(number)));
  }

  function chips(numbers, hitSet = null) {
    return (numbers || []).map(number => {
      const hit = hitSet ? hitSet.has(Number(number)) : false;
      return `<span class="fp-num ${hit ? 'hit' : ''}">${pad2(number)}${hit ? ' ✓' : ''}</span>`;
    }).join('');
  }

  function comboHtml(combo, actual) {
    const hits = actual ? hitSetFor(combo.numbers, actual) : null;
    const hitCount = hits ? hits.size : 0;
    const support = `${combo.neighborCount}/${CONFIG.neighbors}`;

    return `<div class="fp-combo">
      <div class="fp-combo-head"><b>${combo.id}</b><span>${actual ? `${hitCount}/${combo.size}` : `в аналогах ${support}`}</span></div>
      <div class="fp-numbers">${chips(combo.numbers, hits)}</div>
      ${actual ? `<div class="fp-combo-note">поддержка до тиража: ${support} ближайших аналогов</div>` : ''}
    </div>`;
  }

  function forecastHtml(record, expanded = true) {
    const actual = actualForFingerprintRecord(record);
    const meta = HORIZONS[record.horizon] || HORIZONS[1];
    const poolHits = actual ? hitSetFor(record.pool20, actual) : null;
    const poolHitCount = poolHits ? poolHits.size : 0;
    const groups = CONFIG.comboSizes.map(size => {
      const items = record.combos.filter(combo => Number(combo.size) === size);
      return `<div class="fp-section-label">К${size}</div>${items.map(combo => comboHtml(combo, actual)).join('')}`;
    }).join('');

    const body = `<div class="fp-record-head"><b>${meta.button} тираж №${record.targetDraw}</b><span>${actual ? `пул ${poolHitCount}/20` : 'ожидает результата'}</span></div>
      <div class="fp-note">Зафиксировано после №${record.sourceDraw}. После сохранения прогноз не меняется.</div>
      ${groups}
      <div class="fp-section-label">ПУЛ 20</div>
      <div class="fp-numbers fp-pool">${chips(record.pool20, poolHits)}</div>
      <details class="fp-neighbors"><summary>5 ближайших исторических аналогов</summary>
        ${record.neighbors.map((item, index) => `<div>${index + 1}. №${item.targetDraw} · дистанция ${item.distance.toFixed(4)}</div>`).join('')}
      </details>`;

    if (expanded) return `<div class="fp-record current">${body}</div>`;
    return `<details class="fp-record"><summary><b>${meta.button} №${record.targetDraw}</b><span>${actual ? `пул ${poolHitCount}/20` : '⏳'}</span></summary>${body}</details>`;
  }

  function currentFingerprintRecord(horizon) {
    const payload = state.payloads[horizon];
    const currentCluster = findCurrentClusterRecord(payload);
    if (!currentCluster) return null;
    const id = `fp:${horizon}:${currentCluster.targetDraw}`;
    return readArchive(horizon).find(item => String(item?.id) === id) || null;
  }

  function renderCurrent() {
    const box = byId('fingerprintResult');
    if (!box) return;

    const meta = HORIZONS[state.activeHorizon];
    const record = currentFingerprintRecord(state.activeHorizon);
    const payload = state.payloads[state.activeHorizon];

    if (!payload) {
      box.innerHTML = '<div class="fp-message">Загружаю серверный архив сигналов…</div>';
      return;
    }

    const currentCluster = findCurrentClusterRecord(payload);
    if (!currentCluster) {
      box.innerHTML = '<div class="fp-message">Серверный архив ещё не содержит будущего целевого тиража.</div>';
      return;
    }

    if (!record) {
      box.innerHTML = `<div class="fp-message">Для ${meta.button} пока недостаточно завершённых исторических отпечатков.</div>`;
      return;
    }

    box.innerHTML = forecastHtml(record, true);
  }

  function renderArchive() {
    const box = byId('fingerprintResult');
    if (!box) return;

    const records = readArchive(state.activeHorizon).sort((a, b) => Number(b.targetDraw) - Number(a.targetDraw));
    const meta = HORIZONS[state.activeHorizon];

    box.innerHTML = `<div class="fp-archive-head">📚 Архив FINGERPRINT ${meta.button}</div>
      ${records.length ? records.map(record => forecastHtml(record, false)).join('') : '<div class="fp-message">Архив пока пуст.</div>'}`;
  }

  function updateInnerButtons() {
    document.querySelectorAll('[data-fp-horizon]').forEach(button => {
      const horizon = Number(button.dataset.fpHorizon);
      button.classList.toggle('active', !state.archiveMode && horizon === state.activeHorizon);
    });
    byId('fingerprintArchiveBtn')?.classList.toggle('active', state.archiveMode);
  }

  function renderPanel() {
    updateInnerButtons();
    if (state.archiveMode) renderArchive();
    else renderCurrent();
  }

  async function syncAll(force = false) {
    if (state.syncing) return;
    if (!force && Date.now() - state.lastSyncAt < 30000) return;

    state.syncing = true;
    try {
      const results = await Promise.allSettled([1, 2, 3].map(fetchHorizon));
      state.lastSyncAt = Date.now();

      for (let horizon = 1; horizon <= 3; horizon += 1) {
        if (results[horizon - 1]?.status === 'fulfilled') ensureCurrentForecast(horizon);
      }

      if (!byId('fingerprintPanel')?.hidden) renderPanel();
    } catch (_) {
      if (!byId('fingerprintPanel')?.hidden) {
        const box = byId('fingerprintResult');
        if (box) box.innerHTML = '<div class="fp-message">FINGERPRINT: серверные архивы временно недоступны.</div>';
      }
    } finally {
      state.syncing = false;
    }
  }

  function injectStyles() {
    if (byId('fingerprintStyles')) return;

    const style = document.createElement('style');
    style.id = 'fingerprintStyles';
    style.textContent = `
      #fpMainToolsLayout{display:grid;gap:6px;margin-top:6px}
      .fp-main-row{display:grid;gap:6px}
      .fp-main-row.row-3{grid-template-columns:repeat(3,minmax(0,1fr))}
      .fp-main-row.row-2-fixed{grid-template-columns:repeat(3,minmax(0,1fr))}
      #fpMainToolsLayout .tool{min-width:0;min-height:48px;padding:8px 4px;white-space:normal}
      #fingerprintMainBtn{font-weight:900}
      #fingerprintMainBtn.active{border-color:#72df95;background:#153a2a}
      #fingerprintPanel[hidden]{display:none!important}
      #fingerprintPanel{margin-top:8px}
      .fp-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px}
      .fp-title b{font-size:20px}.fp-title span{font-size:11px;color:var(--muted);text-align:right}
      .fp-warning{font-size:12px;color:#ffe6a0;background:#302812;border:1px solid #6e5b20;border-radius:9px;padding:8px;margin-bottom:9px}
      .fp-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-bottom:8px}
      .fp-tab{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:8px 3px;font-weight:900;font-size:12px}
      .fp-tab.active{border-color:#72df95;background:#153a2a}
      .fp-record{border:1px solid #2a4464;border-radius:12px;background:#0b1727;margin:8px 0;padding:8px}
      .fp-record.current{border-color:#4b719c}
      .fp-record>summary{cursor:pointer;display:flex;justify-content:space-between;gap:8px;list-style:none}
      .fp-record>summary::-webkit-details-marker{display:none}
      .fp-record-head{display:flex;justify-content:space-between;gap:8px;font-size:14px}
      .fp-record-head span,.fp-record>summary span{color:#8eedaa;font-weight:900}
      .fp-note,.fp-combo-note{font-size:11px;color:var(--muted);line-height:1.4;margin-top:5px}
      .fp-section-label{font-size:14px;font-weight:950;color:#dceaff;margin:11px 0 5px}
      .fp-combo{background:#101f33;border:1px solid #263e5b;border-radius:10px;padding:8px;margin-top:6px}
      .fp-combo-head{display:flex;justify-content:space-between;gap:8px;font-size:13px}
      .fp-combo-head span{color:var(--muted);font-size:11px}
      .fp-numbers{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
      .fp-num{display:inline-block;min-width:38px;text-align:center;padding:5px 6px;border:1px solid #304b6d;border-radius:8px;background:#172a43;font-family:ui-monospace,Consolas,monospace;font-weight:900;font-size:13px}
      .fp-num.hit{border-color:#43d77b;background:#123a28;color:#c9ffda}
      .fp-pool{padding-bottom:2px}
      .fp-neighbors{margin-top:10px;border-top:1px solid #263e5b;padding-top:8px;color:var(--muted);font-size:11px}
      .fp-neighbors summary{cursor:pointer;color:#cbd8e7;font-weight:850;margin-bottom:5px}
      .fp-neighbors div{padding:2px 0}
      .fp-message{background:#101f33;border:1px solid #263e5b;border-radius:9px;padding:10px;color:var(--muted);font-size:12px}
      .fp-archive-head{font-size:16px;font-weight:950;margin:8px 2px}
      @media(max-width:390px){
        #fpMainToolsLayout .tool{font-size:11px;padding-left:2px;padding-right:2px}
        .fp-tabs{grid-template-columns:repeat(4,minmax(0,1fr))}
        .fp-tab{font-size:11px}
      }
    `;
    document.head.appendChild(style);
  }

  function createPanel(layout) {
    if (byId('fingerprintPanel')) return byId('fingerprintPanel');

    const panel = document.createElement('section');
    panel.id = 'fingerprintPanel';
    panel.className = 'card';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="fp-title"><div><b>🧭 FINGERPRINT</b><div class="small">Манхэттен · 5 ближайших аналогов · окно 80</div></div><span>v${VERSION}</span></div>
      <div class="fp-warning">Экспериментальный статистический алгоритм. Комбинации фиксируются до целевого тиража и не гарантируют выпадение.</div>
      <div class="fp-tabs">
        <button type="button" class="fp-tab active" data-fp-horizon="1">🎯</button>
        <button type="button" class="fp-tab" data-fp-horizon="2">⏳−1</button>
        <button type="button" class="fp-tab" data-fp-horizon="3">⏳−2</button>
        <button type="button" class="fp-tab" id="fingerprintArchiveBtn">📚 Архив</button>
      </div>
      <div id="fingerprintResult"><div class="fp-message">Загружаю серверный архив сигналов…</div></div>
    `;

    layout.insertAdjacentElement('afterend', panel);

    panel.querySelectorAll('[data-fp-horizon]').forEach(button => {
      button.addEventListener('click', () => {
        state.activeHorizon = Number(button.dataset.fpHorizon) || 1;
        state.archiveMode = false;
        ensureCurrentForecast(state.activeHorizon);
        renderPanel();
      });
    });

    byId('fingerprintArchiveBtn').addEventListener('click', () => {
      state.archiveMode = !state.archiveMode;
      renderPanel();
    });

    return panel;
  }

  function buildMainLayout() {
    if (byId('fpMainToolsLayout')) return true;

    const searchButton = document.querySelector('button[data-panel="searchPanel"]');
    const analogsButton = document.querySelector('button[data-panel="analogsPanel"]');
    const archiveButton = document.querySelector('button[data-panel="archivePanel"]');
    const dataButton = document.querySelector('button[data-panel="dataPanel"]');
    const clusterButtons = [...document.querySelectorAll('button[data-cluster-horizon]')]
      .sort((a, b) => Number(a.dataset.clusterHorizon) - Number(b.dataset.clusterHorizon));

    if (!searchButton || !analogsButton || !archiveButton || !dataButton || clusterButtons.length !== 3) return false;

    const originalTools = searchButton.parentElement;
    const clusterRow = clusterButtons[0].parentElement;
    if (!originalTools || !clusterRow) return false;

    const layout = document.createElement('div');
    layout.id = 'fpMainToolsLayout';

    const row1 = document.createElement('div');
    row1.className = 'fp-main-row row-3';

    const fingerprintButton = document.createElement('button');
    fingerprintButton.type = 'button';
    fingerprintButton.id = 'fingerprintMainBtn';
    fingerprintButton.className = 'tool';
    fingerprintButton.textContent = '🧭 FINGERPRINT';
    fingerprintButton.setAttribute('aria-expanded', 'false');
    fingerprintButton.setAttribute('aria-controls', 'fingerprintPanel');

    row1.append(searchButton, analogsButton, fingerprintButton);

    const row2 = document.createElement('div');
    row2.className = 'fp-main-row row-3';
    clusterButtons.forEach(button => row2.appendChild(button));

    const row3 = document.createElement('div');
    row3.className = 'fp-main-row row-2-fixed';
    archiveButton.style.gridColumn = '1';
    dataButton.style.gridColumn = '3';
    row3.append(archiveButton, dataButton);

    layout.append(row1, row2, row3);
    originalTools.insertAdjacentElement('beforebegin', layout);

    originalTools.remove();
    clusterRow.remove();

    const panel = createPanel(layout);

    fingerprintButton.addEventListener('click', () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      fingerprintButton.classList.toggle('active', opening);
      fingerprintButton.setAttribute('aria-expanded', String(opening));

      if (opening) {
        // FINGERPRINT имеет собственный архив комбинаций.
        // Общий архив КЕНО по датам при открытии этого модуля не показываем.
        const mainArchivePanel = byId('archivePanel');
        if (mainArchivePanel) mainArchivePanel.classList.remove('show');

        state.archiveMode = false;
        ensureCurrentForecast(state.activeHorizon);
        renderPanel();
        syncAll(true);
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Если пользователь открывает обычный Архив КЕНО,
    // FINGERPRINT сворачивается и не висит над архивом по датам.
    archiveButton.addEventListener('click', () => {
      if (panel.hidden) return;
      panel.hidden = true;
      fingerprintButton.classList.remove('active');
      fingerprintButton.setAttribute('aria-expanded', 'false');
    });

    return true;
  }

  function start() {
    injectStyles();

    let attempts = 0;
    const waitForExistingUi = setInterval(() => {
      attempts += 1;
      if (buildMainLayout() || attempts >= 40) {
        clearInterval(waitForExistingUi);
        if (byId('fpMainToolsLayout')) {
          syncAll(true);
          setInterval(() => syncAll(false), 60000);
        }
      }
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
