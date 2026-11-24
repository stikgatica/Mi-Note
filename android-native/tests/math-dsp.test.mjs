import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAGE,
  extractPoints,
  computeBoundingBox,
  computeArcLength,
  oneEuroFilter,
  movingAverageFilter,
  rdpSimplify,
  resampleUniform,
  catmullRomToCubicBeziers,
  catmullRomInterpolate,
  normalizeStrokeGeometry,
  extractStrokeFeatures,
  detectCorners,
  findSelfIntersections,
  findStrokeIntersections,
  minStrokeDistance,
  detectOvertracing,
  mergeOvertracedStrokes,
  detectAccidentalDots,
  groupStrokes,
  processStrokes
} from '../src/math/math-dsp.mjs';

/* Helpers deterministas (sin Math.random) para pruebas y benchmarks reproducibles */
function lcg(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeLine(x0, y0, x1, y1, n = 25, t0 = 0, dt = 16) {
  return Array.from({ length: n }, (_, i) => {
    const u = n === 1 ? 0 : i / (n - 1);
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0.5, t0 + i * dt];
  });
}

function makeCircle(cx, cy, r, n = 90, t0 = 0, dt = 12) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), 0.55, t0 + i * dt];
  });
}

function makeStroke(id, pts, extra = {}) {
  return { id, color: '#111827', width: 2.5, pts, ...extra };
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}

function rmsError(ptsA, ptsB) {
  let sum = 0;
  const n = Math.min(ptsA.length, ptsB.length);
  for (let i = 0; i < n; i++) {
    const dx = ptsA[i][0] - ptsB[i][0];
    const dy = ptsA[i][1] - ptsB[i][1];
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/* ============================================================================
 * 1. Compatibilidad de formato, espacio A5, cero dependencias e inmutabilidad
 * ============================================================================ */

test('módulo puro sin dependencias externas ni llamadas de red o BLE', () => {
  const src = readFileSync(new URL('../src/math/math-dsp.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bfrom\s+['"]node:/);
  assert.doesNotMatch(src, /\b(fetch\(|XMLHttpRequest|WebSocket|document\.|window\.|BLE\.)\b/);
  assert.equal(PAGE.width, 1000);
  assert.equal(PAGE.height, 1400);
});

test('compatibilidad Mi Note (A5, x10, [x,y,press,t?]) e inmutabilidad estricta', () => {
  const s1 = deepFreeze(makeStroke('s1', [
    [-20, 100, 0.4],
    [150, 102, 0.6],
    [300, 100, 0.5],
    [1200, 1600, 0.8]
  ], { x10: { device: 'Huion Note X10', mode: 'agenda', rotation: 90, raw: [[1, 2]] } }));

  const s2 = deepFreeze(makeStroke('s2', makeLine(100, 300, 260, 300, 20, 1000, 15)));
  const input = Object.freeze([s1, s2]);
  const snapshot = JSON.stringify(input);

  const res = processStrokes(input);

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(res.original[0], s1);
  assert.equal(res.original[1], s2);
  assert.notEqual(res.processed[0], s1);
  assert.notEqual(res.processed[0].pts, s1.pts);
  assert.equal(res.processed[0].x10, s1.x10);
  // Clamping al espacio A5 1000x1400
  assert.equal(res.processed[0].pts[0][0], 0);
  assert.equal(res.processed[0].pts.at(-1)[0], 1000);
  assert.equal(res.processed[0].pts.at(-1)[1], 1400);
  assert.ok(res.timingMs >= 0);
});

/* ============================================================================
 * 2. Benchmark comparativo: One Euro Filter vs Media Móvil
 * ============================================================================ */

test('benchmark comparativo: One Euro Filter vs Media Móvil (jitter vs preservación de esquinas)', () => {
  const rand = lcg(2026);
  // Trazo en L: segmento horizontal lento (jitter alto) + giro 90° + segmento vertical rápido
  const clean = [];
  let t = 0;
  for (let i = 0; i <= 40; i++) {
    clean.push([100 + i * 2.5, 200, 0.5, t]);
    t += 20; // lento: 125 px/s
  }
  const cornerIdx = clean.length - 1; // (200, 200)
  for (let i = 1; i <= 25; i++) {
    clean.push([200, 200 + i * 10, 0.5, t]);
    t += 10; // rápido: 1000 px/s
  }

  const noisy = clean.map((p, i) => {
    if (i === 0 || i === clean.length - 1) return p.slice();
    const nx = (rand() - 0.5) * 6.0;
    const ny = (rand() - 0.5) * 6.0;
    return [p[0] + nx, p[1] + ny, p[2], p[3]];
  });

  const rawRms = rmsError(noisy, clean);
  const euroCausalPts = oneEuroFilter(noisy, { minCutoff: 1.2, beta: 0.04, dCutoff: 1.0, bidirectional: false });
  const euroZeroPhasePts = oneEuroFilter(noisy, { minCutoff: 1.2, beta: 0.04, dCutoff: 1.0, bidirectional: true });
  const ma5Pts = movingAverageFilter(noisy, 5);
  const ma9Pts = movingAverageFilter(noisy, 9);

  // Error geométrico perpendicular al trazo en L (independiente de fase)
  const pathDeviation = (pts) => {
    let sum = 0;
    for (const p of pts) {
      const dHoriz = p[0] <= 200 ? Math.abs(p[1] - 200) : Math.hypot(p[0] - 200, p[1] - 200);
      const dVert = p[1] >= 200 ? Math.abs(p[0] - 200) : Math.hypot(p[0] - 200, p[1] - 200);
      const d = Math.min(dHoriz, dVert);
      sum += d * d;
    }
    return Math.sqrt(sum / pts.length);
  };

  const rawPathErr = pathDeviation(noisy);
  const euroCausalPathErr = pathDeviation(euroCausalPts);
  const euroZeroPathErr = pathDeviation(euroZeroPhasePts);
  const rawSlowRms = rmsError(noisy.slice(0, cornerIdx), clean.slice(0, cornerIdx));
  const euroZeroSlowRms = rmsError(euroZeroPhasePts.slice(0, cornerIdx), clean.slice(0, cornerIdx));
  const ma5Rms = rmsError(ma5Pts, clean);
  const ma9Rms = rmsError(ma9Pts, clean);

  // Error en la esquina de 90°
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const euroCornerErr = dist(euroCausalPts[cornerIdx], clean[cornerIdx]);
  const euroZeroCornerErr = dist(euroZeroPhasePts[cornerIdx], clean[cornerIdx]);
  const ma9CornerErr = dist(ma9Pts[cornerIdx], clean[cornerIdx]);

  console.log(`[BENCH OneEuro vs MA] rawRMS=${rawRms.toFixed(2)}px (path=${rawPathErr.toFixed(2)}px, slowRMS=${rawSlowRms.toFixed(2)}px) | OneEuroCausal path=${euroCausalPathErr.toFixed(2)}px cornerErr=${euroCornerErr.toFixed(2)}px | OneEuroZeroPhase path=${euroZeroPathErr.toFixed(2)}px slowRMS=${euroZeroSlowRms.toFixed(2)}px cornerErr=${euroZeroCornerErr.toFixed(2)}px | MA5 RMS=${ma5Rms.toFixed(2)}px | MA9 RMS=${ma9Rms.toFixed(2)}px cornerErr=${ma9CornerErr.toFixed(2)}px`);

  // One Euro causal debe reducir sustancialmente el jitter geométrico respecto al crudo
  assert.ok(euroCausalPathErr < rawPathErr * 0.75, `Expected OneEuro causal pathErr (${euroCausalPathErr}) < 75% raw (${rawPathErr})`);
  // One Euro fase cero debe reducir jitter geométrico y ruido en tramo lento respecto al crudo
  assert.ok(euroZeroPathErr < rawPathErr * 0.75, `Expected OneEuro zero-phase pathErr (${euroZeroPathErr}) < 75% raw (${rawPathErr})`);
  assert.ok(euroZeroSlowRms < rawSlowRms * 0.80, `Expected OneEuro zero-phase slowRMS (${euroZeroSlowRms}) < 80% raw (${rawSlowRms})`);
  // Y redondear mucho menos la esquina rápida que una media móvil ancha (MA9)
  assert.ok(euroCornerErr < ma9CornerErr, `Expected OneEuro cornerErr (${euroCornerErr}) < MA9 cornerErr (${ma9CornerErr})`);
  assert.ok(euroZeroCornerErr < ma9CornerErr, `Expected OneEuro zero-phase cornerErr (${euroZeroCornerErr}) < MA9 cornerErr (${ma9CornerErr})`);
});

/* ============================================================================
 * 3. Benchmark comparativo: Ramer-Douglas-Peucker con múltiples tolerancias
 * ============================================================================ */

test('benchmark RDP: reducción monotónica de puntos y preservación de extremos', () => {
  const dense = makeCircle(400, 500, 120, 180);
  const epsilons = [0.5, 1.5, 3.0, 6.0];
  const counts = epsilons.map(eps => rdpSimplify(dense, eps).length);

  console.log(`[BENCH RDP 180pts] eps=${epsilons.join(',')} -> counts=${counts.join(',')}`);

  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] <= counts[i - 1], `Expected monotonic reduction: ${counts}`);
  }
  assert.ok(counts[0] < dense.length);
  assert.ok(counts.at(-1) >= 4);

  const simp = rdpSimplify(dense, 2.0);
  assert.deepEqual(simp[0], dense[0]);
  assert.deepEqual(simp.at(-1), dense.at(-1));
});

/* ============================================================================
 * 4. Remuestreo uniforme y Catmull-Rom / Bézier cúbico
 * ============================================================================ */

test('remuestreo uniforme por paso y por conteo conserva longitud y tiempos', () => {
  // Puntos espaciados de forma muy irregular sobre un segmento de 200 px
  const uneven = [
    [100, 100, 0.2, 0],
    [102, 100, 0.25, 10],
    [105, 100, 0.3, 20],
    [250, 100, 0.8, 150],
    [300, 100, 1.0, 200]
  ];
  const byCount = resampleUniform(uneven, { count: 21 });
  assert.equal(byCount.length, 21);
  assert.equal(byCount[0][0], 100);
  assert.equal(byCount.at(-1)[0], 300);

  for (let i = 1; i < byCount.length; i++) {
    const step = Math.hypot(byCount[i][0] - byCount[i - 1][0], byCount[i][1] - byCount[i - 1][1]);
    assert.ok(Math.abs(step - 10) < 1e-6, `Expected uniform step 10, got ${step}`);
    assert.ok(byCount[i][3] >= byCount[i - 1][3]);
  }

  const byStep = resampleUniform(uneven, { step: 20 });
  assert.equal(byStep.length, 11);
});

test('Catmull-Rom centrípeta y conversión a Bézier cúbicos', () => {
  const pts = [[100, 200, 0.5], [160, 140, 0.5], [240, 220, 0.5], [320, 160, 0.5]];
  const beziers = catmullRomToCubicBeziers(pts);
  assert.equal(beziers.length, pts.length - 1);
  assert.deepEqual(beziers[0].p0, [100, 200]);
  assert.deepEqual(beziers.at(-1).p3, [320, 160]);

  const smooth = catmullRomInterpolate(pts, { samplesPerSegment: 8 });
  assert.equal(smooth.length, 1 + (pts.length - 1) * 8);
  // Debe pasar exactamente por los puntos de control originales
  assert.ok(Math.hypot(smooth[8][0] - 160, smooth[8][1] - 140) < 1e-6);
  assert.ok(Math.hypot(smooth[16][0] - 240, smooth[16][1] - 220) < 1e-6);
});

/* ============================================================================
 * 5. Normalización de escala y orientación
 * ============================================================================ */

test('normalización preserva relación de aspecto y alinea orientación con PCA', () => {
  // Segmento inclinado 45° de longitud ~141.4 px
  const diag = makeLine(200, 300, 300, 400, 30);
  const norm = normalizeStrokeGeometry(diag, { targetSize: 100, alignOrientation: true, orientationMode: 'pca' });
  const box = computeBoundingBox(norm.pts);

  assert.ok(Math.abs(norm.transform.angle - Math.PI / 4) < 0.05);
  // Tras alinear por PCA, el segmento queda esencialmente horizontal (height ~ 0)
  assert.ok(box.height < 1e-3, `Expected near-zero height after PCA alignment, got ${box.height}`);
  assert.ok(box.width > 100);
});

/* ============================================================================
 * 6. Extracción de características cinemáticas, geométricas e intersecciones
 * ============================================================================ */

test('características cinemáticas y geométricas: velocidad, curvatura, autointersección y relaciones', () => {
  // Línea recta a velocidad constante: 200 px en 0.4 s = 500 px/s
  const line = makeStroke('line1', makeLine(100, 200, 300, 200, 21, 0, 20));
  const fLine = extractStrokeFeatures(line);
  assert.ok(Math.abs(fLine.arcLength - 200) < 1e-3);
  assert.ok(fLine.straightness > 0.999);
  assert.ok(Math.abs(fLine.kinematics.velocity.mean - 500) < 1);
  assert.ok(fLine.geometry.meanAbsCurvature < 1e-4);

  // Círculo de radio 80 -> curvatura media ≈ 1/80 = 0.0125 rad/px
  const circle = makeStroke('circ1', makeCircle(500, 500, 80, 91));
  const fCirc = extractStrokeFeatures(circle);
  assert.ok(fCirc.isClosedLike);
  assert.ok(Math.abs(fCirc.geometry.meanAbsCurvature - (1 / 80)) < 0.002);

  // Autointersección en forma de lazo (8 / moño)
  const bowtie = [[100, 100], [200, 200], [200, 100], [100, 200]];
  const selfHits = findSelfIntersections(bowtie);
  assert.equal(selfHits.length, 1);
  assert.ok(Math.hypot(selfHits[0].x - 150, selfHits[0].y - 150) < 1e-6);

  // Intersección entre dos trazos (signo '+')
  const hBar = makeLine(100, 150, 200, 150, 10);
  const vBar = makeLine(150, 100, 150, 200, 10);
  const cross = findStrokeIntersections(hBar, vBar);
  assert.equal(cross.length, 1);
  assert.ok(Math.hypot(cross[0].x - 150, cross[0].y - 150) < 1e-6);
  assert.ok(minStrokeDistance(hBar, vBar) < 1e-6);
});

/* ============================================================================
 * 7. Detección de esquinas / vértices
 * ============================================================================ */

test('detección de vértices: cuadrado (3 internos + cierre), triángulo, L y círculo (0)', () => {
  // Trazo en L con 1 esquina interna clara
  const lShape = [
    ...makeLine(100, 100, 250, 100, 20, 0, 16),
    ...makeLine(250, 100, 250, 260, 20, 320, 16).slice(1)
  ];
  const lCorners = detectCorners(lShape, { angleThresholdDeg: 40 });
  assert.equal(lCorners.length, 1);
  assert.ok(Math.hypot(lCorners[0].point[0] - 250, lCorners[0].point[1] - 100) < 12);
  assert.ok(lCorners[0].angleDeg > 75 && lCorners[0].angleDeg < 105);

  // Cuadrado abierto en 4 lados -> 3 esquinas internas de ~90°
  const square = [
    ...makeLine(100, 100, 260, 100, 18, 0, 16),
    ...makeLine(260, 100, 260, 260, 18, 300, 16).slice(1),
    ...makeLine(260, 260, 100, 260, 18, 600, 16).slice(1),
    ...makeLine(100, 260, 100, 100, 18, 900, 16).slice(1)
  ];
  const sqCorners = detectCorners(square, { angleThresholdDeg: 45 });
  assert.equal(sqCorners.length, 3);

  // Círculo suave -> 0 esquinas agudas
  const smoothCircle = makeCircle(400, 400, 90, 90);
  const circCorners = detectCorners(smoothCircle, { angleThresholdDeg: 40 });
  assert.equal(circCorners.length, 0);
});

/* ============================================================================
 * 8. Detección y fusión de trazos repasados (overtracing)
 * ============================================================================ */

test('overtracing: detecta y fusiona trazo repasado, sin fusionar signo "="', () => {
  const pass1 = makeStroke('p1', makeLine(150, 400, 350, 400, 30, 0, 15));
  // Repaso de vuelta con leve desplazamiento vertical de 3 px
  const pass2 = makeStroke('p2', makeLine(348, 403, 152, 402, 30, 500, 15));
  // Línea paralela separada 28 px (como en un signo "=") -> NO es repaso
  const eqLower = makeStroke('eq2', makeLine(150, 428, 350, 428, 30, 1000, 15));

  const pairs = detectOvertracing([pass1, pass2, eqLower]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].idA, 'p1');
  assert.equal(pairs[0].idB, 'p2');
  assert.equal(pairs[0].reversed, true);

  const { mergedStrokes } = mergeOvertracedStrokes([pass1, pass2, eqLower]);
  assert.equal(mergedStrokes.length, 2);
  assert.deepEqual(mergedStrokes[0].dspMergedFromIds, ['p1', 'p2']);
  // La línea fusionada debe quedar centrada cerca de y ≈ 401.25
  const midY = mergedStrokes[0].pts[16][1];
  assert.ok(midY > 400.5 && midY < 402.5, `Expected merged centerline near 401.25, got ${midY}`);
});

test('overtracing antiparalelo (KI-101): orientación-agnóstico con ruido y sin mutar originales', () => {
  const fwd = deepFreeze(makeStroke('ov_fwd', makeLine(120, 600, 420, 600, 24, 100, 12)));
  const rev = deepFreeze(makeStroke('ov_rev', makeLine(418, 602, 122, 599, 24, 420, 12)));
  const snap = JSON.stringify([fwd, rev]);

  const pairs = detectOvertracing([fwd, rev]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].reversed, true);
  assert.ok(pairs[0].alignedMeanDist <= 4, `Expected small alignedMeanDist, got ${pairs[0].alignedMeanDist}`);

  const { mergedStrokes } = mergeOvertracedStrokes([fwd, rev]);
  assert.equal(mergedStrokes.length, 1);
  assert.equal(mergedStrokes[0].dspOvertraced, true);
  assert.deepEqual(mergedStrokes[0].dspMergedFromIds, ['ov_fwd', 'ov_rev']);
  assert.equal(JSON.stringify([fwd, rev]), snap);
});

/* ============================================================================
 * 9. Detección de puntos accidentales vs puntos intencionales (decimal / 'i')
 * ============================================================================ */

test('puntos accidentales: filtra toque aislado pero preserva punto decimal y punto de "i"', () => {
  // Dos trazos que simulan dígitos "3" y "5" a y=[200..260]
  const digitLeft = makeStroke('d3', makeLine(120, 200, 145, 260, 12, 0, 16));
  const decimalDot = makeStroke('dot_dec', [[158, 258, 0.5, 250], [160, 259, 0.5, 266]]);
  const digitRight = makeStroke('d5', makeLine(174, 200, 200, 260, 12, 350, 16));

  // Letra "i": tallo vertical + punto arriba
  const stemI = makeStroke('stem_i', makeLine(320, 220, 320, 260, 10, 800, 16));
  const dotI = makeStroke('dot_i', [[320, 205, 0.5, 1000], [321, 206, 0.5, 1016]]);

  // Toque accidental completamente aislado lejos de toda tinta
  const accidental = makeStroke('acc_tap', [[780, 950, 0.2, 1500]]);

  const res = detectAccidentalDots([digitLeft, decimalDot, digitRight, stemI, dotI, accidental]);
  const byId = Object.fromEntries(res.map(r => [r.id, r]));

  assert.equal(byId.d3.isAccidental, false);
  assert.equal(byId.dot_dec.isAccidental, false);
  assert.equal(byId.dot_dec.contextualRole, 'decimal-point');

  assert.equal(byId.dot_i.isAccidental, false);
  assert.equal(byId.dot_i.contextualRole, 'diacritic-dot');

  assert.equal(byId.acc_tap.isAccidental, true);
  assert.equal(byId.acc_tap.contextualRole, 'accidental-tap');
});

/* ============================================================================
 * 10. Agrupación temporal-espacial y benchmark de latencia del pipeline completo
 * ============================================================================ */

test('agrupación temporal-espacial separa expresiones y figuras independientes', () => {
  // Grupo 1: signo "+" en (120..160, 120..160) en t=0..400ms
  const plusH = makeStroke('plus_h', makeLine(120, 140, 160, 140, 10, 0, 15));
  const plusV = makeStroke('plus_v', makeLine(140, 120, 140, 160, 10, 180, 15));

  // Grupo 2: signo "=" en (260..310, 130..150) tras pausa de 2.5s
  const eqTop = makeStroke('eq_t', makeLine(260, 132, 310, 132, 10, 2700, 15));
  const eqBot = makeStroke('eq_b', makeLine(260, 148, 310, 148, 10, 2900, 15));

  // Grupo 3: triángulo grande en la mitad inferior (400..620, 600..780)
  const tri1 = makeStroke('tri1', makeLine(400, 780, 620, 780, 20, 5000, 15));
  const tri2 = makeStroke('tri2', makeLine(620, 780, 510, 600, 20, 5400, 15));
  const tri3 = makeStroke('tri3', makeLine(510, 600, 400, 780, 20, 5800, 15));

  const groups = groupStrokes([plusH, plusV, eqTop, eqBot, tri1, tri2, tri3]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].strokeIds, ['plus_h', 'plus_v']);
  assert.deepEqual(groups[1].strokeIds, ['eq_t', 'eq_b']);
  assert.deepEqual(groups[2].strokeIds, ['tri1', 'tri2', 'tri3']);
  assert.equal(groups[2].kindHint, 'figure-or-diagram');
});

test('benchmark de latencia: pipeline completo processStrokes sobre página realista de 25 trazos', () => {
  const strokes = [];
  let t = 0;
  for (let i = 0; i < 25; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x0 = 80 + col * 170;
    const y0 = 100 + row * 220;
    const pts = i % 3 === 0
      ? makeCircle(x0 + 40, y0 + 40, 35, 50, t, 12)
      : makeLine(x0, y0, x0 + 90, y0 + 50, 45, t, 12);
    strokes.push(makeStroke(`s_${i}`, pts));
    t += 800;
  }

  const out = processStrokes(strokes, { mergeOvertrace: false, filterAccidentalDots: false });
  const totalPts = strokes.reduce((acc, s) => acc + s.pts.length, 0);

  console.log(`[BENCH Pipeline 25 strokes / ${totalPts} pts] timingMs=${out.timingMs.toFixed(2)}ms | groups=${out.groups.length} | pairwise=${out.features.pairwise.distances.length}`);

  assert.equal(out.original.length, 25);
  assert.equal(out.processed.length, 25);
  assert.equal(out.features.perStroke.length, 25);
  assert.ok(out.groups.length >= 5);
  assert.ok(out.timingMs < 250, `Expected pipeline < 250ms, took ${out.timingMs.toFixed(2)}ms`);
});
