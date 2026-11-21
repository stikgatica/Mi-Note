import test from 'node:test';
import assert from 'node:assert/strict';
import {structuredRowMeeting,structuredRowMeetings,recognizeImportedPage,noteBlocksFromBands,lineBandsFromPage} from '../src/calendar/import-reminders.mjs';
import {extractImportedReminders} from '../src/calendar/import-reminders.mjs';
const now=new Date(2026,10,21,12);
const notes=[
 {title:'Reunión',day:'22/12',time:'14:00',date:'2026-12-22'},
 {title:'Taller',day:'12/12',time:'12:00',date:'2026-12-12'},
 {title:'Apoderado',day:'5/12',time:'16:00',date:'2026-12-05'}
];
test('la hoja manuscrita de tres compromisos preserva cada fecha y hora',()=>{
 const events=structuredRowMeetings(notes.flatMap(e=>[[e.title],[e.day],[e.time]]),{now,regionId:'region-0'});
 assert.deepEqual(events.map(e=>[e.title,e.date,e.time]),notes.map(e=>[e.title,e.date,e.time]));
 assert.equal(events.every(e=>e.allDay===false),true);
 assert.equal(new Set(events.map(e=>e.regionId)).size,3);
});
test('Apoderado se reconoce como título legítimo con fecha y hora',()=>{
 const one=extractImportedReminders('Apoderado\n5/12\n16:00',{now});
 assert.equal(one.length,1,JSON.stringify(one));
 assert.deepEqual([one[0].title,one[0].date,one[0].time],['Apoderado','2026-12-05','16:00']);
});
test('OCR alternativo rescata título y números de hora similares a letras',()=>{
 const rows=[['A poderado','Apoderado'],['5/12'],['16:OO','16:00']];
 const e=structuredRowMeeting(rows,{now,regionId:'region-2'});
 assert.ok(e);
 assert.deepEqual([e.title,e.date,e.time],['Apoderado','2026-12-05','16:00']);
 assert.equal(e.allDay,false);
});
test('si falla el título se conserva fecha y hora sin inventar un nombre',()=>{
 const e=structuredRowMeeting([['Tqler'],['5/12'],['16:00']],{now});
 assert.equal(e.title,'Recordatorio por revisar');
 assert.equal(e.needsTitle,true);
 assert.equal(e.allDay,false);
});
test('no crea reuniones desde fechas aisladas u horas inválidas',()=>{
 for(const rows of [
  [['Reunión'],['22/12'],['25:00']],
  [['Reunión'],['22/12']],
  [['Reunión'],['2+2=4'],['14:00']],
  [['Reunión'],['32/12'],['14:00']]
 ])assert.deepEqual(structuredRowMeetings(rows,{now}),[]);
});
test('el OCR de trazos en tres regiones no genera reuniones fantasma de todo el día',async()=>{
 const coordinates=[100,170,240,470,540,610,850,920,990];
 const words=notes.flatMap(n=>[n.title,n.day,n.time]);
 const strokes=coordinates.flatMap((y,i)=>[0,1,2].map(j=>({
  id:'r'+i+'-'+j,
  pts:[[20+j*19,y],[24+j*19,y+2],[29+j*19,y+3]]
 })));
 const bands=lineBandsFromPage(strokes);
 assert.equal(bands.length,9);
 assert.equal(noteBlocksFromBands(bands).length,3);
 const calls=[];
 const recognized=await recognizeImportedPage({id:'x10',strokes},async({strokes:input})=>{
  const y=input.reduce((sum,stroke)=>sum+stroke[0][1],0)/input.length;
  const index=coordinates.findIndex(ry=>Math.abs(ry-y)<12);
  calls.push(index);
  if(index<0)return{text:'22/12 Reunión todo el día'};
  return {text:words[index],candidates:[words[index]]};
 },{now});
 assert.deepEqual(recognized.map(e=>[e.title,e.date,e.time]),notes.map(e=>[e.title,e.date,e.time]));
 assert.equal(recognized.every(e=>!e.allDay),true);
 assert.equal(calls.every(i=>i>=0),true,'no debe usar OCR global que mezcle bloques');
});
test('si las nueve filas quedan agrupadas en un solo bloque, aún reconoce tres parejas',()=>{
 const rows=notes.flatMap(e=>[[e.title],[e.day],[e.time]]);
 assert.equal(structuredRowMeetings(rows,{now,regionId:'region-0'}).length,3);
});
