import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/offline-x10.js';
const frame=(op,...body)=>Uint8Array.of(0xcd,op,...body);
const packet=(seq,down=false)=>frame(0x87,12,seq&255,seq>>8,100,0,100,0,30,down?0x20:0,0xed);
function fake(){
 const listeners=new Set(),sent=[];
 const emit=p=>queueMicrotask(()=>{for(const f of listeners)f(p);});
 const conn={connected:true,offlineReading:false,keepalive:null,batteryTimer:null,startKeepalive(){},
  subscribeFrames(f){listeners.add(f);return()=>listeners.delete(f);},
  async send(data){
   sent.push([...data]);const op=data[1],index=data[3];
   if(op===0x81){emit(frame(0x81,6,2,3,4));emit(frame(0x82,4,1));}
   if(op===0x95)emit(frame(0x95,11,40,110,0,24,146,0,255,31));
   if(op===0x85)emit(frame(0x85,5,0,0));
   if(op===0x86){const count=index===0?3:0;emit(frame(0x86,5,count,0));for(let seq=1;seq<=count;seq++)emit(packet(seq));}
  }
 };return {conn,sent};
}
test('diagnóstico incluye estadísticas pero oculta paquetes salvo petición expresa',async()=>{
 const {conn,sent}=fake();
 await assert.rejects(globalThis.MiNoteX10Offline.download(conn),/sin encontrar tinta importable/);
 const safe=globalThis.MiNoteX10Offline.getLastDiagnostic();
 const detailed=globalThis.MiNoteX10Offline.getLastDiagnostic(true);
 assert.equal(safe.format,'MiNoteX10OfflineDiagnostic');
 assert.equal(safe.pages[0].status,'undecodable');
 assert.equal(safe.pages[0].packetCount,3);
 assert.equal(safe.pages[0].stats.points,3);
 assert.equal(safe.pages[0].stats.maxConsecutiveActivePoints,0);
 assert.equal(safe.pages[0].rawSampleHex,undefined);
 assert.ok(detailed.pages[0].rawSampleHex?.length>0);
 assert.equal(safe.pages.length,16);
 assert.ok(!sent.some(p=>p[1]===0x8b||p[1]===0x8c));
});
