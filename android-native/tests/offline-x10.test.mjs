import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/offline-x10.js';

const {download,decodePacket,decodePage,cmd}=globalThis.MiNoteX10Offline;
function packet(seq=1){
 const p=new Uint8Array(126);p.set([0xcd,0x87,0x7e,seq&255,seq>>8]);
 for(let i=0;i<20;i++){
  const o=5+i*6;
  if(i<2)p.set([10+i,0,20+i,0,80,0x20],o);
  else p.set([0,0,0,0,0,0],o);
 }
 return p;
}
test('decodifica puntos de 6 bytes sin incorporar el checksum',()=>{
 const data=decodePacket(packet());
 assert.equal(data.length,20);
 assert.deepEqual(data[0],{x:10,y:20,press:80,pen_down:true});
 assert.equal(data[2].pen_down,false);
 assert.equal(decodePage([packet()],7,{maxX:28200,maxY:37400,maxPressure:8191}).strokes.length,1);
});
function fake(){
 const subscribers=new Set(),sent=[];
 const emit=v=>{for(const cb of subscribers)cb(Uint8Array.from(v));};
 const next=fn=>Promise.resolve().then(fn);
 const connection={
  connected:true,offlineReading:false,keepalive:null,startKeepalive(){},
  subscribeFrames(cb){subscribers.add(cb);return()=>subscribers.delete(cb);},
  async send(bytes){
   const op=bytes[1];sent.push(op);
   if(op===0x81)next(()=>{emit([0xcd,0x81,6,28,63,239]);emit([0xcd,0x82,5,1,0]);});
   if(op===0x95)next(()=>emit([0xcd,0x95,11,0x28,0x6e,0,0x18,0x92,0,0xff,0x1f]));
   if(op===0x85)next(()=>emit([0xcd,0x85,5,2,0]));
   if(op===0x86){
    const index=bytes[3]|bytes[4]<<8;
    next(()=>{
     emit([0xcd,0x86,5,index===1?1:0,0]);
     if(index===1)emit(packet());
    });
   }
  }
 };
 return {connection,sent};
}
test('importa páginas tras páginas vacías y nunca borra memoria X10',async()=>{
 const {connection,sent}=fake();
 const pages=[];
 const result=await download(connection,{onPage:async page=>{pages.push(page);return 'imported'}});
 assert.deepEqual([result.imported,result.empty,result.totalLogical],[1,2,3]);
 assert.equal(pages[0].page,1);
 assert.equal(pages[0].strokes.length,1);
 assert.match(pages[0].digest,/^[0-9a-f]{64}$/);
 assert.equal(connection.offlineReading,false);
 assert.ok(sent.includes(0x86));
 assert.ok(!sent.includes(0x8b)&&!sent.includes(0x8c));
});
test('en modo descarga no hay órdenes destructivas',()=>{
 assert.deepEqual([...cmd(0x86,1,0,0,0)],[0xcd,0x86,8,1,0,0,0,0xed]);
});
