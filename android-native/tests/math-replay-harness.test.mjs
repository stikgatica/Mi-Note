import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HARNESS_FORMAT,
  HARNESS_VERSION,
  RECORDING_SOURCES,
  createRecordingSample,
  validateRecordingSample,
  sanitizeSample,
  exportSampleBatch,
  importSampleBatch,
  sampleFingerprint,
  assertNoSplitLeakage,
  partitionDataset,
  replaySampleSequentially,
  evaluateSuite,
  generateDeterministicDataset
} from '../src/math/math-replay-harness.mjs';

test('RecordingSample distingue explícitamente simulated vs huion-x10-hardware y rechaza fuentes inválidas', () => {
  assert.deepEqual(RECORDING_SOURCES, ['simulated', 'huion-x10-hardware']);

  const sim = createRecordingSample({
    id: 'sim-1',
    source: 'simulated',
    category: 'numbers',
    expected: { text: '12' },
    strokes: [{ id: 's1', pts: [[100, 100, 0.5, 10], [120, 150, 0.6, 25]] }]
  });
  assert.equal(sim.source, 'simulated');
  assert.deepEqual(sim.pageDimensions, { w: 1000, h: 1400 });

  const hw = createRecordingSample({
    id: 'hw-1',
    source: 'huion-x10-hardware',
    category: 'geometry',
    expected: { shape: 'circle' },
    strokes: [{ id: 's2', pts: [[200, 200, 0.7, 100], [250, 220, 0.7, 120]] }]
  });
  assert.equal(hw.source, 'huion-x10-hardware');

  const invalid = validateRecordingSample({ ...sim, source: 'unknown-pen' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(e => e.includes('source inválido')));
});

test('exportSampleBatch e importSampleBatch sanitizan PII y separan conteos de simulated y hardware', () => {
  const rawWithPii = {
    id: 'hw-pii-01',
    source: 'huion-x10-hardware',
    split: 'evaluation',
    createdAt: '2026-11-24T12:00:00.000Z',
    pageDimensions: { w: 1000, h: 1400 },
    category: 'numbers',
    expected: { text: '3+4=7' },
    strokes: [
      {
        id: 'st-1',
        color: '#111827',
        width: 2.5,
        pts: [[100, 100, 0.6, 10], [130, 100, 0.6, 30]],
        x10: { deviceId: 'AA:BB:CC:DD:EE:FF', raw: [[1, 2, 3]] }
      }
    ],
    metadata: {
      orientation: 'portrait',
      tags: ['aula-6to'],
      userName: 'Docente Privada',
      email: 'docente@colegio.cl',
      deviceId: 'AA:BB:CC:DD:EE:FF',
      notebookTitle: 'Notas personales'
    }
  };

  const simSample = createRecordingSample({
    id: 'sim-clean-01',
    source: 'simulated',
    split: 'evaluation',
    category: 'geometry',
    expected: { shape: 'triangle' },
    strokes: [{ id: 'st-2', pts: [[100, 200, 0.5, 5], [200, 100, 0.5, 15], [300, 200, 0.5, 25]] }]
  });

  const json = exportSampleBatch([rawWithPii, simSample], { stringify: true });
  assert.equal(typeof json, 'string');
  assert.equal(json.includes('Docente Privada'), false);
  assert.equal(json.includes('docente@colegio.cl'), false);
  assert.equal(json.includes('AA:BB:CC:DD:EE:FF'), false);
  assert.equal(json.includes('Notas personales'), false);

  const imported = importSampleBatch(json);
  assert.equal(imported.format, HARNESS_FORMAT);
  assert.equal(imported.version, HARNESS_VERSION);
  assert.equal(imported.counts.total, 2);
  assert.equal(imported.counts.simulated, 1);
  assert.equal(imported.counts.hardware, 1);
  assert.equal(imported.samples[0].metadata.orientation, 'portrait');
  assert.equal(imported.samples[0].metadata.email, undefined);
  assert.equal(imported.samples[0].strokes[0].x10, undefined);
});

test('replaySampleSequentially reproduce trazos en orden temporal sin mutar la muestra original', async () => {
  const sample = createRecordingSample({
    id: 'seq-out-of-order',
    source: 'simulated',
    category: 'numbers',
    expected: { latex: '\\frac{3}{4}' },
    strokes: [
      { id: 'bar', pts: [[400, 200, 0.5, 500], [480, 200, 0.5, 550]] },
      { id: 'num', pts: [[420, 150, 0.5, 100], [450, 180, 0.5, 160]] },
      { id: 'den', pts: [[420, 240, 0.5, 300], [450, 280, 0.5, 360]] }
    ]
  });
  const before = JSON.stringify(sample);

  const seenOrder = [];
  const counts = [];
  const replay = await replaySampleSequentially(sample, ev => {
    seenOrder.push(ev.stroke.id);
    counts.push(ev.accumulatedStrokes.length);
    // Mutar copia recibida no debe alterar la muestra original ni pasos posteriores.
    ev.stroke.pts[0][0] = 999;
    return { step: ev.strokeIndex, count: ev.accumulatedStrokes.length };
  });

  assert.deepEqual(seenOrder, ['num', 'den', 'bar']);
  assert.deepEqual(counts, [1, 2, 3]);
  assert.equal(replay.totalStrokes, 3);
  assert.equal(replay.totalDurationMs, 450);
  assert.equal(JSON.stringify(sample), before, 'La muestra original no debe mutarse');
});

test('generateDeterministicDataset produce splits train/calibration/evaluation estrictamente disjuntos y simulados', () => {
  const train = generateDeterministicDataset({ seed: 2026, split: 'train' });
  const calibration = generateDeterministicDataset({ seed: 2026, split: 'calibration' });
  const evaluation = generateDeterministicDataset({ seed: 2026, split: 'evaluation' });

  assert.ok(train.length >= 9);
  assert.ok(evaluation.length >= 9);
  for (const s of [...train, ...calibration, ...evaluation]) {
    assert.equal(s.source, 'simulated');
  }

  // Sin fuga entre train+calibration y evaluation.
  const leakage = assertNoSplitLeakage([...train, ...calibration], evaluation);
  assert.equal(leakage.clean, true);

  // partitionDataset valida y separa correctamente.
  const partitioned = partitionDataset([...train, ...calibration, ...evaluation]);
  assert.equal(partitioned.train.length, train.length);
  assert.equal(partitioned.calibration.length, calibration.length);
  assert.equal(partitioned.evaluation.length, evaluation.length);

  // Detectar fuga si alguien copia trazos con distinto ID en evaluation.
  const leakedClone = sanitizeSample({
    ...train[0],
    id: 'disguised-eval-copy',
    split: 'evaluation'
  });
  assert.equal(sampleFingerprint(leakedClone), sampleFingerprint(train[0]));
  assert.throws(
    () => assertNoSplitLeakage(train, [leakedClone]),
    /Fuga detectada/
  );
});

test('evaluateSuite calcula precisión por categoría, separación simulated/hardware, tasa de auto-transformación incorrecta, p50/p95 y matriz de confusión', async () => {
  const evalSimulated = generateDeterministicDataset({ seed: 2026, split: 'evaluation' });
  const trainSimulated = generateDeterministicDataset({ seed: 2026, split: 'train' });

  const hwSample = createRecordingSample({
    id: 'hw-real-circle-1',
    source: 'huion-x10-hardware',
    split: 'evaluation',
    category: 'geometry',
    expected: { shape: 'circle', kind: 'circle' },
    strokes: [{ id: 'h1', pts: [[300, 300, 0.6, 10], [340, 320, 0.6, 20], [300, 340, 0.6, 30], [260, 320, 0.6, 40]] }]
  });

  const combined = [...evalSimulated, hwSample];

  // Reconocedor de prueba controlado:
  // - Acierta casi todo
  // - Comete 1 auto-transformación incorrecta sobre el rectángulo (lo fuerza a 'square')
  // - Rechaza correctamente el ruido accidental
  const mockRecognizer = (_strokes, ctx) => {
    if (ctx.sampleId.includes('num-42')) return { action: 'auto-apply', text: '42' };
    if (ctx.sampleId.includes('error-preserved')) return { action: 'suggest', text: '2+2=5' };
    if (ctx.sampleId.includes('frac-3-4')) return { action: 'auto-apply', latex: '\\frac{3}{4}' };
    if (ctx.sampleId.includes('alg-linear')) return { action: 'auto-apply', latex: 'x+5=12' };
    if (ctx.sampleId.includes('geo-circle') || ctx.sampleId === 'hw-real-circle-1') {
      return { action: 'auto-apply', domain: 'geometry', kind: 'circle' };
    }
    if (ctx.sampleId.includes('geo-rectangle')) {
      // Fallo intencional: auto-aplica 'square' en vez de 'rectangle'
      return { action: 'auto-apply', domain: 'geometry', kind: 'square' };
    }
    if (ctx.sampleId.includes('geo-triangle')) return { action: 'auto-apply', domain: 'geometry', kind: 'triangle' };
    if (ctx.sampleId.includes('overtraced-line')) return { action: 'auto-apply', domain: 'geometry', kind: 'line' };
    if (ctx.sampleId.includes('accidental-dots')) return { action: 'keep-handwriting' };
    return null;
  };

  const report = await evaluateSuite(combined, mockRecognizer, {
    progressive: true,
    excludeFromEvaluation: trainSimulated
  });

  assert.equal(report.total, combined.length);
  assert.equal(report.matched, combined.length - 1);
  assert.equal(report.incorrectAutoTransformCount, 1);
  assert.ok(report.incorrectAutoTransformRate > 0);
  assert.equal(report.bySource.simulated.total, evalSimulated.length);
  assert.equal(report.bySource['huion-x10-hardware'].total, 1);
  assert.equal(report.bySource['huion-x10-hardware'].accuracy, 1);
  assert.equal(report.byCategory.numbers.accuracy, 1);
  assert.equal(report.byCategory.algebra.accuracy, 1);
  assert.equal(report.byCategory.noise.accuracy, 1);
  assert.equal(report.byCategory.geometry.incorrectAutoTransformCount, 1);
  assert.equal(report.confusionMatrix['shape:rectangle']['shape:square'], 1);
  assert.ok(report.latencyMs.p50 >= 0);
  assert.ok(report.latencyMs.p95 >= report.latencyMs.p50);
});
