import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recognizeTable,
  recognizeBarChart,
  recognizeHistogram,
  recognizeLineChart,
  recognizePieChart,
  recognizeDotPlot,
  recognizeStemAndLeaf,
  recognizeBoxPlot,
  recognizeProbabilityTree,
  recognizeNumberLine,
  recognizeCartesianPlane,
  recognizeDataStructure,
  toEditableStructure
} from '../src/math/math-data-charts.mjs';

const mkStroke = (id, pts) => ({ id, color: '#000000', width: 2.5, pts: pts.map((p) => [p[0], p[1], 0.5]) });

function sampleLine(a, b, n = 16) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
}

function sampleRect(x, y, w, h) {
  const v = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const seg = sampleLine(v[i], v[(i + 1) % 4], 12);
    pts.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return pts;
}

function sampleCircle(cx, cy, r, n = 56) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

function sampleDot(cx, cy, r = 4) {
  return sampleCircle(cx, cy, r, 10);
}

test('Tabla y tabla de frecuencias: conserva solo celdas escritas y jamás inventa valores', () => {
  // Grilla 3x3 (4 líneas horizontales + 4 líneas verticales)
  const strokes = [
    mkStroke('h0', sampleLine([100, 100], [460, 100])),
    mkStroke('h1', sampleLine([100, 170], [460, 170])),
    mkStroke('h2', sampleLine([100, 240], [460, 240])),
    mkStroke('h3', sampleLine([100, 310], [460, 310])),
    mkStroke('v0', sampleLine([100, 100], [100, 310])),
    mkStroke('v1', sampleLine([220, 100], [220, 310])),
    mkStroke('v2', sampleLine([340, 100], [340, 310])),
    mkStroke('v3', sampleLine([460, 100], [460, 310]))
  ];
  const snapshot = JSON.stringify(strokes);

  // Sin etiquetas: tabla simple con todas las celdas en null (NUNCA inventadas)
  const plain = recognizeTable(strokes);
  assert.ok(plain);
  assert.equal(plain.kind, 'table');
  assert.equal(plain.rows, 3);
  assert.equal(plain.cols, 3);
  assert.equal(plain.isFrequencyTable, false);
  for (const row of plain.cells) {
    for (const cell of row) {
      assert.equal(cell.writtenText, null);
    }
  }
  assert.equal(JSON.stringify(strokes), snapshot);

  // Con encabezados escritos de frecuencia
  const freq = recognizeTable(strokes, {
    labels: [
      { text: 'Dato', center: [160, 135] },
      { text: 'fi', center: [280, 135] },
      { text: 'fr', center: [400, 135] },
      { text: 'A', center: [160, 205] },
      { text: '4', center: [280, 205] }
      // Celda (1, 2) deliberadamente vacía: debe quedar null
    ]
  });
  assert.equal(freq?.kind, 'frequency_table');
  assert.equal(freq.isFrequencyTable, true);
  assert.equal(freq.cells[1][0].writtenText, 'A');
  assert.equal(freq.cells[1][1].writtenText, '4');
  assert.equal(freq.cells[1][2].writtenText, null);

  const editable = toEditableStructure(freq);
  assert.equal(editable.data[1][1].value, '4');
  assert.equal(editable.data[1][2].value, null);
});

test('Gráfico de barras (separadas) vs Histograma (contiguas) sin inventar escalas ni valores', () => {
  const axes = [
    mkStroke('y', sampleLine([120, 120], [120, 420])),
    mkStroke('x', sampleLine([120, 420], [520, 420]))
  ];

  // Barras con separación clara
  const barStrokes = [
    ...axes,
    mkStroke('b1', sampleRect(150, 280, 50, 140)),
    mkStroke('b2', sampleRect(240, 200, 50, 220)),
    mkStroke('b3', sampleRect(330, 320, 50, 100))
  ];
  const barRes = recognizeBarChart(barStrokes, {
    labels: [{ text: 'Ene', center: [175, 438] }]
  });
  assert.ok(barRes);
  assert.equal(barRes.kind, 'bar_chart');
  assert.equal(barRes.bars.length, 3);
  assert.equal(barRes.axes.scale, null);
  assert.equal(barRes.bars[0].writtenCategory, 'Ene');
  assert.equal(barRes.bars[1].writtenCategory, null);
  assert.equal(barRes.bars[1].writtenValue, null);
  assert.equal(recognizeHistogram(barStrokes), null);

  // Histograma con barras contiguas (brecha 0)
  const histStrokes = [
    ...axes,
    mkStroke('h1', sampleRect(140, 300, 70, 120)),
    mkStroke('h2', sampleRect(210, 210, 70, 210)),
    mkStroke('h3', sampleRect(280, 260, 70, 160))
  ];
  const histRes = recognizeHistogram(histStrokes);
  assert.ok(histRes);
  assert.equal(histRes.kind, 'histogram');
  assert.equal(histRes.bins.length, 3);
  assert.equal(histRes.axes.scale, null);
  assert.equal(recognizeBarChart(histStrokes), null);
});

test('Gráfico de líneas sobre ejes en L', () => {
  const poly = [
    ...sampleLine([150, 360], [240, 280], 10),
    ...sampleLine([240, 280], [340, 310], 10).slice(1),
    ...sampleLine([340, 310], [450, 180], 10).slice(1)
  ];
  const strokes = [
    mkStroke('y', sampleLine([120, 120], [120, 420])),
    mkStroke('x', sampleLine([120, 420], [520, 420])),
    mkStroke('line', poly)
  ];
  const res = recognizeLineChart(strokes);
  assert.ok(res);
  assert.equal(res.kind, 'line_chart');
  assert.equal(res.series.length, 1);
  assert.ok(res.series[0].points.length >= 4);
  assert.equal(res.axes.scale, null);
});

test('Gráfico circular (pie chart) con proporciones geométricas y etiquetas solo si existen', () => {
  const strokes = [
    mkStroke('c', sampleCircle(300, 300, 120, 64)),
    mkStroke('r1', sampleLine([300, 300], [420, 300])),
    mkStroke('r2', sampleLine([300, 300], [300, 180])),
    mkStroke('r3', sampleLine([300, 300], [180, 300]))
  ];
  const res = recognizePieChart(strokes, {
    labels: [{ text: '50%', center: [300, 360] }]
  });
  assert.ok(res);
  assert.equal(res.kind, 'pie_chart');
  assert.equal(res.sectors.length, 3);
  const sumFrac = res.sectors.reduce((s, sec) => s + sec.geometry.fraction, 0);
  assert.ok(Math.abs(sumFrac - 1) < 0.02);
  assert.ok(res.sectors.some((s) => s.writtenLabel === '50%'));
  assert.ok(res.sectors.some((s) => s.writtenLabel === null));
});

test('Gráfico de puntos (dot plot) con conteo fiel de puntos apilados', () => {
  const strokes = [
    mkStroke('base', sampleLine([100, 400], [480, 400])),
    mkStroke('d1', sampleDot(160, 375)),
    mkStroke('d2', sampleDot(160, 350)),
    mkStroke('d3', sampleDot(260, 375)),
    mkStroke('d4', sampleDot(260, 350)),
    mkStroke('d5', sampleDot(260, 325)),
    mkStroke('d6', sampleDot(360, 375))
  ];
  const res = recognizeDotPlot(strokes, {
    labels: [{ text: '2', center: [260, 418] }]
  });
  assert.ok(res);
  assert.equal(res.kind, 'dot_plot');
  assert.equal(res.columns.length, 3);
  assert.deepEqual(res.columns.map((c) => c.dotCount), [2, 3, 1]);
  assert.equal(res.columns[0].writtenLabel, null);
  assert.equal(res.columns[1].writtenLabel, '2');
});

test('Diagrama de tallo y hojas (stem-and-leaf)', () => {
  const strokes = [mkStroke('div', sampleLine([250, 120], [250, 360]))];
  const labels = [
    { text: '1', center: [220, 160] },
    { text: '2', center: [280, 160] },
    { text: '5', center: [310, 160] },
    { text: '2', center: [220, 220] },
    { text: '0', center: [280, 220] },
    { text: '3', center: [310, 220] },
    { text: '8', center: [340, 220] }
  ];
  const res = recognizeStemAndLeaf(strokes, { labels });
  assert.ok(res);
  assert.equal(res.kind, 'stem_and_leaf');
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].writtenStem, '1');
  assert.deepEqual(res.rows[0].writtenLeaves, ['2', '5']);
  assert.equal(res.rows[1].writtenStem, '2');
  assert.deepEqual(res.rows[1].writtenLeaves, ['0', '3', '8']);
});

test('Diagrama de caja y bigotes (box plot)', () => {
  const strokes = [
    mkStroke('box', sampleRect(220, 200, 160, 80)),
    mkStroke('med', sampleLine([290, 200], [290, 280])),
    mkStroke('wL', sampleLine([130, 240], [220, 240])),
    mkStroke('wR', sampleLine([380, 240], [470, 240]))
  ];
  const res = recognizeBoxPlot(strokes, {
    labels: [{ text: '50', center: [290, 300] }]
  });
  assert.ok(res);
  assert.equal(res.kind, 'box_plot');
  assert.equal(res.writtenSummary.median, '50');
  assert.equal(res.writtenSummary.min, null);
  assert.equal(res.writtenSummary.max, null);
});

test('Árbol de probabilidad multi-nivel', () => {
  const strokes = [
    mkStroke('b1', sampleLine([120, 260], [260, 180])),
    mkStroke('b2', sampleLine([120, 260], [260, 340])),
    mkStroke('b11', sampleLine([260, 180], [400, 130])),
    mkStroke('b12', sampleLine([260, 180], [400, 220]))
  ];
  const res = recognizeProbabilityTree(strokes, {
    labels: [
      { text: '1/2', center: [190, 215] },
      { text: 'Cara', center: [265, 175] }
    ]
  });
  assert.ok(res);
  assert.equal(res.kind, 'probability_tree');
  assert.equal(res.branches.length, 4);
  assert.ok(res.branches.some((b) => b.writtenProbability === '1/2'));
  assert.ok(res.branches.some((b) => b.writtenProbability === null));
});

test('Recta numérica y plano cartesiano sin inventar escalas', () => {
  const nlStrokes = [
    mkStroke('axis', sampleLine([100, 300], [500, 300])),
    mkStroke('t1', sampleLine([180, 288], [180, 312])),
    mkStroke('t2', sampleLine([280, 288], [280, 312])),
    mkStroke('t3', sampleLine([380, 288], [380, 312])),
    mkStroke('pt', sampleDot(330, 300))
  ];
  const nl = recognizeNumberLine(nlStrokes);
  assert.ok(nl);
  assert.equal(nl.kind, 'number_line');
  assert.equal(nl.ticks.length, 3);
  assert.equal(nl.plottedPoints.length, 1);
  assert.equal(nl.scale, null);
  assert.equal(nl.ticks.every((t) => t.writtenLabel === null), true);

  const cpStrokes = [
    mkStroke('x', sampleLine([100, 300], [500, 300])),
    mkStroke('y', sampleLine([300, 100], [300, 500])),
    mkStroke('tx1', sampleLine([350, 292], [350, 308])),
    mkStroke('tx2', sampleLine([400, 292], [400, 308])),
    mkStroke('p1', sampleDot(380, 220)),
    mkStroke('ref', sampleLine([180, 420], [420, 180]))
  ];
  const cp = recognizeCartesianPlane(cpStrokes);
  assert.ok(cp);
  assert.equal(cp.kind, 'cartesian_plane');
  assert.equal(cp.calibrated, false);
  assert.equal(cp.scale, null);
  assert.equal(cp.xAxis.ticks.length, 2);
  assert.equal(cp.plottedPoints.length, 1);
  assert.equal(cp.referenceLines.length, 1);

  // Despachador unificado entrega editableModel inmutable
  const unified = recognizeDataStructure(cpStrokes);
  assert.equal(unified?.primary.kind, 'cartesian_plane');
  assert.equal(unified?.strictDataPreservation, true);
  assert.equal(unified?.editableModel.kind, 'cartesian_plane');
  assert.equal(unified?.editableModel.scale, null);
});
