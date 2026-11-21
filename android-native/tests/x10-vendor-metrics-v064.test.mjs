import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeVendorBattery,decodeVendorMemory,decodeVendorStatus,parseStatusFrame} from '../src/x10-vendor-status.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const battery=parseStatusFrame([0xcd,0x8e,0x04,0x47],0x8e);
const memory=parseStatusFrame([0xcd,0x8f,0x08,0x2e,0x32,0x03,0x00,0x01],0x8f);
test('Huion 0x8E devuelve 71% real en captura proporcionada',()=>{
 assert.equal(decodeVendorBattery(battery).percent,71);
 assert.equal(decodeVendorBattery(battery).source,'huion-0x8e');
});
test('Huion 0x8F devuelve 46/50 libres sin inventar otros campos',()=>{
 const result=decodeVendorMemory(memory);
 assert.deepEqual(result,{free:46,total:50,used:4,source:'huion-0x8f',unknownTailHex:'03 00 01'});
});
test('descarta respuestas incorrectas y fuera de rango',()=>{
 assert.equal(decodeVendorBattery(parseStatusFrame([0xcd,0x8e,0x04,0x65],0x8e)),null);
 assert.equal(decodeVendorMemory(parseStatusFrame([0xcd,0x8f,0x08,0x32,0x2e,0,0,1],0x8f)),null);
 assert.equal(decodeVendorMemory(parseStatusFrame([0xcd,0x8f,0x05,46,50],0x8f)),null);
});
test('la lectura del proveedor prevalece en panel y botón de consulta',()=>{
 const panel=read('../src/x10-device-info-v051.js');
 const top=read('../src/battery-ui-v022.js');
 assert.match(panel,/vendorBattery=status\.battery/);
 assert.match(panel,/vendorMemory=status\.memory/);
 assert.match(panel,/mainBattery\?mainBattery\.percent/);
 assert.match(panel,/mainMemory\?mainMemory\.free/);
 assert.match(panel,/minote:x10-vendor-battery/);
 assert.match(top,/minote:x10-vendor-battery/);
 assert.match(top,/validVendor\?vendorLevel/);
});
test('no altera ni borra datos de Huion y mantiene el diagnóstico',()=>{
 const module=read('../src/x10-vendor-status.mjs');
 assert.doesNotMatch(module,/requestStatusFrame\(0x8b\)|requestStatusFrame\(0x8c\)/);
 assert.match(module,/unknownTailHex/);
 const result=decodeVendorStatus([{opcode:'0x8E',response:battery},{opcode:'0x8F',response:memory}],123456);
 assert.equal(result.readAt,123456);
 assert.equal(result.battery.percent,71);
 assert.equal(result.memory.free,46);
});
