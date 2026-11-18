# Mi Note X10 — aplicación Android

Aplicación **Android nativa con Capacitor y Bluetooth LE** para la **Huion Note X10**. El proyecto ya no mantiene un sitio web ni una PWA independiente: los recursos HTML/JS/CSS son la interfaz local empaquetada dentro de la APK.

## Estado validado en la Huion física

- **Modo agenda (LED azul):** conexión Bluetooth y escritura en tiempo real comprobadas por el usuario en V0.38.
- **Importación directa de memoria:** lectura, guardado y resumen de escritura comprobados en V0.38.
- **Una sola conexión de agenda:** no existe modo tableta ni botón «Continuar escribiendo». La importación usa la sesión existente sin reactivar el lápiz al terminar.
- **Cuadernos:** hojas A5, trazos vectoriales, navegación, guardado local, exportación y copias de seguridad.
- **La X10 física no se borra:** el lector no utiliza los comandos 0x8B ni 0x8C.

La **V0.40** reorganiza el repositorio y elimina el código de la antigua PWA. Aunque incorpora pruebas automatizadas, debe comprobarse nuevamente con la X10 para confirmar que la escritura y la importación conservan el comportamiento validado en V0.38.

## Descargar e instalar

- [Releases de Android](https://github.com/stikgatica/Mi-Note/releases)
- [Versión V0.40](https://github.com/stikgatica/Mi-Note/releases/tag/android-v0.40) cuando finalice su compilación
- [Versión V0.38 de referencia](https://github.com/stikgatica/Mi-Note/releases/tag/android-v0.38)

**Antes de cambiar de APK:** exporte «Respaldo JSON» o confirme una copia privada accesible desde Android. Las compilaciones de prueba usan claves de firma temporales: puede ser necesario desinstalar para instalar otra versión, lo que elimina el almacenamiento local de la app. Nunca desinstale sin verificar su respaldo.

## Uso

1. En Android, active Bluetooth, abra Mi Note y pulse **X10** para conectar su Huion.
2. Compruebe el **LED azul** y escriba en la agenda física: los trazos se reflejan en la hoja visible.
3. Para recuperar notas guardadas, abra **Más opciones → Importar memoria Huion X10**.
4. Seleccione el cuaderno y pulse **Importar memoria**. Se omiten duplicados exactos, se conservan versiones distintas y se informan páginas pendientes.
5. Continúe escribiendo normalmente, sin pulsar botones de cambio de modo.

## Arquitectura del repositorio

```text
android-native/
  src/
    index.html, app.js, styles.css   Interfaz Android A5, hojas, tinta, IndexedDB
    x10-ble.js                       Protocolo de agenda, escritura ONLINE_DATA 0x8D
    ble-adapter.js                    Transporte GATT con el plugin nativo
    offline-x10.js                    Extracción de memoria no destructiva
    native-main.js                   Entrada Capacitor Android
    icons/                           Recursos gráficos incorporados a la APK
    ...                              Interfaz Android, respaldo, reproducción, menús
  scripts/
    prepare.mjs                      Monta fuentes desde android-native/src
    features.mjs                     Importación y páginas físicas
    mobile.mjs                       Interfaz de Android
    harden.mjs                       Permisos y privacidad
  native-backup/                     Complemento Android de copia privada
  tests/                             Pruebas de Bluetooth, interfaz y memoria
.github/workflows/android-release.yml
```

El repositorio no conserva `sw.js`, `manifest.webmanifest`, el instalador web, OAuth de Drive de la PWA ni workflows antiguos de APK. El historial Git y los Releases anteriores permanecen disponibles.

**Respaldo y Drive en Android:** la app dispone de respaldo JSON y de un flujo de copia privada cifrada mediante el selector de documentos Android (SAF). El permiso `INTERNET` está excluido del APK; subir un archivo seleccionado a Drive depende de los proveedores de documentos del dispositivo, no de una integración OAuth web. Proteja y conserve la contraseña y el archivo de respaldo.

## Compilar

Requiere Node 22, JDK 21 y Android SDK:

```bash
cd android-native
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

Para instalar una compilación release sin firmar, firme el APK con una clave privada bajo su custodia. GitHub Actions firma las versiones de prueba con una clave temporal que **no se publica**. Para actualizaciones sin reinstalación es necesaria una clave persistente y segura.

## Privacidad y limitaciones

- Los cuadernos residen en IndexedDB dentro del WebView Android, no en GitHub.
- Sin permiso de Internet ni telemetría propia de la APK; Bluetooth LE a través de Capacitor.
- La app no modifica firmware ni borra la memoria de la X10.
- No reemplaza la aplicación oficial de Huion y no cuenta con auditoría externa de seguridad.
- Protocolo documentado en [Reginleif86/huion-note-x10-ble](https://github.com/Reginleif86/huion-note-x10-ble) (MIT).

Para detalles técnicos consulte [ARQUITECTURA.md](ARQUITECTURA.md) y [android-native/README.md](android-native/README.md).
