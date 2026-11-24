# Registro de Decisiones Técnicas (ADR) — Mi Note Professional

> Decisiones arquitectónicas adoptadas y verificadas durante las Olas 0, 1 y 2.

---

## ADR-001: Preservación Inmutable de Tinta Original (`page.strokes`)
- **Estado:** Verificado en todos los módulos (`deepFreeze` en DSP, clonado defensivo en pipeline/harness/lab).
- **Decisión:** `page.strokes` nunca se muta. Toda digitalización se guarda en `page.mathLayer` con `sources: [{ id, signature }]` para reversión en 1 clic.

## ADR-002: Protocolo BLE Exclusivo en Modo Agenda (LED Azul) + Metadatos Cinemáticos Aditivos
- **Estado:** Implementado y verificado (`aa1cc70`, 83/83 tests BLE).
- **Decisión:** Mantener `sessionKind = 'agenda-pura'` sin Modo Tableta ni «Continuar escribiendo». Los metadatos cinemáticos (`t, dt, seq, speed, dPress, strokeStart, strokeEnd`) se entregan como 4.º argumento opcional `meta` en `onPen` y mediante `mapPointWithMeta`, dejando intacto `mapPoint` (`[x, y, press]`).

## ADR-003: Arquitectura Híbrida Escalonada Offline-First (0 Deps en V1.0)
- **Estado:** Aprobado (`MODEL_COMPARISON.md` + `RECOGNITION_ENGINE.md`) e implementado (`math-pipeline.mjs`).
- **Decisión:** Ejecutar todo el pipeline central (DSP, símbolos locales, geometría contextual, datos/gráficos, estructural 2D, fusión, calibración y personalización) en ES Modules puros sin dependencias externas (< 0.2 MB). Mantener ML Kit (`es`) como señal auxiliar opcional 1D acotada (`<= 0.82`, nunca bloqueante ni con veto sobre 2D). Dejar la interfaz `SymbolEngine` lista para un micro-clasificador INT8 (~0.5–1.5 MB) en V1.x.

## ADR-004: Fidelidad Pedagógica, Anti-Trapecio y No-Invención de Datos
- **Estado:** Verificado por pruebas negativas en `math-structural`, `math-geometry-contextual`, `math-data-charts` y `math-pipeline`.
- **Decisión:**
  - Jamás autocorrige errores matemáticos (`2+2=5`) ni resuelve ejercicios (`2+3=`).
  - `EXCLUDED_AUTO_SHAPES = ['trapezoid']`; los rectángulos preservan sus proporciones y jamás se colapsan a cuadrados.
  - En tablas y gráficos, toda celda/escala no escrita permanece `null`.

## ADR-005: Sesgo Personal Local Acotado (`±0.12`) y Exportación Sanitizada Sin PII
- **Estado:** Implementado y verificado (`math-personalization.mjs`, `math-replay-harness.mjs`, `math-lab.js`).
- **Decisión:** El perfil de escritura del docente reside 100% localmente, limita su influencia a `±0.12` (`MAX_BIAS_DELTA`) para no anular evidencia base clara, y toda exportación de diagnóstico o lote de muestras pasa por lista blanca eliminando PII (`userName`, `email`, `deviceId`, `notebookTitle`, `x10` crudo).

## ADR-006: Aislamiento de Fallos y Cancelación por `epoch` en Web Worker
- **Estado:** Implementado y verificado (`math-pipeline.mjs`, `math-worker.js`).
- **Decisión:** Cada sub-motor corre dentro de `try/catch` independiente registrando errores en `diagnostics.engineErrors`. `math-worker.js` añade `action: 'pipeline'` con cancelación por `epoch` preservando 100% compatibilidad hacia atrás con las acciones V0.80 (`automatic`, `propose`).
