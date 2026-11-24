/* Geometría computacional y contextual para Mi Note Professional.
 * Módulo ES puro, cero dependencias externas, 100% inmutable sobre trazos de entrada.
 * Reglas estrictas:
 *  - Nunca mutar los trazos o puntos fuente.
 *  - Excluir reconocimiento automático de trapecio (EXCLUDED_AUTO_SHAPES).
 *  - Preservar proporciones y posiciones originales (nunca convertir rectángulo en cuadrado).
 *  - Entregar candidatos alternativos rankeados con confianza calibrada [0, 1]. */

export const EXCLUDED_AUTO_SHAPES = Object.freeze(['trapezoid']);

export const SHAPE_LABELS = Object.freeze({
  line: 'Recta',
  segment: 'Segmento',
  ray: 'Semirrecta',
  parallel_lines: 'Rectas paralelas',
  perpendicular_lines: 'Rectas perpendiculares',
  angle: 'Ángulo',
  triangle: 'Triángulo',
  square: 'Cuadrado',
  rectangle: 'Rectángulo',
  rhombus: 'Rombo',
  parallelogram: 'Paralelogramo',
  polygon: 'Polígono',
  circle: 'Circunferencia',
  ellipse: 'Elipse',
  arc: 'Arco',
  cube: 'Cubo',
  prism: 'Prisma',
  cylinder: 'Cilindro',
  pyramid: 'Pirámide'
});

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (v, s) => [v[0] * s, v[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const norm = (v) => Math.hypot(v[0], v[1]);
const unit = (v) => {
  const n = norm(v);
  return n > EPS ? [v[0] / n, v[1] / n] : [1, 0];
};
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const rad2deg = (r) => (r * 180) / Math.PI;
const deg2rad = (d) => (d * Math.PI) / 180;

function isFinitePoint(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));
}

export function extractPoints(strokeOrPts, minStep = 0) {
  const raw = Array.isArray(strokeOrPts) ? strokeOrPts : (Array.isArray(strokeOrPts?.pts) ? strokeOrPts.pts : []);
  const out = [];
  for (const p of raw) {
    if (!isFinitePoint(p)) continue;
    const pt = [Number(p[0]), Number(p[1])];
    if (!out.length || minStep <= 0 || dist(out[out.length - 1], pt) >= minStep) {
      out.push(pt);
    }
  }
  return out;
}

export function boundingBox(pts) {
  if (!pts.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, diag: 0, center: [0, 0] };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX, maxX, minY, maxY, width, height,
    diag: Math.hypot(width, height),
    center: [(minX + maxX) / 2, (minY + maxY) / 2]
  };
}

export function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

export function polygonArea(pts) {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += cross(pts[i], pts[(i + 1) % pts.length]);
  return Math.abs(s) / 2;
}

export function polygonCentroid(pts) {
  if (!pts.length) return [0, 0];
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  return [cx / pts.length, cy / pts.length];
}

export function pointToLineDistance(p, a, b) {
  const v = sub(b, a);
  const n = norm(v);
  if (n < EPS) return dist(p, a);
  return Math.abs(cross(sub(p, a), v)) / n;
}

export function pointToSegmentDistance(p, a, b) {
  const v = sub(b, a);
  const d2 = dot(v, v);
  if (d2 < EPS) return dist(p, a);
  const t = clamp(dot(sub(p, a), v) / d2, 0, 1);
  return dist(p, [a[0] + t * v[0], a[1] + t * v[1]]);
}

export function projectPointOnLine(p, a, b) {
  const v = sub(b, a);
  const d2 = dot(v, v);
  if (d2 < EPS) return { point: [a[0], a[1]], t: 0 };
  const t = dot(sub(p, a), v) / d2;
  return { point: [a[0] + t * v[0], a[1] + t * v[1]], t };
}

function lineLineIntersection(a1, a2, b1, b2) {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(b1, a1), s) / denom;
  const u = cross(sub(b1, a1), r) / denom;
  return { point: [a1[0] + t * r[0], a1[1] + t * r[1]], t, u };
}

function segmentsProperlyIntersect(a1, a2, b1, b2) {
  const inter = lineLineIntersection(a1, a2, b1, b2);
  if (!inter) return false;
  return inter.t > 1e-4 && inter.t < 1 - 1e-4 && inter.u > 1e-4 && inter.u < 1 - 1e-4;
}

function isSimplePolygon(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsProperlyIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > Math.abs(M[pivot][k])) pivot = i;
    }
    if (Math.abs(M[pivot][k]) < 1e-11) return null;
    [M[k], M[pivot]] = [M[pivot], M[k]];
    const diag = M[k][k];
    for (let j = k; j <= n; j++) M[k][j] /= diag;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = M[i][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  return M.map((row) => row[n]);
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  return sorted[clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1)];
}

/* ============================================================================
 * 1. ANÁLISIS ROBUSTO: PCA, AJUSTE DE RECTAS, CÍRCULOS (KASA/TAUBIN), ELIPSES, RANSAC
 * ============================================================================ */

export function computePCA(strokeOrPts) {
  const pts = extractPoints(strokeOrPts);
  if (pts.length < 2) return null;
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x - mx, dy = y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  sxx /= pts.length;
  sxy /= pts.length;
  syy /= pts.length;
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 + disc;
  const lambda2 = Math.max(0, trace / 2 - disc);
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const primaryAxis = [Math.cos(angle), Math.sin(angle)];
  const secondaryAxis = [-Math.sin(angle), Math.cos(angle)];
  const aspectRatio = lambda2 > EPS ? Math.sqrt(lambda1 / lambda2) : Infinity;
  return {
    centroid: [mx, my],
    angle,
    angleDeg: rad2deg(angle),
    primaryAxis,
    secondaryAxis,
    eigenvalues: [lambda1, lambda2],
    aspectRatio
  };
}

export function fitLineTLS(strokeOrPts) {
  const pts = extractPoints(strokeOrPts);
  if (pts.length < 2) return null;
  const pca = computePCA(pts);
  if (!pca) return null;
  let v = pca.primaryAxis;
  const rawDir = sub(pts[pts.length - 1], pts[0]);
  if (dot(v, rawDir) < 0) v = [-v[0], -v[1]];
  let tMin = Infinity, tMax = -Infinity;
  for (const p of pts) {
    const t = dot(sub(p, pca.centroid), v);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  const start = add(pca.centroid, scale(v, tMin));
  const end = add(pca.centroid, scale(v, tMax));
  const length = dist(start, end);
  if (length < EPS) return null;
  const residuals = pts.map((p) => pointToLineDistance(p, start, end));
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / pts.length);
  return {
    kind: 'segment',
    points: [start, end],
    center: pca.centroid,
    direction: v,
    angle: Math.atan2(v[1], v[0]),
    angleDeg: rad2deg(Math.atan2(v[1], v[0])),
    length,
    rms,
    p90Residual: percentile(residuals, 0.9)
  };
}

export function fitLineRANSAC(strokeOrPts, options = {}) {
  const pts = extractPoints(strokeOrPts);
  if (pts.length < 2) return null;
  if (pts.length <= 4) {
    const tls = fitLineTLS(pts);
    return tls ? { ...tls, inlierRatio: 1, inliers: pts } : null;
  }
  const bb = boundingBox(pts);
  const threshold = options.threshold ?? Math.max(4, bb.diag * 0.035);
  const n = pts.length;
  // Muestreo determinístico de pares bien espaciados para reproducibilidad y velocidad.
  const stride = Math.max(1, Math.floor(n / 18));
  let bestInliers = [];
  for (let i = 0; i < n; i += stride) {
    for (let j = i + Math.max(1, Math.floor(n / 6)); j < n; j += stride) {
      if (dist(pts[i], pts[j]) < Math.max(6, bb.diag * 0.1)) continue;
      const inliers = [];
      for (let k = 0; k < n; k++) {
        if (pointToLineDistance(pts[k], pts[i], pts[j]) <= threshold) inliers.push(pts[k]);
      }
      if (inliers.length > bestInliers.length) bestInliers = inliers;
    }
  }
  const basePts = bestInliers.length >= Math.max(2, Math.floor(n * 0.5)) ? bestInliers : pts;
  const refined = fitLineTLS(basePts);
  if (!refined) return null;
  const inliers = pts.filter((p) => pointToLineDistance(p, refined.points[0], refined.points[1]) <= threshold);
  return {
    ...refined,
    inlierRatio: inliers.length / n,
    inlierCount: inliers.length,
    totalCount: n
  };
}

export function fitCircleKasa(strokeOrPts) {
  const pts = extractPoints(strokeOrPts);
  if (pts.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    sz += z; sxz += x * z; syz += y * z;
  }
  const sol = solveLinearSystem(
    [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, pts.length]],
    [-sxz, -syz, -sz]
  );
  if (!sol) return null;
  const cx = -sol[0] / 2;
  const cy = -sol[1] / 2;
  const r2 = cx * cx + cy * cy - sol[2];
  if (!Number.isFinite(r2) || r2 <= EPS) return null;
  const r = Math.sqrt(r2);
  const residuals = pts.map((p) => Math.abs(dist(p, [cx, cy]) - r));
  const rms = Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / pts.length);
  return { kind: 'circle', method: 'kasa', cx, cy, r, rms, normalizedRms: rms / r };
}

export function fitCircleTaubin(strokeOrPts) {
  const pts = extractPoints(strokeOrPts);
  if (pts.length < 4) return fitCircleKasa(pts);
  const n = pts.length;
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= n; my /= n;
  let Mxx = 0, Myy = 0, Mxy = 0, Mxz = 0, Myz = 0, Mzz = 0;
  for (const [px, py] of pts) {
    const xi = px - mx, yi = py - my, zi = xi * xi + yi * yi;
    Mxy += xi * yi;
    Mxx += xi * xi;
    Myy += yi * yi;
    Mxz += xi * zi;
    Myz += yi * zi;
    Mzz += zi * zi;
  }
  Mxx /= n; Myy /= n; Mxy /= n; Mxz /= n; Myz /= n; Mzz /= n;
  const Mz = Mxx + Myy;
  const Cov_xy = Mxx * Myy - Mxy * Mxy;
  const Var_z = Mzz - Mz * Mz;
  const A3 = 4 * Mz;
  const A2 = -3 * Mz * Mz - Mzz;
  const A1 = Var_z * Mz + 4 * Cov_xy * Mz - Mxz * Mxz - Myz * Myz;
  const A0 = Mxz * (Mxz * Myy - Myz * Mxy) + Myz * (Myz * Mxx - Mxz * Mxy) - Var_z * Cov_xy;
  const A22 = A2 + A2;
  const A33 = A3 + A3 + A3;
  let x = 0;
  let y = A0;
  for (let iter = 0; iter < 25; iter++) {
    const Dy = A1 + x * (A22 + A33 * x);
    if (Math.abs(Dy) < 1e-12) break;
    const xNew = x - y / Dy;
    if (!Number.isFinite(xNew) || Math.abs(xNew - x) < 1e-10) { x = xNew; break; }
    const yNew = A0 + xNew * (A1 + xNew * (A2 + xNew * A3));
    if (Math.abs(yNew) >= Math.abs(y)) break;
    x = xNew;
    y = yNew;
  }
  const DET = x * x - x * Mz + Cov_xy;
  if (!Number.isFinite(DET) || Math.abs(DET) < 1e-10) return fitCircleKasa(pts);
  const xCenter = (Mxz * (Myy - x) - Myz * Mxy) / (2 * DET);
  const yCenter = (Myz * (Mxx - x) - Mxz * Mxy) / (2 * DET);
  const cx = xCenter + mx;
  const cy = yCenter + my;
  const r2 = xCenter * xCenter + yCenter * yCenter + Mz;
  if (!Number.isFinite(r2) || r2 <= EPS) return fitCircleKasa(pts);
  const r = Math.sqrt(r2);
  const residuals = pts.map((p) => Math.abs(dist(p, [cx, cy]) - r));
  const rms = Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / pts.length);
  return { kind: 'circle', method: 'taubin', cx, cy, r, rms, normalizedRms: rms / r };
}

function circleFrom3Points(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  const r = dist([cx, cy], a);
  if (!Number.isFinite(r) || r < 5 || r > 2000) return null;
  return { cx, cy, r };
}

export function fitCircleRobust(strokeOrPts, options = {}) {
  const pts = extractPoints(strokeOrPts);
  if (pts.length < 5) return fitCircleTaubin(pts);
  const bb = boundingBox(pts);
  const threshold = options.threshold ?? Math.max(4, bb.diag * 0.055);
  const n = pts.length;
  const step = Math.max(1, Math.floor(n / 12));
  let bestInliers = [];
  for (let i = 0; i < n; i += step) {
    const j = (i + Math.floor(n / 3)) % n;
    const k = (i + Math.floor((2 * n) / 3)) % n;
    const cand = circleFrom3Points(pts[i], pts[j], pts[k]);
    if (!cand) continue;
    const inliers = [];
    for (let m = 0; m < n; m++) {
      if (Math.abs(dist(pts[m], [cand.cx, cand.cy]) - cand.r) <= threshold) inliers.push(pts[m]);
    }
    if (inliers.length > bestInliers.length) bestInliers = inliers;
  }
  const base = bestInliers.length >= Math.max(5, Math.floor(n * 0.55)) ? bestInliers : pts;
  const fit = fitCircleTaubin(base);
  if (!fit) return null;
  const inliers = pts.filter((p) => Math.abs(dist(p, [fit.cx, fit.cy]) - fit.r) <= threshold);
  // Calcular cobertura angular
  const angles = pts.map((p) => Math.atan2(p[1] - fit.cy, p[0] - fit.cx));
  let sweep = 0;
  for (let i = 1; i < angles.length; i++) {
    sweep += Math.atan2(Math.sin(angles[i] - angles[i - 1]), Math.cos(angles[i] - angles[i - 1]));
  }
  const sortedA = angles.slice().sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sortedA.length; i++) {
    const next = i + 1 < sortedA.length ? sortedA[i + 1] : sortedA[0] + 2 * Math.PI;
    const gap = next - sortedA[i];
    if (gap > maxGap) maxGap = gap;
  }
  const angularCoverage = clamp((2 * Math.PI - maxGap) / (2 * Math.PI), 0, 1);
  return {
    ...fit,
    inlierRatio: inliers.length / n,
    sweepRad: Math.abs(sweep),
    sweepDeg: rad2deg(Math.abs(sweep)),
    angularCoverage,
    startAngle: angles[0],
    endAngle: angles[angles.length - 1]
  };
}

export function fitEllipse(strokeOrPts) {
  const pts = extractPoints(strokeOrPts);
  if (pts.length < 6) return null;
  const pca = computePCA(pts);
  if (!pca) return null;
  const [cx, cy] = pca.centroid;
  const cos = Math.cos(-pca.angle);
  const sin = Math.sin(-pca.angle);
  const local = pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [dx * cos - dy * sin, dx * sin + dy * cos];
  });
  let maxU = 0, maxV = 0, minU = 0, minV = 0;
  for (const [u, v] of local) {
    if (u > maxU) maxU = u;
    if (u < minU) minU = u;
    if (v > maxV) maxV = v;
    if (v < minV) minV = v;
  }
  // Refinar centro en coordenadas locales
  const shiftU = (maxU + minU) / 2;
  const shiftV = (maxV + minV) / 2;
  const centered = local.map(([u, v]) => [u - shiftU, v - shiftV]);
  const rx = (maxU - minU) / 2;
  const ry = (maxV - minV) / 2;
  if (rx < 8 || ry < 8) return null;
  // Reproyectar centro refinado al espacio global
  const cosP = Math.cos(pca.angle);
  const sinP = Math.sin(pca.angle);
  const refinedCx = cx + shiftU * cosP - shiftV * sinP;
  const refinedCy = cy + shiftU * sinP + shiftV * cosP;
  // Error normalizado de elipse: |(u/rx)^2 + (v/ry)^2 - 1|
  const errors = centered.map(([u, v]) => {
    const rNorm = Math.hypot(u / rx, v / ry);
    return Math.abs(rNorm - 1);
  });
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const axisRatio = Math.max(rx, ry) / Math.min(rx, ry);
  const angles = centered.map(([u, v]) => Math.atan2(v / ry, u / rx));
  const sortedA = angles.slice().sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sortedA.length; i++) {
    const next = i + 1 < sortedA.length ? sortedA[i + 1] : sortedA[0] + 2 * Math.PI;
    maxGap = Math.max(maxGap, next - sortedA[i]);
  }
  const angularCoverage = clamp((2 * Math.PI - maxGap) / (2 * Math.PI), 0, 1);
  return {
    kind: 'ellipse',
    cx: refinedCx,
    cy: refinedCy,
    rx,
    ry,
    angle: pca.angle,
    angleDeg: pca.angleDeg,
    axisRatio,
    rms,
    angularCoverage
  };
}

/* ============================================================================
 * 2. VÉRTICES, ÁNGULOS, PARALELISMO, PERPENDICULARIDAD Y SIMETRÍA
 * ============================================================================ */

export function angleBetweenVectors(v1, v2) {
  const n1 = norm(v1), n2 = norm(v2);
  if (n1 < EPS || n2 < EPS) return 0;
  const c = clamp(dot(v1, v2) / (n1 * n2), -1, 1);
  return rad2deg(Math.acos(c));
}

export function acuteAngleBetweenLines(dir1, dir2) {
  const a = angleBetweenVectors(dir1, dir2);
  return a > 90 ? 180 - a : a;
}

export function areParallel(segA, segB, toleranceDeg = 8) {
  const d1 = sub(segA[1], segA[0]);
  const d2 = sub(segB[1], segB[0]);
  return acuteAngleBetweenLines(d1, d2) <= toleranceDeg;
}

export function arePerpendicular(segA, segB, toleranceDeg = 8) {
  const d1 = sub(segA[1], segA[0]);
  const d2 = sub(segB[1], segB[0]);
  return Math.abs(acuteAngleBetweenLines(d1, d2) - 90) <= toleranceDeg;
}

export function analyzeLinePairRelation(segA, segB, options = {}) {
  const parallelTol = options.parallelTolDeg ?? 8;
  const perpTol = options.perpTolDeg ?? 8;
  const d1 = sub(segA[1], segA[0]);
  const d2 = sub(segB[1], segB[0]);
  const angleDeg = acuteAngleBetweenLines(d1, d2);
  const inter = lineLineIntersection(segA[0], segA[1], segB[0], segB[1]);
  const intersectsOnSegments = Boolean(
    inter && inter.t >= -0.05 && inter.t <= 1.05 && inter.u >= -0.05 && inter.u <= 1.05
  );
  const parallel = angleDeg <= parallelTol;
  const perpendicular = Math.abs(angleDeg - 90) <= perpTol;
  const separation = parallel ? pointToLineDistance(segB[0], segA[0], segA[1]) : 0;
  return {
    angleDeg,
    parallel,
    perpendicular,
    intersectsOnSegments,
    intersection: inter ? inter.point : null,
    separation
  };
}

export function interiorAngles(vertices) {
  const n = vertices.length;
  if (n < 3) return [];
  const angles = [];
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    angles.push(angleBetweenVectors(sub(prev, curr), sub(next, curr)));
  }
  return angles;
}

function rdpIndices(pts, epsilon) {
  if (pts.length <= 2) return pts.map((_, i) => i);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointToSegmentDistance(pts[i], pts[a], pts[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(i);
  return out;
}

export function detectVertices(strokeOrPts, options = {}) {
  const pts = extractPoints(strokeOrPts, 1.0);
  if (pts.length < 3) return { closed: false, vertices: pts.slice(), indices: pts.map((_, i) => i) };
  const bb = boundingBox(pts);
  const closeTol = options.closeTol ?? clamp(bb.diag * 0.2, 14, 42);
  let nearestIdx = pts.length - 1;
  let minGap = dist(pts[0], pts[pts.length - 1]);
  for (let i = Math.floor(pts.length * 0.65); i < pts.length; i++) {
    const g = dist(pts[0], pts[i]);
    if (g < minGap) { minGap = g; nearestIdx = i; }
  }
  const closed = minGap <= closeTol && pts.length >= 6;
  const working = closed ? pts.slice(0, nearestIdx + 1) : pts.slice();

  if (!closed) {
    const eps = options.epsilon ?? Math.max(5, bb.diag * 0.055);
    const idxs = rdpIndices(working, eps);
    return { closed: false, vertices: idxs.map((i) => working[i]), indices: idxs };
  }

  // Contorno cerrado: rotar al punto extremo para anclar RDP en un vértice real
  const raw = working.slice(0, -1);
  const pivots = [
    raw.reduce((best, p, i) => (p[0] + p[1] < raw[best][0] + raw[best][1] ? i : best), 0),
    raw.reduce((best, p, i) => (p[0] - p[1] < raw[best][0] - raw[best][1] ? i : best), 0),
    raw.reduce((best, p, i) => (p[0] + p[1] > raw[best][0] + raw[best][1] ? i : best), 0),
    raw.reduce((best, p, i) => (p[0] - p[1] > raw[best][0] - raw[best][1] ? i : best), 0)
  ];
  let bestVertices = null;
  let bestScore = Infinity;
  let bestEdgeErr = Infinity;
  for (const pivot of [...new Set(pivots)]) {
    const rotated = raw.slice(pivot).concat(raw.slice(0, pivot));
    rotated.push(rotated[0]);
    for (const frac of [0.045, 0.065, 0.09, 0.12]) {
      const idxs = rdpIndices(rotated, Math.max(5, bb.diag * frac));
      const count = idxs.length - 1;
      if (count < 3 || count > 10) continue;
      // Ajustar cada lado con TLS y refinar vértices por intersección
      const edges = [];
      let ok = true;
      for (let i = 0; i < count; i++) {
        const slice = rotated.slice(idxs[i], idxs[i + 1] + 1);
        const fit = fitLineTLS(slice);
        if (!fit || fit.length < Math.max(10, bb.diag * 0.08)) { ok = false; break; }
        edges.push(fit);
      }
      if (!ok) continue;
      const verts = [];
      for (let i = 0; i < count; i++) {
        const prev = edges[(i - 1 + count) % count];
        const curr = edges[i];
        const anchor = rotated[idxs[i]];
        const inter = lineLineIntersection(prev.points[0], prev.points[1], curr.points[0], curr.points[1]);
        verts.push(inter && dist(inter.point, anchor) <= Math.max(16, bb.diag * 0.18) ? inter.point : anchor);
      }
      if (verts.some((v, i) => dist(v, verts[(i + 1) % verts.length]) < Math.max(10, bb.diag * 0.08))) continue;
      if (!isSimplePolygon(verts) || polygonArea(verts) < bb.diag * bb.diag * 0.05) continue;
      const err = rotated.reduce((sum, p) => {
        let m = Infinity;
        for (let i = 0; i < verts.length; i++) {
          const d = pointToSegmentDistance(p, verts[i], verts[(i + 1) % verts.length]);
          if (d < m) m = d;
        }
        return sum + m;
      }, 0) / rotated.length;
      const edgeErrRatio = err / bb.diag;
      const score = edgeErrRatio + (count - 3) * 0.016;
      if (score < bestScore) {
        bestScore = score;
        bestEdgeErr = edgeErrRatio;
        bestVertices = verts;
      }
    }
  }
  return {
    closed: true,
    vertices: bestVertices || [],
    score: bestScore,
    edgeErrorRatio: bestEdgeErr
  };
}

export function analyzeSymmetry(vertices, options = {}) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    return { reflectionAxes: [], rotationalOrders: [] };
  }
  const c = polygonCentroid(vertices);
  const bb = boundingBox(vertices);
  const tol = options.tolerance ?? Math.max(6, bb.diag * 0.07);
  const reflectionAxes = [];
  const seenAngles = [];

  const testAxis = (angle) => {
    const normA = ((angle % Math.PI) + Math.PI) % Math.PI;
    if (seenAngles.some((a) => Math.abs(a - normA) < 0.08 || Math.abs(Math.abs(a - normA) - Math.PI) < 0.08)) return;
    const ux = Math.cos(normA), uy = Math.sin(normA);
    let maxErr = 0;
    for (const v of vertices) {
      const dx = v[0] - c[0], dy = v[1] - c[1];
      const proj = dx * ux + dy * uy;
      const rx = c[0] + 2 * proj * ux - dx;
      const ry = c[1] + 2 * proj * uy - dy;
      const nearest = Math.min(...vertices.map((w) => dist([rx, ry], w)));
      if (nearest > maxErr) maxErr = nearest;
    }
    if (maxErr <= tol) {
      seenAngles.push(normA);
      reflectionAxes.push({ origin: c, angle: normA, angleDeg: rad2deg(normA), error: maxErr });
    }
  };

  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    const m = mid(v, vertices[(i + 1) % vertices.length]);
    testAxis(Math.atan2(v[1] - c[1], v[0] - c[0]));
    testAxis(Math.atan2(m[1] - c[1], m[0] - c[0]));
  }

  const rotationalOrders = [];
  for (let k = 2; k <= Math.min(vertices.length, 8); k++) {
    const theta = (2 * Math.PI) / k;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    let maxErr = 0;
    for (const v of vertices) {
      const dx = v[0] - c[0], dy = v[1] - c[1];
      const rx = c[0] + dx * cos - dy * sin;
      const ry = c[1] + dx * sin + dy * cos;
      const nearest = Math.min(...vertices.map((w) => dist([rx, ry], w)));
      if (nearest > maxErr) maxErr = nearest;
    }
    if (maxErr <= tol) rotationalOrders.push(k);
  }

  return { reflectionAxes, rotationalOrders };
}

/* ============================================================================
 * 3. CLASIFICACIÓN DE POLÍGONOS (SIN AUTO-TRAPECIO, SIN FORZAR RECTÁNGULO A CUADRADO)
 * ============================================================================ */

export function classifyPolygon(vertices, options = {}) {
  if (!Array.isArray(vertices) || vertices.length < 3) return null;
  const n = vertices.length;
  const sides = [];
  for (let i = 0; i < n; i++) sides.push(dist(vertices[i], vertices[(i + 1) % n]));
  const angles = interiorAngles(vertices);
  const avgSide = sides.reduce((s, v) => s + v, 0) / n;
  const maxSide = Math.max(...sides);
  const minSide = Math.min(...sides);
  const sideRatio = maxSide / Math.max(EPS, minSide);
  const maxRightErr = Math.max(...angles.map((a) => Math.abs(a - 90)));

  if (n === 3) {
    const sortedSides = sides.slice().sort((a, b) => a - b);
    const hasRight = angles.some((a) => Math.abs(a - 90) <= 10);
    let subtype = 'scalene';
    if (sortedSides[2] / Math.max(EPS, sortedSides[0]) <= 1.12) subtype = 'equilateral';
    else if (
      sortedSides[1] / Math.max(EPS, sortedSides[0]) <= 1.12 ||
      sortedSides[2] / Math.max(EPS, sortedSides[1]) <= 1.12
    ) subtype = 'isosceles';
    return {
      shape: 'triangle',
      subtype,
      isRight: hasRight,
      sides,
      angles,
      confidence: 0.92,
      alternatives: []
    };
  }

  if (n === 4) {
    const edges = [
      [vertices[0], vertices[1]],
      [vertices[1], vertices[2]],
      [vertices[2], vertices[3]],
      [vertices[3], vertices[0]]
    ];
    const opp02Parallel = areParallel(edges[0], edges[2], 12);
    const opp13Parallel = areParallel(edges[1], edges[3], 12);
    const bothPairsParallel = opp02Parallel && opp13Parallel;
    const onlyOnePairParallel = opp02Parallel !== opp13Parallel;
    const allRight = maxRightErr <= 12;
    const oppSidesEqual =
      Math.abs(sides[0] - sides[2]) / Math.max(sides[0], sides[2], EPS) <= 0.16 &&
      Math.abs(sides[1] - sides[3]) / Math.max(sides[1], sides[3], EPS) <= 0.16;
    const allSidesEqual = sideRatio <= 1.12;
    // Aspect ratio estricta para cuadrado vs rectángulo: nunca forzar rectángulo a cuadrado
    const adjRatio = Math.max(sides[0], sides[1]) / Math.max(EPS, Math.min(sides[0], sides[1]));
    const isStrictSquareRatio = sideRatio <= 1.09 && adjRatio <= 1.09;

    const candidates = [];

    if (allRight && isStrictSquareRatio) {
      const sqConf = clamp(0.95 - (sideRatio - 1) * 1.2 - maxRightErr * 0.008, 0.72, 0.96);
      candidates.push({ shape: 'square', confidence: sqConf, reason: '4 ángulos rectos y 4 lados iguales' });
      candidates.push({ shape: 'rectangle', confidence: clamp(sqConf - 0.12, 0.5, 0.84), reason: 'caso particular de rectángulo' });
    } else if (allRight && (bothPairsParallel || oppSidesEqual)) {
      const rectConf = clamp(0.94 - maxRightErr * 0.008, 0.74, 0.96);
      candidates.push({ shape: 'rectangle', confidence: rectConf, reason: `4 ángulos rectos con proporción ${adjRatio.toFixed(2)}:1 preservada` });
      if (adjRatio <= 1.16) {
        candidates.push({ shape: 'square', confidence: clamp(0.65 - (adjRatio - 1.09) * 3, 0.35, 0.65), reason: 'proporción cercana a cuadrado' });
      }
      candidates.push({ shape: 'parallelogram', confidence: clamp(rectConf - 0.18, 0.45, 0.75), reason: 'lados opuestos paralelos' });
    } else if (allSidesEqual && bothPairsParallel && !allRight) {
      const rhombConf = clamp(0.9 - (sideRatio - 1) * 1.5, 0.7, 0.93);
      candidates.push({ shape: 'rhombus', confidence: rhombConf, reason: '4 lados iguales y ángulos no rectos' });
      candidates.push({ shape: 'parallelogram', confidence: clamp(rhombConf - 0.12, 0.5, 0.8), reason: 'dos pares de lados paralelos' });
    } else if (bothPairsParallel && oppSidesEqual) {
      candidates.push({ shape: 'parallelogram', confidence: 0.86, reason: 'dos pares de lados opuestos paralelos' });
      candidates.push({ shape: 'polygon', confidence: 0.68, reason: 'cuadrilátero general' });
    } else if (onlyOnePairParallel) {
      // REGLA ESTRICTA: excluir reconocimiento automático de trapecio.
      // Se clasifica como 'polygon' (cuadrilátero) y nunca como 'trapezoid'.
      candidates.push({
        shape: 'polygon',
        confidence: 0.82,
        reason: 'cuadrilátero general (trapecio excluido del reconocimiento automático)'
      });
    } else {
      candidates.push({ shape: 'polygon', confidence: 0.8, reason: 'cuadrilátero general' });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    return {
      shape: candidates[0].shape,
      sidesCount: 4,
      sides,
      angles,
      aspectRatio: adjRatio,
      confidence: candidates[0].confidence,
      alternatives: candidates.slice(1)
    };
  }

  // Polígono general (n >= 5)
  const regular = sideRatio <= 1.15 && Math.max(...angles) - Math.min(...angles) <= 18;
  return {
    shape: 'polygon',
    sidesCount: n,
    regular,
    sides,
    angles,
    confidence: clamp(0.86 - (n - 5) * 0.02, 0.68, 0.9),
    alternatives: []
  };
}

/* ============================================================================
 * 4. CONEXIÓN MULTI-TRAZO, FLECHAS/RAYOS/RECTAS Y FIGURAS 3D WIREFRAME
 * ============================================================================ */

function connectSegmentsToPolygon(segments, diag) {
  if (segments.length < 3 || segments.length > 10) return null;
  const tol = clamp(Math.max(14, diag * 0.11), 14, 38);
  const endpoints = segments.flatMap((s) => s.points);
  const clusters = [];
  const mapIdx = [];
  for (let i = 0; i < endpoints.length; i++) {
    let best = -1, bestD = tol;
    for (let j = 0; j < clusters.length; j++) {
      const d = dist(endpoints[i], clusters[j].mean);
      if (d <= bestD) { bestD = d; best = j; }
    }
    if (best < 0) {
      best = clusters.length;
      clusters.push({ pts: [], mean: endpoints[i].slice() });
    }
    clusters[best].pts.push(endpoints[i]);
    clusters[best].mean = [
      clusters[best].pts.reduce((s, p) => s + p[0], 0) / clusters[best].pts.length,
      clusters[best].pts.reduce((s, p) => s + p[1], 0) / clusters[best].pts.length
    ];
    mapIdx[i] = best;
  }
  if (clusters.length !== segments.length) return null;
  const adj = clusters.map(() => []);
  for (let i = 0; i < segments.length; i++) {
    const a = mapIdx[2 * i], b = mapIdx[2 * i + 1];
    if (a === b) return null;
    adj[a].push({ to: b, seg: i });
    adj[b].push({ to: a, seg: i });
  }
  if (adj.some((list) => list.length !== 2)) return null;
  const visited = new Set();
  const order = [];
  const edgeOrder = [];
  let cur = 0, prev = -1;
  for (let i = 0; i < segments.length; i++) {
    if (visited.has(cur)) return null;
    visited.add(cur);
    order.push(cur);
    const next = adj[cur].find((e) => e.to !== prev);
    if (!next) return null;
    edgeOrder.push(next.seg);
    prev = cur;
    cur = next.to;
  }
  if (cur !== order[0] || visited.size !== segments.length) return null;
  const vertices = order.map((nodeIdx, i) => {
    const sPrev = segments[edgeOrder[(i - 1 + segments.length) % segments.length]];
    const sCurr = segments[edgeOrder[i]];
    const inter = lineLineIntersection(sPrev.points[0], sPrev.points[1], sCurr.points[0], sCurr.points[1]);
    return inter && dist(inter.point, clusters[nodeIdx].mean) <= tol * 1.5
      ? inter.point
      : clusters[nodeIdx].mean;
  });
  if (!isSimplePolygon(vertices) || polygonArea(vertices) < diag * diag * 0.05) return null;
  return vertices;
}

function detectArrowheadOnEndpoint(endpoint, shaftDir, candidateStrokes, shaftLen) {
  const maxBarbLen = Math.max(12, shaftLen * 0.35);
  const attachTol = Math.max(14, shaftLen * 0.14);
  const barbs = [];
  for (const s of candidateStrokes) {
    const pts = extractPoints(s, 1);
    if (pts.length < 2) continue;
    const fit = fitLineTLS(pts);
    // Una cabeza de flecha puede ser 1 trazo en V (2 segmentos) o 2 trazos cortos
    if (fit && fit.length <= maxBarbLen && fit.rms <= Math.max(5, fit.length * 0.18)) {
      const d0 = dist(fit.points[0], endpoint);
      const d1 = dist(fit.points[1], endpoint);
      if (Math.min(d0, d1) <= attachTol) {
        const barbDir = d0 <= d1 ? sub(fit.points[1], fit.points[0]) : sub(fit.points[0], fit.points[1]);
        const ang = angleBetweenVectors(barbDir, [-shaftDir[0], -shaftDir[1]]);
        if (ang >= 10 && ang <= 75) barbs.push({ stroke: s, angle: ang, side: Math.sign(cross(shaftDir, barbDir)) });
      }
    } else if (pts.length >= 3) {
      const v = detectVertices(pts, { epsilon: Math.max(3, maxBarbLen * 0.18) });
      if (!v.closed && v.vertices.length === 3 && dist(v.vertices[1], endpoint) <= attachTol) {
        const b1 = sub(v.vertices[0], v.vertices[1]);
        const b2 = sub(v.vertices[2], v.vertices[1]);
        if (norm(b1) <= maxBarbLen && norm(b2) <= maxBarbLen) {
          const a1 = angleBetweenVectors(b1, [-shaftDir[0], -shaftDir[1]]);
          const a2 = angleBetweenVectors(b2, [-shaftDir[0], -shaftDir[1]]);
          if (a1 >= 10 && a1 <= 75 && a2 >= 10 && a2 <= 75) {
            return { found: true, strokes: [s] };
          }
        }
      }
    }
  }
  if (barbs.length >= 2) {
    const hasPos = barbs.some((b) => b.side > 0);
    const hasNeg = barbs.some((b) => b.side < 0);
    if (hasPos && hasNeg) return { found: true, strokes: barbs.slice(0, 2).map((b) => b.stroke) };
  }
  return { found: false, strokes: [] };
}

function detect3DWireframe(strokes, strokePtsList) {
  if (strokes.length < 3) return null;
  const allPts = strokePtsList.flat();
  const bb = boundingBox(allPts);
  if (bb.diag < 50) return null;

  // 1. Cilindro: 2 elipses aproximadamente paralelas + 2 líneas laterales conectando extremos
  const ellipses = [];
  const lineParts = [];
  const polys = [];
  for (let i = 0; i < strokePtsList.length; i++) {
    const pts = strokePtsList[i];
    const lFit = fitLineRANSAC(pts);
    if (lFit && lFit.length >= 16 && lFit.p90Residual <= Math.max(6, lFit.length * 0.085) && lFit.inlierRatio >= 0.78) {
      lineParts.push({ index: i, fit: lFit });
      continue;
    }
    const vRes = detectVertices(pts);
    const eFit = fitEllipse(pts);
    const isClosedPoly = vRes.closed && vRes.vertices.length >= 3 && vRes.vertices.length <= 6 && vRes.score < 0.065;
    if (eFit && eFit.angularCoverage >= 0.72 && eFit.rms <= 0.16 && (!isClosedPoly || eFit.rms < 0.09)) {
      ellipses.push({ index: i, fit: eFit });
      continue;
    }
    if (isClosedPoly) {
      polys.push({ index: i, vertices: vRes.vertices });
    }
  }

  if (ellipses.length === 2 && lineParts.length >= 2) {
    const [e1, e2] = ellipses;
    const rxRatio = Math.max(e1.fit.rx, e2.fit.rx) / Math.max(EPS, Math.min(e1.fit.rx, e2.fit.rx));
    const centerDist = dist([e1.fit.cx, e1.fit.cy], [e2.fit.cx, e2.fit.cy]);
    const parallelSides = areParallel(lineParts[0].fit.points, lineParts[1].fit.points, 14);
    if (rxRatio <= 1.35 && centerDist >= Math.max(20, Math.min(e1.fit.ry, e2.fit.ry)) && parallelSides) {
      return {
        shape: 'cylinder',
        confidence: 0.87,
        geometry: {
          kind: 'cylinder',
          bases: [e1.fit, e2.fit],
          sides: lineParts.slice(0, 2).map((l) => l.fit.points),
          bounds: bb
        },
        reason: 'dos bases elípticas conectadas por generatrices paralelas'
      };
    }
  }

  // 2. Cubo o prisma: dos caras poligonales congruentes/trasladadas + aristas conectoras
  if (polys.length === 2 && lineParts.length >= 2) {
    const [p1, p2] = polys;
    if (p1.vertices.length === p2.vertices.length && p1.vertices.length >= 3) {
      const c1 = polygonCentroid(p1.vertices);
      const c2 = polygonCentroid(p2.vertices);
      const shift = dist(c1, c2);
      if (shift >= Math.max(15, bb.diag * 0.08)) {
        const cls1 = classifyPolygon(p1.vertices);
        const cls2 = classifyPolygon(p2.vertices);
        const isCube = p1.vertices.length === 4 && cls1?.shape === 'square' && cls2?.shape === 'square' && lineParts.length >= 3;
        return {
          shape: isCube ? 'cube' : 'prism',
          confidence: isCube ? 0.88 : 0.84,
          geometry: {
            kind: isCube ? 'cube' : 'prism',
            faces: [p1.vertices, p2.vertices],
            connectors: lineParts.map((l) => l.fit.points),
            bounds: bb
          },
          reason: isCube ? 'dos caras cuadradas con aristas conectoras' : 'dos caras poligonales con aristas conectoras'
        };
      }
    }
  }

  // 3. Pirámide: 1 base poligonal (3-5 lados) + >=3 aristas convergiendo en un ápice común fuera de la base
  if (polys.length === 1 && lineParts.length >= 3) {
    const base = polys[0].vertices;
    const baseCenter = polygonCentroid(base);
    const tol = Math.max(18, bb.diag * 0.14);
    // Buscar extremo común (ápice) entre las líneas
    const endpoints = lineParts.flatMap((l) => l.fit.points);
    let bestApex = null, bestCount = 0;
    for (const ep of endpoints) {
      if (base.some((v) => dist(v, ep) <= tol)) continue;
      const count = lineParts.filter((l) => dist(l.fit.points[0], ep) <= tol || dist(l.fit.points[1], ep) <= tol).length;
      if (count > bestCount) { bestCount = count; bestApex = ep; }
    }
    if (bestApex && bestCount >= 3 && dist(bestApex, baseCenter) >= bb.diag * 0.18) {
      return {
        shape: 'pyramid',
        confidence: 0.85,
        geometry: {
          kind: 'pyramid',
          base,
          apex: bestApex,
          lateralEdges: lineParts.map((l) => l.fit.points),
          bounds: bb
        },
        reason: 'base poligonal con aristas convergiendo en un ápice'
      };
    }
  }

  return null;
}

/* ============================================================================
 * 5. RECONOCIMIENTO PRINCIPAL DE FORMAS GEOMÉTRICAS
 * ============================================================================ */

export function recognizeGeometry(strokes, options = {}) {
  if (!Array.isArray(strokes) || !strokes.length) return null;
  const strokePtsList = strokes.map((s) => extractPoints(s, 1.0));
  if (strokePtsList.some((pts) => pts.length < 2)) return null;
  const sourceStrokeIds = strokes.flatMap((s, i) =>
    Array.isArray(s?.dsp?.sourceIds) && s.dsp.sourceIds.length
      ? s.dsp.sourceIds
      : Array.isArray(s?.dspMergedFromIds) && s.dspMergedFromIds.length
        ? s.dspMergedFromIds
        : [s?.id ?? `stroke_${i}`]
  );
  const candidates = [];

  // Caso 1: Un solo trazo
  if (strokes.length === 1) {
    const pts = strokePtsList[0];
    const bb = boundingBox(pts);
    const totalLen = polylineLength(pts);
    const endDist = dist(pts[0], pts[pts.length - 1]);
    const isOvertracedStroke = Boolean(strokes[0]?.dsp?.overtraced || strokes[0]?.dspOvertraced || sourceStrokeIds.length > 1);

    // 1a. Segmento / línea recta
    const lineFit = fitLineRANSAC(pts);
    if (lineFit && lineFit.length >= 15 && lineFit.p90Residual <= Math.max(6, lineFit.length * 0.08) && lineFit.inlierRatio >= 0.78) {
      const straightness = clamp(1 - lineFit.rms / Math.max(10, lineFit.length * 0.12), 0.55, 0.98);
      if (isOvertracedStroke) {
        candidates.push({
          shape: 'line',
          label: SHAPE_LABELS.line,
          confidence: straightness,
          geometry: {
            kind: 'line',
            points: lineFit.points,
            direction: lineFit.direction,
            length: lineFit.length,
            angleDeg: lineFit.angleDeg,
            overtraced: true
          },
          reason: 'línea recta repasada fusionada por TLS/RANSAC'
        });
        candidates.push({
          shape: 'segment',
          label: SHAPE_LABELS.segment,
          confidence: clamp(straightness - 0.16, 0.45, 0.8),
          geometry: {
            kind: 'segment',
            points: lineFit.points,
            length: lineFit.length,
            angleDeg: lineFit.angleDeg
          },
          reason: 'alternativa segmento sobre trazo repasado'
        });
      } else {
        candidates.push({
          shape: 'segment',
          label: SHAPE_LABELS.segment,
          confidence: straightness,
          geometry: {
            kind: 'segment',
            points: lineFit.points,
            length: lineFit.length,
            angleDeg: lineFit.angleDeg
          },
          reason: 'trazo recto ajustado por TLS/RANSAC'
        });
      }
    }

    // 1b. Círculo / Elipse / Arco
    const circleFit = fitCircleRobust(pts);
    const ellipseFit = fitEllipse(pts);
    const closedEnough = endDist <= Math.max(18, bb.diag * 0.22);

    if (circleFit && circleFit.r >= 10 && circleFit.r <= 900) {
      const isClosedCircle = (closedEnough || circleFit.angularCoverage >= 0.82) && circleFit.sweepRad >= 4.4;
      if (isClosedCircle && circleFit.normalizedRms <= 0.16) {
        const aspect = ellipseFit ? ellipseFit.axisRatio : 1;
        if (aspect <= 1.2) {
          const conf = clamp(0.96 - circleFit.normalizedRms * 2.2 - (aspect - 1) * 0.6, 0.55, 0.97);
          candidates.push({
            shape: 'circle',
            label: SHAPE_LABELS.circle,
            confidence: conf,
            geometry: { kind: 'circle', cx: circleFit.cx, cy: circleFit.cy, r: circleFit.r },
            reason: `ajuste Taubin/RANSAC (rms=${circleFit.normalizedRms.toFixed(3)})`
          });
        }
        if (ellipseFit && ellipseFit.rms <= 0.16 && aspect > 1.15) {
          const conf = clamp(0.94 - ellipseFit.rms * 2.0, 0.55, 0.95);
          candidates.push({
            shape: 'ellipse',
            label: SHAPE_LABELS.ellipse,
            confidence: conf,
            geometry: {
              kind: 'ellipse',
              cx: ellipseFit.cx,
              cy: ellipseFit.cy,
              rx: ellipseFit.rx,
              ry: ellipseFit.ry,
              angle: ellipseFit.angle,
              angleDeg: ellipseFit.angleDeg
            },
            reason: `elipse con relación de ejes ${aspect.toFixed(2)}:1 preservada`
          });
        }
      } else if (!isClosedCircle && circleFit.sweepDeg >= 35 && circleFit.sweepDeg <= 315 && circleFit.normalizedRms <= 0.11 && totalLen > endDist * 1.07) {
        const conf = clamp(0.88 - circleFit.normalizedRms * 2.5, 0.55, 0.92);
        candidates.push({
          shape: 'arc',
          label: SHAPE_LABELS.arc,
          confidence: conf,
          geometry: {
            kind: 'arc',
            cx: circleFit.cx,
            cy: circleFit.cy,
            r: circleFit.r,
            startAngle: circleFit.startAngle,
            endAngle: circleFit.endAngle,
            sweepDeg: circleFit.sweepDeg
          },
          reason: `arco circular de ${circleFit.sweepDeg.toFixed(0)}°`
        });
      }
    }
    // Elipse dedicada cuando es muy excéntrica (Kasa/Taubin falla con alta excentricidad)
    if (
      ellipseFit &&
      !candidates.some((c) => c.shape === 'ellipse') &&
      (closedEnough || ellipseFit.angularCoverage >= 0.82) &&
      ellipseFit.axisRatio > 1.2 &&
      ellipseFit.rms <= 0.15
    ) {
      candidates.push({
        shape: 'ellipse',
        label: SHAPE_LABELS.ellipse,
        confidence: clamp(0.93 - ellipseFit.rms * 2.1, 0.58, 0.95),
        geometry: {
          kind: 'ellipse',
          cx: ellipseFit.cx,
          cy: ellipseFit.cy,
          rx: ellipseFit.rx,
          ry: ellipseFit.ry,
          angle: ellipseFit.angle,
          angleDeg: ellipseFit.angleDeg
        },
        reason: `elipse con relación ${ellipseFit.axisRatio.toFixed(2)}:1`
      });
    }

    // 1c. Polígono cerrado de un solo trazo
    const vRes = detectVertices(pts);
    if (vRes.closed && vRes.vertices.length >= 3) {
      const cls = classifyPolygon(vRes.vertices, options);
      if (cls) {
        const edgeErr = Number.isFinite(vRes.edgeErrorRatio) ? vRes.edgeErrorRatio : (vRes.score || 0);
        const polyScorePenalty = clamp(edgeErr * 2.5, 0, 0.35);
        const conf = clamp(cls.confidence - polyScorePenalty, 0.45, 0.96);
        const sym = analyzeSymmetry(vRes.vertices);
        const geom = {
          kind: cls.shape,
          points: vRes.vertices,
          sides: cls.sides,
          angles: cls.angles,
          subtype: cls.subtype,
          isRight: cls.isRight,
          symmetry: sym
        };
        candidates.push({
          shape: cls.shape,
          label: SHAPE_LABELS[cls.shape] || 'Polígono',
          confidence: conf,
          geometry: geom,
          reason: `${vRes.vertices.length} vértices detectados`
        });
        for (const alt of cls.alternatives || []) {
          if (EXCLUDED_AUTO_SHAPES.includes(alt.shape)) continue;
          candidates.push({
            shape: alt.shape,
            label: SHAPE_LABELS[alt.shape] || 'Polígono',
            confidence: clamp(alt.confidence - polyScorePenalty, 0.3, 0.9),
            geometry: { ...geom, kind: alt.shape },
            reason: alt.reason
          });
        }
      }
    } else if (!vRes.closed && vRes.vertices.length === 3) {
      // Ángulo dibujado en un solo trazo en V
      const [A, V, B] = vRes.vertices;
      const len1 = dist(A, V), len2 = dist(B, V);
      const ang = angleBetweenVectors(sub(A, V), sub(B, V));
      if (len1 >= 18 && len2 >= 18 && ang >= 12 && ang <= 168) {
        candidates.push({
          shape: 'angle',
          label: SHAPE_LABELS.angle,
          confidence: 0.84,
          geometry: { kind: 'angle', vertex: V, arms: [[V, A], [V, B]], angleDeg: ang },
          reason: `ángulo de ${ang.toFixed(1)}°`
        });
      }
    }
  } else {
    // Caso 2: Múltiples trazos
    const allPts = strokePtsList.flat();
    const bb = boundingBox(allPts);

    // 2a. Verificar rayo o recta con cabezas de flecha (2 a 5 trazos)
    if (strokes.length >= 2 && strokes.length <= 5) {
      const lengths = strokePtsList.map((pts) => polylineLength(pts));
      let shaftIdx = 0;
      for (let i = 1; i < lengths.length; i++) if (lengths[i] > lengths[shaftIdx]) shaftIdx = i;
      const shaftFit = fitLineRANSAC(strokePtsList[shaftIdx]);
      if (shaftFit && shaftFit.length >= 30 && shaftFit.p90Residual <= Math.max(6, shaftFit.length * 0.08)) {
        const others = strokes.filter((_, idx) => idx !== shaftIdx);
        const dir = unit(sub(shaftFit.points[1], shaftFit.points[0]));
        const headStart = detectArrowheadOnEndpoint(shaftFit.points[0], [-dir[0], -dir[1]], others, shaftFit.length);
        const headEnd = detectArrowheadOnEndpoint(shaftFit.points[1], dir, others, shaftFit.length);
        const usedCount = headStart.strokes.length + headEnd.strokes.length;
        if (usedCount === others.length && (headStart.found || headEnd.found)) {
          if (headStart.found && headEnd.found) {
            candidates.push({
              shape: 'line',
              label: SHAPE_LABELS.line,
              confidence: 0.93,
              geometry: { kind: 'line', points: shaftFit.points, direction: dir, angleDeg: shaftFit.angleDeg },
              reason: 'recta infinita con flechas en ambos extremos'
            });
          } else {
            const origin = headEnd.found ? shaftFit.points[0] : shaftFit.points[1];
            const tip = headEnd.found ? shaftFit.points[1] : shaftFit.points[0];
            candidates.push({
              shape: 'ray',
              label: SHAPE_LABELS.ray,
              confidence: 0.92,
              geometry: { kind: 'ray', origin, through: tip, points: [origin, tip], direction: unit(sub(tip, origin)) },
              reason: 'semirrecta con flecha en un extremo'
            });
          }
        }
      }
    }

    // 2b. Relación de 2 trazos rectos: colineales repasados (line/segment), paralelas, perpendiculares o ángulo
    if (strokes.length === 2) {
      const f1 = fitLineRANSAC(strokePtsList[0]);
      const f2 = fitLineRANSAC(strokePtsList[1]);
      if (
        f1 && f2 &&
        f1.length >= 20 && f2.length >= 20 &&
        f1.p90Residual <= Math.max(6, f1.length * 0.09) &&
        f2.p90Residual <= Math.max(6, f2.length * 0.09)
      ) {
        const rel = analyzeLinePairRelation(f1.points, f2.points);
        const collinearSepTol = Math.max(12, Math.min(f1.length, f2.length) * 0.08);
        const isNearlyCollinear = rel.angleDeg <= 10 && rel.separation <= collinearSepTol;

        // Comprobar si los dos trazos colineales se superponen o repasan (0° o 180°) -> línea única, NUNCA ángulo
        let collinearOverlap = false;
        if (isNearlyCollinear) {
          const combined = fitLineTLS(allPts);
          if (combined && combined.length >= 20) {
            const p1a = projectPointOnLine(f1.points[0], combined.points[0], combined.points[1]).t;
            const p1b = projectPointOnLine(f1.points[1], combined.points[0], combined.points[1]).t;
            const p2a = projectPointOnLine(f2.points[0], combined.points[0], combined.points[1]).t;
            const p2b = projectPointOnLine(f2.points[1], combined.points[0], combined.points[1]).t;
            const lo1 = Math.min(p1a, p1b), hi1 = Math.max(p1a, p1b);
            const lo2 = Math.min(p2a, p2b), hi2 = Math.max(p2a, p2b);
            const projOverlap = Math.min(hi1, hi2) - Math.max(lo1, lo2);
            const minSpan = Math.max(EPS, Math.min(hi1 - lo1, hi2 - lo2));
            if (projOverlap >= -0.08 || projOverlap / minSpan >= 0.35) {
              collinearOverlap = true;
              const straightness = clamp(1 - combined.rms / Math.max(10, combined.length * 0.12), 0.72, 0.98);
              candidates.push({
                shape: 'line',
                label: SHAPE_LABELS.line,
                confidence: straightness,
                geometry: {
                  kind: 'line',
                  points: combined.points,
                  direction: combined.direction,
                  length: combined.length,
                  angleDeg: combined.angleDeg,
                  overtraced: true
                },
                reason: `dos trazos colineales superpuestos fusionados (desviación ${rel.angleDeg.toFixed(1)}°)`
              });
              candidates.push({
                shape: 'segment',
                label: SHAPE_LABELS.segment,
                confidence: clamp(straightness - 0.16, 0.45, 0.8),
                geometry: {
                  kind: 'segment',
                  points: combined.points,
                  length: combined.length,
                  angleDeg: combined.angleDeg
                },
                reason: 'alternativa segmento sobre trazos colineales'
              });
            }
          }
        }

        const epTol = Math.max(16, bb.diag * 0.12);
        // Comprobar si comparten extremo -> ángulo (solo para ángulos reales 12°..168°, nunca ~0° ni ~180°)
        const pairs = [
          [f1.points[0], f2.points[0], f1.points[1], f2.points[1]],
          [f1.points[0], f2.points[1], f1.points[1], f2.points[0]],
          [f1.points[1], f2.points[0], f1.points[0], f2.points[1]],
          [f1.points[1], f2.points[1], f1.points[0], f2.points[0]]
        ];
        const shared = !collinearOverlap ? pairs.find(([a, b]) => dist(a, b) <= epTol) : null;
        if (shared) {
          const vertex = mid(shared[0], shared[1]);
          const ang = angleBetweenVectors(sub(shared[2], vertex), sub(shared[3], vertex));
          if (ang >= 12 && ang <= 168) {
            candidates.push({
              shape: 'angle',
              label: SHAPE_LABELS.angle,
              confidence: 0.91,
              geometry: { kind: 'angle', vertex, arms: [[vertex, shared[2]], [vertex, shared[3]]], angleDeg: ang, isRight: Math.abs(ang - 90) <= 8 },
              reason: `dos segmentos unidos en un vértice (${ang.toFixed(1)}°)`
            });
          }
          if (rel.perpendicular) {
            candidates.push({
              shape: 'perpendicular_lines',
              label: SHAPE_LABELS.perpendicular_lines,
              confidence: 0.84,
              geometry: { kind: 'perpendicular_lines', lines: [f1.points, f2.points], intersection: rel.intersection, angleDeg: rel.angleDeg },
              reason: 'segmentos perpendiculares en extremo compartido'
            });
          }
        } else if (!collinearOverlap && rel.parallel && rel.separation >= 8) {
          candidates.push({
            shape: 'parallel_lines',
            label: SHAPE_LABELS.parallel_lines,
            confidence: clamp(0.95 - rel.angleDeg * 0.025, 0.72, 0.96),
            geometry: { kind: 'parallel_lines', lines: [f1.points, f2.points], angleDeg: rel.angleDeg, separation: rel.separation },
            reason: `rectas paralelas (desviación ${rel.angleDeg.toFixed(1)}°)`
          });
        } else if (!collinearOverlap && rel.perpendicular && rel.intersectsOnSegments) {
          candidates.push({
            shape: 'perpendicular_lines',
            label: SHAPE_LABELS.perpendicular_lines,
            confidence: clamp(0.95 - Math.abs(rel.angleDeg - 90) * 0.025, 0.72, 0.96),
            geometry: { kind: 'perpendicular_lines', lines: [f1.points, f2.points], intersection: rel.intersection, angleDeg: rel.angleDeg },
            reason: `rectas perpendiculares (${rel.angleDeg.toFixed(1)}°)`
          });
        }
      }
    }

    // 2c. Polígono de múltiples trazos conectados
    if (strokes.length >= 3 && strokes.length <= 10) {
      const fits = strokePtsList.map((pts) => fitLineRANSAC(pts));
      if (fits.every((f) => f && f.length >= 16 && f.p90Residual <= Math.max(7, f.length * 0.1))) {
        const verts = connectSegmentsToPolygon(fits, bb.diag);
        if (verts) {
          const cls = classifyPolygon(verts, options);
          if (cls) {
            const sym = analyzeSymmetry(verts);
            const geom = {
              kind: cls.shape,
              points: verts,
              sides: cls.sides,
              angles: cls.angles,
              subtype: cls.subtype,
              isRight: cls.isRight,
              symmetry: sym
            };
            candidates.push({
              shape: cls.shape,
              label: SHAPE_LABELS[cls.shape] || 'Polígono',
              confidence: cls.confidence,
              geometry: geom,
              reason: `polígono multi-trazo de ${verts.length} lados`
            });
            for (const alt of cls.alternatives || []) {
              if (EXCLUDED_AUTO_SHAPES.includes(alt.shape)) continue;
              candidates.push({
                shape: alt.shape,
                label: SHAPE_LABELS[alt.shape] || 'Polígono',
                confidence: alt.confidence,
                geometry: { ...geom, kind: alt.shape },
                reason: alt.reason
              });
            }
          }
        }
      }
    }

    // 2d. Figuras 3D wireframe (cubo, prisma, cilindro, pirámide)
    const wireframe = detect3DWireframe(strokes, strokePtsList);
    if (wireframe) {
      candidates.push({
        shape: wireframe.shape,
        label: SHAPE_LABELS[wireframe.shape] || wireframe.shape,
        confidence: wireframe.confidence,
        geometry: wireframe.geometry,
        reason: wireframe.reason
      });
    }
  }

  // Filtrado de seguridad: jamás emitir formas excluidas (ej. trapezoid)
  const filtered = candidates
    .filter((c) => !EXCLUDED_AUTO_SHAPES.includes(c.shape))
    .map((c) => ({ ...c, confidence: Number(clamp(c.confidence, 0, 1).toFixed(4)) }))
    .sort((a, b) => b.confidence - a.confidence);

  if (!filtered.length) return null;

  // Deduplicar por shape conservando el de mayor confianza
  const dedup = [];
  const seen = new Set();
  for (const c of filtered) {
    if (seen.has(c.shape)) continue;
    seen.add(c.shape);
    dedup.push(c);
  }

  return {
    primary: dedup[0],
    candidates: dedup,
    confidence: dedup[0].confidence,
    sourceStrokeIds,
    immutable: true
  };
}

/* ============================================================================
 * 6. ELEMENTOS INTERNOS CONTEXTUALES SOBRE FIGURA EXISTENTE
 * ============================================================================ */

function getPolygonVertices(baseFigure) {
  const g = baseFigure?.geometry || baseFigure;
  if (!g) return null;
  if (Array.isArray(g.points) && g.points.length >= 3) return g.points;
  return null;
}

function detectAuxiliaryDashedLine(strokes) {
  const shortSegs = [];
  for (const s of strokes) {
    const pts = extractPoints(s, 1);
    if (pts.length < 2) continue;
    const fit = fitLineTLS(pts);
    if (fit && fit.length >= 4 && fit.length <= 45 && fit.rms <= Math.max(4, fit.length * 0.2)) {
      shortSegs.push({ stroke: s, fit });
    }
  }
  if (shortSegs.length < 3) return [];
  const used = new Set();
  const groups = [];
  for (let i = 0; i < shortSegs.length; i++) {
    if (used.has(i)) continue;
    const base = shortSegs[i];
    const group = [base];
    for (let j = i + 1; j < shortSegs.length; j++) {
      if (used.has(j)) continue;
      const cand = shortSegs[j];
      const ang = acuteAngleBetweenLines(base.fit.direction, cand.fit.direction);
      const off = pointToLineDistance(cand.fit.center, base.fit.points[0], base.fit.points[1]);
      if (ang <= 14 && off <= 14) {
        group.push(cand);
      }
    }
    if (group.length >= 3) {
      const allPts = group.flatMap((g) => g.fit.points);
      const overall = fitLineTLS(allPts);
      if (overall && overall.length >= 40) {
        for (const g of group) used.add(shortSegs.indexOf(g));
        groups.push({
          kind: 'auxiliary_line',
          style: 'dashed',
          points: overall.points,
          dashCount: group.length,
          sourceStrokeIds: group.map((g) => g.stroke.id),
          confidence: 0.88
        });
      }
    }
  }
  return groups;
}

function detectCongruenceTicksOnSegments(segments, strokes, consumedIds) {
  const found = [];
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const [a, b] = segments[segIdx];
    const segLen = dist(a, b);
    const segDir = unit(sub(b, a));
    const segMid = mid(a, b);
    const ticks = [];
    for (const s of strokes) {
      if (consumedIds.has(s.id)) continue;
      const pts = extractPoints(s, 1);
      if (pts.length < 2) continue;
      const fit = fitLineTLS(pts);
      if (!fit || fit.length < 5 || fit.length > Math.min(34, segLen * 0.32)) continue;
      if (fit.rms > Math.max(3, fit.length * 0.22)) continue;
      const crossDist = pointToSegmentDistance(fit.center, a, b);
      const nearMid = dist(fit.center, segMid) <= segLen * 0.35;
      const ang = acuteAngleBetweenLines(fit.direction, segDir);
      if (crossDist <= 10 && nearMid && ang >= 45) {
        ticks.push({ stroke: s, fit });
      }
    }
    if (ticks.length >= 1 && ticks.length <= 3) {
      for (const t of ticks) consumedIds.add(t.stroke.id);
      found.push({
        kind: 'congruence_ticks',
        tickCount: ticks.length,
        segmentIndex: segIdx,
        segment: [a, b],
        sourceStrokeIds: ticks.map((t) => t.stroke.id),
        confidence: 0.87
      });
    }
  }
  return found;
}

export function recognizeContextualElements(baseFigure, addedStrokes, options = {}) {
  if (!baseFigure || !Array.isArray(addedStrokes) || !addedStrokes.length) {
    return { elements: [], attachedLabels: [], unmatchedStrokeIds: [] };
  }
  const geom = baseFigure.geometry || baseFigure;
  const elements = [];
  const consumedIds = new Set();
  const readingsByStrokeId = options.readingsByStrokeId || {};

  // 1. Líneas auxiliares punteadas (multi-trazo)
  const auxLines = detectAuxiliaryDashedLine(addedStrokes);
  for (const aux of auxLines) {
    elements.push(aux);
    for (const id of aux.sourceStrokeIds) consumedIds.add(id);
  }

  // 2. Marcas de congruencia sobre lados de polígono o segmento
  const baseSegments = [];
  const polyVerts = getPolygonVertices(geom);
  if (polyVerts) {
    for (let i = 0; i < polyVerts.length; i++) {
      baseSegments.push([polyVerts[i], polyVerts[(i + 1) % polyVerts.length]]);
    }
  } else if (geom.kind === 'segment' && Array.isArray(geom.points) && geom.points.length === 2) {
    baseSegments.push(geom.points);
  }
  if (baseSegments.length) {
    const ticks = detectCongruenceTicksOnSegments(baseSegments, addedStrokes, consumedIds);
    elements.push(...ticks);
  }

  // 3. Flechas contextuales (eje + puntas)
  const remainingForArrows = addedStrokes.filter((s) => !consumedIds.has(s.id));
  for (const s of remainingForArrows) {
    if (consumedIds.has(s.id)) continue;
    const pts = extractPoints(s, 1);
    const fit = fitLineRANSAC(pts);
    if (!fit || fit.length < 25 || fit.p90Residual > Math.max(6, fit.length * 0.09)) continue;
    const others = remainingForArrows.filter((o) => o.id !== s.id && !consumedIds.has(o.id));
    const dir = unit(sub(fit.points[1], fit.points[0]));
    const headEnd = detectArrowheadOnEndpoint(fit.points[1], dir, others, fit.length);
    const headStart = detectArrowheadOnEndpoint(fit.points[0], [-dir[0], -dir[1]], others, fit.length);
    if (headEnd.found || headStart.found) {
      const headStrokes = [...headStart.strokes, ...headEnd.strokes];
      consumedIds.add(s.id);
      for (const hs of headStrokes) consumedIds.add(hs.id);
      elements.push({
        kind: 'arrow',
        doubleHeaded: headStart.found && headEnd.found,
        points: headEnd.found ? fit.points : [fit.points[1], fit.points[0]],
        sourceStrokeIds: [s.id, ...headStrokes.map((hs) => hs.id)],
        confidence: 0.9
      });
    }
  }

  // 4. Elementos sobre circunferencia: radio, diámetro, cuerda
  if (geom.kind === 'circle') {
    const c = [geom.cx, geom.cy];
    const r = geom.r;
    const tol = Math.max(12, r * 0.18);
    for (const s of addedStrokes) {
      if (consumedIds.has(s.id)) continue;
      const pts = extractPoints(s, 1);
      const fit = fitLineRANSAC(pts);
      if (!fit || fit.length < r * 0.3 || fit.p90Residual > Math.max(7, r * 0.12)) continue;
      const [a, b] = fit.points;
      const da = dist(a, c), db = dist(b, c);
      const onRimA = Math.abs(da - r) <= tol;
      const onRimB = Math.abs(db - r) <= tol;
      const atCenterA = da <= tol;
      const atCenterB = db <= tol;

      if ((atCenterA && onRimB) || (atCenterB && onRimA)) {
        const rimPt = atCenterA ? b : a;
        const dir = unit(sub(rimPt, c));
        consumedIds.add(s.id);
        elements.push({
          kind: 'radius',
          points: [c, add(c, scale(dir, r))],
          length: r,
          sourceStrokeIds: [s.id],
          confidence: 0.94
        });
      } else if (onRimA && onRimB) {
        const centerDist = pointToSegmentDistance(c, a, b);
        if (centerDist <= tol && Math.abs(fit.length - 2 * r) <= 2.2 * tol) {
          const dir = unit(sub(b, a));
          consumedIds.add(s.id);
          elements.push({
            kind: 'diameter',
            points: [add(c, scale(dir, -r)), add(c, scale(dir, r))],
            length: 2 * r,
            sourceStrokeIds: [s.id],
            confidence: 0.94
          });
        } else {
          consumedIds.add(s.id);
          elements.push({
            kind: 'chord',
            points: [a, b],
            length: fit.length,
            distanceFromCenter: centerDist,
            sourceStrokeIds: [s.id],
            confidence: 0.9
          });
        }
      }
    }
  }

  // 5. Elementos sobre triángulos y polígonos: altura, mediana, bisectriz, diagonal, marca de ángulo recto
  if (polyVerts) {
    const bb = boundingBox(polyVerts);
    const vTol = Math.max(16, bb.diag * 0.12);
    const n = polyVerts.length;

    for (const s of addedStrokes) {
      if (consumedIds.has(s.id)) continue;
      const pts = extractPoints(s, 1);
      if (pts.length < 2) continue;

      // 5a. Marca de ángulo recto (pequeña L cerca de un vértice o pie de altura)
      const sbb = boundingBox(pts);
      if (sbb.diag >= 8 && sbb.diag <= Math.max(36, bb.diag * 0.2)) {
        const vDet = detectVertices(pts, { epsilon: Math.max(3, sbb.diag * 0.16) });
        if (!vDet.closed && vDet.vertices.length === 3) {
          const ang = angleBetweenVectors(sub(vDet.vertices[0], vDet.vertices[1]), sub(vDet.vertices[2], vDet.vertices[1]));
          if (Math.abs(ang - 90) <= 18) {
            const nearVertex = polyVerts.findIndex((v) => dist(v, vDet.vertices[1]) <= Math.max(32, sbb.diag * 1.6));
            const nearAltitudeFoot = elements.find(
              (el) => el.kind === 'altitude' && dist(el.foot, vDet.vertices[1]) <= Math.max(32, sbb.diag * 1.6)
            );
            if (nearVertex >= 0 || nearAltitudeFoot) {
              consumedIds.add(s.id);
              elements.push({
                kind: 'right_angle_mark',
                anchor: nearAltitudeFoot ? nearAltitudeFoot.foot : polyVerts[nearVertex],
                vertexIndex: nearVertex >= 0 ? nearVertex : null,
                sourceStrokeIds: [s.id],
                confidence: 0.89
              });
              continue;
            }
          }
        }
      }

      const fit = fitLineRANSAC(pts);
      if (!fit || fit.length < Math.max(16, bb.diag * 0.12) || fit.p90Residual > Math.max(7, fit.length * 0.1)) continue;
      const [a, b] = fit.points;

      const idxA = polyVerts.findIndex((v) => dist(v, a) <= vTol);
      const idxB = polyVerts.findIndex((v) => dist(v, b) <= vTol);

      // 5b. Diagonal de polígono (n >= 4, dos vértices no adyacentes)
      if (n >= 4 && idxA >= 0 && idxB >= 0 && idxA !== idxB) {
        const diff = Math.abs(idxA - idxB);
        if (diff > 1 && diff < n - 1) {
          consumedIds.add(s.id);
          elements.push({
            kind: 'diagonal',
            fromVertex: idxA,
            toVertex: idxB,
            points: [polyVerts[idxA], polyVerts[idxB]],
            length: dist(polyVerts[idxA], polyVerts[idxB]),
            sourceStrokeIds: [s.id],
            confidence: 0.94
          });
          continue;
        }
      }

      // 5c. Desde un vértice hacia el lado opuesto (triángulo: altura, mediana, bisectriz)
      if (n === 3 && (idxA >= 0 || idxB >= 0) && !(idxA >= 0 && idxB >= 0)) {
        const vIdx = idxA >= 0 ? idxA : idxB;
        const endPt = idxA >= 0 ? b : a;
        const vertex = polyVerts[vIdx];
        const opp1 = polyVerts[(vIdx + 1) % 3];
        const opp2 = polyVerts[(vIdx + 2) % 3];
        const oppMid = mid(opp1, opp2);
        const proj = projectPointOnLine(vertex, opp1, opp2);
        const footDistToBase = pointToLineDistance(endPt, opp1, opp2);
        const segDir = sub(endPt, vertex);
        const baseDir = sub(opp2, opp1);
        const perpErr = Math.abs(acuteAngleBetweenLines(segDir, baseDir) - 90);

        if (footDistToBase <= vTol) {
          // Evaluar altura, mediana y bisectriz
          const distToFoot = dist(endPt, proj.point);
          const distToMid = dist(endPt, oppMid);
          const isPerp = perpErr <= 11 && distToFoot <= Math.max(16, dist(opp1, opp2) * 0.14);
          const isToMid = distToMid <= Math.max(16, dist(opp1, opp2) * 0.14);
          const ang1 = angleBetweenVectors(sub(opp1, vertex), segDir);
          const ang2 = angleBetweenVectors(sub(opp2, vertex), segDir);
          const isBisector = Math.abs(ang1 - ang2) <= 9;

          if (isPerp && (!isToMid || distToFoot <= distToMid)) {
            consumedIds.add(s.id);
            elements.push({
              kind: 'altitude',
              vertexIndex: vIdx,
              vertex,
              foot: proj.point,
              points: [vertex, proj.point],
              length: dist(vertex, proj.point),
              sourceStrokeIds: [s.id],
              confidence: clamp(0.95 - perpErr * 0.015, 0.78, 0.96)
            });
            continue;
          }
          if (isToMid) {
            consumedIds.add(s.id);
            elements.push({
              kind: 'median',
              vertexIndex: vIdx,
              vertex,
              midpoint: oppMid,
              points: [vertex, oppMid],
              length: dist(vertex, oppMid),
              sourceStrokeIds: [s.id],
              confidence: 0.9
            });
            continue;
          }
          if (isBisector) {
            consumedIds.add(s.id);
            elements.push({
              kind: 'angle_bisector',
              vertexIndex: vIdx,
              vertex,
              points: [vertex, endPt],
              splitAnglesDeg: [ang1, ang2],
              sourceStrokeIds: [s.id],
              confidence: 0.88
            });
            continue;
          }
        }
      }
    }
  }

  // 6. Ángulo desde extremo compartido sobre un segmento o bisectriz sobre un ángulo existente
  if (geom.kind === 'segment' && Array.isArray(geom.points) && geom.points.length === 2) {
    const [p0, p1] = geom.points;
    const tol = Math.max(16, dist(p0, p1) * 0.14);
    for (const s of addedStrokes) {
      if (consumedIds.has(s.id)) continue;
      const fit = fitLineRANSAC(extractPoints(s, 1));
      if (!fit || fit.length < 18 || fit.p90Residual > Math.max(6, fit.length * 0.09)) continue;
      const [a, b] = fit.points;
      const checks = [
        [p0, a, p1, b], [p0, b, p1, a],
        [p1, a, p0, b], [p1, b, p0, a]
      ];
      const match = checks.find(([u, v]) => dist(u, v) <= tol);
      if (match) {
        const vertex = match[0];
        const ang = angleBetweenVectors(sub(match[2], vertex), sub(match[3], vertex));
        if (ang >= 8 && ang <= 172) {
          consumedIds.add(s.id);
          elements.push({
            kind: 'angle',
            vertex,
            arms: [[vertex, match[2]], [vertex, match[3]]],
            angleDeg: ang,
            sourceStrokeIds: [s.id],
            confidence: 0.91
          });
        }
      }
    }
  } else if (geom.kind === 'angle' && geom.vertex && Array.isArray(geom.arms) && geom.arms.length === 2) {
    const v = geom.vertex;
    const arm1 = sub(geom.arms[0][1], v);
    const arm2 = sub(geom.arms[1][1], v);
    const tol = 20;
    for (const s of addedStrokes) {
      if (consumedIds.has(s.id)) continue;
      const fit = fitLineRANSAC(extractPoints(s, 1));
      if (!fit || fit.length < 18) continue;
      const [a, b] = fit.points;
      const atStart = dist(a, v) <= tol;
      const atEnd = dist(b, v) <= tol;
      if (atStart || atEnd) {
        const dir = atStart ? sub(b, v) : sub(a, v);
        const a1 = angleBetweenVectors(arm1, dir);
        const a2 = angleBetweenVectors(arm2, dir);
        if (Math.abs(a1 - a2) <= 9 && Math.abs(a1 + a2 - geom.angleDeg) <= 14) {
          consumedIds.add(s.id);
          elements.push({
            kind: 'angle_bisector',
            vertex: v,
            points: [v, atStart ? b : a],
            splitAnglesDeg: [a1, a2],
            sourceStrokeIds: [s.id],
            confidence: 0.91
          });
        }
      }
    }
  }

  // 7. Etiquetas / mediciones adjuntas (trazos pequeños cercanos a elementos o a la figura)
  const remaining = addedStrokes.filter((s) => !consumedIds.has(s.id));
  const attachedLabels = [];
  const unmatchedStrokeIds = [];
  const figPts = polyVerts
    ? polyVerts
    : geom.kind === 'circle'
      ? [[geom.cx - geom.r, geom.cy - geom.r], [geom.cx + geom.r, geom.cy + geom.r]]
      : (geom.points || []);
  const figBB = boundingBox(figPts.length ? figPts : [[0, 0]]);
  const maxLabelExtent = Math.max(60, figBB.diag * 0.45);
  const attachRadius = Math.max(80, figBB.diag * 0.55);

  for (const s of remaining) {
    const pts = extractPoints(s, 1);
    const sbb = boundingBox(pts);
    if (sbb.diag <= maxLabelExtent && dist(sbb.center, figBB.center) <= attachRadius + figBB.diag * 0.5) {
      // Asociar al elemento contextual más cercano si existe
      let nearestEl = null, minD = Infinity;
      for (const el of elements) {
        const elPts = el.points || (el.anchor ? [el.anchor] : []);
        if (!elPts.length) continue;
        const elMid = elPts.length === 2 ? mid(elPts[0], elPts[1]) : elPts[0];
        const d = dist(sbb.center, elMid);
        if (d < minD) { minD = d; nearestEl = el; }
      }
      const writtenText = Object.prototype.hasOwnProperty.call(readingsByStrokeId, s.id)
        ? String(readingsByStrokeId[s.id])
        : null;
      attachedLabels.push({
        kind: 'attached_label',
        strokeId: s.id,
        center: sbb.center,
        bounds: sbb,
        targetElementKind: nearestEl ? nearestEl.kind : geom.kind,
        writtenText
      });
    } else {
      unmatchedStrokeIds.push(s.id);
    }
  }

  return {
    elements,
    attachedLabels,
    unmatchedStrokeIds
  };
}
