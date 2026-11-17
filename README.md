# Mi Note X10 — Android

**Aplicación Android privada para Huion Note X10.** El proyecto principal es la **APK nativa** (Capacitor + Bluetooth LE Android), no la antigua PWA. La interfaz A5 conserva el diseño de Mi Note V0.2.

## Estado real del proyecto

| Función | Estado |
|---|---|
| Detección Bluetooth nativa | ✅ Confirmada en la X10 del usuario con V0.3 |
| Reconexión automática Android | ✅ Confirmada por el usuario con V0.3 |
| Cuadernos locales y trazos vectoriales | ✅ Disponibles; probar persistencia y escritura X10 en cada dispositivo |
| Evento físico nueva página (0x8A) | 🧪 Integrado en V0.4; pendiente de validación física |
| Extracción offline de páginas de la memoria X10 | 🧪 Implementada en V0.4; pendiente de validación física |
| Borrar páginas físicas X10 | **NO IMPLEMENTADO** por seguridad |
| Google Drive / conexión a internet en APK | No disponibles deliberadamente |

> **Importante:** confirmar conexión y reconexión NO demuestra todavía que todos los eventos físicos y las descargas de memoria funcionen en el hardware. La V0.4 es experimental y no debe sustituir un respaldo existente.

## Descargar

- **Versión Android confirmada para conectar y reconectar:** [V0.3](https://github.com/stikgatica/Mi-Note/releases/tag/android-v0.3).
- **Versión de prueba con botón de nueva página y descarga offline:** [V0.4](https://github.com/stikgatica/Mi-Note/releases/tag/android-v0.4) (cuando se haya generado la compilación).
- [Todas las versiones](https://github.com/stikgatica/Mi-Note/releases).

**Atención con las actualizaciones:** las APK actuales se firman con una nueva clave por compilación. No se puede instalar una sobre otra sin desinstalar la anterior. **Exporta primero «Respaldo JSON»**, guarda el archivo en una ubicación segura y luego impórtalo en la nueva instalación. La PWA antigua tiene almacenamiento independiente; no es necesario borrarla.

## Usar la X10

1. Activa Bluetooth y, cuando Android lo solicite, autoriza los dispositivos cercanos.
2. Abre Mi Note Android → **Conectar Huion X10 directamente**; elige tu X10.
3. El dispositivo se guarda como autorizado y puede reconectar si Bluetooth está disponible.
4. Para probar el botón físico, abre **X10 → Activar botón físico de nueva página**, pulsa el botón de la X10 y verifica que Mi Note cree una página digital. El aviso 0x8A corresponde al modo agenda y puede requerir cambiar el modo Bluetooth.
5. Para extraer apuntes almacenados, usa **X10 → Extraer páginas guardadas**. Se solicita el modo agenda y se leen páginas una por una. Un PIN de 6 dígitos solo se usa si lo solicita el dispositivo. Mi Note **no elimina contenido de la Huion**.
6. Si deseas volver a capturar escritura en directo, pulsa **Volver a escritura en vivo**.

### Cómo funciona la descarga offline

- Consulta el número de páginas lógicas con `0x85`, y recorre los índices desde 0 hasta el indicado, incluidos aquellos que siguen a páginas vacías.
- Descarga cada página mediante `0x86` y recibe paquetes `0x87` de puntos de 6 bytes; intenta reponer faltantes con `0x88`.
- Decodifica posición/presión, conserva coordenadas originales, calcula una huella SHA-256 de los paquetes, importa páginas completas en el cuaderno activo y detecta duplicados por huella e índice.
- Si faltan paquetes, muestra el error y **no guarda esa página incompleta**. Las páginas completas anteriores permanecen en el cuaderno.
- No transmite los comandos destructivos `0x8B` (borrar página) ni `0x8C` (limpiar caché). Nunca modifica firmware.

**Aviso:** la recuperación depende del firmware y de los informes GATT reales. Primero prueba con notas de ejemplo. La captura del modo agenda y los botones requieren validación con la X10 física. No se garantiza recuperar archivos borrados previamente.

## Estructura del repositorio

```
android-native/
  package.json                 # Capacitor Android, Bluetooth LE, Vite
  src/ble-adapter.js           # Puente GATT nativo
  src/offline-x10.js           # Extracción no destructiva + códec de páginas
  src/native-main.js           # Punto de entrada de Android
  scripts/prepare.mjs          # Interfaz web empaquetada para Android
  scripts/features.mjs         # Controles propios de la APK
  scripts/harden.mjs           # Privacidad y manifiesto Android
  tests/                       # Pruebas de protocolo y Bluetooth
.github/workflows/android-release-v04.yml
app.js, x10-ble.js, index.html, styles.css  # Código compartido que empaqueta Android
docs/README_PWA_LEGACY.md       # Documentación histórica PWA
```

Los archivos HTML/JS de la raíz se mantienen porque Android **los reutiliza durante la compilación**. El sitio GitHub Pages es **legado** y no es la distribución recomendada. No borrar estos archivos mientras Android dependa de ellos.

## Compilar desde el código

Requiere Node 22, Java 21 y Android SDK.

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

El APK de Gradle sale sin firmar. Para distribuirlo hace falta firmarlo con `apksigner`. La acción `android-release-v04.yml` genera una firma efímera y publica un APK de prueba en Releases. **No publica la clave privada.** Para actualizaciones sin desinstalar debe configurarse a futuro una clave persistente custodiada mediante GitHub Actions Secrets, no en commits, logs ni artefactos públicos.

## Privacidad

- Base de datos local IndexedDB del WebView Android; sin cuentas ni telemetría propias.
- APK sin permiso `INTERNET`; sin Drive en Android.
- Backup automático Android desactivado, almacenamiento local aislado por Android, no cifrado propio del cuaderno.
- Respaldos JSON se generan localmente y no deben subirse a un repositorio público.
- Sin auditoría independiente de seguridad y sin publicación en Play Store.

## Fuentes técnicas

Protocolo abierto [Reginleif86/huion-note-x10-ble](https://github.com/Reginleif86/huion-note-x10-ble), documentación [offline-note-protocol.md](https://github.com/Reginleif86/huion-note-x10-ble/blob/main/docs/offline-note-protocol.md), MIT. El software de Mi Note se basa en observaciones y pruebas del propio proyecto; no es una aplicación oficial de Huion.
