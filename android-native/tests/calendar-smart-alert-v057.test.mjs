import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {autoReminderCandidate,reminderKey,createReminderLedger} from '../src/calendar/reminder-auto.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const now=new Date(2026,10,19,12,0);

test('Reunión de apoderados con fecha y hora muestra propuesta sin abrir menú',()=>{
 const e=autoReminderCandidate('Reunion Apoderados 15/12 16:00',{now});
 assert.ok(e);
 assert.equal(e.title,'Reunion Apoderados');
 assert.equal(e.date,'2026-12-15');
 assert.equal(e.time,'16:00');
});
test('Sin año infiere enero del año siguiente y respeta año explícito',()=>{
 assert.equal(autoReminderCandidate('Cita médica 05/01 09:00',{now})?.date,'2027-01-05');
 assert.equal(autoReminderCandidate('Reunión 05/01/2026 09:00',{now})?.date,'2026-01-05');
});
test('Fechas solas y Matemática nunca disparan un aviso automático',()=>{
 for(const text of [
  '15/12','15/12 16:00','05/01/2027','Resolver 15/12 16:00',
  'Ejercicio: calcular el 15/12 16:00','La fracción 15/12 es mayor que 1',
  'Calcula 15/12 + 1 = 2','Triángulo de 15/12','Reunión 15/12 16:00 = 2'
 ])assert.equal(autoReminderCandidate(text,{now}),null,text);
 assert.equal(autoReminderCandidate('Reunión Apoderados 15/12 16:00',{now,mathMode:true}),null);
});
test('Exige intención explícita de agenda y fecha válida',()=>{
 assert.equal(autoReminderCandidate('Clase de matemática 15/12 16:00',{now}),null);
 assert.equal(autoReminderCandidate('Comprar lápices 15/12 16:00',{now}),null);
 assert.equal(autoReminderCandidate('Reunión 31/02 16:00',{now}),null);
 assert.ok(autoReminderCandidate('Recordatorio entregar documentos 15/12',{now}));
});
test('Evita duplicados equivalentes incluso tras reiniciar y en otra página',()=>{
 const memory=new Map(),storage={
  getItem:k=>memory.get(k)||null,
  setItem:(k,v)=>memory.set(k,v)
 };
 let moment=Date.UTC(2026,10,19);
 const key=()=>createReminderLedger(storage,()=>moment);
 const a=autoReminderCandidate('Reunión apoderados 15/12 16:00',{now});
 const b=autoReminderCandidate('REUNION, APODERADOS 15/12 16:00',{now});
 assert.equal(reminderKey(a),reminderKey(b));
 assert.equal(key().has(a),false);
 key().mark(a,'dismissed');
 assert.equal(key().has(b),true);
 assert.equal(key().status(b),'dismissed');
 assert.equal([...memory.values()][0].includes('apoderados'),false,'No guardar texto de notas en claro');
 moment+=181*86400000;
 assert.equal(key().has(a),false,'Se purgan entradas después de 180 días');
});
test('El aviso sólo ofrece Agregar, Editar o Descartar, sin guardar automáticamente',()=>{
 const ui=read('../src/calendar/calendar-ui.js');
 assert.match(ui,/miNoteCalendarSuggestionAdd/);
 assert.match(ui,/miNoteCalendarSuggestionEdit/);
 assert.match(ui,/miNoteCalendarSuggestionDismiss/);
 assert.match(ui,/autoReminderCandidate\(x,\{mathMode\}\)/);
 assert.match(ui,/ledger\.has\(event\)/);
 assert.match(ui,/ledger\.mark\(selected,'opened'\)/);
 assert.match(ui,/ledger\.mark\(pendingReminder,'dismissed'\)/);
 assert.match(ui,/bridge\.openCalendar/);
 assert.match(ui,/minote:stroke-finished/);
 assert.match(ui,/!auto\.checked\|\|!modelAvailable/);
});
test('Versionado Android v0.57',()=>{
 const p=JSON.parse(read('../package.json'));
 const w=read('../../.github/workflows/android-release.yml');
 assert.equal(p.version,'0.57.0');
 assert.match(w,/versionCode 57/);
 assert.match(w,/Mi-Note-X10-Android-v0\.57\.apk/);
});
