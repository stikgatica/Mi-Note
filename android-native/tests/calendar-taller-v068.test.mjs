import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {autoReminderCandidate} from '../src/calendar/reminder-auto.mjs';
import {extractImportedReminders,recognizeImportedPage,lineBandsFromPage,noteBlocksFromBands} from '../src/calendar/import-reminders.mjs';
const now=new Date(2026,10,21,15);
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Taller 15/12 18:00 es compromiso escolar legítimo',()=>{
 const event=autoReminderCandidate('Taller 15/12 18:00',{now});
 assert.ok(event);
 assert.deepEqual([event.title,event.date,event.time],['Taller','2026-12-15','18:00']);
});
test('dos recordatorios de la captura permanecen separados',()=>{
 const events=extractImportedReminders('Reunión\n15/11\n14:00\nTaller\n15/12\n18:00',{now});
 assert.equal(events.length,2,JSON.stringify(events));
 assert.deepEqual(events.map(e=>[e.title,e.date,e.time]),[
  ['Reunión','2027-11-15','14:00'],['Taller','2026-12-15','18:00']
 ]);
});
test('recupera Taller si ML Kit lo propone como alternativa al título fallido',async()=>{
 const rows=[{y:100,text:'Reunión'},{y:190,text:'15/11'},{y:280,text:'14:00'},
  {y:710,text:'Taler',alternatives:['Taller']},{y:800,text:'15/12'},
  {y:890,text:'18:00'}];
 const strokes=rows.flatMap((r,i)=>[0,1].map(n=>({
  id:'row-'+i+'-'+n,pts:[[20+n*30,r.y],[30+n*30,r.y+3],[40+n*30,r.y+4]]
 })));
 const bands=lineBandsFromPage(strokes);
 assert.equal(bands.length,6);
 assert.equal(noteBlocksFromBands(bands).length,2);
 const result=await recognizeImportedPage({id:'pagina-1',strokes},async({strokes:input})=>{
  const y=input.reduce((sum,stroke)=>sum+stroke[0][1],0)/input.length;
  const row=rows.find(r=>Math.abs(r.y-y)<15);
  return row?{text:row.text,candidates:[row.text,...(row.alternatives||[])]}
   :{text:'mezcla incorrecta 15/11 18:00'};
 },{now});
 assert.deepEqual(result.map(e=>[e.title,e.date,e.time]),[
  ['Reunión','2027-11-15','14:00'],['Taller','2026-12-15','18:00']
 ]);
});
test('la app muestra varias opciones separadas y señala año inferido',()=>{
 const ui=read('../src/calendar/calendar-ui.js');
 assert.match(ui,/showDetectedEvents\(extracted\)/);
 assert.match(ui,/miNoteCalendarDetectedList/);
});
