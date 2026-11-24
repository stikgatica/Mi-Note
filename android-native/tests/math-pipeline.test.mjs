import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATH_CATEGORIES,
  INTERVENTION_LEVELS,
  runMathPipeline,
  createProgressivePipeline,
  calibrateConfidence
} from '../src/math/math-pipeline.mjs';
import { handleWorkerMessage } from '../src/math/math-worker.js';
import { createUserProfile, recordUserCorrection } from '../src/math/math-personalization.mjs';

// ---------------------------------------------------------------------------
// Deterministic stroke generators (A5 1000x1400)
// ---------------------------------------------------------------------------

function lineStroke(id, x0, y0, x1, y1, steps = 14) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.5, 100 + i * 16]);
  }
  return { id, color: '#111827', width: 2.5, pts };
}

function closedPolygonStroke(id, vertices, stepsPerEdge = 12) {
  const pts = [];
  let tMs = 100;
  for (let e = 0; e < vertices.length; e++) {
    const a = vertices[e];
    const b = vertices[(e + 1) % vertices.length];
    for (let i = 0; i < stepsPerEdge; i++) {
      const t = i / stepsPerEdge;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.5, tMs]);
      tMs += 12;
    }
  }
  pts.push([vertices[0][0], vertices[0][1], 0.5, tMs]);
  return { id, color: '#111827', width: 2.5, pts };
}

function circleStroke(id, cx, cy, r, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5, 100 + i * 10]);
  }
  return { id, color: '#111827', width: 2.5, pts };
}

function makeTableStrokes() {
  return [
    lineStroke('h0', 100, 100, 400, 100),
    lineStroke('h1', 100, 180, 400, 180),
    lineStroke('h2', 100, 260, 400, 260),
    lineStroke('v0', 100, 100, 100, 260),
    lineStroke('v1', 250, 100, 250, 260),
    lineStroke('v2', 400, 100, 400, 260)
  ];
}

function sym(id, symbol, minX, minY, w, h, extra = {}) {
  return {
    id,
    symbol,
    box: { minX, minY, maxX: minX + w, maxY: minY + h },
    confidence: 0.96,
    strokeIds: [id],
    ...extra
  };
}

// ---------------------------------------------------------------------------
// 1. Exports & constants
// ---------------------------------------------------------------------------

test('exports MATH_CATEGORIES and INTERVENTION_LEVELS matching contract', () => {
  assert.deepEqual(MATH_CATEGORIES, ['auto', 'numbers', 'algebra', 'geometry', 'data']);
  assert.deepEqual(INTERVENTION_LEVELS, ['original', 'assisted', 'smart', 'digital']);
  assert.ok(Object.isFrozen(MATH_CATEGORIES));
  assert.ok(Object.isFrozen(INTERVENTION_LEVELS));
});

// ---------------------------------------------------------------------------
// 2. All 5 categories: auto, numbers, algebra, geometry, data
// ---------------------------------------------------------------------------

test('covers all 5 categories cleanly (numbers, algebra, geometry, data, auto)', () => {
  // numbers: 2 + 2 = 5 (also verifies error preservation!)
  const numTokens = [
    sym('s1', '2', 100, 200, 20, 32),
    sym('s2', '+', 135, 204, 22, 24),
    sym('s3', '2', 170, 200, 20, 32),
    sym('s4', '=', 205, 208, 22, 16),
    sym('s5', '5', 240, 200, 20, 32)
  ];
  const resNum = runMathPipeline([lineStroke('s1', 100, 200, 120, 232)], {
    category: 'numbers',
    symbolTokens: numTokens
  });
  assert.equal(resNum.winner.domain, 'math');
  assert.equal(resNum.winner.plainText, '2 + 2 = 5');
  assert.equal(resNum.winner.latex, '2 + 2 = 5');
  assert.equal(resNum.winner.preservedAsWritten, true);

  // algebra: x^2 + 3x = 0
  const algTokens = [
    sym('a1', 'x', 100, 200, 22, 32),
    sym('a2', '2', 124, 184, 14, 18),
    sym('a3', '+', 152, 204, 22, 24),
    sym('a4', '3', 186, 200, 20, 32),
    sym('a5', 'x', 212, 200, 22, 32),
    sym('a6', '=', 248, 208, 22, 16),
    sym('a7', '0', 284, 200, 20, 32)
  ];
  const resAlg = runMathPipeline([lineStroke('a1', 100, 200, 122, 232)], {
    category: 'algebra',
    symbolTokens: algTokens
  });
  assert.equal(resAlg.winner.domain, 'math');
  assert.equal(resAlg.winner.category, 'algebra');
  assert.match(resAlg.winner.latex, /x\^\{2\}/);
  assert.match(resAlg.winner.mathml, /<msup>/);

  // geometry: rectangle 200x100 (proportions preserved, NOT squashed into square)
  const rectStroke = closedPolygonStroke('rect1', [
    [100, 100], [300, 100], [300, 200], [100, 200]
  ]);
  const resGeo = runMathPipeline([rectStroke], { category: 'geometry' });
  assert.equal(resGeo.winner.domain, 'geometry');
  assert.equal(resGeo.winner.kind, 'rectangle');
  assert.notEqual(resGeo.winner.kind, 'square');

  // data: 2x2 table with NO invented values
  const tableStrokes = makeTableStrokes();
  const resData = runMathPipeline(tableStrokes, { category: 'data' });
  assert.equal(resData.winner.domain, 'data');
  assert.equal(resData.winner.kind, 'table');
  assert.equal(resData.winner.onlyWrittenDataPreserved, true);
  // Every unwritten cell must remain null (never invented!)
  for (const row of resData.winner.editableModel.data) {
    for (const cell of row) {
      assert.equal(cell.value, null);
    }
  }

  // auto: detects circle cleanly in auto mode
  const circ = circleStroke('c1', 300, 300, 80);
  const resAuto = runMathPipeline([circ], { category: 'auto' });
  assert.equal(resAuto.winner.domain, 'geometry');
  assert.equal(resAuto.winner.kind, 'circle');
});

// ---------------------------------------------------------------------------
// 3. All 4 intervention levels: original, assisted, smart, digital
// ---------------------------------------------------------------------------

test('respects all 4 intervention levels (original, assisted, smart, digital)', () => {
  const circ = circleStroke('c_int', 300, 300, 75);

  const orig = runMathPipeline([circ], { category: 'geometry', interventionLevel: 'original' });
  assert.equal(orig.action, 'keep-handwriting');
  assert.equal(orig.intervention.shouldAutoApply, false);
  assert.equal(orig.digitalObject, null);
  assert.equal(orig.originalStrokes.length, 1);

  const assisted = runMathPipeline([circ], { category: 'geometry', interventionLevel: 'assisted' });
  assert.equal(assisted.action, 'suggest');
  assert.equal(assisted.intervention.shouldAutoApply, false);
  assert.equal(assisted.digitalObject, null);
  assert.ok(assisted.suggestions.length >= 1);

  const smart = runMathPipeline([circ], { category: 'geometry', interventionLevel: 'smart' });
  assert.equal(smart.confidence.level, 'high');
  assert.equal(smart.action, 'auto-apply');
  assert.equal(smart.intervention.shouldAutoApply, true);
  assert.ok(smart.digitalObject);
  assert.equal(smart.digitalObject.revertable, true);
  assert.deepEqual(smart.digitalObject.sourceStrokeIds, ['c_int']);
  assert.equal(smart.digitalObject.originalStrokes.length, 1);

  // Smart mode with medium confidence must suggest, NOT auto-apply
  const medTokens = [
    sym('m1', '2', 100, 200, 20, 32, { confidence: 0.72 }),
    sym('m2', '+', 135, 204, 22, 24, { confidence: 0.70 }),
    sym('m3', '3', 170, 200, 20, 32, { confidence: 0.71 })
  ];
  const smartMed = runMathPipeline([lineStroke('m1', 100, 200, 120, 232)], {
    category: 'numbers',
    interventionLevel: 'smart',
    symbolTokens: medTokens
  });
  assert.equal(smartMed.confidence.level, 'medium');
  assert.equal(smartMed.action, 'suggest');
  assert.equal(smartMed.digitalObject, null);

  // Digital mode emits editable digital object with original strokes preserved for 1-click undo
  const digital = runMathPipeline([lineStroke('m1', 100, 200, 120, 232)], {
    category: 'numbers',
    interventionLevel: 'digital',
    symbolTokens: medTokens
  });
  assert.equal(digital.action, 'auto-apply');
  assert.ok(digital.digitalObject);
  assert.equal(digital.digitalObject.editable, true);
  assert.equal(digital.digitalObject.revertable, true);
  assert.equal(digital.digitalObject.originalStrokes.length, 1);
  assert.equal(digital.digitalObject.plainText, '2 + 3');
});

// ---------------------------------------------------------------------------
// 4. Hard constraints: NO auto-trapezoids & strict immutability
// ---------------------------------------------------------------------------

test('never auto-classifies a trapezoid and never mutates raw input strokes', () => {
  const trapezoidStroke = closedPolygonStroke('trap1', [
    [160, 100], [340, 100], [420, 240], [80, 240]
  ]);
  const snapshotBefore = JSON.stringify(trapezoidStroke);

  const res = runMathPipeline([trapezoidStroke], { category: 'geometry' });
  assert.ok(res.winner);
  assert.notEqual(res.winner.kind, 'trapezoid');
  assert.equal(res.winner.kind, 'polygon');
  assert.ok(!res.candidates.some(c => c.kind === 'trapezoid'));

  // Strict immutability check
  assert.equal(JSON.stringify(trapezoidStroke), snapshotBefore);
});

// ---------------------------------------------------------------------------
// 5. Fault isolation: throwing sub-engine never crashes or blocks others
// ---------------------------------------------------------------------------

test('isolates sub-engine faults and records diagnostics.engineErrors without crashing', () => {
  const circ = circleStroke('c_fault', 250, 250, 70);

  // Case A: Data engine throws -> geometry still succeeds
  const resA = runMathPipeline([circ], {
    category: 'auto',
    engines: {
      data: () => { throw new Error('simulated-data-crash'); }
    }
  });
  assert.equal(resA.winner.domain, 'geometry');
  assert.equal(resA.winner.kind, 'circle');
  assert.equal(resA.diagnostics.engineErrors.length, 1);
  assert.equal(resA.diagnostics.engineErrors[0].stage, 'data');
  assert.match(resA.diagnostics.engineErrors[0].message, /simulated-data-crash/);

  // Case B: DSP and geometry both throw -> structural math still succeeds
  const tokens = [
    sym('e1', '4', 100, 200, 20, 32),
    sym('e2', '+', 135, 204, 22, 24),
    sym('e3', '1', 170, 200, 16, 32)
  ];
  const resB = runMathPipeline([lineStroke('e1', 100, 200, 120, 232)], {
    category: 'numbers',
    symbolTokens: tokens,
    engines: {
      dsp: () => { throw new Error('dsp-boom'); },
      geometry: () => { throw new Error('geo-boom'); }
    }
  });
  assert.equal(resB.winner.domain, 'math');
  assert.equal(resB.winner.plainText, '4 + 1');
  assert.equal(resB.diagnostics.engineErrors.length, 2);
});

// ---------------------------------------------------------------------------
// 6. Personalization bias (bounded by ±0.12)
// ---------------------------------------------------------------------------

test('applies local UserHandwritingProfile bias to disambiguate close symbol candidates', () => {
  let profile = createUserProfile({ enabled: true });
  // Teach profile that teacher's '1' is frequently corrected to '7'
  for (let i = 0; i < 4; i++) {
    profile = recordUserCorrection(profile, { predicted: '1', actual: '7' });
  }

  const ambiguousTokens = [
    sym('p1', '1', 100, 200, 20, 32, {
      confidence: 0.76,
      alternatives: [{ symbol: '7', confidence: 0.74 }]
    }),
    sym('p2', '+', 135, 204, 22, 24),
    sym('p3', '2', 170, 200, 20, 32)
  ];

  const withoutProfile = runMathPipeline([lineStroke('p1', 100, 200, 120, 232)], {
    category: 'numbers',
    symbolTokens: ambiguousTokens
  });
  assert.equal(withoutProfile.winner.plainText, '1 + 2');

  const withProfile = runMathPipeline([lineStroke('p1', 100, 200, 120, 232)], {
    category: 'numbers',
    symbolTokens: ambiguousTokens,
    profile
  });
  assert.equal(withProfile.winner.plainText, '7 + 2');
  assert.ok(withProfile.diagnostics.personalizationApplied.length >= 1);
  for (const adj of withProfile.diagnostics.personalizationApplied) {
    assert.ok(Math.abs(adj.delta) <= 0.12);
  }
});

// ---------------------------------------------------------------------------
// 7. Progressive pipeline: out-of-order fractions & epoch cancellation
// ---------------------------------------------------------------------------

test('progressive pipeline handles out-of-order fractions and cancels stale epochs', async () => {
  const prog = createProgressivePipeline({ category: 'numbers', basePauseMs: 600 });

  // Teacher writes denominator '4' first, then fraction bar '—', then numerator '3' (out-of-order!)
  const u1 = prog.onStrokeFinished(lineStroke('f_den', 120, 240, 140, 272), {
    symbol: sym('f_den', '4', 120, 240, 20, 32),
    nowMs: 1000
  });
  const u2 = prog.onStrokeFinished(lineStroke('f_bar', 100, 228, 160, 228), {
    symbol: sym('f_bar', '-', 100, 224, 60, 8, { isBar: true }),
    nowMs: 1200
  });
  const u3 = prog.onStrokeFinished(lineStroke('f_num', 120, 180, 140, 212), {
    symbol: sym('f_num', '3', 120, 180, 20, 32),
    nowMs: 1400
  });

  // Stale epoch u1 must be rejected
  assert.equal(prog.isEpochCurrent(u1.epoch), false);
  assert.equal(prog.isEpochCurrent(u3.epoch), true);
  const staleRes = await prog.evaluateIfCurrent(u1.epoch, async () => ({ stale: true }));
  assert.equal(staleRes, null);

  // Before pause elapses -> does NOT transform prematurely
  const early = prog.evaluate(1550);
  assert.equal(early.shouldTransform, false);
  assert.equal(early.state, 'collecting');

  // After pause elapses -> full 2D fraction 3/4 recognized regardless of stroke order
  const ready = prog.evaluate(2600);
  assert.ok(ready.result);
  assert.equal(ready.result.winner.domain, 'math');
  assert.equal(ready.result.winner.latex, '\\frac{3}{4}');

  // Spatially related incoming stroke triggers shouldReinterpret
  const nearStroke = lineStroke('f_plus', 175, 220, 195, 236);
  const farStroke = lineStroke('f_far', 850, 900, 880, 930);
  assert.equal(prog.shouldReinterpret(['f_den', 'f_bar', 'f_num'], nearStroke), true);
  assert.equal(prog.shouldReinterpret(['f_den', 'f_bar', 'f_num'], farStroke), false);
});

// ---------------------------------------------------------------------------
// 8. Web Worker protocol: V0.80 backward compatibility + unified pipeline + epoch cancellation
// ---------------------------------------------------------------------------

test('math-worker preserves V0.80 automatic/propose actions and supports pipeline with epoch cancellation', () => {
  const state = { latestEpoch: -1 };
  const circ = circleStroke('w_c1', 300, 300, 80);

  // V0.80 propose action
  const propRes = handleWorkerMessage({ id: 1, action: 'propose', strokes: [circ], type: 'circle' }, state);
  assert.equal(propRes.id, 1);
  assert.equal(propRes.result.geometry.kind, 'circle');

  // V0.80 automatic action
  const autoRes = handleWorkerMessage({ id: 2, action: 'automatic', strokes: [circ], intention: 'auto', orientation: 'portrait' }, state);
  assert.equal(autoRes.id, 2);
  assert.equal(autoRes.result.geometry.kind, 'circle');

  // New unified pipeline action (epoch 5)
  const pipe5 = handleWorkerMessage({
    id: 3,
    jobId: 'job-5',
    epoch: 5,
    action: 'pipeline',
    strokes: [circ],
    category: 'geometry',
    interventionLevel: 'smart'
  }, state);
  assert.equal(pipe5.cancelled, false);
  assert.equal(pipe5.epoch, 5);
  assert.equal(pipe5.result.winner.kind, 'circle');
  assert.ok(Number.isFinite(pipe5.timingMs));

  // Stale epoch 3 arriving after epoch 5 must be cancelled immediately
  const stale3 = handleWorkerMessage({
    id: 4,
    jobId: 'job-3',
    epoch: 3,
    action: 'pipeline',
    strokes: [circ],
    category: 'geometry'
  }, state);
  assert.equal(stale3.cancelled, true);
  assert.equal(stale3.reason, 'stale_epoch');
  assert.equal(stale3.result, null);
});

// ---------------------------------------------------------------------------
// 9. Calibrated confidence cap for ML Kit alone
// ---------------------------------------------------------------------------

test('calibrateConfidence caps ML Kit-only candidates at <= 0.82 (never high)', () => {
  const cal = calibrateConfidence({ rawScore: 0.96, secondScore: 0.1, mlkitOnly: true });
  assert.ok(cal.score <= 0.82);
  assert.equal(cal.level, 'medium');
});

// ---------------------------------------------------------------------------
// 10. KI-101 & KI-102: Antiparallel overtracing + raw multi-stroke local OCR
// ---------------------------------------------------------------------------

function polyStroke(id, vertices, startT = 100, dtMs = 10) {
  const pts = [];
  let idx = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const steps = 6;
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.55, startT + idx * dtMs]);
      idx++;
    }
  }
  return { id, color: '#111827', width: 2.5, pts };
}

test('KI-101: antiparallel overtraced line merges cleanly into line (never angle) and preserves sourceStrokeIds', () => {
  const s1 = lineStroke('ov_a', 150, 700, 450, 700, 16);
  const s2 = lineStroke('ov_b', 448, 702, 152, 699, 16);
  const res = runMathPipeline([s1, s2], { category: 'geometry', interventionLevel: 'smart' });

  assert.ok(res.winner);
  assert.equal(res.winner.domain, 'geometry');
  assert.equal(res.winner.kind, 'line');
  assert.notEqual(res.winner.kind, 'angle');
  assert.deepEqual(res.winner.sourceStrokeIds, ['ov_a', 'ov_b']);
  assert.equal(res.action, 'auto-apply');
  assert.deepEqual(res.digitalObject.sourceStrokeIds, ['ov_a', 'ov_b']);
});

test('KI-102: local multi-stroke symbol tokenization recognizes raw 2+2=5 (preserved), 3/4, x+5=12, and rejects accidental dots', () => {
  // 1. 2+2=5 (pedagogical fidelity: error preserved, NEVER auto-corrected to 4)
  const expr225 = [
    polyStroke('n1', [[100, 260], [130, 255], [100, 310], [135, 310]], 100),
    polyStroke('n2', [[160, 270], [160, 300]], 260),
    polyStroke('n3', [[145, 285], [175, 285]], 380),
    polyStroke('n4', [[195, 260], [225, 255], [195, 310], [230, 310]], 520),
    polyStroke('n5', [[250, 278], [285, 278]], 700),
    polyStroke('n6', [[250, 294], [285, 294]], 820),
    polyStroke('n7', [[335, 258], [305, 258], [305, 282], [335, 290], [330, 310], [305, 310]], 980)
  ];
  const res225 = runMathPipeline(expr225, { category: 'numbers', interventionLevel: 'smart' });
  assert.equal(res225.winner?.domain, 'math');
  assert.equal(res225.winner?.plainText, '2 + 2 = 5');
  assert.equal(res225.winner?.preservedAsWritten, true);

  // 2. Out-of-order fraction 3/4 with 2-stroke denominator '4'
  const frac34 = [
    polyStroke('f_num', [[420, 140], [450, 140], [435, 162], [455, 182], [420, 188]], 100),
    polyStroke('f_den1', [[445, 222], [418, 255], [462, 255]], 320),
    polyStroke('f_bar', [[400, 205], [475, 205]], 540),
    polyStroke('f_den2', [[445, 222], [445, 276]], 720)
  ];
  const resFrac = runMathPipeline(frac34, { category: 'numbers', interventionLevel: 'smart' });
  assert.equal(resFrac.winner?.domain, 'math');
  assert.equal(resFrac.winner?.latex, '\\frac{3}{4}');

  // 3. Algebra equation x+5=12 with multi-stroke 'x', '+', '='
  const algEq = [
    polyStroke('a1', [[110, 420], [145, 465]], 100),
    polyStroke('a2', [[145, 420], [110, 465]], 220),
    polyStroke('a3', [[175, 428], [175, 458]], 360),
    polyStroke('a4', [[160, 443], [190, 443]], 480),
    polyStroke('a5', [[235, 420], [210, 420], [210, 442], [236, 450], [232, 468], [210, 468]], 640),
    polyStroke('a6', [[255, 436], [285, 436]], 820),
    polyStroke('a7', [[255, 450], [285, 450]], 940),
    polyStroke('a8', [[310, 420], [310, 468]], 1080),
    polyStroke('a9', [[332, 425], [362, 422], [332, 468], [365, 468]], 1220)
  ];
  const resAlg = runMathPipeline(algEq, { category: 'algebra', interventionLevel: 'smart' });
  assert.equal(resAlg.winner?.domain, 'math');
  assert.equal(resAlg.winner?.latex, 'x + 5 = 12');

  // 4. Accidental dots rejected cleanly (0 false transforms)
  const dots = [
    { id: 'd1', color: '#111827', width: 2.5, pts: [[600, 1150, 0.5, 100], [601.5, 1151, 0.5, 108]] },
    { id: 'd2', color: '#111827', width: 2.5, pts: [[640, 1180, 0.5, 260], [641, 1181, 0.5, 268]] }
  ];
  const resNoise = runMathPipeline(dots, { category: 'auto', interventionLevel: 'smart' });
  assert.equal(resNoise.winner, null);
  assert.equal(resNoise.action, 'keep-handwriting');
});
