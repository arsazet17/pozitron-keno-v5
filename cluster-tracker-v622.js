'use strict';
(() => {
  const MODEL = window.POZITRON_CLUSTER_MODEL || { strategies: [] };
  const STORAGE_KEY = 'pozitron_v622_cluster_predictions_v1';
  const STORAGE_LIMIT = 1200;
  const HORIZONS = {
    1: { button: '🎯', title: 'Следующий тираж', note: 'сейчас → следующий тираж' },
    2: { button: '⏳−1', title: 'Через один тираж', note: 'ожидание одного промежуточного тиража' },
    3: { button: '⏳−2', title: 'Через два тиража', note: 'ожидание двух промежуточных тиражей' }
  };

  // Официальная таблица выплат КЕНО со скриншотов пользователя.
  // Первый ключ — сколько чисел выбрано, второй — сколько угадано.
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
  let lastSeenDraw = 0;

  const byId = id => document.getElementById(id);
  const pad2 = n => String(Number(n)).padStart(2, '0');
  const safeDraws = () => Array.isArray(draws) ? draws : [];
  const payoutFor = (selected, guessed) => Number(KENO_PAYOUTS[Number(selected)]?.[Number(guessed)] || 0);
  const rubles = amount => `${Number(amount).toLocaleString('ru-RU')} ₽`;

  function readArchive() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeArchive(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-STORAGE_LIMIT)));
    } catch (_) {
      // Запрет localStorage не должен ломать основное приложение.
    }
  }

  function areDrawsConsecutive(list, start, end) {
    for (let i = start + 1; i <= end; i += 1) {
      if (Number(list[i]?.draw) !== Number(list[i - 1]?.draw) + 1) return false;
    }
    return true;
  }

  function sourceForStrategy(strategy, horizon) {
    const list = safeDraws();
    if (!list.length || Number(strategy.d) < horizon) return null;
    const sourceEnd = list.length - 1 + horizon - Number(strategy.d);
    if (sourceEnd < 0 || sourceEnd >= list.length) return null;

    if (strategy.t === 'V') {
      const sourceStart = sourceEnd - Number(strategy.n) + 1;
      if (sourceStart < 0 || !areDrawsConsecutive(list, sourceStart, sourceEnd)) return null;
      const numbers = [];
      const sourceDraws = [];
      for (let i = sourceStart; i <= sourceEnd; i += 1) {
        const value = Number(list[i]?.balls?.[Number(strategy.m) - 1]);
        if (!(value >= 1 && value <= 80)) return null;
        numbers.push(value);
        sourceDraws.push(Number(list[i].draw));
      }
      // Повтор одного числа не считается полной вертикалью из N разных чисел.
      if (new Set(numbers).size !== numbers.length) return null;
      return { numbers, sourceDraws, sourceStart, sourceEnd };
    }

    const draw = list[sourceEnd];
    const start = Number(strategy.m) - 1;
    const numbers = (draw?.balls || []).slice(start, start + Number(strategy.n)).map(Number);
    if (numbers.length !== Number(strategy.n) || new Set(numbers).size !== numbers.length) return null;
    return { numbers, sourceDraws: [Number(draw.draw)], sourceStart: sourceEnd, sourceEnd };
  }

  function overlapTooHigh(numbers, selected) {
    const current = new Set(numbers);
    return selected.some(item => {
      const other = new Set(item.numbers);
      let shared = 0;
      current.forEach(n => { if (other.has(n)) shared += 1; });
      return shared / Math.min(current.size, other.size) > 0.60;
    });
  }

  function buildCandidates(horizon) {
    const strategies = Array.isArray(MODEL.strategies) ? MODEL.strategies : [];
    const prepared = [];

    for (const strategy of strategies) {
      const source = sourceForStrategy(strategy, horizon);
      if (!source) continue;
      prepared.push({
        kind: strategy.t,
        length: Number(strategy.n),
        place: Number(strategy.m),
        delay: Number(strategy.d),
        numbers: source.numbers,
        sourceDraws: source.sourceDraws,
        archiveChecks: Number(strategy.a),
        archiveFullHits: Number(strategy.h),
        lift: Number(strategy.l),
        validationLift: Number(strategy.v),
        score: Number(strategy.s)
      });
    }

    const result = [];
    for (const kind of ['V', 'H']) {
      const pool = prepared.filter(x => x.kind === kind).sort((a, b) => b.score - a.score || b.archiveFullHits - a.archiveFullHits);
      const chosen = [];
      for (const item of pool) {
        if (overlapTooHigh(item.numbers, chosen)) continue;
        chosen.push(item);
        if (chosen.length === 3) break;
      }
      if (chosen.length < 3) {
        for (const item of pool) {
          if (chosen.includes(item)) continue;
          chosen.push(item);
          if (chosen.length === 3) break;
        }
      }
      result.push(...chosen);
    }
    return result;
  }

  function recordId(horizon, targetDraw) {
    return `${horizon}:${targetDraw}`;
  }

  function createPrediction(horizon) {
    const list = safeDraws();
    if (list.length < 15) return null;
    const latest = list.at(-1);
    const targetDraw = Number(latest.draw) + Number(horizon);
    const records = readArchive();
    const id = recordId(horizon, targetDraw);
    const existing = records.find(x => x.id === id);
    if (existing) return existing;

    const candidates = buildCandidates(horizon);
    if (!candidates.length) return null;
    const record = {
      id,
      horizon: Number(horizon),
      sourceDraw: Number(latest.draw),
      targetDraw,
      createdAt: new Date().toISOString(),
      modelVersion: MODEL.version || '1.0',
      modelDraws: Number(MODEL.trainedDraws || 0),
      candidates
    };
    records.push(record);
    records.sort((a, b) => Number(a.targetDraw) - Number(b.targetDraw) || Number(a.horizon) - Number(b.horizon));
    writeArchive(records);
    return record;
  }

  function ensureAllPredictions() {
    for (const horizon of [1, 2, 3]) createPrediction(horizon);
  }

  function actualFor(targetDraw) {
    return safeDraws().find(d => Number(d.draw) === Number(targetDraw)) || null;
  }

  function placesText(candidate) {
    if (candidate.kind === 'V') return `Вертикаль М${candidate.place}`;
    const end = candidate.place + candidate.length - 1;
    return `Горизонталь М${candidate.place}–М${end}`;
  }

  function sourceText(candidate) {
    if (candidate.sourceDraws.length === 1) return `источник №${candidate.sourceDraws[0]}`;
    return `источник №${candidate.sourceDraws[0]}–${candidate.sourceDraws.at(-1)}`;
  }

  function numberChips(numbers, actualSet) {
    return numbers.map(n => {
      const hit = actualSet ? actualSet.has(Number(n)) : false;
      return `<span class="cluster-num ${hit ? 'hit' : ''}">${pad2(n)}${hit ? ' ✓' : ''}</span>`;
    }).join('');
  }

  function candidateHtml(candidate, actual) {
    const actualSet = actual ? new Set(actual.balls.map(Number)) : null;
    const hits = actualSet ? candidate.numbers.filter(n => actualSet.has(Number(n))).length : null;
    const full = hits === candidate.length;
    const payout = actual ? payoutFor(candidate.length, hits) : 0;
    const liftPercent = Math.round((candidate.lift - 1) * 100);
    const prizeHtml = actual && payout > 0
      ? `<div class="cluster-result prize">🔥 ${rubles(payout)}</div>`
      : '';
    return `<div class="cluster-card ${full ? 'cluster-full' : ''} ${payout > 0 ? 'cluster-prize' : ''}">
      <div class="cluster-card-head"><b>${candidate.kind === 'V' ? '↕' : '↔'} ${placesText(candidate)}</b><span>${candidate.length} числа</span></div>
      <div class="cluster-numbers">${numberChips(candidate.numbers, actualSet)}</div>
      <div class="cluster-meta">${sourceText(candidate)} · задержка ${candidate.delay} · полных сборок ${candidate.archiveFullHits}/${candidate.archiveChecks}${liftPercent > 0 ? ` · +${liftPercent}%` : ''}</div>
      ${prizeHtml}
    </div>`;
  }

  function recordHtml(record, expanded = false) {
    const actual = actualFor(record.targetDraw);
    const meta = HORIZONS[record.horizon] || HORIZONS[1];
    const checkedCandidates = actual ? record.candidates.map(candidate => {
      const actualSet = new Set(actual.balls.map(Number));
      const hits = candidate.numbers.filter(n => actualSet.has(Number(n))).length;
      return { candidate, hits, payout: payoutFor(candidate.length, hits) };
    }) : [];
    const totalPayout = checkedCandidates.reduce((sum, x) => sum + x.payout, 0);
    const archivePrize = actual && totalPayout > 0 ? `🔥 ${rubles(totalPayout)}` : '';
    const body = `<div class="cluster-record-summary"><b>${meta.button} №${record.targetDraw}</b><span class="${totalPayout > 0 ? 'cluster-record-prize' : ''}">${actual ? archivePrize : 'ожидает результата'}</span></div>
      <div class="cluster-source-note">Зафиксировано после №${record.sourceDraw}. Прогноз после сохранения не меняется.</div>
      <div class="cluster-subtitle">Вертикальные сборки</div>
      ${record.candidates.filter(x => x.kind === 'V').map(x => candidateHtml(x, actual)).join('')}
      <div class="cluster-subtitle">Горизонтальные сборки</div>
      ${record.candidates.filter(x => x.kind === 'H').map(x => candidateHtml(x, actual)).join('')}
      ${actual ? (() => {
        const forecastNumbers = new Set(record.candidates.flatMap(candidate => candidate.numbers.map(Number)));
        return `<div class="cluster-subtitle">Фактические 20 чисел</div><div class="cluster-actual">${numberChips(actual.balls, forecastNumbers)}</div>`;
      })() : ''}`;
    if (expanded) return `<div class="cluster-record current">${body}</div>`;
    return `<details class="cluster-record"><summary><b>${meta.button} тираж №${record.targetDraw}</b><span class="${totalPayout > 0 ? 'cluster-record-prize' : ''}">${actual ? archivePrize : '⏳ ожидает'}</span></summary>${body}</details>`;
  }

  function renderPanel(horizon = activeHorizon) {
    activeHorizon = Number(horizon) || 1;
    const panel = byId('clusterPanel');
    const box = byId('clusterResult');
    if (!panel || !box) return;
    ensureAllPredictions();

    const all = readArchive().filter(x => Number(x.horizon) === activeHorizon).sort((a, b) => Number(b.targetDraw) - Number(a.targetDraw));
    const current = all[0] || null;
    const older = all.slice(1, 31);
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
    const requestedHorizon = Number(horizon) || 1;
    const sameOpenPanel = panel.classList.contains('show') && Number(activeHorizon) === requestedHorizon;

    if (sameOpenPanel) {
      panel.classList.remove('show');
      updateClusterButtons(null);
      return;
    }

    renderPanel(requestedHorizon);
    panel.classList.add('show');
    updateClusterButtons(requestedHorizon);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function injectStyles() {
    if (byId('clusterTrackerStyles')) return;
    const style = document.createElement('style');
    style.id = 'clusterTrackerStyles';
    style.textContent = `
      .cluster-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
      .cluster-button{font-size:18px;padding:8px 9px;display:flex;align-items:center;justify-content:center;gap:8px}.cluster-button.active{border-color:#72df95;background:#153a2a}.cluster-arrow{font-size:13px;line-height:1;color:#aebfd3}
      .cluster-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px}
      .cluster-title b{font-size:20px}.cluster-title small{display:block;color:var(--muted);margin-top:3px}.cluster-title>span{font-size:11px;color:var(--muted);text-align:right}
      .cluster-warning{font-size:12px;color:#ffe6a0;background:#302812;border:1px solid #6e5b20;border-radius:9px;padding:8px;margin-bottom:9px}
      .cluster-record{border:1px solid #2a4464;border-radius:12px;background:#0b1727;margin:8px 0;padding:8px}
      .cluster-record.current{border-color:#4b719c}.cluster-record summary{cursor:pointer;display:flex;justify-content:space-between;gap:8px;list-style:none}
      .cluster-record summary::-webkit-details-marker{display:none}.cluster-record-summary{display:flex;justify-content:space-between;gap:8px;font-size:14px}
      .cluster-source-note,.cluster-meta{font-size:11px;color:var(--muted);line-height:1.4;margin-top:5px}
      .cluster-subtitle{font-size:13px;font-weight:950;color:#dceaff;margin:10px 0 4px}
      .cluster-card{background:#101f33;border:1px solid #263e5b;border-radius:10px;padding:8px;margin-top:6px}
      .cluster-card.cluster-full{border-color:#43d77b;background:#123525}.cluster-card.cluster-prize{box-shadow:inset 0 0 0 1px #f39a32;border-color:#f39a32}.cluster-card-head{display:flex;justify-content:space-between;gap:8px;font-size:13px}
      .cluster-card-head span{color:var(--muted);font-size:11px}.cluster-numbers,.cluster-actual{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
      .cluster-num{display:inline-block;min-width:38px;text-align:center;padding:5px 6px;border:1px solid #304b6d;border-radius:8px;background:#172a43;font-family:ui-monospace,Consolas,monospace;font-weight:900;font-size:13px}
      .cluster-num.hit{border-color:#43d77b;background:#123a28;color:#c9ffda}.cluster-result{font-size:12px;font-weight:900;margin-top:6px;color:#ffcf82}.cluster-result.good{color:#72df95}.cluster-result.prize,.cluster-record-prize{color:#ffb04a;font-weight:950}
      .cluster-archive-title{font-size:16px;font-weight:950;margin:14px 2px 7px}
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

    row.querySelectorAll('[data-cluster-horizon]').forEach(button => {
      button.addEventListener('click', () => togglePanel(Number(button.dataset.clusterHorizon)));
    });
    updateClusterButtons(null);
  }

  function enhanceImportExport() {
    const exportButton = byId('exportBtn');
    if (exportButton) {
      exportButton.onclick = () => {
        const payload = {
          version: '6.2.2',
          exportedAt: new Date().toISOString(),
          draws: safeDraws(),
          clusterPredictions: readArchive(),
          plusPredictions: typeof loadPlusPredictions === 'function' ? loadPlusPredictions() : []
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'ПОЗИТРОН_КЕНО_v6_2_2_БАЗА_И_СБОРКИ.json';
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
            if (Array.isArray(payload.clusterPredictions)) writeArchive(payload.clusterPredictions);
            if (Array.isArray(payload.plusPredictions) && typeof savePlusPredictions === 'function') savePlusPredictions(payload.plusPredictions);
            setTimeout(() => renderPanel(activeHorizon), 50);
          } catch (_) {
            // Обычный JSON/CSV продолжает обрабатываться основным импортом.
          }
        };
        reader.readAsText(file, 'UTF-8');
      });
    }
  }

  function refreshIfNeeded() {
    const latest = Number(safeDraws().at(-1)?.draw || 0);
    if (!latest || latest === lastSeenDraw) return;
    lastSeenDraw = latest;
    ensureAllPredictions();
    if (byId('clusterPanel')?.classList.contains('show')) renderPanel(activeHorizon);
  }

  function start() {
    injectStyles();
    injectUi();
    enhanceImportExport();
    refreshIfNeeded();
    const status = byId('status');
    if (status) new MutationObserver(() => setTimeout(refreshIfNeeded, 0)).observe(status, { childList: true, characterData: true, subtree: true });
    setInterval(refreshIfNeeded, 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
