# Mi Note — arquitectura propuesta para producto completo

## Meta
Una misma biblioteca accesible desde Samsung/Android y Windows, con recuperación de hojas offline de Huion X10, escritura en directo, uso sin red y control del usuario sobre datos.

## Capas

1. `ui/` PWA HTML/CSS/JS compartida para Windows (instalada), Android (web o empacada en Capacitor), con modo fullscreen y Pointer Events.
2. `domain/` esquema de trazos independiente de Huion: cuaderno > hojas > revisiones > trazos `{x,y,pressure,time?}`. Preservar originales de X10, sin degradar a PNG.
3. `storage/` IndexedDB local, operaciones atómicas, migraciones de versión y snapshots exportables. En Android nativo evaluar SQLite para colecciones voluminosas.
4. `device/huion/` implementación del protocolo BLE documentado para X10: en Android puente nativo Kotlin, en Windows validar Web Bluetooth o crear conector local; nunca transmitir datos de X10 a terceros.
5. `sync/drive/` OAuth 2.0 con `drive.file`, backup por versiones hoy; futuro motor bidireccional por registros de página con hash, `baseRevision`, registro de operaciones, colas offline, resolución de conflictos y eliminación explícita.
6. `security/` tokens solo memoria/custodia nativa, HTTPS, cifrado AES-GCM de cuadernos con clave derivada de contraseña (si se implementa), opciones de exportar/borrar y acceso local seguro.

## Por qué no solo PWA
Web Bluetooth es viable en determinados navegadores Chromium, pero el X10 usa GATT propietario y se reportan particularidades del firmware. No prometer que Chrome puede descargar páginas sin ensayos BLE reales. Android ofrece APIs Bluetooth GATT nativas. Windows puede necesitar conector propio si falla Web Bluetooth.

## Política de integridad
- No borrar jamás páginas físicas durante importación en etapas iniciales.
- Guardar primero bytes originales o JSON completo; verificar cantidad de trazos y hash, después confirmar copia local; luego respaldar en Drive.
- Backups versionados inmutables; no sobrescribir sin revisión.
- En caso de conflicto de escritura concurrente, duplicar versión en lugar de elegir silenciosamente ganadora.
- No publicar páginas, capturas Bluetooth ni tokens en GitHub.

## Hitos
1. **MVP 0.1 entregado**: biblioteca offline + lápiz/pantalla + exportación + respaldo manual Google Drive + importador JSON X10.
2. **0.2**: esquema de trazos importados enriquecido, miniaturas, búsqueda local, opciones de tamaño de hoja, orientación del lápiz y presión.
3. **0.3 Android**: proyecto Capacitor + Kotlin BLE X10; pairing, estados, lectura offline, checksum, y pruebas con dispositivo real, SIN eliminación.
4. **0.4 Windows**: experimento Web Bluetooth con X10 o conector local ligero; trazos en vivo por Pointer Events si Windows presenta lápiz como dispositivo de entrada.
5. **0.5 sincronización robusta**: sync de eventos por hoja, cola offline y conflictos explícitos; opcional cifrado extremo a extremo.
6. **1.0**: seguridad, pruebas en hardware, exportación masiva, restauración, accesibilidad, distribución Android y Windows.

## Contrato inicial de importación X10

Ejemplo de JSON compatible con el extractor de referencia:

```json
{"page":1,"max_x":28200,"max_y":37400,"max_press":8191,"strokes":[[{"x":120,"y":300,"press":3000,"pen_down":true},{"x":140,"y":320,"press":4200,"pen_down":true}]]}
```

La rotación 0/90/180/270 se elige al importar, de modo que las orientaciones físicas no se supongan a ciegas.
