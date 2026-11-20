import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractImportedReminders,lineBandsFromPage,recognizeImportedPage} from '../src/calendar/import-reminders.mjs';
import {createReminderLedger,reminderKey} from '../src/calendar/reminder-auto.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const now=new Date(2026,10,19,12);
test('extrae varias reuniones de una sola hoja física sin exigir título especial',()=>{
 const notes='Reunión de apoderados 15/12 16:00\nCita médica 05/01 09:30';
 const items=extractImportedReminders(notes,{now});
 assert.equal(items.length,2);
 assert.equal(items[0].date,'2026-12-15');
 assert.equal(items[0].time,'16:00');
 assert.equal(items[1].date,'2027-01-05');
 assert.equal(items[1].time,'09:30');
});
test('fechas sin intención y ejercicios no producen eventos',()=>{
 for(const notes of ['15/12\n05/01','Matemática 15/12 16:00','15/12 + 1 = 3','Estatura 15/12']){
  assert.deepEqual(extractImportedReminders(notes,{now}),[],notes);
 }
});
test('líneas repetidas de la hoja se reúnen una sola vez',()=>{
 const items=extractImportedReminders('Reunión apoderados 15/12 16:00\nReunión apoderados 15/12 16:00',{now});
 assert.equal(items.length,1);
});
test('segmentación de trazos por renglón respeta orden temporal de tinta',()=>{
 const stroke=(y,id)=>({id,pts:[[20,y],[40,y+4],[60,y+5]]});
 const bands=lineBandsFromPage([stroke(120,'a'),stroke(220,'c'),stroke(122,'b'),stroke(222,'d')]);
 assert.equal(bands.length,2);
 assert.equal(bands[0].length,2);
 assert.equal(bands[1].length,2);
 assert.deepEqual(bands[0][0][0],[20,120]);
});
test('OCR importado obtiene dos eventos y evita doble lectura como duplicado',async()=>{
 const stroke=(y,id)=>({id,pts:[[20,y],[40,y+4],[60,y+5]]});
 const page={huion:{source:'internal-memory',partial:false},
  strokes:[stroke(120,'a'),stroke(220,'c'),stroke(122,'b'),stroke(222,'d')]};
 let calls=0;
 const result=await recognizeImportedPage(page,async()=>{
  calls++;
  return {text:'Reunión de apoderados 15/12 16:00\nCita médica 05/01 09:30'};
 },{now});
 assert.ok(calls>=1);
 assert.equal(result.length,2);
 const data=new Map(),store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const ledger=createReminderLedger(store,()=>Date.UTC(2026,10,19));
 ledger.mark(result[0],'dismissed');
 assert.ok(ledger.has(result[0]));
 assert.equal(ledger.has(result[1]),false);
 assert.notEqual(reminderKey(result[0]),reminderKey(result[1]));
});
test('páginas parciales o sin trazos se omiten sin inventar reuniones',async()=>{
 let called=false;
 const recognize=async()=>{called=true;return {text:'Reunión 15/12 16:00'};};
 assert.deepEqual(await recognizeImportedPage({huion:{partial:true},strokes:[{pts:[[1,1],[2,2]]}]},recognize,{now}),[]);
 assert.deepEqual(await recognizeImportedPage({strokes:[]},recognize,{now}),[]);
 assert.equal(called,false);
});
test('la importación X10 emite hojas tras persistir y no manipula memoria física',()=>{
 const features=read('../scripts/features.mjs');
 const actions=read('../scripts/android-actions.mjs');
 const stage=read('../scripts/math-stage.mjs');
 const ui=read('../src/calendar/calendar-ui.js');
 assert.match(features,/minote:x10-page-imported/);
 assert.match(features,/minote:x10-import-finished/);
 assert.match(actions,/minote:x10-page-imported/);
 assert.match(stage,/MiNoteCalendarImportRead/);
 assert.match(ui,/minote:x10-import-finished/);
 assert.match(ui,/recognizeImportedPage\(pg,args=>bridge\.recognize\(args\)\)/);
 assert.match(ui,/importDialog\?\.addEventListener\('close'/);
 assert.match(ui,/suggestionQueue\.push/);
 assert.match(ui,/maybeShowNextSuggestion/);
});
test('APK V0.58',()=>{
 const pkg=JSON.parse(read('../package.json'));
 const flow=read('../../.github/workflows/android-release.yml');
 assert.equal(pkg.version,'0.58.0');
 assert.match(flow,/versionCode 58/);
 assert.match(flow,/Mi-Note-X10-Android-v0\.58\.apk/);
});
