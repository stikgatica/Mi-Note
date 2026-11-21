/* Mi Note V0.60: bandeja local de compromisos. No escribe Calendar.
 * Una corrección propone revisión; nunca modifica un evento remoto a ciegas. */
import {reminderKey} from './reminder-auto.mjs';
const KEY='minote_calendar_inbox_v060',LIMIT=80;
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const id=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const publicEvent=e=>({title:String(e.title||'').slice(0,150),date:e.date,
 time:e.time||'',allDay:!!e.allDay,source:String(e.source||'').slice(0,350),
 pageId:String(e.pageId||''),regionId:String(e.regionId||''),fromImportedPage:!!e.fromImportedPage,
 needsReview:!!e.needsReview,needsTitle:!!e.needsTitle});
export function createAgendaInbox(storage){
 let rows=[];
 try{
  const data=JSON.parse(storage?.getItem(KEY)||'[]');
  if(Array.isArray(data))rows=data.filter(x=>x&&x.event&&['pending','opened','dismissed'].includes(x.status)).slice(-LIMIT);
 }catch{}
 const save=()=>{
  try{storage?.setItem(KEY,JSON.stringify(rows.slice(-LIMIT)));}catch{}
 };
 const all=()=>rows.filter(x=>x.status==='pending').map(x=>({...x,event:{...x.event}}));
 function add(event){
  const fingerprint=reminderKey(event);
  if(!fingerprint)return {added:false};
  const match=rows.find(x=>reminderKey(x.event)===fingerprint);
  if(match)return {added:false,duplicate:true,item:match};
  // Reuniones iguales en dos zonas de una hoja son eventos distintos.
  // Proponer corrección SOLO si ambas lecturas proceden del mismo bloque físico.
  const same=rows.slice().reverse().find(x=>event.regionId&&x.event.regionId===event.regionId&&
   x.event.pageId&&x.event.pageId===event.pageId&&
   fold(x.event.title)===fold(event.title)&&x.event.date===event.date);
  const normalized=publicEvent(event);
  if(same){
   const revision={...same.event};
   const change={...normalized,possibleCorrection:true,
    previousTime:revision.time,previousStatus:same.status};
   if(same.status==='pending'){
    same.event=change;same.updatedAt=Date.now();save();
    return {added:false,updated:true,item:same};
   }
   // Una propuesta que ya se abrió en Calendar no se actualiza silenciosamente.
   const record={id:id(),status:'pending',event:change,createdAt:Date.now()};
   rows.push(record);rows=rows.slice(-LIMIT);save();return {added:true,correction:true,item:record};
  }
  const record={id:id(),status:'pending',event:normalized,createdAt:Date.now()};
  rows.push(record);rows=rows.slice(-LIMIT);save();return {added:true,item:record};
 }
 function setStatus(itemId,status){
  if(!['opened','dismissed'].includes(status))return false;
  const item=rows.find(x=>x.id===itemId);
  if(!item)return false;
  item.status=status;item.updatedAt=Date.now();save();return true;
 }
 return {add,all,setStatus,count:()=>all().length,
  get:itemId=>rows.find(x=>x.id===itemId)||null};
}
