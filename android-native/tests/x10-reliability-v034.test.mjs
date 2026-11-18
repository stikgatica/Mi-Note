import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../src/offline-x10.js';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');

test('V0.34 conserva decodificador X10 y coordenadas originales',()=>{
 const source=read('../src/offline-x10.js');
 const engine=read('../scripts/features.mjs');
 assert.match(source,/function decodePage\(packets,index,limits\)/);
 assert.match(engine,/MiNoteX10Ble\.mapPoint\(p,limits\.maxX,limits\.maxY,0,W,H,true\)/);
 assert.match(engine,/raw\.push\(\[p\.x,p\.y,p\.press\]\)/);
 assert.doesNotMatch(source,/sendCmd\(cmd\(0x8[bBcC]/);
});
test('V0.34 reintenta consulta no destructiva y mantiene páginas pendientes',()=>{
 const source=read('../src/offline-x10.js');
 assert.match(source,/const attempts=index<=lastIndex\?2:1/);
 assert.match(source,/entry\.status='pending-no-response'/);
 assert.match(source,/entry\.missingSequences=missing\.slice\(0,16\)/);
 assert.match(source,/pendingIndices:\[\.\.\.pendingIndices\]/);
 assert.doesNotMatch(source,/sendCmd\(cmd\(0x8[bBcC]/);
});
test('V0.34 preserva versiones existentes y solo reintenta el arranque',()=>{
 const engine=read('../scripts/features.mjs');
 assert.match(engine,/const hasPreviousVersion=existingPages\.length>0/);
 assert.match(engine,/return hasPreviousVersion\?'version':'imported'/);
 assert.match(engine,/existingPages\.some\(p=>p\.huion\?\.digest===result\.digest\)/);
 assert.match(engine,/\['challenge','authorization','dimensions','page-count'\]/);
 assert.match(engine,/officialHandshake:true/);
 assert.doesNotMatch(engine,/remove\(existingPages\)/);
});
test('V0.34 informa páginas pendientes y versiones en el diálogo',()=>{
 const ui=read('../src/memory-import.js');
 assert.match(ui,/result\.pendingIndices/);
 assert.match(ui,/result\.revised/);
 assert.match(ui,/result\.incomplete/);
});
