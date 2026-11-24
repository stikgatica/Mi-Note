import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/x10-ble.js';
import '../src/offline-x10.js';
import { createNativeBLE } from '../src/ble-adapter.js';

const {
  Connection,
  mapPoint,
  mapPointWithMeta,
  parseNotePenFrames,
  sampleKinematics
} = globalThis.MiNoteX10Ble;

function noteSample(status = 2, x = 1500, y = 2800, pressure = 780) {
  const b = Uint8Array.of(0xcd, 0x8d, 11, status, x & 255, x >> 8, y & 255, y >> 8, pressure & 255, pressure >> 8, 0);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum = (sum + b[i]) & 255;
  b[10] = sum;
  return b;
}

test('no descarta tramas 0x8D fragmentadas cuyo segundo trozo comienza por 0xCD', () => {
  const c = new Connection();
  c.sessionKind = 'agenda-pura';
  const received = [];
  c.handlers.onPen = (p, limits, mode, meta) => received.push({ p, limits, mode, meta });
  // y = 0x05cd => byte[6] === 0xcd, byte[7] === 0x05 (!== 0x8d)
  const pkt = noteSample(2, 1200, 0x05cd, 600);
  const part1 = pkt.slice(0, 6);
  const part2 = pkt.slice(6);
  assert.equal(part2[0], 0xcd);
  c._onData({ target: { value: new DataView(part1.buffer) } });
  assert.equal(received.length, 0);
  c._onData({ target: { value: new DataView(part2.buffer) } });
  assert.equal(received.length, 1);
  assert.equal(received[0].p.x, 1200);
  assert.equal(received[0].p.y, 0x05cd);
  assert.equal(received[0].p.touch, true);
  assert.equal(c.liveDiagnostic().invalidOnline, 0);
});

test('recompone fragmento inicial de 1 byte [0xCD] seguido del resto de la trama 0x8D', () => {
  const c = new Connection();
  c.sessionKind = 'agenda-pura';
  const received = [];
  c.handlers.onPen = p => received.push(p);
  const pkt = noteSample(2, 2400, 3100, 900);
  c._onData({ target: { value: new DataView(pkt.slice(0, 1).buffer) } });
  c._onData({ target: { value: new DataView(pkt.slice(1).buffer) } });
  assert.equal(received.length, 1);
  assert.equal(received[0].x, 2400);
  assert.equal(received[0].y, 3100);
  assert.equal(c.liveDiagnostic().otherPackets, 0);
});

test('descarta trama 0x8D truncada cuando llega un paquete de protocolo completo distinto', () => {
  const c = new Connection();
  c.sessionKind = 'agenda-pura';
  let pageCount = null;
  c.handlers.onPageCount = n => { pageCount = n; };
  const partial = noteSample(2, 1000, 1000, 500).slice(0, 5);
  c._onData({ target: { value: new DataView(partial.buffer) } });
  // Respuesta 0x85 completa (len = 5)
  c._onData({ target: { value: new DataView(Uint8Array.of(0xcd, 0x85, 5, 4, 0).buffer) } });
  assert.equal(pageCount, 4);
  assert.equal(c.liveDiagnostic().invalidOnline, 1);
  assert.equal(c.liveDiagnostic().otherPackets, 1);
});

test('parseNotePenFrames respeta límites 0x95 actualizados sin alterar el formato de salida', () => {
  const pkt = noteSample(2, 28350, 37500, 500);
  assert.equal(parseNotePenFrames(pkt), null);
  const parsed = parseNotePenFrames(pkt, { maxX: 28500, maxY: 37600, maxPressure: 8191 });
  assert.deepEqual(parsed, [{ status: 2, x: 28350, y: 37500, press: 500, touch: true }]);
});

test('emite metadatos temporales y cinemáticos no destructivos sin alterar [x, y, press]', () => {
  const c = new Connection();
  c.sessionKind = 'agenda-pura';
  const metas = [];
  const points = [];
  c.handlers.onPen = (p, limits, mode, meta) => {
    assert.equal(mode, 'agenda');
    points.push(p);
    metas.push(meta);
  };
  const batch = new Uint8Array([
    ...noteSample(2, 1000, 2000, 400),
    ...noteSample(2, 1030, 2040, 450),
    ...noteSample(0, 1030, 2040, 0)
  ]);
  c._onData({ target: { value: new DataView(batch.buffer) } });
  assert.equal(points.length, 3);
  assert.equal(metas.length, 3);
  assert.equal(metas[0].seq, 1);
  assert.equal(metas[0].strokeStart, true);
  assert.equal(metas[0].strokeEnd, false);
  assert.equal(metas[0].batchIndex, 0);
  assert.equal(metas[0].batchSize, 3);
  assert.equal(metas[1].seq, 2);
  assert.equal(metas[1].dx, 30);
  assert.equal(metas[1].dy, 40);
  assert.equal(metas[1].dist, 50);
  assert.equal(metas[1].dPress, 50);
  assert.equal(metas[1].strokeStart, false);
  assert.equal(metas[2].strokeEnd, true);
  assert.ok(metas[0].t <= metas[1].t && metas[1].t <= metas[2].t);

  // mapPoint sigue devolviendo exactamente [x, y, press]
  const pt = mapPoint(points[0], 28200, 37400, 0, 1000, 1400, true);
  assert.equal(pt.length, 3);
  const enriched = mapPointWithMeta(points[1], 28200, 37400, 0, 1000, 1400, true, metas[1]);
  assert.deepEqual(enriched.pt, mapPoint(points[1], 28200, 37400, 0, 1000, 1400, true));
  assert.equal(enriched.meta.dist, 50);

  const kin = sampleKinematics({ x: 0, y: 0, press: 100, touch: true, t: 1000 }, { x: 30, y: 40, press: 120, touch: true }, 1010, 2, 0, 1);
  assert.equal(kin.dt, 10);
  assert.equal(kin.speed, 5);
});

test('ble-adapter ignora desconexión y notificaciones tardías de una sesión anterior tras reconectar', async () => {
  const disconnectCallbacks = [];
  const notifyCallbacks = [];
  let connectCalls = 0;
  const mock = {
    async initialize() {},
    async isEnabled() { return true; },
    async connect(id, onDisconnect) {
      connectCalls++;
      disconnectCallbacks.push(onDisconnect);
    },
    async disconnect() {},
    async getServices() {
      return [{
        uuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
        characteristics: [
          { uuid: '0000ffe1-0000-1000-8000-00805f9b34fb', properties: { notify: true } }
        ]
      }];
    },
    async startNotifications(id, s, c, cb) { notifyCallbacks.push(cb); }
  };
  const bridge = createNativeBLE(mock, { getItem: () => null, setItem() {} });
  const device = await bridge.getSavedDevice('x10-race-test');
  let disconnectEvents = 0;
  device.addEventListener('gattserverdisconnected', () => disconnectEvents++);

  // Sesión 1
  const s1 = await device.gatt.connect();
  const svc1 = await s1.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
  const ch1 = await svc1.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
  let staleNotifs = 0;
  ch1.addEventListener('characteristicvaluechanged', () => staleNotifs++);
  await ch1.startNotifications();

  // Desconectar y abrir Sesión 2 (también verificar deduplicación de connect concurrentes)
  await device.gatt.disconnectAsync();
  await Promise.all([device.gatt.connect(), device.gatt.connect()]);
  assert.equal(connectCalls, 2);
  assert.equal(device.gatt.connected, true);

  // Aviso tardío y notificación fantasma de la Sesión 1 NO deben afectar Sesión 2
  disconnectCallbacks[0]();
  notifyCallbacks[0](new DataView(Uint8Array.of(0xcd, 0x8d, 4, 1).buffer));
  assert.equal(device.gatt.connected, true);
  assert.equal(disconnectEvents, 0);
  assert.equal(staleNotifs, 0);

  // Desconexión real de la Sesión 2 SÍ debe notificarse
  disconnectCallbacks[1]();
  assert.equal(device.gatt.connected, false);
  assert.equal(disconnectEvents, 1);
});

test('offline-x10 no sobrescribe un paquete 0x87 completo con un duplicado más pobre', async () => {
  const listeners = new Set();
  const sent = [];
  const emit = p => queueMicrotask(() => { for (const fn of listeners) fn(p); });
  const frame = (op, ...body) => Uint8Array.of(0xcd, op, ...body);
  function richPacket(seq) {
    const pkt = new Uint8Array(126);
    pkt.set([0xcd, 0x87, 0x7e, seq & 255, seq >> 8]);
    for (let k = 0; k < 20; k++) {
      const o = 5 + k * 6, x = 2000 + seq * 50 + k, y = 3000 + k * 5;
      pkt.set([x & 255, x >> 8, y & 255, y >> 8, 120, 0x20], o);
    }
    return pkt;
  }
  function sparseDuplicate(seq) {
    const pkt = new Uint8Array(126);
    pkt.set([0xcd, 0x87, 0x7e, seq & 255, seq >> 8, 10, 0, 20, 0, 90, 0x20]);
    return pkt;
  }
  const conn = {
    connected: true, offlineReading: false, keepalive: null, batteryTimer: null, startKeepalive() {},
    subscribeFrames(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async send(data) {
      const op = data[1], index = data[3] | (data[4] << 8);
      sent.push(op);
      if (op === 0x81) { emit(frame(0x81, 6, 1, 2, 3)); emit(frame(0x82, 4, 1)); }
      if (op === 0x95) emit(frame(0x95, 11, 40, 110, 0, 24, 146, 0, 255, 31));
      if (op === 0x85) emit(frame(0x85, 5, 0, 0));
      if (op === 0x86) {
        const count = index === 0 ? 2 : 0;
        emit(frame(0x86, 5, count, 0));
        if (count) {
          emit(richPacket(1));
          // Duplicado pobre del seq 1 llegando antes de seq 2
          emit(sparseDuplicate(1));
          emit(richPacket(2));
        }
      }
    }
  };
  const pages = [];
  const res = await globalThis.MiNoteX10Offline.download(conn, { onPage: async p => { pages.push(p); return 'imported'; } });
  assert.equal(res.imported, 1);
  assert.equal(pages[0].strokes.length, 1);
  assert.equal(pages[0].strokes[0].length, 40);
  assert.ok(!sent.includes(0x8b) && !sent.includes(0x8c));
});
