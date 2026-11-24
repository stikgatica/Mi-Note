/* Mi Note Professional — Reconocimiento Matemático Estructural 2D (Pure ES Module)
 * Cero dependencias externas. Compatible con WebView, Web Worker y Node.js.
 *
 * Principios fundamentales:
 * 1. Inmutabilidad estricta: jamás muta trazos ni símbolos de entrada.
 * 2. Fidelidad pedagógica: NUNCA corrige errores matemáticos del docente ni
 *    resuelve ejercicios automáticamente (ej. 2+2=5 se transcribe como 2+2=5).
 * 3. Comprensión espacial 2D: fracciones (incluso anidadas), potencias, raíces,
 *    subíndices, aritmética vertical, sistemas de ecuaciones y álgebra.
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const OPERATOR_CHARS = new Set(['+', '-', '−', '×', '·', '÷', '/', ':', '=', '<', '>', '≤', '≥', '≠', '±']);
const RELATION_CHARS = new Set(['=', '<', '>', '≤', '≥', '≠']);
const OPEN_DELIMS = new Set(['(', '[', '{']);
const CLOSE_DELIMS = new Set([')', ']', '}']);
const MATCHING_DELIM = { '(': ')', '[': ']', '{': '}' };
const FUNCTION_NAMES = new Set(['f', 'g', 'h', 'p', 'q', 'P', 'Q', 'F', 'G', 'H']);
const GREEK_LETTERS = new Set(['π', 'α', 'β', 'γ', 'θ', 'Δ', 'Σ', 'λ', 'μ', 'σ', 'ω', 'φ']);

// ---------------------------------------------------------------------------
// 1. Normalización inmutable de cajas y símbolos
// ---------------------------------------------------------------------------

/**
 * Normaliza cualquier formato de bounding box sin mutar el objeto original.
 * Soporta {minX, minY, maxX, maxY}, {x, y, width, height}, {x, y, right, bottom}.
 */
export function normalizeBox(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let minX, minY, maxX, maxY;
  if (Number.isFinite(raw.minX) && Number.isFinite(raw.maxX)) {
    minX = raw.minX;
    maxX = raw.maxX;
  } else if (Number.isFinite(raw.x) && Number.isFinite(raw.right)) {
    minX = raw.x;
    maxX = raw.right;
  } else if (Number.isFinite(raw.x) && Number.isFinite(raw.width)) {
    minX = raw.x;
    maxX = raw.x + raw.width;
  } else {
    return null;
  }

  if (Number.isFinite(raw.minY) && Number.isFinite(raw.maxY)) {
    minY = raw.minY;
    maxY = raw.maxY;
  } else if (Number.isFinite(raw.y) && Number.isFinite(raw.bottom)) {
    minY = raw.y;
    maxY = raw.bottom;
  } else if (Number.isFinite(raw.y) && Number.isFinite(raw.height)) {
    minY = raw.y;
    maxY = raw.y + raw.height;
  } else {
    return null;
  }

  if (minX > maxX) [minX, maxX] = [maxX, minX];
  if (minY > maxY) [minY, maxY] = [maxY, minY];
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  return Object.freeze({
    minX,
    minY,
    maxX,
    maxY,
    w,
    h,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  });
}

/**
 * Calcula bounding box inmutable desde trazos Mi Note ({pts: [[x,y,press?,t?], ...]}).
 */
export function boxFromStrokes(strokes) {
  if (!Array.isArray(strokes) || !strokes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const s of strokes) {
    const pts = s?.pts;
    if (!Array.isArray(pts)) continue;
    for (const p of pts) {
      if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
        count++;
      }
    }
  }
  if (!count) return null;
  return normalizeBox({ minX, minY, maxX, maxY });
}

/**
 * Normaliza un símbolo reconocido en una representación interna inmutable.
 */
export function normalizeSymbol(item, index = 0) {
  if (!item || typeof item !== 'object') return null;
  const box = normalizeBox(item.box) || boxFromStrokes(item.strokes);
  if (!box) return null;
  const rawSymbol = String(item.symbol ?? item.text ?? '').trim();
  if (!rawSymbol) return null;
  const confidence = Number.isFinite(item.confidence) ? clamp(item.confidence, 0, 1) : 0.9;
  const alternatives = Array.isArray(item.alternatives)
    ? item.alternatives
        .filter(a => a && typeof a.symbol === 'string')
        .map(a => Object.freeze({ symbol: a.symbol, confidence: clamp(Number(a.confidence) || 0, 0, 1) }))
    : [];
  const strokeIds = Array.isArray(item.strokeIds)
    ? [...item.strokeIds]
    : Array.isArray(item.strokes)
      ? item.strokes.map(s => s?.id).filter(Boolean)
      : [];
  return Object.freeze({
    id: item.id != null ? String(item.id) : `sym_${index}`,
    symbol: rawSymbol,
    originalSymbol: rawSymbol,
    box,
    confidence,
    alternatives: Object.freeze(alternatives),
    strokeIds: Object.freeze(strokeIds),
    timestamp: Number.isFinite(item.timestamp) ? item.timestamp : index * 100,
    isBar: Boolean(item.isBar),
    isRadical: Boolean(item.isRadical || rawSymbol === '√'),
    role: item.role || null,
    meta: item.meta ? Object.freeze({ ...item.meta }) : Object.freeze({})
  });
}

function median(values, fallback = 30) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return fallback;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeMedianHeight(symbols) {
  const heights = symbols
    .filter(s => !isDotLike(s) && !isHorizontalBarShape(s, 30))
    .map(s => s.box.h)
    .filter(h => h >= 8);
  if (heights.length) return median(heights, 30);
  const all = symbols.map(s => s.box.h).filter(h => h > 0);
  return median(all, 30);
}

function isHorizontalBarShape(sym, medH = 30) {
  if (sym.isBar) return true;
  if (sym.symbol === '—' || sym.symbol === '―' || sym.symbol === 'bar' || sym.symbol === 'frac_bar') return true;
  if (sym.symbol !== '-' && sym.symbol !== '−' && sym.symbol !== '_') return false;
  const { w, h } = sym.box;
  return w >= Math.max(12, medH * 0.45) && h <= Math.max(10, medH * 0.35) && w / Math.max(1, h) >= 2.2;
}

function isDotLike(sym, medH = 30) {
  if (sym.symbol !== '.' && sym.symbol !== ',' && sym.symbol !== '·' && sym.symbol !== '•') return false;
  return sym.box.w <= Math.max(12, medH * 0.4) && sym.box.h <= Math.max(16, medH * 0.5);
}

function isDigitStr(s) {
  return /^\d+$/.test(s);
}

function isLetterStr(s) {
  return /^[a-zA-Z]$/.test(s) || GREEK_LETTERS.has(s);
}

function horizontalOverlapRatio(a, b) {
  const overlap = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const minW = Math.max(1, Math.min(a.w, b.w));
  return overlap / minW;
}

function verticalOverlapRatio(a, b) {
  const overlap = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const minH = Math.max(1, Math.min(a.h, b.h));
  return overlap / minH;
}

// ---------------------------------------------------------------------------
// 2. Analizador de relaciones espaciales 2D
// ---------------------------------------------------------------------------

/**
 * Clasifica la relación espacial primaria entre dos símbolos A (origen) y B (destino).
 */
export function classifySpatialRelation(a, b, medH = 30) {
  const ba = a.box, bb = b.box;
  const dx = bb.minX - ba.maxX;
  const dy = bb.cy - ba.cy;

  // Dentro de radical (o índice en la muesca superior izquierda)
  if (a.isRadical || a.symbol === '√') {
    const inNotch =
      bb.cx >= ba.minX - medH * 0.35 &&
      bb.cx <= ba.minX + ba.w * 0.42 &&
      bb.cy >= ba.minY - medH * 0.35 &&
      bb.cy <= ba.minY + ba.h * 0.55 &&
      bb.h < ba.h * 0.65;
    if (inNotch) {
      return { type: 'radical_index', dx, dy };
    }
    const insideX = bb.cx >= ba.minX + ba.w * 0.12 && bb.cx <= ba.maxX + medH * 0.25;
    const insideY = bb.cy >= ba.minY - medH * 0.15 && bb.cy <= ba.maxY + medH * 0.25;
    if (insideX && insideY) {
      return { type: 'inside_radical', dx, dy };
    }
  }

  // Span de barra horizontal (encima / debajo)
  if (isHorizontalBarShape(a, medH)) {
    const pad = Math.max(6, medH * 0.25);
    if (bb.cx >= ba.minX - pad && bb.cx <= ba.maxX + pad) {
      if (bb.maxY <= ba.cy + medH * 0.25) {
        return { type: 'above_bar', dx: bb.cx - ba.cx, dy: ba.minY - bb.maxY };
      }
      if (bb.minY >= ba.cy - medH * 0.25) {
        return { type: 'below_bar', dx: bb.cx - ba.cx, dy: bb.minY - ba.maxY };
      }
    }
  }

  // Relaciones verticales directas (above / below)
  const hOverlap = horizontalOverlapRatio(ba, bb);
  if (hOverlap >= 0.35 || Math.abs(ba.cx - bb.cx) <= Math.max(ba.w, bb.w) * 0.55) {
    if (bb.maxY <= ba.minY + medH * 0.15) return { type: 'above', dx: bb.cx - ba.cx, dy };
    if (bb.minY >= ba.maxY - medH * 0.15) return { type: 'below', dx: bb.cx - ba.cx, dy };
  }

  // Relaciones a la derecha: superscript, subscript, right
  if (bb.cx > ba.cx && dx >= -Math.min(ba.w, bb.w) * 0.35) {
    const isPunctuationDot = b.symbol === '.' || b.symbol === ',' || b.symbol === '·' || b.symbol === '•' || b.role === 'decimal' || b.role === 'separator';
    const maxScriptGap = Math.max(medH * 1.45, ba.h * 1.35);
    const isSmallOrSign = bb.h <= Math.max(ba.h * 0.82, medH * 0.8) || bb.h <= medH * 0.45;
    // Superíndice (exponente): elevado sobre el centro vertical de A y más pequeño/signo
    if (
      !isPunctuationDot &&
      dx <= maxScriptGap &&
      isSmallOrSign &&
      bb.cy < ba.cy - ba.h * 0.22 &&
      bb.maxY < ba.maxY - ba.h * 0.18 &&
      bb.minY >= ba.minY - Math.max(ba.h, medH) * 1.1
    ) {
      return { type: 'superscript', dx, dy };
    }
    // Subíndice: descendido bajo el centro vertical de A y más pequeño
    if (
      !isPunctuationDot &&
      dx <= maxScriptGap &&
      isSmallOrSign &&
      bb.cy > ba.cy + ba.h * 0.22 &&
      bb.minY > ba.minY + ba.h * 0.18 &&
      bb.maxY <= ba.maxY + Math.max(ba.h, medH) * 0.9
    ) {
      return { type: 'subscript', dx, dy };
    }
    // Adyacente a la derecha en la misma línea
    if (Math.abs(dy) <= Math.max(ba.h, bb.h, medH) * 0.85 || verticalOverlapRatio(ba, bb) >= 0.25) {
      return { type: 'right', dx, dy };
    }
  }

  return { type: 'independent', dx, dy };
}

/**
 * Analiza todas las relaciones espaciales 2D relevantes de un conjunto de símbolos:
 * barras de fracción, radicales, superíndices, subíndices, alineación multilínea
 * y detección de aritmética vertical por columnas.
 */
export function analyzeSpatialRelations(rawSymbols) {
  const symbols = (Array.isArray(rawSymbols) ? rawSymbols : [])
    .map((s, i) => normalizeSymbol(s, i))
    .filter(Boolean);

  if (!symbols.length) {
    return {
      symbols: [],
      medianHeight: 0,
      fractionBars: [],
      radicals: [],
      pairs: [],
      lines: [],
      verticalArithmetic: null
    };
  }

  const medH = computeMedianHeight(symbols);

  // 1. Detección de barras horizontales con elementos encima y debajo
  const fractionBars = [];
  for (const sym of symbols) {
    if (!isHorizontalBarShape(sym, medH)) continue;
    const pad = Math.max(6, medH * 0.25);
    const above = [];
    const below = [];
    for (const other of symbols) {
      if (other.id === sym.id) continue;
      if (other.box.cx < sym.box.minX - pad || other.box.cx > sym.box.maxX + pad) continue;
      const verticalLimit = Math.max(medH * 3.8, sym.box.w * 1.4);
      if (other.box.maxY <= sym.box.cy + medH * 0.2 && sym.box.minY - other.box.maxY <= verticalLimit) {
        above.push(other);
      } else if (other.box.minY >= sym.box.cy - medH * 0.2 && other.box.minY - sym.box.maxY <= verticalLimit) {
        below.push(other);
      }
    }
    fractionBars.push({
      bar: sym,
      aboveIds: above.map(s => s.id),
      belowIds: below.map(s => s.id),
      hasNumerator: above.length > 0,
      hasDenominator: below.length > 0,
      isCompleteFraction: above.length > 0 && below.length > 0
    });
  }

  // 2. Detección de radicales y su contenido
  const radicals = [];
  for (const sym of symbols) {
    if (!sym.isRadical && sym.symbol !== '√') continue;
    const insideIds = [];
    const indexIds = [];
    for (const other of symbols) {
      if (other.id === sym.id) continue;
      const rel = classifySpatialRelation(sym, other, medH);
      if (rel.type === 'inside_radical') insideIds.push(other.id);
      else if (rel.type === 'radical_index') indexIds.push(other.id);
    }
    radicals.push({ radical: sym, insideIds, indexIds });
  }

  // 3. Relaciones por pares (ordenadas de izquierda a derecha)
  const sorted = [...symbols].sort((a, b) => a.box.minX - b.box.minX || a.box.minY - b.box.minY);
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const rel = classifySpatialRelation(sorted[i], sorted[j], medH);
      if (rel.type !== 'independent') {
        pairs.push({
          fromId: sorted[i].id,
          toId: sorted[j].id,
          relation: rel.type,
          dx: rel.dx,
          dy: rel.dy
        });
      }
    }
  }

  // 4. Agrupación multilínea (evitando partir fracciones/radicales)
  const lines = clusterMultiline(symbols, medH, fractionBars, radicals);

  // 5. Detección de algoritmo de aritmética vertical
  const verticalArithmetic = detectVerticalArithmetic(symbols, medH);

  return {
    symbols,
    medianHeight: medH,
    fractionBars,
    radicals,
    pairs,
    lines,
    verticalArithmetic
  };
}

/**
 * Agrupa símbolos en renglones horizontales respetando estructuras 2D
 * (fracciones, radicales y llaves de sistema).
 */
export function clusterMultiline(symbols, medH = 30, fractionBars = [], radicals = []) {
  if (!symbols.length) return [];

  // Uniones 2D: símbolos que pertenecen a la misma fracción o radical no se separan en líneas distintas
  const parent = new Map(symbols.map(s => [s.id, s.id]));
  const find = id => {
    let cur = id;
    while (parent.get(cur) !== cur) cur = parent.get(cur);
    return cur;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const fb of fractionBars) {
    if (!fb.isCompleteFraction) continue;
    for (const id of fb.aboveIds) union(fb.bar.id, id);
    for (const id of fb.belowIds) union(fb.bar.id, id);
  }
  for (const rad of radicals) {
    for (const id of rad.insideIds) union(rad.radical.id, id);
    for (const id of rad.indexIds) union(rad.radical.id, id);
  }

  // Excluir llave gigante izquierda de sistema de ecuaciones al calcular filas
  const systemBrace = symbols.find(
    s => s.symbol === '{' && s.box.h >= medH * 1.9
  );

  // Construir componentes conexos 2D
  const groupsMap = new Map();
  for (const s of symbols) {
    if (systemBrace && s.id === systemBrace.id) continue;
    const root = find(s.id);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root).push(s);
  }

  const units = [...groupsMap.values()].map(items => {
    const minX = Math.min(...items.map(s => s.box.minX));
    const minY = Math.min(...items.map(s => s.box.minY));
    const maxX = Math.max(...items.map(s => s.box.maxX));
    const maxY = Math.max(...items.map(s => s.box.maxY));
    // Para una fracción, su centro vertical de línea es la barra principal
    const bar = items.find(s => fractionBars.some(fb => fb.bar.id === s.id && fb.isCompleteFraction));
    const baselineCy = bar ? bar.box.cy : (minY + maxY) / 2;
    return { items, minX, minY, maxX, maxY, cy: baselineCy, h: maxY - minY };
  });

  // Ordenar por cy y agrupar en filas
  units.sort((a, b) => a.cy - b.cy);
  const rows = [];
  const rowTol = Math.max(18, medH * 0.95);

  for (const unit of units) {
    // Buscar fila cuyo centro vertical esté dentro de la tolerancia
    let bestRow = null;
    let bestDist = Infinity;
    for (const row of rows) {
      const dist = Math.abs(unit.cy - row.cy);
      const overlapsVertically = unit.minY <= row.maxY + medH * 0.25 && unit.maxY >= row.minY - medH * 0.25;
      if ((dist <= rowTol || (overlapsVertically && dist <= medH * 1.4)) && dist < bestDist) {
        bestRow = row;
        bestDist = dist;
      }
    }
    if (!bestRow) {
      rows.push({
        units: [unit],
        cy: unit.cy,
        minY: unit.minY,
        maxY: unit.maxY
      });
    } else {
      bestRow.units.push(unit);
      // Recalcular centro con elementos no minúsculos
      const weighted = bestRow.units.filter(u => u.h >= medH * 0.35);
      const src = weighted.length ? weighted : bestRow.units;
      bestRow.cy = src.reduce((acc, u) => acc + u.cy, 0) / src.length;
      bestRow.minY = Math.min(bestRow.minY, unit.minY);
      bestRow.maxY = Math.max(bestRow.maxY, unit.maxY);
    }
  }

  return rows
    .sort((a, b) => a.cy - b.cy)
    .map((row, idx) => {
      const items = row.units
        .flatMap(u => u.items)
        .sort((a, b) => a.box.minX - b.box.minX || a.box.minY - b.box.minY);
      const box = normalizeBox({
        minX: Math.min(...items.map(s => s.box.minX)),
        minY: Math.min(...items.map(s => s.box.minY)),
        maxX: Math.max(...items.map(s => s.box.maxX)),
        maxY: Math.max(...items.map(s => s.box.maxY))
      });
      return {
        index: idx,
        symbols: items,
        box,
        hasSystemBrace: Boolean(systemBrace)
      };
    });
}

/**
 * Detecta algoritmos de aritmética vertical (+, -, ×, ÷):
 * 2 o más filas de operandos numéricos apilados verticalmente con operador a la izquierda
 * y una barra horizontal debajo (con o sin fila de resultado debajo).
 * NUNCA calcula ni corrige el resultado escrito.
 */
export function detectVerticalArithmetic(symbols, medH = 30) {
  if (!symbols || symbols.length < 4) return null;

  // Buscar una barra horizontal ancha debajo de al menos dos filas numéricas
  const bars = symbols
    .filter(s => isHorizontalBarShape(s, medH))
    .sort((a, b) => b.box.w - a.box.w);

  for (const bar of bars) {
    const pad = Math.max(12, medH * 0.6);
    const above = symbols.filter(
      s => s.id !== bar.id &&
        s.box.maxY <= bar.box.cy + medH * 0.25 &&
        s.box.cx >= bar.box.minX - pad * 2.5 &&
        s.box.cx <= bar.box.maxX + pad
    );
    const below = symbols.filter(
      s => s.id !== bar.id &&
        s.box.minY >= bar.box.cy - medH * 0.25 &&
        s.box.cx >= bar.box.minX - pad &&
        s.box.cx <= bar.box.maxX + pad
    );

    if (above.length < 3) continue;

    // Agrupar `above` por filas horizontales
    const aboveRows = groupIntoSimpleRows(above, medH);
    if (aboveRows.length < 2) continue;

    // Verificar que exista un operador aritmético (+, -, ×, x, ÷) al inicio de la última fila (o a la izquierda)
    let operator = null;
    let operatorSym = null;
    const operandRows = [];
    let validVertical = true;

    for (let r = 0; r < aboveRows.length; r++) {
      const row = [...aboveRows[r]].sort((a, b) => a.box.minX - b.box.minX);
      let startIdx = 0;
      const first = row[0];
      if (
        r >= 1 &&
        ['+', '-', '−', '×', 'x', 'X', '÷'].includes(first.symbol) &&
        row.length >= 2
      ) {
        operator = first.symbol === '−' ? '-' : (first.symbol === 'x' || first.symbol === 'X') ? '×' : first.symbol;
        operatorSym = first;
        startIdx = 1;
      }
      const digits = row.slice(startIdx);
      if (!digits.length || !digits.every(d => isDigitStr(d.symbol) || d.symbol === '.' || d.symbol === ',')) {
        validVertical = false;
        break;
      }
      operandRows.push({
        text: digits.map(d => d.symbol).join(''),
        symbols: digits,
        rightX: Math.max(...digits.map(d => d.box.maxX)),
        leftX: Math.min(...digits.map(d => d.box.minX))
      });
    }

    if (!validVertical || !operator || operandRows.length < 2) continue;

    // Verificar alineación vertical/columnas (bordes derechos o centros cercanos)
    const rightXs = operandRows.map(r => r.rightX);
    const rightSpread = Math.max(...rightXs) - Math.min(...rightXs);
    if (rightSpread > Math.max(medH * 2.2, bar.box.w * 0.65)) continue;

    // Leer fila(s) de resultado debajo de la barra si existen (fielmente, sin recalcular)
    const belowRows = groupIntoSimpleRows(below, medH);
    let resultText = null;
    let resultSymbols = [];
    if (belowRows.length >= 1) {
      const resRow = [...belowRows[0]].sort((a, b) => a.box.minX - b.box.minX);
      if (resRow.every(d => isDigitStr(d.symbol) || d.symbol === '.' || d.symbol === ',' || d.symbol === '-' || d.symbol === '−')) {
        resultText = resRow.map(d => (d.symbol === '−' ? '-' : d.symbol)).join('');
        resultSymbols = resRow;
      }
    }

    const usedIds = new Set([
      bar.id,
      operatorSym.id,
      ...operandRows.flatMap(r => r.symbols.map(s => s.id)),
      ...resultSymbols.map(s => s.id)
    ]);

    return {
      operator,
      operands: operandRows.map(r => r.text),
      result: resultText,
      hasBar: true,
      barId: bar.id,
      usedIds: [...usedIds],
      columnSpread: rightSpread
    };
  }

  return null;
}

function groupIntoSimpleRows(symbols, medH) {
  const sorted = [...symbols].sort((a, b) => a.box.cy - b.box.cy);
  const rows = [];
  const tol = Math.max(12, medH * 0.65);
  for (const s of sorted) {
    const row = rows.find(r => Math.abs(s.box.cy - r.cy) <= tol);
    if (!row) {
      rows.push({ items: [s], cy: s.box.cy });
    } else {
      row.items.push(s);
      row.cy = row.items.reduce((acc, x) => acc + x.box.cy, 0) / row.items.length;
    }
  }
  return rows.map(r => r.items);
}

// ---------------------------------------------------------------------------
// 3. Desambiguación contextual inteligente
// ---------------------------------------------------------------------------

/**
 * Desambigua símbolos conflictivos usando contexto espacial, categoría activa y perfil:
 * - 'x' vs '×'
 * - '0' vs 'O'
 * - '1' vs 'l'
 * - '−' vs barra de fracción
 * - exponente vs número independiente (evaluado en spatial/parser)
 * - línea geométrica vs barra de fracción
 * - punto decimal vs punto accidental
 *
 * Devuelve una nueva lista inmutable de símbolos desambiguados + registro de decisiones.
 */
export function disambiguateSymbols(rawSymbols, options = {}) {
  const category = options.category || 'auto'; // 'auto' | 'numbers' | 'algebra' | 'geometry' | 'data'
  const userProfile = options.userProfile || {};
  const symbols = (Array.isArray(rawSymbols) ? rawSymbols : [])
    .map((s, i) => normalizeSymbol(s, i))
    .filter(Boolean);

  if (!symbols.length) return { symbols: [], decisions: [], ignoredIds: [] };

  const medH = computeMedianHeight(symbols);
  const spatial = analyzeSpatialRelations(symbols);
  const barMap = new Map(spatial.fractionBars.map(fb => [fb.bar.id, fb]));
  const decisions = [];
  const ignoredIds = [];

  // Detectar si el contexto global tiene pistas algebraicas fuertes
  const hasAlgebraCues =
    category === 'algebra' ||
    symbols.some(s => /^[a-wyzA-WYZ]$/.test(s.symbol) && !['O', 'I', 'l'].includes(s.symbol)) ||
    symbols.some(s => GREEK_LETTERS.has(s.symbol));

  const sorted = [...symbols].sort((a, b) => a.box.minX - b.box.minX || a.box.minY - b.box.minY);

  // Vecinos inmediatos en la misma línea
  const neighborsOf = sym => {
    const sameRow = sorted.filter(
      o => o.id !== sym.id &&
        Math.abs(o.box.cy - sym.box.cy) <= Math.max(medH * 0.9, Math.max(sym.box.h, o.box.h) * 0.85)
    );
    let left = null, right = null;
    for (const o of sameRow) {
      if (o.box.cx < sym.box.cx && (!left || o.box.cx > left.box.cx)) left = o;
      if (o.box.cx > sym.box.cx && (!right || o.box.cx < right.box.cx)) right = o;
    }
    return { left, right };
  };

  // Verificar si un símbolo tiene un superíndice o subíndice inmediatamente a su derecha
  const hasScriptOnRight = sym =>
    spatial.pairs.some(p => p.fromId === sym.id && (p.relation === 'superscript' || p.relation === 'subscript'));

  const result = [];

  for (const sym of symbols) {
    let resolved = sym.symbol;
    let role = sym.role;
    let confidence = sym.confidence;
    let ignored = false;
    const { left, right } = neighborsOf(sym);

    // A) Barra de fracción vs signo menos vs línea geométrica
    if (isHorizontalBarShape(sym, medH)) {
      const fb = barMap.get(sym.id);
      if (fb && fb.isCompleteFraction) {
        // ¿Es en realidad una barra de aritmética vertical?
        if (spatial.verticalArithmetic && spatial.verticalArithmetic.barId === sym.id) {
          resolved = '—';
          role = 'vertical_bar';
          decisions.push({ id: sym.id, from: sym.symbol, to: '—', role, reason: 'vertical_arithmetic_bar' });
        } else {
          resolved = '—';
          role = 'fraction_bar';
          decisions.push({ id: sym.id, from: sym.symbol, to: '—', role, reason: 'numerator_and_denominator_present' });
        }
      } else {
        // Sin numerador+denominador completo: distinguir línea geométrica vs signo menos
        const isVeryWide = sym.box.w >= medH * 3.2;
        const isolated = !left && !right;
        if ((category === 'geometry' && (isVeryWide || isolated)) || (isVeryWide && isolated)) {
          resolved = 'line';
          role = 'geometric_line';
          ignored = true;
          decisions.push({ id: sym.id, from: sym.symbol, to: 'line', role, reason: 'wide_or_isolated_geometric_line' });
        } else {
          resolved = '-';
          role = 'minus';
          if (sym.symbol !== '-') {
            decisions.push({ id: sym.id, from: sym.symbol, to: '-', role, reason: 'inline_minus_operator' });
          }
        }
      }
    }

    // B) Punto decimal ('.' / ',') vs punto de multiplicación vs punto accidental
    else if (isDotLike(sym, medH)) {
      const isComma = sym.symbol === ',';
      const leftIsDigit = left && isDigitStr(left.symbol);
      const rightIsDigit = right && isDigitStr(right.symbol);
      const gapL = left ? sym.box.minX - left.box.maxX : Infinity;
      const gapR = right ? right.box.minX - sym.box.maxX : Infinity;
      const nearBaseline =
        left && right
          ? sym.box.cy >= Math.min(left.box.cy, right.box.cy) - medH * 0.1
          : true;
      const verticallyCentered =
        left && right
          ? Math.abs(sym.box.cy - (left.box.cy + right.box.cy) / 2) <= medH * 0.25 &&
            sym.box.maxY < Math.min(left.box.maxY, right.box.maxY) - medH * 0.15
          : false;

      if (sym.symbol === '·' || (sym.symbol === '.' && verticallyCentered && left && right && gapL <= medH * 1.1 && gapR <= medH * 1.1)) {
        resolved = '×';
        role = 'mul_dot';
        decisions.push({ id: sym.id, from: sym.symbol, to: '×', role, reason: 'vertically_centered_multiplication_dot' });
      } else if (leftIsDigit && rightIsDigit && nearBaseline && gapL <= medH * 0.65 && gapR <= medH * 0.65) {
        // Punto o coma decimal válido
        role = 'decimal';
        decisions.push({ id: sym.id, from: sym.symbol, to: resolved, role, reason: 'tight_between_digits_baseline' });
      } else if (isComma && left && right && gapL <= medH * 1.2 && gapR <= medH * 1.8) {
        // Coma separadora en par ordenado (2, 5) o sucesión 2, 4, 6
        role = 'separator';
        decisions.push({ id: sym.id, from: sym.symbol, to: ',', role, reason: 'list_or_pair_separator' });
      } else {
        // Punto accidental / ruido aislado
        role = 'accidental_dot';
        ignored = true;
        decisions.push({ id: sym.id, from: sym.symbol, to: null, role, reason: 'isolated_or_floating_accidental_dot' });
      }
    }

    // C) 'x' / 'X' vs '×'
    else if (sym.symbol === 'x' || sym.symbol === 'X' || sym.symbol === '×') {
      const leftIsNum = left && (isDigitStr(left.symbol) || left.symbol === ')');
      const rightIsNum = right && (isDigitStr(right.symbol) || right.symbol === '(');
      const hasExp = hasScriptOnRight(sym);
      const isLeftOfEquals = right && RELATION_CHARS.has(right.symbol);
      const isRightOfOp = left && (OPERATOR_CHARS.has(left.symbol) || OPEN_DELIMS.has(left.symbol));
      const isLeftOfAddSub = right && (right.symbol === '+' || right.symbol === '-' || right.symbol === '−');
      const isFuncArg = left?.symbol === '(' && right?.symbol === ')';
      const isScientific =
        left && isDigitStr(left.symbol) &&
        right && right.symbol === '1' &&
        symbols.some(o => o.box.minX > right.box.minX && o.symbol === '0' && hasScriptOnRight(o));

      if (sym.symbol === '×' && category !== 'algebra') {
        resolved = '×';
        role = 'operator';
      } else if (isScientific) {
        resolved = '×';
        role = 'operator';
        decisions.push({ id: sym.id, from: sym.symbol, to: '×', role, reason: 'scientific_notation_operator' });
      } else if (hasExp || isFuncArg || isLeftOfEquals || isLeftOfAddSub || (isRightOfOp && !rightIsNum)) {
        resolved = 'x';
        role = 'variable';
        if (sym.symbol !== 'x') {
          decisions.push({ id: sym.id, from: sym.symbol, to: 'x', role, reason: 'algebraic_position_or_exponent' });
        }
      } else if (category === 'numbers' && leftIsNum && rightIsNum) {
        resolved = '×';
        role = 'operator';
        decisions.push({ id: sym.id, from: sym.symbol, to: '×', role, reason: 'numbers_category_between_operands' });
      } else if (leftIsNum && rightIsNum && !hasAlgebraCues) {
        resolved = '×';
        role = 'operator';
        if (sym.symbol !== '×') {
          decisions.push({ id: sym.id, from: sym.symbol, to: '×', role, reason: 'between_numeric_operands' });
        }
      } else if (category === 'algebra' || hasAlgebraCues || (leftIsNum && !rightIsNum)) {
        resolved = 'x';
        role = 'variable';
        if (sym.symbol !== 'x') {
          decisions.push({ id: sym.id, from: sym.symbol, to: 'x', role, reason: 'algebraic_context' });
        }
      } else if (leftIsNum && rightIsNum) {
        resolved = '×';
        role = 'operator';
        decisions.push({ id: sym.id, from: sym.symbol, to: '×', role, reason: 'default_multiplication_between_numbers' });
      } else {
        resolved = 'x';
        role = 'variable';
      }
    }

    // D) '0' vs 'O'
    else if (sym.symbol === '0' || sym.symbol === 'O' || sym.symbol === 'o') {
      const adjacentDigit = (left && isDigitStr(left.symbol)) || (right && isDigitStr(right.symbol));
      const adjacentDecimal = (left && (left.symbol === '.' || left.symbol === ',')) || (right && (right.symbol === '.' || right.symbol === ','));
      const adjacentUpperGeo = (left && /^[A-Z]$/.test(left.symbol)) || (right && /^[A-Z]$/.test(right.symbol));
      if (category === 'geometry' && !adjacentDigit && !adjacentDecimal) {
        resolved = 'O';
        role = 'label';
        if (sym.symbol !== 'O') {
          decisions.push({ id: sym.id, from: sym.symbol, to: 'O', role, reason: 'geometry_label_context' });
        }
      } else if (adjacentUpperGeo && !adjacentDigit) {
        resolved = 'O';
        role = 'label';
        decisions.push({ id: sym.id, from: sym.symbol, to: 'O', role, reason: 'adjacent_uppercase_geometry_labels' });
      } else {
        resolved = '0';
        role = 'digit';
        if (sym.symbol !== '0') {
          decisions.push({ id: sym.id, from: sym.symbol, to: '0', role, reason: 'numeric_or_algebraic_zero' });
        }
      }
    }

    // E) '1' vs 'l' / 'I'
    else if (sym.symbol === '1' || sym.symbol === 'l' || sym.symbol === 'I') {
      const adjacentDigit = (left && isDigitStr(left.symbol)) || (right && isDigitStr(right.symbol));
      const adjacentOp = (left && OPERATOR_CHARS.has(left.symbol)) || (right && OPERATOR_CHARS.has(right.symbol));
      const isClearLetter = s => /^[a-zA-Z]$/.test(s) && !['x', 'X', 'O', 'o'].includes(s);
      const adjacentLetter = (left && isClearLetter(left.symbol)) || (right && isClearLetter(right.symbol));
      if (category === 'geometry' && !adjacentDigit && !adjacentOp) {
        resolved = sym.symbol === 'I' ? 'I' : 'l';
        role = 'label';
        if (sym.symbol === '1') {
          decisions.push({ id: sym.id, from: '1', to: resolved, role, reason: 'geometry_label_context' });
        }
      } else if (category !== 'numbers' && adjacentLetter && !adjacentDigit && !adjacentOp) {
        resolved = sym.symbol === 'I' ? 'I' : 'l';
        role = 'variable';
        if (sym.symbol === '1') {
          decisions.push({ id: sym.id, from: '1', to: resolved, role, reason: 'adjacent_letter_context' });
        }
      } else {
        resolved = '1';
        role = 'digit';
        if (sym.symbol !== '1') {
          decisions.push({ id: sym.id, from: sym.symbol, to: '1', role, reason: 'numeric_expression_context' });
        }
      }
    }

    // F) Normalización de operadores unicode equivalentes
    else if (sym.symbol === '−' || sym.symbol === '–') {
      resolved = '-';
    } else if (sym.symbol === '<=' ) {
      resolved = '≤';
    } else if (sym.symbol === '>=' ) {
      resolved = '≥';
    } else if (sym.symbol === '!=' ) {
      resolved = '≠';
    }

    // Preferencia de perfil de usuario para multiplicación (solo si no es variable)
    if (resolved === '×' && userProfile.multiplicationSymbol === '·') {
      // Mantenemos '×' en AST y reflejamos preferencia en metadata
    }

    if (ignored) {
      ignoredIds.push(sym.id);
    } else {
      result.push(
        Object.freeze({
          ...sym,
          symbol: resolved,
          role,
          confidence
        })
      );
    }
  }

  return { symbols: result, decisions, ignoredIds };
}

// ---------------------------------------------------------------------------
// 4. Parser estructural 2D -> AST
// ---------------------------------------------------------------------------

/**
 * Construye una secuencia de tokens estructurados (resolviendo fracciones 2D,
 * radicales 2D, potencias y subíndices) a partir de una región 2D de símbolos.
 */
function buildLinearizedItems(regionSymbols, medH, constructs, depth = 0) {
  if (!regionSymbols.length || depth > 8) return [];

  // 1. Resolver fracciones 2D: elegir las barras más anchas primero (soporta anidadas)
  const bars = regionSymbols
    .filter(s => s.role === 'fraction_bar' || isHorizontalBarShape(s, medH))
    .sort((a, b) => b.box.w - a.box.w);

  const consumed = new Set();
  const compositeItems = [];

  for (const bar of bars) {
    if (consumed.has(bar.id)) continue;
    const pad = Math.max(6, medH * 0.28);
    const above = [];
    const below = [];
    for (const s of regionSymbols) {
      if (s.id === bar.id || consumed.has(s.id)) continue;
      if (s.box.cx < bar.box.minX - pad || s.box.cx > bar.box.maxX + pad) continue;
      if (s.box.maxY <= bar.box.cy + medH * 0.22) above.push(s);
      else if (s.box.minY >= bar.box.cy - medH * 0.22) below.push(s);
    }
    if (above.length > 0 && below.length > 0) {
      consumed.add(bar.id);
      for (const s of above) consumed.add(s.id);
      for (const s of below) consumed.add(s.id);
      if (depth > 0) constructs.add('nested_fraction');
      else constructs.add('fraction');

      const numAst = parseRegion2D(above, medH, constructs, depth + 1);
      const denAst = parseRegion2D(below, medH, constructs, depth + 1);
      const allSyms = [bar, ...above, ...below];
      const fracBox = normalizeBox({
        minX: Math.min(...allSyms.map(s => s.box.minX)),
        minY: Math.min(...allSyms.map(s => s.box.minY)),
        maxX: Math.max(...allSyms.map(s => s.box.maxX)),
        maxY: Math.max(...allSyms.map(s => s.box.maxY))
      });
      compositeItems.push({
        kind: 'ast',
        node: { type: 'Fraction', numerator: numAst, denominator: denAst },
        box: fracBox,
        baselineCy: bar.box.cy,
        strokeIds: allSyms.flatMap(s => s.strokeIds)
      });
    }
  }

  // 2. Resolver radicales 2D (√)
  const rads = regionSymbols.filter(s => !consumed.has(s.id) && (s.isRadical || s.symbol === '√'));
  for (const rad of rads) {
    if (consumed.has(rad.id)) continue;
    const inside = [];
    const indexSyms = [];
    for (const s of regionSymbols) {
      if (s.id === rad.id || consumed.has(s.id)) continue;
      const rel = classifySpatialRelation(rad, s, medH);
      if (rel.type === 'inside_radical') inside.push(s);
      else if (rel.type === 'radical_index') indexSyms.push(s);
    }
    if (inside.length > 0) {
      consumed.add(rad.id);
      for (const s of inside) consumed.add(s.id);
      for (const s of indexSyms) consumed.add(s.id);
      constructs.add('radical');
      const radicand = parseRegion2D(inside, medH, constructs, depth + 1);
      const index = indexSyms.length ? parseRegion2D(indexSyms, medH, constructs, depth + 1) : null;
      const allSyms = [rad, ...inside, ...indexSyms];
      const radBox = normalizeBox({
        minX: Math.min(...allSyms.map(s => s.box.minX)),
        minY: Math.min(...allSyms.map(s => s.box.minY)),
        maxX: Math.max(...allSyms.map(s => s.box.maxX)),
        maxY: Math.max(...allSyms.map(s => s.box.maxY))
      });
      compositeItems.push({
        kind: 'ast',
        node: { type: 'Radical', radicand, index },
        box: radBox,
        baselineCy: rad.box.cy,
        strokeIds: allSyms.flatMap(s => s.strokeIds)
      });
    }
  }

  // 3. Resto de símbolos individuales + compuestos, ordenados de izquierda a derecha
  const remaining = regionSymbols
    .filter(s => !consumed.has(s.id))
    .map(s => ({
      kind: 'symbol',
      sym: s,
      box: s.box,
      baselineCy: s.box.cy,
      strokeIds: s.strokeIds
    }));

  const allItems = [...compositeItems, ...remaining].sort(
    (a, b) => a.box.minX - b.box.minX || a.box.minY - b.box.minY
  );

  // 4. Agrupar superíndices y subíndices sobre su base precedente
  const merged = [];
  let i = 0;
  while (i < allItems.length) {
    const cur = allItems[i];
    // Un operador o delimitador de apertura no toma exponente/subíndice
    const canTakeScript =
      cur.kind === 'ast' ||
      (cur.kind === 'symbol' &&
        (isDigitStr(cur.sym.symbol) ||
          isLetterStr(cur.sym.symbol) ||
          CLOSE_DELIMS.has(cur.sym.symbol)));

    if (!canTakeScript) {
      merged.push(cur);
      i++;
      continue;
    }

    // Si es un dígito, primero consumir dígitos contiguos al mismo baseline para formar el número base (ej. 10^4)
    let baseItem = cur;
    if (cur.kind === 'symbol' && isDigitStr(cur.sym.symbol)) {
      const numSyms = [cur.sym];
      let k = i + 1;
      while (k < allItems.length && allItems[k].kind === 'symbol') {
        const nextSym = allItems[k].sym;
        const prevSym = numSyms[numSyms.length - 1];
        const gap = nextSym.box.minX - prevSym.box.maxX;
        const rel = classifySpatialRelation(prevSym, nextSym, medH);
        const isNumPart =
          isDigitStr(nextSym.symbol) ||
          ((nextSym.symbol === '.' || nextSym.symbol === ',') && nextSym.role === 'decimal');
        if (isNumPart && rel.type === 'right' && gap <= medH * 0.95) {
          numSyms.push(nextSym);
          k++;
        } else {
          break;
        }
      }
      if (numSyms.length > 1) {
        const rawText = numSyms.map(s => s.symbol).join('');
        const decSep = rawText.includes(',') ? ',' : rawText.includes('.') ? '.' : null;
        if (decSep) constructs.add('decimal');
        else constructs.add('number');
        const numBox = normalizeBox({
          minX: Math.min(...numSyms.map(s => s.box.minX)),
          minY: Math.min(...numSyms.map(s => s.box.minY)),
          maxX: Math.max(...numSyms.map(s => s.box.maxX)),
          maxY: Math.max(...numSyms.map(s => s.box.maxY))
        });
        baseItem = {
          kind: 'ast',
          node: { type: 'NumberLiteral', raw: rawText, decimalSeparator: decSep },
          box: numBox,
          baselineCy: numBox.cy,
          strokeIds: numSyms.flatMap(s => s.strokeIds)
        };
        i = k;
      } else {
        i++;
      }
    } else {
      i++;
    }

    // Comprobar si los siguientes elementos son superíndice o subíndice de baseItem
    const supItems = [];
    const subItems = [];
    let anchor = { box: baseItem.box, isRadical: false, symbol: '' };

    while (i < allItems.length) {
      const next = allItems[i];
      const nextStub = { box: next.box, isRadical: false, symbol: next.sym?.symbol || '' };
      const rel = classifySpatialRelation(anchor, nextStub, medH);
      if (rel.type === 'superscript' && subItems.length === 0) {
        supItems.push(next);
        i++;
        // Continuar absorbiendo tokens en el mismo baseline elevado del exponente
        while (i < allItems.length) {
          const cont = allItems[i];
          const prevSup = supItems[supItems.length - 1];
          const gap = cont.box.minX - prevSup.box.maxX;
          const sameSupLevel =
            Math.abs(cont.box.cy - prevSup.box.cy) <= Math.max(prevSup.box.h, medH * 0.6) * 0.75 &&
            cont.box.maxY < baseItem.box.maxY - baseItem.box.h * 0.12 &&
            gap <= medH * 1.1;
          if (sameSupLevel) {
            supItems.push(cont);
            i++;
          } else {
            break;
          }
        }
      } else if (rel.type === 'subscript' && supItems.length === 0) {
        subItems.push(next);
        i++;
        while (i < allItems.length) {
          const cont = allItems[i];
          const prevSub = subItems[subItems.length - 1];
          const gap = cont.box.minX - prevSub.box.maxX;
          const sameSubLevel =
            Math.abs(cont.box.cy - prevSub.box.cy) <= Math.max(prevSub.box.h, medH * 0.6) * 0.75 &&
            cont.box.minY > baseItem.box.minY + baseItem.box.h * 0.12 &&
            gap <= medH * 1.1;
          if (sameSubLevel) {
            subItems.push(cont);
            i++;
          } else {
            break;
          }
        }
      } else {
        break;
      }
    }

    if (supItems.length > 0 || subItems.length > 0) {
      const baseNode = itemToAtomAst(baseItem, constructs);
      let node = baseNode;
      if (supItems.length > 0) {
        constructs.add('power');
        const expNode = parseLinearizedItems(supItems, medH, constructs, depth + 1);
        node = { type: 'Power', base: node, exponent: expNode };
      }
      if (subItems.length > 0) {
        constructs.add('subscript');
        const subNode = parseLinearizedItems(subItems, medH, constructs, depth + 1);
        node = { type: 'Subscript', base: node, subscript: subNode };
      }
      const allBoxes = [baseItem.box, ...supItems.map(x => x.box), ...subItems.map(x => x.box)];
      merged.push({
        kind: 'ast',
        node,
        box: normalizeBox({
          minX: Math.min(...allBoxes.map(b => b.minX)),
          minY: Math.min(...allBoxes.map(b => b.minY)),
          maxX: Math.max(...allBoxes.map(b => b.maxX)),
          maxY: Math.max(...allBoxes.map(b => b.maxY))
        }),
        baselineCy: baseItem.baselineCy,
        strokeIds: [
          ...baseItem.strokeIds,
          ...supItems.flatMap(x => x.strokeIds),
          ...subItems.flatMap(x => x.strokeIds)
        ]
      });
    } else {
      merged.push(baseItem);
    }
  }

  return merged;
}

function itemToAtomAst(item, constructs) {
  if (item.kind === 'ast') return item.node;
  const s = item.sym.symbol;
  if (isDigitStr(s)) {
    constructs.add('number');
    return { type: 'NumberLiteral', raw: s, decimalSeparator: null };
  }
  if (isLetterStr(s)) {
    constructs.add('variable');
    return { type: 'Identifier', name: s };
  }
  return { type: 'Symbol', value: s };
}

/**
 * Convierte items linealizados en tokens de parser (números, identificadores, operadores, AST 2D).
 */
function itemsToTokens(items, medH, constructs) {
  const tokens = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'ast') {
      tokens.push({ kind: 'ast', node: item.node, box: item.box });
      continue;
    }
    const sym = item.sym;
    const ch = sym.symbol;

    if (isDigitStr(ch)) {
      constructs.add('number');
      tokens.push({
        kind: 'ast',
        node: { type: 'NumberLiteral', raw: ch, decimalSeparator: null },
        box: item.box
      });
    } else if (isLetterStr(ch)) {
      constructs.add('variable');
      tokens.push({
        kind: 'ast',
        node: { type: 'Identifier', name: ch },
        box: item.box
      });
    } else if (ch === '%') {
      tokens.push({ kind: 'percent', value: '%', box: item.box });
    } else if (ch === ',' && sym.role === 'separator') {
      tokens.push({ kind: 'comma', value: ',', box: item.box });
    } else if (ch === ',' && !sym.role) {
      tokens.push({ kind: 'comma', value: ',', box: item.box });
    } else if (ch === '…' || ch === '...') {
      tokens.push({ kind: 'ellipsis', value: '...', box: item.box });
    } else if (RELATION_CHARS.has(ch)) {
      tokens.push({ kind: 'relation', value: ch, box: item.box });
    } else if (OPEN_DELIMS.has(ch)) {
      tokens.push({ kind: 'open', value: ch, box: item.box });
    } else if (CLOSE_DELIMS.has(ch)) {
      tokens.push({ kind: 'close', value: ch, box: item.box });
    } else if (ch === ':') {
      tokens.push({ kind: 'ratio', value: ':', box: item.box });
    } else if (['+', '-', '×', '÷', '/', '±'].includes(ch)) {
      tokens.push({ kind: 'op', value: ch, box: item.box });
    } else {
      tokens.push({ kind: 'ast', node: { type: 'Symbol', value: ch }, box: item.box });
    }
  }
  return tokens;
}

function parseLinearizedItems(items, medH, constructs, depth = 0) {
  const tokens = itemsToTokens(items, medH, constructs);
  return parseTokenStream(tokens, constructs, depth);
}

function parseRegion2D(regionSymbols, medH, constructs, depth = 0) {
  const items = buildLinearizedItems(regionSymbols, medH, constructs, depth);
  return parseLinearizedItems(items, medH, constructs, depth);
}

/**
 * Parser descendente recursivo sobre tokens con precedencia matemática estándar:
 * 1. Sequence (términos separados por comas al nivel superior, ej. 2, 4, 6, 8)
 * 2. Relation (=, <, >, ≤, ≥, ≠) — soporta expresiones incompletas como "2 + 3 ="
 * 3. Ratio (:) — ej. 3:4 = 6:8
 * 4. Additive (+, -, ±)
 * 5. Multiplicative (×, ÷, /, multiplicación implícita, notación científica, números mixtos)
 * 6. Unary (-, +)
 * 7. Postfix (%)
 * 8. Primary (números, identificadores, llamadas f(x), grupos (), pares ordenados (a, b), nodos 2D)
 */
function parseTokenStream(tokens, constructs, depth = 0) {
  if (!tokens.length) return { type: 'Empty' };

  let pos = 0;
  const peek = (offset = 0) => tokens[pos + offset] || null;
  const consume = () => tokens[pos++];

  function parseTop() {
    const first = parseRelation();
    // Detectar sucesión: 2, 4, 6, 8 (al nivel superior, fuera de paréntesis)
    if (peek()?.kind === 'comma') {
      const terms = [first];
      while (peek()?.kind === 'comma') {
        consume();
        if (peek()?.kind === 'ellipsis') {
          consume();
          terms.push({ type: 'Ellipsis' });
          break;
        }
        if (!peek()) break;
        terms.push(parseRelation());
      }
      constructs.add('sequence');
      return { type: 'Sequence', terms };
    }
    return first;
  }

  function parseRelation() {
    let left = parseRatio();
    while (peek()?.kind === 'relation') {
      const op = consume().value;
      if (op === '=') constructs.add('equation');
      else constructs.add('inequality');
      const right = peek() && peek().kind !== 'close' && peek().kind !== 'comma'
        ? parseRatio()
        : { type: 'Empty' };
      // Etiquetar definición de función (ej. f(x) = 2x + 1)
      if (op === '=' && left.type === 'FunctionCall') {
        constructs.add('function');
      }
      left = { type: 'Relation', operator: op, left, right };
    }
    return left;
  }

  function parseRatio() {
    let left = parseAdditive();
    while (peek()?.kind === 'ratio') {
      consume();
      constructs.add('ratio');
      const right = peek() ? parseAdditive() : { type: 'Empty' };
      left = { type: 'Ratio', left, right };
    }
    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (peek()?.kind === 'op' && (peek().value === '+' || peek().value === '-' || peek().value === '±')) {
      const op = consume().value;
      constructs.add('operation');
      const right = peek() && peek().kind !== 'close' && peek().kind !== 'relation' && peek().kind !== 'comma'
        ? parseMultiplicative()
        : { type: 'Empty' };
      left = { type: 'BinaryOp', operator: op, left, right };
    }
    return left;
  }

  function canStartImplicitMul(tok) {
    if (!tok) return false;
    return tok.kind === 'ast' || tok.kind === 'open';
  }

  function parseMultiplicative() {
    let left = parseUnary();
    while (peek()) {
      const t = peek();
      if (t.kind === 'op' && (t.value === '×' || t.value === '÷' || t.value === '/')) {
        const op = consume().value;
        constructs.add('operation');
        const right = peek() && peek().kind !== 'close' && peek().kind !== 'relation' && peek().kind !== 'comma'
          ? parseUnary()
          : { type: 'Empty' };

        // Detectar notación científica: a × 10^n
        if (
          op === '×' &&
          isNumericNode(left) &&
          right.type === 'Power' &&
          right.base?.type === 'NumberLiteral' &&
          right.base.raw === '10'
        ) {
          constructs.add('scientific_notation');
          left = {
            type: 'ScientificNotation',
            mantissa: left,
            base: right.base,
            exponent: right.exponent
          };
        } else {
          left = { type: 'BinaryOp', operator: op, left, right };
        }
      } else if (canStartImplicitMul(t)) {
        // Número entero seguido directamente de fracción numérica -> número mixto (ej. 2 1/3)
        if (
          left.type === 'NumberLiteral' &&
          !left.decimalSeparator &&
          t.kind === 'ast' &&
          t.node.type === 'Fraction' &&
          isPureNumericNode(t.node.numerator) &&
          isPureNumericNode(t.node.denominator)
        ) {
          consume();
          constructs.add('mixed_number');
          left = { type: 'MixedNumber', whole: left, fraction: t.node };
        } else {
          // Multiplicación implícita algebraica: 2x, 3(x+1), xy, 2√3
          const right = parseUnary();
          constructs.add('algebra');
          left = { type: 'ImplicitMul', left, right };
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parseUnary() {
    if (peek()?.kind === 'op' && (peek().value === '-' || peek().value === '+')) {
      const op = consume().value;
      if (op === '-') constructs.add('negative');
      const operand = peek() ? parseUnary() : { type: 'Empty' };
      return { type: 'UnaryOp', operator: op, operand };
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let node = parsePrimary();
    while (peek()?.kind === 'percent') {
      consume();
      constructs.add('percentage');
      node = { type: 'Percentage', value: node };
    }
    return node;
  }

  function parsePrimary() {
    const t = peek();
    if (!t) return { type: 'Empty' };

    if (t.kind === 'open') {
      const openDelim = consume().value;
      const expectedClose = MATCHING_DELIM[openDelim];
      const elements = [];
      if (peek() && peek().kind !== 'close') {
        elements.push(parseRelation());
        while (peek()?.kind === 'comma') {
          consume();
          elements.push(parseRelation());
        }
      }
      let closed = false;
      if (peek()?.kind === 'close') {
        const closeDelim = consume().value;
        closed = closeDelim === expectedClose;
      }
      if (elements.length === 2 && openDelim === '(') {
        constructs.add('ordered_pair');
        return { type: 'OrderedPair', x: elements[0], y: elements[1], closed };
      }
      if (elements.length > 2 && openDelim === '(') {
        constructs.add('tuple');
        return { type: 'Tuple', elements, closed };
      }
      constructs.add('group');
      return {
        type: 'Group',
        open: openDelim,
        close: expectedClose,
        body: elements[0] || { type: 'Empty' },
        closed
      };
    }

    if (t.kind === 'ast') {
      consume();
      const node = t.node;
      // Llamada a función: f(x), g(t)
      if (
        node.type === 'Identifier' &&
        FUNCTION_NAMES.has(node.name) &&
        peek()?.kind === 'open' &&
        peek().value === '('
      ) {
        consume(); // '('
        const args = [];
        if (peek() && peek().kind !== 'close') {
          args.push(parseRelation());
          while (peek()?.kind === 'comma') {
            consume();
            args.push(parseRelation());
          }
        }
        if (peek()?.kind === 'close') consume();
        constructs.add('function');
        return { type: 'FunctionCall', name: node.name, args };
      }
      return node;
    }

    if (t.kind === 'ellipsis') {
      consume();
      return { type: 'Ellipsis' };
    }

    // Fallback seguro para tokens inesperados sin perder fidelidad
    consume();
    return { type: 'Symbol', value: t.value || '' };
  }

  return parseTop();
}

function isNumericNode(node) {
  if (!node) return false;
  if (node.type === 'NumberLiteral') return true;
  if (node.type === 'UnaryOp' && node.operator === '-') return isNumericNode(node.operand);
  return false;
}

function isPureNumericNode(node) {
  return Boolean(node && node.type === 'NumberLiteral');
}

// ---------------------------------------------------------------------------
// 5. Serializadores: AST -> LaTeX, MathML y Texto plano
// ---------------------------------------------------------------------------

const LATEX_OP = {
  '+': '+',
  '-': '-',
  '±': '\\pm',
  '×': '\\times',
  '÷': '\\div',
  '/': '/',
  '=': '=',
  '<': '<',
  '>': '>',
  '≤': '\\leq',
  '≥': '\\geq',
  '≠': '\\neq'
};

const LATEX_GREEK = {
  'π': '\\pi',
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'θ': '\\theta',
  'Δ': '\\Delta',
  'Σ': '\\Sigma',
  'λ': '\\lambda',
  'μ': '\\mu',
  'σ': '\\sigma',
  'ω': '\\omega',
  'φ': '\\phi'
};

export function astToLatex(node) {
  if (!node) return '';
  switch (node.type) {
    case 'Empty':
      return '';
    case 'NumberLiteral':
      return node.raw;
    case 'Identifier':
      return LATEX_GREEK[node.name] || node.name;
    case 'Symbol':
      return node.value;
    case 'Ellipsis':
      return '\\ldots';
    case 'UnaryOp':
      return `${node.operator}${astToLatex(node.operand)}`;
    case 'BinaryOp': {
      const op = LATEX_OP[node.operator] || node.operator;
      const rhs = astToLatex(node.right);
      return rhs ? `${astToLatex(node.left)} ${op} ${rhs}` : `${astToLatex(node.left)} ${op}`;
    }
    case 'ImplicitMul':
      return `${astToLatex(node.left)}${astToLatex(node.right)}`;
    case 'Relation': {
      const op = LATEX_OP[node.operator] || node.operator;
      const rhs = astToLatex(node.right);
      return rhs ? `${astToLatex(node.left)} ${op} ${rhs}` : `${astToLatex(node.left)} ${op}`;
    }
    case 'Ratio':
      return `${astToLatex(node.left)}:${astToLatex(node.right)}`;
    case 'Fraction':
      return `\\frac{${astToLatex(node.numerator)}}{${astToLatex(node.denominator)}}`;
    case 'MixedNumber':
      return `${astToLatex(node.whole)}\\frac{${astToLatex(node.fraction.numerator)}}{${astToLatex(node.fraction.denominator)}}`;
    case 'Power':
      return `${astToLatex(node.base)}^{${astToLatex(node.exponent)}}`;
    case 'Subscript':
      return `${astToLatex(node.base)}_{${astToLatex(node.subscript)}}`;
    case 'Radical':
      return node.index
        ? `\\sqrt[${astToLatex(node.index)}]{${astToLatex(node.radicand)}}`
        : `\\sqrt{${astToLatex(node.radicand)}}`;
    case 'Percentage':
      return `${astToLatex(node.value)}\\%`;
    case 'ScientificNotation':
      return `${astToLatex(node.mantissa)} \\times 10^{${astToLatex(node.exponent)}}`;
    case 'Group': {
      const open = node.open === '{' ? '\\{' : node.open;
      const close = node.close === '}' ? '\\}' : node.close;
      return `${open}${astToLatex(node.body)}${close}`;
    }
    case 'OrderedPair':
      return `(${astToLatex(node.x)}, ${astToLatex(node.y)})`;
    case 'Tuple':
      return `(${node.elements.map(astToLatex).join(', ')})`;
    case 'Sequence':
      return node.terms.map(astToLatex).join(', ');
    case 'FunctionCall':
      return `${node.name}(${node.args.map(astToLatex).join(', ')})`;
    case 'System':
      return `\\begin{cases} ${node.equations.map(astToLatex).join(' \\\\ ')} \\end{cases}`;
    case 'Multiline':
      return node.lines.map(astToLatex).join(' \\\\ ');
    case 'VerticalArithmetic': {
      const op = LATEX_OP[node.operator] || node.operator;
      const rows = node.operands.map((val, idx) =>
        idx === node.operands.length - 1 ? `${op}\\ ${val}` : val
      );
      const body = rows.join(' \\\\ ') + ' \\\\ \\hline' + (node.result != null ? ` ${node.result}` : '');
      return `\\begin{array}{r} ${body} \\end{array}`;
    }
    default:
      return '';
  }
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nodeToMathMLInner(node) {
  if (!node) return '';
  switch (node.type) {
    case 'Empty':
      return '';
    case 'NumberLiteral':
      return `<mn>${escapeXml(node.raw)}</mn>`;
    case 'Identifier':
      return `<mi>${escapeXml(node.name)}</mi>`;
    case 'Symbol':
      return `<mo>${escapeXml(node.value)}</mo>`;
    case 'Ellipsis':
      return `<mo>…</mo>`;
    case 'UnaryOp':
      return `<mrow><mo>${escapeXml(node.operator)}</mo>${nodeToMathMLInner(node.operand)}</mrow>`;
    case 'BinaryOp':
      return `<mrow>${nodeToMathMLInner(node.left)}<mo>${escapeXml(node.operator)}</mo>${nodeToMathMLInner(node.right)}</mrow>`;
    case 'ImplicitMul':
      return `<mrow>${nodeToMathMLInner(node.left)}<mo>&#x2062;</mo>${nodeToMathMLInner(node.right)}</mrow>`;
    case 'Relation':
      return `<mrow>${nodeToMathMLInner(node.left)}<mo>${escapeXml(node.operator)}</mo>${nodeToMathMLInner(node.right)}</mrow>`;
    case 'Ratio':
      return `<mrow>${nodeToMathMLInner(node.left)}<mo>:</mo>${nodeToMathMLInner(node.right)}</mrow>`;
    case 'Fraction':
      return `<mfrac><mrow>${nodeToMathMLInner(node.numerator)}</mrow><mrow>${nodeToMathMLInner(node.denominator)}</mrow></mfrac>`;
    case 'MixedNumber':
      return `<mrow>${nodeToMathMLInner(node.whole)}<mo>&#x2064;</mo>${nodeToMathMLInner(node.fraction)}</mrow>`;
    case 'Power':
      return `<msup><mrow>${nodeToMathMLInner(node.base)}</mrow><mrow>${nodeToMathMLInner(node.exponent)}</mrow></msup>`;
    case 'Subscript':
      return `<msub><mrow>${nodeToMathMLInner(node.base)}</mrow><mrow>${nodeToMathMLInner(node.subscript)}</mrow></msub>`;
    case 'Radical':
      return node.index
        ? `<mroot><mrow>${nodeToMathMLInner(node.radicand)}</mrow><mrow>${nodeToMathMLInner(node.index)}</mrow></mroot>`
        : `<msqrt>${nodeToMathMLInner(node.radicand)}</msqrt>`;
    case 'Percentage':
      return `<mrow>${nodeToMathMLInner(node.value)}<mo>%</mo></mrow>`;
    case 'ScientificNotation':
      return `<mrow>${nodeToMathMLInner(node.mantissa)}<mo>×</mo><msup><mn>10</mn><mrow>${nodeToMathMLInner(node.exponent)}</mrow></msup></mrow>`;
    case 'Group':
      return `<mrow><mo>${escapeXml(node.open)}</mo>${nodeToMathMLInner(node.body)}<mo>${escapeXml(node.close)}</mo></mrow>`;
    case 'OrderedPair':
      return `<mrow><mo>(</mo>${nodeToMathMLInner(node.x)}<mo>,</mo>${nodeToMathMLInner(node.y)}<mo>)</mo></mrow>`;
    case 'Tuple':
      return `<mrow><mo>(</mo>${node.elements.map(nodeToMathMLInner).join('<mo>,</mo>')}<mo>)</mo></mrow>`;
    case 'Sequence':
      return `<mrow>${node.terms.map(nodeToMathMLInner).join('<mo>,</mo>')}</mrow>`;
    case 'FunctionCall':
      return `<mrow><mi>${escapeXml(node.name)}</mi><mo>(</mo>${node.args.map(nodeToMathMLInner).join('<mo>,</mo>')}<mo>)</mo></mrow>`;
    case 'System': {
      const rows = node.equations.map(eq => `<mtr><mtd>${nodeToMathMLInner(eq)}</mtd></mtr>`).join('');
      return `<mrow><mo>{</mo><mtable>${rows}</mtable></mrow>`;
    }
    case 'Multiline': {
      const rows = node.lines.map(l => `<mtr><mtd>${nodeToMathMLInner(l)}</mtd></mtr>`).join('');
      return `<mtable>${rows}</mtable>`;
    }
    case 'VerticalArithmetic': {
      const rows = node.operands.map((val, idx) =>
        idx === node.operands.length - 1
          ? `<mtr><mtd><mo>${escapeXml(node.operator)}</mo><mn>${escapeXml(val)}</mn></mtd></mtr>`
          : `<mtr><mtd><mn>${escapeXml(val)}</mn></mtd></mtr>`
      );
      if (node.result != null) {
        rows.push(`<mtr><mtd><mn>${escapeXml(node.result)}</mn></mtd></mtr>`);
      }
      return `<mtable columnalign="right">${rows.join('')}</mtable>`;
    }
    default:
      return '';
  }
}

export function astToMathML(node) {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${nodeToMathMLInner(node)}</math>`;
}

export function astToText(node) {
  if (!node) return '';
  switch (node.type) {
    case 'Empty': return '';
    case 'NumberLiteral': return node.raw;
    case 'Identifier': return node.name;
    case 'Symbol': return node.value;
    case 'Ellipsis': return '...';
    case 'UnaryOp': return `${node.operator}${astToText(node.operand)}`;
    case 'BinaryOp': {
      const rhs = astToText(node.right);
      return rhs ? `${astToText(node.left)} ${node.operator} ${rhs}` : `${astToText(node.left)} ${node.operator}`;
    }
    case 'ImplicitMul': return `${astToText(node.left)}${astToText(node.right)}`;
    case 'Relation': {
      const rhs = astToText(node.right);
      return rhs ? `${astToText(node.left)} ${node.operator} ${rhs}` : `${astToText(node.left)} ${node.operator}`;
    }
    case 'Ratio': return `${astToText(node.left)}:${astToText(node.right)}`;
    case 'Fraction': return `(${astToText(node.numerator)})/(${astToText(node.denominator)})`;
    case 'MixedNumber': return `${astToText(node.whole)} ${astToText(node.fraction.numerator)}/${astToText(node.fraction.denominator)}`;
    case 'Power': return `${astToText(node.base)}^(${astToText(node.exponent)})`;
    case 'Subscript': return `${astToText(node.base)}_${astToText(node.subscript)}`;
    case 'Radical': return node.index ? `root[${astToText(node.index)}](${astToText(node.radicand)})` : `√(${astToText(node.radicand)})`;
    case 'Percentage': return `${astToText(node.value)}%`;
    case 'ScientificNotation': return `${astToText(node.mantissa)} × 10^${astToText(node.exponent)}`;
    case 'Group': return `${node.open}${astToText(node.body)}${node.close}`;
    case 'OrderedPair': return `(${astToText(node.x)}, ${astToText(node.y)})`;
    case 'Tuple': return `(${node.elements.map(astToText).join(', ')})`;
    case 'Sequence': return node.terms.map(astToText).join(', ');
    case 'FunctionCall': return `${node.name}(${node.args.map(astToText).join(', ')})`;
    case 'System': return node.equations.map(astToText).join(' ; ');
    case 'Multiline': return node.lines.map(astToText).join('\n');
    case 'VerticalArithmetic':
      return `${node.operands.join(` ${node.operator} `)}${node.result != null ? ` = ${node.result}` : ''}`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// 6. Orquestador de parseo estructural 2D completo
// ---------------------------------------------------------------------------

/**
 * Parsea un conjunto de símbolos posicionados en 2D y devuelve AST, LaTeX, MathML,
 * texto plano, construcciones detectadas, desambiguaciones y confianza calibrada.
 * Jamás corrige errores matemáticos ni calcula resultados.
 */
export function parseMathStructure(rawSymbols, options = {}) {
  const disamb = disambiguateSymbols(rawSymbols, options);
  const symbols = disamb.symbols;

  if (!symbols.length) {
    return {
      ast: { type: 'Empty' },
      latex: '',
      mathml: astToMathML({ type: 'Empty' }),
      text: '',
      constructs: [],
      disambiguations: disamb.decisions,
      ignoredIds: disamb.ignoredIds,
      spatial: analyzeSpatialRelations([]),
      complete: false,
      confidence: scoreConfidence({ symbols: [], ast: { type: 'Empty' }, complete: false }),
      strokeIds: []
    };
  }

  const spatial = analyzeSpatialRelations(symbols);
  const constructs = new Set();
  const medH = spatial.medianHeight || 30;
  let ast;

  // Caso 1: Algoritmo de aritmética vertical (+, -, ×, ÷)
  if (spatial.verticalArithmetic && spatial.verticalArithmetic.usedIds.length >= symbols.length - 1) {
    constructs.add('vertical_arithmetic');
    ast = {
      type: 'VerticalArithmetic',
      operator: spatial.verticalArithmetic.operator,
      operands: [...spatial.verticalArithmetic.operands],
      result: spatial.verticalArithmetic.result,
      hasBar: true
    };
  }
  // Caso 2: Múltiples líneas (sistema de ecuaciones o multilínea)
  else if (spatial.lines.length >= 2) {
    const lineAsts = spatial.lines.map(line => parseRegion2D(line.symbols, medH, constructs, 0));
    const hasBrace = spatial.lines.some(l => l.hasSystemBrace);
    const allRelations = lineAsts.every(n => n.type === 'Relation');
    if (hasBrace || (allRelations && (constructs.has('variable') || options.category === 'algebra'))) {
      constructs.add('system');
      ast = { type: 'System', equations: lineAsts, hasBrace };
    } else {
      constructs.add('multiline');
      ast = { type: 'Multiline', lines: lineAsts };
    }
  }
  // Caso 3: Expresión 2D en una línea (puede contener fracciones anidadas, potencias, raíces, etc.)
  else {
    const lineSymbols = spatial.lines[0]?.symbols || symbols;
    ast = parseRegion2D(lineSymbols, medH, constructs, 0);
  }

  const complete = isAstComplete(ast);
  const confidence = scoreConfidence({
    symbols,
    ast,
    complete,
    disambiguations: disamb.decisions,
    ignoredIds: disamb.ignoredIds
  });

  return {
    ast,
    latex: astToLatex(ast),
    mathml: astToMathML(ast),
    text: astToText(ast),
    constructs: [...constructs],
    disambiguations: disamb.decisions,
    ignoredIds: disamb.ignoredIds,
    spatial,
    complete,
    confidence,
    strokeIds: [...new Set(symbols.flatMap(s => s.strokeIds))]
  };
}

/**
 * Determina si un AST está estructuralmente completo (sin operadores colgantes
 * ni paréntesis sin cerrar). Útil para evitar transformaciones prematuras.
 */
export function isAstComplete(node) {
  if (!node || node.type === 'Empty') return false;
  switch (node.type) {
    case 'NumberLiteral':
    case 'Identifier':
    case 'Symbol':
    case 'Ellipsis':
      return true;
    case 'UnaryOp':
      return isAstComplete(node.operand);
    case 'BinaryOp':
    case 'ImplicitMul':
    case 'Ratio':
      return isAstComplete(node.left) && isAstComplete(node.right);
    case 'Relation':
      // En pedagogía "2 + 3 =" es una expresión válida de enunciado, pero
      // para auto-transformación inmediata se marca incompleta si right es Empty
      return isAstComplete(node.left) && isAstComplete(node.right);
    case 'Fraction':
      return isAstComplete(node.numerator) && isAstComplete(node.denominator);
    case 'MixedNumber':
      return isAstComplete(node.whole) && isAstComplete(node.fraction);
    case 'Power':
      return isAstComplete(node.base) && isAstComplete(node.exponent);
    case 'Subscript':
      return isAstComplete(node.base) && isAstComplete(node.subscript);
    case 'Radical':
      return isAstComplete(node.radicand) && (!node.index || isAstComplete(node.index));
    case 'Percentage':
      return isAstComplete(node.value);
    case 'ScientificNotation':
      return isAstComplete(node.mantissa) && isAstComplete(node.exponent);
    case 'Group':
      return node.closed !== false && isAstComplete(node.body);
    case 'OrderedPair':
      return node.closed !== false && isAstComplete(node.x) && isAstComplete(node.y);
    case 'Tuple':
      return node.closed !== false && node.elements.length > 0 && node.elements.every(isAstComplete);
    case 'Sequence':
      return node.terms.length >= 2 && node.terms.every(isAstComplete);
    case 'FunctionCall':
      return node.args.length > 0 && node.args.every(isAstComplete);
    case 'System':
      return node.equations.length >= 2 && node.equations.every(isAstComplete);
    case 'Multiline':
      return node.lines.length >= 1 && node.lines.every(isAstComplete);
    case 'VerticalArithmetic':
      return node.operands.length >= 2;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 7. Calibración de confianza y fusión multi-motor
// ---------------------------------------------------------------------------

/**
 * Calcula una confianza calibrada (score 0..1 y nivel high / medium / low).
 */
export function scoreConfidence({ symbols = [], ast = null, complete = false, disambiguations = [], ignoredIds = [] } = {}) {
  if (!symbols.length || !ast || ast.type === 'Empty') {
    return { score: 0, tier: 'low', reasons: ['empty_expression'] };
  }

  const confs = symbols.map(s => (Number.isFinite(s.confidence) ? s.confidence : 0.85));
  const meanConf = confs.reduce((a, b) => a + b, 0) / confs.length;
  const minConf = Math.min(...confs);

  let score = meanConf * 0.65 + minConf * 0.35;
  const reasons = [];

  if (!complete) {
    score -= 0.18;
    reasons.push('incomplete_structure');
  }
  if (ignoredIds.length > 0) {
    score -= Math.min(0.12, ignoredIds.length * 0.04);
    reasons.push('accidental_marks_filtered');
  }
  // Penalización leve solo si hubo muchas desambiguaciones con baja confianza
  const lowConfDisamb = disambiguations.filter(d => {
    const s = symbols.find(x => x.id === d.id);
    return s && s.confidence < 0.75;
  });
  if (lowConfDisamb.length > 0) {
    score -= Math.min(0.15, lowConfDisamb.length * 0.06);
    reasons.push('ambiguous_symbols');
  }

  score = clamp(Number(score.toFixed(4)), 0, 1);
  const tier = score >= 0.82 ? 'high' : score >= 0.55 ? 'medium' : 'low';
  return { score, tier, meanSymbolConfidence: Number(meanConf.toFixed(4)), minSymbolConfidence: Number(minConf.toFixed(4)), reasons };
}

function canonicalComparable(candidate) {
  const s = String(candidate?.latex || candidate?.text || '')
    .replace(/\s+/g, '')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠');
  return s;
}

/**
 * Fusiona interpretaciones de múltiples motores (estructural 2D, ML Kit, plantillas locales, etc.)
 * combinando confianza, contexto matemático, relaciones espaciales, categoría activa,
 * orden temporal, perfil de usuario y validez estructural.
 * Nunca altera ni corrige errores matemáticos escritos por el docente.
 */
export function fuseInterpretations(candidates, context = {}) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(
    c => c && (c.latex || c.text || c.ast)
  );
  if (!list.length) return null;

  const activeCategory = context.activeCategory || 'auto';
  const userProfile = context.userProfile || {};
  const has2DStructure = Boolean(
    context.spatialRelations?.fractionBars?.some(fb => fb.isCompleteFraction) ||
    context.spatialRelations?.radicals?.some(r => r.insideIds?.length > 0) ||
    context.spatialRelations?.pairs?.some(p => p.relation === 'superscript' || p.relation === 'subscript')
  );

  // Agrupar por forma canónica para detectar consenso multi-motor
  const canonicalCounts = new Map();
  for (const c of list) {
    const key = canonicalComparable(c);
    if (!canonicalCounts.has(key)) canonicalCounts.set(key, new Set());
    canonicalCounts.get(key).add(c.source || 'unknown');
  }

  const scored = list.map(c => {
    const base = clamp(Number(c.confidence) || 0.5, 0, 1);
    let score = base * 0.55;
    const breakdown = { base: Number((base * 0.55).toFixed(4)) };

    // Validez estructural
    const valid = c.structuralValid !== undefined ? Boolean(c.structuralValid) : Boolean(c.ast ? isAstComplete(c.ast) : true);
    const structBonus = valid ? 0.18 : -0.15;
    score += structBonus;
    breakdown.structuralValidity = structBonus;

    // Alineación con categoría activa
    let catBonus = 0;
    const exprText = String(c.latex || c.text || '');
    if (activeCategory === 'algebra' && /[a-zA-Z]/.test(exprText.replace(/\\[a-zA-Z]+/g, ''))) catBonus = 0.08;
    else if (activeCategory === 'numbers' && !/[a-wyzA-WYZ]/.test(exprText.replace(/\\[a-zA-Z]+/g, ''))) catBonus = 0.08;
    else if (activeCategory === 'geometry' && c.category === 'geometry') catBonus = 0.08;
    else if (activeCategory === 'data' && c.category === 'data') catBonus = 0.08;
    score += catBonus;
    breakdown.categoryMatch = catBonus;

    // Relaciones espaciales 2D: preferir motor que captura fracciones/potencias/raíces reales
    let spatialBonus = 0;
    if (has2DStructure) {
      const captures2D = /\\frac|\\sqrt|\^|_/.test(exprText) || c.source === 'structural-2d';
      spatialBonus = captures2D ? 0.14 : -0.08;
    }
    score += spatialBonus;
    breakdown.spatialMatch = spatialBonus;

    // Consistencia temporal (si el motor la reporta)
    const temporalBonus = Number.isFinite(c.temporalScore) ? clamp(c.temporalScore, 0, 1) * 0.05 : 0.025;
    score += temporalBonus;
    breakdown.temporal = Number(temporalBonus.toFixed(4));

    // Preferencia de perfil de usuario (ej. coma vs punto decimal)
    let profileBonus = 0;
    if (userProfile.decimalSeparator && exprText.includes(userProfile.decimalSeparator)) {
      profileBonus = 0.04;
    }
    score += profileBonus;
    breakdown.userProfile = profileBonus;

    // Consenso entre fuentes independientes
    const key = canonicalComparable(c);
    const agreeingSources = canonicalCounts.get(key)?.size || 1;
    const consensusBonus = agreeingSources >= 2 ? 0.12 : 0;
    score += consensusBonus;
    breakdown.consensus = consensusBonus;

    const finalScore = clamp(Number(score.toFixed(4)), 0, 1);
    return {
      candidate: c,
      key,
      agreeingSources,
      score: finalScore,
      breakdown
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const consensus = top.agreeingSources >= 2;
  const tier = top.score >= 0.82 ? 'high' : top.score >= 0.55 ? 'medium' : 'low';
  const autoAccept = tier === 'high' && (consensus || (top.candidate.source === 'structural-2d' && top.candidate.confidence >= 0.9 && top.candidate.structuralValid !== false));

  // Alternativas únicas ordenadas por puntaje
  const seenKeys = new Set();
  const alternatives = [];
  for (const s of scored) {
    if (seenKeys.has(s.key)) continue;
    seenKeys.add(s.key);
    alternatives.push({
      source: s.candidate.source || 'unknown',
      latex: s.candidate.latex ?? '',
      text: s.candidate.text ?? '',
      mathml: s.candidate.mathml ?? '',
      ast: s.candidate.ast ?? null,
      score: s.score,
      agreeingSources: s.agreeingSources
    });
  }

  return {
    best: alternatives[0],
    alternatives,
    score: top.score,
    tier,
    consensus,
    autoAccept,
    needsReview: !autoAccept,
    breakdown: top.breakdown
  };
}

// ---------------------------------------------------------------------------
// 8. Gestor de reconocimiento progresivo / incremental
// ---------------------------------------------------------------------------

/**
 * Crea un gestor de estado incremental para escritura matemática en vivo:
 * - Ventana temporal adaptativa según la cadencia real del docente.
 * - Detección de pausa natural para evitar transformaciones prematuras.
 * - Reinterpretación espacial completa del grupo cuando llegan trazos fuera de orden
 *   (ej: 3 -> barra -> 4 -> + -> 1 -> barra -> 2, o barra primero y luego numerador).
 * - Cancelación de trabajos obsoletos mediante jobId monotónico.
 */
export function createProgressiveRecognizer(options = {}) {
  const minPauseMs = options.minPauseMs ?? 380;
  const maxPauseMs = options.maxPauseMs ?? 1350;
  const initialPauseMs = options.initialPauseMs ?? 650;
  const parseOptions = {
    category: options.category || 'auto',
    userProfile: options.userProfile || {}
  };

  let items = [];
  let intervals = [];
  let lastTimestamp = null;
  let jobCounter = 0;
  let activeJobId = 0;
  let lastCommittedJobId = 0;
  let cachedPreview = null;
  let cancelledJobs = [];

  function computeAdaptivePauseMs() {
    if (intervals.length < 2) return initialPauseMs;
    const recent = intervals.slice(-8);
    const med = median(recent, initialPauseMs / 2);
    // La pausa natural es ~2.1x el intervalo típico entre trazos, acotada
    return Math.round(clamp(med * 2.1, minPauseMs, maxPauseMs));
  }

  function startNewJob() {
    if (activeJobId > lastCommittedJobId) {
      cancelledJobs.push(activeJobId);
    }
    jobCounter += 1;
    activeJobId = jobCounter;
    return activeJobId;
  }

  /**
   * Añade un símbolo/grupo nuevo (inmutable) y reinterpreta todo el grupo 2D.
   * Cancela cualquier trabajo anterior pendiente.
   */
  function addSymbol(rawSymbol, now = Date.now()) {
    const normalized = normalizeSymbol(
      { ...rawSymbol, timestamp: rawSymbol?.timestamp ?? now },
      items.length
    );
    if (!normalized) return null;

    if (lastTimestamp !== null && now >= lastTimestamp) {
      const dt = now - lastTimestamp;
      if (dt > 20 && dt < 4000) intervals.push(dt);
    }
    lastTimestamp = now;

    // Nunca mutar el arreglo previo
    items = [...items, normalized];
    const jobId = startNewJob();

    // Reinterpretar espacialmente el grupo completo (independiente del orden de llegada)
    const preview = parseMathStructure(items, parseOptions);
    cachedPreview = preview;

    return {
      jobId,
      state: 'writing',
      shouldTransform: false,
      adaptivePauseMs: computeAdaptivePauseMs(),
      preview
    };
  }

  /**
   * Evalúa el estado en el instante `now` (sin setTimeout, determinista y testeable).
   * Evita transformaciones prematuras si no pasó la pausa natural o la estructura
   * sigue incompleta.
   */
  function evaluate(now = Date.now(), { force = false } = {}) {
    if (!items.length || !cachedPreview) {
      return {
        jobId: activeJobId,
        state: 'idle',
        shouldTransform: false,
        adaptivePauseMs: computeAdaptivePauseMs(),
        preview: null
      };
    }

    const elapsed = lastTimestamp !== null ? Math.max(0, now - lastTimestamp) : 0;
    const adaptivePauseMs = computeAdaptivePauseMs();

    if (!force && elapsed < adaptivePauseMs) {
      const state = elapsed >= adaptivePauseMs * 0.5 ? 'hesitating' : 'writing';
      return {
        jobId: activeJobId,
        state,
        shouldTransform: false,
        elapsedMs: elapsed,
        adaptivePauseMs,
        preview: cachedPreview
      };
    }

    // Pausa natural alcanzada (o force): revisar completitud y confianza
    const complete = cachedPreview.complete;
    const tier = cachedPreview.confidence.tier;
    const shouldTransform = force
      ? cachedPreview.ast.type !== 'Empty'
      : complete && tier === 'high';

    return {
      jobId: activeJobId,
      state: shouldTransform ? 'ready' : 'needs_review',
      shouldTransform,
      elapsedMs: elapsed,
      adaptivePauseMs,
      preview: cachedPreview
    };
  }

  /**
   * Confirma un resultado asíncrono solo si su jobId sigue vigente (cancela obsoletos).
   */
  function commitJob(jobId, result) {
    if (jobId !== activeJobId) {
      return { accepted: false, reason: 'stale_job', activeJobId };
    }
    lastCommittedJobId = jobId;
    return { accepted: true, jobId, result };
  }

  function isJobCurrent(jobId) {
    return jobId === activeJobId;
  }

  function reset() {
    if (activeJobId > lastCommittedJobId) cancelledJobs.push(activeJobId);
    items = [];
    intervals = [];
    lastTimestamp = null;
    cachedPreview = null;
    jobCounter += 1;
    activeJobId = jobCounter;
  }

  function getSnapshot() {
    return Object.freeze({
      count: items.length,
      items: Object.freeze([...items]),
      activeJobId,
      lastCommittedJobId,
      cancelledJobs: Object.freeze([...cancelledJobs]),
      adaptivePauseMs: computeAdaptivePauseMs(),
      preview: cachedPreview
    });
  }

  return {
    addSymbol,
    evaluate,
    commitJob,
    isJobCurrent,
    reset,
    getSnapshot
  };
}
