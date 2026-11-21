import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectStarMarkers,starredPageGroups} from '../src/calendar/star-layout.mjs';
import {structuredRowMeetings,recognizeImportedPage} from '../src/calendar/import-reminders.mjs';
import {hasBinaryArithmetic,fuseMathCandidates,enclosedMathAnnotation,recognizeHybridLine} from '../src/math/math-hybrid-ocr.mjs';
const now=new Date(2026,10,21,12);
const pen=(id,x,y,dx=10,dy=20)=>({id,pts:[[x,y],[x+dx,y+dy],[x+dx+2,y+dy+2]]});
const star=(p,x,y)=>[
 {id:p+'a',pts:[[x,y],[x+19,y+25]]},
 {id:p+'b',pts:[[x+19,y],[x,y+25]]},
 {id:p+'c',pts:[[x-1,y+13],[x+20,y+13]]}
];
const notes=[
 {title:'Reunión Apoderados',date:'12/12',time:'14:00',y:100},
 {title:'Taller 1',date:'15/12',time:'16:00',y:420},
 {title:'Médico',date:'21/12',time:'14:00',y:740}
];
test('detecta tres asteriscos manuscritos sin OCR del símbolo',()=>{
 const strokes=notes.flatMap((n,i)=>[
  ...star('star'+i,25,n.y),
  pen('title'+i+'a',88,n.y),pen('title'+i+'b',120,n.y),
  pen('date'+i+'a',110,n.y+75),pen('date'+i+'b',135,n.y+75),
  pen('time'+i+'a',110,n.y+150),pen('time'+i+'b',135,n.y+150)
 ]);
 assert.equal(detectStarMarkers(strokes).length,3);
 const groups=starredPageGroups(strokes);
 assert.equal(groups.length,3);
 assert.equal(groups.every(g=>g.strokes.length===6),true);
 assert.equal(new Set(groups.map(g=>g.regionId)).size,3);
});
test('título, fecha y hora en la misma fila se detectan por separado',()=>{
 const events=structuredRowMeetings([['* Reunión Apoderados 12/12 14:00']],{now,starred:true});
 assert.equal(events.length,0,'una fila sola sigue exigiendo al menos dos filas por seguridad');
 const two=structuredRowMeetings([['* Reunión Apoderados 12/12'],['14:00']],{now,starred:true});
 assert.deepEqual(two.map(e=>[e.title,e.date,e.time]),[['Reunión Apoderados','2026-12-12','14:00']]);
 const side=structuredRowMeetings([['Taller 1'],['15/12   16:00']],{now,starred:true});
 assert.deepEqual(side.map(e=>[e.title,e.date,e.time]),[['Taller 1','2026-12-15','16:00']]);
});
test('título genérico Médico se acepta solo dentro de un bloque con asterisco',()=>{
 const rows=[['Médico'],['21/12'],['14:00']];
 const withMarker=structuredRowMeetings(rows,{now,starred:true});
 const withoutMarker=structuredRowMeetings(rows,{now,starred:false});
 assert.equal(withMarker[0].title,'Médico');
 assert.equal(withMarker[0].needsTitle,false);
 assert.equal(withoutMarker[0].needsTitle,true);
});
test('varios formatos con números a la derecha no mezclan compromisos',()=>{
 const a=structuredRowMeetings([
  ['Reunión Apoderados   12/12'],['14:00'],
  ['Taller 1'],['15/12   16:00'],
  ['Médico'],['21/12'],['14:00']
 ],{now,starred:true,regionId:'star-0'});
 assert.deepEqual(a.map(e=>[e.title,e.date,e.time]),[
  ['Reunión Apoderados','2026-12-12','14:00'],
  ['Taller 1','2026-12-15','16:00'],
  ['Médico','2026-12-21','14:00']]);
});
test('los asteriscos separan automáticamente eventos próximos de una página',async()=>{
 const strokes=[],map=new Map();
 for(let i=0;i<notes.length;i++){
  const n=notes[i];
  strokes.push(...star('star-'+i,25,n.y));
  for(const [j,text] of [n.title,n.date,n.time].entries()){
   const yy=n.y+j*75;
   strokes.push(pen('row'+i+j+'a',88,yy),pen('row'+i+j+'b',115,yy));
   map.set(yy,text);
  }
 }
 const items=await recognizeImportedPage({id:'agenda-x10',strokes},async({strokes:input})=>{
  const avg=input.reduce((v,p)=>v+p[0][1],0)/input.length;
  for(const [y,text] of map)if(Math.abs(avg-y)<18)return{text,candidates:[text]};
  return{text:'texto global incorrecto'};
 },{now});
 assert.deepEqual(items.map(e=>[e.title,e.date,e.time]),[
  ['Reunión Apoderados','2026-12-12','14:00'],
  ['Taller 1','2026-12-15','16:00'],
  ['Médico','2026-12-21','14:00']]);
});
test('filtro matemático: sin operador binario no se ofrece número aislado ni círculo',async()=>{
 for(const raw of ['55','22','5','-4','=', '-20']){
  assert.equal(hasBinaryArithmetic(raw),false,raw);
  assert.equal(fuseMathCandidates({mlCandidates:[raw],localText:''}),null);
 }
 for(const raw of ['7+5=','24:7=','54-20=']){
  assert.equal(hasBinaryArithmetic(raw),true,raw);
  assert.ok(fuseMathCandidates({mlCandidates:[raw]}));
 }
 const ring={id:'circle',pts:Array.from({length:25},(_,i)=>{
   const a=Math.PI*2*i/24;return [100+70*Math.cos(a),100+70*Math.sin(a)];
 })};
 const number=pen('five',90,90,8,15);
 assert.equal(enclosedMathAnnotation([ring,number]),true);
 const proposed=await recognizeHybridLine([ring,number],async()=>({candidates:['5+2=']}));
 assert.equal(proposed,null);
});
test('operaciones reales de la imagen tienen preferencia sobre números sueltos',()=>{
 const x=fuseMathCandidates({mlCandidates:['55','7+5=','7+5'],localText:''});
 assert.equal(x.text,'7+5=');
 const y=fuseMathCandidates({mlCandidates:['22','24:7='],localText:''});
 assert.equal(y.text,'24÷7=');
 const z=fuseMathCandidates({mlCandidates:['54-20='],localText:''});
 assert.equal(z.text,'54-20=');
});
test('implementación conserva tinta, no resuelve y no crea eventos automáticamente',()=>{
 const math=readFileSync(new URL('../src/math/math-hybrid-ocr.mjs',import.meta.url),'utf8');
 const calendar=readFileSync(new URL('../src/calendar/import-reminders.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(math,/\beval\s*\(/);
 assert.match(calendar,/starredPageGroups/);
 assert.doesNotMatch(calendar,/openCalendar|clearDeviceCache/);
});
