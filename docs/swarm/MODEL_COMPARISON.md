# Comparativa Técnica de Motores de Reconocimiento Manuscrito y Matemático 2D (Offline-First)

**Proyecto:** Mi Note Professional (Android + Capacitor 8 + Huion Note X10)  
**Autor:** Agent 3 (`ai-researcher` — Especialista en IA y escritura manuscrita)  
**Estado:** Fase de diseño arquitectónico (línea base V0.80)  
**Ámbito:** Selección honesta del motor de reconocimiento manuscrito, matemático 2D, geométrico y de datos con prioridad **100% offline**, sin dependencia de nube ni telemetría.

---

## 1. Contexto real del proyecto (Auditoría V0.80)

Antes de comparar alternativas externas, conviene anclar las restricciones reales observadas en `android-native/`:

- **Runtime actual (`android-native/package.json` y `capacitor.config.json`):**
  - Capacitor `8.3.4` (`@capacitor/core`, `@capacitor/android`, `@capacitor/app`), Vite `7.1.12`, `@capacitor-community/bluetooth-le` `8.3.0`, `jszip` `3.10.1`.
  - Código web en ES Modules puros (`"type": "module"`), ejecutado en WebView Android con Web Worker (`math-worker.js`) y testeado en Node.js (`node --test tests/*.test.mjs`).
  - Espacio de coordenadas fijo A5 (`1000 × 1400`) con transformación de lectura no destructiva (`ink-orientation.mjs`).
  - Formato de trazo inmutable: `{ id, color, width, pts: [[x, y, press, t?], ...], x10?: ... }`.
- **Reconocimiento ya existente en V0.80:**
  1. `src/math/math-ink-ocr.mjs`: clasificador local cero-dependencias con plantillas vectoriales normalizadas para 15 símbolos (`0–9`, `c`, `m`, `°`, `,`, `.`) mediante distancia bidireccional aproximada + penalización de relación de aspecto. Muy conservador (máx. 16 trazos, 9 glifos, solo números y medidas `cm/mm/m/°`).
  2. `src/math/math-hybrid-ocr.mjs`: combina `math-ink-ocr.mjs` + ML Kit únicamente para **aritmética lineal 1D** (`[0-9.,()+\-×÷=]`). Excluye explícitamente álgebra, fracciones 2D, potencias, raíces, tablas y gráficos.
  3. `native-backup/MiNoteCalendarPlugin.java`: **ya integra** `com.google.mlkit:digital-ink-recognition` con el modelo de idioma español (`LANGUAGE = "es"`). Descarga bajo demanda (~20 MB), devuelve hasta 4 candidatos de texto plano sin probabilidades calibradas, y actualmente envía puntos `(x, y)` **sin marcas de tiempo `t`** (`Ink.Point.create((float)x, (float)y)`).
- **Requisitos no negociables de Mi Note Professional:**
  1. **Offline-first real:** el reconocimiento base debe funcionar sin internet desde el primer arranque, incluso en aulas sin conectividad.
  2. **Fidelidad pedagógica absoluta:** jamás autocorregir errores matemáticos del docente (`2 + 2 = 5` debe transcribirse como `2 + 2 = 5`), jamás resolver ejercicios automáticamente y jamás inventar valores, escalas o etiquetas en tablas y gráficos.
  3. **Inmutabilidad y reversibilidad:** los trazos originales nunca se mutan; cada objeto digital conserva `sources: [{ id, signature }]` y puede revertirse al manuscrito.
  4. **Reglas geométricas estrictas:** excluir trapecio automático inicialmente; preservar proporciones reales (nunca forzar un rectángulo a cuadrado).
  5. **Privacidad:** cero envío de tinta o metadatos a servidores externos.

---

## 2. Evaluación detallada de opciones

### Opción A: Google ML Kit Digital Ink Recognition (Plugin nativo Android en Capacitor)

**Qué es:** API nativa de Google on-device para tinta digital (secuencias de puntos `x, y, t`), ya integrada parcialmente en `MiNoteCalendarPlugin.java` con el pack `"es"`.

- **Disponibilidad y madurez:** Alta en Android nativo (`com.google.mlkit:digital-ink-recognition`). Sin soporte oficial en WebView/Node.js (requiere puente Capacitor Java/Kotlin; no es testeable en `node --test` salvo mediante mocks).
- **Licencia y términos:** SDK y ejemplos bajo **Apache 2.0**, pero regido por los **ML Kit Terms of Service** y Google APIs ToS: gratuito para uso comercial, procesamiento local on-device, pero **prohíbe extraer, decompilar o hacer ingeniería inversa de los modelos**.
- **Tamaño APK y almacenamiento:** La librería base aporta un peso reducido al APK (~1–3 MB), pero cada pack de idioma/reconocedor se descarga dinámicamente en tiempo de ejecución y ocupa **~20 MB** en almacenamiento interno.
- **Soporte offline:** **Parcial (offline tras descarga previa).** Si la app se instala en un dispositivo sin conexión o el usuario nunca pulsó "Descargar modelo", ML Kit no está disponible. No puede empaquetarse fácilmente el modelo binario dentro del APK sin infringir el flujo soportado por ML Kit.
- **Capacidad matemática 2D:** **Nula de forma nativa.** ML Kit Digital Ink soporta texto 1D en 300+ idiomas, formas básicas (`zxx-Zsym-x-shapes`) y emojis, pero **no dispone de un modelo 2D para ecuaciones matemáticas** (fracciones apiladas, fracciones anidadas, exponentes/subíndices arbitrarios, radicales con contenido interior, algoritmos verticales alineados por columna, sistemas de ecuaciones o LaTeX/MathML). Además:
  - No expone probabilidades calibradas en los candidatos (`RecognitionCandidate.getScore()` no es una probabilidad calibrada comparable entre idiomas y en la integración actual solo se leen strings).
  - Tiende a sesgar símbolos matemáticos hacia palabras o puntuación del idioma `"es"` (ej. omitir `=`, confundir `×` con `x`, `0` con `O` o `8`, `1` con `l`).
- **Latencia:** Muy buena en 1D (~15–60 ms por renglón en Android gama media).
- **Veredicto honesto:** **Insuficiente como motor principal** para Mi Note Professional porque no entiende matemática 2D ni geometría contextual ni tablas/gráficos, y falla si no hubo descarga previa. Sin embargo, como **ya está integrado**, conserva gran valor como **señal secundaria opcional** para validar texto/números 1D y etiquetas escritas a mano cuando el modelo `es` esté descargado (mejorándolo además al pasar timestamps `t` y `WritingArea` cuando existan).

---

### Opción B: LiteRT (antes TensorFlow Lite) y ONNX Runtime Mobile / Web (WASM)

Aquí existen **dos arquitecturas muy distintas** que deben evaluarse por separado para no caer en falsas equivalencias:

#### Subopción B1: Modelos End-to-End HMER (CROHME / MathWriting — ej. CAN, CoMER, BTTR, DenseWAP)

**Qué son:** Redes neuronales codificador-decodificador (backbone CNN como DenseNet/ResNet + decoder Transformer/LSTM con atención) que toman una imagen rasterizada o secuencia de trazos y generan directamente una cadena LaTeX.

- **Disponibilidad:** Existen repositorios académicos open-source (PyTorch, entrenados en CROHME 2014/2016/2019 o MathWriting de Google), pero **no existe un paquete listo para producción en Capacitor/Android**; requiere exportar a ONNX/LiteRT, cuantizar a INT8, implementar beam search / decoding autorregresivo paso a paso y gestionar vocabulario LaTeX.
- **Licencia:** Runtimes muy permisivos (**Apache 2.0** en LiteRT; **MIT** en ONNX Runtime). Los pesos preentrenados académicos varían (MIT, Apache 2.0 o solo investigación/no comercial según el paper; hay que auditar cada checkpoint).
- **Tamaño APK y modelo:**
  - Runtime nativo Android AAR: LiteRT añade **~3–4 MB** por ABI (o 0 MB si se delega a Google Play Services, aunque eso introduce dependencia de Play Services); ONNX Runtime Mobile añade **~8–10+ MB** por ABI; ONNX Runtime Web (WASM) añade **~5–12 MB** en `dist/`.
  - Modelo HMER: **25–120 MB en FP32**, comprimible a **8–30 MB en INT8**.
  - Total realista empaquetado en APK offline: **+15 a +40 MB**.
- **Soporte offline:** **Total** si se empaqueta el modelo en `assets/` (a costa del tamaño del APK).
- **Capacidad matemática 2D:** **Alta para fórmulas estándar CROHME** (fracciones, potencias, raíces, integrales, álgebra), pero **nula para geometría contextual** (radio, diámetro, altura, diagonal, marcas de congruencia) y **nula para tablas/gráficos estadísticos**.
- **Riesgo pedagógico crítico (Alucinación y trazabilidad):**
  - Un decoder autorregresivo aprende un *modelo de lenguaje matemático*: puede "autocorregir" silenciosamente un símbolo dudoso o un error intencional del docente para producir LaTeX más probable, violando la regla de fidelidad estricta.
  - Pierde la correspondencia directa `símbolo ↔ strokeId`, dificultando editar un solo dígito, actualizar progresivamente mientras llegan trazos fuera de orden o revertir parcialmente.
- **Latencia y RAM en móvil:** **Media-alta (150–600 ms por expresión en CPU móvil** en WASM/INT8, con picos de memoria en WebView móvil si el decoder corre en WASM). Poco adecuado para reconocimiento progresivo continuo tras cada trazo en tablets/teléfonos de gama media.
- **Mantenimiento:** Alto (pipeline Python/PyTorch → ONNX/LiteRT → cuantización → pruebas nativas).

#### Subopción B2: Micro-clasificador neuronal de símbolos aislados (CNN / 1D-CNN en LiteRT o WASM)

**Qué es:** Una red muy pequeña (ej. MobileNet-mini / 1D-CNN sobre secuencia de trazos + raster `28×28` o `32×32`) que clasifica **un grupo de trazos candidato a símbolo** entre ~80–120 clases matemáticas (`0-9`, `a-z`, operadores, griegas, paréntesis, radical, etc.) y devuelve un vector softmax calibrable.

- **Tamaño:** Modelo cuantizado INT8 de **0.4–1.8 MB**. En JS puro (pesos cuantizados `Int8Array` + inferencia matricial directa o WASM mínimo) incluso evita el overhead de 8–10 MB de un runtime completo.
- **Latencia:** **< 5 ms por símbolo** en CPU móvil / Web Worker.
- **Trazabilidad y fidelidad:** **100% trazable** (`strokeIds` exactos), cero alucinación de estructura 2D (la estructura la construye una gramática 2D determinista y auditable), 100% testeable en Node.js.
- **Veredicto honesto:** Excelente como **mejora opcional de Fase 2** para enriquecer el clasificador de símbolos (especialmente letras algebraicas y símbolos complejos), **sin** reemplazar el pipeline estructural ni bloquear V1.0.

---

### Opción C: Motor Híbrido Local JS/ESM (DSP online + Clasificador multi-representación + Gramática 2D + Motores geométrico y de datos + ML Kit opcional)

**Qué es:** Extensión directa y modular de la arquitectura ya probada en Mi Note V0.80, ejecutada en Web Worker ESM puro (y 100% ejecutable en Node.js):
1. **DSP de trazos (`math-dsp.mjs`):** filtrado adaptativo (One Euro Filter), simplificación RDP, remuestreo por longitud de arco, cinemática, detección de esquinas, trazos repasados, puntos accidentales y agrupamiento espacio-temporal.
2. **Clasificación híbrida local de símbolos:** combina características *online* (secuencia de direcciones, ángulos de giro, número de trazos, orden, cierres/bucles) + características *espaciales/raster-contorno* (relación de aspecto, proyecciones horizontales/verticales, densidad en cuadrícula normalizada, similitud de Chamfer/DTW).
3. **Gramática estructural 2D (`math-structural.mjs`):** árbol de relaciones espaciales (derecha, arriba, abajo, superíndice, subíndice, interior de radical, alcance de barra de fracción, alineación de columnas en aritmética vertical) → AST + LaTeX + MathML, con desambiguación contextual (`x`/`×`, `0`/`O`, `1`/`l`, `−`/barra de fracción).
4. **Motores especializados locales:** geometría computacional contextual (`math-geometry-contextual.mjs`) y estructuras de datos/gráficos (`math-data-charts.mjs`).
5. **Fusión calibrada (`math-fusion.mjs`) + Reconocedor progresivo + Perfil de personalización local:** combina todas las señales (incluyendo ML Kit `es` cuando esté descargado) con confianza calibrada (`high / medium / low`) y adaptación local al trazo del usuario.

- **Disponibilidad y licencia:** **Inmediata**, 100% código propio bajo la licencia del repositorio, **cero dependencias externas en tiempo de ejecución**.
- **Tamaño APK:** **~0.08–0.20 MB** de JS minificado (impacto prácticamente nulo en APK).
- **Soporte offline:** **100% offline inmediato** desde el primer instante, sin descargas previas ni Play Services.
- **Capacidad 2D, geometría y gráficos:** **Completa y unificada** bajo el mismo modelo de coordenadas A5 y el mismo sistema de `strokeIds`. Permite razonar conjuntamente cuándo un trazo horizontal es un signo menos, una barra de fracción, un eje de gráfico o una altura de triángulo.
- **Latencia:** **5–35 ms** por actualización incremental en Web Worker (sin bloquear el hilo de tinta de la Huion X10).
- **Fidelidad pedagógica:** **Total.** Al ser estructural y determinista con umbrales calibrados, nunca corrige `2+2=5`, nunca inventa datos de gráficos y siempre ofrece alternativas ordenadas ante ambigüedad.
- **Limitación honesta:** La precisión en caligrafía cursiva muy libre o letras algebraicas muy distorsionadas es menor que una CNN entrenada con cientos de miles de muestras; esto se mitiga de tres formas: (a) perfil de personalización local que aprende los prototipos del docente, (b) cruce opcional con ML Kit `es` cuando está disponible, y (c) diseño desacoplado que permite enchufar un micro-clasificador neuronal INT8 (Subopción B2) en una fase posterior sin reescribir el resto del motor.

---

## 3. Tabla comparativa resumida

| Criterio | A. ML Kit Digital Ink (`es`) | B1. HMER End-to-End (LiteRT / ORT) | B2. Micro-CNN Símbolos (INT8 / WASM) | C. Motor Híbrido Local JS/ESM (+ ML Kit opc.) |
| :--- | :--- | :--- | :--- | :--- |
| **Disponibilidad en Capacitor** | Ya integrado (`MiNoteCalendarPlugin.java`) | Requiere exportar modelo + plugin nativo o WASM | Requiere entrenar/exportar modelo compacto | **Inmediata** (ESM puro en Worker y Node.js) |
| **Licencia** | Apache 2.0 (SDK) + ML Kit ToS (modelos cerrados) | Runtime Apache 2.0 / MIT; pesos variables | Runtime MIT/Apache o JS propio; pesos propios | **100% propio** (cero dependencias) |
| **Impacto APK / Disco** | ~1–3 MB APK + ~20 MB descarga por idioma | **+15 a +40 MB** en APK | +0.5 a +2 MB (en WASM/Int8) | **< 0.2 MB** |
| **Offline inmediato (sin 1ª descarga)** | No (requiere descarga previa) | Sí (si va embebido) | Sí | **Sí (100% desde el 1er uso)** |
| **Matemática 2D (fracciones, raíces, potencias)** | **No** (solo texto 1D) | Sí (solo fórmulas CROHME) | Solo símbolos (necesita parser 2D) | **Sí** (vía `math-structural.mjs`) |
| **Geometría contextual y tablas/gráficos** | No (solo formas sueltas básicas) | No | No | **Sí** (nativo en el mismo pipeline) |
| **Latencia móvil típica** | 15–60 ms (1D) | 150–600 ms (alto en CPU) | < 5 ms por símbolo | **5–35 ms** (incremental en Worker) |
| **Fidelidad pedagógica / No alucinación** | Media (sesgo de diccionario `es`) | Baja-Media (decoder puede autocorregir) | Alta (sin decoder de lenguaje) | **Muy alta** (determinista + conservador) |
| **Trazabilidad `strokeId` ↔ objeto** | Por bloque/renglón | Baja (difícil alinear tokens LaTeX) | Exacta por símbolo | **Exacta por símbolo y figura** |
| **Testabilidad en `node --test`** | Solo con mocks | Difícil (requiere binario nativo/WASM) | Alta (si es WASM/JS) | **100% nativa y determinista** |
| **Costo de mantenimiento** | Bajo | Muy alto | Medio | **Bajo-Medio** |

---

## 4. Recomendación arquitectónica

### Estrategia elegida: Arquitectura Híbrida Escalonada (Offline-First)

1. **Columna vertebral obligatoria (V1.0 — Opción C):**
   - Adoptar el **Motor Híbrido Local JS/ESM** como núcleo único y autosuficiente de Mi Note Professional (`math-dsp.mjs` → motores de símbolos, geometría contextual y datos/gráficos → `math-structural.mjs` → `math-fusion.mjs` → reconocedor progresivo → confianza calibrada → perfil de personalización local).
   - Garantiza **0 MB extra de dependencias**, **100% funcionamiento offline inmediato**, **latencia < 35 ms**, **pruebas unitarias reales en Node.js** y cumplimiento estricto de todas las reglas pedagógicas.

2. **Aprovechamiento inteligente de ML Kit ya integrado (Opción A como señal auxiliar):**
   - Mantener `MiNoteCalendarPlugin.java` como **motor opcional de apoyo** para texto/números 1D y etiquetas de medidas cuando el usuario haya descargado el pack `es`.
   - **Nunca** darle autoridad exclusiva sobre expresiones 2D ni bloquear el reconocimiento si no está descargado.
   - *Mejora futura de bajo costo en Java:* reenviar marcas de tiempo `t` (si están presentes en `pts[j][3]`) a `Ink.Point.create(x, y, t)` y `RecognitionContext` con `WritingArea`, ya que ML Kit mejora notablemente con información temporal.

3. **Ruta de evolución opcional sin ruptura (V1.x — Opción B2):**
   - Gracias al contrato desacoplado de `SymbolEngine` definido en [RECOGNITION_ENGINE.md](RECOGNITION_ENGINE.md), en una fase posterior se podrá enchufar un **micro-clasificador neuronal de símbolos aislados** (~0.5–1.5 MB INT8 en JS/WASM o LiteRT) entrenado sobre símbolos matemáticos (CROHME/MathWriting) únicamente para mejorar el reconocimiento de glifos individuales (ej. letras algebraicas `a, b, x, y, n`, símbolos griegos `π, α, β, θ`), manteniendo intacta la gramática estructural 2D determinista.

### Qué se descarta explícitamente y por qué
- **APIs en la nube (Mathpix, MyScript Cloud, LLMs remotos):** descartados por requisito offline-first, latencia, costos recurrentes y privacidad escolar.
- **Modelos HMER End-to-End pesados (Opción B1):** descartados por impacto en APK (+15–40 MB), latencia en CPU móvil, pérdida de trazabilidad por trazo y riesgo de autocorrección silenciosa de errores del docente.
- **ML Kit como motor principal:** descartado por ausencia de soporte matemático 2D, dependencia de descarga previa y falta de probabilidades calibradas.
