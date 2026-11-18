import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('la importación X10 permanece en agenda sin reactivar el lápiz al terminar',()=>{
 const source=readFileSync(new URL('../scripts/features.mjs',import.meta.url),'utf8');
 assert.match(source,/officialHandshake:true/);
 assert.match(source,/MiNoteX10Offline\.download\(x10Connection,options\)/);
 assert.match(source,/if\(x10Connection\?\.connected\)x10BindCurrent\(\)/);
 assert.doesNotMatch(source,/x10ResumeCurrentPage|x10RestorePen|restore\.onclick/);
 assert.doesNotMatch(source,/reconnectTabletOnly|switchToAgendaLive/);
 assert.doesNotMatch(source,/await x10Connection\.enableNoteLive\(\)/);
});
test('la interfaz omite continuar escribiendo, modo alternativo y prueba de tableta',()=>{
 const mobile=readFileSync(new URL('../scripts/mobile.mjs',import.meta.url),'utf8');
 const memory=readFileSync(new URL('../src/memory-import.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../../app.js',import.meta.url),'utf8');
 for(const value of [mobile,memory,html,app]){
  assert.doesNotMatch(value,/x10MemoryResumeDrawing|x10MemorySwitchMode|x10ProbeTablet/);
 }
 assert.match(mobile,/id="x10MemoryRun"/);
});
