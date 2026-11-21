import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAgendaInbox,sameReminderProposal,deduplicateInboxRecords} from '../src/calendar/agenda-inbox.mjs';
const makeStore=()=>{const data=new Map();return{data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}};
const base={title:'Taller',date:'2026-11-29',time:'14:00',allDay:false,pageId:'hoja-huion-1',regionId:'region-1-item-0'};
test('mismo evento tras 5 OCR no vuelve a la bandeja',()=>{
 const store=makeStore(),inbox=createAgendaInbox(store);
 assert.equal(inbox.add(base).added,true);
 for(let i=0;i<5;i++)assert.equal(inbox.add({...base}).added,false);
 assert.equal(inbox.count(),1);
 assert.equal(createAgendaInbox(store).count(),1);
});
test('Taller 12 con misma fecha/hora y página se fusiona con Taller',()=>{
 const inbox=createAgendaInbox(makeStore());
 inbox.add({...base,title:'Taller 12'});
 const result=inbox.add({...base,title:'Taller'});
 assert.equal(result.added,false);
 assert.equal(result.updated,true);
 assert.equal(inbox.count(),1);
 assert.equal(inbox.all()[0].event.title,'Taller');
 assert.equal(inbox.add({...base,title:'Taller 12'}).added,false);
});
test('de todo el día a hora concreta en la misma región: mejor OCR actualiza sin duplicar',()=>{
 const inbox=createAgendaInbox(makeStore());
 inbox.add({...base,time:'',allDay:true});
 const result=inbox.add({...base});
 assert.equal(result.added,false);
 assert.equal(result.updated,true);
 assert.equal(inbox.all()[0].event.time,'14:00');
 assert.equal(inbox.all()[0].event.allDay,false);
 assert.equal(inbox.add({...base,time:'',allDay:true}).updated,undefined);
 assert.equal(inbox.all()[0].event.time,'14:00');
});
test('horas distintas no se unen si son reuniones reales de la misma fecha en regiones diferentes',()=>{
 const inbox=createAgendaInbox(makeStore());
 inbox.add({...base,title:'Reunión',date:'2026-12-12',time:'14:00',regionId:'region-0-item-0'});
 inbox.add({...base,title:'Reunión',date:'2026-12-12',time:'16:00',regionId:'region-1-item-0'});
 assert.equal(inbox.count(),2);
});
test('fechas distintas o páginas distintas con ruido OCR no se fusionan',()=>{
 assert.equal(sameReminderProposal(base,{...base,date:'2026-12-12'}),false);
 assert.equal(sameReminderProposal(base,{...base,pageId:'hoja-2',title:'Taller 12'}),false);
 const inbox=createAgendaInbox(makeStore());
 inbox.add(base);
 inbox.add({...base,date:'2026-12-12',time:'',allDay:true});
 assert.equal(inbox.count(),2);
});
test('propuesta ya abierta o descartada no vuelve a agregarse tras escanear',()=>{
 const store=makeStore(),inbox=createAgendaInbox(store);
 inbox.add({...base});
 const id=inbox.all()[0].id;
 inbox.setStatus(id,'opened');
 assert.equal(inbox.add({...base,title:'Taller 12'}).added,false);
 assert.equal(createAgendaInbox(store).count(),0);
});
test('reconciliación al iniciar conserva entrada mejor y estado descartado',()=>{
 const same1={id:'a',status:'pending',event:{...base,title:'Taller 12'},createdAt:1};
 const same2={id:'b',status:'pending',event:{...base,title:'Taller'},createdAt:2};
 const found=deduplicateInboxRecords([same1,same2]);
 assert.equal(found.length,1);assert.equal(found[0].event.title,'Taller');
 const status=deduplicateInboxRecords([same2,{...same1,status:'dismissed'}]);
 assert.equal(status.length,1);assert.equal(status[0].status,'dismissed');
});
test('la bandeja aplica deduplicación a entradas antiguas al iniciar',()=>{
 const store=makeStore();
 store.setItem('minote_calendar_inbox_v060',JSON.stringify([
  {id:'a',status:'pending',event:{...base,title:'Taller 12'},createdAt:1},
  {id:'b',status:'pending',event:{...base,title:'Taller'},createdAt:2}
 ]));
 const inbox=createAgendaInbox(store);
 assert.equal(inbox.count(),1);
 assert.equal(inbox.all()[0].event.title,'Taller');
 assert.equal(JSON.parse(store.getItem('minote_calendar_inbox_v060')).length,1);
});
test('eliminación de duplicados solo afecta las propuestas locales, no Calendar ni notas',()=>{
 const src=readFileSync(new URL('../src/calendar/agenda-inbox.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/openCalendar|deletePage|clearDeviceCache/);
});
