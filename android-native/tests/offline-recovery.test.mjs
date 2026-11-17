import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/offline-x10.js';

const frame=(op,...body)=>Uint8Array.from([0xcd,op,...body]);
const point=(op,seq)=>frame(op,12,seq&255,seq>>8,100,0,100,0,30,0x20,0xed);
function simulatedX10(){
 const listeners=new Set(),commands=[];
 const emit=v=>queueMicrotask(()=>{for(const cb of listeners)cb(v);});
 const conn={
  connected:true,offlineReading:false,keepalive:null,batteryTimer:null,limits:{maxX:28200,maxY:37400,maxPressure:8191},
  subscribeFrames(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  startKeepalive(){},
  async send(bytes){
   const op=bytes[1];commands.push([...bytes]);
   if(op===0x81){emit(frame(0x81,6,1,2,3));emit(frame(0x82,4,1));}
   if(op===0x95)emit(frame(0x95,11,40,110,0,24,146,0,255,31));
   if(op===0x85)emit(frame(0x85,5,0,0));
   if(op===0x86){emit(frame(0x86,5,34,0));for(let i=1;i<=34;i++)if(i!==33)emit(point(0x87,i));}
   if(op===0x88&&bytes[5]===33)emit(point(0x88,33));
  }
 };
 return {conn,commands};
}
test('recupera hoja 0 con 33/34 paquetes mediante 0x88 y nunca borra memoria',async()=>{
 const {conn,commands}=simulatedX10();
 const pages=[];
 const result=await globalThis.MiNoteX10Offline.download(conn,{onPage:async p=>pages.push(p)});
 assert.equal(result.imported,1);
 assert.equal(pages.length,1);
 assert.equal(pages[0].packet_count,34);
 assert.equal(pages[0].strokes[0].length,34);
 assert.ok(commands.some(c=>c[1]===0x88&&c[5]===33),'Solicitó paquete faltante 33');
 assert.ok(!commands.some(c=>c[1]===0x8b||c[1]===0x8c),'Nunca elimina páginas de la X10');
 assert.equal(conn.offlineReading,false);
});

test('acepta el último paquete 0x87 corto y lo cuenta como uno de 43',async()=>{
 const commands=[];const listeners=new Set();
 const emit=bytes=>queueMicrotask(()=>{for(const listener of listeners)listener(bytes);});
 const connection={connected:true,offlineReading:false,keepalive:null,batteryTimer:null,
  subscribeFrames(cb){listeners.add(cb);return()=>listeners.delete(cb);},startKeepalive(){},
  async send(bytes){const op=bytes[1];commands.push([...bytes]);
   if(op===0x81){emit(frame(0x81,6,1,2,3));emit(frame(0x82,4,1));}
   if(op===0x95)emit(frame(0x95,11,40,110,0,24,146,0,255,31));
   if(op===0x85)emit(frame(0x85,5,0,0));
   if(op===0x86){emit(frame(0x86,5,43,0));for(let seq=1;seq<=43;seq++)emit(point(0x87,seq));}
  }
 };
 const imported=[];
 const result=await globalThis.MiNoteX10Offline.download(connection,{onPage:async p=>imported.push(p)});
 assert.equal(result.imported,1);
 assert.equal(imported[0].packet_count,43);
 assert.equal(imported[0].strokes[0].length,43);
 assert.equal(commands.some(c=>c[1]===0x88),false,'No debe pedir retransmisiones de paquetes válidos cortos');
 assert.equal(commands.some(c=>c[1]===0x8b||c[1]===0x8c),false);
});
test('rechaza un paquete corto corrupto con longitud declarada inconsistente',()=>{
 const invalid=point(0x87,43);invalid[2]=126;
 assert.throws(()=>globalThis.MiNoteX10Offline.decodePacket(invalid),/inválido|incompleto/i);
});
