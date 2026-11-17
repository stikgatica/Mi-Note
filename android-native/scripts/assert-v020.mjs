import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const app=await fs.readFile('stage/app.js','utf8');
for(const x of ['minoteLiveInkCanvas','function queueLive(stroke)','requestAnimationFrame(()=>{','getCoalescedEvents','function flushInkSave()','setTimeout(flushInkSave,400)','window.dispatchEvent(new Event(\'minote:changed\'))']) assert(app.includes(x),'Falta '+x);
assert(!app.includes('x10PointCount%8===0'),'X10 sigue actualizando indicadores innecesariamente');
assert(app.includes('queueLive(x10ActiveStroke)'),'X10 no usa tinta incremental');
assert(app.includes('resetLiveSize(pg);if(!inStroke&&!x10ActiveStroke)clearLive();'),'Canvas principal no usa capa overlay');
console.log('OK V0.20: tinta incremental y guardado diferido.');
