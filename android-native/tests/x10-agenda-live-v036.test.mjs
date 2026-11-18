import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../../x10-ble.js';
import {createNativeBLE} from '../src/ble-adapter.js';

const {Connection,parseNotePenFrames}=globalThis.MiNoteX10Ble;
function sample(status=2,x=1500,y=2800,pressure=780){
 const b=Uint8Array.of(0xcd,0x8d,11,status,x&255,x>>8,y&255,y>>8,pressure&255,pressure>>8,0);
 let sum=0;for(let i=0;i<10;i++)sum=(sum+b[i])&255;b[10]=sum;
 return b;
}
test('0x8D traduce escritura online y levantamiento del lápiz',()=>{
 const down=parseNotePenFrames(sample());
 assert.deepEqual(down,[{status:2,x:1500,y:2800,press:780,touch:true}]);
 assert.equal(parseNotePenFrames(sample(0,1500,2800,0))[0].touch,false);
 assert.equal(parseNotePenFrames(Uint8Array.of(0xcd,0x8d,4,1)),null);
 assert.equal(parseNotePenFrames(Uint8Array.of(0x55,0x54,11,2,1,2,3,4,5,6,7)),null);
});
test('0x8D acepta dos muestras en una notificación y conserva su orden',()=>{
 const bytes=new Uint8Array([...sample(2,300,400,100),...sample(0,300,400,0)]);
 const points=parseNotePenFrames(bytes);
 assert.equal(points.length,2);assert.equal(points[0].touch,true);assert.equal(points[1].touch,false);
});
test('modo agenda nativo es único y traduce muestras reales 0x8D',async()=>{
 const sent=[];
 const mock={
  async initialize(){},async isEnabled(){return true;},async isLocationEnabled(){return true;},
  async connect(){},async disconnect(){},
  async getServices(){return [{uuid:'0000ffe0-0000-1000-8000-00805f9b34fb',characteristics:[
   {uuid:'0000ffe1-0000-1000-8000-00805f9b34fb',properties:{notify:true}},
   {uuid:'0000ffe2-0000-1000-8000-00805f9b34fb',properties:{writeWithoutResponse:true,indicate:true}}
  ]}]},
  async startNotifications(){},async writeWithoutResponse(id,s,c,v){sent.push(v.getUint8(1));}
 };
 globalThis.MiNoteNativeBLE=createNativeBLE(mock,{getItem(){return null},setItem(){}});
 const device=await globalThis.MiNoteNativeBLE.getSavedDevice('agenda-only-test');
 const conn=new Connection();
 await conn.connectSaved(device);
 assert.equal(conn.sessionKind,'agenda-pura');
 assert.deepEqual(sent,[0x95,0x96,0x96,0x91,0x8d,0x81]);
 const points=[];conn.handlers.onPen=p=>points.push(p);
 conn._onData({target:{value:new DataView(sample().buffer)}});
 assert.equal(points.length,1);
 assert.equal(conn.mode,'agenda');
 assert.equal(conn.noteLivePackets,1);
 assert.ok(!sent.some(op=>[0xc9,0xc8,0xca,0xd1,0x8b,0x8c].includes(op)));
 conn.disconnect();delete globalThis.MiNoteNativeBLE;
});
test('el motor Android no ofrece cambiar a modo tableta',()=>{
 const engine=readFileSync(new URL('../scripts/features.mjs',import.meta.url),'utf8');
 assert.match(engine,/officialHandshake:true/);
 assert.match(engine,/await x10Connection.enableNoteLive\(\)/);
 assert.doesNotMatch(engine,/reconnectTabletOnly|switchMode\(next\)/);
 const ui=readFileSync(new URL('../scripts/mobile.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/x10MemorySwitchMode/);
});
