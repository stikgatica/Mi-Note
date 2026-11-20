import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseReminder,calendarDraftIsValid} from '../src/calendar/reminder-parser.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const now=new Date(2026,10,19,12);
test('extrae reunión con fecha escrita en español y hora',()=>{
 const r=parseReminder('Reunión de docentes 25 de noviembre de 2026 a las 15:30',now);
 assert.equal(r.date,'2026-11-25');
 assert.equal(r.time,'15:30');
 assert.match(r.title,/Reunión de docentes/);
 assert.equal(r.allDay,false);
});
test('reconoce fecha chilena y preserva encabezado editable',()=>{
 const r=parseReminder('Consejo Escolar 25/11/2026 14:00',now);
 assert.equal(r.date,'2026-11-25');
 assert.equal(r.time,'14:00');
 assert.match(r.title,/Consejo Escolar/);
});
test('fecha sin hora se propone como todo el día',()=>{
 const r=parseReminder('Recordatorio: entregar documentos 28-11-2026',now);
 assert.equal(r.date,'2026-11-28');
 assert.equal(r.allDay,true);
 assert.equal(r.title,'entregar documentos');
});
test('fecha imposible nunca se propone y el año inferido se advierte',()=>{
 assert.equal(parseReminder('Reunión 31/02/2026',now),null);
 const result=parseReminder('Encuentro 03 de enero',now);
 assert.equal(result.date,'2027-01-03');
 assert.equal(result.yearExplicit,false);
});
test('palabras relativas se resuelven en el día local',()=>{
 assert.equal(parseReminder('Revisar proyecto mañana a las 8:15',now)?.date,'2026-11-20');
 assert.equal(parseReminder('Enviar acta pasado mañana',now)?.date,'2026-11-21');
});
test('no genera eventos si no hay fecha y exige título válido',()=>{
 assert.equal(parseReminder('Reunión de coordinación',now),null);
 assert.equal(calendarDraftIsValid({title:'',date:'2026-11-25',time:'15:30'}),false);
 assert.equal(calendarDraftIsValid({title:'Reunión',date:'2026-02-31',allDay:true}),false);
 assert.equal(calendarDraftIsValid({title:'Reunión',date:'2026-11-25',time:'15:30'}),true);
});
test('interfaz exige revisión, opt-in y escritura local',()=>{
 const ui=read('../src/calendar/calendar-ui.js'),plugin=read('../native-backup/MiNoteCalendarPlugin.java');
 const setup=read('../native-backup/setup.mjs'),workflow=read('../../.github/workflows/android-release.yml');
 assert.match(ui,/miNoteCalendarAuto/);
 assert.match(ui,/miNoteCalendarOpen/);
 assert.match(ui,/miNoteCalendarExtract/);
 assert.match(ui,/bridge\.recognize/);
 assert.match(ui,/bridge\.openCalendar/);
 assert.match(ui,/localStorage\.getItem\('minote_calendar_auto_v054'\)!=='0'/);
 assert.match(plugin,/DigitalInkRecognitionModelIdentifier/);
 assert.match(plugin,/Intent\.ACTION_INSERT/);
 assert.match(plugin,/CalendarContract\.EXTRA_EVENT_BEGIN_TIME/);
 assert.match(setup,/registerPlugin\(MiNoteCalendarPlugin\.class\)/);
 assert.match(setup,/digital-ink-recognition:19\.0\.0/);
 assert.match(workflow,/versionCode (?:5[4-9]|[6-9][0-9])/);
 assert.doesNotMatch(plugin,/CalendarContract\.Calendars\.CONTENT_URI/);
});
