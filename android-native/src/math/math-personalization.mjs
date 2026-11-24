/* Mi Note Professional — Aprendizaje personalizado local (Agente 7).
 * Perfil 100% local, serializable y reversible. Nunca muta trazos de entrada,
 * nunca envía datos a la red y acota su sesgo a ±0.12 para no forzar lecturas. */

export const PROFILE_VERSION = 1;
export const MAX_BIAS_DELTA = 0.12;
export const DEFAULT_SAMPLE_COUNT = 20;
export const MAX_PROTOTYPES_PER_SYMBOL = 3;

export const CALIBRATION_PACKS = Object.freeze({
  numbers: Object.freeze(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
  operators: Object.freeze(['+', '-', '×', '÷', '=', '(', ')']),
  algebra: Object.freeze(['x', 'y', 'a', 'b', 'n']),
  fractions: Object.freeze(['1/2', '3/4']),
  powers: Object.freeze(['x^2', '2^3']),
  roots: Object.freeze(['√x', '√9']),
  geometry: Object.freeze(['circle', 'square', 'rectangle', 'triangle', 'line'])
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const isFinitePoint = p =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function sanitizeSymbolKey(value) {
  const s = String(value ?? '').trim();
  if (!s || s.length > 24) return null;
  if (s === '__proto__' || s === 'constructor' || s === 'prototype') return null;
  return s;
}

/**
 * Extrae una firma geométrica y angular normalizada a partir de trazos inmutables.
 * Nunca modifica los trazos ni sus arreglos `pts`.
 */
export function extractStrokeSignature(strokes, sampleCount = DEFAULT_SAMPLE_COUNT) {
  if (!Array.isArray(strokes) || strokes.length === 0) return null;
  const nSamples = clamp(Math.floor(Number(sampleCount) || DEFAULT_SAMPLE_COUNT), 8, 64);

  const cleanPaths = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const stroke of strokes) {
    const rawPts = Array.isArray(stroke?.pts) ? stroke.pts : Array.isArray(stroke) ? stroke : [];
    const pts = [];
    for (const p of rawPts) {
      if (!isFinitePoint(p)) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      pts.push([x, y]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (pts.length >= 2) cleanPaths.push(pts);
  }

  if (cleanPaths.length === 0) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  const diag = Math.hypot(width, height);
  if (diag < 1e-3) return null;

  // Concatenar trazos manteniendo el orden para remuestreo uniforme de arco
  const scaleX = Math.max(width, 1e-3);
  const scaleY = Math.max(height, 1e-3);
  const segments = [];
  let totalLen = 0;

  for (const path of cleanPaths) {
    for (let i = 1; i < path.length; i++) {
      const a = [(path[i - 1][0] - minX) / scaleX, (path[i - 1][1] - minY) / scaleY];
      const b = [(path[i][0] - minX) / scaleX, (path[i][1] - minY) / scaleY];
      const len = dist(a, b);
      if (len > 1e-6) {
        segments.push({ a, b, len, cumStart: totalLen, cumEnd: totalLen + len });
        totalLen += len;
      }
    }
  }

  if (segments.length === 0 || totalLen <= 1e-6) return null;

  const points = [];
  for (let k = 0; k < nSamples; k++) {
    const target = (k / (nSamples - 1)) * totalLen;
    let seg = segments[segments.length - 1];
    for (let s = 0; s < segments.length; s++) {
      if (target <= segments[s].cumEnd || s === segments.length - 1) {
        seg = segments[s];
        break;
      }
    }
    const localT = clamp((target - seg.cumStart) / Math.max(seg.len, 1e-9), 0, 1);
    const px = Number((seg.a[0] + (seg.b[0] - seg.a[0]) * localT).toFixed(4));
    const py = Number((seg.a[1] + (seg.b[1] - seg.a[1]) * localT).toFixed(4));
    points.push([px, py]);
  }

  const directions = computeDirections(points);
  const aspectRatio = Number((width / Math.max(height, 1)).toFixed(4));

  return {
    points,
    directions,
    strokeCount: cleanPaths.length,
    aspectRatio,
    bbox: { minX, minY, maxX, maxY, width, height, diag }
  };
}

function computeDirections(points) {
  const dirs = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const len = Math.hypot(dx, dy);
    dirs.push(len > 1e-6 ? Number(Math.atan2(dy, dx).toFixed(4)) : 0);
  }
  return dirs;
}

/**
 * Compara dos firmas normalizadas combinando similitud espacial, similitud angular,
 * relación de aspecto y cantidad de trazos. Devuelve un puntaje en [0, 1].
 */
export function compareSignatures(sigA, sigB) {
  if (!sigA?.points?.length || !sigB?.points?.length) return 0;
  const ptsA = sigA.points;
  const ptsB = sigB.points;
  const n = Math.min(ptsA.length, ptsB.length);
  if (n < 4) return 0;

  // 1. Distancia espacial punto-a-punto (directa e invertida para tolerar sentido opuesto)
  let sumFwd = 0;
  let sumRev = 0;
  for (let i = 0; i < n; i++) {
    const idxA = Math.round((i / (n - 1)) * (ptsA.length - 1));
    const idxB = Math.round((i / (n - 1)) * (ptsB.length - 1));
    const idxBRev = Math.round(((n - 1 - i) / (n - 1)) * (ptsB.length - 1));
    sumFwd += dist(ptsA[idxA], ptsB[idxB]);
    sumRev += dist(ptsA[idxA], ptsB[idxBRev]);
  }
  const spatialDist = Math.min(sumFwd, sumRev) / n;
  const spatialSim = clamp(1 - spatialDist * 1.45, 0, 1);

  // 2. Similitud angular (coseno medio de diferencia de direcciones)
  const dirsA = Array.isArray(sigA.directions) && sigA.directions.length ? sigA.directions : computeDirections(ptsA);
  const dirsB = Array.isArray(sigB.directions) && sigB.directions.length ? sigB.directions : computeDirections(ptsB);
  const m = Math.min(dirsA.length, dirsB.length);
  let angularSim = spatialSim;
  if (m > 0) {
    let cosFwd = 0;
    let cosRev = 0;
    for (let i = 0; i < m; i++) {
      cosFwd += Math.cos(dirsA[i] - dirsB[i]);
      cosRev += Math.cos(dirsA[i] - (dirsB[m - 1 - i] + Math.PI));
    }
    const bestCos = Math.max(cosFwd, cosRev) / m;
    angularSim = clamp((bestCos + 1) / 2, 0, 1);
  }

  // 3. Compatibilidad de relación de aspecto y número de trazos
  const arA = Number(sigA.aspectRatio) || 1;
  const arB = Number(sigB.aspectRatio) || 1;
  const arPenalty = Math.min(0.25, Math.abs(Math.log((arA + 0.08) / (arB + 0.08))) * 0.14);

  const scA = Number(sigA.strokeCount) || 1;
  const scB = Number(sigB.strokeCount) || 1;
  const strokePenalty = scA === scB ? 0 : Math.min(0.18, Math.abs(scA - scB) * 0.08);

  const combined = spatialSim * 0.58 + angularSim * 0.42 - arPenalty - strokePenalty;
  return Number(clamp(combined, 0, 1).toFixed(4));
}

/**
 * Crea un perfil local limpio compatible con el contrato `UserHandwritingProfile`.
 */
export function createUserProfile(overrides = {}) {
  const now = new Date().toISOString();
  const rawMaxBias = Number(overrides.maxBiasDelta);
  const maxBiasDelta = Number.isFinite(rawMaxBias) ? clamp(rawMaxBias, 0, MAX_BIAS_DELTA) : MAX_BIAS_DELTA;

  return {
    version: PROFILE_VERSION,
    enabled: overrides.enabled !== false,
    updatedAt: typeof overrides.updatedAt === 'string' ? overrides.updatedAt : now,
    confusionMatrix: Object.create(null) ? { ...(overrides.confusionMatrix || {}) } : {},
    symbolPrototypes: { ...(overrides.symbolPrototypes || {}) },
    frequentSymbols: { ...(overrides.frequentSymbols || {}) },
    preferences: {
      decimalSeparator: overrides.preferences?.decimalSeparator === '.' ? '.' : ',',
      divisionSymbol: overrides.preferences?.divisionSymbol === ':' ? ':' : '÷',
      multiplicationSymbol: overrides.preferences?.multiplicationSymbol === '·' ? '·' : '×',
      pauseMs: clamp(Number(overrides.preferences?.pauseMs) || 1100, 350, 2500),
      sensitivity: clamp(Number(overrides.preferences?.sensitivity) || 1.0, 0.5, 1.5)
    },
    calibrationHistory: Array.isArray(overrides.calibrationHistory)
      ? deepClone(overrides.calibrationHistory)
      : [],
    maxBiasDelta
  };
}

/**
 * Restablece por completo el perfil de aprendizaje local sin alterar cuadernos ni trazos.
 */
export function resetUserProfile() {
  return createUserProfile({ enabled: true });
}

/**
 * Serializa el perfil a JSON local compacto (sin datos de red ni referencias circulares).
 */
export function serializeUserProfile(profile) {
  const safe = deserializeUserProfile(JSON.stringify(profile || createUserProfile()));
  return JSON.stringify(safe);
}

/**
 * Deserializa y valida estrictamente un perfil guardado localmente.
 * Garantiza que `maxBiasDelta` nunca supere `MAX_BIAS_DELTA` (0.12).
 */
export function deserializeUserProfile(jsonText) {
  let parsed;
  try {
    parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  } catch {
    return createUserProfile();
  }
  if (!parsed || typeof parsed !== 'object') return createUserProfile();

  const confusionMatrix = {};
  if (parsed.confusionMatrix && typeof parsed.confusionMatrix === 'object') {
    for (const [k, v] of Object.entries(parsed.confusionMatrix)) {
      if (k.length <= 52 && k.includes('->') && Number.isFinite(Number(v)) && Number(v) > 0) {
        confusionMatrix[k] = Math.min(10000, Math.floor(Number(v)));
      }
    }
  }

  const frequentSymbols = {};
  if (parsed.frequentSymbols && typeof parsed.frequentSymbols === 'object') {
    for (const [k, v] of Object.entries(parsed.frequentSymbols)) {
      const key = sanitizeSymbolKey(k);
      if (key && Number.isFinite(Number(v)) && Number(v) > 0) {
        frequentSymbols[key] = Math.min(100000, Math.floor(Number(v)));
      }
    }
  }

  const symbolPrototypes = {};
  if (parsed.symbolPrototypes && typeof parsed.symbolPrototypes === 'object') {
    for (const [k, list] of Object.entries(parsed.symbolPrototypes)) {
      const key = sanitizeSymbolKey(k);
      if (!key || !Array.isArray(list)) continue;
      const validList = [];
      for (const item of list.slice(0, MAX_PROTOTYPES_PER_SYMBOL)) {
        if (!item || !Array.isArray(item.points) || item.points.length < 8) continue;
        const pts = item.points.filter(isFinitePoint).map(p => [Number(p[0]), Number(p[1])]);
        if (pts.length < 8) continue;
        validList.push({
          points: pts,
          directions: Array.isArray(item.directions) && item.directions.length === pts.length - 1
            ? item.directions.map(Number)
            : computeDirections(pts),
          strokeCount: clamp(Math.floor(Number(item.strokeCount) || 1), 1, 20),
          aspectRatio: clamp(Number(item.aspectRatio) || 1, 0.05, 20),
          samples: clamp(Math.floor(Number(item.samples) || 1), 1, 10000)
        });
      }
      if (validList.length) symbolPrototypes[key] = validList;
    }
  }

  const calibrationHistory = Array.isArray(parsed.calibrationHistory)
    ? parsed.calibrationHistory
        .filter(e => e && typeof e.category === 'string' && typeof e.target === 'string')
        .slice(-200)
        .map(e => ({
          category: e.category.slice(0, 32),
          target: e.target.slice(0, 24),
          samples: clamp(Math.floor(Number(e.samples) || 1), 1, 1000),
          updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : new Date().toISOString()
        }))
    : [];

  return createUserProfile({
    enabled: parsed.enabled !== false,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    confusionMatrix,
    symbolPrototypes,
    frequentSymbols,
    preferences: parsed.preferences || {},
    calibrationHistory,
    maxBiasDelta: parsed.maxBiasDelta
  });
}

function mergePrototypeIntoList(existingList, signature) {
  const list = deepClone(existingList || []);
  const candidate = {
    points: signature.points,
    directions: signature.directions,
    strokeCount: signature.strokeCount,
    aspectRatio: signature.aspectRatio,
    samples: 1
  };

  if (list.length === 0) return [candidate];

  let bestIdx = -1;
  let bestSim = -1;
  for (let i = 0; i < list.length; i++) {
    const sim = compareSignatures(list[i], signature);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  // Si es similar a un prototipo existente, actualizar por promedio exponencial acotado
  if (bestIdx >= 0 && bestSim >= 0.72 && list[bestIdx].points.length === signature.points.length) {
    const prev = list[bestIdx];
    const alpha = Math.max(0.18, 1 / (prev.samples + 1));
    const mergedPoints = prev.points.map((pt, idx) => [
      Number((pt[0] * (1 - alpha) + signature.points[idx][0] * alpha).toFixed(4)),
      Number((pt[1] * (1 - alpha) + signature.points[idx][1] * alpha).toFixed(4))
    ]);
    list[bestIdx] = {
      points: mergedPoints,
      directions: computeDirections(mergedPoints),
      strokeCount: prev.strokeCount,
      aspectRatio: Number((prev.aspectRatio * (1 - alpha) + signature.aspectRatio * alpha).toFixed(4)),
      samples: prev.samples + 1
    };
    return list;
  }

  if (list.length < MAX_PROTOTYPES_PER_SYMBOL) {
    list.push(candidate);
    return list;
  }

  // Reemplazar el prototipo menos reforzado si ya alcanzamos el límite de 3 variantes
  let minIdx = 0;
  for (let i = 1; i < list.length; i++) {
    if (list[i].samples < list[minIdx].samples) minIdx = i;
  }
  list[minIdx] = candidate;
  return list;
}

/**
 * Registra una corrección confirmada por el usuario (o muestra de calibración).
 * Retorna un nuevo perfil inmutable; jamás modifica el perfil ni los trazos originales.
 */
export function recordUserCorrection(profile, { predicted = null, actual, strokes = null, category = null } = {}) {
  const base = createUserProfile(profile || {});
  const targetKey = sanitizeSymbolKey(actual);
  if (!targetKey) return base;

  const next = deepClone(base);
  next.updatedAt = new Date().toISOString();

  // 1. Actualizar diccionario de símbolos frecuentes
  next.frequentSymbols[targetKey] = (next.frequentSymbols[targetKey] || 0) + 1;

  // 2. Actualizar matriz de confusión si el reconocedor predijo algo distinto
  const predKey = sanitizeSymbolKey(predicted);
  if (predKey && predKey !== targetKey) {
    const pair = `${predKey}->${targetKey}`;
    next.confusionMatrix[pair] = (next.confusionMatrix[pair] || 0) + 1;
  }

  // 3. Extraer y fusionar prototipo de trazo normalizado si se entregaron trazos válidos
  if (Array.isArray(strokes) && strokes.length > 0) {
    const sig = extractStrokeSignature(strokes);
    if (sig) {
      next.symbolPrototypes[targetKey] = mergePrototypeIntoList(next.symbolPrototypes[targetKey], sig);
    }
  }

  if (category && typeof category === 'string') {
    const existing = next.calibrationHistory.find(
      e => e.category === category && e.target === targetKey
    );
    if (existing) {
      existing.samples += 1;
      existing.updatedAt = next.updatedAt;
    } else {
      next.calibrationHistory.push({
        category: category.slice(0, 32),
        target: targetKey,
        samples: 1,
        updatedAt: next.updatedAt
      });
    }
  }

  return next;
}

/**
 * Actualiza parámetros personales validados sin mutar el perfil original.
 */
export function updatePersonalPreferences(profile, patch = {}) {
  const base = createUserProfile(profile || {});
  const next = deepClone(base);
  if (patch.decimalSeparator === ',' || patch.decimalSeparator === '.') {
    next.preferences.decimalSeparator = patch.decimalSeparator;
  }
  if (patch.divisionSymbol === '÷' || patch.divisionSymbol === ':') {
    next.preferences.divisionSymbol = patch.divisionSymbol;
  }
  if (patch.multiplicationSymbol === '×' || patch.multiplicationSymbol === '·') {
    next.preferences.multiplicationSymbol = patch.multiplicationSymbol;
  }
  if (Number.isFinite(Number(patch.pauseMs))) {
    next.preferences.pauseMs = clamp(Math.round(Number(patch.pauseMs)), 350, 2500);
  }
  if (Number.isFinite(Number(patch.sensitivity))) {
    next.preferences.sensitivity = Number(clamp(Number(patch.sensitivity), 0.5, 1.5).toFixed(2));
  }
  if (typeof patch.enabled === 'boolean') {
    next.enabled = patch.enabled;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * Calcula el ajuste de sesgo personal acotado a `[-maxBiasDelta, +maxBiasDelta]` (±0.12).
 * Combina similitud contra prototipos personales, historial de confusiones y frecuencia.
 */
export function computePersonalBias(profile, { candidateSymbol, topPredicted = null, strokes = null } = {}) {
  const cap = clamp(Number(profile?.maxBiasDelta) || MAX_BIAS_DELTA, 0, MAX_BIAS_DELTA);
  if (!profile?.enabled) {
    return { delta: 0, prototypeSimilarity: 0, confusionSupport: 0, frequencySupport: 0, reasons: ['profile-disabled'] };
  }
  const sym = sanitizeSymbolKey(candidateSymbol);
  if (!sym) {
    return { delta: 0, prototypeSimilarity: 0, confusionSupport: 0, frequencySupport: 0, reasons: ['invalid-symbol'] };
  }

  const reasons = [];
  let delta = 0;

  // A. Similitud con prototipos personales del símbolo candidato
  let prototypeSimilarity = 0;
  const protos = profile.symbolPrototypes?.[sym];
  if (Array.isArray(protos) && protos.length > 0 && Array.isArray(strokes) && strokes.length > 0) {
    const sig = extractStrokeSignature(strokes);
    if (sig) {
      for (const proto of protos) {
        const sim = compareSignatures(sig, proto);
        if (sim > prototypeSimilarity) prototypeSimilarity = sim;
      }
      if (prototypeSimilarity >= 0.72) {
        const boost = (prototypeSimilarity - 0.65) * 0.22; // hasta ~0.077
        delta += boost;
        reasons.push(`prototype-match:${prototypeSimilarity.toFixed(2)}`);
      } else if (prototypeSimilarity < 0.42) {
        delta -= 0.03;
        reasons.push(`prototype-mismatch:${prototypeSimilarity.toFixed(2)}`);
      }
    }
  }

  // B. Soporte por matriz de confusión (ej. si "1->7" ocurrió varias veces)
  let confusionSupport = 0;
  const pred = sanitizeSymbolKey(topPredicted);
  if (pred && pred !== sym) {
    const count = Number(profile.confusionMatrix?.[`${pred}->${sym}`]) || 0;
    if (count > 0) {
      confusionSupport = Math.min(1, count / 4);
      delta += confusionSupport * 0.045;
      reasons.push(`confusion-prior:${pred}->${sym}(${count})`);
    }
  } else if (pred && pred === sym) {
    // Si `pred` suele corregirse a otro símbolo con frecuencia, aplicar penalización suave
    let redirected = 0;
    for (const [k, v] of Object.entries(profile.confusionMatrix || {})) {
      if (k.startsWith(`${pred}->`)) redirected += Number(v) || 0;
    }
    if (redirected >= 2) {
      delta -= Math.min(0.04, redirected * 0.01);
      reasons.push(`frequent-false-positive:${pred}(${redirected})`);
    }
  }

  // C. Diccionario de símbolos frecuentes (aporte muy suave <= 0.015)
  let frequencySupport = 0;
  const freqCount = Number(profile.frequentSymbols?.[sym]) || 0;
  if (freqCount > 0) {
    const totalFreq = Object.values(profile.frequentSymbols || {}).reduce((s, n) => s + (Number(n) || 0), 0);
    if (totalFreq > 0) {
      frequencySupport = Math.min(1, freqCount / Math.max(5, totalFreq * 0.25));
      delta += frequencySupport * 0.015;
      reasons.push(`frequent-symbol:${freqCount}`);
    }
  }

  const clampedDelta = Number(clamp(delta, -cap, cap).toFixed(4));
  return {
    delta: clampedDelta,
    prototypeSimilarity: Number(prototypeSimilarity.toFixed(4)),
    confusionSupport: Number(confusionSupport.toFixed(4)),
    frequencySupport: Number(frequencySupport.toFixed(4)),
    reasons
  };
}

/**
 * Aplica el perfil personal a una lista de candidatos de un motor base sin mutarlos.
 * Preserva `baseScore` para auditoría y jamás excede `±maxBiasDelta`.
 */
export function applyProfileToCandidates(profile, candidates, { strokes = null } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const sortedBase = [...candidates].sort((a, b) => (Number(b?.score) || 0) - (Number(a?.score) || 0));
  const topPredicted = sortedBase[0]?.symbol ?? null;

  return sortedBase
    .map(item => {
      const baseScore = clamp(Number(item?.score) || 0, 0, 1);
      const bias = computePersonalBias(profile, {
        candidateSymbol: item?.symbol,
        topPredicted,
        strokes
      });
      const adjustedScore = Number(clamp(baseScore + bias.delta, 0, 1).toFixed(4));
      return {
        ...item,
        baseScore,
        personalDelta: bias.delta,
        personalReasons: bias.reasons,
        score: adjustedScore
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Devuelve los símbolos más frecuentes del docente ordenados descendentemente.
 */
export function getFrequentSymbols(profile, limit = 15) {
  const entries = Object.entries(profile?.frequentSymbols || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, limit));
  return entries.map(([symbol, count]) => ({ symbol, count }));
}

/**
 * Gestor de sesión de calibración guiada para robustecer el perfil del docente.
 * Cubre números 0–9, operadores, álgebra, fracciones, potencias, raíces y figuras.
 * Permite repetir ejemplos del mismo símbolo o avanzar/saltar libremente.
 */
export function createCalibrationSession(
  initialProfile = null,
  categories = ['numbers', 'operators', 'algebra', 'fractions', 'powers', 'roots', 'geometry']
) {
  let profile = createUserProfile(initialProfile || {});
  const items = [];
  for (const cat of categories) {
    const targets = CALIBRATION_PACKS[cat];
    if (!targets) continue;
    for (const target of targets) {
      items.push({ category: cat, target, samplesRecorded: 0, skipped: false });
    }
  }

  let index = 0;

  function getCurrentPrompt() {
    if (index >= items.length) return null;
    const item = items[index];
    return {
      index,
      total: items.length,
      category: item.category,
      target: item.target,
      samplesRecorded: item.samplesRecorded
    };
  }

  function submitSample(strokes, { repeat = false } = {}) {
    if (index >= items.length) {
      return { accepted: false, reason: 'session-complete', prompt: null };
    }
    const sig = extractStrokeSignature(strokes);
    if (!sig || sig.bbox.diag < 4) {
      return { accepted: false, reason: 'insufficient-ink', prompt: getCurrentPrompt() };
    }
    const item = items[index];
    profile = recordUserCorrection(profile, {
      actual: item.target,
      strokes,
      category: item.category
    });
    item.samplesRecorded += 1;
    item.skipped = false;
    if (!repeat) index += 1;
    return {
      accepted: true,
      target: item.target,
      category: item.category,
      samplesRecorded: item.samplesRecorded,
      prompt: getCurrentPrompt()
    };
  }

  function repeatCurrent() {
    if (index > 0 && index >= items.length) index = items.length - 1;
    else if (index > 0 && items[index].samplesRecorded === 0) index -= 1;
    return getCurrentPrompt();
  }

  function skip() {
    if (index < items.length) {
      items[index].skipped = true;
      index += 1;
    }
    return getCurrentPrompt();
  }

  function getProgress() {
    const completed = items.filter(it => it.samplesRecorded > 0).length;
    const repeatedSamples = items.reduce((sum, it) => sum + Math.max(0, it.samplesRecorded - 1), 0);
    const totalSamples = items.reduce((sum, it) => sum + it.samplesRecorded, 0);
    return {
      completed,
      total: items.length,
      totalSamples,
      repeatedSamples,
      percent: items.length ? Math.round((completed / items.length) * 100) : 100,
      done: index >= items.length
    };
  }

  function finish() {
    return deepClone(profile);
  }

  return {
    getCurrentPrompt,
    submitSample,
    repeatCurrent,
    skip,
    getProgress,
    finish
  };
}
