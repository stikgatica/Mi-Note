import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBox,
  normalizeSymbol,
  classifySpatialRelation,
  analyzeSpatialRelations,
  disambiguateSymbols,
  parseMathStructure,
  astToLatex,
  astToMathML,
  scoreConfidence,
  fuseInterpretations,
  createProgressiveRecognizer
} from '../src/math/math-structural.mjs';

// Helper para crear símbolos posicionados de forma limpia y legible
const sym = (symbol, x, y, w = 22, h = 36, extra = {}) => ({
  id: extra.id || `${symbol}_${x}_${y}`,
  symbol,
  box: { minX: x, minY: y, maxX: x + w, maxY: y + h },
  confidence: extra.confidence ?? 0.95,
  strokeIds: extra.strokeIds || [`st_${symbol}_${x}_${y}`],
  ...extra
});

// Helper para construir una línea horizontal rápida de símbolos con espaciado uniforme
function lineOf(tokens, startX = 40, baseY = 100, step = 30, h = 36) {
  return tokens.map((tok, i) => {
    const ch = typeof tok === 'string' ? tok : tok.symbol;
    const w = typeof tok === 'object' && tok.w ? tok.w : ch === '.' || ch === ',' ? 6 : 22;
    const th = typeof tok === 'object' && tok.h ? tok.h : ch === '.' || ch === ',' ? 8 : ch === '-' || ch === '−' ? 6 : h;
    const ty =
      typeof tok === 'object' && tok.y !== undefined
        ? tok.y
        : ch === '.' || ch === ','
          ? baseY + h - 8
          : ch === '-' || ch === '−'
            ? baseY + h / 2 - 3
            : baseY;
    const tx = typeof tok === 'object' && tok.x !== undefined ? tok.x : startX + i * step;
    return sym(ch, tx, ty, w, th, typeof tok === 'object' ? tok : {});
  });
}

// ---------------------------------------------------------------------------
// 1. Inmutabilidad y normalización
// ---------------------------------------------------------------------------

test('inmutabilidad: nunca muta los símbolos ni las cajas de entrada', () => {
  const input = [
    sym('2', 40, 100),
    sym('+', 75, 105, 22, 24),
    sym('3', 110, 100)
  ];
  const snapshot = JSON.stringify(input);
  const res = parseMathStructure(input);
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(res.latex, '2 + 3');
});

test('normalizeBox soporta formatos {minX,maxX}, {x,width} y {x,right}', () => {
  const a = normalizeBox({ minX: 10, minY: 20, maxX: 50, maxY: 60 });
  const b = normalizeBox({ x: 10, y: 20, width: 40, height: 40 });
  const c = normalizeBox({ x: 10, y: 20, right: 50, bottom: 60 });
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(a.cx, 30);
  assert.equal(a.cy, 40);
});

// ---------------------------------------------------------------------------
// 2. Números naturales, enteros, negativos y decimales (coma y punto)
// ---------------------------------------------------------------------------

test('parsea números naturales, negativos y decimales con coma y con punto conservando separador', () => {
  const nat = parseMathStructure(lineOf(['4', '2']));
  assert.equal(nat.ast.type, 'NumberLiteral');
  assert.equal(nat.latex, '42');
  assert.match(nat.mathml, /<mn>42<\/mn>/);

  const neg = parseMathStructure(lineOf(['-', '1', '5']));
  assert.equal(neg.ast.type, 'UnaryOp');
  assert.equal(neg.latex, '-15');

  const decComma = parseMathStructure([
    sym('3', 40, 100, 22, 36),
    sym(',', 65, 128, 6, 8),
    sym('7', 74, 100, 22, 36),
    sym('5', 99, 100, 22, 36)
  ]);
  assert.equal(decComma.latex, '3,75');
  assert.equal(decComma.ast.decimalSeparator, ',');

  const decDot = parseMathStructure([
    sym('3', 40, 100, 22, 36),
    sym('.', 65, 129, 6, 7),
    sym('7', 74, 100, 22, 36),
    sym('5', 99, 100, 22, 36)
  ]);
  assert.equal(decDot.latex, '3.75');
  assert.equal(decDot.ast.decimalSeparator, '.');
});

// ---------------------------------------------------------------------------
// 3. Fracciones simples, fracciones anidadas y números mixtos
// ---------------------------------------------------------------------------

test('parsea fracción simple 2D a AST, LaTeX y MathML', () => {
  const syms = [
    sym('3', 120, 60, 22, 34),
    sym('—', 100, 102, 65, 5, { isBar: true }),
    sym('4', 120, 114, 22, 34)
  ];
  const res = parseMathStructure(syms);
  assert.equal(res.ast.type, 'Fraction');
  assert.equal(res.latex, '\\frac{3}{4}');
  assert.match(res.mathml, /<mfrac><mrow><mn>3<\/mn><\/mrow><mrow><mn>4<\/mn><\/mrow><\/mfrac>/);
  assert.ok(res.constructs.includes('fraction'));
});

test('parsea fracción anidada (1/2) / 3 correctamente', () => {
  const syms = [
    // Fracción interna 1/2 en el numerador
    sym('1', 125, 20, 18, 28),
    sym('—', 112, 54, 44, 4, { isBar: true }),
    sym('2', 125, 64, 18, 28),
    // Barra principal más ancha
    sym('—', 90, 104, 90, 5, { isBar: true }),
    // Denominador principal
    sym('3', 125, 118, 22, 34)
  ];
  const res = parseMathStructure(syms);
  assert.equal(res.ast.type, 'Fraction');
  assert.equal(res.ast.numerator.type, 'Fraction');
  assert.equal(res.latex, '\\frac{\\frac{1}{2}}{3}');
  assert.ok(res.constructs.includes('nested_fraction'));
});

test('parsea número mixto 2 1/3', () => {
  const syms = [
    sym('2', 50, 92, 24, 38),
    sym('1', 105, 62, 20, 32),
    sym('—', 88, 104, 54, 5, { isBar: true }),
    sym('3', 105, 116, 20, 32)
  ];
  const res = parseMathStructure(syms);
  assert.equal(res.ast.type, 'MixedNumber');
  assert.equal(res.latex, '2\\frac{1}{3}');
  assert.ok(res.constructs.includes('mixed_number'));
});

// ---------------------------------------------------------------------------
// 4. Potencias, subíndices, raíces, porcentajes, razones y notación científica
// ---------------------------------------------------------------------------

test('parsea potencias, exponentes compuestos y subíndices', () => {
  const pow = parseMathStructure([
    sym('x', 50, 100, 22, 36),
    sym('2', 78, 84, 14, 20)
  ]);
  assert.equal(pow.ast.type, 'Power');
  assert.equal(pow.latex, 'x^{2}');
  assert.match(pow.mathml, /<msup>/);

  const sub = parseMathStructure([
    sym('a', 50, 100, 22, 36),
    sym('n', 78, 122, 14, 20)
  ]);
  assert.equal(sub.ast.type, 'Subscript');
  assert.equal(sub.latex, 'a_{n}');
  assert.match(sub.mathml, /<msub>/);
});

test('parsea raíces cuadradas y raíces con índice (cúbica)', () => {
  const sqrt = parseMathStructure([
    sym('√', 50, 80, 95, 56, { isRadical: true }),
    sym('1', 85, 96, 20, 34),
    sym('6', 110, 96, 20, 34)
  ]);
  assert.equal(sqrt.ast.type, 'Radical');
  assert.equal(sqrt.latex, '\\sqrt{16}');
  assert.match(sqrt.mathml, /<msqrt>/);

  const cbrt = parseMathStructure([
    sym('√', 50, 80, 95, 56, { isRadical: true }),
    sym('3', 56, 84, 14, 18), // en la muesca superior izquierda del radical
    sym('8', 95, 96, 22, 34)
  ]);
  assert.equal(cbrt.ast.type, 'Radical');
  assert.equal(cbrt.latex, '\\sqrt[3]{8}');
  assert.match(cbrt.mathml, /<mroot>/);
});

test('parsea porcentajes, razones/proporciones y operaciones combinadas', () => {
  const pct = parseMathStructure(lineOf(['2', '5', '%']));
  assert.equal(pct.ast.type, 'Percentage');
  assert.equal(pct.latex, '25\\%');

  const prop = parseMathStructure(lineOf(['3', ':', '4', '=', '6', ':', '8']));
  assert.equal(prop.ast.type, 'Relation');
  assert.equal(prop.ast.left.type, 'Ratio');
  assert.equal(prop.ast.right.type, 'Ratio');
  assert.equal(prop.latex, '3:4 = 6:8');

  const comb = parseMathStructure(lineOf(['(', '2', '+', '3', ')', '×', '4']));
  assert.equal(comb.latex, '(2 + 3) \\times 4');
});

test('parsea notación científica con exponente positivo y negativo', () => {
  const sci = parseMathStructure([
    sym('3', 40, 100, 20, 36),
    sym('.', 63, 129, 6, 7),
    sym('5', 72, 100, 20, 36),
    sym('×', 102, 106, 20, 24),
    sym('1', 132, 100, 18, 36),
    sym('0', 154, 100, 20, 36),
    sym('-', 178, 92, 12, 4),
    sym('3', 194, 82, 14, 20)
  ]);
  assert.equal(sci.ast.type, 'ScientificNotation');
  assert.equal(sci.latex, '3.5 \\times 10^{-3}');
  assert.ok(sci.constructs.includes('scientific_notation'));
});

// ---------------------------------------------------------------------------
// 5. Algoritmos de aritmética vertical (+, -, ×, ÷) sin autocorregir
// ---------------------------------------------------------------------------

test('detecta aritmética vertical y preserva fielmente un resultado erróneo (12 + 15 = 29)', () => {
  const vertical = [
    // Fila 1: 12
    sym('1', 140, 60, 20, 34),
    sym('2', 165, 60, 20, 34),
    // Fila 2: + 15
    sym('+', 105, 115, 22, 24),
    sym('1', 140, 110, 20, 34),
    sym('5', 165, 110, 20, 34),
    // Barra horizontal
    sym('—', 100, 154, 95, 5, { isBar: true }),
    // Resultado escrito con error intencional: 29 (NO debe corregirse a 27)
    sym('2', 140, 168, 20, 34),
    sym('9', 165, 168, 20, 34)
  ];
  const res = parseMathStructure(vertical);
  assert.equal(res.ast.type, 'VerticalArithmetic');
  assert.equal(res.ast.operator, '+');
  assert.deepEqual(res.ast.operands, ['12', '15']);
  assert.equal(res.ast.result, '29');
  assert.match(res.latex, /\\begin\{array\}\{r\}/);
  assert.match(res.latex, /29/);
  assert.doesNotMatch(res.latex, /27/);
  assert.match(res.mathml, /<mtable/);
});

// ---------------------------------------------------------------------------
// 6. Álgebra: polinomios, ecuaciones, inecuaciones, sistemas, funciones, pares y sucesiones
// ---------------------------------------------------------------------------

test('parsea polinomio, ecuación, inecuación y función afín f(x) = 2x + 1', () => {
  // Polinomio: 3x^2 - 2x + 1
  const poly = parseMathStructure([
    sym('3', 20, 100, 20, 36),
    sym('x', 46, 100, 20, 36),
    sym('2', 70, 84, 14, 20),
    sym('-', 96, 115, 18, 5),
    sym('2', 124, 100, 20, 36),
    sym('x', 150, 100, 20, 36),
    sym('+', 180, 106, 20, 24),
    sym('1', 210, 100, 20, 36)
  ], { category: 'algebra' });
  assert.equal(poly.latex, '3x^{2} - 2x + 1');

  // Inecuación: 2x ≤ 10
  const ineq = parseMathStructure(lineOf(['2', 'x', '≤', '1', '0']), { category: 'algebra' });
  assert.equal(ineq.ast.type, 'Relation');
  assert.equal(ineq.ast.operator, '≤');
  assert.equal(ineq.latex, '2x \\leq 10');

  // Función afín: f(x) = 2x + 1
  const fn = parseMathStructure(lineOf(['f', '(', 'x', ')', '=', '2', 'x', '+', '1']), { category: 'algebra' });
  assert.equal(fn.ast.type, 'Relation');
  assert.equal(fn.ast.left.type, 'FunctionCall');
  assert.equal(fn.latex, 'f(x) = 2x + 1');
  assert.ok(fn.constructs.includes('function'));
});

test('parsea sistema de ecuaciones 2x2 con llave', () => {
  const sys = [
    sym('{', 15, 70, 18, 120),
    ...lineOf(['x', '+', 'y', '=', '5'], 45, 75, 28, 34),
    ...lineOf(['x', '-', 'y', '=', '1'], 45, 145, 28, 34)
  ];
  const res = parseMathStructure(sys, { category: 'algebra' });
  assert.equal(res.ast.type, 'System');
  assert.equal(res.ast.equations.length, 2);
  assert.equal(res.latex, '\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}');
  assert.match(res.mathml, /<mtable>/);
});

test('parsea par ordenado (2, 5) y sucesión 2, 4, 6, 8 sin confundirlos con decimal', () => {
  // Par ordenado con separación clara después de la coma
  const pair = parseMathStructure([
    sym('(', 20, 100, 14, 36),
    sym('2', 40, 100, 20, 36),
    sym(',', 64, 126, 6, 10),
    sym('5', 96, 100, 20, 36), // gap grande tras coma -> separador, no decimal
    sym(')', 122, 100, 14, 36)
  ]);
  assert.equal(pair.ast.type, 'OrderedPair');
  assert.equal(pair.latex, '(2, 5)');

  // Sucesión: 2, 4, 6, 8
  const seq = parseMathStructure([
    sym('2', 20, 100, 20, 36),
    sym(',', 44, 126, 6, 10),
    sym('4', 76, 100, 20, 36),
    sym(',', 100, 126, 6, 10),
    sym('6', 132, 100, 20, 36),
    sym(',', 156, 126, 6, 10),
    sym('8', 188, 100, 20, 36)
  ]);
  assert.equal(seq.ast.type, 'Sequence');
  assert.equal(seq.ast.terms.length, 4);
  assert.equal(seq.latex, '2, 4, 6, 8');
});

// ---------------------------------------------------------------------------
// 7. Desambiguación contextual
// ---------------------------------------------------------------------------

test('desambigua x vs × según contexto aritmético vs algebraico', () => {
  const arith = parseMathStructure(lineOf(['3', 'x', '4']), { category: 'numbers' });
  assert.equal(arith.latex, '3 \\times 4');

  const alg = parseMathStructure(lineOf(['2', 'x', '+', '3', '=', '7']), { category: 'algebra' });
  assert.equal(alg.latex, '2x + 3 = 7');
});

test('desambigua 0 vs O y 1 vs l según contexto numérico vs geométrico', () => {
  const numZero = disambiguateSymbols(lineOf(['1', 'O']), { category: 'numbers' });
  assert.equal(numZero.symbols.map(s => s.symbol).join(''), '10');

  const geoO = disambiguateSymbols([sym('0', 100, 100, 24, 34)], { category: 'geometry' });
  assert.equal(geoO.symbols[0].symbol, 'O');

  const numOne = disambiguateSymbols(lineOf(['l', '+', '2']), { category: 'numbers' });
  assert.equal(numOne.symbols[0].symbol, '1');

  const geoL = disambiguateSymbols([sym('1', 100, 100, 10, 34)], { category: 'geometry' });
  assert.equal(geoL.symbols[0].symbol, 'l');
});

test('desambigua exponente vs número independiente y línea geométrica vs barra de fracción', () => {
  // Número al mismo baseline -> NO es exponente (es número 23, no 2^3)
  const flat = parseMathStructure([
    sym('2', 40, 100, 22, 36),
    sym('3', 68, 100, 22, 36)
  ]);
  assert.equal(flat.ast.type, 'NumberLiteral');
  assert.equal(flat.latex, '23');

  // Línea horizontal aislada muy ancha en modo geometría -> línea geométrica ignorada como fracción
  const geoLine = disambiguateSymbols([sym('—', 50, 200, 260, 4, { isBar: true })], { category: 'geometry' });
  assert.equal(geoLine.symbols.length, 0);
  assert.equal(geoLine.decisions[0].role, 'geometric_line');
});

test('desambigua punto decimal válido vs punto accidental aislado', () => {
  const withNoise = parseMathStructure([
    sym('4', 40, 100, 22, 36),
    sym('.', 65, 129, 6, 7), // decimal válido
    sym('5', 74, 100, 22, 36),
    sym('.', 240, 40, 5, 5, { id: 'noise_dot' }) // punto accidental lejano y flotante
  ]);
  assert.equal(withNoise.latex, '4.5');
  assert.ok(withNoise.ignoredIds.includes('noise_dot'));
});

// ---------------------------------------------------------------------------
// 8. Fidelidad pedagógica: NUNCA corrige errores ni resuelve ejercicios
// ---------------------------------------------------------------------------

test('CRÍTICO: preserva errores matemáticos del docente (2+2=5, 3×4=15) y NO resuelve 2+3=', () => {
  const wrongAdd = parseMathStructure(lineOf(['2', '+', '2', '=', '5']));
  assert.equal(wrongAdd.latex, '2 + 2 = 5');
  assert.equal(wrongAdd.ast.right.raw, '5');

  const wrongMul = parseMathStructure(lineOf(['3', '×', '4', '=', '1', '5']));
  assert.equal(wrongMul.latex, '3 \\times 4 = 15');

  const openEq = parseMathStructure(lineOf(['2', '+', '3', '=']));
  assert.equal(openEq.latex, '2 + 3 =');
  assert.equal(openEq.ast.right.type, 'Empty');
  assert.equal(openEq.complete, false);
});

// ---------------------------------------------------------------------------
// 9. Reconocimiento progresivo / incremental (escritura fuera de orden + pausas + cancelación)
// ---------------------------------------------------------------------------

test('progresivo: reinterpreta grupo al escribir en orden no convencional 3 -> barra -> 4 -> + -> 1/2', () => {
  const prog = createProgressiveRecognizer({ initialPauseMs: 600 });

  // Paso 1: escribe '3'
  const r1 = prog.addSymbol(sym('3', 80, 60, 22, 34), 1000);
  assert.equal(r1.shouldTransform, false);
  assert.equal(r1.preview.latex, '3');

  // Paso 2: dibuja barra de fracción debajo del '3' (todavía sin denominador)
  const r2 = prog.addSymbol(sym('—', 60, 102, 65, 5, { isBar: true }), 1250);
  assert.equal(prog.isJobCurrent(r1.jobId), false); // job anterior cancelado
  assert.equal(prog.isJobCurrent(r2.jobId), true);

  // Paso 3: escribe '4' debajo de la barra -> ahora es \frac{3}{4}
  const r3 = prog.addSymbol(sym('4', 80, 114, 22, 34), 1500);
  assert.equal(r3.preview.latex, '\\frac{3}{4}');

  // Antes de la pausa natural, NO transforma prematuramente
  const early = prog.evaluate(1700);
  assert.equal(early.shouldTransform, false);

  // Paso 4: escribe '+' -> expresión incompleta, incluso tras pausa no auto-transforma
  prog.addSymbol(sym('+', 145, 92, 22, 24), 1750);
  const incompleteAfterPause = prog.evaluate(3000);
  assert.equal(incompleteAfterPause.shouldTransform, false);
  assert.equal(incompleteAfterPause.state, 'needs_review');

  // Paso 5..7: escribe 1/2 en orden inusual (barra primero, luego 2 abajo, luego 1 arriba)
  prog.addSymbol(sym('—', 185, 102, 65, 5, { isBar: true }), 1950);
  prog.addSymbol(sym('2', 205, 114, 22, 34), 2150);
  const rLast = prog.addSymbol(sym('1', 205, 60, 22, 34), 2350);

  assert.equal(rLast.preview.latex, '\\frac{3}{4} + \\frac{1}{2}');
  assert.equal(rLast.preview.complete, true);

  // Al cumplirse la pausa adaptativa, se marca ready para transformar
  const ready = prog.evaluate(2350 + rLast.adaptivePauseMs + 50);
  assert.equal(ready.state, 'ready');
  assert.equal(ready.shouldTransform, true);

  // Cancelación de trabajos obsoletos
  const staleCommit = prog.commitJob(r1.jobId, { latex: '3' });
  assert.equal(staleCommit.accepted, false);
  assert.equal(staleCommit.reason, 'stale_job');

  const validCommit = prog.commitJob(rLast.jobId, rLast.preview);
  assert.equal(validCommit.accepted, true);
});

// ---------------------------------------------------------------------------
// 10. Confianza calibrada y fusión multi-motor
// ---------------------------------------------------------------------------

test('scoreConfidence calibra niveles high, medium y low', () => {
  const high = scoreConfidence({
    symbols: [normalizeSymbol(sym('2', 10, 10, 20, 30, { confidence: 0.96 }))],
    ast: { type: 'NumberLiteral', raw: '2' },
    complete: true
  });
  assert.equal(high.tier, 'high');

  const medium = scoreConfidence({
    symbols: [normalizeSymbol(sym('2', 10, 10, 20, 30, { confidence: 0.7 }))],
    ast: { type: 'NumberLiteral', raw: '2' },
    complete: true
  });
  assert.equal(medium.tier, 'medium');

  const low = scoreConfidence({
    symbols: [normalizeSymbol(sym('2', 10, 10, 20, 30, { confidence: 0.45 }))],
    ast: { type: 'NumberLiteral', raw: '2' },
    complete: false
  });
  assert.equal(low.tier, 'low');
});

test('fuseInterpretations prioriza estructura 2D, categoría activa, perfil y consenso sin corregir errores', () => {
  const fracSyms = [
    sym('3', 120, 60, 22, 34),
    sym('—', 100, 102, 65, 5, { isBar: true }),
    sym('4', 120, 114, 22, 34)
  ];
  const spatial = analyzeSpatialRelations(fracSyms);

  // Motor estructural 2D vs OCR plano 1D
  const fused2D = fuseInterpretations(
    [
      { source: 'mlkit-1d', text: '3-4', latex: '3 - 4', confidence: 0.85, structuralValid: true },
      { source: 'structural-2d', text: '(3)/(4)', latex: '\\frac{3}{4}', confidence: 0.92, structuralValid: true }
    ],
    { activeCategory: 'numbers', spatialRelations: spatial }
  );
  assert.equal(fused2D.best.source, 'structural-2d');
  assert.equal(fused2D.best.latex, '\\frac{3}{4}');
  assert.equal(fused2D.tier, 'high');

  // Consenso multi-motor preservando error matemático 2+2=5
  const fusedConsensus = fuseInterpretations(
    [
      { source: 'structural-2d', text: '2 + 2 = 5', latex: '2 + 2 = 5', confidence: 0.9, structuralValid: true },
      { source: 'mlkit-es', text: '2+2=5', latex: '2 + 2 = 5', confidence: 0.88, structuralValid: true }
    ],
    { activeCategory: 'numbers', userProfile: { decimalSeparator: ',' } }
  );
  assert.equal(fusedConsensus.consensus, true);
  assert.equal(fusedConsensus.autoAccept, true);
  assert.equal(fusedConsensus.best.latex, '2 + 2 = 5');
});
