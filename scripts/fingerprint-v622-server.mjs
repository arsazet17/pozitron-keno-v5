import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CFG = Object.freeze({ neighbors: 5, window: 80, pool: 20, sizes: [3, 4, 5], perSize: 2, eps: 0.02 });
const SOURCE_FILES = {
  1: path.join(ROOT, 'cluster-archive-next-v622.json'),
  2: path.join(ROOT, 'cluster-archive-minus1-v622.json'),
  3: path.join(ROOT, 'cluster-archive-minus2-v622.json')
};
const OUTPUT_FILES = {
  1: path.join(ROOT, 'fingerprint-archive-next-v622.json'),
  2: path.join(ROOT, 'fingerprint-archive-minus1-v622.json'),
  3: path.join(ROOT, 'fingerprint-archive-minus2-v622.json')
};
const META = {
  1: { button: '🎯', title: 'Следующий тираж' },
  2: { button: '⏳−1', title: 'Через один тираж' },
  3: { button: '⏳−2', title: 'Через два тиража' }
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

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function num(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function payoutFor(selected, guessed) {
  return Number(KENO_PAYOUTS[num(selected)]?.[num(guessed)] || 0);
}
function normalizeCandidate(candidate) {
  return {
    kind: candidate?.kind === 'H' ? 'H' : 'V',
    score: Math.max(0.0001, num(candidate?.score)),
    delay: Math.max(1, Math.min(10, num(candidate?.delay, 1))),
    numbers: Array.isArray(candidate?.numbers)
      ? candidate.numbers.map(Number).filter(n => n >= 1 && n <= 80)
      : []
  };
}
function normalizeClusterRecord(record, horizon) {
  const targetDraw = num(record?.targetDraw);
  if (!targetDraw) return null;
  const actualBalls = Array.isArray(record?.actual?.balls)
    ? record.actual.balls.map(Number).slice(0, 20)
    : [];
  return {
    id: String(record?.id || `${horizon}:${targetDraw}`),
    horizon: num(record?.horizon, horizon),
    sourceDraw: num(record?.sourceDraw, targetDraw - horizon),
    targetDraw,
    candidates: Array.isArray(record?.candidates) ? record.candidates.map(normalizeCandidate) : [],
    actual: actualBalls.length === 20 ? {
      targetDraw,
      date: String(record?.actual?.date || ''),
      time: String(record?.actual?.time || ''),
      balls: actualBalls
    } : null
  };
}
function vector(record) {
  const candidates = record?.candidates || [];
  const total = candidates.reduce((sum, item) => sum + item.score, 0) || 1;
  const result = [];
  for (let n = 1; n <= 80; n += 1) {
    const hit = candidates.filter(item => item.numbers.includes(n));
    const score = hit.reduce((sum, item) => sum + item.score, 0) / total;
    const delay = hit.reduce((sum, item) => sum + item.score * ((11 - item.delay) / 10), 0) / total;
    result.push(
      hit.length / 6,
      hit.filter(item => item.kind === 'V').length / 3,
      hit.filter(item => item.kind === 'H').length / 3,
      score,
      delay
    );
  }
  return result;
}
function currentSupport(record) {
  const out = Array(81).fill(0);
  const candidates = record?.candidates || [];
  const total = candidates.reduce((sum, item) => sum + item.score, 0) || 1;
  for (const item of candidates) {
    for (const n of item.numbers) if (n >= 1 && n <= 80) out[n] += item.score / total;
  }
  return out;
}
function distance(a, b) {
  if (!a.length || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
function nearestNeighbors(records, current) {
  const currentVector = vector(current);
  const cutoff = num(current?.sourceDraw, current.targetDraw - 1);
  const eligible = records
    .filter(record => record.targetDraw < current.targetDraw && record.targetDraw <= cutoff && record.actual?.balls?.length === 20)
    .slice(-CFG.window);
  if (eligible.length < CFG.neighbors) return [];
  const top = eligible
    .map(record => ({ record, actual: record.actual, distance: distance(currentVector, vector(record)) }))
    .filter(item => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance || b.record.targetDraw - a.record.targetDraw)
    .slice(0, CFG.neighbors);
  const rawWeights = top.map(item => 1 / (item.distance + CFG.eps));
  const totalWeight = rawWeights.reduce((sum, value) => sum + value, 0) || 1;
  return top.map((item, index) => ({ ...item, weight: rawWeights[index] / totalWeight, actualSet: new Set(item.actual.balls.map(Number)) }));
}
function buildPool(neighbors, current) {
  const votes = Array(81).fill(0);
  const support = currentSupport(current);
  for (const item of neighbors) {
    for (let n = 1; n <= 80; n += 1) if (item.actualSet.has(n)) votes[n] += item.weight;
  }
  const pool = Array.from({ length: 80 }, (_, index) => index + 1)
    .sort((a, b) => votes[b] - votes[a] || support[b] - support[a] || a - b)
    .slice(0, CFG.pool);
  return { pool, votes, support };
}
function eachCombination(values, size, callback) {
  const selected = [];
  function walk(start) {
    if (selected.length === size) { callback(selected.slice()); return; }
    const left = size - selected.length;
    for (let i = start; i <= values.length - left; i += 1) {
      selected.push(values[i]);
      walk(i + 1);
      selected.pop();
    }
  }
  if (values.length >= size) walk(0);
}
function rankCombinations(neighbors, pool, votes, support, size) {
  const ranked = [];
  const threshold = Math.max(2, size - 1);
  const pairs = size * (size - 1) / 2 || 1;
  eachCombination(pool, size, combination => {
    let fullWeight = 0;
    let fullCount = 0;
    let supportWeight = 0;
    let supportCount = 0;
    let coverageWeight = 0;
    let pairWeight = 0;
    for (const item of neighbors) {
      const actual = item.actualSet;
      let hits = 0;
      let pairHits = 0;
      for (const n of combination) if (actual.has(n)) hits += 1;
      for (let i = 0; i < combination.length; i += 1) {
        if (!actual.has(combination[i])) continue;
        for (let j = i + 1; j < combination.length; j += 1) if (actual.has(combination[j])) pairHits += 1;
      }
      coverageWeight += item.weight * (hits / size);
      pairWeight += item.weight * (pairHits / pairs);
      if (hits >= threshold) { supportWeight += item.weight; supportCount += 1; }
      if (hits === size) { fullWeight += item.weight; fullCount += 1; }
    }
    const voteMean = combination.reduce((sum, n) => sum + votes[n], 0) / size;
    const supportMean = combination.reduce((sum, n) => sum + support[n], 0) / size;
    ranked.push({
      numbers: combination,
      neighborCount: supportCount,
      neighborWeight: supportWeight,
      rank: fullWeight * 5000 + fullCount * 500 + supportWeight * 1200 + supportCount * 80 + pairWeight * 600 + coverageWeight * 300 + voteMean * 100 + supportMean
    });
  });
  ranked.sort((a, b) => b.rank - a.rank || b.neighborCount - a.neighborCount || b.neighborWeight - a.neighborWeight || a.numbers.join('-').localeCompare(b.numbers.join('-')));
  return ranked.slice(0, CFG.perSize).map((item, index) => ({
    id: `K${size}-${index + 1}`,
    size,
    numbers: item.numbers,
    neighborCount: item.neighborCount,
    neighborWeight: Number(item.neighborWeight.toFixed(6))
  }));
}
function calculate(records, current) {
  const neighbors = nearestNeighbors(records, current);
  if (neighbors.length < CFG.neighbors) return null;
  const poolData = buildPool(neighbors, current);
  const combinations = CFG.sizes.flatMap(size => rankCombinations(neighbors, poolData.pool, poolData.votes, poolData.support, size));
  if (CFG.sizes.some(size => combinations.filter(item => item.size === size).length < CFG.perSize)) return null;
  return {
    id: `fp:${current.horizon}:${current.targetDraw}`,
    version: '2.0-server',
    horizon: current.horizon,
    sourceDraw: current.sourceDraw,
    targetDraw: current.targetDraw,
    createdAt: new Date().toISOString(),
    method: 'fingerprint-manhattan-distance-weighted',
    settings: { neighbors: CFG.neighbors, historyWindow: CFG.window, poolSize: CFG.pool },
    neighbors: neighbors.map(item => ({
      targetDraw: item.record.targetDraw,
      sourceDraw: item.record.sourceDraw,
      distance: Number(item.distance.toFixed(6)),
      weight: Number(item.weight.toFixed(6))
    })),
    pool20: poolData.pool.slice(),
    combos: combinations,
    actual: null,
    status: 'pending',
    summary: null
  };
}
function settle(record, actual) {
  if (!actual?.balls?.length) return record;
  const actualSet = new Set(actual.balls.map(Number));
  const poolHits = record.pool20.filter(n => actualSet.has(Number(n)));
  const combos = record.combos.map(combo => {
    const hitNumbers = combo.numbers.filter(n => actualSet.has(Number(n)));
    const payout = payoutFor(combo.size, hitNumbers.length);
    return { ...combo, outcome: { hitNumbers, hitCount: hitNumbers.length, payout } };
  });
  const comboPayout = combos.reduce((sum, combo) => sum + num(combo.outcome?.payout), 0);
  const poolPayout = payoutFor(poolHits.length, poolHits.length);
  return {
    ...record,
    combos,
    actual: {
      targetDraw: actual.targetDraw,
      date: actual.date,
      time: actual.time,
      balls: actual.balls.slice()
    },
    status: 'checked',
    settledAt: new Date().toISOString(),
    summary: {
      poolHits,
      poolHitCount: poolHits.length,
      poolPayout,
      comboPayout,
      totalPayout: poolPayout + comboPayout
    }
  };
}
function normalizeExisting(raw, horizon) {
  const records = Array.isArray(raw?.records) ? raw.records : [];
  return {
    version: '2.0-server',
    appVersion: '6.2.2',
    horizon,
    button: META[horizon].button,
    title: META[horizon].title,
    method: 'fingerprint-manhattan-distance-weighted',
    updatedAt: raw?.updatedAt || null,
    records
  };
}
function updateHorizon(horizon) {
  const sourceRaw = readJson(SOURCE_FILES[horizon], {});
  const sourceRecords = (Array.isArray(sourceRaw?.records) ? sourceRaw.records : [])
    .map(record => normalizeClusterRecord(record, horizon))
    .filter(Boolean)
    .sort((a, b) => a.targetDraw - b.targetDraw);
  if (!sourceRecords.length) throw new Error(`Пустой серверный архив сборок для горизонта ${horizon}`);

  const outputFile = OUTPUT_FILES[horizon];
  const original = readJson(outputFile, {});
  const archive = normalizeExisting(original, horizon);
  const byId = new Map(archive.records.map(record => [String(record.id), record]));
  const sourceByTarget = new Map(sourceRecords.map(record => [record.targetDraw, record]));

  for (const current of sourceRecords) {
    const id = `fp:${horizon}:${current.targetDraw}`;
    if (!byId.has(id)) {
      const record = calculate(sourceRecords, current);
      if (record) byId.set(id, record);
    }
  }

  for (const [id, record] of byId) {
    if (record?.status === 'checked' && record?.actual?.balls?.length === 20) continue;
    const source = sourceByTarget.get(num(record.targetDraw));
    if (source?.actual?.balls?.length === 20) byId.set(id, settle(record, source.actual));
  }

  archive.records = [...byId.values()]
    .sort((a, b) => num(a.targetDraw) - num(b.targetDraw))
    .slice(-300);
  archive.latestHistoryDraw = num(sourceRaw?.latestHistoryDraw);
  archive.recordsCount = archive.records.length;
  archive.checkedCount = archive.records.filter(record => record.status === 'checked').length;
  archive.pendingCount = archive.records.filter(record => record.status !== 'checked').length;

  const changed = JSON.stringify(original?.records || []) !== JSON.stringify(archive.records)
    || num(original?.latestHistoryDraw) !== archive.latestHistoryDraw
    || String(original?.version || '') !== archive.version;
  archive.updatedAt = changed ? new Date().toISOString() : (original?.updatedAt || null);
  if (changed || !fs.existsSync(outputFile)) writeJson(outputFile, archive);
  console.log(`${META[horizon].button}: ${archive.recordsCount} записей, проверено ${archive.checkedCount}, ожидает ${archive.pendingCount}`);
}

for (const horizon of [1, 2, 3]) updateHorizon(horizon);
