/* Mi Note Professional — Arnés de reproducción y evaluación de regresión (Agente 11).
 * ESM puro, cero dependencias externas, compatible con WebView Android, Web Worker y Node.js.
 *
 * Garantías de contrato:
 * 1. Distingue SIEMPRE muestras simuladas ('simulated') de hardware real ('huion-x10-hardware').
 * 2. Nunca muta trazos ni muestras originales.
 * 3. Sanitiza metadatos personales (PII) al exportar/importar lotes.
 * 4. Separa estrictamente entrenamiento/calibración de evaluación (sin fuga por ID ni huella).
 */

export const HARNESS_FORMAT = 'MiNoteReplayBatch';
export const HARNESS_VERSION = 1;
export const DEFAULT_PAGE_DIMENSIONS = Object.freeze({ w: 1000, h: 1400 });
export const RECORDING_SOURCES = Object.freeze(['simulated', 'huion-x10-hardware']);
export const DATASET_SPLITS = Object.freeze(['train', 'calibration', 'evaluation']);
export const SAMPLE_CATEGORIES = Object.freeze([
  'numbers',
  'algebra',
  'geometry',
  'data',
  'mixed',
  'noise'
]);

const ALLOWED_META_KEYS = new Set([
  'orientation',
  'tags',
  'seed',
  'split',
  'noiseLevel',
  'overtraced',
  'outOfOrder',
  'notesCount',
  'samplingHz',
  'firmwareFamily',
  'description'
]);

const ALLOWED_EXPECTED_KEYS = new Set([
  'text',
  'latex',
  'mathml',
  'shape',
  'kind',
  'reject',
  'preservedError'
]);

const nowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const deepClone = value => JSON.parse(JSON.stringify(value));

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitizePoint(pt) {
  if (!Array.isArray(pt) || pt.length < 2) return null;
  const x = Number(pt[0]);
  const y = Number(pt[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const out = [x, y];
  if (pt.length >= 3 && pt[2] !== undefined && pt[2] !== null) {
    const press = Number(pt[2]);
    out.push(Number.isFinite(press) ? Math.max(0, Math.min(1, press)) : 0.5);
  }
  if (pt.length >= 4 && pt[3] !== undefined && pt[3] !== null) {
    const t = Number(pt[3]);
    if (Number.isFinite(t) && t >= 0) {
      if (out.length === 2) out.push(0.5);
      out.push(t);
    }
  }
  return out;
}

function sanitizeStroke(stroke, index) {
  if (!stroke || typeof stroke !== 'object') return null;
  const rawPts = Array.isArray(stroke.pts) ? stroke.pts : [];
  const pts = rawPts.map(sanitizePoint).filter(Boolean);
  if (!pts.length) return null;
  const id = typeof stroke.id === 'string' && stroke.id.trim()
    ? stroke.id.trim().slice(0, 80)
    : `stroke-${index + 1}`;
  const color = typeof stroke.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(stroke.color)
    ? stroke.color
    : '#111827';
  const width = isFiniteNumber(Number(stroke.width)) && Number(stroke.width) > 0
    ? Math.min(30, Number(stroke.width))
    : 2.5;
  return { id, color, width, pts };
}

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const clean = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!ALLOWED_META_KEYS.has(k)) continue;
    if (k === 'tags' && Array.isArray(v)) {
      clean.tags = v
        .filter(item => typeof item === 'string')
        .map(item => item.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 16);
    } else if (typeof v === 'string') {
      clean[k] = v.trim().slice(0, 120);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      clean[k] = v;
    } else if (typeof v === 'boolean') {
      clean[k] = v;
    }
  }
  return clean;
}

function sanitizeExpected(expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return {};
  const clean = {};
  for (const [k, v] of Object.entries(expected)) {
    if (!ALLOWED_EXPECTED_KEYS.has(k)) continue;
    if (typeof v === 'string') clean[k] = v.trim().slice(0, 200);
    else if (typeof v === 'boolean') clean[k] = v;
  }
  return clean;
}

/**
 * Valida una muestra grabada sin mutarla.
 * Exige distinción explícita entre 'simulated' y 'huion-x10-hardware'.
 */
export function validateRecordingSample(sample) {
  const errors = [];
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    return { valid: false, errors: ['La muestra debe ser un objeto válido.'] };
  }
  if (typeof sample.id !== 'string' || !sample.id.trim()) {
    errors.push('Falta id de muestra válido.');
  }
  if (!RECORDING_SOURCES.includes(sample.source)) {
    errors.push(`source inválido: debe ser uno de ${RECORDING_SOURCES.join(' | ')}.`);
  }
  if (sample.split !== undefined && !DATASET_SPLITS.includes(sample.split)) {
    errors.push(`split inválido: debe ser uno de ${DATASET_SPLITS.join(' | ')}.`);
  }
  if (typeof sample.createdAt !== 'string' || Number.isNaN(Date.parse(sample.createdAt))) {
    errors.push('createdAt debe ser una fecha ISO válida.');
  }
  const dims = sample.pageDimensions;
  if (!dims || !isFiniteNumber(dims.w) || !isFiniteNumber(dims.h) || dims.w <= 0 || dims.h <= 0) {
    errors.push('pageDimensions debe contener { w, h } positivos.');
  }
  if (!SAMPLE_CATEGORIES.includes(sample.category)) {
    errors.push(`category inválida: debe ser una de ${SAMPLE_CATEGORIES.join(' | ')}.`);
  }
  if (!sample.expected || typeof sample.expected !== 'object' || Array.isArray(sample.expected)) {
    errors.push('expected debe ser un objeto.');
  }
  if (!Array.isArray(sample.strokes) || sample.strokes.length === 0) {
    errors.push('strokes debe ser un arreglo no vacío.');
  } else {
    sample.strokes.forEach((stroke, idx) => {
      if (!stroke || !Array.isArray(stroke.pts) || stroke.pts.length === 0) {
        errors.push(`strokes[${idx}] no contiene puntos válidos.`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Sanitiza una muestra eliminando cualquier dato personal (PII) o campo no permitido.
 * No muta la muestra de entrada.
 */
export function sanitizeSample(sample) {
  const validation = validateRecordingSample(sample);
  if (!validation.valid) {
    throw new Error(`Muestra inválida: ${validation.errors.join(' ')}`);
  }
  const strokes = sample.strokes.map((s, i) => sanitizeStroke(s, i)).filter(Boolean);
  if (!strokes.length) {
    throw new Error('La muestra no contiene trazos con puntos numéricos válidos.');
  }
  const clean = {
    id: sample.id.trim().slice(0, 120),
    source: sample.source,
    split: sample.split && DATASET_SPLITS.includes(sample.split) ? sample.split : 'evaluation',
    createdAt: new Date(sample.createdAt).toISOString(),
    pageDimensions: {
      w: Number(sample.pageDimensions.w),
      h: Number(sample.pageDimensions.h)
    },
    category: sample.category,
    expected: sanitizeExpected(sample.expected),
    strokes
  };
  const meta = sanitizeMetadata(sample.metadata);
  if (Object.keys(meta).length) clean.metadata = meta;
  return clean;
}

/**
 * Crea una muestra estándar RecordingSample validada y sanitizada.
 */
export function createRecordingSample({
  id,
  source,
  split = 'evaluation',
  createdAt = new Date().toISOString(),
  pageDimensions = DEFAULT_PAGE_DIMENSIONS,
  category,
  expected = {},
  strokes = [],
  metadata = {}
} = {}) {
  return sanitizeSample({
    id,
    source,
    split,
    createdAt,
    pageDimensions,
    category,
    expected,
    strokes,
    metadata
  });
}

/**
 * Calcula una huella determinista del contenido geométrico de los trazos de una muestra.
 * Sirve para detectar fuga de datos aunque se cambie el id de la muestra.
 */
export function sampleFingerprint(sample) {
  const strokes = Array.isArray(sample?.strokes) ? sample.strokes : [];
  let h = 2166136261;
  const mix = n => {
    h = Math.imul(h ^ (Math.round(n * 10) | 0), 16777619) >>> 0;
  };
  mix(strokes.length);
  for (const s of strokes) {
    const pts = Array.isArray(s?.pts) ? s.pts : [];
    mix(pts.length);
    const step = Math.max(1, Math.floor(pts.length / 24));
    for (let i = 0; i < pts.length; i += step) {
      mix(Number(pts[i]?.[0]) || 0);
      mix(Number(pts[i]?.[1]) || 0);
    }
    if (pts.length) {
      mix(Number(pts[pts.length - 1]?.[0]) || 0);
      mix(Number(pts[pts.length - 1]?.[1]) || 0);
    }
  }
  return `${h.toString(16).padStart(8, '0')}:${strokes.length}`;
}

/**
 * Verifica estrictamente que no haya fuga entre entrenamiento/calibración y evaluación
 * (ni por ID ni por huella geométrica de trazos).
 */
export function assertNoSplitLeakage(
  trainOrCalibrationSamples,
  evaluationSamples,
  { throwOnLeak = true } = {}
) {
  const trainIds = new Set();
  const trainFps = new Set();
  for (const s of trainOrCalibrationSamples || []) {
    if (s?.id) trainIds.add(s.id);
    trainFps.add(sampleFingerprint(s));
  }
  const leakedIds = [];
  const leakedFingerprints = [];
  for (const s of evaluationSamples || []) {
    if (s?.id && trainIds.has(s.id)) leakedIds.push(s.id);
    const fp = sampleFingerprint(s);
    if (trainFps.has(fp)) leakedFingerprints.push({ id: s?.id || 'unknown', fingerprint: fp });
  }
  const clean = leakedIds.length === 0 && leakedFingerprints.length === 0;
  if (!clean && throwOnLeak) {
    throw new Error(
      `Fuga detectada entre entrenamiento/calibración y evaluación: ` +
      `${leakedIds.length} ID(s) repetido(s), ${leakedFingerprints.length} huella(s) duplicada(s).`
    );
  }
  return { clean, leakedIds, leakedFingerprints };
}

/**
 * Separa un lote en train, calibration y evaluation garantizando aislamiento estricto.
 */
export function partitionDataset(samples) {
  const train = [];
  const calibration = [];
  const evaluation = [];
  for (const raw of samples || []) {
    const clean = sanitizeSample(raw);
    if (clean.split === 'train') train.push(clean);
    else if (clean.split === 'calibration') calibration.push(clean);
    else evaluation.push(clean);
  }
  assertNoSplitLeakage([...train, ...calibration], evaluation, { throwOnLeak: true });
  return { train, calibration, evaluation };
}

/**
 * Exporta un lote de muestras sanitizadas sin datos personales innecesarios.
 * Mantiene conteos explícitos separados entre 'simulated' y 'huion-x10-hardware'.
 */
export function exportSampleBatch(samples, { stringify = false, exportedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(samples)) throw new Error('samples debe ser un arreglo.');
  const cleanSamples = samples.map(sanitizeSample);
  let simulated = 0;
  let hardware = 0;
  const bySplit = { train: 0, calibration: 0, evaluation: 0 };
  for (const s of cleanSamples) {
    if (s.source === 'huion-x10-hardware') hardware++;
    else simulated++;
    bySplit[s.split] = (bySplit[s.split] || 0) + 1;
  }
  const payload = {
    format: HARNESS_FORMAT,
    version: HARNESS_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    counts: {
      total: cleanSamples.length,
      simulated,
      hardware,
      bySplit
    },
    samples: cleanSamples
  };
  return stringify ? JSON.stringify(payload, null, 2) : payload;
}

/**
 * Importa y sanitiza un lote de muestras desde JSON o desde objeto.
 */
export function importSampleBatch(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!parsed || typeof parsed !== 'object' || parsed.format !== HARNESS_FORMAT) {
    throw new Error(`Formato de lote inválido: se esperaba ${HARNESS_FORMAT}.`);
  }
  if (parsed.version !== HARNESS_VERSION) {
    throw new Error(`Versión de lote no soportada: ${parsed.version}.`);
  }
  if (!Array.isArray(parsed.samples)) {
    throw new Error('El lote no contiene un arreglo samples.');
  }
  return exportSampleBatch(parsed.samples, {
    stringify: false,
    exportedAt: parsed.exportedAt || new Date().toISOString()
  });
}

function strokeStartTime(stroke, fallbackIndex, defaultIntervalMs) {
  const pts = stroke?.pts || [];
  for (const p of pts) {
    if (Array.isArray(p) && p.length >= 4 && isFiniteNumber(p[3])) return p[3];
  }
  return fallbackIndex * defaultIntervalMs;
}

function strokeEndTime(stroke, startTime) {
  const pts = stroke?.pts || [];
  let maxT = startTime;
  for (const p of pts) {
    if (Array.isArray(p) && p.length >= 4 && isFiniteNumber(p[3])) {
      if (p[3] > maxT) maxT = p[3];
    }
  }
  return maxT;
}

/**
 * Reproduce los trazos de una muestra secuencialmente (llegada progresiva trazo a trazo)
 * preservando las marcas de tiempo y sin mutar la muestra original.
 */
export async function replaySampleSequentially(
  sample,
  onStroke,
  { mode = 'virtual', speed = 1, defaultIntervalMs = 220, maxDelayMs = 1500 } = {}
) {
  const clean = sanitizeSample(sample);
  const indexed = clean.strokes.map((stroke, idx) => {
    const startT = strokeStartTime(stroke, idx, defaultIntervalMs);
    const endT = strokeEndTime(stroke, startT);
    return { stroke, idx, startT, endT };
  });
  indexed.sort((a, b) => (a.startT - b.startT) || (a.idx - b.idx));

  const t0 = indexed[0]?.startT ?? 0;
  const accumulated = [];
  const steps = [];
  let prevTime = t0;

  for (let i = 0; i < indexed.length; i++) {
    const item = indexed[i];
    const deltaMs = Math.max(0, item.endT - prevTime);
    if (mode === 'realtime' && i > 0 && deltaMs > 0) {
      const waitMs = Math.min(maxDelayMs, Math.round(deltaMs / Math.max(0.1, speed)));
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    const strokeCopy = deepClone(item.stroke);
    accumulated.push(strokeCopy);
    const event = {
      sampleId: clean.id,
      source: clean.source,
      category: clean.category,
      strokeIndex: i,
      totalStrokes: indexed.length,
      stroke: strokeCopy,
      accumulatedStrokes: accumulated.map(deepClone),
      timestampMs: item.endT,
      elapsedMs: Math.max(0, item.endT - t0),
      deltaMs,
      isFinal: i === indexed.length - 1
    };
    const callbackResult = typeof onStroke === 'function' ? await onStroke(event) : undefined;
    steps.push({
      strokeIndex: i,
      strokeId: strokeCopy.id,
      timestampMs: event.timestampMs,
      elapsedMs: event.elapsedMs,
      deltaMs,
      result: callbackResult
    });
    prevTime = item.endT;
  }

  return {
    sampleId: clean.id,
    source: clean.source,
    totalStrokes: indexed.length,
    totalDurationMs: steps.length ? steps[steps.length - 1].elapsedMs : 0,
    steps
  };
}

function normalizeTextValue(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/[×✕∗·]/g, '×')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function extractPrediction(rawOutput) {
  if (!rawOutput) {
    return {
      text: null,
      latex: null,
      shape: null,
      kind: null,
      action: 'keep-handwriting',
      autoApplied: false,
      label: '<none>'
    };
  }
  const action = rawOutput.action || (rawOutput.autoApplied || rawOutput.automatic ? 'auto-apply' : 'suggest');
  const autoApplied = action === 'auto-apply' || rawOutput.autoApplied === true || rawOutput.automatic === true;
  const target = rawOutput.winner || rawOutput;
  const geom = target.geometry || null;

  const text = target.plainText ?? target.text ?? (geom?.kind === 'text' ? geom.text : null) ?? null;
  const latex = target.latex ?? null;
  const shape = target.shape ?? (target.domain === 'geometry' ? target.kind : null) ??
    (geom && geom.kind !== 'text' ? geom.kind : null) ?? null;
  const kind = target.kind ?? target.type ?? geom?.kind ?? null;

  const label =
    (latex && `latex:${normalizeTextValue(latex)}`) ||
    (text && `text:${normalizeTextValue(text)}`) ||
    (shape && `shape:${String(shape).toLowerCase()}`) ||
    (kind && `kind:${String(kind).toLowerCase()}`) ||
    '<none>';

  return { text, latex, shape, kind, action, autoApplied, label };
}

function expectedLabelOf(expected) {
  if (!expected) return '<none>';
  if (expected.reject) return '<reject>';
  if (expected.latex) return `latex:${normalizeTextValue(expected.latex)}`;
  if (expected.text) return `text:${normalizeTextValue(expected.text)}`;
  if (expected.shape) return `shape:${String(expected.shape).toLowerCase()}`;
  if (expected.kind) return `kind:${String(expected.kind).toLowerCase()}`;
  return '<none>';
}

function matchesExpected(expected, prediction) {
  if (!expected) return false;
  if (expected.reject) {
    return prediction.label === '<none>' || prediction.action === 'keep-handwriting';
  }
  if (expected.latex && prediction.latex) {
    return normalizeTextValue(expected.latex) === normalizeTextValue(prediction.latex);
  }
  if (expected.text && prediction.text) {
    return normalizeTextValue(expected.text) === normalizeTextValue(prediction.text);
  }
  if (expected.shape && prediction.shape) {
    return String(expected.shape).toLowerCase() === String(prediction.shape).toLowerCase();
  }
  if (expected.kind && prediction.kind) {
    return String(expected.kind).toLowerCase() === String(prediction.kind).toLowerCase();
  }
  return false;
}

export function computePercentile(values, p) {
  if (!Array.isArray(values) || !values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return Number(sorted[idx].toFixed(3));
}

function summarizeBucket(items) {
  const total = items.length;
  const matched = items.filter(x => x.matched).length;
  const incorrectAutoTransformCount = items.filter(x => x.incorrectAutoTransform).length;
  const latencies = items.map(x => x.latencyMs);
  return {
    total,
    matched,
    accuracy: total ? Number((matched / total).toFixed(4)) : 0,
    incorrectAutoTransformCount,
    incorrectAutoTransformRate: total ? Number((incorrectAutoTransformCount / total).toFixed(4)) : 0,
    latencyP50Ms: computePercentile(latencies, 0.5),
    latencyP95Ms: computePercentile(latencies, 0.95)
  };
}

/**
 * Ejecuta una suite de evaluación sobre cualquier reconocedor compatible `recognizerFn(strokes, ctx)`.
 * Calcula precisión global, por categoría, separada por fuente (simulada vs hardware X10),
 * tasa de transformaciones automáticas incorrectas, latencia p50/p95 y matriz de confusión.
 */
export async function evaluateSuite(
  samples,
  recognizerFn,
  {
    progressive = false,
    excludeFromEvaluation = null,
    orientation = 'portrait'
  } = {}
) {
  if (!Array.isArray(samples)) throw new Error('samples debe ser un arreglo.');
  if (typeof recognizerFn !== 'function') throw new Error('recognizerFn debe ser una función.');

  const cleanSamples = samples.map(sanitizeSample);
  if (Array.isArray(excludeFromEvaluation) && excludeFromEvaluation.length > 0) {
    assertNoSplitLeakage(excludeFromEvaluation, cleanSamples, { throwOnLeak: true });
  }

  const results = [];
  const confusionMatrix = {};
  const latencies = [];

  for (const sample of cleanSamples) {
    const context = {
      sampleId: sample.id,
      source: sample.source,
      category: sample.category,
      pageDimensions: deepClone(sample.pageDimensions),
      orientation: sample.metadata?.orientation || orientation
    };

    let rawOutput = null;
    let errorMessage = null;
    const tStart = nowMs();
    try {
      if (progressive) {
        const replay = await replaySampleSequentially(
          sample,
          async ev => recognizerFn(ev.accumulatedStrokes, { ...context, isFinal: ev.isFinal, strokeIndex: ev.strokeIndex }),
          { mode: 'virtual' }
        );
        rawOutput = replay.steps.length ? replay.steps[replay.steps.length - 1].result : null;
      } else {
        rawOutput = await recognizerFn(deepClone(sample.strokes), { ...context, isFinal: true });
      }
    } catch (err) {
      errorMessage = err?.message || String(err);
    }
    const latencyMs = Number(Math.max(0, nowMs() - tStart).toFixed(3));
    latencies.push(latencyMs);

    const prediction = extractPrediction(rawOutput);
    const expectedLabel = expectedLabelOf(sample.expected);
    const predictedLabel = errorMessage ? '<error>' : prediction.label;
    const matched = !errorMessage && matchesExpected(sample.expected, prediction);
    const incorrectAutoTransform = !matched && prediction.autoApplied;

    if (!confusionMatrix[expectedLabel]) confusionMatrix[expectedLabel] = {};
    confusionMatrix[expectedLabel][predictedLabel] =
      (confusionMatrix[expectedLabel][predictedLabel] || 0) + 1;

    results.push({
      sampleId: sample.id,
      source: sample.source,
      split: sample.split,
      category: sample.category,
      expectedLabel,
      predictedLabel,
      matched,
      autoApplied: prediction.autoApplied,
      incorrectAutoTransform,
      latencyMs,
      error: errorMessage
    });
  }

  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  const categorySummary = {};
  for (const [cat, list] of Object.entries(byCategory)) {
    categorySummary[cat] = summarizeBucket(list);
  }

  const simulatedList = results.filter(r => r.source === 'simulated');
  const hardwareList = results.filter(r => r.source === 'huion-x10-hardware');
  const overall = summarizeBucket(results);
  const meanLatency = latencies.length
    ? Number((latencies.reduce((s, v) => s + v, 0) / latencies.length).toFixed(3))
    : 0;

  return {
    total: overall.total,
    matched: overall.matched,
    accuracy: overall.accuracy,
    incorrectAutoTransformCount: overall.incorrectAutoTransformCount,
    incorrectAutoTransformRate: overall.incorrectAutoTransformRate,
    latencyMs: {
      count: latencies.length,
      min: latencies.length ? Math.min(...latencies) : 0,
      mean: meanLatency,
      p50: overall.latencyP50Ms,
      p95: overall.latencyP95Ms,
      max: latencies.length ? Math.max(...latencies) : 0
    },
    bySource: {
      simulated: summarizeBucket(simulatedList),
      'huion-x10-hardware': summarizeBucket(hardwareList)
    },
    byCategory: categorySummary,
    confusionMatrix,
    results
  };
}

/* ==========================================================================
 * Generador determinista de muestras simuladas (siempre source: 'simulated')
 * Separación estricta entre train/calibration y evaluation mediante semillas
 * y transformaciones distintas.
 * ========================================================================== */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTimedStroke(id, rawPoints, startT, dtMs, rng, jitter = 0.6) {
  const pts = rawPoints.map((pt, i) => {
    const jx = (rng() - 0.5) * 2 * jitter;
    const jy = (rng() - 0.5) * 2 * jitter;
    const x = Number(Math.max(5, Math.min(995, pt[0] + jx)).toFixed(2));
    const y = Number(Math.max(5, Math.min(1395, pt[1] + jy)).toFixed(2));
    const press = Number((0.45 + rng() * 0.35).toFixed(3));
    const t = Math.round(startT + i * dtMs);
    return [x, y, press, t];
  });
  return { id, color: '#111827', width: 2.5, pts };
}

function interpolateSegment(a, b, steps = 10) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

function makePolyline(vertices, stepsPerEdge = 8) {
  const pts = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const seg = interpolateSegment(vertices[i], vertices[i + 1], stepsPerEdge);
    if (i > 0) seg.shift();
    pts.push(...seg);
  }
  return pts;
}

function makeCirclePoints(cx, cy, r, count = 36) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Genera un conjunto determinista de muestras simuladas para un split dado
 * ('train', 'calibration' o 'evaluation').
 * Todas las muestras llevan `source: 'simulated'` y son disjuntas entre splits.
 */
export function generateDeterministicDataset({ seed = 2026, split = 'evaluation' } = {}) {
  if (!DATASET_SPLITS.includes(split)) {
    throw new Error(`split inválido: ${split}`);
  }
  const splitSalt = split === 'train' ? 101 : split === 'calibration' ? 307 : 709;
  const rng = mulberry32(seed * 31 + splitSalt);
  const dx = split === 'train' ? 0 : split === 'calibration' ? 37 : 73;
  const dy = split === 'train' ? 0 : split === 'calibration' ? 41 : 89;
  const scale = split === 'train' ? 1.0 : split === 'calibration' ? 1.06 : 0.94;
  const createdAt = '2026-11-24T00:00:00.000Z';

  const shift = (x, y) => [x * scale + dx, y * scale + dy];
  const samples = [];

  // 1. Números y aritmética (incluyendo caso de error pedagógico preservado 2+2=5)
  samples.push(createRecordingSample({
    id: `sim-${split}-num-42`,
    source: 'simulated',
    split,
    createdAt,
    category: 'numbers',
    expected: { text: '42', kind: 'number' },
    strokes: [
      makeTimedStroke('s1', makePolyline([shift(140, 120), shift(110, 165), shift(155, 165)], 6), 100, 12, rng),
      makeTimedStroke('s2', makePolyline([shift(140, 120), shift(140, 195)], 6), 340, 12, rng),
      makeTimedStroke('s3', makePolyline([shift(180, 130), shift(210, 120), shift(215, 145), shift(180, 195), shift(220, 195)], 6), 600, 12, rng)
    ],
    metadata: { seed, split, tags: ['digits', 'two-digit'] }
  }));

  samples.push(createRecordingSample({
    id: `sim-${split}-num-error-preserved`,
    source: 'simulated',
    split,
    createdAt,
    category: 'numbers',
    expected: { text: '2+2=5', preservedError: true },
    strokes: [
      makeTimedStroke('s1', makePolyline([shift(100, 260), shift(130, 255), shift(100, 310), shift(135, 310)], 5), 100, 10, rng),
      makeTimedStroke('s2', makePolyline([shift(160, 270), shift(160, 300)], 5), 320, 10, rng),
      makeTimedStroke('s3', makePolyline([shift(145, 285), shift(175, 285)], 5), 480, 10, rng),
      makeTimedStroke('s4', makePolyline([shift(195, 260), shift(225, 255), shift(195, 310), shift(230, 310)], 5), 650, 10, rng),
      makeTimedStroke('s5', makePolyline([shift(250, 278), shift(285, 278)], 5), 880, 10, rng),
      makeTimedStroke('s6', makePolyline([shift(250, 294), shift(285, 294)], 5), 1020, 10, rng),
      makeTimedStroke('s7', makePolyline([shift(335, 258), shift(305, 258), shift(305, 282), shift(335, 290), shift(330, 310), shift(305, 310)], 5), 1200, 10, rng)
    ],
    metadata: { seed, split, tags: ['arithmetic', 'pedagogical-fidelity'] }
  }));

  // 2. Fracción 2D (numerador, barra horizontal, denominador; escrita fuera de orden en evaluation)
  const fracBase = [
    makeTimedStroke('f-num', makePolyline([shift(420, 140), shift(450, 140), shift(435, 162), shift(455, 182), shift(420, 188)], 5), 100, 12, rng),
    makeTimedStroke('f-bar', makePolyline([shift(400, 205), shift(475, 205)], 8), split === 'evaluation' ? 580 : 320, 12, rng),
    makeTimedStroke('f-den', makePolyline([shift(445, 222), shift(418, 255), shift(462, 255)], 5), split === 'evaluation' ? 320 : 580, 12, rng),
    makeTimedStroke('f-den2', makePolyline([shift(445, 222), shift(445, 276)], 5), 760, 12, rng)
  ];
  samples.push(createRecordingSample({
    id: `sim-${split}-frac-3-4`,
    source: 'simulated',
    split,
    createdAt,
    category: 'numbers',
    expected: { latex: '\\frac{3}{4}', text: '3/4', kind: 'fraction' },
    strokes: fracBase,
    metadata: { seed, split, outOfOrder: split === 'evaluation', tags: ['fraction', '2d-structure'] }
  }));

  // 3. Símbolos matemáticos / álgebra (x + 5 = 12)
  samples.push(createRecordingSample({
    id: `sim-${split}-alg-linear`,
    source: 'simulated',
    split,
    createdAt,
    category: 'algebra',
    expected: { latex: 'x+5=12', text: 'x+5=12', kind: 'equation' },
    strokes: [
      makeTimedStroke('a1', makePolyline([shift(110, 420), shift(145, 465)], 6), 100, 10, rng),
      makeTimedStroke('a2', makePolyline([shift(145, 420), shift(110, 465)], 6), 240, 10, rng),
      makeTimedStroke('a3', makePolyline([shift(175, 428), shift(175, 458)], 5), 400, 10, rng),
      makeTimedStroke('a4', makePolyline([shift(160, 443), shift(190, 443)], 5), 520, 10, rng),
      makeTimedStroke('a5', makePolyline([shift(235, 420), shift(210, 420), shift(210, 442), shift(236, 450), shift(232, 468), shift(210, 468)], 5), 680, 10, rng),
      makeTimedStroke('a6', makePolyline([shift(255, 436), shift(285, 436)], 5), 900, 10, rng),
      makeTimedStroke('a7', makePolyline([shift(255, 450), shift(285, 450)], 5), 1020, 10, rng),
      makeTimedStroke('a8', makePolyline([shift(310, 420), shift(310, 468)], 6), 1180, 10, rng),
      makeTimedStroke('a9', makePolyline([shift(332, 425), shift(362, 422), shift(332, 468), shift(365, 468)], 5), 1320, 10, rng)
    ],
    metadata: { seed, split, tags: ['algebra', 'equation'] }
  }));

  // 4. Figuras geométricas: circunferencia, rectángulo (2:1, nunca colapsar a cuadrado) y triángulo
  const cCenter = shift(280, 680);
  samples.push(createRecordingSample({
    id: `sim-${split}-geo-circle`,
    source: 'simulated',
    split,
    createdAt,
    category: 'geometry',
    expected: { shape: 'circle', kind: 'circle' },
    strokes: [
      makeTimedStroke('g-circ', makeCirclePoints(cCenter[0], cCenter[1], 75 * scale, 40), 100, 10, rng, 1.1)
    ],
    metadata: { seed, split, tags: ['geometry', 'circle'] }
  }));

  samples.push(createRecordingSample({
    id: `sim-${split}-geo-rectangle`,
    source: 'simulated',
    split,
    createdAt,
    category: 'geometry',
    expected: { shape: 'rectangle', kind: 'polygon' },
    strokes: [
      makeTimedStroke('g-rect-1', makePolyline([shift(480, 600), shift(680, 600)], 10), 100, 12, rng, 1.0),
      makeTimedStroke('g-rect-2', makePolyline([shift(680, 600), shift(680, 700)], 10), 340, 12, rng, 1.0),
      makeTimedStroke('g-rect-3', makePolyline([shift(680, 700), shift(480, 700)], 10), 580, 12, rng, 1.0),
      makeTimedStroke('g-rect-4', makePolyline([shift(480, 700), shift(480, 600)], 10), 820, 12, rng, 1.0)
    ],
    metadata: { seed, split, tags: ['geometry', 'rectangle', 'preserve-proportions'] }
  }));

  samples.push(createRecordingSample({
    id: `sim-${split}-geo-triangle`,
    source: 'simulated',
    split,
    createdAt,
    category: 'geometry',
    expected: { shape: 'triangle', kind: 'polygon' },
    strokes: [
      makeTimedStroke(
        'g-tri',
        makePolyline([shift(250, 960), shift(350, 820), shift(450, 960), shift(250, 960)], 10),
        100,
        11,
        rng,
        1.1
      )
    ],
    metadata: { seed, split, tags: ['geometry', 'triangle'] }
  }));

  // 5. Trazos repasados (overtracing) y ruido accidental (micro-puntos)
  samples.push(createRecordingSample({
    id: `sim-${split}-noise-overtraced-line`,
    source: 'simulated',
    split,
    createdAt,
    category: 'geometry',
    expected: { shape: 'line', kind: 'line' },
    strokes: [
      makeTimedStroke('ov-1', makePolyline([shift(140, 1120), shift(440, 1120)], 14), 100, 10, rng, 1.2),
      makeTimedStroke('ov-2', makePolyline([shift(438, 1122), shift(142, 1119)], 14), 320, 10, rng, 1.4)
    ],
    metadata: { seed, split, overtraced: true, noiseLevel: 0.15, tags: ['overtracing', 'robustness'] }
  }));

  samples.push(createRecordingSample({
    id: `sim-${split}-noise-accidental-dots`,
    source: 'simulated',
    split,
    createdAt,
    category: 'noise',
    expected: { reject: true, kind: 'noise' },
    strokes: [
      makeTimedStroke('dot-1', [shift(600, 1150), shift(601.5, 1151)], 100, 8, rng, 0.3),
      makeTimedStroke('dot-2', [shift(640, 1180), shift(641, 1181.2)], 260, 8, rng, 0.3)
    ],
    metadata: { seed, split, noiseLevel: 0.9, tags: ['accidental-dots', 'reject'] }
  }));

  return samples;
}
