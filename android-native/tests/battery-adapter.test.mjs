import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeBLE} from '../src/ble-adapter.js';

test('Puente X10 lee nivel GATT estándar real y normaliza UUID abreviados',async()=>{
 let reads=0;
 const BleClient={
  async initialize(){},async isEnabled(){return true;},
  async connect(){},
  async getServices(){return [{
   uuid:'180f', characteristics:[{uuid:'2a19',properties:{read:true}}]
  }];},
  async read(id,service,characteristic){
   assert.equal(id,'x10-test');
   assert.equal(service,'0000180f-0000-1000-8000-00805f9b34fb');
   assert.equal(characteristic,'00002a19-0000-1000-8000-00805f9b34fb');
   reads++;return new DataView(new Uint8Array([68]).buffer);
  },
  async disconnect(){}
 };
 const adapter=createNativeBLE(BleClient,{getItem:()=>null,setItem(){}});
 const device=await adapter.getSavedDevice('x10-test');
 const server=await device.gatt.connect();
 const service=await server.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
 const ch=await service.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
 const value=await ch.readValue();
 assert.equal(value.getUint8(0),68);
 assert.equal(reads,1);
});
test('Servicio de batería no anunciado no inventa porcentaje',async()=>{
 const BleClient={
  async initialize(){},async isEnabled(){return true;},
  async connect(){},async disconnect(){},
  async getServices(){return [{uuid:'ffe0',characteristics:[]}];}
 };
 const adapter=createNativeBLE(BleClient,{getItem:()=>null,setItem(){}});
 const device=await adapter.getSavedDevice('x10-without-battery');
 await device.gatt.connect();
 await assert.rejects(()=>device.gatt.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb'),/no disponible/i);
});
