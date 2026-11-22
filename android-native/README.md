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

Mi Note usa permiso de Internet solo para descargar, con consentimiento, el modelo de reconocimiento ML Kit; no para transmitir cuadernos. La memoria física Huion no se borra por una actualización (`0x8B/0x8C` no se transmiten). La V0.80 requiere una firma permanente en GitHub; el APK no se publica sin ella.

## Compartir y exportar archivos nativos

`native-backup/MiNoteFileExportPlugin.java` añade `ACTION_CREATE_DOCUMENT` (guardar en lugar elegido) y `ACTION_SEND` + `FileProvider` (Compartir con otras aplicaciones), con acceso exclusivo a una carpeta temporal privada. Los datos se transfieren desde WebView mediante fragmentos base64 acotados de 96 KiB. `src/export-native.js` gestiona la transferencia; `src/share-documents.js` transforma hojas y cuadernos a SVG, PNG, ZIP y PDF A5 multipágina. `src/replay.js` utiliza el mismo complemento para WebM.

Se ejecuta `native-backup/setup.mjs` después de sincronizar Capacitor para registrar el complemento y las rutas compartibles en AndroidManifest. No se solicita acceso global al almacenamiento.

## Modo Matemática automático (V0.44)

`src/math/math-auto.mjs` analiza ventanas pequeñas de tinta recién finalizada; `src/math/math-worker.js` procesa la geometría y las coincidencias del reconocedor experimental `src/math/math-ink-ocr.mjs`. El controlador `math-controller.js` guarda únicamente mejoras de alta confianza en `mathLayer`. La compilación conecta los eventos `minote:stroke-finished` al final de un trazo BLE o táctil mediante `scripts/math-stage.mjs`.

El reconocedor **no usa un modelo entrenado**, no envía datos y no garantiza reconocimiento de cualquier caligrafía. No altera valores matemáticos por inferencia. Se conserva la capacidad de introducir una corrección manual en el panel. No se toca el protocolo BLE ni el importador de memoria.

## GeoInk: referencia conceptual, sin dependencia PWA

El módulo nuevo `src/math/math-strong-geometry.mjs` reimplementa de manera local los principios de simplificación y ajuste de segmentos de GeoInk V2 para mejorar curvas y ajustar vértices. No utiliza los scripts de aquella PWA, ni toca `x10-ble.js` ni `offline-x10.js`. Funciona en Web Worker al levantar el lápiz. Si el usuario desactiva el modo matemático, reaparecen los trazos originales.

## Archivo compartido nativo — V0.46

El instalador `native-backup/setup.mjs` registra la subclase `MiNoteShareProvider`, en lugar de confiar en `androidx.core.content.FileProvider` genérico. `native-backup/share-provider.mjs` añade la declaración completa al manifiesto incluso si Capacitor u otro módulo instala otro proveedor. El complemento `MiNoteFileExportPlugin.java` solicita la autoridad `<package>.minote.files` y el XML `res/xml/minote_share_paths.xml` limita el acceso temporal a la caché privada. Sin permisos generales de almacenamiento.

## Selección anticipada de figura

`src/math/math-intention.mjs` contiene la normalización geométrica de un cuadrilátero en cuadrado o rectángulo, sin modificar `strokes`. `math-controller.js` conserva el selector mientras está activo y envía la intención al `math-worker.js`; `math-auto.mjs` permite actualizar una figura ya reconocida al cambiar su interpretación.

## V0.80 — Actualización segura sin eliminar cuadernos

**Causa corregida:** las versiones V0.79 y anteriores generaban una keystore temporal aleatoria en cada ejecución de GitHub Actions. Android rechazaba la actualización directa; desinstalar para instalar otra versión **borra IndexedDB** (almacenamiento de `MiNotePrivate`), por diseño de Android. No era una migración de datos.

Desde V0.80, el workflow **nunca genera una clave nueva**. Solo acepta el archivo PKCS12 almacenado de manera cifrada en secretos de GitHub, verifica su huella SHA-256 con `apksigner` y bloquea toda publicación si no coinciden. El identificador sigue siendo `cl.stikgatica.minote.x10` y `versionCode` aumenta desde 80. Las siguientes versiones deben repetir esta misma clave.

### Configuración única y obligatoria de la firma

**Realizar solo en un PC propio y de confianza, nunca en una máquina pública. No enviar claves ni contraseñas por chat o subir archivos `.p12` a commits.**

1. Instalar JDK (incluye `keytool`) y [GitHub CLI](https://cli.github.com/) (`gh`); ingresar con `gh auth login` usando la cuenta con permisos de administración del repositorio.
2. Ejecutar en PowerShell: `./android-native/scripts/configurar-firma-permanente.ps1`. El script crea **una vez** una clave `minote-x10-release.p12` fuera del repositorio, o reutiliza una clave existente; nunca la sobrescribe.
3. Mantener respaldadas de forma privada **la clave `.p12` y su contraseña**. Sin cualquiera de ellas ya no se podrán emitir actualizaciones compatibles.
4. El script registra en GitHub los cuatro **Actions secrets** `MINOTE_RELEASE_KEYSTORE_BASE64`, `MINOTE_RELEASE_STORE_PASSWORD`, `MINOTE_RELEASE_KEY_PASSWORD` y `MINOTE_RELEASE_KEY_ALIAS`, y la **Actions variable** `MINOTE_RELEASE_CERT_SHA256`. Están en *Settings → Secrets and variables → Actions*.
5. Una vez configurados, ejecutar manualmente el workflow `Mi Note X10 Android v0.80` en *Actions* o realizar un nuevo commit de código. Confirmar **Success** y revisar que la Release oficial contenga la APK firmada.
6. Si GitHub no dispone de los secretos/variable o detecta otra huella, la publicación **se detiene antes de generar una APK instalable**; no volverá a crear una firma aleatoria.

**Migración única desde V0.79 o inferior:** esa instalación está firmada con una clave temporal diferente. **No se puede actualizar en el lugar** usando la nueva firma. Antes de desinstalar, abrir la versión instalada, exportar y verificar un respaldo JSON de **todos** los cuadernos (o confirmar la copia cifrada de Drive con su contraseña y acceso al archivo), guardado **fuera** de la carpeta privada de Android. Solo después de comprobar los datos, desinstalar, instalar la nueva APK e importar el respaldo. Si no es posible confirmar la recuperación, **no desinstalar**.

**Actualizaciones posteriores:** con la misma clave fija, paquete `cl.stikgatica.minote.x10` y `versionCode` creciente, Android permitirá instalar encima de V0.80 (conservando el almacenamiento local). Si pide desinstalar o borrar datos, **cancelar**, revisar firma y número de versión. No confiar en la copia de Drive como confirmación automática de sincronización: comprobar el documento real antes de migrar.

Esta solución protege la continuidad de nuevas instalaciones; **no puede recuperar** cuadernos eliminados al desinstalar una versión anterior sin copia.
