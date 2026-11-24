/* Mi Note Professional — Unified Math Recognition Pipeline (Pure ES Module)
 * Zero external dependencies. Runs identically in Android WebView, Web Worker, and Node.js.
 *
 * Hard invariants:
 *  1. Strict immutability: raw strokes, stroke.pts, existingObjects, and profile are NEVER mutated.
 *  2. Pedagogical fidelity: NEVER auto-corrects math errors (e.g. 2+2=5 stays 2+2=5) or solves exercises.
 *  3. Geometric integrity: NEVER auto-classifies trapezoids; NEVER squashes rectangles into squares.
 *  4. Data integrity: NEVER invents table/chart values, scales, or headers.
 *  5. Fault isolation: every sub-engine runs inside try/catch; failures are recorded in diagnostics.engineErrors
 *     without crashing or blocking writing.
 *  6. Non-destructive reversibility: original strokes & fingerprints are always preserved for 1-click undo/revert.
 */

import { toReadingStrokes, readingGeometryToPage, inkOrientation } from '../ink-orientation.mjs';
import {
  processStrokes,
  computeBoundingBox,
  bboxGap,
  mergeOvertracedStrokes,
  findStrokeIntersections,
  minStrokeDistance
} from './math-dsp.mjs';
import { recognizeInk } from './math-ink-ocr.mjs';
import {
  normalizeArithmetic,
  formatMathDisplay,
  hasBinaryArithmetic,
  enclosedMathAnnotation,
  fuseMathCandidates,
  hasHandwrittenEquals,
  reviewDigitAmbiguities
} from './math-hybrid-ocr.mjs';
import { fingerprint } from './math-geometry.mjs';
import {
  EXCLUDED_AUTO_SHAPES,
  SHAPE_LABELS,
  recognizeGeometry,
  recognizeContextualElements
} from './math-geometry-contextual.mjs';
import { recognizeDataStructure } from './math-data-charts.mjs';
import {
  parseMathStructure,
  fuseInterpretations as fuseMathStructuralInterpretations,
  createProgressiveRecognizer,
  normalizeSymbol,
  boxFromStrokes
} from './math-structural.mjs';
import {
  MAX_BIAS_DELTA,
  createUserProfile,
  applyProfileToCandidates
} from './math-personalization.mjs';

export const MATH_CATEGORIES = Object.freeze(['auto', 'numbers', 'algebra', 'geometry', 'data']);
export const INTERVENTION_LEVELS = Object.freeze(['original', 'assisted', 'smart', 'digital']);
export const CALIBRATION_VERSION = 'cal-v1';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const nowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

function normalizeCategory(category) {
  return MATH_CATEGORIES.includes(category) ? category : 'auto';
}

function normalizeInterventionLevel(level) {
  return INTERVENTION_LEVELS.includes(level) ? level : 'smart';
}

function cloneStrokesReadonly(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes.map((s, idx) => ({
    id: s?.id ?? `stroke_${idx}`,
    color: s?.color ?? '#000000',
    width: Number.isFinite(Number(s?.width)) ? Number(s.width) : 2.5,
    pts: Array.isArray(s?.pts)
      ? s.pts
          .filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
          .map(p => p.slice())
      : [],
    ...(s?.x10 && typeof s.x10 === 'object' ? { x10: { ...s.x10 } } : {})
  }));
}

function buildSourceRefs(strokes) {
  return (strokes || []).map((s, idx) => ({
    id: s?.id ?? `stroke_${idx}`,
    signature: fingerprint(s) || `sig:${idx}`
  }));
}

function buildFallbackDsp(strokes) {
  const perStroke = strokes.map((s, idx) => {
    const bbox = computeBoundingBox(s.pts);
    return {
      id: s.id ?? `stroke_${idx}`,
      strokeOrder: idx,
      pointCount: s.pts.length,
      bbox,
      arcLength: bbox.diagonal,
      chordLength: bbox.diagonal,
      straightness: 0.5,
      isClosedLike: false
    };
  });
  const allPts = strokes.flatMap(s => s.pts);
  const pageBounds = computeBoundingBox(allPts);
  return {
    original: strokes.slice(),
    processed: strokes.map(s => ({ ...s, pts: s.pts.map(p => p.slice()) })),
    features: {
      perStroke,
      pairwise: { distances: [], intersections: [], relations: [] },
      summary: {
        strokeCount: strokes.length,
        originalCount: strokes.length,
        totalArcLength: perStroke.reduce((a, f) => a + f.arcLength, 0),
        pageBounds,
        overtracePairs: [],
        accidentalDotIds: [],
        medianScale: pageBounds.diagonal
      }
    },
    groups: strokes.length
      ? [{
          id: 'group_0',
          strokeIndices: strokes.map((_, i) => i),
          strokeIds: strokes.map(s => s.id),
          bbox: pageBounds,
          startTime: null,
          endTime: null,
          kindHint: 'unknown'
        }]
      : [],
    timingMs: 0,
    fallback: true
  };
}

/**
 * Calibrates a raw score and runner-up margin into a unified CalibratedScore (`high` | `medium` | `low`).
 */
export function calibrateConfidence({
  rawScore = 0,
  secondScore = 0,
  hasDisagreement = false,
  hasAmbiguity = false,
  mlkitOnly = false,
  signals = {}
} = {}) {
  let score = clamp(Number(rawScore) || 0, 0, 1);
  const runnerUp = clamp(Number(secondScore) || 0, 0, 1);
  const margin = Number(clamp(score - runnerUp, 0, 1).toFixed(4));

  if (mlkitOnly) {
    // Contract rule: ML Kit alone never exceeds 0.82 because it does not expose calibrated probability.
    score = Math.min(score, 0.82);
  }
  if (hasAmbiguity) {
    score = clamp(score - 0.08, 0, 1);
  }
  if (hasDisagreement) {
    score = Math.min(score, 0.8);
  }

  score = Number(clamp(score, 0, 1).toFixed(4));

  let level = 'low';
  if (score >= 0.85 && margin >= 0.12 && !hasDisagreement && !hasAmbiguity && !mlkitOnly) {
    level = 'high';
  } else if (score >= 0.55) {
    level = 'medium';
  }

  return {
    score,
    level,
    margin,
    calibrationVersion: CALIBRATION_VERSION,
    signals: { ...signals }
  };
}

/**
 * Maps calibrated confidence + active intervention level to an explicit non-destructive UI action.
 */
export function decideIntervention(winner, confidence, options = {}) {
  const level = normalizeInterventionLevel(options.interventionLevel);
  const hasDisagreement = Boolean(options.hasDisagreement);
  const hasAmbiguity = Boolean(options.hasAmbiguity);

  if (level === 'original' || !winner) {
    return {
      level,
      action: 'keep-handwriting',
      shouldAutoApply: false,
      showSuggestions: false,
      emitDigitalObject: false,
      preserveOriginalStrokes: true,
      revertable: true
    };
  }

  if (level === 'assisted') {
    return {
      level,
      action: 'suggest',
      shouldAutoApply: false,
      showSuggestions: true,
      emitDigitalObject: false,
      preserveOriginalStrokes: true,
      revertable: true
    };
  }

  if (level === 'digital') {
    return {
      level,
      action: 'auto-apply',
      shouldAutoApply: true,
      showSuggestions: confidence.level !== 'high',
      emitDigitalObject: true,
      preserveOriginalStrokes: true,
      revertable: true
    };
  }

  // 'smart': auto-transform ONLY high-confidence without disagreement/ambiguity
  if (confidence.level === 'high' && !hasDisagreement && !hasAmbiguity) {
    return {
      level,
      action: 'auto-apply',
      shouldAutoApply: true,
      showSuggestions: false,
      emitDigitalObject: true,
      preserveOriginalStrokes: true,
      revertable: true
    };
  }

  if (confidence.level === 'medium') {
    return {
      level,
      action: 'suggest',
      shouldAutoApply: false,
      showSuggestions: true,
      emitDigitalObject: false,
      preserveOriginalStrokes: true,
      revertable: true
    };
  }

  return {
    level,
    action: 'keep-handwriting',
    shouldAutoApply: false,
    showSuggestions: false,
    emitDigitalObject: false,
    preserveOriginalStrokes: true,
    revertable: true
  };
}

const LOCAL_GRID_SIZE = 16;

const LOCAL_GLYPH_TEMPLATES = [
  // Digits 0-9 (multiple canonical handwritten styles, aspect- and orientation-aware)
  { symbol: '0', kind: 'digit', aspect: 0.68, strokes: 1, closed: true, paths: [[[0.5, 0], [0.14, 0.14], [0, 0.5], [0.14, 0.86], [0.5, 1], [0.86, 0.86], [1, 0.5], [0.86, 0.14], [0.5, 0]]] },
  { symbol: '1', kind: 'digit', aspect: 0.25, strokes: 1, paths: [[[0.5, 0], [0.5, 1]]] },
  { symbol: '1', kind: 'digit', aspect: 0.35, strokes: 1, paths: [[[0.15, 0.22], [0.55, 0], [0.55, 1]]] },
  { symbol: '1', kind: 'digit', aspect: 0.45, strokes: 2, paths: [[[0.15, 0.22], [0.55, 0], [0.55, 1]], [[0.12, 1], [0.9, 1]]] },
  { symbol: '2', kind: 'digit', aspect: 0.72, strokes: 1, paths: [[[0.06, 0.2], [0.3, 0.02], [0.76, 0.02], [0.96, 0.24], [0.78, 0.52], [0.05, 1], [0.98, 1]]] },
  { symbol: '2', kind: 'digit', aspect: 0.72, strokes: 1, paths: [[[0.04, 0.08], [0.88, 0], [0.02, 1], [1, 1]]] },
  { symbol: '3', kind: 'digit', aspect: 0.68, strokes: 1, paths: [[[0.06, 0.06], [0.66, 0], [0.94, 0.18], [0.78, 0.42], [0.42, 0.48], [0.82, 0.58], [0.98, 0.8], [0.72, 1], [0.08, 0.94]]] },
  { symbol: '3', kind: 'digit', aspect: 0.68, strokes: 1, paths: [[[0.05, 0.04], [0.88, 0.04], [0.45, 0.48], [1, 0.82], [0.04, 1]]] },
  { symbol: '4', kind: 'digit', aspect: 0.72, strokes: 2, paths: [[[0.66, 0], [0.04, 0.62], [1, 0.62]], [[0.66, 0], [0.66, 1]]] },
  { symbol: '4', kind: 'digit', aspect: 0.72, strokes: 2, paths: [[[0.12, 0], [0.06, 0.58], [0.98, 0.58]], [[0.72, 0.04], [0.72, 1]]] },
  { symbol: '4', kind: 'digit', aspect: 0.72, strokes: 1, paths: [[[0.72, 1], [0.72, 0], [0.04, 0.62], [1, 0.62]]] },
  { symbol: '5', kind: 'digit', aspect: 0.68, strokes: 1, paths: [[[0.98, 0], [0.08, 0], [0.04, 0.46], [0.78, 0.54], [0.96, 0.78], [0.72, 1], [0.06, 1]]] },
  { symbol: '5', kind: 'digit', aspect: 0.68, strokes: 2, paths: [[[0.1, 0.04], [0.08, 0.46], [0.84, 0.54], [0.92, 0.84], [0.55, 1], [0.06, 0.96]], [[0.1, 0.02], [0.98, 0.02]]] },
  { symbol: '6', kind: 'digit', aspect: 0.68, strokes: 1, paths: [[[0.84, 0], [0.24, 0.24], [0.04, 0.62], [0.24, 0.94], [0.58, 1], [0.92, 0.78], [0.74, 0.54], [0.28, 0.54], [0.04, 0.68]]] },
  { symbol: '7', kind: 'digit', aspect: 0.72, strokes: 1, paths: [[[0.04, 0], [1, 0], [0.36, 1]]] },
  { symbol: '7', kind: 'digit', aspect: 0.72, strokes: 2, paths: [[[0.04, 0], [1, 0], [0.36, 1]], [[0.22, 0.52], [0.88, 0.52]]] },
  { symbol: '8', kind: 'digit', aspect: 0.66, strokes: 1, closed: true, paths: [[[0.5, 0], [0.12, 0.2], [0.5, 0.48], [0.92, 0.74], [0.5, 1], [0.08, 0.74], [0.5, 0.48], [0.9, 0.2], [0.5, 0]]] },
  { symbol: '9', kind: 'digit', aspect: 0.68, strokes: 1, paths: [[[0.82, 0.36], [0.88, 0.14], [0.58, 0], [0.2, 0.08], [0.06, 0.32], [0.34, 0.52], [0.82, 0.36], [0.82, 1]]] },
  // Common algebra variables & delimiters
  { symbol: 'x', kind: 'letter', aspect: 0.82, strokes: 2, paths: [[[0.05, 0.05], [0.95, 0.95]], [[0.95, 0.05], [0.05, 0.95]]] },
  { symbol: 'y', kind: 'letter', aspect: 0.70, strokes: 2, paths: [[[0.08, 0.04], [0.5, 0.54]], [[0.94, 0.04], [0.24, 1]]] },
  { symbol: 'z', kind: 'letter', aspect: 0.76, strokes: 1, paths: [[[0.06, 0.06], [0.96, 0.06], [0.06, 0.96], [0.96, 0.96]]] },
  { symbol: 'a', kind: 'letter', aspect: 0.76, strokes: 1, paths: [[[0.82, 0.2], [0.44, 0.04], [0.08, 0.38], [0.16, 0.88], [0.54, 0.96], [0.82, 0.64], [0.84, 0.18], [0.92, 0.98]]] },
  { symbol: 'b', kind: 'letter', aspect: 0.64, strokes: 1, paths: [[[0.12, 0], [0.12, 1], [0.68, 0.96], [0.94, 0.72], [0.76, 0.46], [0.12, 0.52]]] },
  { symbol: 'n', kind: 'letter', aspect: 0.76, strokes: 1, paths: [[[0.08, 0.12], [0.08, 0.98], [0.14, 0.34], [0.56, 0.1], [0.88, 0.32], [0.92, 0.98]]] },
  { symbol: '(', kind: 'delim', aspect: 0.32, strokes: 1, paths: [[[0.88, 0], [0.32, 0.25], [0.12, 0.5], [0.32, 0.75], [0.88, 1]]] },
  { symbol: ')', kind: 'delim', aspect: 0.32, strokes: 1, paths: [[[0.12, 0], [0.68, 0.25], [0.88, 0.5], [0.68, 0.75], [0.12, 1]]] }
];

function rasterizePaths(paths, { preserveAspect = true, size = LOCAL_GRID_SIZE } = {}) {
  const flatPts = [];
  for (const path of paths) {
    for (const p of path) flatPts.push(p);
  }
  if (flatPts.length < 2) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of flatPts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const w = Math.max(1e-3, maxX - minX);
  const h = Math.max(1e-3, maxY - minY);
  const maxSpan = Math.max(w, h);
  const pad = 1.5;
  const inner = size - 2 * pad;
  const ox = preserveAspect ? (maxSpan - w) * 0.5 : 0;
  const oy = preserveAspect ? (maxSpan - h) * 0.5 : 0;
  const sx = preserveAspect ? maxSpan : w;
  const sy = preserveAspect ? maxSpan : h;

  const grid = new Float32Array(size * size);
  const splat = (gx, gy) => {
    const cx = Math.round(gx);
    const cy = Math.round(gy);
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= size) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= size) continue;
        const d2 = (gx - nx) * (gx - nx) + (gy - ny) * (gy - ny);
        const wgt = Math.exp(-d2 * 0.65);
        const idx = ny * size + nx;
        if (wgt > grid[idx]) grid[idx] = wgt;
      }
    }
  };

  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const ax = pad + ((a[0] - minX + ox) / sx) * inner;
      const ay = pad + ((a[1] - minY + oy) / sy) * inner;
      const bx = pad + ((b[0] - minX + ox) / sx) * inner;
      const by = pad + ((b[1] - minY + oy) / sy) * inner;
      const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        splat(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
  }

  let normSq = 0;
  for (let i = 0; i < grid.length; i++) normSq += grid[i] * grid[i];
  const invNorm = normSq > 1e-9 ? 1 / Math.sqrt(normSq) : 0;
  for (let i = 0; i < grid.length; i++) grid[i] *= invNorm;
  return grid;
}

function dotGrid(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const COMPILED_LOCAL_TEMPLATES = LOCAL_GLYPH_TEMPLATES.map(tpl => ({
  ...tpl,
  gridAspect: rasterizePaths(tpl.paths, { preserveAspect: true }),
  gridStretch: rasterizePaths(tpl.paths, { preserveAspect: false })
}));

function strokeLineMetrics(stroke, feat) {
  const pts = stroke.pts || [];
  const box = feat?.bbox || computeBoundingBox(pts);
  const straightness = Number.isFinite(feat?.straightness)
    ? feat.straightness
    : (() => {
        if (pts.length < 2) return 0;
        let arc = 0;
        for (let i = 1; i < pts.length; i++) {
          arc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }
        const chord = Math.hypot(pts.at(-1)[0] - pts[0][0], pts.at(-1)[1] - pts[0][1]);
        return arc > 1e-6 ? clamp(chord / arc, 0, 1) : 0;
      })();
  const dx = pts.length >= 2 ? pts.at(-1)[0] - pts[0][0] : 0;
  const dy = pts.length >= 2 ? pts.at(-1)[1] - pts[0][1] : 0;
  const angleDeg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  const acuteFromHoriz = angleDeg > 90 ? 180 - angleDeg : angleDeg;
  const acuteFromVert = Math.abs(90 - acuteFromHoriz);
  return {
    box,
    straightness,
    acuteFromHoriz,
    acuteFromVert,
    length: Math.hypot(dx, dy),
    isHorizBar: straightness >= 0.84 && acuteFromHoriz <= 18 && box.width >= 12 && box.width / Math.max(1, box.height) >= 1.9,
    isVertBar: straightness >= 0.84 && acuteFromVert <= 18 && box.height >= 14 && box.height / Math.max(1, box.width) >= 1.9,
    isDiagBar: straightness >= 0.84 && acuteFromHoriz >= 22 && acuteFromHoriz <= 72 && Math.hypot(dx, dy) >= 16
  };
}

function horizontalOverlapFraction(a, b) {
  const ov = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const minW = Math.max(1, Math.min(a.width, b.width));
  return ov / minW;
}

function verticalOverlapFraction(a, b) {
  const ov = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const minH = Math.max(1, Math.min(a.height, b.height));
  return ov / minH;
}

/**
 * Groups strokes belonging to the same handwritten symbol (e.g. '+', '=', 'x', '4', '5', '7')
 * while keeping adjacent digits and fraction numerator/bar/denominator strictly separated.
 */
function clusterSymbolStrokes(strokes, featById) {
  const n = strokes.length;
  if (!n) return [];
  const metrics = strokes.map(s => strokeLineMetrics(s, featById.get(s.id)));
  const parent = strokes.map((_, i) => i);
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mi = metrics[i];
      const mj = metrics[j];
      const bi = mi.box;
      const bj = mj.box;
      const gap = bboxGap(bi, bj);
      const maxRef = Math.max(bi.diagonal, bj.diagonal, 20);
      if (gap > Math.max(32, maxRef * 0.85)) continue;

      // 1. Intersecting strokes always belong to the same symbol (+, x, ×, 4, 7-barred, etc.)
      if (findStrokeIntersections(strokes[i].pts, strokes[j].pts).length > 0) {
        union(i, j);
        continue;
      }

      const hOv = horizontalOverlapFraction(bi, bj);
      const vOv = verticalOverlapFraction(bi, bj);

      // 2. Vertically stacked short horizontal bars -> '=' sign
      if (mi.isHorizBar && mj.isHorizBar) {
        const wRatio = Math.max(bi.width, bj.width) / Math.max(1, Math.min(bi.width, bj.width));
        const vSep = Math.abs(bi.cy - bj.cy);
        const maxEqSep = Math.max(26, Math.min(bi.width, bj.width) * 0.9);
        if (hOv >= 0.45 && wRatio <= 1.85 && vSep >= 4 && vSep <= maxEqSep) {
          // Ensure no tall stroke sits between them
          const loY = Math.min(bi.cy, bj.cy);
          const hiY = Math.max(bi.cy, bj.cy);
          const minX = Math.min(bi.minX, bj.minX);
          const maxX = Math.max(bi.maxX, bj.maxX);
          const hasBetween = metrics.some((mk, k) =>
            k !== i && k !== j &&
            mk.box.cx >= minX && mk.box.cx <= maxX &&
            mk.box.cy > loY && mk.box.cy < hiY
          );
          if (!hasBetween) {
            union(i, j);
            continue;
          }
        }
      }

      // 3. Touching / heavily overlapping multi-stroke glyph (e.g. 2-stroke '4', '5', '1' with base)
      //    Never merge a fraction bar with a separate digit above or below it!
      const oneIsLongHorizBar = (mi.isHorizBar && !mj.isHorizBar && bi.width > bj.width * 1.15) ||
        (mj.isHorizBar && !mi.isHorizBar && bj.width > bi.width * 1.15);
      if (!oneIsLongHorizBar) {
        const minDist = minStrokeDistance(strokes[i].pts, strokes[j].pts);
        const touchTol = Math.max(7, Math.min(bi.diagonal, bj.diagonal) * 0.16);
        if (minDist <= touchTol && hOv >= 0.35 && vOv >= 0.15) {
          union(i, j);
          continue;
        }
        if (hOv >= 0.55 && vOv >= 0.45 && gap <= 4) {
          union(i, j);
        }
      }
    }
  }

  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push({ stroke: strokes[i], metrics: metrics[i] });
  }

  const clusters = [];
  for (const items of byRoot.values()) {
    const cStrokes = items.map(x => x.stroke);
    const box = boxFromStrokes(cStrokes);
    if (!box) continue;
    clusters.push({
      strokes: cStrokes,
      metrics: items.map(x => x.metrics),
      box
    });
  }

  clusters.sort((a, b) => a.box.minX - b.box.minX || a.box.minY - b.box.minY);
  return clusters;
}

/**
 * Classifies a single symbol cluster using exact geometric operator/bar detectors
 * plus normalized 16x16 raster + online-feature template matching.
 */
function classifyLocalSymbolCluster(cluster, { category = 'auto' } = {}) {
  const { strokes, metrics, box } = cluster;
  if (!strokes.length || !box) return null;

  // Reject oversized geometry shapes (circles, rectangles, long lines) from math glyph OCR
  if (Math.max(box.w, box.h) > 140 && !(strokes.length === 1 && metrics[0].isHorizBar && box.h <= 18)) {
    return null;
  }

  // 1. Exact 2-stroke geometric symbols: '=', '+', 'x'/'×'
  if (strokes.length === 2) {
    const [m0, m1] = metrics;

    // Equals sign '='
    if (m0.isHorizBar && m1.isHorizBar) {
      const hOv = horizontalOverlapFraction(m0.box, m1.box);
      const vSep = Math.abs(m0.box.cy - m1.box.cy);
      if (hOv >= 0.45 && vSep >= 4) {
        return {
          symbol: '=',
          confidence: 0.95,
          alternatives: [{ symbol: '-', confidence: 0.45 }],
          engine: 'local-vector'
        };
      }
    }

    // Intersecting two straight strokes -> '+' or 'x'/'×'
    const hits = findStrokeIntersections(strokes[0].pts, strokes[1].pts);
    if (hits.length > 0) {
      const hasHoriz = m0.isHorizBar || m1.isHorizBar;
      const hasVert = m0.isVertBar || m1.isVertBar;
      if (hasHoriz && hasVert && (m0.straightness >= 0.82 && m1.straightness >= 0.82)) {
        const hit = hits[0];
        const rx = (hit.x - box.minX) / Math.max(1, box.w);
        const ry = (hit.y - box.minY) / Math.max(1, box.h);
        if (rx >= 0.15 && rx <= 0.85 && ry >= 0.15 && ry <= 0.85) {
          return {
            symbol: '+',
            confidence: 0.95,
            alternatives: [{ symbol: '×', confidence: 0.55 }],
            engine: 'local-vector'
          };
        }
      }

      if (m0.isDiagBar && m1.isDiagBar) {
        const p0 = strokes[0].pts;
        const p1 = strokes[1].pts;
        const v0x = p0.at(-1)[0] - p0[0][0], v0y = p0.at(-1)[1] - p0[0][1];
        const v1x = p1.at(-1)[0] - p1[0][0], v1y = p1.at(-1)[1] - p1[0][1];
        const denom = Math.hypot(v0x, v0y) * Math.hypot(v1x, v1y);
        const cosA = denom > 1e-6 ? clamp(Math.abs(v0x * v1x + v0y * v1y) / denom, 0, 1) : 1;
        const angleBetweenDeg = (Math.acos(cosA) * 180) / Math.PI;
        if (angleBetweenDeg >= 40 && angleBetweenDeg <= 135) {
          const preferVar = category === 'algebra';
          return {
            symbol: preferVar ? 'x' : '×',
            confidence: 0.94,
            alternatives: [{ symbol: preferVar ? '×' : 'x', confidence: 0.78 }],
            engine: 'local-vector'
          };
        }
      }
    }
  }

  // 2. Exact 1-stroke horizontal bar ('-' / fraction bar) or vertical bar ('1')
  if (strokes.length === 1) {
    const m0 = metrics[0];
    if (m0.straightness >= 0.88 && m0.acuteFromHoriz <= 15 && box.w >= 14 && box.h <= 18 && box.w / Math.max(1, box.h) >= 2.2) {
      return {
        symbol: '-',
        isBar: true,
        confidence: 0.92,
        alternatives: [{ symbol: '—', confidence: 0.86 }],
        engine: 'local-vector'
      };
    }
    if (m0.straightness >= 0.90 && m0.acuteFromVert <= 16 && box.h >= 16 && box.h / Math.max(1, box.w) >= 2.2) {
      return {
        symbol: '1',
        confidence: 0.94,
        alternatives: [{ symbol: 'l', confidence: 0.52 }],
        engine: 'local-vector'
      };
    }
  }

  // 3. Normalized 16x16 raster + online-feature template matching
  const paths = strokes.map(s => s.pts.filter(p => Array.isArray(p) && p.length >= 2));
  const gridAspect = rasterizePaths(paths, { preserveAspect: true });
  const gridStretch = rasterizePaths(paths, { preserveAspect: false });
  if (!gridAspect || !gridStretch) return null;

  const aspect = box.w / Math.max(1, box.h);
  const strokeCount = strokes.length;
  const firstPath = paths[0];
  const isClosedSingle = strokeCount === 1 && firstPath.length >= 6 &&
    Math.hypot(firstPath[0][0] - firstPath.at(-1)[0], firstPath[0][1] - firstPath.at(-1)[1]) <= Math.max(box.w, box.h) * 0.25;

  // Endpoint normalized coords for single-stroke disambiguation (e.g. 2 vs 5 vs 3 vs z)
  const startNx = firstPath.length ? (firstPath[0][0] - box.minX) / Math.max(1, box.w) : 0.5;
  const startNy = firstPath.length ? (firstPath[0][1] - box.minY) / Math.max(1, box.h) : 0.5;
  const endNx = firstPath.length ? (firstPath.at(-1)[0] - box.minX) / Math.max(1, box.w) : 0.5;
  const endNy = firstPath.length ? (firstPath.at(-1)[1] - box.minY) / Math.max(1, box.h) : 0.5;

  const bestBySymbol = new Map();
  for (const tpl of COMPILED_LOCAL_TEMPLATES) {
    if (category === 'numbers' && tpl.kind === 'letter') continue;

    const simAspect = dotGrid(gridAspect, tpl.gridAspect);
    const simStretch = dotGrid(gridStretch, tpl.gridStretch);
    let score = 0.52 * simAspect + 0.48 * simStretch;

    const aspectDiff = Math.abs(Math.log((aspect + 0.08) / (tpl.aspect + 0.08)));
    score -= Math.min(0.18, aspectDiff * 0.09);

    if (tpl.strokes === strokeCount) score += 0.035;
    else if (Math.abs(tpl.strokes - strokeCount) >= 2) score -= 0.08;

    if (tpl.closed && !isClosedSingle && strokeCount === 1) score -= 0.08;
    if (!tpl.closed && isClosedSingle && tpl.symbol !== '6' && tpl.symbol !== '9') score -= 0.08;

    // Gentle online start/end direction consistency for single-stroke digits
    if (strokeCount === 1 && tpl.paths.length === 1) {
      const tp = tpl.paths[0];
      const tStart = tp[0];
      const tEnd = tp[tp.length - 1];
      const epErr = 0.5 * (
        Math.hypot(startNx - tStart[0], startNy - tStart[1]) +
        Math.hypot(endNx - tEnd[0], endNy - tEnd[1])
      );
      if (epErr <= 0.35) score += 0.04;
      else if (epErr >= 0.85) score -= 0.05;
    }

    if (category === 'algebra' && tpl.kind === 'letter') score += 0.02;
    score = clamp(score, 0, 0.97);

    const prev = bestBySymbol.get(tpl.symbol);
    if (!prev || score > prev) bestBySymbol.set(tpl.symbol, score);
  }

  // Consult legacy recognizeInk only as a cross-check for borderline single-glyph matches
  let bestSoFar = 0;
  for (const sc of bestBySymbol.values()) if (sc > bestSoFar) bestSoFar = sc;
  if (bestSoFar < 0.85) {
    const inkRes = recognizeInk(strokes);
    if (inkRes?.geometry?.text && inkRes.geometry.text.length === 1) {
      const sym = inkRes.geometry.text;
      const inkScore = clamp(Number(inkRes.confidence) || 0.86, 0, 0.96);
      const prev = bestBySymbol.get(sym) || 0;
      bestBySymbol.set(sym, Math.max(prev, inkScore));
    }
  }

  const ranked = [...bestBySymbol.entries()]
    .map(([symbol, confidence]) => ({ symbol, confidence: Number(confidence.toFixed(4)) }))
    .sort((a, b) => b.confidence - a.confidence);

  if (!ranked.length || ranked[0].confidence < 0.62) return null;

  return {
    symbol: ranked[0].symbol,
    confidence: ranked[0].confidence,
    alternatives: ranked.slice(1, 4),
    engine: 'local-vector'
  };
}

/**
 * Extracts local symbol tokens from strokes when pre-tokenized symbols are not supplied.
 * Filters accidental dots, clusters multi-stroke symbols ('+', '=', '×', 'x', '4', '5', '7'),
 * and classifies each symbol using geometric detectors + normalized raster/online templates.
 */
export function extractLocalSymbolTokens(readingStrokes, dsp, options = {}) {
  const tokens = [];
  if (!Array.isArray(readingStrokes) || !readingStrokes.length) return tokens;

  const category = options.category || 'auto';
  const accidentalIds = new Set(dsp?.features?.summary?.accidentalDotIds || []);
  const activeStrokes = readingStrokes.filter(s => !accidentalIds.has(s.id));
  if (!activeStrokes.length) return tokens;

  const featById = new Map((dsp?.features?.perStroke || []).map(f => [f.id, f]));
  const clusters = clusterSymbolStrokes(activeStrokes, featById);

  let tokenIdx = 0;
  for (const cluster of clusters) {
    const cls = classifyLocalSymbolCluster(cluster, { category });
    if (!cls) continue;
    tokens.push({
      id: `tok_${tokenIdx++}`,
      symbol: cls.symbol,
      ...(cls.isBar ? { isBar: true } : {}),
      box: {
        minX: cluster.box.minX,
        maxX: cluster.box.maxX,
        minY: cluster.box.minY,
        maxY: cluster.box.maxY
      },
      confidence: cls.confidence,
      alternatives: cls.alternatives || [],
      strokeIds: cluster.strokes.map(s => s.id),
      engine: cls.engine || 'local-vector'
    });
  }

  return tokens;
}

/**
 * Applies local UserHandwritingProfile to symbol tokens immutably, respecting ±MAX_BIAS_DELTA (0.12).
 */
function applyPersonalizationToTokens(tokens, profile, strokeById, personalizeFn) {
  if (!Array.isArray(tokens) || !tokens.length || !profile?.enabled) {
    return { tokens: tokens || [], adjustments: [] };
  }

  const adjustments = [];
  const updated = tokens.map((tok, idx) => {
    const baseSymbol = String(tok.symbol ?? tok.text ?? '').trim();
    if (!baseSymbol) return tok;
    const baseScore = clamp(Number(tok.confidence ?? tok.score ?? 0.85), 0, 1);

    const candMap = new Map();
    candMap.set(baseSymbol, { symbol: baseSymbol, score: baseScore });
    if (Array.isArray(tok.alternatives)) {
      for (const alt of tok.alternatives) {
        const s = String(alt?.symbol ?? '').trim();
        if (!s || candMap.has(s)) continue;
        const sc = clamp(Number(alt.confidence ?? alt.score ?? 0.5), 0, 1);
        candMap.set(s, { symbol: s, score: sc });
      }
    }

    const cands = [...candMap.values()];
    const tokStrokes = Array.isArray(tok.strokes)
      ? tok.strokes
      : (Array.isArray(tok.strokeIds) ? tok.strokeIds.map(id => strokeById.get(id)).filter(Boolean) : []);

    const ranked = personalizeFn(profile, cands, { strokes: tokStrokes });
    if (!Array.isArray(ranked) || !ranked.length) return tok;

    const top = ranked[0];
    const delta = clamp(Number(top.personalDelta) || 0, -MAX_BIAS_DELTA, MAX_BIAS_DELTA);
    if (top.symbol !== baseSymbol || Math.abs(delta) > 0) {
      adjustments.push({
        tokenId: tok.id ?? `tok_${idx}`,
        from: baseSymbol,
        to: top.symbol,
        baseScore: top.baseScore ?? baseScore,
        adjustedScore: top.score,
        delta,
        reasons: top.personalReasons || []
      });
    }

    return {
      ...tok,
      symbol: top.symbol,
      confidence: top.score,
      alternatives: ranked.slice(1).map(r => ({ symbol: r.symbol, confidence: r.score, score: r.score }))
    };
  });

  return { tokens: updated, adjustments };
}

/**
 * Builds an editable, non-destructive digital object compatible with page.mathLayer.objects[].
 */
export function buildDigitalObject(winner, rawStrokes, confidence, intervention, options = {}) {
  if (!winner) return null;
  const orientation = inkOrientation(options.orientation);
  const strokeIds = Array.isArray(winner.sourceStrokeIds) && winner.sourceStrokeIds.length
    ? [...winner.sourceStrokeIds]
    : rawStrokes.map(s => s.id);
  const idSet = new Set(strokeIds);
  const matchedStrokes = rawStrokes.filter(s => idSet.has(s.id));
  const usedStrokes = matchedStrokes.length ? matchedStrokes : rawStrokes;
  const sources = buildSourceRefs(usedStrokes);
  const baseStyle = {
    color: /^#[0-9a-f]{6}$/i.test(usedStrokes[0]?.color) ? usedStrokes[0].color : '#111827',
    width: Math.max(0.8, Math.min(16, Number(usedStrokes[0]?.width) || 2.5))
  };

  let geometry = winner.geometry || null;
  if (geometry && geometry.kind === 'text' && orientation !== 'portrait') {
    geometry = readingGeometryToPage(geometry, orientation);
  }

  return {
    id: options.objectId || `math_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    accepted: intervention.shouldAutoApply,
    automatic: intervention.level === 'smart' || intervention.level === 'digital',
    editable: true,
    revertable: true,
    domain: winner.domain,
    type: winner.type || winner.kind || winner.domain,
    label: winner.label || 'Objeto matemático',
    geometry,
    style: baseStyle,
    sourceStrokeIds: strokeIds,
    sources,
    originalStrokes: cloneStrokesReadonly(usedStrokes),
    confidence,
    ...(winner.domain === 'math'
      ? {
          plainText: winner.plainText,
          latex: winner.latex,
          mathml: winner.mathml,
          ast: winner.ast,
          constructs: winner.constructs || [],
          preservedAsWritten: true
        }
      : {}),
    ...(winner.domain === 'data'
      ? {
          structure: winner.structure,
          editableModel: winner.editableModel,
          onlyWrittenDataPreserved: true,
          strictDataPreservation: true
        }
      : {}),
    ...(winner.domain === 'geometry'
      ? {
          shape: winner.kind,
          isContextual: Boolean(winner.isContextual),
          parentObjectId: winner.parentObjectId || null,
          contextualElements: winner.contextualElements || [],
          attachedLabels: winner.attachedLabels || []
        }
      : {})
  };
}

/**
 * Deterministic cross-domain fusion (`math` vs `geometry` vs `data`) following RECOGNITION_ENGINE.md.
 */
function fuseCrossDomainHypotheses(hypotheses, context) {
  const {
    category,
    intention,
    enclosedCircleAnnotation,
    hasComplete2DMath,
    hasDrawnEquals,
    hasDisagreement,
    hasAmbiguity
  } = context;

  if (!hypotheses.length) {
    const emptyConf = calibrateConfidence({ rawScore: 0 });
    return {
      winner: null,
      alternatives: [],
      confidence: emptyConf,
      rejectedReasons: []
    };
  }

  const rejectedReasons = [];

  const scored = hypotheses.map(h => {
    let score = clamp(Number(h.rawScore) || 0, 0, 1);
    const signals = { rawScore: score };

    // Rule 1: Active category / explicit intention priority
    if (category === 'geometry' || (intention && intention !== 'auto')) {
      if (h.domain === 'geometry') {
        score += 0.12;
        signals.categoryBoost = 0.12;
      } else {
        score -= 0.28;
        signals.categoryPenalty = -0.28;
      }
    } else if (category === 'data') {
      if (h.domain === 'data') {
        score += 0.14;
        signals.categoryBoost = 0.14;
      } else {
        score -= 0.28;
        signals.categoryPenalty = -0.28;
      }
    } else if (category === 'numbers' || category === 'algebra') {
      if (h.domain === 'math') {
        score += 0.12;
        signals.categoryBoost = 0.12;
      } else {
        score -= 0.28;
        signals.categoryPenalty = -0.28;
      }
    }

    // Rule 2: Structural 2D validity (fractions, powers, roots, systems, vertical arithmetic) beats loose segments
    if (h.domain === 'math' && hasComplete2DMath) {
      score += 0.08;
      signals.structural2DBoost = 0.08;
    }
    if (h.domain === 'geometry' && h.kind === 'segment' && hasComplete2DMath) {
      score -= 0.25;
      signals.fractionBarConflictPenalty = -0.25;
      rejectedReasons.push({ domain: 'geometry', kind: 'segment', reason: 'horizontal_bar_is_fraction_bar' });
    }

    // Rule 3: Large enclosing circle with number inside -> geometry circle, not math '0'
    if (enclosedCircleAnnotation) {
      if (h.domain === 'geometry' && h.kind === 'circle') {
        score += 0.12;
        signals.enclosedCircleBoost = 0.12;
      } else if (h.domain === 'math') {
        score -= 0.35;
        signals.enclosedCirclePenalty = -0.35;
        rejectedReasons.push({ domain: 'math', reason: 'enclosed_math_annotation_prefers_geometry_circle' });
      }
    }

    // Rule 4: Two short horizontal strokes at end of math expression -> '=', not parallel_lines
    if (hasDrawnEquals && h.domain === 'geometry' && h.kind === 'parallel_lines' && hypotheses.some(x => x.domain === 'math')) {
      score -= 0.28;
      signals.equalsSignConflictPenalty = -0.28;
      rejectedReasons.push({ domain: 'geometry', kind: 'parallel_lines', reason: 'trailing_equals_sign_in_math' });
    }

    // Rule 5: Structured data (table/chart) with high structural evidence beats generic polygon/segments in auto mode
    if (category === 'auto' && h.domain === 'data' && h.rawScore >= 0.84) {
      score += 0.06;
      signals.dataStructureBoost = 0.06;
    }

    const finalScore = clamp(Number(score.toFixed(4)), 0, 1);
    return { hypothesis: h, score: finalScore, signals };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1] || null;
  const secondScore = second ? second.score : Math.max(0, top.hypothesis.runnerUpScore ?? 0);

  const calibrated = calibrateConfidence({
    rawScore: top.score,
    secondScore,
    hasDisagreement: hasDisagreement && top.hypothesis.domain === 'math',
    hasAmbiguity: hasAmbiguity && top.hypothesis.domain === 'math',
    mlkitOnly: Boolean(top.hypothesis.mlkitOnly),
    signals: top.signals
  });

  const winner = {
    ...top.hypothesis,
    confidence: calibrated
  };

  const alternatives = scored.slice(1).map(s => ({
    ...s.hypothesis,
    confidence: calibrateConfidence({ rawScore: s.score, secondScore: 0, signals: s.signals })
  }));

  return {
    winner,
    alternatives,
    confidence: calibrated,
    rejectedReasons
  };
}

/**
 * Executes the full unified, non-destructive, fault-isolated math recognition pipeline.
 *
 * @param {readonly object[]} strokes Immutable raw strokes (A5 1000x1400).
 * @param {object} [options]
 * @returns {object} Unified pipeline result with winner, confidence, intervention, digitalObject, and diagnostics.
 */
export function runMathPipeline(strokes, options = {}) {
  const tStart = nowMs();
  const category = normalizeCategory(options.category);
  const interventionLevel = normalizeInterventionLevel(options.interventionLevel);
  const orientation = inkOrientation(options.orientation);
  const intention = typeof options.intention === 'string' && options.intention ? options.intention : 'auto';
  const existingObjects = Array.isArray(options.existingObjects) ? options.existingObjects : [];
  const profile = options.profile ? createUserProfile(options.profile) : null;
  const mlkitCandidates = Array.isArray(options.mlkitCandidates) ? [...options.mlkitCandidates] : [];
  const engines = options.engines || {};

  const engineErrors = [];
  const stageTimingsMs = { dsp: 0, symbols: 0, geometry: 0, data: 0, structural: 0, fusion: 0 };

  const recordError = (stage, engine, err) => {
    engineErrors.push({
      stage,
      engine,
      message: err?.message ? String(err.message) : String(err || 'Unknown engine error')
    });
  };

  // Strict immutability: work exclusively on cloned copies
  const safeStrokes = cloneStrokesReadonly(strokes);
  const readingStrokes = toReadingStrokes(safeStrokes, orientation);
  const readingStrokeById = new Map(readingStrokes.map(s => [s.id, s]));

  // Empty input fast-path
  if (!safeStrokes.length && (!Array.isArray(options.symbolTokens) || !options.symbolTokens.length)) {
    const emptyConf = calibrateConfidence({ rawScore: 0 });
    const intervention = decideIntervention(null, emptyConf, { interventionLevel });
    return {
      category,
      interventionLevel,
      orientation,
      winner: null,
      alternatives: [],
      candidates: [],
      confidence: emptyConf,
      intervention,
      action: intervention.action,
      digitalObject: null,
      suggestions: [],
      originalStrokes: safeStrokes,
      dsp: buildFallbackDsp([]),
      engine: 'none',
      timingMs: Number((nowMs() - tStart).toFixed(2)),
      diagnostics: {
        timingMs: Number((nowMs() - tStart).toFixed(2)),
        stageTimingsMs,
        engineErrors,
        category,
        interventionLevel,
        orientation,
        personalizationApplied: [],
        rejectedReasons: [],
        immutable: true
      }
    };
  }

  // -------------------------------------------------------------------------
  // Stage 1: DSP (processStrokes) — fault isolated
  // -------------------------------------------------------------------------
  let dsp = null;
  const tDsp = nowMs();
  try {
    const dspFn = typeof engines.dsp === 'function' ? engines.dsp : processStrokes;
    dsp = dspFn(readingStrokes, options.dspOptions || {});
    if (!dsp || !Array.isArray(dsp.processed)) {
      dsp = buildFallbackDsp(readingStrokes);
    }
  } catch (err) {
    recordError('dsp', 'math-dsp', err);
    dsp = buildFallbackDsp(readingStrokes);
  }
  stageTimingsMs.dsp = Number((nowMs() - tDsp).toFixed(2));

  // -------------------------------------------------------------------------
  // Stage 2A: Symbol OCR + Personalization — fault isolated
  // -------------------------------------------------------------------------
  let symbolTokens = [];
  let personalizationApplied = [];
  const tSym = nowMs();
  try {
    const symFn = typeof engines.symbols === 'function' ? engines.symbols : extractLocalSymbolTokens;
    const rawTokens = Array.isArray(options.symbolTokens)
      ? options.symbolTokens.map(t => ({ ...t }))
      : symFn(readingStrokes, dsp, { category, profile });
    symbolTokens = Array.isArray(rawTokens) ? rawTokens : [];
  } catch (err) {
    recordError('symbols', 'symbol-ocr', err);
    symbolTokens = [];
  }

  try {
    if (profile?.enabled && symbolTokens.length) {
      const persFn = typeof engines.personalization === 'function'
        ? engines.personalization
        : applyProfileToCandidates;
      const persResult = applyPersonalizationToTokens(symbolTokens, profile, readingStrokeById, persFn);
      symbolTokens = persResult.tokens;
      personalizationApplied = persResult.adjustments;
    }
  } catch (err) {
    recordError('personalization', 'math-personalization', err);
  }
  stageTimingsMs.symbols = Number((nowMs() - tSym).toFixed(2));

  // Build label annotations from recognized tokens for geometry/data engines (only written data!)
  const writtenLabels = symbolTokens
    .map((tok, idx) => {
      const norm = normalizeSymbol(tok, idx);
      if (!norm) return null;
      return {
        id: norm.id,
        text: norm.symbol,
        center: [norm.box.cx, norm.box.cy],
        bounds: {
          minX: norm.box.minX,
          maxX: norm.box.maxX,
          minY: norm.box.minY,
          maxY: norm.box.maxY
        },
        strokeIds: [...norm.strokeIds]
      };
    })
    .filter(Boolean);

  const readingsByStrokeId = {};
  for (const lbl of writtenLabels) {
    for (const sid of lbl.strokeIds) {
      if (!readingsByStrokeId[sid]) readingsByStrokeId[sid] = lbl.text;
    }
  }

  const hypotheses = [];

  // -------------------------------------------------------------------------
  // Stage 2B: Contextual Geometry — fault isolated (NO auto-trapezoids, preserve proportions)
  // -------------------------------------------------------------------------
  const tGeo = nowMs();
  let geometryResult = null;
  let contextualElements = [];
  let contextualAttachedLabels = [];
  try {
    const geoFn = typeof engines.geometry === 'function' ? engines.geometry : recognizeGeometry;
    if (safeStrokes.length > 0) {
      const overtracePairs = dsp?.features?.summary?.overtracePairs || [];
      const geometryStrokes = overtracePairs.length > 0
        ? mergeOvertracedStrokes(safeStrokes, options.dspOptions?.overtrace || {}).mergedStrokes
        : safeStrokes;
      geometryResult = geoFn(geometryStrokes, {
        intention,
        allowAutoTrapezoid: false,
        preserveProportions: true
      });
    }
    if (geometryResult?.primary) {
      // Defensive contract guard: never emit auto-trapezoid
      const safeCandidates = (geometryResult.candidates || [geometryResult.primary])
        .filter(c => c && !EXCLUDED_AUTO_SHAPES.includes(c.shape));

      if (safeCandidates.length) {
        const primary = safeCandidates[0];
        const runnerUp = safeCandidates[1] || null;
        hypotheses.push({
          domain: 'geometry',
          type: primary.geometry?.kind || primary.shape,
          kind: primary.shape,
          isContextual: false,
          label: primary.label || SHAPE_LABELS[primary.shape] || 'Figura geométrica',
          geometry: primary.geometry,
          sourceStrokeIds: geometryResult.sourceStrokeIds || safeStrokes.map(s => s.id),
          rawScore: primary.confidence,
          runnerUpScore: runnerUp ? runnerUp.confidence : 0,
          engine: 'geometry-contextual',
          alternatives: safeCandidates.slice(1).map(c => ({
            kind: c.shape,
            label: c.label || SHAPE_LABELS[c.shape] || c.shape,
            score: c.confidence,
            geometry: c.geometry
          }))
        });
      }
    }
  } catch (err) {
    recordError('geometry', 'math-geometry-contextual', err);
  }

  // Contextual internal elements relative to existing objects on the page
  try {
    const ctxFn = typeof engines.contextualGeometry === 'function'
      ? engines.contextualGeometry
      : recognizeContextualElements;
    if (existingObjects.length && safeStrokes.length) {
      for (const parentObj of existingObjects) {
        if (!parentObj || !parentObj.geometry) continue;
        const ctxRes = ctxFn(parentObj, safeStrokes, { readingsByStrokeId });
        if (ctxRes && Array.isArray(ctxRes.elements) && ctxRes.elements.length) {
          contextualElements.push(
            ...ctxRes.elements.map(el => ({ ...el, parentObjectId: parentObj.id || null }))
          );
          if (Array.isArray(ctxRes.attachedLabels)) {
            contextualAttachedLabels.push(...ctxRes.attachedLabels);
          }
          const topEl = ctxRes.elements[0];
          hypotheses.push({
            domain: 'geometry',
            type: topEl.kind,
            kind: topEl.kind,
            isContextual: true,
            parentObjectId: parentObj.id || null,
            label: topEl.kind,
            geometry: topEl,
            contextualElements: ctxRes.elements,
            attachedLabels: ctxRes.attachedLabels || [],
            sourceStrokeIds: topEl.sourceStrokeIds || safeStrokes.map(s => s.id),
            rawScore: Number(topEl.confidence) || 0.88,
            runnerUpScore: 0,
            engine: 'geometry-contextual',
            alternatives: []
          });
          break;
        }
      }
    }
  } catch (err) {
    recordError('geometry', 'math-geometry-contextual-elements', err);
  }
  stageTimingsMs.geometry = Number((nowMs() - tGeo).toFixed(2));

  // -------------------------------------------------------------------------
  // Stage 2C: Data, Tables & Charts — fault isolated (NO invented values)
  // -------------------------------------------------------------------------
  const tData = nowMs();
  let dataResult = null;
  try {
    const dataFn = typeof engines.data === 'function' ? engines.data : recognizeDataStructure;
    if (readingStrokes.length > 0) {
      const mergedLabels = [
        ...writtenLabels,
        ...(Array.isArray(options.labels) ? options.labels : [])
      ];
      dataResult = dataFn(readingStrokes, { labels: mergedLabels, category });
    }
    if (dataResult?.primary) {
      const primary = dataResult.primary;
      const runnerUp = dataResult.candidates?.[1] || null;
      hypotheses.push({
        domain: 'data',
        type: primary.kind,
        kind: primary.kind,
        label: primary.label,
        structure: {
          ...primary,
          onlyWrittenDataPreserved: true,
          strictDataPreservation: true
        },
        editableModel: dataResult.editableModel || null,
        onlyWrittenDataPreserved: true,
        strictDataPreservation: true,
        sourceStrokeIds: primary.sourceStrokeIds || primary.gridStrokeIds || readingStrokes.map(s => s.id),
        rawScore: Number(primary.confidence) || 0.85,
        runnerUpScore: runnerUp ? Number(runnerUp.confidence) || 0 : 0,
        engine: 'data-charts',
        alternatives: (dataResult.candidates || []).slice(1).map(c => ({
          kind: c.kind,
          label: c.label,
          score: c.confidence
        }))
      });
    }
  } catch (err) {
    recordError('data', 'math-data-charts', err);
  }
  stageTimingsMs.data = Number((nowMs() - tData).toFixed(2));

  // -------------------------------------------------------------------------
  // Stage 3: 2D Math Structural Parsing — fault isolated (NEVER auto-correct errors)
  // -------------------------------------------------------------------------
  const tStruct = nowMs();
  let structuralResult = null;
  let mathFusionResult = null;
  let hasDisagreement = false;
  let hasAmbiguity = false;
  let hasComplete2DMath = false;

  try {
    const structFn = typeof engines.structural === 'function' ? engines.structural : parseMathStructure;
    if (symbolTokens.length > 0) {
      structuralResult = structFn(symbolTokens, {
        category,
        userProfile: profile?.preferences || {}
      });
    }

    const mathCandidates = [];
    if (structuralResult && structuralResult.ast && structuralResult.ast.type !== 'Empty') {
      hasComplete2DMath = Boolean(
        structuralResult.constructs?.some(c =>
          ['fraction', 'nested_fraction', 'power', 'radical', 'subscript', 'vertical_arithmetic', 'system'].includes(c)
        )
      );
      mathCandidates.push({
        source: 'structural-2d',
        latex: structuralResult.latex,
        text: structuralResult.text,
        mathml: structuralResult.mathml,
        ast: structuralResult.ast,
        confidence: structuralResult.confidence?.score ?? 0.85,
        structuralValid: structuralResult.complete,
        category: category === 'algebra' ? 'algebra' : 'numbers'
      });
    }

    // Optional ML Kit 1D candidates (never veto 2D structure; never auto-apply alone > 0.82)
    if (mlkitCandidates.length > 0) {
      const hybrid = fuseMathCandidates({
        mlCandidates: mlkitCandidates,
        localText: structuralResult?.text || '',
        localConfidence: structuralResult?.confidence?.score || 0
      });
      if (hybrid?.text) {
        const display = formatMathDisplay(hybrid.text);
        mathCandidates.push({
          source: 'mlkit-es',
          latex: display,
          text: display,
          mathml: '',
          ast: null,
          confidence: 0.78,
          structuralValid: hasBinaryArithmetic(hybrid.text) || Boolean(normalizeArithmetic(hybrid.text)),
          category: 'numbers'
        });
        if (reviewDigitAmbiguities(hybrid.text).length > 0) {
          hasAmbiguity = true;
        }
      }
    }

    if (mathCandidates.length > 0) {
      const fusionFn = typeof engines.fusion === 'function'
        ? engines.fusion
        : fuseMathStructuralInterpretations;

      mathFusionResult = fusionFn(mathCandidates, {
        activeCategory: category,
        userProfile: profile?.preferences || {},
        spatialRelations: structuralResult?.spatial || null
      });

      if (mathFusionResult?.best) {
        const best = mathFusionResult.best;
        const mlkitOnly = best.source === 'mlkit-es' && !mathFusionResult.consensus;
        if (mathCandidates.length >= 2 && !mathFusionResult.consensus && !hasComplete2DMath) {
          hasDisagreement = true;
        }

        const runnerUp = mathFusionResult.alternatives?.[1] || null;
        const overallBox = boxFromStrokes(readingStrokes) || { minX: 0, maxX: 100, minY: 0, maxY: 40, w: 100, h: 40, cx: 50, cy: 20 };

        hypotheses.push({
          domain: 'math',
          type: 'math-expression',
          kind: structuralResult?.ast?.type || 'Expression',
          category: structuralResult?.constructs?.includes('variable') || category === 'algebra' ? 'algebra' : 'numbers',
          label: best.text || best.latex || 'Expresión matemática',
          plainText: best.text || '',
          latex: best.latex || '',
          mathml: best.mathml || structuralResult?.mathml || '',
          ast: best.ast || structuralResult?.ast || null,
          constructs: structuralResult?.constructs || [],
          disambiguations: structuralResult?.disambiguations || [],
          preservedAsWritten: true,
          complete: Boolean(structuralResult?.complete ?? true),
          mlkitOnly,
          geometry: {
            kind: 'text',
            text: best.text || best.latex || '',
            x: overallBox.cx,
            y: overallBox.maxY,
            size: clamp(overallBox.h || 28, 16, 96)
          },
          sourceStrokeIds: structuralResult?.strokeIds?.length
            ? structuralResult.strokeIds
            : readingStrokes.map(s => s.id),
          rawScore: mathFusionResult.score,
          runnerUpScore: runnerUp ? runnerUp.score : 0,
          engine: best.source || 'structural-2d',
          alternatives: (mathFusionResult.alternatives || []).slice(1)
        });
      }
    }
  } catch (err) {
    recordError('structural', 'math-structural', err);
  }
  stageTimingsMs.structural = Number((nowMs() - tStruct).toFixed(2));

  // -------------------------------------------------------------------------
  // Stage 4 & 5: Cross-Domain Fusion, Calibrated Confidence & Intervention
  // -------------------------------------------------------------------------
  const tFuse = nowMs();
  let fusionDecision;
  try {
    const enclosedCircleAnnotation = safeStrokes.length >= 2 && enclosedMathAnnotation(safeStrokes);
    const hasDrawnEquals = readingStrokes.length >= 3 && hasHandwrittenEquals(readingStrokes);

    fusionDecision = fuseCrossDomainHypotheses(hypotheses, {
      category,
      intention,
      enclosedCircleAnnotation,
      hasComplete2DMath,
      hasDrawnEquals,
      hasDisagreement,
      hasAmbiguity
    });
  } catch (err) {
    recordError('fusion', 'cross-domain-fusion', err);
    fusionDecision = {
      winner: null,
      alternatives: [],
      confidence: calibrateConfidence({ rawScore: 0 }),
      rejectedReasons: []
    };
  }
  stageTimingsMs.fusion = Number((nowMs() - tFuse).toFixed(2));

  const intervention = decideIntervention(fusionDecision.winner, fusionDecision.confidence, {
    interventionLevel,
    hasDisagreement,
    hasAmbiguity
  });

  const digitalObject = intervention.emitDigitalObject
    ? buildDigitalObject(fusionDecision.winner, safeStrokes, fusionDecision.confidence, intervention, {
        orientation
      })
    : null;

  const suggestions = intervention.showSuggestions && fusionDecision.winner
    ? [fusionDecision.winner, ...fusionDecision.alternatives]
    : [];

  const totalTimingMs = Number((nowMs() - tStart).toFixed(2));

  return {
    category,
    interventionLevel,
    orientation,
    winner: fusionDecision.winner,
    alternatives: fusionDecision.alternatives,
    candidates: fusionDecision.winner
      ? [fusionDecision.winner, ...fusionDecision.alternatives]
      : [],
    confidence: fusionDecision.confidence,
    intervention,
    action: intervention.action,
    digitalObject,
    suggestions,
    originalStrokes: safeStrokes,
    dsp,
    engine: fusionDecision.winner?.engine || 'none',
    timingMs: totalTimingMs,
    diagnostics: {
      timingMs: totalTimingMs,
      stageTimingsMs,
      engineErrors,
      category,
      interventionLevel,
      orientation,
      personalizationApplied,
      rejectedReasons: fusionDecision.rejectedReasons,
      immutable: true
    }
  };
}

/**
 * Progressive / incremental pipeline wrapper around `createProgressiveRecognizer`
 * with adaptive temporal pause windows, out-of-order group re-interpretation,
 * and monotonic `epoch` stale-job cancellation.
 */
export function createProgressivePipeline(options = {}) {
  const category = normalizeCategory(options.category);
  const interventionLevel = normalizeInterventionLevel(options.interventionLevel);
  const defaultBasePause = category === 'geometry' ? 550 : category === 'data' ? 900 : 1100;
  const basePauseMs = Number(options.basePauseMs) || defaultBasePause;
  const minPauseMs = Number(options.minPauseMs) || Math.min(380, basePauseMs);
  const maxPauseMs = Number(options.maxPauseMs) || Math.max(1450, basePauseMs);

  const progressive = createProgressiveRecognizer({
    category,
    userProfile: options.profile?.preferences || options.userProfile || {},
    initialPauseMs: basePauseMs,
    minPauseMs,
    maxPauseMs
  });

  let state = 'idle'; // 'idle' | 'collecting' | 'settling' | 'ready' | 'superseded'
  let epoch = 0;
  let lastStrokeTime = null;
  let rawStrokes = [];
  let symbolTokens = [];
  let cancelledEpochs = [];

  function onStrokeFinished(stroke, { symbol = null, nowMs: ts = Date.now() } = {}) {
    epoch += 1;
    state = 'collecting';
    lastStrokeTime = ts;

    if (stroke) {
      const cloned = cloneStrokesReadonly([stroke])[0];
      rawStrokes = [...rawStrokes, cloned];
    }

    let progressiveUpdate = null;
    if (symbol) {
      const symPayload = {
        ...symbol,
        strokeIds: Array.isArray(symbol.strokeIds)
          ? [...symbol.strokeIds]
          : (stroke?.id ? [stroke.id] : []),
        timestamp: symbol.timestamp ?? ts
      };
      symbolTokens = [...symbolTokens, symPayload];
      progressiveUpdate = progressive.addSymbol(symPayload, ts);
    }

    const settleDelayMs = progressiveUpdate?.adaptivePauseMs ?? progressive.getSnapshot().adaptivePauseMs ?? basePauseMs;
    return {
      epoch,
      settleDelayMs,
      state,
      preview: progressiveUpdate?.preview || null
    };
  }

  function addSymbol(symbol, now = Date.now()) {
    return onStrokeFinished(null, { symbol, nowMs: now });
  }

  function cancel(reason = 'cancelled') {
    if (epoch > 0) cancelledEpochs.push({ epoch, reason });
    epoch += 1;
    state = 'superseded';
    return { epoch, state, reason };
  }

  function isEpochCurrent(targetEpoch) {
    return targetEpoch === epoch;
  }

  /**
   * Executes an async runner (or `runMathPipeline`) and discards its result if `epoch` was superseded.
   */
  async function evaluateIfCurrent(targetEpoch, runner = null, runOptions = {}) {
    if (!isEpochCurrent(targetEpoch)) {
      return null;
    }
    state = 'settling';
    const result = typeof runner === 'function'
      ? await runner()
      : runMathPipeline(rawStrokes, {
          ...options,
          ...runOptions,
          category: runOptions.category ?? category,
          interventionLevel: runOptions.interventionLevel ?? interventionLevel,
          symbolTokens: symbolTokens.length ? symbolTokens : runOptions.symbolTokens
        });

    if (!isEpochCurrent(targetEpoch)) {
      return null;
    }
    state = 'ready';
    return result;
  }

  /**
   * Synchronous deterministic evaluation at timestamp `now` (ideal for tests and pause timers).
   */
  function evaluate(now = Date.now(), { force = false, runOptions = {} } = {}) {
    const snap = progressive.evaluate(now, { force });
    const elapsed = lastStrokeTime !== null ? Math.max(0, now - lastStrokeTime) : 0;
    const adaptivePauseMs = snap.adaptivePauseMs || basePauseMs;

    if (!rawStrokes.length && !symbolTokens.length) {
      state = 'idle';
      return {
        epoch,
        state: 'idle',
        shouldTransform: false,
        adaptivePauseMs,
        preview: null,
        result: null
      };
    }

    if (!force && elapsed < adaptivePauseMs) {
      state = 'collecting';
      return {
        epoch,
        state,
        shouldTransform: false,
        elapsedMs: elapsed,
        adaptivePauseMs,
        preview: snap.preview,
        result: null
      };
    }

    const result = runMathPipeline(rawStrokes, {
      ...options,
      ...runOptions,
      category: runOptions.category ?? category,
      interventionLevel: runOptions.interventionLevel ?? interventionLevel,
      symbolTokens: symbolTokens.length ? symbolTokens : runOptions.symbolTokens
    });

    state = result.intervention.shouldAutoApply ? 'ready' : 'settling';
    return {
      epoch,
      state,
      shouldTransform: result.intervention.shouldAutoApply,
      elapsedMs: elapsed,
      adaptivePauseMs,
      preview: snap.preview,
      result
    };
  }

  /**
   * Determines whether an incoming stroke is spatially related to an existing stroke group
   * and should trigger out-of-order re-interpretation.
   */
  function shouldReinterpret(existingStrokeIds, incomingStroke, dsp = null) {
    if (!incomingStroke || !Array.isArray(existingStrokeIds) || !existingStrokeIds.length) {
      return false;
    }
    const idSet = new Set(existingStrokeIds);
    const sourceStrokes = dsp?.original || rawStrokes;
    const existing = sourceStrokes.filter(s => idSet.has(s.id));
    if (!existing.length) return false;

    const existingBox = computeBoundingBox(existing.flatMap(s => s.pts || []));
    const incomingBox = computeBoundingBox(incomingStroke.pts || []);
    if (!existingBox.diagonal && !incomingBox.diagonal) return false;

    const medianScale = dsp?.features?.summary?.medianScale || Math.max(existingBox.diagonal, 40);
    const reopenRadius = clamp(medianScale * 0.9, 32, 130);
    return bboxGap(existingBox, incomingBox) <= reopenRadius;
  }

  function reset() {
    cancel('reset');
    progressive.reset();
    rawStrokes = [];
    symbolTokens = [];
    lastStrokeTime = null;
    state = 'idle';
  }

  function getState() {
    return state;
  }

  function getSnapshot() {
    return Object.freeze({
      epoch,
      state,
      strokeCount: rawStrokes.length,
      symbolCount: symbolTokens.length,
      cancelledEpochs: Object.freeze([...cancelledEpochs]),
      progressive: progressive.getSnapshot()
    });
  }

  return {
    getState,
    onStrokeFinished,
    addSymbol,
    cancel,
    isEpochCurrent,
    evaluateIfCurrent,
    evaluate,
    shouldReinterpret,
    reset,
    getSnapshot
  };
}
