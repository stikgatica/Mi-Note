import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReminder,calendarDraftIsValid} from '../src/calendar/reminder-parser.mjs';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const today=new Date(2026,10,19,12);
test('captura texto manuscrito sin año de la fotografía: Reunión Apoderados 15/12 16:00',()=>{
 const e=parseReminder('Reunion Apoderados 15/12 16:00',today);
 assert.ok(e);
 assert.equal(e.title,'Reunion Apoderados');
 assert.equal(e.date,'2026-12-15');
 assert.equal(e.time,'16:00');
 assert.equal(e.allDay,false);
 assert.equal(e.yearExplicit,false);
 assert.ok(calendarDraftIsValid(e));
});
test('fecha de enero pasa automáticamente al próximo año desde noviembre',()=>{
 const e=parseReminder('Reunión 05/01 09:30',today);
 assert.equal(e.date,'2027-01-05');
 assert.equal(e.time,'09:30');
 assert.equal(e.yearExplicit,false);
});
test('fecha de octubre ya pasada propone octubre del siguiente año',()=>{
 assert.equal(parseReminder('10/10',today).date,'2027-10-10');
});
test('fecha de hoy y del futuro mantienen año actual; usa reloj del dispositivo',()=>{
 assert.equal(parseReminder('19/11',today).date,'2026-11-19');
 assert.equal(parseReminder('20/11',today).date,'2026-11-20');
 assert.equal(parseReminder('05/01',new Date(2027,0,3)).date,'2027-01-05');
});
test('respeta años escritos y separadores de fecha en Chile',()=>{
 assert.equal(parseReminder('Reunión 05/01/2026',today).date,'2026-01-05');
 assert.equal(parseReminder('Reunión 05-01',today).date,'2027-01-05');
 assert.equal(parseReminder('Reunión 05.01.27',today).date,'2027-01-05');
 assert.equal(parseReminder('Reunión 31/02/2027',today),null);
});
test('muestra información de detección y advertencia de año debajo del botón',()=>{
 const ui=read('../src/calendar/calendar-ui.js');
 assert.ok(ui.indexOf('miNoteCalendarDetectionFeedback')>ui.indexOf('miNoteCalendarExtract'));
 assert.match(ui,/role="status" aria-live="polite"/);
 assert.match(ui,/Año calculado según la fecha actual del teléfono/);
 assert.match(ui,/feedback\.dataset\.state='success'/);
});
test('versionado Android V0.55 y parser conservan validación',()=>{
 const p=JSON.parse(read('../package.json'));
 const w=read('../../.github/workflows/android-release.yml');
 assert.ok(Number(p.version.split('.')[1])>=55);
 assert.match(w,/versionCode (?:5[5-9]|[6-9][0-9])/);
 assert.match(w,/Mi-Note-X10-Android-v0\.(?:5[5-9]|[6-9][0-9])\.apk/);
});
