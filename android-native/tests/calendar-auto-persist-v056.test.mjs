import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('restituye detección automática si el usuario la activó en sesión anterior',()=>{
 const code=read('../src/calendar/calendar-ui.js');
 assert.match(code,/auto\.checked=localStorage\.getItem\('minote_calendar_auto_v054'\)==='1'/);
 assert.match(code,/if\(auto\.checked\)void checkModel\(\{silent:true\}\);/);
 assert.match(code,/async function checkModel\(\{silent=false\}=\{\}\)/);
 assert.match(code,/modelAvailable=!!state\.downloaded/);
});
test('comprueba modelo al recuperar foco y cancela si se desactiva',()=>{
 const code=read('../src/calendar/calendar-ui.js');
 assert.match(code,/else if\(auto\.checked\)void checkModel\(\{silent:true\}\);/);
 assert.match(code,/if\(!auto\.checked\)clearTimeout\(detectTimer\);/);
 assert.match(code,/if\(!auto\.checked\|\|!modelAvailable\|\|document\.hidden\|\|dialog\.open\)return;/);
});
test('solo sugiere eventos tras escritura y nunca guarda sin consentimiento',()=>{
 const code=read('../src/calendar/calendar-ui.js');
 assert.match(code,/minote:stroke-finished/);
 assert.match(code,/\},6500\);/);
 assert.match(code,/announce\(event\)/);
 assert.match(code,/bridge\.openCalendar\(proposal\)/);
 assert.match(code,/if\(!confirm\('¿Abrir la propuesta/);
});
test('APK V0.56 contiene mejora y conserva validación de fecha chilena',()=>{
 const pkg=JSON.parse(read('../package.json'));
 const wf=read('../../.github/workflows/android-release.yml');
 const parser=read('../src/calendar/reminder-parser.mjs');
 assert.equal(pkg.version,'0.56.0');
 assert.match(wf,/versionCode 56/);
 assert.match(wf,/Mi-Note-X10-Android-v0\.56\.apk/);
 assert.match(parser,/const numeric=/);
});
