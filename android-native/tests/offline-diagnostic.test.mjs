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

test('diagnóstico conserva HEX completo y checksum en páginas parciales solo si includeRaw=true',async()=>{
 const {verifyPacketChecksum,download,getLastDiagnostic}=globalThis.MiNoteX10Offline;
 function makeSparse126(seq,x,y){
  const pkt=new Uint8Array(126);
  pkt.set([0xcd,0x87,0x7e,seq&255,seq>>8,x&255,x>>8,y&255,y>>8,90,0x20]);
  let sum=0;for(let i=0;i<125;i++)sum=(sum+pkt[i])&255;
  pkt[125]=sum;
  return pkt;
 }
 const sample=makeSparse126(1,1200,2400);
 assert.equal(verifyPacketChecksum(sample).valid,true);
 sample[125]^=1;
 assert.equal(verifyPacketChecksum(sample).valid,false);

 const listeners=new Set();
 const emit=p=>queueMicrotask(()=>{for(const f of listeners)f(p);});
 const conn={
  connected:true,offlineReading:false,keepalive:null,batteryTimer:null,
  sessionKind:'agenda-pura',tabletCommandsSent:false,
  async getMtu(){return 141;},
  startKeepalive(){},
  subscribeFrames(f){listeners.add(f);return()=>listeners.delete(f);},
  async send(data){
   const op=data[1],index=data[3]|(data[4]<<8);
   if(op===0x81){emit(frame(0x81,6,2,3,4));emit(frame(0x82,4,1));}
   if(op===0x95)emit(frame(0x95,11,40,110,0,24,146,0,255,31));
   if(op===0x85)emit(frame(0x85,5,0,0));
   if(op===0x86){
    const count=index===0?10:0;
    emit(frame(0x86,5,count,0));
    for(let seq=1;seq<=count;seq++)emit(makeSparse126(seq,2000+seq*40,3000+seq*60));
   }
   if(op===0x88){
    const seq=data[5]|(data[6]<<8);
    const reply=makeSparse126(seq,2000+seq*40,3000+seq*60);
    reply[1]=0x88;
    let sum=0;for(let i=0;i<125;i++)sum=(sum+reply[i])&255;
    reply[125]=sum;
    emit(reply);
   }
  }
 };
 const res=await download(conn,{onPage:async()=>'imported'});
 assert.equal(res.imported,1);
 assert.equal(res.partialImported,1);
 const safe=getLastDiagnostic(false);
 const detailed=getLastDiagnostic(true);
 assert.equal(safe.sessionMode,'agenda-pura');
 assert.equal(safe.tabletCommandsSentBeforeDownload,false);
 assert.equal(safe.mtu,141);
 assert.equal(safe.pages[0].stats.checksumValidPackets,10);
 assert.equal(safe.pages[0].stats.zeroPaddedPackets,10);
 assert.equal(safe.pages[0].retransmitProbe.identicalPayloadCount,3);
 assert.equal(safe.pages[0].rawSampleHex,undefined);
 assert.equal(safe.pages[0].rawAllPacketsHex,undefined);
 assert.equal(safe.pages[0].firstActivePoints,undefined);
 assert.equal(detailed.pages[0].rawAllPacketsHex.length,10);
 assert.equal(detailed.pages[0].firstActivePoints.length,10);
});
