/* Reconocimiento estructural de datos, tablas y gráficos para Mi Note Professional.
 * Módulo ES puro, cero dependencias externas, 100% inmutable sobre trazos de entrada.
 * Regla estricta de preservación de datos:
 *  - Conservar ÚNICAMENTE datos efectivamente escritos (ink + tokens/etiquetas provistas).
 *  - NUNCA inventar valores numéricos, escalas, encabezados ni etiquetas faltantes. */

import {
  extractPoints,
  boundingBox,
  fitLineRANSAC,
  fitCircleRobust,
  detectVertices,
  areParallel,
  arePerpendicular,
  pointToSegmentDistance,
  pointToLineDistance
} from './math-geometry-contextual.mjs';

export const DATA_STRUCTURE_LABELS = Object.freeze({
  table: 'Tabla de datos',
  frequency_table: 'Tabla de frecuencias',
  bar_chart: 'Gráfico de barras',
  histogram: 'Histograma',
  line_chart: 'Gráfico de líneas',
  pie_chart: 'Gráfico circular',
  dot_plot: 'Gráfico de puntos',
  stem_and_leaf: 'Diagrama de tallo y hojas',
  box_plot: 'Diagrama de caja y bigotes',
  probability_tree: 'Árbol de probabilidad',
  number_line: 'Recta numérica',
  cartesian_plane: 'Plano cartesiano'
});

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const FREQUENCY_HEADER_RE = /^(?:f|fi|f_i|fr|f_r|F|Fi|F_i|frecuencia(?:\s+absoluta|\s+relativa|\s+acumulada)?|conteo|dato|datos|x|xi|x_i|marca|clase|intervalo|total|n|%)$/i;

function normalizeLabels(options = {}) {
  // options.labels: Array<{ id?, text, center?: [x,y], bounds?: {minX,maxX,minY,maxY}, strokeIds?: string[] }>
  const raw = Array.isArray(options.labels) ? options.labels : [];
  return raw
    .filter((l) => l && typeof l.text === 'string' && l.text.trim().length > 0)
    .map((l, idx) => {
      const bounds = l.bounds || (l.center
        ? { minX: l.center[0] - 8, maxX: l.center[0] + 8, minY: l.center[1] - 8, maxY: l.center[1] + 8 }
        : { minX: 0, maxX: 0, minY: 0, maxY: 0 });
      const center = l.center || [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
      return {
        id: l.id ?? `label_${idx}`,
        text: l.text.trim(),
        center: [Number(center[0]), Number(center[1])],
        bounds,
        strokeIds: Array.isArray(l.strokeIds) ? [...l.strokeIds] : []
      };
    });
}

function analyzeStroke(stroke, index) {
  const pts = extractPoints(stroke, 1.0);
  const bb = boundingBox(pts);
  const line = pts.length >= 2 ? fitLineRANSAC(pts) : null;
  const isStraight = Boolean(
    line &&
    line.length >= 10 &&
    line.p90Residual <= Math.max(6, line.length * 0.09) &&
    line.inlierRatio >= 0.78
  );
  const isHorizontal = isStraight && Math.abs(line.points[1][1] - line.points[0][1]) <= Math.max(8, line.length * 0.14);
  const isVertical = isStraight && Math.abs(line.points[1][0] - line.points[0][0]) <= Math.max(8, line.length * 0.14);
  const isDot = bb.diag <= 18 && pts.length >= 2 && (!isStraight || bb.diag <= 9 || Math.min(bb.width, bb.height) >= bb.diag * 0.35);
  return {
    index,
    id: stroke?.id ?? `s_${index}`,
    stroke,
    pts,
    bb,
    line: isStraight ? line : null,
    isStraight,
    isHorizontal,
    isVertical,
    isDot
  };
}

function cluster1D(values, tolerance) {
  if (!values.length) return [];
  const sorted = values.slice().sort((a, b) => a - b);
  const clusters = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    const mean = last.reduce((s, v) => s + v, 0) / last.length;
    if (Math.abs(sorted[i] - mean) <= tolerance) last.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  return clusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);
}

function lineIntersection2D(a1, a2, b1, b2) {
  const rx = a2[0] - a1[0], ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0], sy = b2[1] - b1[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < EPS) return null;
  const qpx = b1[0] - a1[0], qpy = b1[1] - a1[1];
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  return { point: [a1[0] + t * rx, a1[1] + t * ry], t, u };
}

function detectLShapedAxes(analyzed) {
  const horiz = analyzed.filter((a) => a.isHorizontal && a.line.length >= 70);
  const vert = analyzed.filter((a) => a.isVertical && a.line.length >= 70);
  if (!horiz.length || !vert.length) return null;
  // Buscar par (horizontal inferior, vertical izquierda) que se encuentren cerca de un extremo común (origen en L)
  let best = null;
  for (const h of horiz) {
    const hLeft = h.line.points[0][0] <= h.line.points[1][0] ? h.line.points[0] : h.line.points[1];
    const hRight = h.line.points[0][0] <= h.line.points[1][0] ? h.line.points[1] : h.line.points[0];
    for (const v of vert) {
      const vTop = v.line.points[0][1] <= v.line.points[1][1] ? v.line.points[0] : v.line.points[1];
      const vBot = v.line.points[0][1] <= v.line.points[1][1] ? v.line.points[1] : v.line.points[0];
      const cornerDist = dist(hLeft, vBot);
      const tol = Math.max(22, Math.min(h.line.length, v.line.length) * 0.16);
      if (cornerDist <= tol) {
        const score = h.line.length + v.line.length - cornerDist * 2;
        if (!best || score > best.score) {
          best = {
            score,
            xAxis: h,
            yAxis: v,
            origin: mid(hLeft, vBot),
            xRange: [hLeft[0], hRight[0]],
            yRange: [vTop[1], vBot[1]]
          };
        }
      }
    }
  }
  return best;
}

function extractRectanglesFromAnalyzed(analyzed, excludeIds) {
  const rects = [];
  const used = new Set(excludeIds);

  // 1. Rectángulos de un solo trazo cerrado
  for (const a of analyzed) {
    if (used.has(a.id) || a.isStraight || a.pts.length < 4) continue;
    const vRes = detectVertices(a.pts);
    if (vRes.closed && vRes.vertices.length === 4) {
      const bb = boundingBox(vRes.vertices);
      if (bb.width >= 10 && bb.height >= 10) {
        rects.push({
          bounds: bb,
          vertices: vRes.vertices,
          sourceStrokeIds: [a.id]
        });
        used.add(a.id);
      }
    }
  }

  // 2. Barras tipo U invertida (3 segmentos conectados en un trazo) apoyadas en eje X
  for (const a of analyzed) {
    if (used.has(a.id) || a.isStraight || a.pts.length < 4) continue;
    const vRes = detectVertices(a.pts);
    if (!vRes.closed && vRes.vertices.length === 4) {
      const [p0, p1, p2, p3] = vRes.vertices;
      const s0 = [p0, p1], s1 = [p1, p2], s2 = [p2, p3];
      if (areParallel(s0, s2, 14) && arePerpendicular(s0, s1, 14)) {
        const bb = boundingBox(vRes.vertices);
        if (bb.width >= 10 && bb.height >= 10) {
          rects.push({
            bounds: bb,
            vertices: vRes.vertices,
            sourceStrokeIds: [a.id]
          });
          used.add(a.id);
        }
      }
    }
  }

  return rects;
}

function nearestLabel(targetPoint, labels, maxDist) {
  let best = null, bestD = maxDist;
  for (const l of labels) {
    const d = dist(targetPoint, l.center);
    if (d <= bestD) { bestD = d; best = l; }
  }
  return best;
}

/* ============================================================================
 * 1. TABLAS Y TABLAS DE FRECUENCIAS
 * ============================================================================ */

export function recognizeTable(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 3) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);
  const allPts = analyzed.flatMap((a) => a.pts);
  const overallBB = boundingBox(allPts);

  const hLines = analyzed.filter((a) => a.isHorizontal && a.line.length >= Math.max(50, overallBB.width * 0.45));
  const vLines = analyzed.filter((a) => a.isVertical && a.line.length >= Math.max(40, overallBB.height * 0.45));
  if (hLines.length < 2 || vLines.length < 2) return null;

  // Verificar que realmente formen una grilla (al menos 2 horizontales y 2 verticales que se cruzan)
  let intersections = 0;
  for (const h of hLines) {
    for (const v of vLines) {
      const inter = lineIntersection2D(h.line.points[0], h.line.points[1], v.line.points[0], v.line.points[1]);
      if (inter && inter.t >= -0.12 && inter.t <= 1.12 && inter.u >= -0.12 && inter.u <= 1.12) {
        intersections++;
      }
    }
  }
  if (intersections < Math.min(4, hLines.length * vLines.length * 0.6)) return null;

  const rowYs = cluster1D(hLines.map((h) => h.line.center[1]), 14);
  const colXs = cluster1D(vLines.map((v) => v.line.center[0]), 14);
  if (rowYs.length < 2 || colXs.length < 2) return null;

  // Incluir bordes implícitos solo si hay contenido o si el cruce es interno (tabla abierta tipo cruz)
  const gridStrokeIds = new Set([...hLines.map((h) => h.id), ...vLines.map((v) => v.id)]);
  const contentStrokes = analyzed.filter((a) => !gridStrokeIds.has(a.id));

  // Construir límites de filas y columnas a partir de las líneas dibujadas
  const minX = Math.min(...hLines.map((h) => Math.min(h.line.points[0][0], h.line.points[1][0])));
  const maxX = Math.max(...hLines.map((h) => Math.max(h.line.points[0][0], h.line.points[1][0])));
  const minY = Math.min(...vLines.map((v) => Math.min(v.line.points[0][1], v.line.points[1][1])));
  const maxY = Math.max(...vLines.map((v) => Math.max(v.line.points[0][1], v.line.points[1][1])));

  const yEdges = rowYs.slice();
  if (yEdges[0] - minY > 18) yEdges.unshift(minY);
  if (maxY - yEdges[yEdges.length - 1] > 18) yEdges.push(maxY);

  const xEdges = colXs.slice();
  if (xEdges[0] - minX > 18) xEdges.unshift(minX);
  if (maxX - xEdges[xEdges.length - 1] > 18) xEdges.push(maxX);

  const rowCount = yEdges.length - 1;
  const colCount = xEdges.length - 1;
  if (rowCount < 2 || colCount < 2) return null;

  const cells = [];
  for (let r = 0; r < rowCount; r++) {
    const row = [];
    for (let c = 0; c < colCount; c++) {
      const cellBounds = { minX: xEdges[c], maxX: xEdges[c + 1], minY: yEdges[r], maxY: yEdges[r + 1] };
      const insideStrokes = contentStrokes.filter((s) => {
        const [cx, cy] = s.bb.center;
        return cx >= cellBounds.minX && cx <= cellBounds.maxX && cy >= cellBounds.minY && cy <= cellBounds.maxY;
      });
      const cellLabels = labels.filter((l) => {
        const [cx, cy] = l.center;
        return cx >= cellBounds.minX && cx <= cellBounds.maxX && cy >= cellBounds.minY && cy <= cellBounds.maxY;
      });
      // NUNCA inventar texto si no hay lectura escrita
      const writtenText = cellLabels.length ? cellLabels.map((l) => l.text).join(' ') : null;
      row.push({
        row: r,
        col: c,
        bounds: cellBounds,
        strokeIds: insideStrokes.map((s) => s.id),
        writtenText
      });
    }
    cells.push(row);
  }

  // Detectar si es tabla de frecuencias estrictamente por encabezados escritos en fila 0
  const headerTexts = cells[0].map((c) => c.writtenText).filter(Boolean);
  const freqMatches = headerTexts.filter((t) => FREQUENCY_HEADER_RE.test(t.trim()));
  const isFrequencyTable = freqMatches.length >= 2 || headerTexts.some((t) => /frecuencia|fi|fr|conteo/i.test(t));
  const kind = isFrequencyTable ? 'frequency_table' : 'table';

  return {
    kind,
    label: DATA_STRUCTURE_LABELS[kind],
    confidence: clamp(0.84 + Math.min(0.12, (rowCount + colCount) * 0.015), 0.78, 0.96),
    rows: rowCount,
    cols: colCount,
    rowBoundaries: yEdges,
    colBoundaries: xEdges,
    cells,
    isFrequencyTable,
    gridStrokeIds: [...gridStrokeIds],
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 2. GRÁFICO DE BARRAS E HISTOGRAMA
 * ============================================================================ */

function detectBarsAndAxes(strokes, options = {}) {
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);
  const axes = detectLShapedAxes(analyzed);
  if (!axes) return null;

  const excludeIds = new Set([axes.xAxis.id, axes.yAxis.id]);
  const rects = extractRectanglesFromAnalyzed(analyzed, excludeIds);
  if (rects.length < 2) return null;

  const xBaseY = axes.origin[1];
  const yTol = Math.max(22, (axes.yRange[1] - axes.yRange[0]) * 0.14);
  // Filtrar rectángulos apoyados en el eje X y dentro de la región del gráfico
  const bars = rects
    .filter((r) => Math.abs(r.bounds.maxY - xBaseY) <= yTol && r.bounds.minX >= axes.origin[0] - 18)
    .sort((a, b) => a.bounds.minX - b.bounds.minX);

  if (bars.length < 2) return null;

  // Medir brechas entre barras consecutivas para distinguir histograma (contiguas) de barras (separadas)
  const gaps = [];
  for (let i = 1; i < bars.length; i++) {
    gaps.push(bars[i].bounds.minX - bars[i - 1].bounds.maxX);
  }
  const avgWidth = bars.reduce((s, b) => s + b.bounds.width, 0) / bars.length;
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const contiguous = gaps.every((g) => g <= Math.max(8, avgWidth * 0.14));

  const items = bars.map((bar, i) => {
    const bottomCenter = [(bar.bounds.minX + bar.bounds.maxX) / 2, xBaseY + 18];
    const topCenter = [(bar.bounds.minX + bar.bounds.maxX) / 2, bar.bounds.minY - 14];
    const catLabel = nearestLabel(bottomCenter, labels, Math.max(36, bar.bounds.width * 0.9));
    const valLabel = nearestLabel(topCenter, labels, 32);
    return {
      index: i,
      bounds: bar.bounds,
      geometry: {
        width: bar.bounds.width,
        height: Math.max(0, xBaseY - bar.bounds.minY)
      },
      writtenCategory: catLabel ? catLabel.text : null,
      writtenValue: valLabel && valLabel !== catLabel ? valLabel.text : null,
      sourceStrokeIds: bar.sourceStrokeIds
    };
  });

  return {
    axes: {
      origin: axes.origin,
      xRange: axes.xRange,
      yRange: axes.yRange,
      xAxisStrokeId: axes.xAxis.id,
      yAxisStrokeId: axes.yAxis.id,
      scale: null // Nunca inventar escala
    },
    bars: items,
    contiguous,
    avgGap,
    avgWidth
  };
}

export function recognizeBarChart(strokes, options = {}) {
  const res = detectBarsAndAxes(strokes, options);
  if (!res || res.contiguous) return null;
  return {
    kind: 'bar_chart',
    label: DATA_STRUCTURE_LABELS.bar_chart,
    confidence: clamp(0.86 + Math.min(0.09, res.bars.length * 0.02), 0.8, 0.95),
    axes: res.axes,
    bars: res.bars,
    strictDataPreservation: true
  };
}

export function recognizeHistogram(strokes, options = {}) {
  const res = detectBarsAndAxes(strokes, options);
  if (!res || !res.contiguous) return null;
  return {
    kind: 'histogram',
    label: DATA_STRUCTURE_LABELS.histogram,
    confidence: clamp(0.87 + Math.min(0.08, res.bars.length * 0.02), 0.8, 0.95),
    axes: res.axes,
    bins: res.bars,
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 3. GRÁFICO DE LÍNEAS
 * ============================================================================ */

export function recognizeLineChart(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 3) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);
  const axes = detectLShapedAxes(analyzed);
  if (!axes) return null;

  const excludeIds = new Set([axes.xAxis.id, axes.yAxis.id]);
  const interior = analyzed.filter((a) => {
    if (excludeIds.has(a.id)) return false;
    return (
      a.bb.center[0] >= axes.origin[0] - 12 &&
      a.bb.center[0] <= axes.xRange[1] + 20 &&
      a.bb.center[1] >= axes.yRange[0] - 20 &&
      a.bb.center[1] <= axes.origin[1] + 12
    );
  });

  // Caso A: una sola polilínea no cerrada con >= 3 vértices monotónicos en X
  for (const a of interior) {
    if (a.isStraight || a.isDot || a.pts.length < 5) continue;
    const vRes = detectVertices(a.pts, { epsilon: Math.max(5, a.bb.diag * 0.04) });
    if (!vRes.closed && vRes.vertices.length >= 3) {
      const verts = vRes.vertices;
      let monotonic = true;
      for (let i = 1; i < verts.length; i++) {
        if (verts[i][0] <= verts[i - 1][0] - 6) { monotonic = false; break; }
      }
      if (monotonic) {
        const points = verts.map((pt, i) => {
          const lbl = nearestLabel(pt, labels, 28);
          return { index: i, position: pt, writtenLabel: lbl ? lbl.text : null };
        });
        return {
          kind: 'line_chart',
          label: DATA_STRUCTURE_LABELS.line_chart,
          confidence: 0.9,
          axes: { origin: axes.origin, xRange: axes.xRange, yRange: axes.yRange, scale: null },
          series: [{ points, sourceStrokeIds: [a.id] }],
          strictDataPreservation: true
        };
      }
    }
  }

  // Caso B: múltiples segmentos conectados progresando en X
  const segs = interior.filter((a) => a.isStraight && a.line.length >= 16);
  if (segs.length >= 2) {
    const ordered = segs
      .map((s) => {
        const [p0, p1] = s.line.points;
        return p0[0] <= p1[0] ? { a: p0, b: p1, id: s.id } : { a: p1, b: p0, id: s.id };
      })
      .sort((u, v) => u.a[0] - v.a[0]);
    let chainOk = true;
    const chainPts = [ordered[0].a, ordered[0].b];
    for (let i = 1; i < ordered.length; i++) {
      if (dist(ordered[i - 1].b, ordered[i].a) > 24) { chainOk = false; break; }
      chainPts.push(ordered[i].b);
    }
    if (chainOk) {
      return {
        kind: 'line_chart',
        label: DATA_STRUCTURE_LABELS.line_chart,
        confidence: 0.88,
        axes: { origin: axes.origin, xRange: axes.xRange, yRange: axes.yRange, scale: null },
        series: [{
          points: chainPts.map((pt, i) => ({
            index: i,
            position: pt,
            writtenLabel: nearestLabel(pt, labels, 28)?.text ?? null
          })),
          sourceStrokeIds: ordered.map((o) => o.id)
        }],
        strictDataPreservation: true
      };
    }
  }

  return null;
}

/* ============================================================================
 * 4. GRÁFICO CIRCULAR (PIE CHART)
 * ============================================================================ */

export function recognizePieChart(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 3) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);

  let circleStroke = null, circleFit = null;
  for (const a of analyzed) {
    if (a.isStraight || a.pts.length < 10) continue;
    const fit = fitCircleRobust(a.pts);
    if (fit && fit.r >= 30 && fit.angularCoverage >= 0.82 && fit.normalizedRms <= 0.14) {
      if (!circleFit || fit.r > circleFit.r) {
        circleFit = fit;
        circleStroke = a;
      }
    }
  }
  if (!circleFit) return null;

  const center = [circleFit.cx, circleFit.cy];
  const r = circleFit.r;
  const tol = Math.max(14, r * 0.22);
  const radialAngles = [];
  const radialStrokeIds = [];

  for (const a of analyzed) {
    if (a.id === circleStroke.id || !a.isStraight) continue;
    const [p0, p1] = a.line.points;
    const d0 = dist(p0, center), d1 = dist(p1, center);
    const onRim0 = Math.abs(d0 - r) <= tol;
    const onRim1 = Math.abs(d1 - r) <= tol;
    if (d0 <= tol && onRim1) {
      radialAngles.push(Math.atan2(p1[1] - center[1], p1[0] - center[0]));
      radialStrokeIds.push(a.id);
    } else if (d1 <= tol && onRim0) {
      radialAngles.push(Math.atan2(p0[1] - center[1], p0[0] - center[0]));
      radialStrokeIds.push(a.id);
    } else if (onRim0 && onRim1 && pointToSegmentDistance(center, p0, p1) <= tol) {
      // Un diámetro aporta dos radios opuestos
      radialAngles.push(Math.atan2(p0[1] - center[1], p0[0] - center[0]));
      radialAngles.push(Math.atan2(p1[1] - center[1], p1[0] - center[0]));
      radialStrokeIds.push(a.id);
    }
  }

  if (radialAngles.length < 2) return null;
  const sorted = radialAngles
    .map((ang) => ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))
    .sort((a, b) => a - b);

  // Deduplicar ángulos casi iguales
  const uniqueAngles = [];
  for (const ang of sorted) {
    if (!uniqueAngles.length || ang - uniqueAngles[uniqueAngles.length - 1] > 0.12) {
      uniqueAngles.push(ang);
    }
  }
  if (uniqueAngles.length < 2) return null;

  const sectors = [];
  for (let i = 0; i < uniqueAngles.length; i++) {
    const start = uniqueAngles[i];
    const end = i + 1 < uniqueAngles.length ? uniqueAngles[i + 1] : uniqueAngles[0] + 2 * Math.PI;
    const sweep = end - start;
    const midAngle = start + sweep / 2;
    const labelAnchor = [center[0] + Math.cos(midAngle) * (r * 0.6), center[1] + Math.sin(midAngle) * (r * 0.6)];
    const lbl = nearestLabel(labelAnchor, labels, r * 0.55);
    sectors.push({
      index: i,
      startAngleRad: start,
      endAngleRad: end,
      geometry: {
        angleDeg: Number(((sweep * 180) / Math.PI).toFixed(2)),
        fraction: Number((sweep / (2 * Math.PI)).toFixed(4))
      },
      writtenLabel: lbl ? lbl.text : null
    });
  }

  return {
    kind: 'pie_chart',
    label: DATA_STRUCTURE_LABELS.pie_chart,
    confidence: 0.92,
    circle: { cx: circleFit.cx, cy: circleFit.cy, r },
    sectors,
    sourceStrokeIds: [circleStroke.id, ...radialStrokeIds],
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 5. GRÁFICO DE PUNTOS (DOT PLOT)
 * ============================================================================ */

export function recognizeDotPlot(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 4) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);

  const baseline = analyzed
    .filter((a) => a.isHorizontal && a.line.length >= 80)
    .sort((a, b) => b.line.length - a.line.length)[0];
  if (!baseline) return null;

  const baseY = baseline.line.center[1];
  const minX = Math.min(baseline.line.points[0][0], baseline.line.points[1][0]);
  const maxX = Math.max(baseline.line.points[0][0], baseline.line.points[1][0]);

  const dots = analyzed.filter(
    (a) =>
      a.id !== baseline.id &&
      a.isDot &&
      a.bb.center[0] >= minX - 12 &&
      a.bb.center[0] <= maxX + 12 &&
      a.bb.center[1] < baseY - 6 &&
      a.bb.center[1] >= baseY - 260
  );
  if (dots.length < 3) return null;

  const colXs = cluster1D(dots.map((d) => d.bb.center[0]), 18);
  const columns = colXs.map((x, idx) => {
    const colDots = dots
      .filter((d) => Math.abs(d.bb.center[0] - x) <= 18)
      .sort((a, b) => b.bb.center[1] - a.bb.center[1]);
    const lbl = nearestLabel([x, baseY + 18], labels, 28);
    return {
      index: idx,
      x,
      dotCount: colDots.length,
      dots: colDots.map((d) => d.bb.center),
      writtenLabel: lbl ? lbl.text : null,
      sourceStrokeIds: colDots.map((d) => d.id)
    };
  });

  // Al menos una columna apilada (>= 2 puntos) o >= 3 columnas distintas
  const hasStack = columns.some((c) => c.dotCount >= 2);
  if (!hasStack && columns.length < 3) return null;

  return {
    kind: 'dot_plot',
    label: DATA_STRUCTURE_LABELS.dot_plot,
    confidence: hasStack ? 0.9 : 0.82,
    baseline: { points: baseline.line.points, strokeId: baseline.id },
    columns,
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 6. DIAGRAMA DE TALLO Y HOJAS (STEM-AND-LEAF)
 * ============================================================================ */

export function recognizeStemAndLeaf(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 1) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);

  // Requiere una línea vertical divisoria prominente y tokens escritos a izquierda y derecha
  const verticals = analyzed
    .filter((a) => a.isVertical && a.line.length >= 60)
    .sort((a, b) => b.line.length - a.line.length);
  if (!verticals.length) return null;

  const divider = verticals[0];
  const divX = divider.line.center[0];
  const yMin = Math.min(divider.line.points[0][1], divider.line.points[1][1]) - 15;
  const yMax = Math.max(divider.line.points[0][1], divider.line.points[1][1]) + 15;

  // Rechazar si hay múltiples líneas horizontales formando una tabla completa
  const longHoriz = analyzed.filter((a) => a.isHorizontal && a.line.length >= 60);
  if (longHoriz.length >= 2) return null;

  const relevantLabels = labels.filter((l) => l.center[1] >= yMin && l.center[1] <= yMax);
  const leftTokens = relevantLabels.filter((l) => l.center[0] < divX - 4);
  const rightTokens = relevantLabels.filter((l) => l.center[0] > divX + 4);
  if (leftTokens.length < 2 || rightTokens.length < 2) return null;

  const rowYs = cluster1D(leftTokens.map((l) => l.center[1]), 18);
  const rows = rowYs.map((ry, idx) => {
    const stems = leftTokens
      .filter((l) => Math.abs(l.center[1] - ry) <= 18)
      .sort((a, b) => a.center[0] - b.center[0])
      .map((l) => l.text);
    const leaves = rightTokens
      .filter((l) => Math.abs(l.center[1] - ry) <= 18)
      .sort((a, b) => a.center[0] - b.center[0])
      .map((l) => l.text);
    return {
      index: idx,
      y: ry,
      writtenStem: stems.length ? stems.join(' ') : null,
      writtenLeaves: leaves
    };
  });

  if (rows.filter((r) => r.writtenStem && r.writtenLeaves.length).length < 2) return null;

  return {
    kind: 'stem_and_leaf',
    label: DATA_STRUCTURE_LABELS.stem_and_leaf,
    confidence: 0.91,
    divider: { x: divX, points: divider.line.points, strokeId: divider.id },
    rows,
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 7. DIAGRAMA DE CAJA Y BIGOTES (BOX PLOT)
 * ============================================================================ */

export function recognizeBoxPlot(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 4) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);

  const rects = extractRectanglesFromAnalyzed(analyzed, new Set());
  if (!rects.length) return null;

  for (const box of rects) {
    const b = box.bounds;
    const boxIds = new Set(box.sourceStrokeIds);
    const midY = (b.minY + b.maxY) / 2;

    // 1. Línea vertical de mediana dentro de la caja
    const medianLine = analyzed.find(
      (a) =>
        !boxIds.has(a.id) &&
        a.isVertical &&
        a.line.center[0] > b.minX + 4 &&
        a.line.center[0] < b.maxX - 4 &&
        Math.abs(a.line.center[1] - midY) <= b.height * 0.35 &&
        a.line.length >= b.height * 0.6
    );
    if (!medianLine) continue;

    // 2. Bigote izquierdo y derecho (segmentos horizontales saliendo de los bordes izquierdo y derecho)
    const leftWhisker = analyzed.find(
      (a) =>
        !boxIds.has(a.id) &&
        a.isHorizontal &&
        Math.abs(a.line.center[1] - midY) <= b.height * 0.35 &&
        Math.abs(Math.max(a.line.points[0][0], a.line.points[1][0]) - b.minX) <= 18 &&
        Math.min(a.line.points[0][0], a.line.points[1][0]) < b.minX - 10
    );
    const rightWhisker = analyzed.find(
      (a) =>
        !boxIds.has(a.id) &&
        a.isHorizontal &&
        Math.abs(a.line.center[1] - midY) <= b.height * 0.35 &&
        Math.abs(Math.min(a.line.points[0][0], a.line.points[1][0]) - b.maxX) <= 18 &&
        Math.max(a.line.points[0][0], a.line.points[1][0]) > b.maxX + 10
    );
    if (!leftWhisker || !rightWhisker) continue;

    const minX = Math.min(leftWhisker.line.points[0][0], leftWhisker.line.points[1][0]);
    const maxX = Math.max(rightWhisker.line.points[0][0], rightWhisker.line.points[1][0]);
    const medianX = medianLine.line.center[0];

    return {
      kind: 'box_plot',
      label: DATA_STRUCTURE_LABELS.box_plot,
      confidence: 0.92,
      orientation: 'horizontal',
      geometry: {
        minX,
        q1X: b.minX,
        medianX,
        q3X: b.maxX,
        maxX,
        boxBounds: b
      },
      writtenSummary: {
        min: nearestLabel([minX, b.maxY + 20], labels, 28)?.text ?? null,
        q1: nearestLabel([b.minX, b.maxY + 20], labels, 28)?.text ?? null,
        median: nearestLabel([medianX, b.maxY + 20], labels, 28)?.text ?? null,
        q3: nearestLabel([b.maxX, b.maxY + 20], labels, 28)?.text ?? null,
        max: nearestLabel([maxX, b.maxY + 20], labels, 28)?.text ?? null
      },
      sourceStrokeIds: [...box.sourceStrokeIds, medianLine.id, leftWhisker.id, rightWhisker.id],
      strictDataPreservation: true
    };
  }

  return null;
}

/* ============================================================================
 * 8. ÁRBOL DE PROBABILIDAD
 * ============================================================================ */

export function recognizeProbabilityTree(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 2) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);

  const segs = analyzed.filter((a) => a.isStraight && a.line.length >= 22);
  if (segs.length < 2) return null;

  // Rechazar si la mayoría son puramente horizontales/verticales (tablas o ejes)
  const diagonalSegs = segs.filter((s) => !s.isHorizontal && !s.isVertical);
  if (diagonalSegs.length < 2) return null;

  // Orientar cada segmento de izquierda a derecha (o arriba a abajo)
  const edges = segs.map((s) => {
    const [p0, p1] = s.line.points;
    const leftToRight = p0[0] <= p1[0];
    return {
      id: s.id,
      from: leftToRight ? p0 : p1,
      to: leftToRight ? p1 : p0,
      length: s.line.length
    };
  });

  // Agrupar extremos cercanos en nodos del grafo
  const nodeTol = 20;
  const nodes = [];
  const findOrAddNode = (pt) => {
    for (let i = 0; i < nodes.length; i++) {
      if (dist(nodes[i].position, pt) <= nodeTol) return i;
    }
    nodes.push({ id: `n_${nodes.length}`, position: pt.slice(), outEdges: [], inCount: 0 });
    return nodes.length - 1;
  };

  const branches = edges.map((e) => {
    const fromIdx = findOrAddNode(e.from);
    const toIdx = findOrAddNode(e.to);
    nodes[fromIdx].outEdges.push(e.id);
    nodes[toIdx].inCount++;
    const m = mid(e.from, e.to);
    const branchLabel = nearestLabel(m, labels, 32);
    const outcomeLabel = nearestLabel(e.to, labels, 28);
    return {
      strokeId: e.id,
      fromNode: nodes[fromIdx].id,
      toNode: nodes[toIdx].id,
      from: e.from,
      to: e.to,
      writtenProbability: branchLabel ? branchLabel.text : null,
      writtenOutcome: outcomeLabel && outcomeLabel !== branchLabel ? outcomeLabel.text : null
    };
  });

  // Un árbol válido tiene exactamente 1 raíz (inCount === 0) con >= 2 ramas salientes y sin ciclos (inCount <= 1)
  const roots = nodes.filter((n) => n.inCount === 0 && n.outEdges.length >= 2);
  const hasMultipleParents = nodes.some((n) => n.inCount > 1);
  if (roots.length !== 1 || hasMultipleParents) return null;

  return {
    kind: 'probability_tree',
    label: DATA_STRUCTURE_LABELS.probability_tree,
    confidence: clamp(0.84 + Math.min(0.11, branches.length * 0.02), 0.8, 0.95),
    rootId: roots[0].id,
    nodes: nodes.map((n) => ({ id: n.id, position: n.position, isLeaf: n.outEdges.length === 0 })),
    branches,
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 9. RECTA NUMÉRICA
 * ============================================================================ */

export function recognizeNumberLine(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 3) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);

  // Una sola línea principal horizontal (o vertical) larga + >= 2 marcas perpendiculares cortas
  const longLines = analyzed.filter((a) => a.isStraight && a.line.length >= 90);
  if (longLines.length !== 1) return null;
  const main = longLines[0];
  const [p0, p1] = main.line.points;
  const isHoriz = main.isHorizontal;
  if (!isHoriz && !main.isVertical) return null;

  const ticks = [];
  const plottedPoints = [];
  for (const a of analyzed) {
    if (a.id === main.id) continue;
    if (a.isDot && pointToSegmentDistance(a.bb.center, p0, p1) <= 14) {
      plottedPoints.push({ position: a.bb.center, strokeId: a.id });
      continue;
    }
    if (a.isStraight && a.line.length >= 6 && a.line.length <= 36) {
      const perp = arePerpendicular(main.line.points, a.line.points, 16);
      const onLine = pointToSegmentDistance(a.line.center, p0, p1) <= 14;
      if (perp && onLine) {
        const anchor = isHoriz ? [a.line.center[0], main.line.center[1]] : [main.line.center[0], a.line.center[1]];
        const lblPos = isHoriz ? [anchor[0], anchor[1] + 22] : [anchor[0] - 22, anchor[1]];
        const lbl = nearestLabel(lblPos, labels, 28);
        ticks.push({
          position: anchor,
          strokeId: a.id,
          writtenLabel: lbl ? lbl.text : null
        });
      }
    }
  }

  if (ticks.length < 2) return null;
  ticks.sort((a, b) => (isHoriz ? a.position[0] - b.position[0] : a.position[1] - b.position[1]));

  return {
    kind: 'number_line',
    label: DATA_STRUCTURE_LABELS.number_line,
    confidence: clamp(0.86 + Math.min(0.09, ticks.length * 0.02), 0.82, 0.95),
    orientation: isHoriz ? 'horizontal' : 'vertical',
    axis: { points: main.line.points, strokeId: main.id },
    ticks,
    plottedPoints,
    scale: null, // Nunca inventar escala numérica
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 10. PLANO CARTESIANO
 * ============================================================================ */

export function recognizeCartesianPlane(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length < 2) return null;
  const analyzed = strokes.map(analyzeStroke);
  const labels = normalizeLabels(options);

  const horiz = analyzed.filter((a) => a.isHorizontal && a.line.length >= 90);
  const vert = analyzed.filter((a) => a.isVertical && a.line.length >= 90);
  if (!horiz.length || !vert.length) return null;

  // Buscar un par horizontal + vertical que se crucen INTERIORMENTE (formando una cruz +)
  let best = null;
  for (const h of horiz) {
    for (const v of vert) {
      const inter = lineIntersection2D(h.line.points[0], h.line.points[1], v.line.points[0], v.line.points[1]);
      if (!inter) continue;
      // Para ser plano cartesiano (y no ejes en L), la intersección debe estar en el interior de ambos ejes
      if (inter.t >= 0.15 && inter.t <= 0.85 && inter.u >= 0.15 && inter.u <= 0.85) {
        const score = h.line.length + v.line.length;
        if (!best || score > best.score) best = { score, xAxis: h, yAxis: v, origin: inter.point };
      }
    }
  }
  if (!best) return null;

  // Rechazar si hay múltiples horizontales y verticales formando una tabla
  if (horiz.length >= 2 && vert.length >= 2) return null;

  const axisIds = new Set([best.xAxis.id, best.yAxis.id]);
  const xTicks = [];
  const yTicks = [];
  const plottedPoints = [];
  const referenceLines = [];

  for (const a of analyzed) {
    if (axisIds.has(a.id)) continue;
    if (a.isDot) {
      const lbl = nearestLabel(a.bb.center, labels, 28);
      plottedPoints.push({
        position: a.bb.center,
        offsetFromOriginPx: [a.bb.center[0] - best.origin[0], best.origin[1] - a.bb.center[1]],
        writtenLabel: lbl ? lbl.text : null,
        strokeId: a.id
      });
      continue;
    }
    if (a.isStraight) {
      const nearX = pointToSegmentDistance(a.line.center, best.xAxis.line.points[0], best.xAxis.line.points[1]) <= 14;
      const nearY = pointToSegmentDistance(a.line.center, best.yAxis.line.points[0], best.yAxis.line.points[1]) <= 14;
      if (a.isVertical && a.line.length <= 28 && nearX) {
        const pos = [a.line.center[0], best.origin[1]];
        const lbl = nearestLabel([pos[0], pos[1] + 20], labels, 24);
        xTicks.push({ position: pos, strokeId: a.id, writtenLabel: lbl ? lbl.text : null });
        continue;
      }
      if (a.isHorizontal && a.line.length <= 28 && nearY) {
        const pos = [best.origin[0], a.line.center[1]];
        const lbl = nearestLabel([pos[0] - 20, pos[1]], labels, 24);
        yTicks.push({ position: pos, strokeId: a.id, writtenLabel: lbl ? lbl.text : null });
        continue;
      }
      if (a.line.length >= 30) {
        referenceLines.push({ points: a.line.points, strokeId: a.id });
      }
    }
  }

  xTicks.sort((a, b) => a.position[0] - b.position[0]);
  yTicks.sort((a, b) => a.position[1] - b.position[1]);

  // Calibración solo si existen al menos 2 etiquetas numéricas escritas en un eje
  const numericXTicks = xTicks
    .map((t) => ({ x: t.position[0], val: t.writtenLabel !== null ? Number(t.writtenLabel.replace(',', '.')) : NaN }))
    .filter((t) => Number.isFinite(t.val));
  const calibratedX = numericXTicks.length >= 2;

  return {
    kind: 'cartesian_plane',
    label: DATA_STRUCTURE_LABELS.cartesian_plane,
    confidence: 0.93,
    origin: best.origin,
    xAxis: { points: best.xAxis.line.points, strokeId: best.xAxis.id, ticks: xTicks },
    yAxis: { points: best.yAxis.line.points, strokeId: best.yAxis.id, ticks: yTicks },
    plottedPoints,
    referenceLines,
    calibrated: calibratedX,
    scale: calibratedX ? { xTicksNumeric: numericXTicks } : null,
    strictDataPreservation: true
  };
}

/* ============================================================================
 * 11. CONVERSIÓN A ESTRUCTURA DIGITAL EDITABLE Y DESPACHADOR UNIFICADO
 * ============================================================================ */

export function toEditableStructure(recognized) {
  if (!recognized || !recognized.kind) return null;
  const base = {
    version: 1,
    kind: recognized.kind,
    label: recognized.label || DATA_STRUCTURE_LABELS[recognized.kind] || recognized.kind,
    strictDataPreservation: true,
    editable: true
  };

  if (recognized.kind === 'table' || recognized.kind === 'frequency_table') {
    return {
      ...base,
      rows: recognized.rows,
      cols: recognized.cols,
      data: recognized.cells.map((row) =>
        row.map((cell) => ({
          row: cell.row,
          col: cell.col,
          value: cell.writtenText, // null si no fue escrito; nunca inventado
          strokeIds: [...cell.strokeIds]
        }))
      )
    };
  }

  if (recognized.kind === 'bar_chart' || recognized.kind === 'histogram') {
    const items = recognized.bars || recognized.bins || [];
    return {
      ...base,
      scale: null,
      items: items.map((it) => ({
        index: it.index,
        category: it.writtenCategory,
        value: it.writtenValue,
        geometryHeightPx: it.geometry.height,
        geometryWidthPx: it.geometry.width
      }))
    };
  }

  if (recognized.kind === 'line_chart') {
    return {
      ...base,
      scale: null,
      series: recognized.series.map((s) => ({
        points: s.points.map((p) => ({ index: p.index, position: [...p.position], label: p.writtenLabel }))
      }))
    };
  }

  if (recognized.kind === 'pie_chart') {
    return {
      ...base,
      sectors: recognized.sectors.map((s) => ({
        index: s.index,
        angleDeg: s.geometry.angleDeg,
        fraction: s.geometry.fraction,
        label: s.writtenLabel
      }))
    };
  }

  if (recognized.kind === 'dot_plot') {
    return {
      ...base,
      columns: recognized.columns.map((c) => ({
        index: c.index,
        label: c.writtenLabel,
        dotCount: c.dotCount
      }))
    };
  }

  if (recognized.kind === 'stem_and_leaf') {
    return {
      ...base,
      rows: recognized.rows.map((r) => ({
        stem: r.writtenStem,
        leaves: [...r.writtenLeaves]
      }))
    };
  }

  if (recognized.kind === 'box_plot') {
    return {
      ...base,
      orientation: recognized.orientation,
      summary: { ...recognized.writtenSummary },
      geometry: { ...recognized.geometry }
    };
  }

  if (recognized.kind === 'probability_tree') {
    return {
      ...base,
      rootId: recognized.rootId,
      nodes: recognized.nodes.map((n) => ({ ...n, position: [...n.position] })),
      branches: recognized.branches.map((b) => ({
        fromNode: b.fromNode,
        toNode: b.toNode,
        probability: b.writtenProbability,
        outcome: b.writtenOutcome
      }))
    };
  }

  if (recognized.kind === 'number_line') {
    return {
      ...base,
      orientation: recognized.orientation,
      scale: recognized.scale,
      ticks: recognized.ticks.map((t) => ({ position: [...t.position], label: t.writtenLabel })),
      plottedPoints: recognized.plottedPoints.map((p) => ({ position: [...p.position] }))
    };
  }

  if (recognized.kind === 'cartesian_plane') {
    return {
      ...base,
      origin: [...recognized.origin],
      calibrated: recognized.calibrated,
      scale: recognized.scale,
      xTicks: recognized.xAxis.ticks.map((t) => ({ position: [...t.position], label: t.writtenLabel })),
      yTicks: recognized.yAxis.ticks.map((t) => ({ position: [...t.position], label: t.writtenLabel })),
      plottedPoints: recognized.plottedPoints.map((p) => ({
        position: [...p.position],
        offsetFromOriginPx: [...p.offsetFromOriginPx],
        label: p.writtenLabel
      })),
      referenceLines: recognized.referenceLines.map((l) => ({ points: l.points.map((pt) => [...pt]) }))
    };
  }

  return base;
}

export function recognizeDataStructure(strokes, options = {}) {
  if (!Array.isArray(strokes) || !strokes.length) return null;
  const recognizers = [
    recognizeTable,
    recognizePieChart,
    recognizeBoxPlot,
    recognizeHistogram,
    recognizeBarChart,
    recognizeLineChart,
    recognizeDotPlot,
    recognizeStemAndLeaf,
    recognizeProbabilityTree,
    recognizeCartesianPlane,
    recognizeNumberLine
  ];

  const candidates = [];
  for (const fn of recognizers) {
    const res = fn(strokes, options);
    if (res) candidates.push(res);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);
  const primary = candidates[0];
  return {
    primary,
    candidates,
    confidence: primary.confidence,
    editableModel: toEditableStructure(primary),
    strictDataPreservation: true,
    immutable: true
  };
}
