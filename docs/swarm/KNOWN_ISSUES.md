# Problemas Conocidos, Limitaciones Reales y Riesgos — Mi Note Professional

> Actualizado tras completar Olas 1 y 2 y ejecutar la evaluación empírica de `runMathPipeline` (2026-11-24).

---

## 1. Hallazgos Reales de la Evaluación Empírica (`simulated`)

| ID | Severidad / Estado | Hallazgo | Evidencia Empírica | Resolución / Plan |
| :--- | :--- | :--- | :--- | :--- |
| **KI-101** | **Resuelto** (antes Media) | **Línea repasada (`overtraced-line`) clasificada como `angle`** | Antes: `sim-evaluation-noise-overtraced-line` se auto-transformaba en `shape:angle` (`1/9 = 11.11%` error). Después: **`shape:line` correcto (`0/9 = 0.00%` auto-transformaciones incorrectas)**. | `detectOvertracing`/`mergeOvertracedStrokes` en `math-dsp.mjs` comparan secuencias directa e invertida punto a punto; `math-geometry-contextual.mjs` fusiona trazos colineales (~0°/~180°) en `line` y excluye ángulos fuera de `12°..168°`; `math-pipeline.mjs` aplica fusión de overtracing antes de geometría preservando todos los `sourceStrokeIds`. |
| **KI-102** | **Resuelto en `simulated`** (antes Media; validar en hardware X10) | **Bajo recall de OCR local de símbolos crudos sin ML Kit (`numbers`/`algebra`)** | Antes: `numbers` `0/3`, `algebra` `0/1` (`<none>`). Después en `evaluation` (`seed: 2026`): **`numbers` `3/3` (`42`, `2+2=5` preservado, `\frac{3}{4}`), `algebra` `1/1` (`x+5=12`), `noise` `1/1` rechazado** (`9/9 = 100%`, `0` falsas auto-transformaciones). | `extractLocalSymbolTokens` en `math-pipeline.mjs` agrupa símbolos multi-trazo (`+`, `=`, `×`, `x`, `4`, `5`, `7`), filtra puntos accidentales y clasifica con detectores geométricos + raster 16×16 normalizado y rasgos online. Para escritura humana libre muy diversa en V1.x sigue siendo recomendable el micro-clasificador INT8 (~0.5–1.5 MB) de `MODEL_COMPARISON.md` + ML Kit (`es`) y calibración en `math-lab.js`. |
| **KI-103** | **Mitigado** (Baja) | **Latencia p95 en OCR local (`66.10 ms`) y progresiva (`251.21 ms`)** | Tras el clasificador raster 16×16 y consulta condicional a `math-ink-ocr.mjs`, la latencia cayó a **`p95 54.49 ms` (lote)** y **`p95 56.35 ms` (progresivo, 4.5× más rápido)**. | Mantener siempre el debounce adaptativo (`650–1600 ms`) y la cancelación por `epoch` en `math-worker.js` / `createProgressivePipeline`. |

---

## 2. Limitaciones de Hardware, Entorno y Compilación Android

| ID | Área | Limitación Real | Cómo Resolverla |
| :--- | :--- | :--- | :--- |
| **KI-001** | Entorno local (`npm`) | `android-native/node_modules/` no está instalado en este checkout local, por lo que `tests/huion-archive.test.mjs` falla con `ERR_MODULE_NOT_FOUND: 'jszip'`. | Ejecutar `npm install --no-audit --no-fund` (como hace CI en `android-release.yml`) para pasar `huion-archive.test.mjs`. |
| **KI-002** | Hardware X10 físico | **0 muestras reales `huion-x10-hardware` evaluadas todavía.** Todas las pruebas del enjambre son unitarias o simuladas (`source: 'simulated'`). | Realizar prueba física en teléfono Android + Huion Note X10 real (LED azul, escritura en vivo, importación offline, batería `0x8E`, memoria `0x8F`, Laboratorio de calibración) antes de declarar estable en aula. |
| **KI-003** | Compilación de APK | **No se puede compilar ni firmar el APK release localmente en esta máquina** sin Android SDK, Gradle y el keystore permanente. | La compilación y firma permanente del APK ocurren exclusivamente en GitHub Actions (`.github/workflows/android-release.yml`, protegido por `signing-guard.mjs`) **únicamente cuando el usuario autorice hacer push**. |
| **KI-004** | Firmware X10 *sparse* | Algunos firmwares X10 devuelven paquetes offline `0x87` con 1 punto activo + 19 ceros. | `offline-x10.js` ya aplica sondeo `0x88`, protege contra sobrescritura por paquetes más pobres (`aa1cc70`) y conserva marcas aisladas sin inventar trazos. |
