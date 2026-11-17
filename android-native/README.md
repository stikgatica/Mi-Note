# Mi Note X10 — Android nativo

**Android es el producto principal.** La PWA de GitHub Pages es histórica y el código HTML/JS de la raíz se utiliza como base de la interfaz A5 de la APK.

## Versiones
- **Android V0.3:** detección y reconexión Bluetooth de Huion Note X10, comprobadas por el usuario.
- **Android V0.4 (experimental):** escucha del botón físico de nueva página (`0x8A`) y extracción no destructiva de las hojas almacenadas en la X10 (`0x85` → `0x86` → `0x87`, recuperación `0x88`). Los protocolos se han contrastado con una implementación abierta; no están aún validados en la X10 del usuario.
- Descarga y códigos: [GitHub Releases](https://github.com/stikgatica/Mi-Note/releases).

## Funciones
- Pantalla A5, navegación de hojas, cuadernos, escritura vectorial, guardado en IndexedDB, exportación SVG/PNG/PDF y respaldos JSON locales.
- Huion Note X10 nativa con Bluetooth LE, selector de dispositivo y reconexión.
- Botón **Activar botón físico de nueva página**: solicita modo agenda y escucha `0x8A` para crear la siguiente hoja digital. La preferencia de creación automática debe estar activada.
- Botón **Extraer páginas guardadas**: lee las hojas físicas sin borrarlas. Revisa también índices vacíos, valida paquetes, recupera faltantes, omite duplicados y guarda cada hoja completa en el cuaderno seleccionado.
- Botón **Volver a escritura en vivo**: vuelve al protocolo del lápiz tras la lectura de modo agenda.

## Seguridad y privacidad
- Sin permiso de internet y sin Google Drive en el APK; sin telemetría propia.
- Datos locales en Android; desactivado backup automático Android.
- La app **nunca envía los comandos de borrado `0x8B` ni `0x8C`**.
- No se ha realizado auditoría de seguridad independiente ni pruebas físicas de extracción con la versión V0.4. Usa inicialmente notas ficticias.
- Cada APK actual utiliza una firma de compilación nueva. Debes hacer **Respaldo JSON** antes de desinstalar la versión previa. Para actualizaciones instalables sin reinstalación sería necesario configurar y conservar una clave de firma persistente en un lugar privado.

## Compilar
Requiere Node 22, JDK 21 y Android SDK.
```bash
cd android-native
npm install --no-audit --no-fund
npm test
npm run build:web
npx cap add android
npx cap sync android
node scripts/harden.mjs
cd android
./gradlew assembleRelease
```

Para firmar el APK resultante, usa una clave de firma privada mediante `apksigner`; no publiques archivos `.jks`, contraseñas o tokens en Git.

## Archivos principales
- `src/ble-adapter.js`: transporte BLE nativo.
- `src/offline-x10.js`: descarga no destructiva, verificación de integridad y conversión de puntos.
- `scripts/prepare.mjs`: copia código compartido de la raíz.
- `scripts/features.mjs`: agrega controles específicos Android.
- `scripts/harden.mjs`: permisos, backup y versión.
- `tests/`: pruebas automáticas de BLE y extracción.

Fuente de protocolo: [Reginleif86/huion-note-x10-ble](https://github.com/Reginleif86/huion-note-x10-ble), licencia MIT. Mi Note no es un producto oficial de Huion.
