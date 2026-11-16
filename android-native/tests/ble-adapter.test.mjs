import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBLE } from '../src/ble-adapter.js';

test('seleccionar X10 y reutilizar permiso conocido',async()=>{
 const log=[];
 let notifier=null;
 const mock={
  async initialize(){ log.push('initialize'); },
  async isEnabled(){ return true; },
  async requestDevice(){ log.push('requestDevice');return {deviceId:'test-x10',name:'Huion Note-X10'}; },
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
