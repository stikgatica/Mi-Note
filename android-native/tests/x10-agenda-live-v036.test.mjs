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
test('modo agenda nativo es predeterminado y el usuario puede elegir tableta',async()=>{
 const log=[];
 const mock={
  async initialize(){},async isEnabled(){return true;},async isLocationEnabled(){return true;},
  async connect(){},async disconnect(){},
  async getServices(){return [{uuid:'0000ffe0-0000-1000-8000-00805f9b34fb',characteristics:[
   {uuid:'0000ffe1-0000-1000-8000-00805f9b34fb',properties:{notify:true}},
   {uuid:'0000ffe2-0000-1000-8000-00805f9b34fb',properties:{writeWithoutResponse:true,indicate:true}}
  ]}]},
  async startNotifications(){},
  async writeWithoutResponse(id,s,c,bytes){log.push(bytes.getUint8(1));}
 };
 const storage={value:null,getItem(){return this.value},setItem(k,v){this.value=v}};
 globalThis.localStorage=storage;
 globalThis.MiNoteNativeBLE=createNativeBLE(mock,{getItem(){return null},setItem(){}});
 const device=await globalThis.MiNoteNativeBLE.getSavedDevice('agenda-mode-test');
 const conn=new Connection();
 await conn.connectSaved(device);
 assert.equal(conn.sessionKind,'agenda-pura');
 assert.deepEqual(log,[0x81]);
 assert.ok(!log.some(op=>[0xc9,0xc8,0xca,0x8b,0x8c].includes(op)));
 const got=[];conn.handlers.onPen=p=>got.push(p);
 conn._onData({target:{value:new DataView(sample().buffer)}});
 assert.equal(got.length,1);assert.equal(conn.mode,'agenda');
 conn.disconnect();
 storage.value='tableta';log.length=0;
 const fallback=new Connection();await fallback.connectSaved(device);
 assert.equal(fallback.sessionKind,'tableta');
 assert.deepEqual(log.slice(0,3),[0xc9,0xc8,0xca]);
 fallback.disconnect();
 delete globalThis.MiNoteNativeBLE;delete globalThis.localStorage;
});
test('motor Android mantiene importador de memoria y expone cambio de modo reversible',()=>{
 const source=readFileSync(new URL('../scripts/features.mjs',import.meta.url),'utf8');
 assert.match(source,/officialHandshake:true/);
 assert.match(source,/useAgendaByDefault/);
 assert.match(source,/switchToAgendaLive/);
 assert.match(source,/reconnectTabletOnly/);
 assert.match(source,/minote_x10_preferred_mode/);
 const ui=readFileSync(new URL('../scripts/mobile.mjs',import.meta.url),'utf8');
 assert.match(ui,/x10MemorySwitchMode/);
});
