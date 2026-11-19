import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('El panel muestra batería real, memoria no disponible y no simula 50 páginas libres',()=>{
 const ui=read('../src/x10-device-info-v051.js');
 assert.match(ui,/Batería restante/);
 assert.match(ui,/Memoria restante/);
 assert.match(ui,/Sin lectura de capacidad libre/);
 assert.match(ui,/No equivale a espacio libre/);
 assert.match(ui,/minote:x10-battery/);
 assert.match(ui,/minote:x10-memory-index/);
 assert.doesNotMatch(ui,/(?:46\/50|50\/50|78%)/);
});
test('El botón de limpieza solo invoca la función de diagnósticos locales',()=>{
 const ui=read('../src/x10-device-info-v051.js');
 const stage=read('../scripts/math-stage.mjs');
 assert.match(ui,/window\.confirm\(/);
 assert.match(ui,/clearLocalDiagnostics/);
 assert.match(stage,/x10Logs\.length=0/);
 assert.doesNotMatch(stage,/x10Connection\.send\(.{0,100}0x8[bBcC]/);
 assert.doesNotMatch(stage,/clearLocalDiagnostics\(\)[\s\S]{0,110}(?:strokes|indexedDB\.deleteDatabase|\.clear\()/);
});
test('Solo consulta 0x85 y conserva el modo agenda sin comandos de borrado',()=>{
 const stage=read('../scripts/math-stage.mjs');
 assert.match(stage,/0xcd,0x85,0x08,0,0,0,0,0xed/);
 assert.match(stage,/if\(x10Connection\.offlineReading\)/);
 assert.match(stage,/x10Connection\.sessionKind!=='agenda-pura'/);
 assert.match(stage,/minote:x10-memory-index/);
 assert.doesNotMatch(stage,/await x10Connection\.send\(Uint8Array\.from\(\[0xcd,0x8[bBcC]/);
});
test('El módulo se copia a stage para la APK y no usa actualización firmware',()=>{
 const stage=read('../scripts/math-stage.mjs');
 const ui=read('../src/x10-device-info-v051.js');
 assert.match(stage,/x10-device-info-v051\.js/);
 assert.match(stage,/x10-device-info\.css/);
 assert.match(stage,/Detalles seguros X10/);
 assert.match(ui,/aplicación oficial Huion Note/);
 assert.doesNotMatch(ui,/firmwareUpdate|flashFirmware|updateFirmware/);
});
test('Versionado Android V0.51',()=>{
 const flow=read('../../.github/workflows/android-release.yml');
 const pkg=JSON.parse(read('../package.json'));
 assert.equal(pkg.version,'0.51.0');
 assert.match(flow,/versionCode 51/);
 assert.match(flow,/Mi-Note-X10-Android-v0\.51\.apk/);
});
