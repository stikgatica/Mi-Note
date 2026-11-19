// Entrada de la aplicación Capacitor Android; la interfaz se ejecuta en un WebView local.
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createNativeBLE } from './ble-adapter.js';

if (Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform()) {
  window.MiNoteNativeBLE = createNativeBLE(BleClient);
  window.MiNotePrivateBackup = registerPlugin('PrivateBackup');
  window.MiNoteFileExport = registerPlugin('MiNoteFileExport');
} else {
  console.warn('Este paquete Android necesita ejecutarse con Capacitor nativo.');
}
// Importar el protocolo Huion y los cuadernos locales en el WebView Android.
await import('./x10-ble.js');
await import('./offline-x10.js');
await import('./app.js');
