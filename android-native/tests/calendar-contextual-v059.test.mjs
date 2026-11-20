import test from 'node:test';
import assert from 'node:assert/strict';
import {extractContextualAgenda} from '../src/calendar/agenda-context.mjs';
import {extractImportedReminders} from '../src/calendar/import-reminders.mjs';
const now=new Date(2026,10,20,10);
test('agenda manuscrita hereda mes, día y horario a varias reuniones',()=>{
 const page=['NOVIEMBRE 2026','Martes 24','09:30 Reunión equipo PIE',
  'Revisar evaluaciones pendientes','Miércoles 25','Consejo Escolar 15:30',
  'Viernes 27','Entregar informe de asistencia'].join('\n');
 const list=extractContextualAgenda(page,{now});
 assert.equal(list.length,3);
 assert.deepEqual(list.map(x=>x.date),['2026-11-24','2026-11-25','2026-11-27']);
 assert.deepEqual(list.map(x=>x.time),['09:30','15:30','']);
});
test('sin encabezado de mes no inventa fecha para martes 24',()=>{
 assert.deepEqual(extractContextualAgenda('Martes 24\nReunión equipo PIE 09:30',{now}),[]);
});
test('un encabezado incompatible invalida la fecha heredada',()=>{
 assert.deepEqual(extractContextualAgenda('NOVIEMBRE 2026\nMartes 25\nReunión 09:30',{now}),[]);
});
test('respeta fecha explícita, omite matemáticas y no duplica renglones',()=>{
 const page='NOVIEMBRE 2026\nMartes 24\nReunión PIE 09:30\nReunión PIE 09:30\nResolver 15/12 + 3 = 6\nCita médica 05/01 10:00';
 const events=extractContextualAgenda(page,{now});
 assert.equal(events.length,2);
 assert.deepEqual(events.map(x=>x.date),['2026-11-24','2027-01-05']);
});
test('la extracción original también interpreta bloques contextuales',()=>{
 const events=extractImportedReminders('NOVIEMBRE 2026\nMartes 24\nReunión equipo PIE 09:30',{now});
 assert.equal(events.length,1);
 assert.equal(events[0].date,'2026-11-24');
});
test('no utiliza fechas relativas de páginas antiguas',()=>{
 const events=extractContextualAgenda('Reunión de apoderados el jueves 09:30',
  {now,pageDate:new Date(2025,3,2)});
 assert.equal(events.length,0);
});
test('no propone fechas si está activo Modo Matemática',()=>{
 assert.deepEqual(extractContextualAgenda('NOVIEMBRE 2026\nMartes 24\nReunión 09:30',{now,mathMode:true}),[]);
});
