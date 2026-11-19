# Mi Note X10 — código Android

Este directorio contiene **todas las fuentes necesarias para compilar la APK**. No se descargan archivos del antiguo proyecto PWA de la raíz.

## Componentes

- `src/index.html`, `src/app.js`, `src/styles.css`: interfaz de cuadernos en WebView nativo, almacenamiento IndexedDB y dibujo.
- `src/native-main.js`: inicializa Capacitor y el puente BLE nativo.
- `src/x10-ble.js`: modo agenda (LED azul), tramas ONLINE_DATA `0x8D` y botón de nueva hoja `0x8A`.
- `src/offline-x10.js`: autenticación y lectura no destructiva mediante `0x81`, `0x85`, `0x86`, `0x87`, `0x88`.
- `src/ble-adapter.js`: traducción de las características GATT al plugin Android.
- `scripts/prepare.mjs`: copia únicamente desde `src/` al directorio temporal `stage/`.
- `scripts/features.mjs` y `scripts/mobile.mjs`: importación, cuadernos e interfaz Android.
- `native-backup/`: complemento de respaldo local y copia cifrada con selector de documentos Android.
- `tests/`: pruebas automatizadas.

## Funciones confirmadas

El usuario ha comprobado en su X10 con V0.38: conexión con LED azul, escritura en vivo, importación directa y recuperación de la escritura. Desde V0.39 no hay botón «Continuar escribiendo» ni reactivación al terminar una importación. La V0.40 reorganiza fuentes y elimina el código PWA antiguo: validar nuevamente en dispositivo.

## Pruebas y compilación

```bash
npm install --no-audit --no-fund
npm test
npm run build:web
npx cap add android
npx cap sync android
node scripts/harden.mjs
node native-backup/setup.mjs
cd android
./gradlew assembleRelease
```

La tarea `npm run build:web` **empaqueta la interfaz local de la APK**, no genera una PWA para distribución. GitHub Actions publica el APK firmado de prueba desde `.github/workflows/android-release.yml`.

El APK no solicita permiso de Internet. La memoria física nunca se borra (`0x8B/0x8C` no se transmiten). Respalde los cuadernos antes de actualizar: las claves de firma de prueba cambian entre compilaciones.

## Compartir y exportar archivos nativos

`native-backup/MiNoteFileExportPlugin.java` añade `ACTION_CREATE_DOCUMENT` (guardar en lugar elegido) y `ACTION_SEND` + `FileProvider` (Compartir con otras aplicaciones), con acceso exclusivo a una carpeta temporal privada. Los datos se transfieren desde WebView mediante fragmentos base64 acotados de 96 KiB. `src/export-native.js` gestiona la transferencia; `src/share-documents.js` transforma hojas y cuadernos a SVG, PNG, ZIP y PDF A5 multipágina. `src/replay.js` utiliza el mismo complemento para WebM.

Se ejecuta `native-backup/setup.mjs` después de sincronizar Capacitor para registrar el complemento y las rutas compartibles en AndroidManifest. No se solicita acceso global al almacenamiento.
