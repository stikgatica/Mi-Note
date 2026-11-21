import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestStatusFrame,parseStatusFrame,queryVendorStatus} from '../src/x10-vendor-status.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('solo acepta comandos de lectura 0x8E ELECTRICITY y 0x8F ROM',()=>{
 assert.deepEqual([...requestStatusFrame(0x8e)],[0xcd,0x8e,8,0,0,0,0,0xed]);
 assert.deepEqual([...requestStatusFrame(0x8f)],[0xcd,0x8f,8,0,0,0,0,0xed]);
 for(const code of [0x8b,0x8c,0x86,0x85,0x80])assert.throws(()=>requestStatusFrame(code),/solo se permiten/i);
});
test('conserva la respuesta completa, sin atribuir significado a bytes aún desconocidos',()=>{
 const parsed=parseStatusFrame(Uint8Array.from([0xcd,0x8e,0x06,0x49,0x01,0x00]),0x8e);
 assert.equal(parsed.hex,'cd 8e 06 49 01 00');
 assert.equal(parsed.payloadHex,'49 01 00');
 assert.equal(parsed.opcode,0x8e);
 assert.equal(parseStatusFrame([0xcd,0x8f,0x05,1,2],0x8e),null);
 assert.equal(parseStatusFrame([0xcd,0x8f,0x08,1,2],0x8f),null);
});
test('consulta secuencial, suscripción previa y cero comandos de escritura destructivos',async()=>{
 const handlers=new Set(),sent=[];
 const connection={
  connected:true,offlineReading:false,sessionKind:'agenda-pura',
  subscribeFrames(cb){handlers.add(cb);return ()=>handlers.delete(cb);},
  async send(payload){
   const op=payload[1];sent.push(op);
   assert.equal(handlers.size,1);
   const answer=op===0x8e?Uint8Array.from([0xcd,op,0x04,0x47]):
    Uint8Array.from([0xcd,op,0x08,0x2e,0x32,0x03,0x00,0x01]);
   for(const listener of handlers)listener(answer);
  }
 };
 const output=await queryVendorStatus(connection,{timeoutMs:500});
 assert.deepEqual(sent,[0x8e,0x8f]);
 assert.equal(output.results.length,2);
 assert.equal(output.results[0].response.hex,'cd 8e 04 47');
 assert.equal(output.battery.percent,71);
 assert.equal(output.memory.free,46);
 assert.equal(output.memory.total,50);
 assert.equal(output.memory.unknownTailHex,'03 00 01');
 assert.equal(output.interpreted,true);
 assert.equal(handlers.size,0);
});
test('rechaza la lectura durante importación, desconexión o modo no agenda',async()=>{
 const mock={connected:true,offlineReading:false,sessionKind:'agenda-pura',
  send:async()=>{},subscribeFrames:()=>()=>{}};
 for(const patch of [{connected:false},{offlineReading:true},{sessionKind:'tableta'}]){
  await assert.rejects(queryVendorStatus({...mock,...patch},{timeoutMs:300}));
 }
});
test('la interfaz contiene los diagnósticos y no cambia la orden física de caché',()=>{
 const stage=read('../scripts/math-stage.mjs');
 const ui=read('../src/x10-device-info-v051.js');
 const module=read('../src/x10-vendor-status.mjs');
 assert.match(stage,/x10-vendor-status\.mjs/);
 assert.match(stage,/queryVendorStatus/);
 assert.match(ui,/x10ProbeVendorStatus/);
 assert.match(ui,/0x8E\/0x8F/);
 assert.match(module,/requestStatusFrame/);
 assert.doesNotMatch(module,/0x8b|0x8c/);
 assert.match(ui,/typed!=='LIMPIAR'/);
});
