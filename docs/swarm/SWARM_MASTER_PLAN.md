# Plan Maestro del Enjambre — Mi Note Professional (Evolución desde V0.80)

> **Estado:** Olas 0, 1 y 2 implementadas y verificadas · Integración final UX/UI y build en curso (`@pipeline-engine`).  
> **Repositorio:** `c:\Users\Stik G\Mi-Note\Mi-Note` (`android-native/`, paquete `cl.stikgatica.minote.x10`, base `0.80.0`).

---

## 1. Objetivo Estratégico

Evolucionar **Mi Note X10 (V0.80)** hacia **Mi Note Professional** añadiendo un pipeline offline de procesamiento digital de trazos (DSP), reconocimiento matemático estructural 2D, geometría computacional contextual, tablas/gráficos editables, personalización local, laboratorio de calibración y arnés de regresión, **preservando al 100% cada capacidad validada de V0.80**.

---

## 2. Reglas Inviolables de Preservación (Línea Base V0.80)

1. **Tinta original inmutable:** `page.strokes` nunca se sobrescribe ni destruye; toda mejora vive en `page.mathLayer` con huellas FNV-1a (`fingerprint`) para reversión en 1 clic.
2. **Solo Modo Agenda (LED azul):** `x10-ble.js` opera exclusivamente en `sessionKind = 'agenda-pura'` (`0x8D`, `0x8A`, `0x81/0x82`). **NUNCA** reintroducir Modo Tableta (LED blanco) ni comandos `C9/C8/CA`.
3. **Sin «Continuar escribiendo»:** Una única conexión de agenda; sin botones de cambio de modo.
4. **Sin trapecios automáticos ni deformación de proporciones:** `EXCLUDED_AUTO_SHAPES = ['trapezoid']`; los rectángulos nunca se aplastan a cuadrados.
5. **Fidelidad pedagógica:** El motor matemático **NUNCA** autocorrige errores del docente ni resuelve ejercicios (`2 + 2 = 5` se transcribe tal cual). En tablas y gráficos, **NUNCA** inventa valores, escalas ni encabezados (`null` si no fue escrito).
6. **Seguridad física de la X10:** `offline-x10.js` es de solo lectura. El borrado (`0x8B`/`0x8C`) exige respaldo cifrado verificado en Drive y doble confirmación.
7. **Offline-first y privacidad:** Cero telemetría, cero dependencias externas en runtime para los nuevos módulos `.mjs`; exportación de diagnósticos sanitizada sin PII.
8. **UX/UI V0.80 intacta:** Hoja A5 (`1000 × 1400`), barra flotante horizontal/vertical, lápiz negro `2.5` (`#111827`), autorrotación, modo TV, puntero circular (`pen-hover.js`), batería (`0x8E`/`2A19`) y memoria (`0x8F`/`0x85`), exportación SVG/PNG/PDF/WebM, respaldo cifrado Drive (SAF + AndroidKeyStore), recordatorios Calendar con deduplicación y firma permanente (`signing-guard.mjs`).

---

## 3. Fases de Ejecución y Estado Actual

| Ola / Fase | Alcance | Responsables | Estado |
| :--- | :--- | :--- | :--- |
| **Fase 0** | Auditoría V0.80, línea base de pruebas (`296 pass / 1 fail jszip`) y `docs/swarm/` | `@auditor-qa` | Completada |
| **Ola 1** | Endurecimiento BLE (`aa1cc70`), DSP (`61ad67b`), Comparativa + Contrato (`MODEL_COMPARISON.md`, `RECOGNITION_ENGINE.md`), Estructural 2D (`9c0b4af`), Geometría Contextual + Datos/Gráficos (`98d04e0`), Personalización (`math-personalization.mjs`), Arnés de Regresión (`math-replay-harness.mjs`) | `@x10-ble-specialist`, `@stroke-dsp`, `@ai-researcher`, `@math-struct`, `@geometry-pro`, `@auditor-qa`, `@verifier` | Completada y verificada |
| **Ola 2** | Integración de los 4 commits verificados en working tree (`217/217` BLE+Math), Laboratorio de Reconocimiento y Calibración (`math-lab.js/.css`), Pipeline Unificado (`math-pipeline.mjs`) y Worker asíncrono (`math-worker.js`) | `@auditor-qa`, `@ai-researcher`, `@pipeline-engine`, `@verifier` | Completada y verificada |
| **Ola 3** | Integración UX/UI en `math-controller.js`, `math-ui.css`, `menu-v019.js`, `scripts/math-stage.mjs`, prueba de integración y validación del pipeline `stage/` | `@pipeline-engine`, `@verifier` | En curso |
| **Ola 4** | Evaluación empírica (`math-replay-harness.mjs`), actualización final de `docs/swarm/`, build release Android en CI (cuando el usuario autorice push) y validación en hardware físico Huion Note X10 | `@auditor-qa`, Usuario / CI | Evaluación simulada y docs listos; build APK y prueba física X10 pendientes |

---

## 4. Comparación Sintética: V0.80 vs Mi Note Professional

| Capacidad | V0.80 (Línea Base) | Mi Note Professional (Olas 1–2) |
| :--- | :--- | :--- |
| **BLE Huion X10** | Modo Agenda LED azul, lectura offline `0x85–0x88` | + Corrección de tramas `0x8D` fragmentadas con byte `0xCD`, `connectGeneration` anti-race, protección contra paquetes duplicados pobres y metadatos cinemáticos no destructivos |
| **DSP de Trazos** | Ninguno (puntos crudos `[x, y, press]`) | `math-dsp.mjs`: One Euro Filter causal/zero-phase, RDP, resampleo uniforme, Catmull-Rom/Bézier, detección de esquinas, overtracing, puntos accidentales y agrupación espacio-temporal |
| **Matemática 2D** | Solo aritmética lineal 1D (`math-hybrid-ocr.mjs`) + plantillas básicas | `math-structural.mjs`: relaciones espaciales 2D, AST/LaTeX/MathML (fracciones, potencias, raíces, álgebra, aritmética vertical, sistemas), desambiguación contextual y progresivo fuera de orden |
| **Geometría** | Rectas, polígonos, círculos y radio/diámetro | `math-geometry-contextual.mjs`: TLS/RANSAC/Kasa/Taubin/elipses/3D wireframe + 12 elementos internos contextuales (cuerda, altura, mediana, bisectriz, diagonal, marca 90°, congruencia, flechas) sin auto-trapecios |
| **Datos y Gráficos** | Deshabilitado (`ready: false`) | `math-data-charts.mjs`: tablas, frecuencias, barras, histogramas, líneas, sectores, puntos, tallo-hoja, caja, árboles de probabilidad, recta numérica y plano cartesiano sin inventar valores |
| **Personalización y Lab** | Inexistente | `math-personalization.mjs` (sesgo acotado `±0.12`, calibración guiada) + `math-lab.js/.css` (inspección, corrección, calibración, diagnóstico sin PII) |
| **Pipeline y Regresión** | Worker simple (`automatic`/`propose`) | `math-pipeline.mjs` (5 categorías, 4 niveles de intervención, aislamiento de fallos) + `math-worker.js` (`action: 'pipeline'` + `epoch`) + `math-replay-harness.mjs` |
