// Mi Note Android: puente GATT nativo para la API que ya utiliza Data Ink.
// No realiza búsquedas en segundo plano ni borra datos de la Huion.
export function createNativeBLE(BleClient, store = globalThis.localStorage) {
  const SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
  const DATA = '0000ffe1-0000-1000-8000-00805f9b34fb';
  const CMD = '0000ffe2-0000-1000-8000-00805f9b34fb';
  const devices = new Map();
  let initialization = null;

  async function ready() {
    if (!initialization) {
      initialization = (async () => {
        // Escaneo de compatibilidad Android: sin "neverForLocation". Algunos periféricos
        // (incluyendo beacons de notas BLE) se filtran con esa declaración.
        // La app NO consulta coordenadas y el APK carece de permiso INTERNET.
        await BleClient.initialize();
        if (!(await BleClient.isEnabled())) await BleClient.requestEnable();
      })().catch(err => { initialization = null; throw err; });
    }
    await initialization;
  }
  function view(bytes) {
    if (bytes instanceof DataView) return bytes;
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function emitter() {
    const handlers = new Map();
    return {
      addEventListener(type, cb) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(cb);
      },
      removeEventListener(type, cb) { handlers.get(type)?.delete(cb); },
      emit(type, detail) {
        for (const cb of handlers.get(type) || []) cb(detail || { type });
      }
    };
  }
  function deviceFrom(item) {
    const id = item.deviceId || item.id;
    if (!id) throw Error('No hay identificador del dispositivo Bluetooth.');
    if (devices.has(id)) {
      const cached = devices.get(id);
      if (item.name) cached.name = item.name;
      return cached;
    }
    const events = emitter();
    const device = {
      id, name: item.name || store?.getItem('minote_native_device_name') || 'Huion Note X10',
      addEventListener: events.addEventListener,
      removeEventListener: events.removeEventListener
    };
    let serviceInfo = [];
    const chars = new Map();
    const gatt = {
      connected: false,
      async connect() {
        await ready();
        if (gatt.connected) return gatt;
        // Android BLE permite reutilizar un deviceId conocido sin escanear.
        await BleClient.connect(id, () => {
          gatt.connected = false;
          serviceInfo = [];
          chars.clear();
          events.emit('gattserverdisconnected', { type: 'gattserverdisconnected', target: device });
        });
        gatt.connected = true;
        try { serviceInfo = await BleClient.getServices(id); }
        catch (_) { serviceInfo = []; } // GATT se verifica al usar cada característica.
        return gatt;
      },
      async getPrimaryService(uuid) {
        if (!gatt.connected) throw Error('La Huion está desconectada.');
        const resolved = serviceInfo.find(s => s.uuid?.toLowerCase() === uuid.toLowerCase());
        if (serviceInfo.length && !resolved) throw Error('No se encontró el servicio X10 FFE0.');
        return {
          async getCharacteristic(charUuid) {
            const key = charUuid.toLowerCase();
            if (chars.has(key)) return chars.get(key);
            const entry = resolved?.characteristics?.find(c => c.uuid?.toLowerCase() === key);
            const props = entry?.properties || (key === DATA ? { notify: true } :
              { write: true, writeWithoutResponse: true, indicate: true, notify: true });
            const ev = emitter();
            const characteristic = {
              uuid: charUuid,
              properties: props,
              value: null,
              addEventListener: ev.addEventListener,
              removeEventListener: ev.removeEventListener,
              async startNotifications() {
                await BleClient.startNotifications(id, uuid, charUuid, data => {
                  characteristic.value = view(data);
                  ev.emit('characteristicvaluechanged',
                    { type: 'characteristicvaluechanged', target: characteristic });
                });
                return characteristic;
              },
              async writeValueWithoutResponse(bytes) {
                const v = view(bytes);
                if (props.writeWithoutResponse) return BleClient.writeWithoutResponse(id, uuid, charUuid, v);
                return BleClient.write(id, uuid, charUuid, v);
              },
              async writeValueWithResponse(bytes) {
                return BleClient.write(id, uuid, charUuid, view(bytes));
              },
              async writeValue(bytes) {
                return props.writeWithoutResponse ?
                  characteristic.writeValueWithoutResponse(bytes) :
                  characteristic.writeValueWithResponse(bytes);
              }
            };
            chars.set(key, characteristic);
            return characteristic;
          }
        };
      },
      disconnect() {
        if (!gatt.connected) return;
        gatt.connected = false;
        // Intencionadamente no se espera esta Promise: Web Bluetooth hace lo mismo.
        void BleClient.disconnect(id).catch(() => {});
      }
    };
    device.gatt = gatt;
    devices.set(id, device);
    return device;
  }
  return {
    isNative: true,
    async selectDevice(filtered = false) {
      await ready();
      // La función no deriva la ubicación; únicamente comprueba que Android
      // tenga habilitados los servicios necesarios para encontrar periféricos.
      if (typeof BleClient.isLocationEnabled === 'function') {
        const enabled = await BleClient.isLocationEnabled();
        if (!enabled) throw Error('Activa Ubicación en los ajustes rápidos de Android para buscar la X10. Mi Note no lee tu posición ni utiliza internet.');
      }
      // No filtrar por nombre ni servicio: la X10 puede anunciarse de maneras
      // diferentes antes de establecer la conexión GATT.
      const options = {
        optionalServices: [SERVICE],
        scanMode: 2, // Android SCAN_MODE_LOW_LATENCY
        allowExtendedAdvertising: true
      };
      const found = await BleClient.requestDevice(options);
      if (!found?.deviceId) throw Error('No se seleccionó un dispositivo Bluetooth.');
      if (found.name) store?.setItem('minote_native_device_name', found.name);
      return deviceFrom(found);
    },
    async getSavedDevice(id) {
      if (!id) return null;
      // El id solo se emplea después de que el usuario haya elegido su X10.
      return deviceFrom({ deviceId: id });
    },
    async isEnabled() {
      await ready(); return BleClient.isEnabled();
    },
    async openBluetoothSettings() { return BleClient.openBluetoothSettings(); },
    async openAppSettings() { return BleClient.openAppSettings(); }
  };
}
