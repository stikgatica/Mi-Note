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
test('La caché local se sustituye por la orden física con confirmación doble',()=>{
 const ui=read('../src/x10-device-info-v051.js');
 const stage=read('../scripts/math-stage.mjs');
 assert.match(ui,/Limpiar caché de la Huion X10/);
 assert.match(ui,/window\.confirm\(notice\)/);
 assert.match(ui,/window\.prompt\(/);
 assert.match(ui,/typed!=='LIMPIAR'/);
 assert.match(stage,/clearDeviceCache\(\)/);
 assert.match(stage,/x10-device-cache\.mjs/);
 assert.doesNotMatch(ui,/Limpiar caché local/);
 assert.doesNotMatch(stage,/clearLocalDiagnostics/);
});
test('La consulta 0x85 sigue sin tocar páginas, y limpieza usa módulo separado',()=>{
 const stage=read('../scripts/math-stage.mjs');
 assert.match(stage,/0xcd,0x85,0x08,0,0,0,0,0xed/);
 assert.match(stage,/if\(x10Connection\.offlineReading\)/);
 assert.match(stage,/x10Connection\.sessionKind!=='agenda-pura'/);
 assert.match(stage,/minote:x10-memory-index/);
 const cache=read('../src/x10-device-cache.mjs');
 assert.match(cache,/0x8c/);
 assert.doesNotMatch(cache,/0x8b.*send|0x8b.*Uint8Array/);
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
test('Versionado Android desde V0.51',()=>{
 const flow=read('../../.github/workflows/android-release.yml');
 const pkg=JSON.parse(read('../package.json'));
 const [,major,minor]=pkg.version.match(/^(\d+)\.(\d+)\.(\d+)$/)||[];
 assert.ok(Number(minor)>=51);
 assert.match(flow,new RegExp('versionCode '+minor+'\\b'));
 assert.ok(flow.includes('Mi-Note-X10-Android-v'+major+'.'+minor+'.apk'));
});
