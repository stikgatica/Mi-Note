import test from 'node:test';
import assert from 'node:assert/strict';
import {incrementalStrokes,createIncrementalCursor} from '../src/calendar/incremental-ink.mjs';
import {createAgendaInbox} from '../src/calendar/agenda-inbox.mjs';
import {readFileSync} from 'node:fs';

const storage=()=>{const store=new Map();return {
 getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};};
const stroke=(y,x=20)=>({pts:[[x,y],[x+20,y+2],[x+40,y+4]]});
const event=(time='09:30')=>({title:'Reunión equipo PIE',date:'2026-11-24',time,allDay:false,pageId:'hoja-1'});
test('el OCR incremental selecciona solamente el bloque reciente y su contexto cercano',()=>{
 const page={id:'a',strokes:[stroke(120),stroke(122),stroke(450),stroke(452),stroke(900)]};
 const selected=incrementalStrokes(page,4);
 assert.equal(selected.length,1);
 assert.deepEqual(selected[0][0],[20,900]);
});
test('cursor mantiene conteo por página y permite resetear',()=>{
 const cur=createIncrementalCursor(),page={id:'a',strokes:[stroke(12)]};
 assert.equal(cur.previous(page),0);
 cur.commit(page);assert.equal(cur.previous(page),1);
 cur.reset('a');assert.equal(cur.previous(page),0);
});
test('bandeja persiste tras reiniciar y descarta propuestas repetidas',()=>{
 const st=storage(),inbox=createAgendaInbox(st);
 assert.equal(inbox.add(event()).added,true);
 assert.equal(inbox.add(event()).added,false);
 assert.equal(createAgendaInbox(st).count(),1);
 const id=inbox.all()[0].id;
 inbox.setStatus(id,'dismissed');
 assert.equal(createAgendaInbox(st).count(),0);
 assert.equal(createAgendaInbox(st).add(event()).added,false);
});
test('reconoce posible corrección de hora en la misma fecha y hoja',()=>{
 const inbox=createAgendaInbox(storage());
 inbox.add(event('09:30'));inbox.add(event('11:00'));
 const items=inbox.all();
 assert.equal(items.length,1);
 assert.equal(items[0].event.time,'11:00');
 assert.equal(items[0].event.previousTime,'09:30');
 assert.equal(items[0].event.possibleCorrection,true);
});
test('tras abrir Calendar, solo propone cambio; no edita ni duplica el evento remoto',()=>{
 const inbox=createAgendaInbox(storage());
 inbox.add(event());inbox.setStatus(inbox.all()[0].id,'opened');
 const result=inbox.add(event('11:00'));
 assert.equal(result.correction,true);
 assert.equal(inbox.all()[0].event.previousStatus,'opened');
});
test('una reunión de otra hoja no se confunde con una corrección',()=>{
 const inbox=createAgendaInbox(storage());
 inbox.add(event());
 inbox.add({...event('11:00'),pageId:'hoja-2'});
 assert.equal(inbox.count(),2);
});
test('el reconocimiento silencioso y la bandeja están conectados en la interfaz',()=>{
 const ui=readFileSync(new URL('../src/calendar/calendar-ui.js',import.meta.url),'utf8');
 assert.match(ui,/incrementalStrokes/);
 assert.match(ui,/createAgendaInbox/);
 assert.match(ui,/miNoteCalendarInboxDialog/);
 assert.match(ui,/enqueueImportedSuggestion/);
 assert.match(ui,/possibleCorrection/);
 assert.match(ui,/agendaInbox\.add/);
 assert.match(ui,/bridge\.openCalendar/);
});
