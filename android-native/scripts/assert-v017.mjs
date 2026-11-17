import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const stage=path.join(process.cwd(),'stage');
const app=await fs.readFile(path.join(stage,'app.js'),'utf8');
const bootstrap=await fs.readFile(path.join(stage,'android-ui-main.js'),'utf8');
const layout=await fs.readFile(path.join(stage,'landscape-ui.js'),'utf8');
assert(app.includes('window.MiNoteAndroidReady=start().then('),
 'El motor debe publicar una promesa de carga de IndexedDB');
assert(!/\nstart\(\);\s*\n/.test(app),
 'No debe quedar un start() concurrente sin esperarlo');
const readyIndex=bootstrap.indexOf('await ready;');
const uiIndex=bootstrap.indexOf("await load('interfaz Android'");
const orientationIndex=bootstrap.indexOf("await load('orientación y TV'");
const libraryIndex=bootstrap.indexOf("await load('biblioteca y navegación'");
assert(readyIndex>0&&uiIndex>readyIndex&&orientationIndex>uiIndex&&libraryIndex>orientationIndex,
 'Motor, almacenamiento, orientación y biblioteca deben iniciarse secuencialmente');
assert(bootstrap.includes("throw Error(message);"),
 'No se debe continuar si falla la apertura de los cuadernos');
assert(layout.includes('layout.get().orientation'),
 'La orientación debe consultarse después de que exista el cuaderno');
const actions=await fs.readFile(path.join(stage,'app.js'),'utf8');
assert(actions.includes('window.MiNoteAndroidActions='),'API de páginas y cuadernos no instalada');
console.log('OK V0.17: IndexedDB se completa antes de orientación, barra y biblioteca.');
