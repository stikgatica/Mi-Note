# Mi Note — versión 0.2.2 (integración de lápiz Data Ink V10)

Aplicación PWA independiente, diseñada para Windows y Android. Los cuadernos se guardan **en IndexedDB del navegador local**, no en GitHub. No hay telemetría, cuentas propias ni servidor de datos.

## Ya funciona

- Crear y renombrar cuadernos; crear, renombrar y eliminar páginas.
- Navegación compacta «‹ 1 ›» encima de la hoja; «›» avanza o crea nueva hoja en la última página; tocar el número abre administración de páginas.
- Dibujar con mouse, pantalla táctil o lápiz reconocido por Windows/Android, con presión cuando el navegador la entrega.
- Borrar trazos, deshacer/rehacer, distintos colores/grosores, fondos cuadriculado/rayado/blanco.
- Guardado automático local, caché PWA para uso sin internet tras primera visita, instalación cuando el navegador lo permite.
- Exportación SVG, PNG, impresión a PDF, respaldo JSON local y combinación no destructiva de respaldos.
- Importar un JSON de páginas Huion Note X10 en **el formato del extractor abierto** (`page`, `max_x`, `max_y`, `max_press`, `strokes`); se solicita rotación al importar.
- Conexión configurable a Google Drive mediante OAuth 2.0, con permiso `drive.file`: respaldos versionados en carpeta propia y combinación manual del último respaldo. **No incluye todavía sincronización automática ni edición colaborativa.**

## Aún no funciona

- La app NO establece conexión BLE directa con Huion X10. Falta un plugin nativo Android y validar el conector de Windows (Web Bluetooth directo podría presentar problemas específicos X10).
- No extrae páginas de la memoria de X10 por sí sola: importa archivos JSON ya recuperados mediante un extractor externo.
- No cifra de extremo a extremo los JSON subidos a Drive; se usa la seguridad normal de Google Drive. Cifrado local opcional es una etapa posterior.
- No implementa sincronización automática ni reconciliación de cambios en tiempo real. La función de Drive es **respaldo/combinar manual**: preserva conflictos en copias, jamás sobreescribe páginas diferentes.

## Publicar en GitHub Pages

1. Copiar estos archivos en una carpeta propia dentro de tu repositorio, o usar el directorio raíz si deseas que Mi Note sea el sitio principal.
2. En GitHub > Settings > Pages > Deploy from a branch, elegir `main` y `/ (root)` (o `/docs` si lo publicas allí).
3. Abrir `https://TUUSUARIO.github.io/TUREPOSITORIO/` y elegir instalar en Chrome/Edge si está disponible.
4. HTTPS es necesario para el Service Worker; también funciona en `http://localhost` durante desarrollo.
5. Para probar localmente, desde la carpeta ejecutar `python -m http.server 8000` y abrir `http://localhost:8000`.
6. Si se aloja en una subcarpeta, conservar las rutas relativas. El Service Worker solo guarda la interfaz, **nunca el contenido de cuadernos ni tokens OAuth**.

## Conectar Google Drive

1. En https://console.cloud.google.com/ crear o seleccionar un proyecto.
2. Habilitar **Google Drive API**.
3. Configurar **Google Auth Platform**: nombre Mi Note y los usuarios de prueba autorizados, si el proyecto sigue en modo Testing.
4. Crear **OAuth 2.0 Client ID**, tipo **Aplicación web**.
5. Registrar en **Orígenes autorizados de JavaScript**: `https://TUUSUARIO.github.io` (solo origen; no incluir ruta de repo). Para pruebas locales, registrar `http://localhost:8000`.
6. Habilitar permiso `https://www.googleapis.com/auth/drive.file` en la pantalla de consentimiento según corresponda.
7. En Mi Note, pulsar `Drive`, pegar el **Client ID** (no Client Secret) y pulsar **Conectar Google**.
8. Pulsar **Crear respaldo en Drive** para guardar una versión de los cuadernos en la carpeta privada `Mi Note - Privado` de tu cuenta. En otro dispositivo, **Combinar último respaldo** para añadir sus páginas.
9. El Client ID se guarda localmente; el token de acceso solo permanece en memoria, nunca dentro del respaldo, repositorio ni almacenamiento permanente.

**Seguridad:** No guardes datos reales sensibles de estudiantes en el prototipo sin revisar antes la política de tratamiento de datos y la protección del dispositivo/cuenta Google. Un repositorio público NO debe contener los respaldos JSON. Nunca comprometer Client Secret, claves API privadas ni tokens OAuth.

## Enfoque Bluetooth

Protocolo de referencia: https://github.com/Reginleif86/huion-note-x10-ble (MIT). Aporta documentación de handshake, descarga offline y módulo Android, pero sus herramientas BLE para PC están probadas en Linux. Para Android se recomienda plugin Kotlin BLE (Capacitor o un puente nativo) y para Windows valorar Web Bluetooth primero y adaptador auxiliar si es necesario. Cualquier extracción debe ser de **solo lectura/no borrar del dispositivo** salvo orden explícita.

## Estructura

```
index.html
styles.css
app.js
sw.js
manifest.webmanifest
icons/icon-192.png
icons/icon-512.png
README.md
ARQUITECTURA.md
```

## Huion Note X10 (0.2.1): conexión experimental sin borrar nada
- La interfaz V0.2 se mantiene. Botón «X10» arriba a la derecha abre la conexión.
- Usa Chrome/Edge actualizado, Bluetooth activo, HTTPS, y selecciona la X10 al conectar.
- El conector detecta el servicio GATT FFE0, notificaciones FFE1 y comandos FFE2.
- Soporta identificación del modo agenda (challenge 0x81, verify 0x82), consulta de límites 0x95 y páginas 0x85; aviso de nueva hoja de X10 (0x8A).
- Recibe y registra trazos en **modo tableta** con reportes 55 54 confirmados en la implementación externa. Para la escritura en tinta del **modo agenda**, el paquete 0x8D está identificado pero sus puntos no se han verificado; **aún no se asegura reproducción en tiempo real en modo agenda**. Se informa al usuario y permite copiar un diagnóstico voluntario para la próxima integración.
- La orientación se fija por perfil (agenda vertical 0°; modo tableta vertical 270°) o manualmente. Cada trazo X10 capturado conserva `x10.raw` con sus coordenadas/ presión originales, límites y rotación; solo `pts` se proyecta sobre la hoja 1000×1400. Cambiar la orientación recalcula `pts` desde `raw`, sin alterar `raw`.
- El botón físico que emita 0x8A genera una hoja nueva vinculada al cuaderno seleccionado, si «Crear hoja digital...» está marcado. Si no está, se detiene la captura hasta vincular una hoja, para evitar superposición.
- No se envían comandos destructivos 0x8B (borrar hoja), 0x8C (limpiar caché), ni comandos de firmware.
- La conexión Web Bluetooth depende del navegador y del firmware; hace falta probar con una X10 real. En Windows la app oficial puede reclamar el dispositivo en modo tableta; para papel/tinta usar el modo agenda cuando esté disponible.
- El respaldo sigue siendo formato `mi-note-v1` compatible con V0.2; las propiedades adicionales de X10 son optativas. **No borres los datos del navegador** al actualizar.
- Referencia técnica: https://github.com/Reginleif86/huion-note-x10-ble (MIT); manual Huion: https://www.huion.com/es/manual/huion-note/680

## V0.2.2: reaprovechar Data Ink V10
- El flujo BLE principal reproduce el que ya funcionaba con el lápiz de tinta del usuario: conexión FFE0/FFE1/FFE2; mensajes C9, C8 y CA de 8 bytes, separados por 150 ms; keepalive D1 cada cinco segundos.
- Analiza informes `55 54` de contacto/hover y respuestas de dimensiones `[LEN,C8,...]`. Se capturan coordenadas y presión en trazos vectoriales con originales guardados en `stroke.x10.raw`.
- Por defecto, la orientación vertical coincide con Data Ink V10: giro horario (270° en coordenadas normalizadas); la zona útil de la X10 se coloca centrada dentro de la hoja física A5 148×210 mm, usando área aproximada 140,9×186,9 mm. Estos parámetros necesitan confirmación empírica en la agenda real.
- El botón opcional «Probar modo agenda» envía el saludo 0x81 y permite diagnosticar eventos físicos de hoja 0x8A. La escritura online del protocolo de agenda 0x8D sigue sin decodificación validada. La conexión de lápiz tipo Data Ink no garantiza eventos 0x8A.
- No modificar el esquema IndexedDB ni borrar almacenamiento del navegador. Prueba física obligatoria antes de considerar la conexión plenamente compatible.
