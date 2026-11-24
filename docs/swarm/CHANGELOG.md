# Registro de Cambios (Changelog) — Mi Note Professional

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

---

## [Unreleased] — Mi Note Professional (Olas 1 y 2 verificadas sobre base V0.80)

### Añadido
- **DSP inmutable de trazos (`src/math/math-dsp.mjs`):** One Euro Filter (causal y zero-phase), media móvil, RDP, resampleo uniforme de arco, interpolación Catmull-Rom/Bézier, normalización PCA, detección de esquinas, overtracing, puntos accidentales y agrupación espacio-temporal (`13/13` tests).
- **Motor matemático estructural 2D (`src/math/math-structural.mjs`):** Analizador espacial 2D, parser AST/LaTeX/MathML (números, decimales, fracciones y anidadas, mixtos, potencias, raíces, porcentajes, razones, notación científica, aritmética vertical, álgebra, ecuaciones, inecuaciones, sistemas, funciones, pares ordenados, sucesiones), desambiguación contextual, reconocedor progresivo fuera de orden y `fuseInterpretations`, preservando siempre errores pedagógicos (`2+2=5`) (`22/22` tests).
- **Geometría computacional contextual (`src/math/math-geometry-contextual.mjs`):** Ajuste robusto (PCA, TLS/RANSAC, Kasa/Taubin, elipses, arcos, wireframes 3D) y 12 elementos internos contextuales, con exclusión estricta de trapecios automáticos y preservación de proporciones (`20/20` tests junto a datos).
- **Datos, tablas y gráficos (`src/math/math-data-charts.mjs`):** Tablas, frecuencias, barras, histogramas, líneas, sectores, puntos, tallo-hoja, caja, árboles de probabilidad, recta numérica y plano cartesiano sin inventar valores ni escalas.
- **Personalización local y Laboratorio (`src/math/math-personalization.mjs`, `src/math/math-lab.js`, `src/math/math-lab.css`):** Perfil local serializable con sesgo acotado `±0.12`, calibración guiada y panel de 4 pestañas (Inspección, Corrección/Perfil, Calibración, Regresión sin PII) (`13/13` tests).
- **Pipeline unificado y Worker asíncrono (`src/math/math-pipeline.mjs`, `src/math/math-worker.js`):** 5 categorías (`auto`, `numbers`, `algebra`, `geometry`, `data`), 4 niveles de intervención (`original`, `assisted`, `smart`, `digital`), aislamiento de fallos por sub-motor, cancelación por `epoch` y compatibilidad 100% V0.80 (`9/9` tests pipeline, `152/152` tests `math-*`).
- **Arnés de reproducción y regresión (`src/math/math-replay-harness.mjs`):** Formato `RecordingSample` (`simulated` vs `huion-x10-hardware`), sanitización PII, separación estricta train/eval por ID y huella, reproducción progresiva y métricas p50/p95/matriz de confusión (`5/5` tests).
- **Documentación técnica del enjambre (`docs/swarm/`):** 12 documentos incluyendo `MODEL_COMPARISON.md` y `RECOGNITION_ENGINE.md`.

### Mejorado (BLE Huion Note X10 — `aa1cc70`)
- **`src/x10-ble.js`:** Corrección de ensamblado de tramas `0x8D` fragmentadas con byte `0xCD` o cabecera de 1 byte; respeto de límites `0x95` en `parseNotePenFrames`; metadatos cinemáticos no destructivos opcionales sin alterar `[x, y, press]`.
- **`src/ble-adapter.js`:** Guarda `connectGeneration` anti-callbacks tardíos y deduplicación de `connect()` concurrentes.
- **`src/offline-x10.js`:** Protección contra sobrescritura de paquetes `0x87` completos por duplicados más pobres (`83/83` tests BLE/offline).

---

## [0.80.0] — Línea Base Estable Validada (`5374e49`)

- Firma permanente obligatoria (`signing-guard.mjs`), guarda anti-sobrescritura de IndexedDB, respaldo JSON con confirmación nativa Android, copia privada cifrada en Drive (SAF + AndroidKeyStore), Modo Agenda LED azul, importación offline no destructiva, telemetría `0x8E`/`0x8F`, Modo Matemática base, Recordatorios Calendar, modo TV y exportación SVG/PNG/PDF/WebM.
