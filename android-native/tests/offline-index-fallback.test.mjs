import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/offline-x10.js';

const frame=(op,...body)=>Uint8Array.from([0xcd,op,...body]);
const packet=(seq,ink=true)=>frame(0x87,12,seq&255,seq>>8,100,0,100,0,30,ink?0x20:0,0xed);

function fakeX10({cursor=0,content={}}={}){
 const listeners=new Set(),commands=[];
 const emit=data=>queueMicrotask(()=>{for(const listener of listeners)listener(data);});
 const conn={
  connected:true,offlineReading:false,keepalive:null,batteryTimer:null,
  subscribeFrames(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  startKeepalive(){},
  async send(bytes){
   commands.push([...bytes]);
   const op=bytes[1],index=bytes[3]+256*bytes[4];
   if(op===0x81){emit(frame(0x81,6,1,2,3));emit(frame(0x82,4,1));}
   if(op===0x95)emit(frame(0x95,11,40,110,0,24,146,0,255,31));
   if(op===0x85)emit(frame(0x85,5,cursor&255,cursor>>8));
   if(op===0x86){
    const page=content[index],count=page?.count||0;
    emit(frame(0x86,5,count&255,count>>8));
    for(let seq=1;seq<=count;seq++)emit(packet(seq,page.ink));
   }
  }
 };
 return {conn,commands};
}
const safe=commands=>!commands.some(c=>c[1]===0x8b||c[1]===0x8c);

test('0x85 anuncia 0; índice 0 sin tinta no impide importar índice 7',async()=>{
 const {conn,commands}=fakeX10({cursor:0,content:{0:{count:3,ink:false},7:{count:3,ink:true}}});
 const pages=[];
 const result=await globalThis.MiNoteX10Offline.download(conn,{onPage:async p=>pages.push(p)});
 assert.equal(result.imported,1);
 assert.equal(result.undecodable,1);
 assert.equal(result.scanned,16);
 assert.deepEqual(pages.map(p=>p.page),[7]);
 assert.ok(commands.some(c=>c[1]===0x86&&c[3]===7));
 assert.ok(safe(commands),'Sin comandos de borrado de X10');
});

test('páginas 0..6 vacías y contenido 7..11; omite vacíos sin detenerse',async()=>{
 const {conn,commands}=fakeX10({cursor:11,content:{7:{count:3,ink:true},11:{count:2,ink:true}}});
 const pages=[];
 const result=await globalThis.MiNoteX10Offline.download(conn,{onPage:async p=>pages.push(p)});
 assert.equal(result.imported,2);
 assert.deepEqual(pages.map(p=>p.page),[7,11]);
 assert.ok(result.empty>=7);
 assert.ok(safe(commands));
});

test('sin tinta decodificable en ningún índice informa error sin borrar',async()=>{
 const {conn,commands}=fakeX10({cursor:0,content:{0:{count:3,ink:false}}});
 await assert.rejects(globalThis.MiNoteX10Offline.download(conn),
  /índices 0 a 15.*sin encontrar tinta importable/i);
 assert.ok(safe(commands));
 assert.equal(conn.offlineReading,false);
});
