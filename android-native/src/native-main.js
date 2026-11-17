// Carga el puente BLE antes del código de Mi Note; el navegador web no cambia.
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { createNativeBLE } from './ble-adapter.js';

if (Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform()) {
  window.MiNoteNativeBLE = createNativeBLE(BleClient);
} else {
  console.warn('Este paquete Android necesita ejecutarse con Capacitor nativo.');
}
// Se importan en orden: el protocolo X10 precede a la interfaz y al diagnóstico.
// La aplicación web del repositorio sigue utilizando sus scripts originales.
await import('./x10-ble.js');
await import('./offline-x10.js');
await import('./app.js');
await import('./x10-android-help.js');
