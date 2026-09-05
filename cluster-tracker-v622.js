'use strict';
(() => {
  const MODEL = window.POZITRON_CLUSTER_MODEL || { strategies: [] };
  const LEGACY_KEY = 'pozitron_v622_cluster_predictions_v1';
  const CACHE_KEYS = {
    1: 'pozitron_v622_archive_h1_server',
    2: 'pozitron_v622_archive_h2_server',
    3: 'pozitron_v622_archive_h3_server'
  };
  const SERVER_FILES = {
    1: './cluster-archive-next-v622.json',
    2: './cluster-archive-minus1-v622.json',
    3: './cluster-archive-minus2-v622.json'
  };
  const HORIZONS = {
    1: { button: '🎯', title: 'Следующий тираж', note: 'сейчас → следующий тираж' },
    2: { button: '⏳−1', title: 'Через один тираж', note: 'ожидание одного промежуточного тиража' },
    3: { button: '⏳−2', title: 'Через два тиража', note: 'ожидание двух промежуточных тиражей' }
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

  let activeHorizon = 1;
  let serverState = { 1: [], 2: [], 3: [] };
  let syncInFlight = false;
  let lastSyncAt = 0;

  const byId = id => document.getElementById(id);
  const pad2 = n => String(Number(n)).padStart(2, '0');
  const safeDraws = () => Array.isArray(window.draws) ? window.draws : (typeof draws !== 'undefined' && Array.isArray(draws) ? draws : []);
  const rubles = amount => `${Number(amount || 0).toLocaleString('ru-RU')} ₽`;
  const payoutFor = (selected, guessed) => Number(KENO_PAYOUTS[Number(selected)]?.[Number(guessed)] || 0);

  function readJsonStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function readLegacy() {
    const value = readJsonStorage(LEGACY_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function readCache(horizon) {
    const value = readJsonStorage(CACHE_KEYS[horizon], []);
    return Array.isArray(value) ? value : [];
  }

  function legacyFor(horizon) {
    return readLegacy().filter(x => Number(x?.horizon) === Number(horizon));
  }

  function actualFromPhone(targetDraw) {
    const d = safeDraws().find(x => Number(x?.draw) === Number(targetDraw));
    if (!d) return null;
    return {
      targetDraw: Number(d.draw),
      date: String(d.date || ''),
      time: String(d.time || ''),
      balls: Array.isArray(d.balls) ? d.balls.map(Number).slice(0, 20) : []
    };
  }

  function normalizeRecord(record, horizon) {
    if (!record || !Number.isFinite(Number(record.targetDraw))) return null;
    return {
      ...record,
      id: String(record.id || `${horizon}:${record.targetDraw}`),
      horizon: Number(record.horizon || horizon),
      sourceDraw: Number(record.sourceDraw || 0),
      targetDraw: Number(record.targetDraw),
      candidates: Array.isArray(record.candidates) ? record.candidates : []
    };
  }

  function mergeRecords(horizon) {
    const map = new Map();
    for (const raw of legacyFor(horizon)) {
      const r = normalizeRecord(raw, horizon);
      if (r) map.set(r.id, r);
    }
    for (const raw of readCache(horizon)) {
      const r = normalizeRecord(raw, horizon);
      if (r) map.set(r.id, { ...(map.get(r.id) || {}), ...r });
    }
    for (const raw of serverState[horizon] || []) {
      const r = normalizeRecord(raw, horizon);
      if (r) map.set(r.id, { ...(map.get(r.id) || {}), ...r });
    }
    return [...map.values()].sort((a, b) => Number(b.targetDraw) - Number(a.targetDraw));
  }

  async function fetchArchive(horizon) {
    const url = `${SERVER_FILES[horizon]}?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const records = Array.isArray(payload?.records) ? payload.records : [];
    serverState[horizon] = records;
    writeJsonStorage(CACHE_KEYS[horizon], records);
    return payload;
  }

  async function syncServerArchives(force = false) {
    if (syncInFlight) return;
    if (!force && Date.now() - lastSyncAt < 30000) return;
    syncInFlight = true;
    try {
      await Promise.all([1, 2, 3].map(fetchArchive));
      lastSyncAt = Date.now();
      if (byId('clusterPanel')?.classList.contains('show')) renderPanel(activeHorizon);
    } catch (error) {
      console.warn('KENO: серверные архивы временно недоступны', error);
    } finally {
      syncInFlight = false;
    }
  }

  function placesText(candidate) {
    if (candidate.kind === 'V') return `Вертикаль М${candidate.place}`;
    const end = Number(candidate.place) + Number(candidate.length) - 1;
    return `Горизонталь М${candidate.place}–М${end}`;
  }

  function sourceText(candidate) {
    const sourceDraws = Array.isArray(candidate.sourceDraws) ? candidate.sourceDraws : [];
    if (sourceDraws.length === 1) return `источник №${sourceDraws[0]}`;
    if (sourceDraws.length > 1) return `источник №${sourceDraws[0]}–${sourceDraws.at(-1)}`;
    return 'источник не указан';
  }

  function numberChips(numbers, hitSet = null) {
    return (numbers || []).map(n => {
      const hit = hitSet ? hitSet.has(Number(n)) : false;
      return `<span class="cluster-num ${hit ? 'hit' : ''}">${pad2(n)}${hit ? ' ✓' : ''}</span>`;
    }).join('');
  }

  function actualForRecord(record) {
    if (record?.actual?.balls?.length === 20) return record.actual;
    return actualFromPhone(record?.targetDraw);
  }

  function outcomeFor(candidate, actual) {
    if (!actual?.balls?.length) return null;
    if (candidate?.outcome && Number.isFinite(Number(candidate.outcome.hitCount))) return candidate.outcome;
    const actualSet = new Set(actual.balls.map(Number));
    const hitNumbers = (candidate.numbers || []).filter(n => actualSet.has(Number(n)));
    const hitCount = hitNumbers.length;
    return {
      hitNumbers,
      hitCount,
      result: hitCount === Number(candidate.length) ? 'full' : hitCount > 0 ? 'partial' : 'none',
      payout: payoutFor(Number(candidate.length), hitCount)
    };
  }

  function candidateHtml(candidate, actual) {
    const outcome = outcomeFor(candidate, actual);
    const hitSet = new Set((outcome?.hitNumbers || []).map(Number));
    const liftPercent = Math.round((Number(candidate.lift || 1) - 1) * 100);
    const payout = Number(outcome?.payout || 0);
    const full = outcome && Number(outcome.hitCount) === Number(candidate.length);
    const prizeHtml = actual && payout > 0
      ? `<div class="cluster-result prize">🔥 ${rubles(payout)}</div>`
      : '';

    return `<div class="cluster-card ${full ? 'cluster-full' : ''} ${payout > 0 ? 'cluster-prize' : ''}">
      <div class="cluster-card-head"><b>${candidate.kind === 'V' ? '↕' : '↔'} ${placesText(candidate)}</b><span>${candidate.length} числа</span></div>
      <div class="cluster-numbers">${numberChips(candidate.numbers, hitSet)}</div>
      <div class="cluster-meta">${sourceText(candidate)} · задержка ${candidate.delay} · полных сборок ${candidate.archiveFullHits}/${candidate.archiveChecks}${liftPercent > 0 ? ` · +${liftPercent}%` : ''}</div>
      ${prizeHtml}
    </div>`;
  }

  function recordSummary(record, actual) {
    const outcomes = record.candidates.map(c => outcomeFor(c, actual)).filter(Boolean);
    const totalPayout = outcomes.reduce((sum, x) => sum + Number(x.payout || 0), 0);
    return { totalPayout };
  }

  function recordHtml(record, expanded = false) {
    const actual = actualForRecord(record);
    const meta = HORIZONS[record.horizon] || HORIZONS[1];
    const summary = record.summary || recordSummary(record, actual);
    const forecastNumbers = new Set(record.candidates.flatMap(c => (c.numbers || []).map(Number)));
    const archivePrize = actual && Number(summary.totalPayout || 0) > 0 ? `🔥 ${rubles(summary.totalPayout)}` : '';

    const actualBlock = actual ? (() => {
      const actualSet = new Set(actual.balls.map(Number));
      const combinedHits = [...forecastNumbers].filter(number => actualSet.has(Number(number)));
      const combinedPayout = payoutFor(combinedHits.length, combinedHits.length);
      const combinedPrizeHtml = combinedPayout > 0
        ? `<div class="cluster-combined-prize"><span aria-hidden="true">👁️👁️</span><b>${rubles(combinedPayout)}</b></div>`
        : '';
      return `<div class="cluster-subtitle">Фактические 20 чисел</div>
        <div class="cluster-actual">${numberChips(actual.balls, forecastNumbers)}</div>
        ${combinedPrizeHtml}`;
    })() : '';

    const body = `<div class="cluster-record-summary"><b>${meta.button} тираж №${record.targetDraw}</b><span class="${archivePrize ? 'cluster-record-prize' : ''}">${actual ? archivePrize : 'ожидает результата'}</span></div>
      <div class="cluster-source-note">Зафиксировано после №${record.sourceDraw}. Прогноз после сохранения не меняется.</div>
      <div class="cluster-subtitle">Вертикальные сборки</div>
      ${record.candidates.filter(x => x.kind === 'V').map(x => candidateHtml(x, actual)).join('') || '<div class="row small">Нет вертикальных вариантов.</div>'}
      <div class="cluster-subtitle">Горизонтальные сборки</div>
      ${record.candidates.filter(x => x.kind === 'H').map(x => candidateHtml(x, actual)).join('') || '<div class="row small">Нет горизонтальных вариантов.</div>'}
      ${actualBlock}`;

    if (expanded) return `<div class="cluster-record current">${body}</div>`;
    return `<details class="cluster-record"><summary><b>${meta.button} тираж №${record.targetDraw}</b><span class="${archivePrize ? 'cluster-record-prize' : ''}">${actual ? archivePrize : '⏳ ожидает'}</span></summary>${body}</details>`;
  }

  function renderPanel(horizon = activeHorizon) {
    activeHorizon = Number(horizon) || 1;
    const panel = byId('clusterPanel');
    const box = byId('clusterResult');
    if (!panel || !box) return;

    const all = mergeRecords(activeHorizon);
    const current = all.find(r => !actualForRecord(r)) || all[0] || null;
    const older = current ? all.filter(r => r.id !== current.id) : all;
    const meta = HORIZONS[activeHorizon];
    box.innerHTML = `<div class="cluster-title"><div><b>${meta.button} ${meta.title}</b><small>${meta.note}</small></div><span>модель: ${Number(MODEL.trainedDraws || 0).toLocaleString('ru-RU')} тиражей</span></div>
      <div class="cluster-warning">Экспериментальный сигнал полной сборки. Он показывает расположение и числа блока, но не гарантирует выпадение.</div>
      ${current ? recordHtml(current, true) : '<div class="row small">Недостаточно данных для построения сборок.</div>'}
      <div class="cluster-archive-title">Архив ${meta.button}</div>
      ${older.length ? older.map(x => recordHtml(x, false)).join('') : '<div class="row small">Завершённых прошлых записей пока нет.</div>'}`;
  }

  function updateClusterButtons(openHorizon = null) {
    document.querySelectorAll('[data-cluster-horizon]').forEach(button => {
      const horizon = Number(button.dataset.clusterHorizon);
      const isOpen = Number(openHorizon) === horizon;
      button.classList.toggle('active', isOpen);
      button.setAttribute('aria-expanded', String(isOpen));
      button.innerHTML = `<span>${HORIZONS[horizon].button}</span><span class="cluster-arrow" aria-hidden="true">${isOpen ? '▼' : '▶'}</span>`;
    });
  }

  function togglePanel(horizon) {
    const panel = byId('clusterPanel');
    if (!panel) return;
    const requested = Number(horizon) || 1;
    if (panel.classList.contains('show') && Number(activeHorizon) === requested) {
      panel.classList.remove('show');
      updateClusterButtons(null);
      return;
    }
    renderPanel(requested);
    panel.classList.add('show');
    updateClusterButtons(requested);
    syncServerArchives(true);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function injectStyles() {
    if (byId('clusterTrackerStyles')) return;
    const style = document.createElement('style');
    style.id = 'clusterTrackerStyles';
    style.textContent = `
      .cluster-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
      .cluster-button{font-size:18px;padding:8px 9px;display:flex;align-items:center;justify-content:center;gap:8px}.cluster-button.active{border-color:#72df95;background:#153a2a}.cluster-arrow{font-size:13px;color:#aebfd3}
      .cluster-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px}.cluster-title b{font-size:20px}.cluster-title small{display:block;color:var(--muted);margin-top:3px}.cluster-title>span{font-size:11px;color:var(--muted);text-align:right}
      .cluster-server-ok{font-size:12px;color:#bfffd3;background:#123525;border:1px solid #43a86b;border-radius:9px;padding:8px;margin-bottom:7px}.cluster-warning{font-size:12px;color:#ffe6a0;background:#302812;border:1px solid #6e5b20;border-radius:9px;padding:8px;margin-bottom:9px}
      .cluster-record{border:1px solid #2a4464;border-radius:12px;background:#0b1727;margin:8px 0;padding:8px}.cluster-record.current{border-color:#4b719c}.cluster-record summary{cursor:pointer;display:flex;justify-content:space-between;gap:8px;list-style:none}.cluster-record summary::-webkit-details-marker{display:none}.cluster-record-summary{display:flex;justify-content:space-between;gap:8px;font-size:14px}
      .cluster-source-note,.cluster-meta{font-size:11px;color:var(--muted);line-height:1.4;margin-top:5px}.cluster-subtitle{font-size:13px;font-weight:950;color:#dceaff;margin:10px 0 4px}.cluster-section-label{font-size:11px;font-weight:900;color:#b8c9de;margin-top:7px}
      .cluster-card{background:#101f33;border:1px solid #263e5b;border-radius:10px;padding:8px;margin-top:6px}.cluster-card.cluster-full{border-color:#43d77b;background:#123525}.cluster-card.cluster-prize{box-shadow:inset 0 0 0 1px #f39a32;border-color:#f39a32}.cluster-card-head{display:flex;justify-content:space-between;gap:8px;font-size:13px}.cluster-card-head span{color:var(--muted);font-size:11px}
      .cluster-numbers,.cluster-actual{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.cluster-num{display:inline-block;min-width:38px;text-align:center;padding:5px 6px;border:1px solid #304b6d;border-radius:8px;background:#172a43;font-family:ui-monospace,Consolas,monospace;font-weight:900;font-size:13px}.cluster-num.hit{border-color:#43d77b;background:#123a28;color:#c9ffda}
      .cluster-result{font-size:12px;font-weight:900;margin-top:6px;color:#ffcf82}.cluster-result.prize{color:#ffb04a;font-size:14px}.cluster-record-prize{color:#ffb04a;font-weight:950}.cluster-combined-prize{display:flex;align-items:center;justify-content:center;gap:10px;margin:12px 0 2px;font-size:20px;color:#ffb04a;font-weight:950}.cluster-archive-title{font-size:16px;font-weight:950;margin:14px 2px 7px}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if (byId('clusterPanel')) return;
    const app = document.querySelector('.app');
    const tools = app?.querySelector('.tools');
    const searchPanel = byId('searchPanel');
    if (!app || !tools || !searchPanel) return;

    const infoButton = document.querySelector('button[data-panel="infoPanel"]');
    if (infoButton) infoButton.remove();
    const infoPanel = byId('infoPanel');
    if (infoPanel) infoPanel.remove();

    const row = document.createElement('div');
    row.className = 'cluster-tools';
    row.innerHTML = [1, 2, 3].map(h => `<button class="tool cluster-button" type="button" data-cluster-horizon="${h}" aria-label="${HORIZONS[h].title}" aria-expanded="false"><span>${HORIZONS[h].button}</span><span class="cluster-arrow" aria-hidden="true">▶</span></button>`).join('');
    tools.insertAdjacentElement('afterend', row);

    const panel = document.createElement('section');
    panel.id = 'clusterPanel';
    panel.className = 'card panel';
    panel.innerHTML = '<div id="clusterResult"></div>';
    searchPanel.parentNode.insertBefore(panel, searchPanel);

    row.querySelectorAll('[data-cluster-horizon]').forEach(button => button.addEventListener('click', () => togglePanel(Number(button.dataset.clusterHorizon))));
    updateClusterButtons(null);
  }

  function allForExport(horizon) {
    return mergeRecords(horizon).sort((a, b) => Number(a.targetDraw) - Number(b.targetDraw));
  }

  function enhanceImportExport() {
    const exportButton = byId('exportBtn');
    if (exportButton) {
      exportButton.onclick = () => {
        const payload = {
          version: 'server-archives',
          exportedAt: new Date().toISOString(),
          draws: safeDraws(),
          plusPredictions: typeof loadPlusPredictions === 'function' ? loadPlusPredictions() : [],
          clusterArchiveNext: allForExport(1),
          clusterArchiveMinus1: allForExport(2),
          clusterArchiveMinus2: allForExport(3)
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ПОЗИТРОН_КЕНО_v6_2_2_ПОЛНЫЙ_ЭКСПОРТ.json';
        link.click();
        URL.revokeObjectURL(url);
      };
    }

    const importInput = byId('importFile');
    if (importInput) {
      importInput.addEventListener('change', event => {
        const file = event.target.files?.[0];
        if (!file || !/\.json$/i.test(file.name)) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const payload = JSON.parse(String(reader.result || ''));
            if (Array.isArray(payload.clusterArchiveNext)) writeJsonStorage(CACHE_KEYS[1], payload.clusterArchiveNext);
            if (Array.isArray(payload.clusterArchiveMinus1)) writeJsonStorage(CACHE_KEYS[2], payload.clusterArchiveMinus1);
            if (Array.isArray(payload.clusterArchiveMinus2)) writeJsonStorage(CACHE_KEYS[3], payload.clusterArchiveMinus2);
            if (Array.isArray(payload.clusterPredictions)) writeJsonStorage(LEGACY_KEY, payload.clusterPredictions);
            if (Array.isArray(payload.plusPredictions) && typeof savePlusPredictions === 'function') savePlusPredictions(payload.plusPredictions);
            serverState = { 1: [], 2: [], 3: [] };
            setTimeout(() => { if (byId('clusterPanel')?.classList.contains('show')) renderPanel(activeHorizon); syncServerArchives(true); }, 50);
          } catch (_) {}
        };
        reader.readAsText(file, 'UTF-8');
      });
    }
  }

  function start() {
    injectStyles();
    injectUi();
    enhanceImportExport();
    syncServerArchives(true);

    const status = byId('status');
    if (status) {
      new MutationObserver(() => setTimeout(() => syncServerArchives(false), 0))
        .observe(status, { childList: true, characterData: true, subtree: true });
    }
    setInterval(() => syncServerArchives(false), 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
