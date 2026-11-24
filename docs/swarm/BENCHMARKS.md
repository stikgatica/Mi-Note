# Benchmarks y Rendimiento — Mi Note Professional

> Mediciones reales obtenidas en Windows con Node.js portable `v22.11.0`. Todas las cifras de reconocimiento corresponden a muestras **`simulated`**; la validación de latencia en dispositivo Android real con Huion Note X10 queda pendiente de prueba física.

---

## 1. Benchmarks de Módulos (Olas 1 y 2)

| Componente | Escenario Medido | Resultado Medido | Presupuesto Objetivo | Estado |
| :--- | :--- | :--- | :---: | :---: |
| **Suite BLE + Math + UI combinada** | 248 tests (41 archivos: `x10-*`, `ble-adapter`, `battery-adapter`, `offline-*`, `math-*`, `ui-*`, tras fix `KI-101`/`KI-102`) | **1112.92 ms** | < 3000 ms | Cumplido |
| **Suite Math completa** | 152+ tests (`tests/math-*.test.mjs` incluyendo `KI-101`/`KI-102` y `math-lab`) | **< 700 ms** | < 2000 ms | Cumplido |
| **`math-dsp.mjs` (One Euro vs MA)** | Trazo L ruidoso (`rawRMS=2.38px`, `path=1.60px`) | OneEuroCausal `path=0.91px, cornerErr=0.50px`; MA9 `RMS=2.95px, cornerErr=11.39px` | Mejor que MA | Cumplido |
| **`math-dsp.mjs` (RDP)** | Círculo 180 pts (`eps=0.5/1.5/3.0/6.0`) | Reducción a `52 / 33 / 17 / 17` pts | Compresión limpia | Cumplido |
| **`math-dsp.mjs` (`processStrokes`)** | 25 trazos / 1170 pts / 300 relaciones por pares | **87.76–181.44 ms** (según carga CPU) | Optimizable en Fase futura | Aceptable en Worker |
| **`runMathPipeline` (Geometría, lote)** | 4 muestras geométricas (`circle`, `rectangle`, `triangle`, `overtraced-line`) | Antes: `p50 4.14 ms · p95 8.67 ms` → **Después: `p50 5.38 ms · p95 9.30 ms`** | < 15 ms | Cumplido |
| **`runMathPipeline` (Ruido, lote)** | Puntos accidentales | Antes: `0.85 ms` → **Después: `0.57 ms`** | < 5 ms | Cumplido |
| **`runMathPipeline` (Números/Álgebra, lote)** | Expresiones de 3–9 trazos (OCR local 16×16 + estructural 2D) | Antes: `p50 62.7–64.7 ms · p95 66.10 ms` → **Después: `numbers p50 20.58 ms / p95 54.49 ms · algebra 17.80 ms`** | < 60 ms | Cumplido |
| **`runMathPipeline` (Global, lote 9 muestras)** | Dataset determinista `split: 'evaluation'` (`seed: 2026`, `simulated`) | Antes: `mean 24.77 ms · p50 6.76 ms · p95 66.10 ms` → **Después: `min 0.57 ms · mean 14.46 ms · p50 9.21 ms · p95 54.49 ms`** | p50 < 20 ms, p95 < 60 ms | Cumplido |
| **`runMathPipeline` (Progresivo, trazo a trazo)** | Re-evaluación acumulada en cada trazo (hasta 9 trazos en álgebra) | Antes: `mean 65.05 ms · p50 6.95 ms · p95 251.21 ms` → **Después: `mean 19.69 ms · p50 9.00 ms · p95 56.35 ms`** | Usar debounce real en Worker | Cumplido (4.5× más rápido en p95) |

---

## 2. Comparativa de Referencia V0.80 vs Mi Note Professional

- **Hilo principal de escritura (`app.js`):** Mantiene 0 bloqueos; todo el pipeline pesado corre en `math-worker.js` con cancelación por `epoch` si el usuario sigue escribiendo.
- **Overhead de tamaño:** Los nuevos módulos `.mjs` son JS puro sin dependencias externas (< 0.2 MB en total en el bundle WebView), frente a +15–40 MB que habría costado empaquetar un modelo HMER TFLite/ONNX.
