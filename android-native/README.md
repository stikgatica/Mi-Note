# Mi Note X10 para Android — versión de prueba

Esta carpeta **no cambia la PWA publicada en GitHub Pages**. Prepara una aplicación Android híbrida con la interfaz existente de Mi Note V0.2 y el lápiz Huion X10 mediante Bluetooth LE nativo.

## ¿Qué incluye?

- Interfaz y cuadernos de Mi Note, con el mismo formato A5 y selector de hojas.
- Bluetooth LE nativo de Android con `@capacitor-community/bluetooth-le`: selector de dispositivos, permisos Bluetooth, notificaciones GATT, comandos a la X10 y reconexión por identificador previamente seleccionado.
- Protocolo del lápiz reutilizado de Data Ink V10 mediante el archivo web `x10-ble.js`, que se comparte **sin sustituir el código de la web pública**.
- Guardado local en el WebView de Android y respaldo/importación JSON. No se emplea ninguna base de datos remota ni se suben apuntes a GitHub.
- **No** usa comandos de borrado del dispositivo Huion.

## Generar el APK de prueba en GitHub

1. Abre la pestaña «Actions» del repositorio.
2. Selecciona «Android APK - Mi Note X10».
3. Pulsa «Run workflow» en la rama `main`.
4. Al completar el trabajo, descarga «Mi-Note-X10-Android-debug» desde los **Artifacts** de esa ejecución.
5. Descomprime y abre `app-debug.apk` en el celular Android para instalarlo.

También puedes compilar localmente con Node 22, Java 21 y Android SDK:

```bash
cd android-native
npm install --no-audit --no-fund
npm test
npm run build:web
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

El archivo resultante estará en `android-native/android/app/build/outputs/apk/debug/app-debug.apk`.

## Primer uso

1. Instala el APK de prueba y concede permiso «Dispositivos cercanos» cuando Android lo solicite. Debes tener Bluetooth activo.
2. En Mi Note Android, pulsa «X10» → «Conectar X10», selecciona Huion Note X10 y escribe con el lápiz de tinta.
3. En las siguientes aperturas, la aplicación intentará reconectar por el identificador Bluetooth guardado.
4. Para llevar cuadernos desde la PWA anterior, exporta «Respaldo JSON» en la PWA y elige «Importar archivo» en la app Android. **No** se transfieren por sí solos.

## Limitaciones y privacidad

- **Esta es una primera compilación de prueba**, no se ha validado con la X10 física.
- Android puede interrumpir conexiones BLE mientras la aplicación está en segundo plano; no existe un servicio permanente de conexión.
- El lápiz en modo tableta utiliza notificaciones 55 54 documentadas por Data Ink V10. Las tramas de escritura en modo agenda 0x8D requieren una validación independiente. El aviso físico de nueva página 0x8A puede depender del modo de la Huion.
- El APK de depuración está firmado con clave de prueba por GitHub Actions. **No** es una versión para Play Store. No almacenes información importante sin exportar respaldos.
- Instalar el APK crea un almacenamiento distinto al de la PWA anterior; no desinstales ni borres los datos de la PWA antes de exportar un respaldo JSON.
- Los archivos `stage/`, `dist/`, `node_modules/` y `android/` se generan durante la compilación y no se publican en Git.

## V0.2 Android firmada: privacidad y advertencias
- Se genera un APK **release** firmado, no una compilación debug; esta es una versión de prueba privada y no ha sido auditada ni certificada.
- Se desactiva `android:allowBackup`, se restringe la extracción de datos y se excluye el permiso `INTERNET` del APK. Google Drive se deshabilita solo en la versión Android; usa respaldo JSON local.
- La declaración `androidNeverForLocation: true` limita el escaneo en Android moderno a Bluetooth LE; algunos dispositivos BLE pueden dejar de ser visibles debido al filtro de Android.
- La firma privada se genera dentro de GitHub Actions y se deposita durante **7 días** como artefacto **restringido** `PRIVADO-clave-firma-Mi-Note-X10-v0.2`. El propietario del repositorio debe descargarla y custodiarla de forma segura para firmar futuras actualizaciones, pues no se sube como secreto ni se incluye en el APK. Perderla impide actualizar esta instalación conservando la misma firma.
- La V0.2 se firma con una clave distinta de la V0.1. Android **no permite instalarla como actualización encima de V0.1**; primero exporta tus apuntes a JSON si ya escribiste allí. No borres la PWA por error: es una instalación diferente.
- Una firma propia no sustituye una auditoría y **no garantiza eliminar la alerta de Play Protect** si Google no reconoce al desarrollador. No desactives Play Protect.
