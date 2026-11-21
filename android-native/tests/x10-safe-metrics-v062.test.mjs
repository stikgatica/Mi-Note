import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {memoryFromIndex,batteryFromGatt,compareHuionReadings} from '../src/x10-metrics.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('índice 3 genera 46/50 solo como estimación, sin afirmar certeza',()=>{
 const m=memoryFromIndex(3);
 assert.equal(m.free,46);assert.equal(m.capacity,50);
 assert.equal(m.verified,false);
 assert.equal(m.confidence,'estimated');
});
test('índices ausentes o fuera de 0..49 nunca inventan memoria libre',()=>{
 for(const index of [-1,50,65535,null,undefined,'3']){
  assert.equal(memoryFromIndex(index).available,false,String(index));
 }
});
test('cotejo manual en la misma sesión solo corrobora la observación puntual',()=>{
 const m=memoryFromIndex(3,{reference:{index:3,free:46,capacity:50,sameSession:true}});
 assert.equal(m.verified,true);
 assert.equal(memoryFromIndex(4,{reference:{index:3,free:46,capacity:50,sameSession:true}}).verified,false);
 assert.equal(memoryFromIndex(3,{reference:{index:3,free:45,capacity:50,sameSession:true}}).verified,false);
});
test('batería 2A19 solo válida si conectada, reciente y entre 0 y 100',()=>{
 const now=Date.UTC(2026,10,21,12);
 assert.equal(batteryFromGatt({connected:true,level:99,readAt:now-1000},now).level,99);
 assert.equal(batteryFromGatt({connected:true,level:99,readAt:now-300000},now).available,false);
 assert.equal(batteryFromGatt({connected:false,level:99,readAt:now},now).available,false);
 assert.equal(batteryFromGatt({connected:true,level:119,readAt:now},now).available,false);
 assert.equal(batteryFromGatt({connected:true,level:99},now).available,false);
});
test('99% GATT frente a 73% oficial genera alerta sin falsear ninguna lectura',()=>{
 const now=Date.UTC(2026,10,21,12);
 const cmp=compareHuionReadings({batteryLevel:99,batteryAt:now-1000,
  officialBattery:73,index:3,free:46,officialFree:46,now});
 assert.equal(cmp.batteryDifference,26);
 assert.equal(cmp.batteryMismatch,true);
 assert.equal(cmp.memoryComparison,'matches');
});
test('sin referencia oficial no afirma exactitud ni registra número arbitrario',()=>{
 assert.equal(compareHuionReadings({index:3,free:46}).memoryComparison,'unknown');
 assert.equal(compareHuionReadings({batteryLevel:99,officialBattery:73,batteryAt:1}).batteryDifference,null);
});
test('el build copia las métricas, registra fuente 2A19 y conserva lectura 0x85 de solo consulta',()=>{
 const stage=read('../scripts/math-stage.mjs');
 const battery=read('../scripts/battery-v022.mjs');
 const ui=read('../src/x10-device-info-v051.js');
 assert.match(stage,/x10-metrics\.mjs/);
 assert.match(stage,/0xcd,0x85,0x08,0,0,0,0,0xed/);
 assert.match(battery,/batteryReadAt/);
 assert.match(battery,/gatt-2a19/);
 assert.match(ui,/x10OfficialBattery/);
 assert.match(ui,/x10OfficialMemory/);
 assert.match(ui,/Estimación no verificada/);
 assert.match(ui,/Limpiar caché de la Huion X10/);
 assert.doesNotMatch(ui,/fetch\(|https?:\/\//);
});

test('etiqueta superior de batería debe compilar sintácticamente',()=>{
 const file=fileURLToPath(new URL('../src/battery-ui-v022.js',import.meta.url));
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',file]));
});
