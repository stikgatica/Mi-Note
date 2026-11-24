import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAB_TABS,
  detectSampleSource,
  stripPII,
  buildInspectionSnapshot,
  recordPageSample,
  exportSanitizedLabDiagnostics,
  createMathLabState,
  createMathLabUI
} from '../src/math/math-lab.js';
import { createUserProfile } from '../src/math/math-personalization.mjs';

const simulatedStrokes = [
  { id: 'sim-1', color: '#111827', width: 2.5, pts: [[100, 100, 0.5, 10], [160, 100, 0.5, 25], [120, 200, 0.5, 50]] },
  { id: 'sim-2', color: '#111827', width: 2.5, pts: [[115, 150, 0.5, 70], [155, 150, 0.5, 90]] }
];

const hardwareStrokes = [
  {
    id: 'hw-1',
    color: '#111827',
    width: 2.5,
    pts: [[200, 200, 0.6, 100], [260, 200, 0.6, 115], [220, 300, 0.6, 140]],
    x10: { mode: 'agenda-pura', seq: 42 }
  }
];

test('detectSampleSource distingue estrictamente hardware Huion X10 vs trazos simulados', () => {
  assert.equal(detectSampleSource([]), 'simulated');
  assert.equal(detectSampleSource(simulatedStrokes), 'simulated');
  assert.equal(detectSampleSource([{ id: 'empty-x10', pts: [[1, 1], [2, 2]], x10: {} }]), 'simulated');
  assert.equal(detectSampleSource(hardwareStrokes), 'huion-x10-hardware');
});

test('inspección construye comparativa completa y jamás muta trazos originales', async () => {
  const page = { id: 'pg-1', orientation: 'portrait', strokes: JSON.parse(JSON.stringify(hardwareStrokes)) };
  const originalSnapshot = JSON.stringify(page.strokes);

  const lab = createMathLabState({
    getCurrentPage: () => page,
    runPipeline: async strokes => {
      // Simula un pipeline que intentara mutar su copia
      strokes[0].pts[0][0] = 999;
      return {
        timingMs: 12.4,
        dsp: {
          processed: [{ id: 'hw-1', points: [[200, 200], [220, 300]] }],
          groups: [{ groupId: 'g1', strokeIds: ['hw-1'], kindHint: 'symbol', bbox: { minX: 200, minY: 200, maxX: 260, maxY: 300 } }]
        },
        winner: {
          domain: 'math',
          engine: 'local-hybrid',
          plainText: '7',
          latex: '7',
          ast: { type: 'Number', value: '7', strokeIds: ['hw-1'] },
          confidence: { score: 0.91, level: 'high', margin: 0.22 },
          alternatives: [{ value: '1', score: 0.69 }]
        }
      };
    }
  });

  const snap = await lab.inspectCurrentPage();
  assert.equal(JSON.stringify(page.strokes), originalSnapshot);
  assert.equal(snap.source, 'huion-x10-hardware');
  assert.equal(snap.originalCount, 1);
  assert.equal(snap.processedCount, 1);
  assert.equal(snap.groups.length, 1);
  assert.equal(snap.confidence.level, 'high');
  assert.equal(snap.interpretation.latex, '7');
  assert.equal(snap.interpretation.ast.type, 'Number');
  assert.equal(snap.timingMs, 12.4);
});

test('flujo de corrección guarda en UserHandwritingProfile y reset limpia el perfil', async () => {
  let saved = createUserProfile();
  let appliedArgs = null;

  const lab = createMathLabState({
    getCurrentPage: () => ({ id: 'pg-2', strokes: simulatedStrokes }),
    getProfile: () => saved,
    saveProfile: next => { saved = next; },
    applyCorrection: args => { appliedArgs = args; }
  });

  const updated = await lab.submitCorrection({ predicted: '1', actual: '7' });
  assert.equal(updated.confusionMatrix['1->7'], 1);
  assert.equal(updated.symbolPrototypes['7'].length, 1);
  assert.equal(saved.frequentSymbols['7'], 1);
  assert.deepEqual(appliedArgs.strokeIds, ['sim-1', 'sim-2']);

  const freq = lab.getFrequentSymbols(5);
  assert.equal(freq[0].symbol, '7');

  const cleared = await lab.resetProfile();
  assert.deepEqual(cleared.confusionMatrix, {});
  assert.deepEqual(saved.symbolPrototypes, {});
});

test('flujo de calibración guiada permite repetir ejemplos y guarda perfil final', async () => {
  let saved = createUserProfile();
  const lab = createMathLabState({
    getProfile: () => saved,
    saveProfile: next => { saved = next; }
  });

  const start = lab.startCalibration(['fractions', 'geometry']);
  assert.equal(start.prompt.category, 'fractions');
  assert.equal(start.prompt.target, '1/2');

  const r1 = lab.submitCalibrationSample(simulatedStrokes, { repeat: true });
  assert.equal(r1.accepted, true);
  assert.equal(r1.samplesRecorded, 1);

  const r2 = lab.submitCalibrationSample(simulatedStrokes, { repeat: false });
  assert.equal(r2.accepted, true);
  assert.equal(r2.samplesRecorded, 2);

  lab.skipCalibration();
  const finished = await lab.finishCalibration();
  assert.equal(finished.profile.symbolPrototypes['1/2'][0].samples, 2);
  assert.equal(saved.symbolPrototypes['1/2'][0].samples, 2);
  assert.equal(saved.symbolPrototypes['trapezoid'], undefined);
});

test('captura de muestra, regresión y exportación JSON sanitizada sin PII', async () => {
  const pageWithPII = {
    id: 'pg-hw',
    orientation: 'landscape-cw',
    author: 'Docente Privado',
    email: 'docente@escuela.cl',
    notebookTitle: 'Curso 5B',
    strokes: hardwareStrokes
  };

  let hookSample = null;
  const lab = createMathLabState({
    getCurrentPage: () => pageWithPII,
    onRecordHardwareSample: s => { hookSample = s; }
  });

  const captured = lab.captureCurrentPageSample({ category: 'numbers', expected: { text: '7' } });
  assert.equal(captured.source, 'huion-x10-hardware');
  assert.equal(hookSample.source, 'huion-x10-hardware');

  // Reproducción secuencial y comparación de motores
  const report = await lab.compareEngines({
    'motor-a': async () => ({ text: '7', confidence: 0.9, autoApplied: true }),
    'motor-b': async () => ({ text: '1', confidence: 0.6, autoApplied: false })
  });
  assert.equal(report.sampleCount, 1);
  assert.equal(report.sources.hardware, 1);
  assert.ok(report.engines['motor-a']);
  assert.ok(report.engines['motor-b']);

  const json = lab.exportDiagnosticsJson();
  assert.ok(!json.includes('Docente Privado'));
  assert.ok(!json.includes('docente@escuela.cl'));
  assert.ok(!json.includes('Curso 5B'));

  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'MiNoteMathLabDiagnostics');
  assert.equal(parsed.batch.samples.length, 1);
  assert.equal(parsed.batch.samples[0].source, 'huion-x10-hardware');

  // stripPII elimina claves sensibles anidadas
  const cleaned = stripPII({ ok: true, email: 'a@b.c', nested: { userName: 'secret', score: 0.9 } });
  assert.deepEqual(cleaned, { ok: true, nested: { score: 0.9 } });
});

test('createMathLabUI funciona en modo headless sin DOM y expone pestañas válidas', async () => {
  assert.equal(LAB_TABS.length, 4);
  const ui = createMathLabUI({
    getCurrentPage: () => ({ id: 'headless', strokes: simulatedStrokes }),
    runPipeline: async () => ({ timingMs: 3.1 })
  });
  assert.equal(ui.dialog, null);
  assert.equal(ui.setTab('calibrate'), 'calibrate');
  const snap = await ui.open();
  assert.equal(snap.source, 'simulated');
  assert.equal(snap.timingMs, 3.1);
});

test('replaySample entrega accumulatedStrokes a fn, ejecuta onStep por paso y grupos DSP aceptan clave id', async () => {
  const lab = createMathLabState({
    getCurrentPage: () => ({ id: 'pg-replay', strokes: simulatedStrokes })
  });
  const sample = lab.captureCurrentPageSample({ category: 'numbers', expected: { text: '7' } });

  const receivedCounts = [];
  const stepEvents = [];
  const replay = await lab.replaySample(
    sample,
    async (strokes, ctx) => {
      assert.ok(Array.isArray(strokes));
      receivedCounts.push(strokes.length);
      return { seen: strokes.length, isFinal: ctx.isFinal };
    },
    ev => {
      stepEvents.push({ strokeIndex: ev.strokeIndex, isFinal: ev.isFinal, seen: ev.result.seen });
    }
  );

  assert.equal(replay.totalStrokes, 2);
  assert.deepEqual(receivedCounts, [1, 2]);
  assert.deepEqual(stepEvents, [
    { strokeIndex: 0, isFinal: false, seen: 1 },
    { strokeIndex: 1, isFinal: true, seen: 2 }
  ]);

  // Compatibilidad con grupos emitidos por math-dsp.mjs usando clave `id` (`group_0`)
  const snap = buildInspectionSnapshot(
    { id: 'pg-dsp', strokes: simulatedStrokes },
    { dsp: { groups: [{ id: 'group_0', strokeIds: ['sim-1', 'sim-2'] }] } }
  );
  assert.equal(snap.groups[0].groupId, 'group_0');
});
