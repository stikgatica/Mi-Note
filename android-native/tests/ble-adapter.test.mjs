import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBLE } from '../src/ble-adapter.js';

test('seleccionar X10 y reutilizar permiso conocido',async()=>{
 const log=[];
 let notifier=null;
 const mock={
  async initialize(){ log.push('initialize'); },
  async isEnabled(){ return true; },
  async requestDevice(options){
    assert.equal(options.scanMode,2);
    assert.equal(options.allowExtendedAdvertising,true);
    assert.equal(options.namePrefix,undefined);
    assert.equal(options.services,undefined);
    log.push('requestDevice');
    return {deviceId:'test-x10',name:'Huion Note-X10'};
  },
  async isLocationEnabled(){return true;},
  async connect(id,disconnected){ log.push('connect:'+id);mock.disconnected=disconnected; },
  async getServices(){return [{uuid:'0000ffe0-0000-1000-8000-00805f9b34fb',
    characteristics:[
     {uuid:'0000ffe1-0000-1000-8000-00805f9b34fb',properties:{notify:true}},
     {uuid:'0000ffe2-0000-1000-8000-00805f9b34fb',properties:{writeWithoutResponse:true}}
    ]}];},
  async startNotifications(id,s,c,fn){notifier=fn;},
  async writeWithoutResponse(id,s,c,value){log.push('write:'+value.getUint8(0));},
  async disconnect(){log.push('disconnect');}
 };
 const store={getItem(){return null;},setItem(){}};
 const bridge=createNativeBLE(mock,store);
 const chosen=await bridge.selectDevice();
 assert.equal(chosen.name,'Huion Note-X10');
 assert.equal((await bridge.getSavedDevice('test-x10')),chosen);
 const server=await chosen.gatt.connect();
 const service=await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
 const pen=await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
 let notifications=0;
 pen.addEventListener('characteristicvaluechanged',e=>{
  notifications++; assert.equal(e.target.value.getUint8(0),0x55);
 });
 await pen.startNotifications();
 notifier(new DataView(Uint8Array.from([0x55,0x54]).buffer));
 assert.equal(notifications,1);
 const cmd=await service.getCharacteristic('0000ffe2-0000-1000-8000-00805f9b34fb');
 await cmd.writeValueWithoutResponse(Uint8Array.from([0xcd,0xc9]));
 assert.ok(log.includes('write:205'));
 chosen.gatt.disconnect();
 assert.equal(chosen.gatt.connected,false);
});

test('muestra ayuda si ubicacion del sistema apagada',async()=>{
 const mock={async initialize(){},async isEnabled(){return true;},
 async isLocationEnabled(){return false;},
 async requestDevice(){throw Error('No debe escanear');}};
 await assert.rejects(()=>createNativeBLE(mock,{getItem(){return null},setItem(){}}).selectDevice(),/Activa Ubicación/);
});

test('la conexión X10 siempre usa el protocolo de agenda y nunca inicia modo tableta',async()=>{
 await import('../src/x10-ble.js');
 const sent=[];
 const mock={
  async initialize(){},async isEnabled(){return true;},async isLocationEnabled(){return true;},
  async connect(){},async disconnect(){},
  async getMtu(){return 141;},
  async getServices(){return [{uuid:'0000ffe0-0000-1000-8000-00805f9b34fb',characteristics:[
   {uuid:'0000ffe1-0000-1000-8000-00805f9b34fb',properties:{notify:true}},
   {uuid:'0000ffe2-0000-1000-8000-00805f9b34fb',properties:{writeWithoutResponse:true,indicate:true}}
  ]}]},
  async startNotifications(){},async writeWithoutResponse(id,s,c,value){sent.push(value.getUint8(1));}
 };
 globalThis.MiNoteNativeBLE=createNativeBLE(mock,{getItem(){return null},setItem(){}});
 const device=await globalThis.MiNoteNativeBLE.getSavedDevice('x10-agenda');
 const conn=new globalThis.MiNoteX10Ble.Connection();
 await conn.connectSaved(device);
 assert.equal(conn.connected,true);
 assert.equal(conn.sessionKind,'agenda-pura');
 assert.deepEqual(sent,[0x95,0x96,0x96,0x91,0x8d,0x81]);
 assert.ok(!sent.some(op=>[0xc9,0xc8,0xca,0xd1,0x8b,0x8c].includes(op)));
 assert.equal(await conn.getMtu(),141);
 conn.disconnect();delete globalThis.MiNoteNativeBLE;
});
