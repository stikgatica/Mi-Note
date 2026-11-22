import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/android-release.yml',import.meta.url),'utf8');

test('una versión desconocida nunca se reemplaza por starter ni se escribe al disco',()=>{
 assert.match(app,/if\(state&&\(state\.schema!==VERSION\|\|!Array\.isArray\(state\.notebooks\)\)\)/);
 assert.match(app,/throw Error\('Formato de cuadernos incompatible/);
 assert.match(app,/if\(!state\)state=starter\(\)/);
 assert.doesNotMatch(app,/if\(!state\|\|state\.schema!==VERSION/);
});
test('IndexedDB conserva identificador de base y clave preexistentes',()=>{
 assert.match(app,/indexedDB\.open\('MiNotePrivate',1\)/);
 assert.match(app,/const key = 'state'/);
});
test('la instalación nueva mantiene paquete y versión monotónica',()=>{
 const config=JSON.parse(readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
 assert.equal(config.appId,'cl.stikgatica.minote.x10');
 assert.match(workflow,/versionCode 80/);
 assert.match(workflow,/versionName "0\.80\.0"/);
});
test('jamás genera claves efímeras durante la publicación',()=>{
 assert.doesNotMatch(workflow,/keytool\s+-genkeypair|openssl rand -hex/);
 assert.match(workflow,/signing-guard\.mjs check-env/);
 assert.match(workflow,/signing-guard\.mjs verify-apk/);
});
test('respaldo de transición usa selector de archivos Android, sin afirmar guardado antes de confirmación',()=>{
 assert.match(app,/await exportBlob\(blob,filename,'application\/json','save'\)/);
 assert.match(app,/if\(!result\?\.saved\)throw Error/);
 assert.match(app,/await saveQueue/);
 assert.match(app,/NO desinstale la aplicación/);
 assert.match(app,/32\*1024\*1024/);
});
