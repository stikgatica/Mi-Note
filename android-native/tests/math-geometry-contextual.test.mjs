import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXCLUDED_AUTO_SHAPES,
  computePCA,
  fitLineTLS,
  fitLineRANSAC,
  fitCircleKasa,
  fitCircleTaubin,
  fitCircleRobust,
  fitEllipse,
  detectVertices,
  angleBetweenVectors,
  areParallel,
  arePerpendicular,
  analyzeLinePairRelation,
  analyzeSymmetry,
  classifyPolygon,
  recognizeGeometry,
  recognizeContextualElements
} from '../src/math/math-geometry-contextual.mjs';

const mkStroke = (id, pts) => ({ id, color: '#000000', width: 2.5, pts: pts.map((p) => [p[0], p[1], 0.5]) });

function sampleLine(a, b, n = 20, wobble = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const off = wobble * Math.sin(Math.PI * t * 2);
    return [a[0] + dx * t + px * off, a[1] + dy * t + py * off];
  });
}

function samplePolygon(vertices, nPerEdge = 16, wobble = 0) {
  const pts = [];
  for (let i = 0; i < vertices.length; i++) {
    const seg = sampleLine(vertices[i], vertices[(i + 1) % vertices.length], nPerEdge, wobble);
    pts.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return pts;
}

function sampleCircle(cx, cy, r, n = 60, start = 0, end = Math.PI * 2, noise = 0) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const ang = start + (end - start) * t;
    const dr = noise * Math.sin(i * 3.7);
    return [cx + (r + dr) * Math.cos(ang), cy + (r + dr) * Math.sin(ang)];
  });
}

function sampleEllipse(cx, cy, rx, ry, rotRad = 0, n = 64) {
  const cos = Math.cos(rotRad), sin = Math.sin(rotRad);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const lx = rx * Math.cos(a), ly = ry * Math.sin(a);
    return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
  });
}

test('PCA, ajuste de recta TLS y resistencia RANSAC a outliers', () => {
  const pts = sampleLine([100, 200], [400, 260], 24);
  const pca = computePCA(pts);
  assert.ok(pca);
  assert.ok(Math.abs(pca.angleDeg - Math.atan2(60, 300) * 180 / Math.PI) < 2);

  const tls = fitLineTLS(pts);
  assert.ok(tls);
  assert.ok(tls.rms < 1);

  // Inyectar 3 outliers severos; RANSAC debe mantener la recta real
  const noisy = pts.slice();
  noisy[5] = [160, 420];
  noisy[12] = [250, 40];
  noisy[18] = [330, 490];
  const ransac = fitLineRANSAC(noisy);
  assert.ok(ransac);
  assert.ok(ransac.inlierRatio >= 0.8);
  assert.ok(Math.abs(ransac.angleDeg - tls.angleDeg) < 4);
});

test('Ajuste de círculo Kasa, Taubin y RANSAC resistente a outliers + elipse', () => {
  const circ = sampleCircle(300, 400, 110, 60, 0, Math.PI * 2, 1.5);
  const kasa = fitCircleKasa(circ);
  const taubin = fitCircleTaubin(circ);
  assert.ok(kasa && taubin);
  assert.ok(Math.abs(kasa.cx - 300) < 3 && Math.abs(kasa.cy - 400) < 3 && Math.abs(kasa.r - 110) < 3);
  assert.ok(Math.abs(taubin.cx - 300) < 3 && Math.abs(taubin.cy - 400) < 3 && Math.abs(taubin.r - 110) < 3);

  const withOutliers = circ.slice();
  withOutliers[10] = [560, 650];
  withOutliers[30] = [40, 120];
  const robust = fitCircleRobust(withOutliers);
  assert.ok(robust);
  assert.ok(Math.abs(robust.r - 110) < 6);
  assert.ok(robust.inlierRatio > 0.9);

  const ell = sampleEllipse(450, 500, 160, 80, 0.35, 72);
  const eFit = fitEllipse(ell);
  assert.ok(eFit);
  assert.ok(Math.abs(eFit.rx - 160) < 8 && Math.abs(eFit.ry - 80) < 8);
  assert.ok(eFit.axisRatio > 1.8 && eFit.axisRatio < 2.2);
});

test('Paralelismo, perpendicularidad, ángulos y simetría', () => {
  assert.equal(areParallel([[100, 100], [300, 100]], [[100, 220], [300, 225]]), true);
  assert.equal(arePerpendicular([[100, 100], [300, 100]], [[200, 50], [200, 250]]), true);
  assert.ok(Math.abs(angleBetweenVectors([1, 0], [0, 1]) - 90) < 1e-6);

  const rel = analyzeLinePairRelation([[100, 200], [400, 200]], [[250, 100], [250, 350]]);
  assert.equal(rel.perpendicular, true);
  assert.equal(rel.intersectsOnSegments, true);

  const squareVerts = [[100, 100], [260, 100], [260, 260], [100, 260]];
  const sym = analyzeSymmetry(squareVerts);
  assert.ok(sym.reflectionAxes.length >= 4);
  assert.ok(sym.rotationalOrders.includes(4));
});

test('Reconocimiento de segmento, semirrecta, recta, paralelas, perpendiculares y ángulo', () => {
  const seg = recognizeGeometry([mkStroke('s1', sampleLine([100, 150], [380, 155], 20, 2))]);
  assert.equal(seg?.primary.shape, 'segment');

  // Semirrecta (eje + 2 barbas en extremo derecho)
  const ray = recognizeGeometry([
    mkStroke('shaft', sampleLine([100, 300], [350, 300], 20)),
    mkStroke('b1', sampleLine([350, 300], [326, 284], 8)),
    mkStroke('b2', sampleLine([350, 300], [326, 316], 8))
  ]);
  assert.equal(ray?.primary.shape, 'ray');

  // Recta (flechas en ambos extremos)
  const line = recognizeGeometry([
    mkStroke('shaft', sampleLine([100, 300], [380, 300], 20)),
    mkStroke('r1', sampleLine([380, 300], [356, 284], 8)),
    mkStroke('r2', sampleLine([380, 300], [356, 316], 8)),
    mkStroke('l1', sampleLine([100, 300], [124, 284], 8)),
    mkStroke('l2', sampleLine([100, 300], [124, 316], 8))
  ]);
  assert.equal(line?.primary.shape, 'line');

  // Rectas paralelas
  const par = recognizeGeometry([
    mkStroke('p1', sampleLine([100, 200], [360, 200], 18)),
    mkStroke('p2', sampleLine([100, 290], [360, 292], 18))
  ]);
  assert.equal(par?.primary.shape, 'parallel_lines');

  // Rectas perpendiculares
  const perp = recognizeGeometry([
    mkStroke('q1', sampleLine([100, 300], [360, 300], 18)),
    mkStroke('q2', sampleLine([230, 180], [230, 420], 18))
  ]);
  assert.equal(perp?.primary.shape, 'perpendicular_lines');

  // Ángulo de dos trazos compartiendo vértice
  const ang = recognizeGeometry([
    mkStroke('a1', sampleLine([200, 400], [380, 400], 18)),
    mkStroke('a2', sampleLine([202, 398], [320, 260], 18))
  ]);
  assert.equal(ang?.primary.shape, 'angle');
  assert.ok(ang.primary.geometry.angleDeg > 40 && ang.primary.geometry.angleDeg < 60);

  // KI-101: Dos trazos antiparalelos colineales superpuestos (~0° / ~180°) NUNCA son 'angle'
  const overtracedLine = recognizeGeometry([
    mkStroke('ov1', sampleLine([140, 500], [440, 500], 18, 1.0)),
    mkStroke('ov2', sampleLine([438, 502], [142, 499], 18, 1.2))
  ]);
  assert.ok(overtracedLine);
  assert.equal(overtracedLine.primary.shape, 'line');
  assert.notEqual(overtracedLine.primary.shape, 'angle');
  assert.equal(overtracedLine.candidates.some((c) => c.shape === 'angle'), false);
});

test('Reconocimiento de triángulo, cuadrado, rectángulo, rombo, paralelogramo, pentágono, círculo, elipse y arco', () => {
  const tri = recognizeGeometry([mkStroke('t', samplePolygon([[200, 120], [100, 300], [300, 300]], 16, 2))]);
  assert.equal(tri?.primary.shape, 'triangle');

  const sq = recognizeGeometry([mkStroke('sq', samplePolygon([[100, 100], [260, 100], [260, 260], [100, 260]], 16, 1.5))]);
  assert.equal(sq?.primary.shape, 'square');

  const rect = recognizeGeometry([mkStroke('rc', samplePolygon([[100, 100], [360, 100], [360, 240], [100, 240]], 16, 1.5))]);
  assert.equal(rect?.primary.shape, 'rectangle');

  const rhomb = recognizeGeometry([mkStroke('rh', samplePolygon([[250, 100], [340, 220], [250, 340], [160, 220]], 16, 1.5))]);
  assert.equal(rhomb?.primary.shape, 'rhombus');

  const para = recognizeGeometry([mkStroke('pa', samplePolygon([[160, 120], [380, 120], [320, 260], [100, 260]], 16, 1.5))]);
  assert.equal(para?.primary.shape, 'parallelogram');

  const pentVerts = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    return [300 + 110 * Math.cos(a), 300 + 110 * Math.sin(a)];
  });
  const pent = recognizeGeometry([mkStroke('pe', samplePolygon(pentVerts, 14, 1))]);
  assert.equal(pent?.primary.shape, 'polygon');
  assert.equal(pent?.primary.geometry.points.length, 5);

  const cir = recognizeGeometry([mkStroke('ci', sampleCircle(350, 350, 100, 64))]);
  assert.equal(cir?.primary.shape, 'circle');

  const ell = recognizeGeometry([mkStroke('el', sampleEllipse(350, 350, 160, 75, 0.2, 64))]);
  assert.equal(ell?.primary.shape, 'ellipse');

  const arc = recognizeGeometry([mkStroke('ar', sampleCircle(350, 350, 120, 40, 0, Math.PI * 0.75))]);
  assert.equal(arc?.primary.shape, 'arc');
});

test('REGLA ESTRICTA (NEGATIVA): trapecio NUNCA se auto-clasifica como trapezoid', () => {
  assert.ok(EXCLUDED_AUTO_SHAPES.includes('trapezoid'));

  // Trapecio isósceles (solo un par de lados paralelos: base superior e inferior)
  const trapVerts = [[180, 150], [320, 150], [400, 310], [100, 310]];
  const cls = classifyPolygon(trapVerts);
  assert.notEqual(cls?.shape, 'trapezoid');
  assert.equal(cls?.shape, 'polygon');
  assert.equal(cls.alternatives.some((a) => a.shape === 'trapezoid'), false);

  const rec = recognizeGeometry([mkStroke('trap', samplePolygon(trapVerts, 16, 1))]);
  assert.ok(rec);
  assert.notEqual(rec.primary.shape, 'trapezoid');
  assert.equal(rec.primary.shape, 'polygon');
  assert.equal(rec.candidates.some((c) => c.shape === 'trapezoid'), false);

  // Trapecio rectángulo
  const rightTrap = [[120, 150], [280, 150], [380, 310], [120, 310]];
  const rec2 = recognizeGeometry([mkStroke('rtrap', samplePolygon(rightTrap, 16, 1))]);
  assert.ok(rec2);
  assert.notEqual(rec2.primary.shape, 'trapezoid');
  assert.equal(rec2.candidates.some((c) => c.shape === 'trapezoid'), false);
});

test('REGLA ESTRICTA: rectángulo NUNCA se aplasta en cuadrado y preserva proporciones y trazos inmutables', () => {
  // Rectángulo moderadamente alargado (240x185, ratio ~1.30) y rectángulo claro (300x150)
  const rectVerts = [[120, 180], [360, 180], [360, 365], [120, 365]];
  const stroke = mkStroke('rect_prop', samplePolygon(rectVerts, 18, 1.5));
  const snapshot = JSON.stringify(stroke);

  const res = recognizeGeometry([stroke]);
  assert.ok(res);
  assert.equal(res.primary.shape, 'rectangle');
  assert.equal(res.immutable, true);
  // Verificar que los trazos fuente no fueron mutados
  assert.equal(JSON.stringify(stroke), snapshot);

  // Verificar preservación de proporciones (ancho ~240, alto ~185)
  const pts = res.primary.geometry.points;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const fittedW = Math.max(...xs) - Math.min(...xs);
  const fittedH = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(fittedW - 240) < 12, `width distorted: ${fittedW}`);
  assert.ok(Math.abs(fittedH - 185) < 12, `height distorted: ${fittedH}`);
  assert.ok(fittedW / fittedH > 1.2, 'rectangle was squashed toward square');
});

test('Figuras 3D wireframe: cubo, prisma, cilindro y pirámide', () => {
  // Cubo: dos caras cuadradas + 4 conectores
  const frontSq = [[150, 220], [290, 220], [290, 360], [150, 360]];
  const backSq = [[210, 160], [350, 160], [350, 300], [210, 300]];
  const cube = recognizeGeometry([
    mkStroke('f', samplePolygon(frontSq, 14)),
    mkStroke('b', samplePolygon(backSq, 14)),
    mkStroke('c1', sampleLine(frontSq[0], backSq[0], 10)),
    mkStroke('c2', sampleLine(frontSq[1], backSq[1], 10)),
    mkStroke('c3', sampleLine(frontSq[2], backSq[2], 10)),
    mkStroke('c4', sampleLine(frontSq[3], backSq[3], 10))
  ]);
  assert.equal(cube?.primary.shape, 'cube');

  // Cilindro: 2 elipses + 2 generatrices
  const cyl = recognizeGeometry([
    mkStroke('top', sampleEllipse(300, 180, 90, 30, 0, 50)),
    mkStroke('bot', sampleEllipse(300, 420, 90, 30, 0, 50)),
    mkStroke('s1', sampleLine([210, 180], [210, 420], 16)),
    mkStroke('s2', sampleLine([390, 180], [390, 420], 16))
  ]);
  assert.equal(cyl?.primary.shape, 'cylinder');

  // Pirámide: base + 4 aristas al ápice
  const base = [[180, 420], [360, 420], [410, 360], [230, 360]];
  const apex = [295, 160];
  const pyr = recognizeGeometry([
    mkStroke('base', samplePolygon(base, 14)),
    mkStroke('e1', sampleLine(base[0], apex, 12)),
    mkStroke('e2', sampleLine(base[1], apex, 12)),
    mkStroke('e3', sampleLine(base[2], apex, 12)),
    mkStroke('e4', sampleLine(base[3], apex, 12))
  ]);
  assert.equal(pyr?.primary.shape, 'pyramid');
});

test('Elementos internos contextuales en circunferencia: radio, diámetro, cuerda y etiqueta adjunta', () => {
  const circle = { kind: 'circle', cx: 300, cy: 300, r: 120 };
  const added = [
    mkStroke('rad', sampleLine([300, 300], [420, 300], 14)),
    mkStroke('dia', sampleLine([300, 180], [300, 420], 18)),
    mkStroke('chd', sampleLine([215, 215], [385, 215], 16)),
    mkStroke('lbl', sampleLine([355, 285], [372, 285], 6))
  ];
  const ctx = recognizeContextualElements(circle, added, { readingsByStrokeId: { lbl: '5 cm' } });
  const kinds = ctx.elements.map((e) => e.kind);
  assert.ok(kinds.includes('radius'));
  assert.ok(kinds.includes('diameter'));
  assert.ok(kinds.includes('chord'));
  assert.equal(ctx.attachedLabels.length, 1);
  assert.equal(ctx.attachedLabels[0].writtenText, '5 cm');
});

test('Elementos internos contextuales en triángulo y polígono: altura, marca de ángulo recto, mediana, diagonal, congruencia y línea auxiliar', () => {
  // Triángulo escaleno con vértice superior en (220, 120) y base horizontal (100, 360)-(420, 360)
  const tri = { kind: 'triangle', points: [[220, 120], [100, 360], [420, 360]] };
  const altitudeStroke = mkStroke('alt', sampleLine([220, 120], [220, 360], 18));
  const rightMark = mkStroke('rm', [...sampleLine([220, 342], [238, 342], 6), ...sampleLine([238, 342], [238, 360], 6).slice(1)]);
  const medianStroke = mkStroke('med', sampleLine([220, 120], [260, 360], 18));
  const ctxTri = recognizeContextualElements(tri, [altitudeStroke, rightMark, medianStroke]);
  assert.ok(ctxTri.elements.some((e) => e.kind === 'altitude'));
  assert.ok(ctxTri.elements.some((e) => e.kind === 'right_angle_mark'));
  assert.ok(ctxTri.elements.some((e) => e.kind === 'median'));

  // Rectángulo con diagonal, marcas de congruencia y línea auxiliar punteada
  const rect = { kind: 'rectangle', points: [[100, 100], [340, 100], [340, 260], [100, 260]] };
  const diagStroke = mkStroke('dg', sampleLine([100, 100], [340, 260], 18));
  const tick1 = mkStroke('tk1', sampleLine([216, 92], [216, 108], 6));
  const tick2 = mkStroke('tk2', sampleLine([224, 92], [224, 108], 6));
  const dashes = [
    mkStroke('d1', sampleLine([355, 100], [375, 100], 6)),
    mkStroke('d2', sampleLine([390, 100], [410, 100], 6)),
    mkStroke('d3', sampleLine([425, 100], [445, 100], 6))
  ];
  const ctxRect = recognizeContextualElements(rect, [diagStroke, tick1, tick2, ...dashes]);
  assert.ok(ctxRect.elements.some((e) => e.kind === 'diagonal'));
  assert.ok(ctxRect.elements.some((e) => e.kind === 'congruence_ticks' && e.tickCount === 2));
  assert.ok(ctxRect.elements.some((e) => e.kind === 'auxiliary_line' && e.style === 'dashed'));
});

test('Elementos contextuales sobre ángulo: bisectriz y ángulo desde extremo compartido', () => {
  const baseSeg = { kind: 'segment', points: [[150, 350], [380, 350]] };
  const addedArm = mkStroke('arm2', sampleLine([150, 350], [290, 210], 16));
  const ctxSeg = recognizeContextualElements(baseSeg, [addedArm]);
  assert.ok(ctxSeg.elements.some((e) => e.kind === 'angle'));

  const baseAngle = {
    kind: 'angle',
    vertex: [150, 350],
    arms: [[[150, 350], [350, 350]], [[150, 350], [150, 150]]],
    angleDeg: 90
  };
  const bisectorStroke = mkStroke('bis', sampleLine([150, 350], [290, 210], 16));
  const ctxAng = recognizeContextualElements(baseAngle, [bisectorStroke]);
  assert.ok(ctxAng.elements.some((e) => e.kind === 'angle_bisector'));
});
