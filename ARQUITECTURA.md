# Arquitectura actual: Mi Note Android (V0.4 experimental)

La APK Android es el producto principal. La PWA anterior es **legado** y la UI HTML, JS y CSS raíz se mantiene como fuente compartida de la compilación Capacitor.

## Componentes
1. UI A5, IndexedDB local y trazos vectoriales: `index.html`, `app.js`, `styles.css`.
2. Paquete Android: `android-native/`; ensambla y endurece el contenido web, sin permiso de internet.
3. BLE: `android-native/src/ble-adapter.js` usa el plugin Capacitor; `x10-ble.js` decodifica trazos en directo, escucha 0x8A cuando el equipo emite avisos del modo agenda y almacena puntos originales.
4. Extracción: `android-native/src/offline-x10.js` consulta 0x85, solicita 0x86, interpreta 0x87, repone paquetes faltantes con 0x88 e importa solo páginas completas con SHA-256 a IndexedDB. No envía 0x8B ni 0x8C.
5. Seguridad: `android-native/scripts/harden.mjs` modifica manifest y normas de backup. No hay sincronización de red en APK.
6. Compilación: GitHub Actions crea APK release firmada y publica exclusivamente APK y hashes en GitHub Releases.

## Estado / límites
- Selección y reconexión BLE Android V0.3 confirmadas por el usuario.
- Botón de página y extracción offline V0.4 integrados como primera versión experimental; por validar con hardware real.
- Cada compilación efímera cambia de firma; respaldar JSON antes de reinstalar.
- Aún no se ha implementado cifrado local opcional ni sincronización de equipos.

Ver `README.md` para uso, pruebas y recuperación no destructiva. Documentación histórica: `docs/README_PWA_LEGACY.md`.
