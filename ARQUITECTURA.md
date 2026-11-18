# Arquitectura — Mi Note X10 Android (V0.40)

Mi Note es una **aplicación Android Capacitor**, no un sitio PWA. La interfaz HTML/CSS/JS se integra en un **WebView local**; los cuadernos se guardan en IndexedDB de la aplicación.

## Capas

1. **Interfaz y dibujo:** `android-native/src/index.html`, `app.js`, `styles.css`, overlays y menús de `android-native/src/`. Escritura vectorial asociada a cuaderno y página.
2. **BLE Huion X10:** `src/ble-adapter.js` usa `@capacitor-community/bluetooth-le`; `src/x10-ble.js` mantiene **modo agenda únicamente** y decodifica escritura online `0x8D`, botón físico `0x8A` y autenticación.
3. **Importación de memoria:** `src/offline-x10.js` lee índices y paquetes usando `0x85`, `0x86`, `0x87` y recuperación `0x88`; evita borrado `0x8B/0x8C`, conserva duplicados/versiones y marca pendientes.
4. **Almacenamiento y copia:** IndexedDB local; respaldo JSON y complemento Android `native-backup/` con selector de documentos SAF para la copia privada.
5. **Compilación:** `scripts/prepare.mjs` crea `stage/` únicamente desde `android-native/src/`; otras transformaciones específicas Android agregan paneles, orientación, batería y respaldo. Vite empaqueta y Capacitor sincroniza el APK.
6. **Privacidad:** `scripts/harden.mjs` retira `INTERNET` y limita backup automático. El APK no depende de GitHub Pages ni registra service workers.

## Validación y límites

La V0.38 fue comprobada por el usuario con X10 real: LED azul, escritura, importación y resumen de trazos. V0.40 reorganiza rutas y retira dependencias de PWA sin cambiar el códec BLE ni el lector offline; requiere prueba física posterior. No hay modo tableta ni «Continuar escribiendo».

La firma de la APK de prueba es efímera. Conservar respaldo antes de desinstalar o cambiar de versión.

Consulte `README.md` para uso y `android-native/README.md` para compilar.
