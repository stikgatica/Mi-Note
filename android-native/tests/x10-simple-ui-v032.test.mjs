import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('La importación directa X10 usa siempre la secuencia oficial validada',()=>{
 const engine=read('../scripts/features.mjs');
 const ui=read('../src/memory-import.js');
 assert.match(engine,/officialHandshake:true/);
 assert.match(engine,/officialHandshake:true/);
 assert.doesNotMatch(engine,/reconnectAgendaOnly|reconnectTabletOnly/);
 assert.match(engine,/maxPages:64/);
 assert.doesNotMatch(engine,/sessionMode='agenda-clean'/);
 assert.doesNotMatch(ui,/x10MemorySessionMode/);
 assert.doesNotMatch(ui,/sessionMode==='reuse-current'/);
});
test('La interfaz Android solo ofrece Conectar X10 y un importador BLE',()=>{
 const mobile=read('../scripts/mobile.mjs');
 const float=read('../src/floating-ui.js');
 const connect=read('../src/floating-page-x10.js');
 assert.match(mobile,/id="x10MemoryRun"/);
 assert.match(mobile,/id="floatingX10Quick"/);
 assert.doesNotMatch(mobile,/id="x10MemorySessionMode"/);
 assert.doesNotMatch(mobile,/id="floatingX10DisconnectNow"/);
 assert.doesNotMatch(mobile,/id="floatingX10ViewStatus"/);
 assert.doesNotMatch(mobile,/id="x10ImportArchive"/);
 assert.doesNotMatch(float,/menuButton\('floatingX10Menu'/);
 assert.match(connect,/\$\('x10DirectConnect'\)\?\.click\(\)/);
 assert.doesNotMatch(connect,/\$\('x10Connect'\)\?\.click\(\)/);
});
