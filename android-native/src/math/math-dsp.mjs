/* Procesamiento digital de trazos (DSP) para Mi Note Professional.
 * Módulo ES puro, sin dependencias externas, compatible con WebView, Web Worker y Node.js.
 * Regla de inmutabilidad: NUNCA muta los trazos de entrada; siempre conserva referencias originales.
 * Espacio de coordenadas A5: 1000 x 1400. */

export const PAGE = Object.freeze({ width: 1000, height: 1400 });

const EPS = 1e-9;
const TWO_PI = Math.PI * 2;

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : Date.now());

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist2D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const distSq2D = (a, b) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

function isFinitePoint(p) {
  if (Array.isArray(p)) {
    return p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));
  }
  if (p && typeof p === 'object') {
    return Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
  }
  return false;
}

/**
 * Extrae una copia inmutable de puntos en formato [x, y, press, t?],
 * respetando el espacio A5 (1000x1400) cuando clampToPage está activo.
 */
export function extractPoints(strokeOrPts, options = {}) {
  const { clampToPage = true, defaultPress = 0.5, defaultDtMs = 16 } = options;
  const rawPts = Array.isArray(strokeOrPts) ? strokeOrPts : (Array.isArray(strokeOrPts?.pts) ? strokeOrPts.pts : []);
  const baseT = !Array.isArray(strokeOrPts) && Number.isFinite(Number(strokeOrPts?.t ?? strokeOrPts?.startedAt ?? strokeOrPts?.timestamp))
    ? Number(strokeOrPts.t ?? strokeOrPts.startedAt ?? strokeOrPts.timestamp)
    : null;

  const out = [];
  let hasExplicitTime = false;

  for (let i = 0; i < rawPts.length; i++) {
    const raw = rawPts[i];
    if (!isFinitePoint(raw)) continue;
    let x = Array.isArray(raw) ? Number(raw[0]) : Number(raw.x);
    let y = Array.isArray(raw) ? Number(raw[1]) : Number(raw.y);
    if (clampToPage) {
      x = clamp(x, 0, PAGE.width);
      y = clamp(y, 0, PAGE.height);
    }
    const rawPress = Array.isArray(raw) ? raw[2] : raw.press;
    const press = Number.isFinite(Number(rawPress)) ? clamp(Number(rawPress), 0, 1) : defaultPress;
    const rawT = Array.isArray(raw) ? raw[3] : raw.t;
    if (Number.isFinite(Number(rawT))) {
      hasExplicitTime = true;
      out.push([x, y, press, Number(rawT)]);
    } else if (baseT !== null) {
      out.push([x, y, press, baseT + out.length * defaultDtMs]);
    } else {
      out.push([x, y, press]);
    }
  }

  // Si hubo timestamps parciales, garantizar monotonía no decreciente sin perder consistencia.
  if (hasExplicitTime) {
    let lastT = out.find(p => p.length >= 4)?.[3] ?? 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i].length < 4) {
        lastT += defaultDtMs;
        out[i] = [out[i][0], out[i][1], out[i][2], lastT];
      } else {
        if (out[i][3] < lastT) out[i][3] = lastT;
        lastT = out[i][3];
      }
    }
  }
  return out;
}

/**
 * Calcula la caja delimitadora (bounding box) de un arreglo de puntos.
 */
export function computeBoundingBox(pts) {
  if (!Array.isArray(pts) || pts.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0, diagonal: 0, area: 0, aspectRatio: 1 };
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0], y = pts[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    diagonal: Math.hypot(width, height),
    area: width * height,
    aspectRatio: height > EPS ? width / height : (width > EPS ? Infinity : 1)
  };
}

export function mergeBoundingBoxes(boxes) {
  if (!boxes || !boxes.length) return computeBoundingBox([]);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (!b) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return computeBoundingBox([]);
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX, maxX, minY, maxY, width, height,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    diagonal: Math.hypot(width, height),
    area: width * height,
    aspectRatio: height > EPS ? width / height : (width > EPS ? Infinity : 1)
  };
}

/**
 * Longitud de arco acumulada y total.
 */
export function computeArcLength(pts) {
  const n = pts?.length || 0;
  if (n === 0) return { total: 0, cumulative: [], chord: 0, straightness: 1 };
  const cumulative = new Array(n);
  cumulative[0] = 0;
  for (let i = 1; i < n; i++) {
    cumulative[i] = cumulative[i - 1] + dist2D(pts[i - 1], pts[i]);
  }
  const total = cumulative[n - 1];
  const chord = n >= 2 ? dist2D(pts[0], pts[n - 1]) : 0;
  const straightness = total > EPS ? clamp(chord / total, 0, 1) : 1;
  return { total, cumulative, chord, straightness };
}

/* ============================================================================
 * 1. FILTRADO Y SUAVIZADO DE SEÑAL (One Euro Filter y Media Móvil de referencia)
 * ============================================================================ */

function lowPassAlpha(cutoff, dtSec) {
  const tau = 1 / (TWO_PI * Math.max(cutoff, 1e-4));
  return 1 / (1 + tau / Math.max(dtSec, 1e-5));
}

function oneEuroPass(pts, { minCutoff, beta, dCutoff, defaultDtMs }) {
  const out = new Array(pts.length);
  out[0] = pts[0].slice();

  let xPrev = pts[0][0];
  let yPrev = pts[0][1];
  let dxPrev = 0;
  let dyPrev = 0;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    const hasT = p.length >= 4 && prev.length >= 4 && Number.isFinite(p[3]) && Number.isFinite(prev[3]);
    const dtMs = hasT ? Math.max(1, Math.abs(p[3] - prev[3])) : defaultDtMs;
    const dtSec = dtMs / 1000;

    const dx = (p[0] - xPrev) / dtSec;
    const dy = (p[1] - yPrev) / dtSec;
    const ad = lowPassAlpha(dCutoff, dtSec);
    const edx = ad * dx + (1 - ad) * dxPrev;
    const edy = ad * dy + (1 - ad) * dyPrev;

    const speed = Math.hypot(edx, edy);
    const cutoff = minCutoff + beta * speed;
    const a = lowPassAlpha(cutoff, dtSec);

    const xHat = a * p[0] + (1 - a) * xPrev;
    const yHat = a * p[1] + (1 - a) * yPrev;

    xPrev = xHat;
    yPrev = yHat;
    dxPrev = edx;
    dyPrev = edy;

    const copy = p.slice();
    copy[0] = xHat;
    copy[1] = yHat;
    out[i] = copy;
  }
  return out;
}

/**
 * Filtro One Euro (Casiez et al., 2012) adaptado para trazos 2D en coordenadas A5 (px/s).
 * Reduce jitter a baja velocidad manteniendo mínima latencia y preservando esquinas rápidas.
 * Soporta modo causal (streaming) y `bidirectional: true` (fase cero para trazos completos).
 */
export function oneEuroFilter(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length === 0) return [];
  if (pts.length === 1) return [pts[0].slice()];

  const {
    minCutoff = 1.5,
    beta = 0.04,
    dCutoff = 1.0,
    defaultDtMs = 16,
    preserveEndpoints = true,
    bidirectional = false
  } = options;

  const cfg = { minCutoff, beta, dCutoff, defaultDtMs };
  let out = oneEuroPass(pts, cfg);

  if (bidirectional && pts.length >= 3) {
    const revIn = pts.slice().reverse();
    const revOut = oneEuroPass(revIn, cfg).reverse();
    out = out.map((p, i) => {
      const copy = p.slice();
      copy[0] = 0.5 * (p[0] + revOut[i][0]);
      copy[1] = 0.5 * (p[1] + revOut[i][1]);
      return copy;
    });
  }

  if (preserveEndpoints && out.length >= 2) {
    out[0] = pts[0].slice();
    out[out.length - 1] = pts[pts.length - 1].slice();
  }
  return out;
}

/**
 * Filtro de media móvil centrada (baseline para comparativas con One Euro Filter).
 */
export function movingAverageFilter(pts, windowSize = 5) {
  if (!Array.isArray(pts) || pts.length === 0) return [];
  const w = Math.max(1, Math.floor(windowSize));
  if (w <= 1 || pts.length <= 2) return pts.map(p => p.slice());
  const half = Math.floor(w / 2);
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 || i === pts.length - 1) {
      out[i] = pts[i].slice();
      continue;
    }
    const lo = Math.max(0, i - half);
    const hi = Math.min(pts.length - 1, i + half);
    let sx = 0, sy = 0, count = 0;
    for (let j = lo; j <= hi; j++) {
      sx += pts[j][0];
      sy += pts[j][1];
      count++;
    }
    const copy = pts[i].slice();
    copy[0] = sx / count;
    copy[1] = sy / count;
    out[i] = copy;
  }
  return out;
}

/* ============================================================================
 * 2. SIMPLIFICACIÓN RDP, REMUESTREO UNIFORME E INTERPOLACIÓN CATMULL-ROM / BÉZIER
 * ============================================================================ */

function pointToSegmentDistance(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= EPS) return dist2D(p, a);
  const t = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq, 0, 1);
  const px = a[0] + t * vx;
  const py = a[1] + t * vy;
  return Math.hypot(p[0] - px, p[1] - py);
}

/**
 * Simplificación Ramer-Douglas-Peucker iterativa (sin riesgo de desbordamiento de pila).
 */
export function rdpSimplify(pts, epsilon = 1.8) {
  if (!Array.isArray(pts) || pts.length === 0) return [];
  if (pts.length <= 2 || epsilon <= 0) return pts.map(p => p.slice());

  const n = pts.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxDist = -1;
    let maxIdx = -1;
    const a = pts[start];
    const b = pts[end];
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistance(pts[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx > start && maxDist > epsilon) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }

  const result = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) result.push(pts[i].slice());
  }
  return result;
}

function interpolatePoint(a, b, t) {
  const x = a[0] + (b[0] - a[0]) * t;
  const y = a[1] + (b[1] - a[1]) * t;
  const hasPress = a.length >= 3 || b.length >= 3;
  const hasTime = a.length >= 4 && b.length >= 4 && Number.isFinite(a[3]) && Number.isFinite(b[3]);
  if (!hasPress) return [x, y];
  const pa = Number.isFinite(a[2]) ? a[2] : 0.5;
  const pb = Number.isFinite(b[2]) ? b[2] : 0.5;
  const press = pa + (pb - pa) * t;
  if (!hasTime) return [x, y, press];
  return [x, y, press, a[3] + (b[3] - a[3]) * t];
}

/**
 * Remuestreo uniforme por longitud de arco.
 * Acepta `{ step }` (distancia en unidades A5) o `{ count }` (número exacto de puntos).
 */
export function resampleUniform(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length === 0) return [];
  if (pts.length === 1) return [pts[0].slice()];

  const { total, cumulative } = computeArcLength(pts);
  if (total <= EPS) {
    const targetCount = Number.isInteger(options.count) && options.count >= 2 ? options.count : 2;
    return Array.from({ length: targetCount }, () => pts[0].slice());
  }

  let count;
  if (Number.isInteger(options.count) && options.count >= 2) {
    count = options.count;
  } else {
    const step = Math.max(0.5, Number(options.step) || 6);
    count = Math.max(2, Math.round(total / step) + 1);
  }

  const out = new Array(count);
  out[0] = pts[0].slice();
  out[count - 1] = pts[pts.length - 1].slice();

  let segIdx = 0;
  for (let k = 1; k < count - 1; k++) {
    const target = (k / (count - 1)) * total;
    while (segIdx < pts.length - 2 && cumulative[segIdx + 1] < target) {
      segIdx++;
    }
    const segLen = cumulative[segIdx + 1] - cumulative[segIdx];
    const t = segLen > EPS ? clamp((target - cumulative[segIdx]) / segLen, 0, 1) : 0;
    out[k] = interpolatePoint(pts[segIdx], pts[segIdx + 1], t);
  }
  return out;
}

/**
 * Convierte una polilínea en segmentos Bézier cúbicos equivalentes a Catmull-Rom centrípeta.
 * Retorna [{ p0, cp1, cp2, p3 }, ...].
 */
export function catmullRomToCubicBeziers(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const { alpha = 0.5, tension = 0 } = options;
  const n = pts.length;
  const beziers = [];

  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < n ? pts[i + 2] : [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];

    const d01 = Math.max(1e-4, Math.pow(dist2D(p0, p1), alpha));
    const d12 = Math.max(1e-4, Math.pow(dist2D(p1, p2), alpha));
    const d23 = Math.max(1e-4, Math.pow(dist2D(p2, p3), alpha));

    const factor = 1 - clamp(tension, 0, 1);

    // Tangentes Catmull-Rom parametrizadas por Barry-Goldman / centrípeta
    const m1x = factor * (p2[0] - p1[0] + d12 * ((p1[0] - p0[0]) / d01 - (p2[0] - p0[0]) / (d01 + d12)));
    const m1y = factor * (p2[1] - p1[1] + d12 * ((p1[1] - p0[1]) / d01 - (p2[1] - p0[1]) / (d01 + d12)));
    const m2x = factor * (p2[0] - p1[0] + d12 * ((p3[0] - p2[0]) / d23 - (p3[0] - p1[0]) / (d12 + d23)));
    const m2y = factor * (p2[1] - p1[1] + d12 * ((p3[1] - p2[1]) / d23 - (p3[1] - p1[1]) / (d12 + d23)));

    const cp1 = [p1[0] + m1x / 3, p1[1] + m1y / 3];
    const cp2 = [p2[0] - m2x / 3, p2[1] - m2y / 3];

    beziers.push({
      p0: [p1[0], p1[1]],
      cp1,
      cp2,
      p3: [p2[0], p2[1]]
    });
  }
  return beziers;
}

export function sampleCubicBezier(seg, steps = 8) {
  const { p0, cp1, cp2, p3 } = seg;
  const s = Math.max(1, Math.floor(steps));
  const out = [];
  for (let i = 0; i <= s; i++) {
    const t = i / s;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * cp1[0] + 3 * u * t * t * cp2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * cp1[1] + 3 * u * t * t * cp2[1] + t * t * t * p3[1];
    out.push([x, y]);
  }
  return out;
}

/**
 * Interpolación suave Catmull-Rom centrípeta muestreando `samplesPerSegment` puntos por segmento.
 */
export function catmullRomInterpolate(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length === 0) return [];
  if (pts.length <= 2) return pts.map(p => p.slice());
  const { samplesPerSegment = 6, alpha = 0.5, tension = 0 } = options;
  const beziers = catmullRomToCubicBeziers(pts, { alpha, tension });
  const s = Math.max(2, Math.floor(samplesPerSegment));
  const out = [];
  for (let idx = 0; idx < beziers.length; idx++) {
    const segPts = sampleCubicBezier(beziers[idx], s);
    const a = pts[idx];
    const b = pts[idx + 1];
    const startK = idx === 0 ? 0 : 1;
    for (let k = startK; k < segPts.length; k++) {
      const t = k / s;
      const interp = interpolatePoint(a, b, t);
      interp[0] = segPts[k][0];
      interp[1] = segPts[k][1];
      out.push(interp);
    }
  }
  return out;
}

/* ============================================================================
 * 3. NORMALIZACIÓN DE ESCALA Y ORIENTACIÓN
 * ============================================================================ */

function computePrincipalAngle(pts) {
  if (!pts || pts.length < 2) return 0;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p[0] - mx, dy = p[1] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/**
 * Normaliza un arreglo de puntos a escala estándar y (opcionalmente) orientación principal.
 * Preserva relación de aspecto. Retorna { pts, transform: { cx, cy, scale, angle } }.
 */
export function normalizeStrokeGeometry(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length === 0) {
    return { pts: [], transform: { cx: 0, cy: 0, scale: 1, angle: 0 } };
  }
  const {
    targetSize = 1,
    centerMode = 'bbox', // 'bbox' | 'centroid'
    alignOrientation = false,
    orientationMode = 'pca' // 'pca' | 'endpoints'
  } = options;

  const box = computeBoundingBox(pts);
  let cx = box.cx;
  let cy = box.cy;
  if (centerMode === 'centroid') {
    cx = 0; cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= pts.length; cy /= pts.length;
  }

  const maxSpan = Math.max(box.width, box.height);
  const scale = maxSpan > EPS ? targetSize / maxSpan : 1;

  let angle = 0;
  if (alignOrientation && pts.length >= 2) {
    if (orientationMode === 'endpoints') {
      angle = Math.atan2(pts[pts.length - 1][1] - pts[0][1], pts[pts.length - 1][0] - pts[0][0]);
    } else {
      angle = computePrincipalAngle(pts);
    }
  }

  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const normalized = pts.map(p => {
    const dx = (p[0] - cx) * scale;
    const dy = (p[1] - cy) * scale;
    const copy = p.slice();
    copy[0] = dx * cos - dy * sin;
    copy[1] = dx * sin + dy * cos;
    return copy;
  });

  return { pts: normalized, transform: { cx, cy, scale, angle } };
}

/* ============================================================================
 * 4. EXTRACCIÓN DE CARACTERÍSTICAS CINEMÁTICAS Y GEOMÉTRICAS
 * ============================================================================ */

function normalizeAngleDiff(delta) {
  let d = delta;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

/**
 * Extrae características cinemáticas y geométricas completas de un trazo.
 */
export function extractStrokeFeatures(stroke, options = {}) {
  const { defaultDtMs = 16, index = 0, previousEndTime = null } = options;
  const pts = extractPoints(stroke, options);
  const n = pts.length;
  const bbox = computeBoundingBox(pts);
  const arc = computeArcLength(pts);

  const velocities = new Array(n).fill(0);
  const vx = new Array(n).fill(0);
  const vy = new Array(n).fill(0);
  const accelerations = new Array(n).fill(0);
  const directionAngles = new Array(Math.max(0, n - 1)).fill(0);
  const curvatures = new Array(n).fill(0);
  const turningAngles = new Array(n).fill(0);

  const hasTimestamps = n > 0 && pts[0].length >= 4 && Number.isFinite(pts[0][3]);
  const startTime = hasTimestamps ? pts[0][3] : (Number.isFinite(Number(stroke?.startedAt)) ? Number(stroke.startedAt) : null);
  const endTime = hasTimestamps ? pts[n - 1][3] : (startTime !== null ? startTime + Math.max(0, n - 1) * defaultDtMs : null);
  const durationMs = (startTime !== null && endTime !== null) ? Math.max(0, endTime - startTime) : Math.max(0, n - 1) * defaultDtMs;

  for (let i = 1; i < n; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const dtMs = hasTimestamps ? Math.max(1, pts[i][3] - pts[i - 1][3]) : defaultDtMs;
    const dtSec = dtMs / 1000;
    vx[i] = dx / dtSec;
    vy[i] = dy / dtSec;
    velocities[i] = Math.hypot(vx[i], vy[i]);
    directionAngles[i - 1] = Math.atan2(dy, dx);
  }
  if (n > 1) {
    vx[0] = vx[1];
    vy[0] = vy[1];
    velocities[0] = velocities[1];
  }

  for (let i = 1; i < n; i++) {
    const dtMs = hasTimestamps ? Math.max(1, pts[i][3] - pts[i - 1][3]) : defaultDtMs;
    const dtSec = dtMs / 1000;
    accelerations[i] = (velocities[i] - velocities[i - 1]) / dtSec;
  }

  let totalAbsAngle = 0;
  let totalSignedAngle = 0;
  let maxCurvature = 0;
  let sumAbsCurvature = 0;

  for (let i = 1; i < n - 1; i++) {
    const d1 = dist2D(pts[i - 1], pts[i]);
    const d2 = dist2D(pts[i], pts[i + 1]);
    if (d1 <= EPS || d2 <= EPS) continue;
    const dTheta = normalizeAngleDiff(directionAngles[i] - directionAngles[i - 1]);
    turningAngles[i] = dTheta;
    totalSignedAngle += dTheta;
    totalAbsAngle += Math.abs(dTheta);
    const localArc = 0.5 * (d1 + d2);
    const k = dTheta / Math.max(localArc, 1e-4);
    curvatures[i] = k;
    const ak = Math.abs(k);
    if (ak > maxCurvature) maxCurvature = ak;
    sumAbsCurvature += ak;
  }

  let sumV = 0, maxV = 0, minV = n ? Infinity : 0;
  let sumA = 0, maxAbsA = 0;
  for (let i = 0; i < n; i++) {
    const v = velocities[i];
    sumV += v;
    if (v > maxV) maxV = v;
    if (v < minV) minV = v;
    const a = accelerations[i];
    sumA += a;
    if (Math.abs(a) > maxAbsA) maxAbsA = Math.abs(a);
  }
  const meanV = n ? sumV / n : 0;
  let varV = 0;
  for (let i = 0; i < n; i++) varV += (velocities[i] - meanV) ** 2;
  const stdV = n ? Math.sqrt(varV / n) : 0;

  const selfIntersections = findSelfIntersections(pts);
  const closedness = n >= 3 && arc.total > EPS ? dist2D(pts[0], pts[n - 1]) / Math.max(bbox.diagonal, 1) : Infinity;

  return {
    id: stroke?.id ?? `stroke_${index}`,
    strokeOrder: index,
    pointCount: n,
    hasTimestamps,
    timing: {
      startTime,
      endTime,
      durationMs,
      gapFromPrevMs: (startTime !== null && previousEndTime !== null) ? startTime - previousEndTime : null
    },
    bbox,
    arcLength: arc.total,
    chordLength: arc.chord,
    straightness: arc.straightness,
    isClosedLike: n >= 4 && closedness <= 0.2 && arc.total >= 20,
    closednessRatio: closedness,
    principalAngle: computePrincipalAngle(pts),
    netDirectionAngle: n >= 2 ? Math.atan2(pts[n - 1][1] - pts[0][1], pts[n - 1][0] - pts[0][0]) : 0,
    kinematics: {
      velocity: { values: velocities, vx, vy, mean: meanV, max: maxV, min: minV, std: stdV },
      acceleration: { values: accelerations, mean: n ? sumA / n : 0, maxAbs: maxAbsA }
    },
    geometry: {
      directionAngles,
      turningAngles,
      curvatures,
      totalSignedAngle,
      totalAbsAngle,
      meanAbsCurvature: n > 2 ? sumAbsCurvature / (n - 2) : 0,
      maxCurvature,
      selfIntersections
    }
  };
}

/* ============================================================================
 * 5. DETECCIÓN DE ESQUINAS / VÉRTICES (Híbrido geométrico + cinemático)
 * ============================================================================ */

/**
 * Detecta esquinas/vértices combinando cambio angular (multiescala), curvatura y mínimos de velocidad.
 * Retorna [{ index, point, angleDeg, score, reason }, ...] ordenados por índice.
 */
export function detectCorners(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return [];
  const {
    angleThresholdDeg = 35,
    windowSteps = 3,
    minSeparationDist = 10,
    includeEndpoints = false
  } = options;

  const n = pts.length;
  const arc = computeArcLength(pts);
  const w = Math.max(1, Math.min(Math.floor(windowSteps), Math.floor((n - 1) / 2)));
  const thresholdRad = (angleThresholdDeg * Math.PI) / 180;

  // Velocidad local si hay timestamps (baja velocidad refuerza esquina real).
  const hasT = pts[0].length >= 4 && Number.isFinite(pts[0][3]);
  const speeds = new Array(n).fill(1);
  let meanSpeed = 1;
  if (hasT) {
    let sum = 0;
    for (let i = 1; i < n; i++) {
      const dt = Math.max(1, pts[i][3] - pts[i - 1][3]) / 1000;
      speeds[i] = dist2D(pts[i - 1], pts[i]) / dt;
      sum += speeds[i];
    }
    speeds[0] = speeds[1];
    meanSpeed = Math.max(EPS, sum / (n - 1));
  }

  const rawScores = new Array(n).fill(0);
  const rawAngles = new Array(n).fill(0);

  for (let i = 1; i < n - 1; i++) {
    const iPrev = Math.max(0, i - w);
    const iNext = Math.min(n - 1, i + w);
    const v1x = pts[i][0] - pts[iPrev][0];
    const v1y = pts[i][1] - pts[iPrev][1];
    const v2x = pts[iNext][0] - pts[i][0];
    const v2y = pts[iNext][1] - pts[i][1];
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 <= EPS || l2 <= EPS) continue;

    const a1 = Math.atan2(v1y, v1x);
    const a2 = Math.atan2(v2y, v2x);
    const turn = Math.abs(normalizeAngleDiff(a2 - a1));
    rawAngles[i] = turn;

    if (turn >= thresholdRad) {
      const speedBoost = hasT ? clamp(1.35 - 0.5 * (speeds[i] / meanSpeed), 0.85, 1.35) : 1.0;
      rawScores[i] = turn * speedBoost;
    }
  }

  // Supresión de no-máximos locales en ventana de distancia de arco.
  const candidates = [];
  for (let i = 1; i < n - 1; i++) {
    if (rawScores[i] <= 0) continue;
    let isPeak = true;
    for (let j = Math.max(1, i - w); j <= Math.min(n - 2, i + w); j++) {
      if (j !== i && rawScores[j] > rawScores[i]) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) {
      candidates.push({
        index: i,
        arcPos: arc.cumulative[i],
        point: pts[i].slice(),
        angleDeg: (rawAngles[i] * 180) / Math.PI,
        score: rawScores[i],
        reason: hasT && speeds[i] < meanSpeed * 0.65 ? 'turn+slowdown' : 'turn'
      });
    }
  }

  // Filtrar picos demasiado cercanos quedándonos con el de mayor score.
  candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const c of candidates) {
    if (kept.every(k => Math.abs(k.arcPos - c.arcPos) >= minSeparationDist && dist2D(k.point, c.point) >= minSeparationDist * 0.7)) {
      kept.push(c);
    }
  }
  kept.sort((a, b) => a.index - b.index);

  const result = kept.map(({ arcPos, ...rest }) => rest);
  if (includeEndpoints) {
    result.unshift({ index: 0, point: pts[0].slice(), angleDeg: 0, score: 0, reason: 'endpoint' });
    result.push({ index: n - 1, point: pts[n - 1].slice(), angleDeg: 0, score: 0, reason: 'endpoint' });
  }
  return result;
}

/* ============================================================================
 * 6. INTERSECCIONES, DISTANCIAS Y RELACIONES ESPACIALES ENTRE TRAZOS
 * ============================================================================ */

function segmentIntersection(a, b, c, d) {
  const rX = b[0] - a[0], rY = b[1] - a[1];
  const sX = d[0] - c[0], sY = d[1] - c[1];
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) <= EPS) return null;
  const qpX = c[0] - a[0], qpY = c[1] - a[1];
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a[0] + t * rX, y: a[1] + t * rY, t, u };
  }
  return null;
}

export function findSelfIntersections(pts) {
  const out = [];
  if (!Array.isArray(pts) || pts.length < 4) return out;
  for (let i = 0; i < pts.length - 3; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      // Ignorar el cierre exacto del primer y último segmento si coinciden en el extremo.
      if (i === 0 && j === pts.length - 2 && dist2D(pts[0], pts[pts.length - 1]) <= 1e-3) continue;
      const hit = segmentIntersection(pts[i], pts[i + 1], pts[j], pts[j + 1]);
      if (hit) out.push({ x: hit.x, y: hit.y, segA: i, segB: j });
    }
  }
  return out;
}

export function findStrokeIntersections(ptsA, ptsB) {
  const out = [];
  if (!ptsA || !ptsB || ptsA.length < 2 || ptsB.length < 2) return out;
  const boxA = computeBoundingBox(ptsA);
  const boxB = computeBoundingBox(ptsB);
  if (boxA.maxX < boxB.minX || boxB.maxX < boxA.minX || boxA.maxY < boxB.minY || boxB.maxY < boxA.minY) {
    return out;
  }
  for (let i = 0; i < ptsA.length - 1; i++) {
    for (let j = 0; j < ptsB.length - 1; j++) {
      const hit = segmentIntersection(ptsA[i], ptsA[i + 1], ptsB[j], ptsB[j + 1]);
      if (hit) out.push({ x: hit.x, y: hit.y, segA: i, segB: j });
    }
  }
  return out;
}

export function minStrokeDistance(ptsA, ptsB) {
  if (!ptsA?.length || !ptsB?.length) return Infinity;
  if (ptsA.length === 1 && ptsB.length === 1) return dist2D(ptsA[0], ptsB[0]);
  if (ptsA.length >= 2 && ptsB.length >= 2 && findStrokeIntersections(ptsA, ptsB).length > 0) {
    return 0;
  }
  let minD = Infinity;
  // Distancia punto-a-segmento bidireccional
  for (let i = 0; i < ptsA.length; i++) {
    const p = ptsA[i];
    if (ptsB.length === 1) {
      const d = dist2D(p, ptsB[0]);
      if (d < minD) minD = d;
    } else {
      for (let j = 0; j < ptsB.length - 1; j++) {
        const d = pointToSegmentDistance(p, ptsB[j], ptsB[j + 1]);
        if (d < minD) minD = d;
      }
    }
  }
  for (let j = 0; j < ptsB.length; j++) {
    const p = ptsB[j];
    if (ptsA.length === 1) {
      const d = dist2D(p, ptsA[0]);
      if (d < minD) minD = d;
    } else {
      for (let i = 0; i < ptsA.length - 1; i++) {
        const d = pointToSegmentDistance(p, ptsA[i], ptsA[i + 1]);
        if (d < minD) minD = d;
      }
    }
  }
  return minD;
}

export function bboxIoU(a, b) {
  const interW = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const interH = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const inter = interW * interH;
  const union = a.area + b.area - inter;
  return union > EPS ? inter / union : 0;
}

export function bboxGap(a, b) {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return Math.hypot(dx, dy);
}

/**
 * Calcula relaciones espaciales entre dos trazos A y B.
 */
export function computeSpatialRelation(boxA, boxB, minDist, intersectionCount = 0) {
  const dx = boxB.cx - boxA.cx;
  const dy = boxB.cy - boxA.cy;
  const refScale = Math.max(10, (boxA.diagonal + boxB.diagonal) * 0.5);
  const iou = bboxIoU(boxA, boxB);
  const gap = bboxGap(boxA, boxB);

  const contains = boxA.minX <= boxB.minX && boxA.maxX >= boxB.maxX && boxA.minY <= boxB.minY && boxA.maxY >= boxB.maxY && boxA.area > boxB.area;
  const containedBy = boxB.minX <= boxA.minX && boxB.maxX >= boxA.maxX && boxB.minY <= boxA.minY && boxB.maxY >= boxA.maxY && boxB.area > boxA.area;

  let primary = 'near';
  if (intersectionCount > 0) primary = 'intersecting';
  else if (contains) primary = 'contains';
  else if (containedBy) primary = 'containedBy';
  else if (iou > 0.15) primary = 'overlapping';
  else if (Math.abs(dx) >= Math.abs(dy)) primary = dx >= 0 ? 'leftOf' : 'rightOf';
  else primary = dy >= 0 ? 'above' : 'below';

  return {
    primary,
    dx,
    dy,
    normalizedDx: dx / refScale,
    normalizedDy: dy / refScale,
    minDistance: minDist,
    bboxGap: gap,
    iou,
    intersecting: intersectionCount > 0,
    intersectionCount,
    contains,
    containedBy
  };
}

/* ============================================================================
 * 7. DETECCIÓN Y FUSIÓN DE TRAZOS REPASADOS (OVERTRACING)
 * ============================================================================ */

function directedCoverage(srcPts, refPts, tolerance) {
  if (!srcPts.length || !refPts.length) return { ratio: 0, meanDist: Infinity };
  let covered = 0;
  let sumDist = 0;
  for (let i = 0; i < srcPts.length; i++) {
    let best = Infinity;
    if (refPts.length === 1) {
      best = dist2D(srcPts[i], refPts[0]);
    } else {
      for (let j = 0; j < refPts.length - 1; j++) {
        const d = pointToSegmentDistance(srcPts[i], refPts[j], refPts[j + 1]);
        if (d < best) best = d;
      }
    }
    sumDist += best;
    if (best <= tolerance) covered++;
  }
  return { ratio: covered / srcPts.length, meanDist: sumDist / srcPts.length };
}

function meanPointwiseDistance(ptsA, ptsB, reverseB = false) {
  const n = Math.min(ptsA.length, ptsB.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const b = reverseB ? ptsB[n - 1 - i] : ptsB[i];
    sum += dist2D(ptsA[i], b);
  }
  return sum / n;
}

/**
 * Detecta pares de trazos repasados (overtracing) entre trazos distintos.
 * Compara tanto la secuencia directa como la invertida (orientación-agnóstica)
 * para fusionar limpiamente trazos antiparalelos superpuestos.
 */
export function detectOvertracing(strokes, options = {}) {
  const {
    tolerancePx = 12,
    minCoverage = 0.72,
    sampleCount = 24,
    maxOrderGap = 3
  } = options;

  const extracted = strokes.map(s => extractPoints(s, options));
  const sampled = extracted.map(pts => (pts.length >= 2 ? resampleUniform(pts, { count: sampleCount }) : pts));
  const boxes = extracted.map(pts => computeBoundingBox(pts));
  const pairs = [];

  for (let i = 0; i < strokes.length; i++) {
    if (extracted[i].length < 2) continue;
    for (let j = i + 1; j < strokes.length; j++) {
      if (maxOrderGap > 0 && j - i > maxOrderGap) continue;
      if (extracted[j].length < 2) continue;

      const tol = Math.max(tolerancePx, 0.08 * Math.min(boxes[i].diagonal, boxes[j].diagonal));
      if (bboxGap(boxes[i], boxes[j]) > tol) continue;

      const covIJ = directedCoverage(sampled[i], sampled[j], tol);
      const covJI = directedCoverage(sampled[j], sampled[i], tol);
      const maxCov = Math.max(covIJ.ratio, covJI.ratio);
      const minCov = Math.min(covIJ.ratio, covJI.ratio);

      const fwdMeanDist = meanPointwiseDistance(sampled[i], sampled[j], false);
      const revMeanDist = meanPointwiseDistance(sampled[i], sampled[j], true);
      const alignedMeanDist = Math.min(fwdMeanDist, revMeanDist);
      const isReversed = revMeanDist < fwdMeanDist;

      if (
        minCov >= minCoverage ||
        (maxCov >= 0.88 && minCov >= 0.45) ||
        (alignedMeanDist <= tol && minCov >= 0.6)
      ) {
        pairs.push({
          indexA: i,
          indexB: j,
          idA: strokes[i]?.id ?? `stroke_${i}`,
          idB: strokes[j]?.id ?? `stroke_${j}`,
          coverageAB: covIJ.ratio,
          coverageBA: covJI.ratio,
          meanDist: 0.5 * (covIJ.meanDist + covJI.meanDist),
          alignedMeanDist,
          reversed: isReversed
        });
      }
    }
  }
  return pairs;
}

/**
 * Fusiona grupos de trazos repasados en un trazo promedio limpio sin mutar los originales.
 */
export function mergeOvertracedStrokes(strokes, options = {}) {
  const { sampleCount = 32 } = options;
  const pairs = detectOvertracing(strokes, options);
  if (!pairs.length) {
    return {
      mergedStrokes: strokes.map((s, idx) => ({
        ...s,
        pts: extractPoints(s, options),
        dspMergedFromIds: [s?.id ?? `stroke_${idx}`]
      })),
      overtracePairs: pairs
    };
  }

  // Agrupar componentes conexas de trazos repasados.
  const parent = strokes.map((_, i) => i);
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (const p of pairs) union(p.indexA, p.indexB);

  const groups = new Map();
  for (let i = 0; i < strokes.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }

  const mergedStrokes = [];
  for (const indices of groups.values()) {
    if (indices.length === 1) {
      const s = strokes[indices[0]];
      mergedStrokes.push({
        ...s,
        pts: extractPoints(s, options),
        dspMergedFromIds: [s?.id ?? `stroke_${indices[0]}`]
      });
      continue;
    }

    // Usar el trazo más largo del grupo como referencia direccional y promediar puntos alineados.
    const extracted = indices.map(i => extractPoints(strokes[i], options));
    const lengths = extracted.map(pts => computeArcLength(pts).total);
    let refLocal = 0;
    for (let k = 1; k < lengths.length; k++) if (lengths[k] > lengths[refLocal]) refLocal = k;

    const refSampled = resampleUniform(extracted[refLocal], { count: sampleCount });
    const aligned = extracted.map(pts => {
      const s = resampleUniform(pts, { count: sampleCount });
      const fwd = meanPointwiseDistance(refSampled, s, false);
      const rev = meanPointwiseDistance(refSampled, s, true);
      return rev < fwd ? s.reverse() : s;
    });

    const avgPts = new Array(sampleCount);
    const hasTime = refSampled[0].length >= 4;
    for (let k = 0; k < sampleCount; k++) {
      let sx = 0, sy = 0, sp = 0;
      for (const s of aligned) {
        sx += s[k][0];
        sy += s[k][1];
        sp += s[k][2] ?? 0.5;
      }
      const m = aligned.length;
      avgPts[k] = hasTime ? [sx / m, sy / m, sp / m, refSampled[k][3]] : [sx / m, sy / m, sp / m];
    }

    const baseStroke = strokes[indices[0]];
    mergedStrokes.push({
      ...baseStroke,
      pts: avgPts,
      dspMergedFromIds: indices.map(i => strokes[i]?.id ?? `stroke_${i}`),
      dspOvertraced: true
    });
  }

  return { mergedStrokes, overtracePairs: pairs };
}

/* ============================================================================
 * 8. DETECCIÓN DE PUNTOS ACCIDENTALES / RUIDO
 * ============================================================================ */

/**
 * Clasifica trazos diminutos distinguiendo toques accidentales de puntos intencionales
 * (coma/punto decimal, punto de 'i'/'j', punto de multiplicación).
 */
export function detectAccidentalDots(strokes, options = {}) {
  const {
    maxDotDiagonal = 9,
    maxDotArcLength = 14,
    contextRadiusFactor = 1.6,
    minContextRadius = 24
  } = options;

  const extracted = strokes.map(s => extractPoints(s, options));
  const boxes = extracted.map(pts => computeBoundingBox(pts));
  const arcs = extracted.map(pts => computeArcLength(pts).total);

  const results = [];
  for (let i = 0; i < strokes.length; i++) {
    const pts = extracted[i];
    const box = boxes[i];
    const arcLen = arcs[i];
    const id = strokes[i]?.id ?? `stroke_${i}`;

    const isDotLike = pts.length <= 1 || (box.diagonal <= maxDotDiagonal && arcLen <= maxDotArcLength);
    if (!isDotLike) {
      results.push({ index: i, id, isDotLike: false, isAccidental: false, contextualRole: 'stroke', confidence: 0.98, reason: 'normal-stroke' });
      continue;
    }

    // Buscar vecinos cercanos para distinguir punto decimal, diacrítico o multiplicación.
    let nearestDist = Infinity;
    let nearestBox = null;
    let leftNeighbor = null;
    let rightNeighbor = null;

    for (let j = 0; j < strokes.length; j++) {
      if (i === j) continue;
      if (boxes[j].diagonal <= maxDotDiagonal && arcs[j] <= maxDotArcLength) continue;
      const g = bboxGap(box, boxes[j]);
      if (g < nearestDist) {
        nearestDist = g;
        nearestBox = boxes[j];
      }
      const dy = Math.abs(box.cy - boxes[j].cy);
      if (dy <= Math.max(25, boxes[j].height * 0.8)) {
        if (boxes[j].maxX <= box.minX + 6 && box.minX - boxes[j].maxX <= Math.max(35, boxes[j].height * 0.9)) {
          leftNeighbor = boxes[j];
        }
        if (boxes[j].minX >= box.maxX - 6 && boxes[j].minX - box.maxX <= Math.max(35, boxes[j].height * 0.9)) {
          rightNeighbor = boxes[j];
        }
      }
    }

    let contextualRole = 'isolated-dot';
    let isAccidental = true;
    let confidence = 0.85;
    let reason = 'isolated-micro-mark';

    if (leftNeighbor && rightNeighbor) {
      const baselineY = Math.max(leftNeighbor.maxY, rightNeighbor.maxY);
      const midY = 0.5 * (leftNeighbor.cy + rightNeighbor.cy);
      if (Math.abs(box.cy - baselineY) <= Math.max(14, leftNeighbor.height * 0.35)) {
        contextualRole = 'decimal-point';
        isAccidental = false;
        confidence = 0.9;
        reason = 'between-symbols-at-baseline';
      } else if (Math.abs(box.cy - midY) <= Math.max(14, leftNeighbor.height * 0.35)) {
        contextualRole = 'multiplication-dot';
        isAccidental = false;
        confidence = 0.82;
        reason = 'between-symbols-at-midline';
      }
    } else if (nearestBox) {
      const ctxRadius = Math.max(minContextRadius, nearestBox.height * contextRadiusFactor);
      const aboveStem = box.cy < nearestBox.minY && (nearestBox.minY - box.cy) <= Math.max(22, nearestBox.height * 0.65)
        && box.cx >= nearestBox.minX - 12 && box.cx <= nearestBox.maxX + 12;
      const nearBaseline = Math.abs(box.cy - nearestBox.maxY) <= Math.max(12, nearestBox.height * 0.3)
        && nearestDist <= Math.max(26, nearestBox.height * 0.65);

      if (aboveStem) {
        contextualRole = 'diacritic-dot';
        isAccidental = false;
        confidence = 0.86;
        reason = 'above-stem-dot';
      } else if (nearBaseline && nearestBox.height <= 90) {
        contextualRole = 'punctuation-or-decimal';
        isAccidental = false;
        confidence = 0.72;
        reason = 'near-baseline-of-symbol';
      } else if (nearestDist > ctxRadius) {
        contextualRole = 'accidental-tap';
        isAccidental = true;
        confidence = 0.92;
        reason = 'far-from-ink';
      } else {
        // Muy cerca de una figura grande o fuera de línea base -> probablemente toque accidental.
        contextualRole = 'accidental-tap';
        isAccidental = true;
        confidence = 0.75;
        reason = 'tiny-mark-without-symbol-role';
      }
    }

    results.push({ index: i, id, isDotLike: true, isAccidental, contextualRole, confidence, reason });
  }

  return results;
}

/* ============================================================================
 * 9. AGRUPACIÓN TEMPORAL-ESPACIAL DE TRAZOS
 * ============================================================================ */

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

/**
 * Agrupa trazos en candidatos (símbolos, expresiones o figuras) usando ventanas
 * adaptativas de distancia espacial y proximidad temporal.
 */
export function groupStrokes(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length === 0) return [];
  const {
    spatialThresholdPx = null, // null -> adaptativo según escala mediana de los trazos
    temporalWindowMs = 1800,
    intersectAlwaysGroups = true,
    excludeIndices = new Set()
  } = options;

  const extracted = strokes.map(s => extractPoints(s, options));
  const boxes = extracted.map(pts => computeBoundingBox(pts));
  const timings = extracted.map((pts, i) => {
    const hasT = pts.length > 0 && pts[0].length >= 4 && Number.isFinite(pts[0][3]);
    const start = hasT ? pts[0][3] : (Number.isFinite(Number(strokes[i]?.startedAt)) ? Number(strokes[i].startedAt) : null);
    const end = hasT ? pts[pts.length - 1][3] : start;
    return { start, end };
  });

  const nonDotDiags = boxes.map(b => b.diagonal).filter(d => d >= 10);
  const medianScale = nonDotDiags.length ? median(nonDotDiags) : 40;
  const adaptiveSpatial = spatialThresholdPx !== null
    ? spatialThresholdPx
    : clamp(medianScale * 0.65, 22, 95);

  const parent = strokes.map((_, i) => i);
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let i = 0; i < strokes.length; i++) {
    if (excludeIndices.has(i)) continue;
    for (let j = i + 1; j < strokes.length; j++) {
      if (excludeIndices.has(j)) continue;

      const gap = bboxGap(boxes[i], boxes[j]);
      if (gap > adaptiveSpatial * 1.5) continue;

      const minDist = minStrokeDistance(extracted[i], extracted[j]);
      const intersects = intersectAlwaysGroups && findStrokeIntersections(extracted[i], extracted[j]).length > 0;

      // Factor temporal: si existen timestamps, trazos escritos muy seguidos toleran un poco más de espacio,
      // y trazos separados por pausas largas requieren mayor cercanía espacial para unirse.
      let timeFactor = 1.0;
      const ti = timings[i], tj = timings[j];
      if (ti.end !== null && tj.start !== null) {
        const dt = Math.abs(tj.start - ti.end);
        if (dt <= temporalWindowMs * 0.4) timeFactor = 1.15;
        else if (dt > temporalWindowMs) timeFactor = 0.65;
      }

      const localThreshold = adaptiveSpatial * timeFactor;
      if (intersects || minDist <= localThreshold) {
        union(i, j);
      }
    }
  }

  const clusters = new Map();
  for (let i = 0; i < strokes.length; i++) {
    if (excludeIndices.has(i)) continue;
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(i);
  }

  const groups = [];
  let gid = 0;
  for (const strokeIndices of clusters.values()) {
    const groupBoxes = strokeIndices.map(i => boxes[i]);
    const bbox = mergeBoundingBoxes(groupBoxes);
    const starts = strokeIndices.map(i => timings[i].start).filter(v => v !== null);
    const ends = strokeIndices.map(i => timings[i].end).filter(v => v !== null);

    // Heurística ligera de tipo de grupo (sin forzar clasificación)
    const maxDim = Math.max(bbox.width, bbox.height);
    let kindHint = 'symbol';
    if (maxDim >= 110 && strokeIndices.length <= 6 && bbox.area >= 3600) kindHint = 'figure-or-diagram';
    else if (bbox.width > bbox.height * 1.8 && strokeIndices.length >= 2) kindHint = 'expression-line';

    groups.push({
      id: `group_${gid++}`,
      strokeIndices,
      strokeIds: strokeIndices.map(i => strokes[i]?.id ?? `stroke_${i}`),
      bbox,
      startTime: starts.length ? Math.min(...starts) : null,
      endTime: ends.length ? Math.max(...ends) : null,
      kindHint
    });
  }

  // Ordenar por tiempo de inicio si existe, o de arriba-abajo / izquierda-derecha.
  groups.sort((a, b) => {
    if (a.startTime !== null && b.startTime !== null && a.startTime !== b.startTime) {
      return a.startTime - b.startTime;
    }
    if (Math.abs(a.bbox.minY - b.bbox.minY) > 40) return a.bbox.minY - b.bbox.minY;
    return a.bbox.minX - b.bbox.minX;
  });

  return groups;
}

/* ============================================================================
 * 10. PIPELINE PRINCIPAL DE ALTO NIVEL: processStrokes(strokes, options)
 * ============================================================================ */

/**
 * Pipeline inmutable de procesamiento digital de trazos.
 * Nunca muta `strokes`; retorna `{ original, processed, features, groups, timingMs }`.
 */
export function processStrokes(strokes, options = {}) {
  const t0 = nowMs();
  const input = Array.isArray(strokes) ? strokes : [];
  const original = input.slice(); // Referencias originales intactas

  const {
    smooth = true,
    oneEuro = {},
    rdpEpsilon = 1.6,
    resampleStep = 6,
    computeBeziers = true,
    detectOvertrace = true,
    mergeOvertrace = false,
    filterAccidentalDots = false,
    overtrace = {},
    accidentalDot = {},
    corners = {},
    grouping = {},
    defaultDtMs = 16
  } = options;

  // 1. Detección de puntos accidentales y trazos repasados sobre los trazos originales (copia de puntos).
  const dotAnalysis = detectAccidentalDots(original, { ...accidentalDot, defaultDtMs });
  const accidentalSet = new Set(dotAnalysis.filter(d => d.isAccidental).map(d => d.index));
  const overtracePairs = detectOvertrace ? detectOvertracing(original, { ...overtrace, defaultDtMs }) : [];

  // 2. Fusión opcional de repasados o copia inmutable 1:1.
  let workingStrokes;
  if (mergeOvertrace && overtracePairs.length > 0) {
    workingStrokes = mergeOvertracedStrokes(original, { ...overtrace, defaultDtMs }).mergedStrokes;
  } else {
    workingStrokes = original.map((s, idx) => ({
      id: s?.id ?? `stroke_${idx}`,
      color: s?.color ?? '#000000',
      width: Number.isFinite(Number(s?.width)) ? Number(s.width) : 2.5,
      pts: extractPoints(s, { defaultDtMs }),
      ...(s?.x10 ? { x10: s.x10 } : {}),
      dspMergedFromIds: [s?.id ?? `stroke_${idx}`]
    }));
  }

  // 3. Procesamiento por trazo: suavizado One Euro, remuestreo, simplificación RDP, esquinas, Bézier y features.
  const processed = [];
  const perStrokeFeatures = [];
  let prevEndTime = null;

  for (let i = 0; i < workingStrokes.length; i++) {
    const ws = workingStrokes[i];
    const dotInfo = !mergeOvertrace ? dotAnalysis[i] : null;
    const isAccidental = dotInfo ? dotInfo.isAccidental : false;

    if (filterAccidentalDots && isAccidental) continue;

    const rawPts = ws.pts;
    const smoothedPts = (smooth && rawPts.length >= 3)
      ? oneEuroFilter(rawPts, { defaultDtMs, ...oneEuro })
      : rawPts.map(p => p.slice());

    const resampledPts = smoothedPts.length >= 2
      ? resampleUniform(smoothedPts, { step: resampleStep })
      : smoothedPts.map(p => p.slice());

    const simplifiedPts = smoothedPts.length >= 3
      ? rdpSimplify(smoothedPts, rdpEpsilon)
      : smoothedPts.map(p => p.slice());

    const detectedCorners = smoothedPts.length >= 3
      ? detectCorners(smoothedPts, corners)
      : [];

    const beziers = (computeBeziers && simplifiedPts.length >= 2)
      ? catmullRomToCubicBeziers(simplifiedPts)
      : [];

    const strokeFeat = extractStrokeFeatures(
      { ...ws, pts: smoothedPts },
      { defaultDtMs, index: processed.length, previousEndTime: prevEndTime }
    );
    if (strokeFeat.timing.endTime !== null) prevEndTime = strokeFeat.timing.endTime;

    perStrokeFeatures.push({
      ...strokeFeat,
      cornerCount: detectedCorners.length,
      corners: detectedCorners,
      dotClassification: dotInfo || { isDotLike: false, isAccidental: false, contextualRole: 'stroke', confidence: 1 }
    });

    processed.push({
      id: ws.id,
      color: ws.color,
      width: ws.width,
      pts: smoothedPts,
      ...(ws.x10 ? { x10: ws.x10 } : {}),
      dsp: {
        sourceIds: ws.dspMergedFromIds || [ws.id],
        overtraced: Boolean(ws.dspOvertraced),
        isAccidental,
        dotRole: dotInfo?.contextualRole ?? 'stroke',
        resampledPts,
        simplifiedPts,
        corners: detectedCorners,
        beziers
      }
    });
  }

  // 4. Relaciones por pares (distancias, intersecciones y relaciones espaciales).
  const pairwiseDistances = [];
  const pairwiseIntersections = [];
  const pairwiseRelations = [];

  for (let i = 0; i < processed.length; i++) {
    const ptsA = processed[i].pts;
    const boxA = perStrokeFeatures[i].bbox;
    for (let j = i + 1; j < processed.length; j++) {
      const ptsB = processed[j].pts;
      const boxB = perStrokeFeatures[j].bbox;
      const hits = findStrokeIntersections(ptsA, ptsB);
      const minD = hits.length > 0 ? 0 : minStrokeDistance(ptsA, ptsB);
      const rel = computeSpatialRelation(boxA, boxB, minD, hits.length);

      pairwiseDistances.push({ indexA: i, indexB: j, idA: processed[i].id, idB: processed[j].id, minDistance: minD, bboxGap: rel.bboxGap });
      if (hits.length > 0) {
        pairwiseIntersections.push({ indexA: i, indexB: j, idA: processed[i].id, idB: processed[j].id, points: hits });
      }
      pairwiseRelations.push({ indexA: i, indexB: j, idA: processed[i].id, idB: processed[j].id, ...rel });
    }
  }

  // 5. Agrupación temporal-espacial.
  const excludeForGrouping = filterAccidentalDots ? new Set() : (mergeOvertrace ? new Set() : accidentalSet);
  const groups = groupStrokes(processed, { ...grouping, excludeIndices: excludeForGrouping });

  const totalArcLength = perStrokeFeatures.reduce((acc, f) => acc + f.arcLength, 0);
  const pageBounds = mergeBoundingBoxes(perStrokeFeatures.map(f => f.bbox));
  const nonDotDiags = perStrokeFeatures.map(f => f.bbox.diagonal).filter(d => d >= 10);

  return {
    original,
    processed,
    features: {
      perStroke: perStrokeFeatures,
      pairwise: {
        distances: pairwiseDistances,
        intersections: pairwiseIntersections,
        relations: pairwiseRelations
      },
      summary: {
        strokeCount: processed.length,
        originalCount: original.length,
        totalArcLength,
        pageBounds,
        overtracePairs,
        accidentalDotIds: dotAnalysis.filter(d => d.isAccidental).map(d => d.id),
        medianScale: nonDotDiags.length ? median(nonDotDiags) : 0
      }
    },
    groups,
    timingMs: nowMs() - t0
  };
}
