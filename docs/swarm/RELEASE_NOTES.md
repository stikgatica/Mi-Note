# Notas de Lanzamiento (Borrador Técnico) — Mi Note Professional

> **Estado:** Módulos core y pipeline unificado verificados en pruebas automatizadas (Olas 1 y 2). Integración UX/UI en curso (Ola 3). **Compilación de APK firmado y validación física con Huion Note X10 pendientes.**

---

## Novedades Respecto a V0.80

1. **Huion Note X10 aún más estable (Solo Modo Agenda LED azul):**
   - Corregido un caso borde en tramas BLE `0x8D` fragmentadas que podía descartar muestras válidas.
   - Protección contra reconexiones superpuestas y callbacks tardíos de sesiones Bluetooth anteriores.
   - Protección en lectura offline contra sobrescritura de paquetes completos por duplicados parciales.
   - Metadatos cinemáticos opcionales para el motor matemático sin alterar tus trazos ni el formato V0.80.
2. **Motor Matemático Profesional Offline (0 dependencias externas):**
   - **DSP inmutable (`math-dsp.mjs`):** suavizado One Euro Filter, simplificación RDP y agrupación espacio-temporal sin modificar la tinta original.
   - **Reconocimiento 2D estructural (`math-structural.mjs`):** fracciones, potencias, raíces, aritmética vertical y álgebra generando AST, LaTeX y MathML, **respetando fielmente lo escrito** (jamás corrige errores del docente ni resuelve ejercicios).
   - **Geometría contextual (`math-geometry-contextual.mjs`):** figuras robustas y 12 elementos internos (radio, diámetro, cuerda, altura, mediana, bisectriz, diagonal, ángulos, marcas de 90° y congruencia) sin trapecios automáticos ni deformación de rectángulos en cuadrados.
   - **Datos, tablas y gráficos (`math-data-charts.mjs`):** tablas y 11 tipos de gráficos editables preservando exclusivamente los datos escritos.
   - **Personalización local y Laboratorio (`math-personalization.mjs`, `math-lab.js`):** calibra tu estilo de escritura localmente (sin nube ni PII) e inspecciona trazos y diagnósticos.

---

## Estado Honesto de Validación y Limitaciones Actuales

- **Pruebas automatizadas:** `217/217` tests BLE + Math en verde (`152/152` en `tests/math-*.test.mjs`, `83/83` en BLE/offline). `tests/huion-archive.test.mjs` requiere `npm install` (`jszip`) en entorno local.
- **Evaluación empírica simulada (`source: 'simulated'`, 9 muestras):** Geometría `75%` (p50 `4.14 ms`), Ruido `100%` (`0.85 ms`), Números/Álgebra en modo 100% local sin ML Kit mantienen la escritura manuscrita de forma segura (`0` falsas transformaciones; se recomienda activar el modelo ML Kit descargado o calibrar en el Laboratorio mientras se incorpora el micro-clasificador INT8 en V1.x). Una línea repasada antiparalela se clasificó como ángulo (`KI-101`).
- **Pendiente antes de uso en aula:**
  - Compilación y firma permanente del APK mediante GitHub Actions (`.github/workflows/android-release.yml`) cuando autorices el push.
  - Prueba física real en Android con tu Huion Note X10 (`source: 'huion-x10-hardware'`).

---

## Actualización Segura y Restauración

1. **Antes de instalar el nuevo APK:** exporta un **Respaldo JSON** (confirmando que Android guardó el archivo fuera de la app) o verifica tu **Copia privada cifrada en Google Drive**.
2. **Actualización in-place:** al compilarse con la misma firma permanente (`signing-guard.mjs`), el APK se instala sobre V0.80 conservando IndexedDB (`MiNotePrivate`).
3. **Restauración:** ante cualquier problema, reinstala V0.80 desde GitHub Releases e importa tu Respaldo JSON o Copia privada cifrada (los conflictos se conservan sin pérdida).
