# Matriz de Tareas y Propiedad de Archivos del Enjambre

> Actualizado tras completar Olas 1 y 2 (evaluación empírica ejecutada).

| Agente | Rol | Archivos Entregados / Propiedad | Commit / Ubicación | Verificación `@verifier` |
| :--- | :--- | :--- | :--- | :--- |
| **`@auditor-qa`** | Auditor Fase 0, Agente 11 (Arnés) y Docs | `docs/swarm/*` (10 docs), `src/math/math-replay-harness.mjs`, `tests/math-replay-harness.test.mjs` | Working tree (aterrizado) | Verificado (#22): `5/5` pass (`113 ms`) |
| **`@x10-ble-specialist`** | Agente 1 — Huion Note X10 y BLE | `src/x10-ble.js`, `src/ble-adapter.js`, `src/offline-x10.js`, `tests/x10-ble-hardening.test.mjs` | `aa1cc70` (aterrizado en working tree) | Verificado (#15): `83/83` pass (`619 ms`) |
| **`@stroke-dsp`** | Agente 2 — DSP de Trazos | `src/math/math-dsp.mjs`, `tests/math-dsp.test.mjs` | `61ad67b` (aterrizado en working tree) | Verificado (#18): `13/13` pass (`218 ms`) |
| **`@ai-researcher`** | Agente 3 (IA) + Agente 7 (Personalización y Lab) | `docs/swarm/MODEL_COMPARISON.md`, `docs/swarm/RECOGNITION_ENGINE.md`, `src/math/math-personalization.mjs`, `tests/math-personalization.test.mjs`, `src/math/math-lab.js`, `src/math/math-lab.css`, `tests/math-lab.test.mjs` | Working tree (aterrizado) | Verificado (#19 y #33): `6/6` + `7/7` pass (`125 ms`) |
| **`@math-struct`** | Agente 4 — Reconocimiento Matemático 2D | `src/math/math-structural.mjs`, `tests/math-structural.test.mjs` | `9c0b4af` (aterrizado en working tree) | Verificado (#20): `22/22` pass (`146 ms`) |
| **`@geometry-pro`** | Agentes 5 y 6 — Geometría Contextual y Datos/Gráficos | `src/math/math-geometry-contextual.mjs`, `src/math/math-data-charts.mjs`, `tests/math-geometry-contextual.test.mjs`, `tests/math-data-charts.test.mjs` | `98d04e0` (aterrizado en working tree) | Verificado (#26): `20/20` pass (`196 ms`) |
| **`@pipeline-engine`** | Arquitecto Pipeline, Worker y UX/Build (Agentes 8 y 9) | Ola 2: `src/math/math-pipeline.mjs`, `src/math/math-worker.js`, `tests/math-pipeline.test.mjs`. Ola 3 (en curso): `src/math/math-controller.js`, `src/math/math-ui.css`, `scripts/math-stage.mjs`, `src/menu-v019.js`, `tests/math-integration-pro.test.mjs` | Working tree | Ola 2 verificada (#35): `9/9` (`math-pipeline`) y `152/152` (`math-*.test.mjs`). Ola 3 en curso |
| **`@verifier`** | Agentes 10 y 11 — QA y Seguridad | Auditoría de solo lectura en todas las entregas | Activo | 7 verificaciones completadas (incluyendo detección y re-verificación de 2 bugs en `math-lab.js` #31→#33) |
| **`@monitor`** | Monitor de bloqueos | Solo lectura del tablero | Activo | Sin bloqueos |
