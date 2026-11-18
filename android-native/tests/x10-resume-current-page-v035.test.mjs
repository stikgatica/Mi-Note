import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('continuar escribiendo permanece en agenda y conserva hoja abierta',()=>{
 const source=readFileSync(new URL('../scripts/features.mjs',import.meta.url),'utf8');
 assert.match(source,/async function x10ResumeCurrentPage/);
 assert.match(source,/await x10Connection.enableNoteLive\(\)/);
 assert.match(source,/x10BindCurrent\(\)/);
 assert.match(source,/await x10ResumeCurrentPage\(notify\)/);
 assert.doesNotMatch(source,/reconnectTabletOnly|switchToAgendaLive/);
});
