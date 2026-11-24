import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_VERSION,
  MAX_BIAS_DELTA,
  CALIBRATION_PACKS,
  createUserProfile,
  resetUserProfile,
  serializeUserProfile,
  deserializeUserProfile,
  extractStrokeSignature,
  compareSignatures,
  recordUserCorrection,
  updatePersonalPreferences,
  computePersonalBias,
  applyProfileToCandidates,
  getFrequentSymbols,
  createCalibrationSession
} from '../src/math/math-personalization.mjs';

function makeStroke(id, pts) {
  return { id, color: '#000000', width: 2.5, pts };
}

// Trazo tipo "7" europeo (barra superior + diagonal + barra media)
const strokeSevenCrossed = [
  makeStroke('s7-1', [[100, 100, 0.5, 10], [160, 100, 0.5, 20], [120, 200, 0.5, 40]]),
  makeStroke('s7-2', [[115, 150, 0.5, 60], [155, 150, 0.5, 75]])
];

// Trazo similar al "7" europeo, trasladado y escalado
const strokeSevenShifted = [
  makeStroke('s7b-1', [[300, 400, 0.5, 100], [390, 400, 0.5, 115], [330, 550, 0.5, 145]]),
  makeStroke('s7b-2', [[322, 475, 0.5, 170], [382, 475, 0.5, 190]])
];

// Trazo tipo "1" simple (vertical)
const strokeOneSimple = [
  makeStroke('s1-1', [[100, 120, 0.5, 10], [120, 100, 0.5, 20], [120, 200, 0.5, 40]])
];

// Trazo circular aproximado
function makeCircleStroke(id, cx = 200, cy = 200, r = 50, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5, i * 10]);
  }
  return [makeStroke(id, pts)];
}

test('creación, serialización y deserialización segura del perfil local', () => {
  const profile = createUserProfile({ maxBiasDelta: 0.99 }); // intento de exceder límite
  assert.equal(profile.version, PROFILE_VERSION);
  assert.equal(profile.maxBiasDelta, MAX_BIAS_DELTA);
  assert.equal(profile.enabled, true);

  const updated = recordUserCorrection(profile, {
    predicted: '1',
    actual: '7',
    strokes: strokeSevenCrossed
  });
  const json = serializeUserProfile(updated);
  const restored = deserializeUserProfile(json);

  assert.equal(restored.version, PROFILE_VERSION);
  assert.equal(restored.maxBiasDelta, MAX_BIAS_DELTA);
  assert.equal(restored.confusionMatrix['1->7'], 1);
  assert.equal(restored.frequentSymbols['7'], 1);
  assert.equal(restored.symbolPrototypes['7'].length, 1);

  // JSON corrupto cae a perfil limpio sin lanzar excepciones
  const fallback = deserializeUserProfile('{corrupto');
  assert.equal(fallback.version, PROFILE_VERSION);
  assert.deepEqual(fallback.confusionMatrix, {});

  // Reset completo limpia todos los datos aprendidos
  const clean = resetUserProfile();
  assert.deepEqual(clean.confusionMatrix, {});
  assert.deepEqual(clean.symbolPrototypes, {});
  assert.deepEqual(clean.frequentSymbols, {});
});

test('inmutabilidad estricta: nunca muta trazos ni perfil de entrada', () => {
  const strokesCopy = JSON.parse(JSON.stringify(strokeSevenCrossed));
  const profile = createUserProfile();
  const profileSnapshot = JSON.stringify(profile);

  const next = recordUserCorrection(profile, {
    predicted: '1',
    actual: '7',
    strokes: strokeSevenCrossed
  });

  assert.deepEqual(strokeSevenCrossed, strokesCopy);
  assert.equal(JSON.stringify(profile), profileSnapshot);
  assert.notEqual(next, profile);
  assert.equal(next.confusionMatrix['1->7'], 1);
});

test('comparación de firmas es invariante a traslación/escala y discrimina símbolos distintos', () => {
  const sig7a = extractStrokeSignature(strokeSevenCrossed);
  const sig7b = extractStrokeSignature(strokeSevenShifted);
  const sig1 = extractStrokeSignature(strokeOneSimple);
  const sigCircle = extractStrokeSignature(makeCircleStroke('c1'));

  assert.ok(sig7a && sig7b && sig1 && sigCircle);
  const sameSim = compareSignatures(sig7a, sig7b);
  const diff1Sim = compareSignatures(sig7a, sig1);
  const diffCircleSim = compareSignatures(sig7a, sigCircle);

  assert.ok(sameSim > 0.9, `Se esperaba similitud alta para mismo símbolo escalado, obtenido ${sameSim}`);
  assert.ok(sameSim > diff1Sim + 0.2, `7 vs 7 (${sameSim}) debe superar claramente a 7 vs 1 (${diff1Sim})`);
  assert.ok(sameSim > diffCircleSim + 0.25, `7 vs 7 (${sameSim}) debe superar a 7 vs círculo (${diffCircleSim})`);
});

test('corrección 1 -> 7 aprende prototipo y desempata candidatos respetando límite ±0.12', () => {
  let profile = createUserProfile();
  for (let i = 0; i < 3; i++) {
    profile = recordUserCorrection(profile, {
      predicted: '1',
      actual: '7',
      strokes: strokeSevenCrossed
    });
  }

  // Prototipo similar se fusiona (no duplica innecesariamente)
  assert.equal(profile.symbolPrototypes['7'].length, 1);
  assert.equal(profile.symbolPrototypes['7'][0].samples, 3);
  assert.equal(profile.confusionMatrix['1->7'], 3);

  // El sesgo nunca excede MAX_BIAS_DELTA (0.12)
  const bias7 = computePersonalBias(profile, {
    candidateSymbol: '7',
    topPredicted: '1',
    strokes: strokeSevenShifted
  });
  assert.ok(bias7.delta > 0.05 && bias7.delta <= MAX_BIAS_DELTA);

  // Cuando el motor base duda ligeramente entre '1' (0.76) y '7' (0.72), el perfil inclina a '7'
  const closeCandidates = [
    { symbol: '1', score: 0.76 },
    { symbol: '7', score: 0.72 }
  ];
  const rankedClose = applyProfileToCandidates(profile, closeCandidates, { strokes: strokeSevenShifted });
  assert.equal(rankedClose[0].symbol, '7');
  assert.equal(rankedClose[0].baseScore, 0.72);
  assert.ok(rankedClose[0].personalDelta <= MAX_BIAS_DELTA);

  // Cuando la evidencia base es abrumadora ('1' = 0.95 vs '7' = 0.50), el perfil NO fuerza una lectura absurda
  const clearCandidates = [
    { symbol: '1', score: 0.95 },
    { symbol: '7', score: 0.50 }
  ];
  const rankedClear = applyProfileToCandidates(profile, clearCandidates, { strokes: strokeSevenShifted });
  assert.equal(rankedClear[0].symbol, '1');
});

test('diccionario de símbolos frecuentes y preferencias personales validadas', () => {
  let profile = createUserProfile();
  profile = recordUserCorrection(profile, { actual: 'x', strokes: strokeOneSimple });
  profile = recordUserCorrection(profile, { actual: 'x', strokes: strokeOneSimple });
  profile = recordUserCorrection(profile, { actual: '÷', strokes: strokeSevenCrossed });

  const top = getFrequentSymbols(profile, 5);
  assert.equal(top[0].symbol, 'x');
  assert.equal(top[0].count, 2);

  const prefs = updatePersonalPreferences(profile, {
    decimalSeparator: '.',
    divisionSymbol: ':',
    multiplicationSymbol: '·',
    pauseMs: 5000, // fuera de rango -> clamp a 2500
    sensitivity: 0.2 // fuera de rango -> clamp a 0.5
  });
  assert.equal(prefs.preferences.decimalSeparator, '.');
  assert.equal(prefs.preferences.divisionSymbol, ':');
  assert.equal(prefs.preferences.multiplicationSymbol, '·');
  assert.equal(prefs.preferences.pauseMs, 2500);
  assert.equal(prefs.preferences.sensitivity, 0.5);
});

test('sesión de calibración guiada cubre categorías y permite repetir ejemplos', () => {
  assert.deepEqual(CALIBRATION_PACKS.numbers, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.ok(CALIBRATION_PACKS.fractions.includes('1/2'));
  assert.ok(CALIBRATION_PACKS.geometry.includes('circle'));
  assert.ok(!CALIBRATION_PACKS.geometry.includes('trapezoid'));

  const session = createCalibrationSession(null, ['fractions', 'geometry']);
  const first = session.getCurrentPrompt();
  assert.equal(first.category, 'fractions');
  assert.equal(first.target, '1/2');

  // Repetir el mismo ejemplo dos veces antes de avanzar
  const r1 = session.submitSample(strokeSevenCrossed, { repeat: true });
  assert.equal(r1.accepted, true);
  assert.equal(r1.samplesRecorded, 1);
  assert.equal(session.getCurrentPrompt().target, '1/2');

  const r2 = session.submitSample(strokeSevenShifted, { repeat: false });
  assert.equal(r2.accepted, true);
  assert.equal(r2.samplesRecorded, 2);
  assert.equal(session.getCurrentPrompt().target, '3/4');

  // Saltar uno y completar el resto
  session.skip();
  while (session.getCurrentPrompt()) {
    const res = session.submitSample(makeCircleStroke('cal'));
    assert.equal(res.accepted, true);
  }

  const progress = session.getProgress();
  assert.equal(progress.done, true);
  assert.equal(progress.repeatedSamples, 1);
  assert.equal(progress.completed, 6); // 1 de fractions + 5 de geometry

  const finalProfile = session.finish();
  assert.equal(finalProfile.symbolPrototypes['1/2'][0].samples, 2);
  assert.ok(finalProfile.calibrationHistory.some(h => h.category === 'fractions' && h.target === '1/2'));
});
