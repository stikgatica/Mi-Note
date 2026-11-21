import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractImportedReminders,recognizeImportedPage,noteBlocksFromBands,lineBandsFromPage} from '../src/calendar/import-reminders.mjs';
import {autoReminderCandidate} from '../src/calendar/reminder-auto.mjs';
const now=new Date(2026,10,21,12);
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Acto 1/12 10:00 es un compromiso válido, no se excluye por ser título corto',()=>{
 const e=autoReminderCandidate('Acto 1/12 10:00',{now});
 assert.ok(e);
 assert.equal(e.title,'Acto');
 assert.equal(e.date,'2026-12-01');
 assert.equal(e.time,'10:00');
});
test('la hoja con Reunión y Acto separados devuelve exactamente dos fechas y horarios',()=>{
 const src='Reunión\n12/12\n16:00\nActo\n1/12\n10:00';
 const events=extractImportedReminders(src,{now});
 assert.equal(events.length,2,JSON.stringify(events));
 assert.deepEqual(events.map(e=>[e.title,e.date,e.time]),[
  ['Reunión','2026-12-12','16:00'],
  ['Acto','2026-12-01','10:00']]);
});
test('la segmentación espacial separa 2 notas de 3 filas sin combinar horarios',async()=>{
 const rows=[{y:100,text:'Reunión'},{y:180,text:'12/12'},{y:260,text:'16:00'},
  {y:670,text:'Acto'},{y:750,text:'1/12'},{y:830,text:'10:00'}];
 const strokes=rows.flatMap((row,i)=>[0,1].map((n)=>({
  id:'s'+i+'-'+n,pts:[[10+n*30,row.y],[15+n*30,row.y+4],[20+n*30,row.y+3]]
 })));
 const bands=lineBandsFromPage(strokes);
 assert.equal(bands.length,6);
 assert.equal(noteBlocksFromBands(bands).length,2);
 const recognized=[];
 const events=await recognizeImportedPage({id:'pagina-X10',strokes},async({strokes})=>{
  const medianY=strokes.reduce((acc,pts)=>acc+pts[0][1],0)/strokes.length;
  const row=rows.find(x=>Math.abs(x.y-medianY)<15);
  const text=row?.text||'texto OCR de bloque con hora equivocada 10:00';
  recognized.push({medianY,text});
  return {text,candidates:[text]};
 },{now});
 assert.deepEqual(events.map(e=>[e.title,e.date,e.time]),[
  ['Reunión','2026-12-12','16:00'],
  ['Acto','2026-12-01','10:00']
 ]);
 assert.equal(recognized.filter(r=>r.text.includes('equivocada')).length,0,
  'Con las filas válidas no debe efectuarse OCR combinado');
});
test('no se inventan compromisos por fecha aislada o ejercicio matemático',()=>{
 assert.deepEqual(extractImportedReminders('1/12\n10:00\n2+2=4',{now}),[]);
});
test('la interfaz permite seleccionar cada compromiso sin abrir Calendar ni cambiar tinta',()=>{
 const ui=read('../src/calendar/calendar-ui.js');
 assert.match(ui,/miNoteCalendarDetectedList/);
 assert.match(ui,/showDetectedEvents\(extracted\)/);
 assert.match(ui,/button\.addEventListener\('click'/);
 assert.match(ui,/eventTitle\.value=event\.title/);
 assert.match(ui,/date\.value=event\.date/);
 assert.match(ui,/time\.value=event\.time/);
});
