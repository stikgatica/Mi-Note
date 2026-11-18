import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeBLE} from '../src/ble-adapter.js';
import '../../x10-ble.js';

test('X10 vuelve de agenda-pura a Data Ink por reconexión GATT sin comandos de borrado', async()=>{
 const writes=[];let connects=0,disconnects=0;
 const mock={
  async initialize(){},async isEnabled(){return true;},async isLocationEnabled(){return true;},
  async connect(){connects++;},async disconnect(){disconnects++;},
  async getServices(){return [{uuid:'0000ffe0-0000-1000-8000-00805f9b34fb',
   characteristics:[
    {uuid:'0000ffe1-0000-1000-8000-00805f9b34fb',properties:{notify:true}},
    {uuid:'0000ffe2-0000-1000-8000-00805f9b34fb',properties:{writeWithoutResponse:true}}
   ]}]},
  async startNotifications(){},
  async writeWithoutResponse(id,s,c,v){writes.push(v.getUint8(1));}
 };
 const bridge=createNativeBLE(mock,{getItem(){return null},setItem(){}});
 globalThis.MiNoteNativeBLE=bridge;
 const conn=new globalThis.MiNoteX10Ble.Connection();
 const device=await bridge.getSavedDevice('x10-restaurar');
 await conn.connectSaved(device);
 await conn.reconnectAgendaOnly({settleMs:1});
 assert.equal(conn.sessionKind,'agenda-pura');
 writes.length=0;
 await conn.reconnectTabletOnly({settleMs:1});
 assert.equal(conn.connected,true);
 assert.equal(conn.sessionKind,'tableta');
 assert.equal(conn.mode,'detectando'); // Data Ink se activa al recibir 55 54
 assert.equal(conn.tabletCommandsSent,true);
 assert.deepEqual(writes.slice(0,3),[0xc9,0xc8,0xca]);
 assert.ok(!writes.includes(0x8b)&&!writes.includes(0x8c));
 assert.equal(connects,3);
 assert.equal(disconnects,2);
 conn.disconnect();
});
test('V0.35 reanuda escritura sobre la hoja visible, sin crear una hoja nueva',()=>{
 const features=readFileSync(new URL('../scripts/features.mjs',import.meta.url),'utf8');
 assert.match(features,/async function x10ResumeCurrentPage/);
 assert.match(features,/await x10Connection\.reconnectTabletOnly\(\)/);
 assert.match(features,/x10BindCurrent\(\)/);
 assert.match(features,/await x10ResumeCurrentPage\(notify\)/);
 assert.doesNotMatch(features,/x10NewPhysicalPage\(\)/);
});
