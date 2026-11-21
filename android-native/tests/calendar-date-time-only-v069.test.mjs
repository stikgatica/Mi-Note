import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractNaturalMeetings} from '../src/calendar/natural-meetings.mjs';
import {extractImportedReminders,recognizeImportedPage,noteBlocksFromBands,lineBandsFromPage} from '../src/calendar/import-reminders.mjs';
import {createAgendaInbox} from '../src/calendar/agenda-inbox.mjs';
const now=new Date(2026,10,21,15);
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('15/12 con 18:00 en el renglón siguiente se propone aunque el título falle',()=>{
 const e=extractNaturalMeetings('Taler\n15/12\n18:00',{now});
 assert.equal(e.length,1,JSON.stringify(e));
 assert.equal(e[0].date,'2026-12-15');
 assert.equal(e[0].time,'18:00');
 assert.equal(e[0].title,'Recordatorio por revisar');
 assert.equal(e[0].needsTitle,true);
 assert.equal(e[0].needsReview,true);
 assert.equal(e[0].confidence,'date-time-only');
 assert.match(e[0].source,/Taler/);
});
test('dos grupos y solo una palabra reconocida aún dan dos sugerencias',()=>{
 const e=extractImportedReminders('Reunión\n15/11\n14:00\nTaler\n15/12\n18:00',{now});
 assert.equal(e.length,2,JSON.stringify(e));
 assert.deepEqual(e.map(x=>[x.date,x.time]),[['2027-11-15','14:00'],['2026-12-15','18:00']]);
 assert.equal(e[0].title,'Reunión');
 assert.equal(e[1].needsTitle,true);
});
test('no inventa fecha/hora con líneas sueltas ni cálculos',()=>{
 for(const bad of ['15/12','18:00','15/12\n2+2=4','2+2=4\n15/12\n18:00','15/12\n25:30',
  '15/12\n99:99','15/12\n\n18:00 + 2','18:00\n15/12']){
  const result=extractNaturalMeetings(bad,{now});
  assert.equal(result.length,0,bad+' -> '+JSON.stringify(result));
 }
});
test('una nota con título válido y fecha/hora no produce duplicado genérico',()=>{
 const events=extractImportedReminders('Taller\n15/12\n18:00',{now});
 assert.equal(events.length,1,JSON.stringify(events));
 assert.equal(events[0].title,'Taller');
 assert.equal(!!events[0].needsTitle,false);
});
test('OCR por región permite un título ilegible pero fecha+hora reconocidas',async()=>{
 const rows=[
  {y:110,text:'Reunión'},{y:190,text:'15/11'},{y:270,text:'14:00'},
  {y:710,text:'Tqler'},{y:790,text:'15/12'},{y:870,text:'18:00'}
 ];
 const strokes=rows.flatMap((r,i)=>[0,1].map(n=>({
  id:'row'+i+'-'+n,pts:[[20+n*35,r.y],[25+n*35,r.y+5],[30+n*35,r.y+2]]
 })));
 assert.equal(noteBlocksFromBands(lineBandsFromPage(strokes)).length,2);
 const result=await recognizeImportedPage({id:'page-1',strokes},async({strokes:input})=>{
  const y=input.reduce((sum,pts)=>sum+pts[0][1],0)/input.length;
  const row=rows.find(r=>Math.abs(y-r.y)<15);
  return {text:row?.text||'texto inconexo'};
 },{now});
 assert.equal(result.length,2,JSON.stringify(result));
 assert.deepEqual(result.map(x=>x.time),['14:00','18:00']);
 assert.equal(result[1].needsTitle,true);
});
test('la bandeja retiene la obligación de completar motivo',()=>{
 const storage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);}};
 const inbox=createAgendaInbox(storage);
 const e=extractNaturalMeetings('15/12\n18:00',{now})[0];
 assert.equal(inbox.add(e).added,true);
 assert.equal(inbox.all()[0].event.needsTitle,true);
});
test('Calendar no puede abrir un recordatorio sin título y la UI ofrece completar',()=>{
 const ui=read('../src/calendar/calendar-ui.js');
 assert.match(ui,/eventTitle\.value=event\.needsTitle\?'':event\.title/);
 assert.match(ui,/makeButton\('Completar motivo'/);
 assert.match(ui,/eventTitle\.value=extracted\[0\]\.needsTitle\?'':extracted\[0\]\.title/);
 assert.match(ui,/calendarDraftIsValid\(proposal\)/);
});
