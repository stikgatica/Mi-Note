import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildHuionClearCacheFrame,clearHuionPhysicalCache,CLEAR_CACHE_OPCODE} from '../src/x10-device-cache.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function connection({response=[0xcd,0x8c,0x05,1,0xed],offlineReading=false,sessionKind='agenda-pura'}={}){
 const sent=[];
 let listener=null,removed=0;
 const conn={
  connected:true,offlineReading,sessionKind,sent,
  subscribeFrames(fn){
   listener=fn;
   return ()=>{removed++;listener=null;};
  },
  async send(bytes){
   sent.push([...bytes]);
   if(response)listener?.(Uint8Array.from(response));
  },
  get removed(){return removed;}
 };
 return conn;
}
test('CLEAR_CACHE envía únicamente CD 8C 08 00 00 00 00 ED',async()=>{
 assert.equal(CLEAR_CACHE_OPCODE,0x8c);
 assert.deepEqual([...buildHuionClearCacheFrame()],[0xcd,0x8c,0x08,0,0,0,0,0xed]);
 const device=connection();
 const value=await clearHuionPhysicalCache(device,{timeoutMs:250});
 assert.deepEqual(value,{acknowledged:true,opcode:0x8c});
 assert.deepEqual(device.sent,[[0xcd,0x8c,0x08,0,0,0,0,0xed]]);
 assert.equal(device.removed,1);
});
test('rechazo explícito de firmware no indica éxito',async()=>{
 const device=connection({response:[0xcd,0x8c,0x05,0,0xed]});
 await assert.rejects(clearHuionPhysicalCache(device,{timeoutMs:250}),/rechazó/i);
 assert.equal(device.removed,1);
});
test('sin ACK no se repite ni presume que la memoria esté intacta',async()=>{
 const device=connection({response:null});
 await assert.rejects(clearHuionPhysicalCache(device,{timeoutMs:220}),/resultado es desconocido/i);
 assert.equal(device.sent.length,1);
 assert.equal(device.removed,1);
});
test('no emite comandos al estar desconectada o durante importación',()=>{
 const disconnected=connection();disconnected.connected=false;
 assert.throws(()=>clearHuionPhysicalCache(disconnected),/conecte/i);
 const downloading=connection({offlineReading:true});
 assert.throws(()=>clearHuionPhysicalCache(downloading),/importación/i);
 const wrong=connection({sessionKind:'tablet'});
 assert.throws(()=>clearHuionPhysicalCache(wrong),/modo agenda/i);
 assert.equal(disconnected.sent.length+downloading.sent.length+wrong.sent.length,0);
});
test('caché física requiere confirmación de respaldo y teclear LIMPIAR',()=>{
 const ui=read('../src/x10-device-info-v051.js');
 const stage=read('../scripts/math-stage.mjs');
 const pkg=JSON.parse(read('../package.json'));
 assert.equal(pkg.version,'0.52.0');
 assert.match(ui,/window\.confirm\(notice\)/);
 assert.match(ui,/window\.prompt\(/);
 assert.match(ui,/typed!=='LIMPIAR'/);
 assert.match(ui,/api\.clearDeviceCache\(\)/);
 assert.match(ui,/El repositorio de ingeniería inversa lo clasifica como destructivo/);
 assert.match(stage,/x10-device-cache\.mjs/);
 assert.doesNotMatch(stage,/clearLocalDiagnostics/);
 assert.doesNotMatch(stage,/clearDeviceCache\(\)\s*;/);
});
