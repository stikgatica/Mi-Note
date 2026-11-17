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
