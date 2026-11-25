/* Mi Note Professional — Laboratorio de Reconocimiento y Calibración Personal.
 * ESM puro, cero dependencias externas, ejecutable en WebView Android y testeable en Node.js.
 * No altera la barra de escritura; se abre bajo demanda desde configuración o `window.MiNoteMathLab`.
 * Nunca muta trazos originales ni exporta información personal (PII). */

import {
  CALIBRATION_PACKS,
  createUserProfile,
  resetUserProfile,
  recordUserCorrection,
  getFrequentSymbols,
  createCalibrationSession,
  serializeUserProfile,
  deserializeUserProfile
} from './math-personalization.mjs';

import {
  createRecordingSample,
  exportSampleBatch,
  replaySampleSequentially,
  evaluateSuite,
  generateDeterministicDataset
} from './math-replay-harness.mjs';

export const LAB_TABS = Object.freeze([
  { id: 'inspect', label: 'Inspección' },
  { id: 'correct', label: 'Corrección y perfil' },
  { id: 'calibrate', label: 'Calibración guiada' },
  { id: 'regression', label: 'Regresión y diagnóstico' }
]);

const PII_KEYS = new Set([
  'author', 'user', 'username', 'userName', 'email', 'phone', 'name',
  'student', 'teacher', 'school', 'deviceId', 'mac', 'address',
  'notebookTitle', 'pageTitle', 'owner', 'token', 'password'
]);

const deepClone = v => JSON.parse(JSON.stringify(v));

/**
 * Determina estrictamente la procedencia de los trazos:
 * devuelve 'huion-x10-hardware' SOLO si al menos un trazo tiene metadatos reales `x10`.
 */
export function detectSampleSource(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) return 'simulated';
  const hasHardwareMeta = strokes.some(
    s => s && typeof s.x10 === 'object' && s.x10 !== null && Object.keys(s.x10).length > 0
  );
  return hasHardwareMeta ? 'huion-x10-hardware' : 'simulated';
}

/**
 * Elimina recursivamente claves de PII antes de exportar diagnósticos JSON.
 */
export function stripPII(value) {
  if (Array.isArray(value)) return value.map(stripPII);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (PII_KEYS.has(k)) continue;
    out[k] = stripPII(v);
  }
  return out;
}

/**
 * Construye una instantánea inmutable de inspección comparando trazos originales,
 * trazos procesados por DSP, candidatos, confianza calibrada, motor, AST/LaTeX y latencia.
 */
export function buildInspectionSnapshot(page, pipelineResult = null, elapsedMs = 0) {
  const originalStrokes = Array.isArray(page?.strokes) ? deepClone(page.strokes) : [];
  const dsp = pipelineResult?.dsp || null;
  const processedStrokes = Array.isArray(dsp?.processed)
    ? deepClone(dsp.processed)
    : Array.isArray(pipelineResult?.processed)
      ? deepClone(pipelineResult.processed)
      : [];

  const winner = pipelineResult?.winner || pipelineResult?.decision?.winner || null;
  const confidence = pipelineResult?.confidence || winner?.confidence || {
    score: 0,
    level: 'low',
    margin: 0
  };
  const candidates = Array.isArray(pipelineResult?.candidates)
    ? deepClone(pipelineResult.candidates)
    : Array.isArray(pipelineResult?.alternatives)
      ? deepClone(pipelineResult.alternatives)
      : Array.isArray(winner?.alternatives)
        ? deepClone(winner.alternatives)
        : [];

  const groups = Array.isArray(dsp?.groups)
    ? dsp.groups.map(g => ({
        groupId: g.groupId || g.id || '',
        strokeIds: Array.isArray(g.strokeIds) ? [...g.strokeIds] : [],
        kindHint: g.kindHint || 'unknown',
        bbox: g.bbox ? { ...g.bbox } : null
      }))
    : [];

  const coordinatesPreview = originalStrokes.slice(0, 6).map(s => {
    const pts = Array.isArray(s.pts) ? s.pts : [];
    return {
      id: s.id || '',
      pointCount: pts.length,
      first: pts[0] ? pts[0].slice(0, 4) : null,
      last: pts.length ? pts[pts.length - 1].slice(0, 4) : null,
      hasTimestamps: pts.some(p => Array.isArray(p) && p.length >= 4 && Number.isFinite(Number(p[3])))
    };
  });

  const timingMs = Number.isFinite(Number(pipelineResult?.timingMs))
    ? Number(pipelineResult.timingMs)
    : Number.isFinite(Number(dsp?.timingMs))
      ? Number(dsp.timingMs)
      : Number(elapsedMs.toFixed(2));

  return {
    pageId: typeof page?.id === 'string' ? page.id : 'unknown',
    orientation: page?.orientation || 'portrait',
    source: detectSampleSource(originalStrokes),
    originalCount: originalStrokes.length,
    processedCount: processedStrokes.length,
    originalStrokes,
    processedStrokes,
    coordinatesPreview,
    groups,
    candidates,
    confidence: {
      score: Number(confidence.score) || 0,
      level: confidence.level || 'low',
      margin: Number(confidence.margin) || 0
    },
    engine: pipelineResult?.engine || winner?.engine || winner?.domain || 'local-hybrid',
    interpretation: {
      text: winner?.plainText ?? winner?.geometry?.text ?? winner?.label ?? '',
      latex: winner?.latex ?? '',
      mathml: winner?.mathml ?? '',
      ast: winner?.ast ? deepClone(winner.ast) : null
    },
    timingMs
  };
}

/**
 * Crea una muestra grabada sanitizada a partir de la página actual,
 * distinguiendo estrictamente hardware Huion X10 vs simulada.
 */
export function recordPageSample(page, { category = 'mixed', expected = {}, id = null } = {}) {
  const strokes = Array.isArray(page?.strokes) ? page.strokes : [];
  const source = detectSampleSource(strokes);
  const sampleId = id || `lab-${source === 'huion-x10-hardware' ? 'x10' : 'sim'}-${Date.now()}`;
  return createRecordingSample({
    id: sampleId,
    source,
    category,
    expected,
    strokes,
    metadata: {
      orientation: page?.orientation || 'portrait',
      split: 'evaluation',
      tags: ['math-lab', source]
    }
  });
}

/**
 * Exporta un paquete JSON de diagnóstico completamente sanitizado (sin PII).
 */
export function exportSanitizedLabDiagnostics({ samples = [], profile = null, inspection = null } = {}) {
  const safeBatch = exportSampleBatch(samples, { stringify: false });
  const safeProfile = profile
    ? deserializeUserProfile(serializeUserProfile(profile))
    : null;
  const safeInspection = inspection
    ? stripPII({
        orientation: inspection.orientation,
        source: inspection.source,
        originalCount: inspection.originalCount,
        processedCount: inspection.processedCount,
        groups: inspection.groups,
        candidates: inspection.candidates,
        confidence: inspection.confidence,
        engine: inspection.engine,
        interpretation: inspection.interpretation,
        timingMs: inspection.timingMs
      })
    : null;

  return JSON.stringify(
    stripPII({
      format: 'MiNoteMathLabDiagnostics',
      version: 1,
      exportedAt: new Date().toISOString(),
      batch: safeBatch,
      profileSummary: safeProfile
        ? {
            version: safeProfile.version,
            enabled: safeProfile.enabled,
            maxBiasDelta: safeProfile.maxBiasDelta,
            confusionPairs: Object.keys(safeProfile.confusionMatrix || {}).length,
            prototypeSymbols: Object.keys(safeProfile.symbolPrototypes || {}).length,
            frequentSymbols: getFrequentSymbols(safeProfile, 10),
            preferences: safeProfile.preferences
          }
        : null,
      inspection: safeInspection
    }),
    null,
    2
  );
}

/**
 * Controlador de estado puro del Laboratorio (100% testeable en Node.js sin DOM).
 */
export function createMathLabState(hooks = {}) {
  const getCurrentPage = typeof hooks.getCurrentPage === 'function' ? hooks.getCurrentPage : () => ({ id: 'empty', strokes: [] });
  const runPipeline = typeof hooks.runPipeline === 'function' ? hooks.runPipeline : async () => null;
  const getProfileHook = typeof hooks.getProfile === 'function' ? hooks.getProfile : () => createUserProfile();
  const saveProfileHook = typeof hooks.saveProfile === 'function' ? hooks.saveProfile : () => {};
  const applyCorrectionHook = typeof hooks.applyCorrection === 'function' ? hooks.applyCorrection : null;
  const onRecordHardwareSample = typeof hooks.onRecordHardwareSample === 'function' ? hooks.onRecordHardwareSample : null;

  let activeTab = 'inspect';
  let lastInspection = null;
  let profile = createUserProfile(getProfileHook() || {});
  let calibrationSession = null;
  let recordedSamples = [];
  let lastRegressionReport = null;

  function loadProfile() {
    profile = createUserProfile(getProfileHook() || profile);
    return deepClone(profile);
  }

  async function inspectCurrentPage() {
    const page = getCurrentPage() || { id: 'empty', strokes: [] };
    const safeCopy = Array.isArray(page.strokes) ? deepClone(page.strokes) : [];
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const result = await runPipeline(safeCopy, {
      page: { ...page, strokes: safeCopy },
      orientation: page.orientation || 'portrait',
      profile: deepClone(profile)
    });
    const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    lastInspection = buildInspectionSnapshot(page, result, Math.max(0, t1 - t0));
    return deepClone(lastInspection);
  }

  async function submitCorrection({ predicted = null, actual, strokes = null, groupId = null } = {}) {
    const page = getCurrentPage() || { strokes: [] };
    let targetStrokes = Array.isArray(strokes) ? strokes : null;
    if (!targetStrokes && groupId && lastInspection?.groups?.length) {
      const grp = lastInspection.groups.find(g => g.groupId === groupId);
      if (grp) {
        const ids = new Set(grp.strokeIds);
        targetStrokes = (page.strokes || []).filter(s => ids.has(s.id));
      }
    }
    if (!targetStrokes) targetStrokes = Array.isArray(page.strokes) ? page.strokes : [];

    profile = recordUserCorrection(profile, {
      predicted,
      actual,
      strokes: deepClone(targetStrokes)
    });
    await saveProfileHook(deepClone(profile));
    if (applyCorrectionHook) {
      await applyCorrectionHook({ predicted, actual, groupId, strokeIds: targetStrokes.map(s => s.id) });
    }
    return deepClone(profile);
  }

  async function resetProfile() {
    profile = resetUserProfile();
    await saveProfileHook(deepClone(profile));
    return deepClone(profile);
  }

  function startCalibration(categories = Object.keys(CALIBRATION_PACKS)) {
    calibrationSession = createCalibrationSession(profile, categories);
    return {
      prompt: calibrationSession.getCurrentPrompt(),
      progress: calibrationSession.getProgress()
    };
  }

  function submitCalibrationSample(strokes, { repeat = false } = {}) {
    if (!calibrationSession) startCalibration();
    const res = calibrationSession.submitSample(deepClone(strokes), { repeat });
    if (res.accepted) {
      profile = calibrationSession.finish();
      void saveProfileHook(deepClone(profile));
    }
    return { ...res, progress: calibrationSession.getProgress() };
  }

  function repeatCalibration() {
    if (!calibrationSession) startCalibration();
    return {
      prompt: calibrationSession.repeatCurrent(),
      progress: calibrationSession.getProgress()
    };
  }

  function skipCalibration() {
    if (!calibrationSession) startCalibration();
    return {
      prompt: calibrationSession.skip(),
      progress: calibrationSession.getProgress()
    };
  }

  async function finishCalibration() {
    if (!calibrationSession) return deepClone(profile);
    profile = calibrationSession.finish();
    await saveProfileHook(deepClone(profile));
    const progress = calibrationSession.getProgress();
    calibrationSession = null;
    return { profile: deepClone(profile), progress };
  }

  function captureCurrentPageSample({ category = 'mixed', expected = {} } = {}) {
    const page = getCurrentPage() || { strokes: [] };
    const sample = recordPageSample(page, { category, expected });
    recordedSamples = [...recordedSamples, sample];
    if (onRecordHardwareSample) onRecordHardwareSample(deepClone(sample));
    return deepClone(sample);
  }

  async function replaySample(sample, recognizerFn = null, onStep = null, replayOptions = {}) {
    const fn = typeof recognizerFn === 'function'
      ? recognizerFn
      : async strokes => runPipeline(strokes, { profile: deepClone(profile) });
    return replaySampleSequentially(
      sample,
      async ev => {
        const result = await fn(ev.accumulatedStrokes, {
          strokeIndex: ev.strokeIndex,
          totalStrokes: ev.totalStrokes,
          isFinal: ev.isFinal,
          source: ev.source,
          category: ev.category,
          profile: deepClone(profile)
        });
        if (typeof onStep === 'function') {
          await onStep({ ...ev, result });
        }
        return result;
      },
      replayOptions
    );
  }

  async function compareEngines(enginesMap = {}, customSamples = null) {
    const dataset = Array.isArray(customSamples) && customSamples.length
      ? customSamples
      : recordedSamples.length
        ? recordedSamples
        : generateDeterministicDataset({ seed: 2026, split: 'evaluation' });

    const results = {};
    for (const [engineName, recognizerFn] of Object.entries(enginesMap)) {
      if (typeof recognizerFn !== 'function') continue;
      results[engineName] = await evaluateSuite(dataset, recognizerFn);
    }
    lastRegressionReport = {
      evaluatedAt: new Date().toISOString(),
      sampleCount: dataset.length,
      sources: {
        hardware: dataset.filter(s => s.source === 'huion-x10-hardware').length,
        simulated: dataset.filter(s => s.source === 'simulated').length
      },
      engines: results
    };
    return deepClone(lastRegressionReport);
  }

  function exportDiagnosticsJson() {
    return exportSanitizedLabDiagnostics({
      samples: recordedSamples,
      profile,
      inspection: lastInspection
    });
  }

  return {
    getActiveTab: () => activeTab,
    setActiveTab: tab => {
      if (LAB_TABS.some(t => t.id === tab)) activeTab = tab;
      return activeTab;
    },
    getProfile: loadProfile,
    getFrequentSymbols: (limit = 12) => getFrequentSymbols(profile, limit),
    getLastInspection: () => (lastInspection ? deepClone(lastInspection) : null),
    getRecordedSamples: () => deepClone(recordedSamples),
    getLastRegressionReport: () => (lastRegressionReport ? deepClone(lastRegressionReport) : null),
    inspectCurrentPage,
    submitCorrection,
    resetProfile,
    startCalibration,
    submitCalibrationSample,
    repeatCalibration,
    skipCalibration,
    finishCalibration,
    captureCurrentPageSample,
    replaySample,
    compareEngines,
    exportDiagnosticsJson
  };
}

function drawStrokesOnCanvas(canvas, originalStrokes = [], processedStrokes = []) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width || 300;
  const h = canvas.height || 210;
  ctx.clearRect(0, 0, w, h);

  const scaleX = w / 1000;
  const scaleY = h / 1400;

  // Trazos originales (azul grisáceo translúcido)
  ctx.save();
  ctx.strokeStyle = 'rgba(35, 109, 208, 0.55)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of originalStrokes) {
    const pts = Array.isArray(stroke?.pts) ? stroke.pts : [];
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * scaleX, pts[0][1] * scaleY);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * scaleX, pts[i][1] * scaleY);
    ctx.stroke();
  }
  ctx.restore();

  // Trazos procesados DSP (naranja nítido)
  ctx.save();
  ctx.strokeStyle = 'rgba(230, 91, 32, 0.92)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 2]);
  for (const stroke of processedStrokes) {
    const pts = Array.isArray(stroke?.points) ? stroke.points : Array.isArray(stroke?.pts) ? stroke.pts : [];
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * scaleX, pts[0][1] * scaleY);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * scaleX, pts[i][1] * scaleY);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Construye la interfaz del Laboratorio de Reconocimiento y Calibración Personal
 * y registra `window.MiNoteMathLab` en entornos con navegador.
 */
export function createMathLabUI(options = {}) {
  const state = createMathLabState(options);

  if (typeof document === 'undefined') {
    return {
      state,
      dialog: null,
      open: async () => state.inspectCurrentPage(),
      close: () => {},
      setTab: tab => state.setActiveTab(tab),
      refreshInspection: () => state.inspectCurrentPage(),
      destroy: () => {}
    };
  }

  const elm = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const dialog = elm('dialog', {
    id: 'mathLabDialog',
    class: 'dialog minote-math-lab-dialog',
    'aria-labelledby': 'mathLabTitle'
  });

  dialog.innerHTML = `
    <div class="math-lab-head">
      <h2 id="mathLabTitle">Laboratorio de Reconocimiento y Calibración</h2>
      <button type="button" id="mathLabClose" class="math-lab-icon-btn" aria-label="Cerrar">✕</button>
    </div>
    <nav class="math-lab-tabs" role="tablist" aria-label="Secciones del laboratorio"></nav>
    <div class="math-lab-body">
      <section data-lab-panel="inspect" class="math-lab-panel">
        <div class="math-lab-actions">
          <button type="button" id="mathLabRunInspect">Analizar hoja actual</button>
          <span id="mathLabSourceBadge" class="math-lab-badge">Fuente: —</span>
          <span id="mathLabTimingBadge" class="math-lab-badge">0 ms</span>
        </div>
        <canvas id="mathLabCompareCanvas" width="320" height="224" class="math-lab-canvas" aria-label="Comparativa trazos originales vs procesados"></canvas>
        <p class="math-lab-legend"><span class="dot-orig"></span> Originales &nbsp; <span class="dot-proc"></span> Procesados DSP</p>
        <div id="mathLabInspectSummary" class="math-lab-card"></div>
        <details class="math-lab-details"><summary>Coordenadas, candidatos y AST</summary><pre id="mathLabInspectRaw" class="math-lab-pre"></pre></details>
      </section>

      <section data-lab-panel="correct" class="math-lab-panel" hidden>
        <p class="math-lab-hint">Corrija una lectura para enseñar su trazo al perfil local (sesgo acotado ±0.12). Nunca se modifican los modelos base ni se envían datos.</p>
        <label class="math-lab-field">Símbolo detectado (opcional)<input type="text" id="mathLabPredicted" maxlength="24" placeholder="Ej. 1"></label>
        <label class="math-lab-field">Símbolo correcto<input type="text" id="mathLabActual" maxlength="24" placeholder="Ej. 7"></label>
        <div class="math-lab-actions">
          <button type="button" id="mathLabSaveCorrection">Guardar corrección en perfil</button>
          <button type="button" id="mathLabResetProfile" class="subtle">Reiniciar perfil</button>
        </div>
        <div id="mathLabFrequentList" class="math-lab-chips"></div>
      </section>

      <section data-lab-panel="calibrate" class="math-lab-panel" hidden>
        <div class="math-lab-cal-head">
          <strong id="mathLabCalTarget">Pulse iniciar para calibrar</strong>
          <span id="mathLabCalProgress" class="math-lab-badge">0%</span>
        </div>
        <canvas id="mathLabCalCanvas" width="320" height="200" class="math-lab-canvas math-lab-draw-canvas" aria-label="Área de dibujo para calibración"></canvas>
        <div class="math-lab-actions">
          <button type="button" id="mathLabCalStart">Iniciar / Reiniciar</button>
          <button type="button" id="mathLabCalSubmit">Guardar y siguiente</button>
          <button type="button" id="mathLabCalRepeat">Repetir ejemplo</button>
          <button type="button" id="mathLabCalClear" class="subtle">Limpiar trazo</button>
          <button type="button" id="mathLabCalSkip" class="subtle">Saltar</button>
          <button type="button" id="mathLabCalFinish">Finalizar y guardar</button>
        </div>
      </section>

      <section data-lab-panel="regression" class="math-lab-panel" hidden>
        <div class="math-lab-actions">
          <button type="button" id="mathLabCaptureSample">Registrar muestra de esta hoja</button>
          <button type="button" id="mathLabRunRegression">Ejecutar evaluación</button>
          <button type="button" id="mathLabExportDiag">Exportar JSON sanitizado</button>
        </div>
        <div id="mathLabRegressionOut" class="math-lab-card">Sin muestras registradas aún.</div>
        <pre id="mathLabExportPreview" class="math-lab-pre" hidden></pre>
      </section>
    </div>
    <p id="mathLabStatus" class="math-lab-status" role="status" aria-live="polite"></p>
  `;

  (options.mountTarget || document.body).append(dialog);

  const q = sel => dialog.querySelector(sel);
  const statusEl = q('#mathLabStatus');
  const tell = msg => { if (statusEl) statusEl.textContent = msg; };

  // Construir pestañas
  const tabsNav = q('.math-lab-tabs');
  for (const tab of LAB_TABS) {
    const btn = elm('button', {
      type: 'button',
      role: 'tab',
      'data-lab-tab': tab.id,
      'aria-selected': tab.id === 'inspect' ? 'true' : 'false'
    }, tab.label);
    btn.addEventListener('click', () => setTab(tab.id));
    tabsNav.append(btn);
  }

  function setTab(tabId) {
    const active = state.setActiveTab(tabId);
    for (const btn of dialog.querySelectorAll('[data-lab-tab]')) {
      const sel = btn.dataset.labTab === active;
      btn.setAttribute('aria-selected', sel ? 'true' : 'false');
      btn.classList.toggle('active', sel);
    }
    for (const panel of dialog.querySelectorAll('[data-lab-panel]')) {
      panel.hidden = panel.dataset.labPanel !== active;
    }
    if (active === 'correct') renderProfileChips();
  }

  function renderProfileChips() {
    const host = q('#mathLabFrequentList');
    if (!host) return;
    host.replaceChildren();
    const list = state.getFrequentSymbols(12);
    if (!list.length) {
      host.append(elm('span', { class: 'math-lab-hint' }, 'Aún no hay símbolos frecuentes aprendidos.'));
      return;
    }
    for (const item of list) {
      host.append(elm('span', { class: 'math-lab-chip' }, `${item.symbol} ×${item.count}`));
    }
  }

  async function refreshInspection() {
    tell('Analizando trazos…');
    try {
      const snap = await state.inspectCurrentPage();
      q('#mathLabSourceBadge').textContent =
        snap.source === 'huion-x10-hardware' ? 'Fuente: Hardware Huion X10' : 'Fuente: Simulada / táctil';
      q('#mathLabTimingBadge').textContent = `${snap.timingMs} ms`;
      drawStrokesOnCanvas(q('#mathLabCompareCanvas'), snap.originalStrokes, snap.processedStrokes);
      const summary = q('#mathLabInspectSummary');
      summary.replaceChildren(
        elm('div', {}, `Trazos: ${snap.originalCount} originales · ${snap.processedCount} procesados · ${snap.groups.length} grupo(s)`),
        elm('div', {}, `Motor: ${snap.engine} · Confianza: ${(snap.confidence.score * 100).toFixed(0)}% (${snap.confidence.level})`),
        elm('div', {}, `Interpretación: ${snap.interpretation.text || '—'} ${snap.interpretation.latex ? '| LaTeX: ' + snap.interpretation.latex : ''}`)
      );
      q('#mathLabInspectRaw').textContent = JSON.stringify({
        coordinatesPreview: snap.coordinatesPreview,
        candidates: snap.candidates,
        ast: snap.interpretation.ast
      }, null, 2);
      tell('Inspección actualizada.');
      return snap;
    } catch (err) {
      tell('Error de inspección: ' + (err?.message || String(err)));
      return null;
    }
  }

  // Dibujo táctil / stylus en canvas de calibración
  const calCanvas = q('#mathLabCalCanvas');
  let calStrokes = [];
  let activePts = null;

  function redrawCalCanvas() {
    const ctx = calCanvas?.getContext?.('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, calCanvas.width, calCanvas.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = activePts ? [...calStrokes, { pts: activePts }] : calStrokes;
    for (const s of all) {
      if (!s.pts || s.pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s.pts[0][0], s.pts[0][1]);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
      ctx.stroke();
    }
  }

  function renderCalPrompt(prompt, progress) {
    q('#mathLabCalTarget').textContent = prompt
      ? `Escriba: "${prompt.target}" (${prompt.category}) · muestras: ${prompt.samplesRecorded}`
      : 'Calibración completada. Pulse "Finalizar y guardar".';
    q('#mathLabCalProgress').textContent = `${progress?.percent ?? 0}% (${progress?.completed ?? 0}/${progress?.total ?? 0})`;
  }

  if (calCanvas) {
    const ptOf = e => {
      const r = calCanvas.getBoundingClientRect();
      return [
        Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * calCanvas.width),
        Math.round(((e.clientY - r.top) / Math.max(1, r.height)) * calCanvas.height),
        Number.isFinite(e.pressure) ? e.pressure : 0.5,
        Math.round(Date.now())
      ];
    };
    calCanvas.addEventListener('pointerdown', e => {
      activePts = [ptOf(e)];
      calCanvas.setPointerCapture?.(e.pointerId);
      redrawCalCanvas();
    });
    calCanvas.addEventListener('pointermove', e => {
      if (!activePts) return;
      activePts.push(ptOf(e));
      redrawCalCanvas();
    });
    const finishStroke = () => {
      if (activePts && activePts.length >= 2) {
        calStrokes.push({ id: `cal-${Date.now()}-${calStrokes.length}`, color: '#111827', width: 2.5, pts: activePts });
      }
      activePts = null;
      redrawCalCanvas();
    };
    calCanvas.addEventListener('pointerup', finishStroke);
    calCanvas.addEventListener('pointercancel', finishStroke);
  }

  // Eventos de botones
  q('#mathLabClose').addEventListener('click', () => dialog.close());
  q('#mathLabRunInspect').addEventListener('click', () => void refreshInspection());
  q('#mathLabSaveCorrection').addEventListener('click', async () => {
    const actual = q('#mathLabActual').value.trim();
    const predicted = q('#mathLabPredicted').value.trim() || null;
    if (!actual) { tell('Ingrese el símbolo correcto.'); return; }
    await state.submitCorrection({ predicted, actual });
    q('#mathLabActual').value = '';
    renderProfileChips();
    tell(`Corrección guardada en perfil local para "${actual}".`);
  });
  q('#mathLabResetProfile').addEventListener('click', async () => {
    await state.resetProfile();
    renderProfileChips();
    tell('Perfil personal reiniciado. Los cuadernos y trazos no se modificaron.');
  });
  q('#mathLabCalStart').addEventListener('click', () => {
    calStrokes = [];
    redrawCalCanvas();
    const { prompt, progress } = state.startCalibration();
    renderCalPrompt(prompt, progress);
    tell('Sesión de calibración iniciada.');
  });
  q('#mathLabCalClear').addEventListener('click', () => { calStrokes = []; redrawCalCanvas(); });
  const handleCalSubmit = repeat => {
    const res = state.submitCalibrationSample(calStrokes, { repeat });
    if (!res.accepted) { tell('Dibuje el símbolo antes de guardar.'); return; }
    calStrokes = [];
    redrawCalCanvas();
    renderCalPrompt(res.prompt, res.progress);
    tell(repeat ? `Muestra extra guardada para "${res.target}".` : `Muestra guardada para "${res.target}".`);
  };
  q('#mathLabCalSubmit').addEventListener('click', () => handleCalSubmit(false));
  q('#mathLabCalRepeat').addEventListener('click', () => handleCalSubmit(true));
  q('#mathLabCalSkip').addEventListener('click', () => {
    calStrokes = [];
    redrawCalCanvas();
    const { prompt, progress } = state.skipCalibration();
    renderCalPrompt(prompt, progress);
  });
  q('#mathLabCalFinish').addEventListener('click', async () => {
    await state.finishCalibration();
    renderProfileChips();
    tell('Perfil de calibración guardado localmente.');
  });
  q('#mathLabCaptureSample').addEventListener('click', () => {
    const sample = state.captureCurrentPageSample();
    q('#mathLabRegressionOut').textContent =
      `Muestras registradas: ${state.getRecordedSamples().length} · Última: ${sample.id} (${sample.source})`;
    tell(`Muestra registrada (${sample.source}).`);
  });
  q('#mathLabRunRegression').addEventListener('click', async () => {
    tell('Ejecutando evaluación…');
    const report = await state.compareEngines({
      'pipeline-actual': async strokes => options.runPipeline?.(strokes, { profile: state.getProfile() })
    });
    q('#mathLabRegressionOut').textContent = JSON.stringify(report, null, 2);
    tell(`Evaluación completada sobre ${report.sampleCount} muestra(s).`);
  });
  q('#mathLabExportDiag').addEventListener('click', () => {
    const json = state.exportDiagnosticsJson();
    const preview = q('#mathLabExportPreview');
    preview.hidden = false;
    preview.textContent = json;
    tell('Diagnóstico sanitizado (sin PII) listo para exportar.');
  });

  const api = {
    state,
    dialog,
    setTab,
    refreshInspection,
    open: async (tab = 'inspect') => {
      setTab(tab);
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      if (tab === 'inspect') await refreshInspection();
    },
    close: () => { if (dialog.open) dialog.close(); },
    destroy: () => { dialog.remove(); }
  };

  if (typeof window !== 'undefined') {
    window.MiNoteMathLab = api;
  }

  return api;
}
