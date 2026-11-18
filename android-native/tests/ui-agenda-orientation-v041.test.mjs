import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('Menú solo ofrece Importar memoria agenda, no Herramientas ni grupo Huion',()=>{
 const menu=read('../src/menu-v019.js');
 const builder=read('../scripts/mobile.mjs');
 assert.match(menu,/importButton\.textContent='Importar memoria agenda'/);
 assert.doesNotMatch(menu,/\['Herramientas'|\['Huion X10'/);
 assert.match(builder,/id="x10MemoryOpen">▣ Importar memoria agenda/);
 assert.match(builder,/id="x10MemoryTitle">Importar memoria agenda/);
 assert.match(builder,/id="x10MemoryRun"/);
});
test('Bluetooth usa icono propio y LED azul en modo conectado',()=>{
 const builder=read('../scripts/mobile.mjs');
 const css=read('../src/floating-ui.css');
 assert.match(builder,/class="floating-bluetooth-icon"/);
 assert.doesNotMatch(builder,/class="floating-x10-label"/);
 assert.match(css,/background:#268bff!important/);
 assert.match(css,/\.floating-bluetooth-icon/);
});
test('Lápiz negro y selector de color después de grosor',()=>{
 const app=read('../src/app.js'),html=read('../src/index.html');
 const float=read('../src/floating-ui.js');
 assert.match(app,/let currentColor = '#000000'/);
 assert.match(html,/type="color" value="#000000"/);
 assert.match(float,/widthField\.after\(colorLabel\)/);
 assert.match(float,/\|\|'#000000'/);
});
test('Ambos giros horizontales usan landscape-cw y barra vertical; vertical usa A5',()=>{
 const page=read('../src/landscape-ui.js');
 const float=read('../src/floating-ui.js');
 assert.match(page,/window\.innerWidth>window\.innerHeight\?'landscape-cw':'portrait'/);
 assert.match(page,/screen\.orientation\?\.addEventListener\?/);
 assert.match(page,/layout\.set\(wanted\)/);
 assert.match(float,/window\.innerWidth>window\.innerHeight\?'vertical':'horizontal'/);
 assert.match(float,/syncAutomaticAxis/);
 assert.doesNotMatch(float,/floatingAxisMenu/);
 assert.doesNotMatch(page,/void selectOrientation/);
});
test('Escritura BLE e importación offline se conservan',()=>{
 const ble=read('../src/x10-ble.js'),engine=read('../scripts/features.mjs');
 assert.match(ble,/parseNotePenFrames/);
 assert.match(ble,/0x8d/);
 assert.match(engine,/officialHandshake:true/);
 assert.match(engine,/MiNoteX10Offline\.download\(x10Connection,options\)/);
 assert.doesNotMatch(engine,/reconnectTabletOnly/);
});
