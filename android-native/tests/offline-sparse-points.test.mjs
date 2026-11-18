import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/offline-x10.js';
const {decodePage}=globalThis.MiNoteX10Offline;
const limits={maxX:28200,maxY:37400,maxPressure:8191};
function sparsePacket(seq,x,y){
 const pkt=new Uint8Array(126);
 pkt.set([0xcd,0x87,0x7e,seq&255,seq>>8,x&255,x>>8,y&255,y>>8,90,0x20]);
 return pkt;
}
test('mantiene muestras X10 dispersas como puntos independientes sin dibujar líneas ficticias',()=>{
 const packets=Array.from({length:14},(_,i)=>sparsePacket(i+1,3200+i*90,4800+i*170));
 const result=decodePage(packets,0,limits);
 assert.equal(result.partial,true);
 assert.equal(result.sampleCount,14);
 assert.equal(result.strokes.length,14);
 assert.ok(result.strokes.every(stroke=>stroke.length===1));
 assert.deepEqual(result.strokes[0][0],{x:3200,y:4800,press:90,pen_down:true});
});
test('un único punto ambiguo no se declara página recuperada',()=>{
 const result=decodePage([sparsePacket(1,3200,4800)],0,limits);
 assert.equal(result.partial,false);
 assert.equal(result.strokes.length,0);
});
test('paquete de escritura continua conserva la decodificación normal',()=>{
 const pkt=sparsePacket(1,3200,4800);
 pkt.set([25,13,30,19,91,0x20],11);
 const result=decodePage([pkt],0,limits);
 assert.equal(result.partial,false);
 assert.equal(result.strokes.length,1);
 assert.equal(result.strokes[0].length,2);
});

test('sonda 0x88 descarta duplicados 0x87 rezagados y recupera trazos si 0x88 trae más puntos',async()=>{
 const {download}=globalThis.MiNoteX10Offline;
 const frame=(op,...body)=>Uint8Array.of(0xcd,op,...body);
 function fullPacket(op,seq){
  const pkt=new Uint8Array(126);
  pkt.set([0xcd,op,0x7e,seq&255,seq>>8]);
  for(let k=0;k<20;k++){
   const o=5+k*6,x=2000+seq*20+k,y=3000+seq*20+k;
   pkt.set([x&255,x>>8,y&255,y>>8,120,0x20],o);
  }
  return pkt;
 }
 const listeners=new Set();
 const emit=p=>queueMicrotask(()=>{for(const f of listeners)f(p);});
 const conn={
  connected:true,offlineReading:false,keepalive:null,batteryTimer:null,startKeepalive(){},
  subscribeFrames(f){listeners.add(f);return()=>listeners.delete(f);},
  async send(data){
   const op=data[1],index=data[3]|(data[4]<<8);
   if(op===0x81){emit(frame(0x81,6,2,3,4));emit(frame(0x82,4,1));}
   if(op===0x95)emit(frame(0x95,11,40,110,0,24,146,0,255,31));
   if(op===0x85)emit(frame(0x85,5,0,0));
   if(op===0x86){
    const count=index===0?10:0;
    emit(frame(0x86,5,count,0));
    for(let seq=1;seq<=count;seq++)emit(sparsePacket(seq,2000+seq*40,3000+seq*60));
    // Duplicado 0x87 rezagado en el buffer antes de la sonda 0x88:
    if(count)emit(sparsePacket(1,2040,3060));
   }
   if(op===0x88){
    const seq=data[5]|(data[6]<<8);
    emit(fullPacket(0x88,seq));
   }
  }
 };
 const pages=[];
 const res=await download(conn,{onPage:async p=>{pages.push(p);return 'imported';}});
 assert.equal(res.imported,1);
 assert.equal(res.partialImported,0);
 assert.equal(pages[0].partial,false);
 assert.equal(pages[0].strokes.length,1);
 assert.equal(pages[0].strokes[0].length,200);
});
