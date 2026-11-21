import test from 'node:test';
import assert from 'node:assert/strict';
import {extractNaturalMeetings} from '../src/calendar/natural-meetings.mjs';
import {extractImportedReminders,noteBlocksFromBands,lineBandsFromPage,recognizeImportedPage} from '../src/calendar/import-reminders.mjs';
import {createAgendaInbox} from '../src/calendar/agenda-inbox.mjs';
import {readFileSync} from 'node:fs';
const now=new Date(2026,10,21,9);
const sheet='Reunión\n11/12\n14:00\nReunión\n11/12\n16:00';
test('caso de imagen Huion: dos reuniones en tres renglones y distintas horas',()=>{
 const events=extractNaturalMeetings(sheet,{now});
 assert.equal(events.length,2);
 assert.deepEqual(events.map(e=>e.time),['14:00','16:00']);
 assert.deepEqual(events.map(e=>e.date),['2026-12-11','2026-12-11']);
});
test('ambas reuniones se extraen al importar, con dos IDs espaciales',()=>{
 const events=extractImportedReminders(sheet,{now,regionId:'zona'});
 assert.equal(events.length,2);
 assert.notEqual(events[0].regionId,events[1].regionId);
});
test('separa dos anotaciones espacialmente distantes aunque fecha y título sean iguales',()=>{
 const row=y=>[[[10,y],[22,y+2],[30,y+3]],[[45,y],[55,y+2],[70,y+3]]];
 const bands=[row(100),row(195),row(280),row(700),row(795),row(880)];
 assert.equal(noteBlocksFromBands(bands).length,2);
});
test('reconoce títulos, fechas y horas por renglón en dos zonas físicas',async()=>{
 const ys=[100,195,280,700,795,880];
 const pairs=ys.flatMap((y,index)=>[
  {pts:[[10,y],[22,y+2],[30,y+3]],id:'a'+index},
  {pts:[[45,y],[55,y+2],[70,y+3]],id:'b'+index}
 ]);
 const page={id:'one',strokes:pairs,huion:{partial:false}};
 const transcript=['Reunión','11/12','14:00','Reunión','11/12','16:00'];
 const recognized=await recognizeImportedPage(page,async({strokes})=>{
  if(strokes.length!==2)return {text:''};
  const first=strokes[0][0][1];
  const index=ys.findIndex(y=>Math.abs(y-first)<10);
  return {text:transcript[index]||''};
 },{now});
 assert.equal(recognized.length,2);
 assert.deepEqual(recognized.map(x=>x.time),['14:00','16:00']);
 assert.notEqual(recognized[0].regionId,recognized[1].regionId);
});
test('dos reuniones del mismo día y nombre sobreviven en la bandeja',()=>{
 const memory=new Map(),store={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const inbox=createAgendaInbox(store);
 const events=extractImportedReminders(sheet,{now,regionId:'hoja'});
 for(const event of events)inbox.add({...event,pageId:'hoja123'});
 assert.equal(inbox.count(),2);
 assert.deepEqual(inbox.all().map(x=>x.event.time),['14:00','16:00']);
});
test('fecha y hora juntas proponen revisión, pero matemáticas y fecha aislada no',()=>{
 const proposed=extractNaturalMeetings('11/12\n14:00',{now});
 assert.equal(proposed.length,1);
 assert.equal(proposed[0].needsTitle,true);
 for(const note of ['11/12','Resolver 11/12 + 4 = 5','Reunión\n14:00']){
  assert.equal(extractNaturalMeetings(note,{now}).length,0,note);
 }
});
test('el OCR por bloques está conectado a escritura activa',()=>{
 const js=readFileSync(new URL('../src/calendar/calendar-ui.js',import.meta.url),'utf8');
 assert.match(js,/recognizeImportedPage\(active,args=>bridge\.recognize\(args\)\)/);
 assert.match(js,/6500\)/);
});
