import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MATH_CATEGORIES, INTERVENTION_LEVELS, runMathPipeline } from '../src/math/math-pipeline.mjs';
import { handleWorkerMessage } from '../src/math/math-worker.js';
import { createMathLabState } from '../src/math/math-lab.js';
import { createUserProfile, recordUserCorrection } from '../src/math/math-personalization.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('math-controller.js wires all 5 Pro categories (ready: true), 4 intervention levels, worker pipeline, lab & personalization', async () => {
  const src = await fs.readFile(path.join(rootDir, 'src', 'math', 'math-controller.js'), 'utf8');

  // All 5 categories enabled (ready: true)
  for (const cat of MATH_CATEGORIES) {
    assert.match(src, new RegExp(`id:'${cat}'[^}]*ready:true`), `Category ${cat} must be ready:true`);
  }
  assert.ok(!src.includes('(próximamente)'), 'No category should remain disabled as próximamente');

  // All 4 intervention levels present
  for (const level of INTERVENTION_LEVELS) {
    assert.match(src, new RegExp(`id:'${level}'`), `Intervention level ${level} must be present`);
  }

  // Worker pipeline, fault-isolated fallback, Lab & Personalization wiring
  assert.ok(src.includes("action:'pipeline'"), 'Worker must be invoked with action: pipeline');
  assert.ok(src.includes('runMathPipeline'), 'Fallback to runMathPipeline must be wired');
  assert.ok(src.includes('createMathLabUI'), 'Recognition Lab UI must be wired');
  assert.ok(src.includes('recordUserCorrection'), 'Personalization correction feedback must be wired');
  assert.ok(src.includes('mathRevertLast'), '1-click revert button must be present');

  // V0.80 preservation checks
  assert.ok(src.includes('scanHybridMath'), 'V0.80 hybrid math scan preserved');
  assert.ok(src.includes('collectMlkitCandidates'), 'ML Kit candidates passed into unified pipeline');
  assert.match(src, /scanHybridMath[\s\S]*recognizeWithPipeline\(/, 'Numbers axis routes through unified 2D pipeline');
  assert.match(src, /cat==='auto'\|\|cat==='algebra'\|\|cat==='data'/, 'Auto axis routes through unified pipeline');
  assert.ok(src.includes('scanCircleMeasurements'), 'V0.80 circle measurements preserved');
  assert.ok(src.includes('MiNoteMathVisibility'), 'V0.80 non-destructive visibility hook preserved');
});

test('menu-v019.js preserves V0.19 invariants and adds discrete Lab + Light/Dark theme controls in options menu', async () => {
  const src = await fs.readFile(path.join(rootDir, 'src', 'menu-v019.js'), 'utf8');

  // V0.19 invariants required by assert-v019.mjs
  assert.ok(src.includes("document.getElementById('tvBoardToggle')?.remove()"));
  assert.ok(src.includes("document.getElementById('tvBoardClose')?.remove()"));
  assert.ok(src.includes('minote-menu-group'));
  assert.ok(src.includes('Importar memoria agenda'));

  // Pro additions in menu (not cluttering horizontal writing bar)
  assert.ok(src.includes('mathLabOpenMenu'), 'Menu must expose Lab button');
  assert.ok(src.includes('minoteThemeToggle'), 'Menu must expose discrete theme toggle');
  assert.ok(src.includes('minoteTheme'), 'Theme dataset attribute must be toggled');
});

test('math-ui.css defines clean Light/Dark CSS variables while preserving white A5 paper', async () => {
  const css = await fs.readFile(path.join(rootDir, 'src', 'math', 'math-ui.css'), 'utf8');
  assert.ok(css.includes(':root[data-minote-theme="dark"]'), 'Dark theme CSS variables must exist');
  assert.ok(css.includes('canvas#paper{background:#ffffff;}'), 'A5 paper must remain white in dark mode');
  assert.ok(css.includes('.math-conf-high'), 'Confidence badge styles must exist');
});

test('math-stage.mjs stages all new Pro math modules and imports math-lab.css without breaking V0.80 anchors', async () => {
  const src = await fs.readFile(path.join(rootDir, 'scripts', 'math-stage.mjs'), 'utf8');
  const expectedFiles = [
    'math-dsp.mjs',
    'math-structural.mjs',
    'math-geometry-contextual.mjs',
    'math-data-charts.mjs',
    'math-personalization.mjs',
    'math-replay-harness.mjs',
    'math-pipeline.mjs',
    'math-lab.js',
    'math-lab.css'
  ];
  for (const file of expectedFiles) {
    assert.ok(src.includes(file), `math-stage.mjs must explicitly stage ${file}`);
  }
  assert.ok(src.includes("import './math/math-lab.css';"), 'math-stage.mjs must import math-lab.css');
  assert.ok(src.includes("window.MiNoteMathVisibility?.(pg.id,s.id)"), 'V0.80 visibility anchor preserved');
  assert.ok(src.includes('window.MiNoteMathBridge='), 'V0.80 bridge anchor preserved');
});

test('end-to-end integration: pipeline + worker + lab inspection + personalization profile stay immutable and reversible', async () => {
  const circlePts = [];
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    circlePts.push([300 + Math.cos(a) * 70, 300 + Math.sin(a) * 70, 0.5, 100 + i * 10]);
  }
  const page = {
    id: 'pg-pro-1',
    orientation: 'portrait',
    strokes: [{ id: 'st-circle', color: '#000000', width: 2.5, pts: circlePts }]
  };
  const before = JSON.stringify(page.strokes);

  let profile = createUserProfile({ enabled: true });
  profile = recordUserCorrection(profile, { predicted: '1', actual: '7' });

  const workerResp = handleWorkerMessage({
    id: 10,
    jobId: 'pro-job-10',
    epoch: 10,
    action: 'pipeline',
    strokes: page.strokes,
    category: 'auto',
    interventionLevel: 'digital',
    orientation: page.orientation,
    profile
  }, { latestEpoch: -1 });

  assert.equal(workerResp.cancelled, false);
  assert.equal(workerResp.result.winner.domain, 'geometry');
  assert.equal(workerResp.result.winner.kind, 'circle');
  assert.equal(workerResp.result.digitalObject.revertable, true);
  assert.equal(workerResp.result.digitalObject.originalStrokes.length, 1);

  const lab = createMathLabState({
    getCurrentPage: () => page,
    runPipeline: (strokes, opts) => runMathPipeline(strokes, { ...opts, category: 'geometry' }),
    getProfile: () => profile,
    saveProfile: next => { profile = next; }
  });
  const snap = await lab.inspectCurrentPage();
  assert.equal(snap.originalCount, 1);
  assert.equal(snap.processedCount, 1);
  assert.ok(['high', 'medium'].includes(snap.confidence.level));
  assert.ok(snap.confidence.score >= 0.8);
  assert.equal(snap.source, 'simulated');

  // Strict immutability
  assert.equal(JSON.stringify(page.strokes), before);
});
