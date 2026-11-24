# Resultados de Pruebas — Mi Note Professional

> Registro verificado de todas las ejecuciones de pruebas automatizadas (Node.js v22.11.0 portable) y de la evaluación empírica del pipeline.

---

## 1. Historial de Suites Unitarias y de Integración

| Fecha | Hito / Agente | Alcance de Pruebas | Pass / Fail | Duración | Notas |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-24 | **Fase 0 — Línea Base V0.80** (`@auditor-qa`) | `tests/*.test.mjs` (59 archivos, sin `node_modules`) | **296 / 1** | `1398.19 ms` | Único fallo esperado: `huion-archive.test.mjs` requiere `jszip` (`npm install`). |
| 2026-11-24 | **Ola 1 — BLE** (`@x10-ble-specialist`, `aa1cc70`, verificado `@verifier`) | `ble-adapter`, `battery-adapter`, `offline-*.test.mjs`, `x10-*.test.mjs` (+7 nuevos en `x10-ble-hardening.test.mjs`) | **83 / 0** | `618.66 ms` | 100% pass. |
| 2026-11-24 | **Ola 1 — DSP** (`@stroke-dsp`, `61ad67b`, verificado `@verifier`) | `tests/math-dsp.test.mjs` | **13 / 0** | `218.05 ms` | Inmutabilidad con `deepFreeze` verificada. |
| 2026-11-24 | **Ola 1 — Estructural 2D** (`@math-struct`, `9c0b4af`, verificado `@verifier`) | `tests/math-structural.test.mjs` | **22 / 0** | `146.26 ms` | Incluye progresivo fuera de orden y `2+2=5`. |
| 2026-11-24 | **Ola 1 — Geometría + Datos** (`@geometry-pro`, `98d04e0`, verificado `@verifier`) | `tests/math-geometry-contextual.test.mjs` + `tests/math-data-charts.test.mjs` | **20 / 0** | `196.19 ms` | Incluye pruebas negativas anti-trapecio y no-invención. |
| 2026-11-24 | **Ola 1 — Personalización** (`@ai-researcher`, verificado `@verifier`) | `tests/math-personalization.test.mjs` | **6 / 0** | `103.50 ms` | Sesgo acotado `±0.12` y anti prototype-pollution. |
| 2026-11-24 | **Ola 1 — Arnés Regresión** (`@auditor-qa`, verificado `@verifier`) | `tests/math-replay-harness.test.mjs` | **5 / 0** | `113.11 ms` | Sanitización PII y cero fuga train/eval. |
| 2026-11-24 | **Ola 2 — Integración 4 commits** (`@auditor-qa`) | `ble-adapter`, `offline-*`, `x10-*`, `math-*` combinados | **217 / 0** | `957.42 ms` | Cero regresiones tras aterrizar `aa1cc70`, `61ad67b`, `9c0b4af`, `98d04e0`. |
| 2026-11-24 | **Ola 2 — Laboratorio** (`@ai-researcher`, verificado `@verifier`) | `tests/math-lab.test.mjs` + `tests/math-personalization.test.mjs` | **13 / 0** | `124.69 ms` | 7/7 `math-lab` (tras corregir #31) + 6/6 `math-personalization`. |
| 2026-11-24 | **Ola 2 — Pipeline + Worker** (`@pipeline-engine`, verificado `@verifier`) | `tests/math-pipeline.test.mjs` (9/9) y suite completa `tests/math-*.test.mjs` | **152 / 0** | `659.91 ms` | 100% pass en los 152 tests matemáticos. |
| 2026-11-24 | **Ola 3 — Fix `KI-101` + `KI-102`** (`@fix-ki101-ki102`) | 41 archivos (`x10-*`, `ble-adapter`, `battery-adapter`, `offline-*`, `math-*`, `ui-*`, +4 nuevos tests unitarios) | **248 / 0** | `1112.92 ms` | 100% pass; `math-replay-harness.mjs` intacto. |

---

## 2. Evaluación Empírica Real de `runMathPipeline` (Antes vs Después de `KI-101` y `KI-102`)

Ejecutada usando el arnés **intacto** `math-replay-harness.mjs` (`generateDeterministicDataset({ seed: 2026, split: 'evaluation' })`, estrictamente aislado de `train` y `calibration`, modo `intervention: 'smart'`).

> **Advertencia de origen de datos:** El 100% de esta evaluación corresponde a muestras **`source: 'simulated'`** (`9` muestras). Las muestras reales de hardware **`source: 'huion-x10-hardware'`** son **`0`** hasta realizar pruebas físicas con la Huion Note X10.

### Métricas Reales Obtenidas (Antes vs Después)

| Modo de Evaluación | Fuente | Muestras | Aciertos (Antes → Después) | Precisión (Antes → Después) | Auto-Transf. Incorrectas (Antes → Después) | Latencia p50 (Antes → Después) | Latencia p95 (Antes → Después) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Lote (`progressive: false`)** | `simulated` | 9 | 4 → **9** | 44.44% → **100.00%** | 1 (11.11%) → **0 (0.00%)** | `6.76 ms` → **`9.21 ms`** | `66.10 ms` → **`54.49 ms`** |
| **Progresivo (`progressive: true`)** | `simulated` | 9 | 4 → **9** | 44.44% → **100.00%** | 1 (11.11%) → **0 (0.00%)** | `6.95 ms` → **`9.00 ms`** | `251.21 ms` → **`56.35 ms`** |
| **Hardware Real X10** | `huion-x10-hardware` | **0** | — | *Pendiente* | — | — | — |

### Desglose por Categoría (Modo Lote, `simulated`, Después del Fix)

| Categoría | Total | Aciertos (Antes → Después) | Precisión (Antes → Después) | Auto-Transf. Incorrectas | p50 | p95 | Observación Real |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`geometry`** | 4 | 3 → **4** | 75.00% → **100.00%** | **0 (0.00%)** | `5.38 ms` | `9.30 ms` | `circle`, `rectangle` (proporciones preservadas), `triangle` y `overtraced-line` (`shape:line`, sin falso `angle`) 100% correctos. |
| **`noise`** | 1 | 1 → **1** | 100.00% → **100.00%** | **0 (0.00%)** | `0.57 ms` | `0.57 ms` | Puntos accidentales rechazados limpiamente (`<none>`). |
| **`numbers`** | 3 | 0 → **3** | 0.00% → **100.00%** | **0 (0.00%)** | `20.58 ms` | `54.49 ms` | `42`, `2+2=5` (error pedagógico preservado sin auto-corregir) y `\frac{3}{4}` (fuera de orden) reconocidos localmente. |
| **`algebra`** | 1 | 0 → **1** | 0.00% → **100.00%** | **0 (0.00%)** | `17.80 ms` | `17.80 ms` | `x+5=12` (símbolos multi-trazo `x`, `+`, `=`) reconocido localmente. |

### Conclusión Honesta de QA
- **Brechas resueltas (`KI-101`, `KI-102` y mejora en `KI-103`):**
  1. `overtraced-line` (dos trazos antiparalelos superpuestos) ahora se detecta de forma orientación-agnóstica en `math-dsp.mjs`, se fusiona y se clasifica como `line` en `math-geometry-contextual.mjs` (0% de auto-transformaciones incorrectas).
  2. `extractLocalSymbolTokens` en `math-pipeline.mjs` ahora agrupa símbolos multi-trazo (`+`, `=`, `×`, `x`, `4`, `5`, `7`) y clasifica localmente con detectores geométricos + raster normalizado 16×16, logrando 100% en `evaluation` (9/9), `train` (9/9) y `calibration` (9/9) sin tocar el arnés, y reduciendo la latencia p95 progresiva de `251.21 ms` a `56.35 ms`.
- **Pendiente crítico:** La validación con escritura humana real en teléfono Android + **Huion Note X10 físico** (`source: 'huion-x10-hardware'`, actualmente `0` muestras) sigue siendo obligatoria antes de declarar estabilidad en aula.
