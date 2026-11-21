/* Mi Note V0.60: bandeja local de compromisos. No escribe Calendar.
 * Una corrección propone revisión; nunca modifica un evento remoto a ciegas. */
import {reminderKey} from './reminder-auto.mjs';
const KEY='minote_calendar_inbox_v060',LIMIT=80;
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const id=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);

const regionBase=s=>String(s||'').replace(/-item-\d+$/,'');
const sameSource=(a,b)=>!!a.pageId&&!!b.pageId&&a.pageId===b.pageId;
const sameRegion=(a,b)=>sameSource(a,b)&&!!a.regionId&&!!b.regionId&&regionBase(a.regionId)===regionBase(b.regionId);
const core=s=>fold(s).replace(/\s+\d{1,2}$/,'');
const oneIsOcrSuffix=(a,b)=>{
 const ta=fold(a.title),tb=fold(b.title);
 return ta!==tb&&core(a.title)===core(b.title)&&core(a.title).length>=4&&
  (/ \d{1,2}$/.test(ta)||/ \d{1,2}$/.test(tb));
};
/** Reglas conservadoras: no juntar citas con horas o fechas distintas.
 * Solo corregir ausencia de hora si ambas lecturas vienen de la misma región.
 */
export function sameReminderProposal(a,b){
 if(!a?.date||a.date!==b?.date)return false;
 const timeA=a.time||'',timeB=b.time||'';
 const sameName=fold(a.title)===fold(b.title);
 if(timeA===timeB){
  if(sameName)return true;
  if(sameSource(a,b)&&oneIsOcrSuffix(a,b))return true;
  if(sameRegion(a,b)&&(a.needsTitle||b.needsTitle))return true;
 }
 if((!timeA||!timeB)&&sameName&&sameRegion(a,b))return true;
 return false;
}
function quality(e){
 return (e.time?8:0)+(!e.needsTitle?4:0)+(!e.needsReview?1:0)+
  (fold(e.title).match(/\s+\d{1,2}$/)?-1:0);
}
function statusRank(status){return status==='opened'?3:status==='dismissed'?2:1;}
function keepBetter(current,next){
 const a=statusRank(current.status),b=statusRank(next.status);
 if(a!==b)return a>b?current:next;
 if(quality(current.event)!==quality(next.event))
  return quality(current.event)>quality(next.event)?current:next;
 return current;
}
/** Reconcilia entradas antiguas al abrir la app; no modifica Calendar. */
export function deduplicateInboxRecords(records){
 const result=[];
 for(const record of records){
  const index=result.findIndex(other=>sameReminderProposal(other.event,record.event));
  if(index<0)result.push(record);
  else result[index]=keepBetter(result[index],record);
 }
 return result;
}

const publicEvent=e=>({title:String(e.title||'').slice(0,150),date:e.date,
 time:e.time||'',allDay:!!e.allDay,source:String(e.source||'').slice(0,350),
 pageId:String(e.pageId||''),regionId:String(e.regionId||''),fromImportedPage:!!e.fromImportedPage,
 needsReview:!!e.needsReview,needsTitle:!!e.needsTitle});
export function createAgendaInbox(storage){
 let rows=[];
 try{
  const data=JSON.parse(storage?.getItem(KEY)||'[]');
  if(Array.isArray(data)){
   const old=data.filter(x=>x&&x.event&&['pending','opened','dismissed'].includes(x.status)).slice(-LIMIT);
   rows=deduplicateInboxRecords(old);
   if(rows.length!==old.length){try{storage?.setItem(KEY,JSON.stringify(rows));}catch{}}
  }
 }catch{}
 const save=()=>{
  try{storage?.setItem(KEY,JSON.stringify(rows.slice(-LIMIT)));}catch{}
 };
 const all=()=>rows.filter(x=>x.status==='pending').map(x=>({...x,event:{...x.event}}));
 function add(event){
  const fingerprint=reminderKey(event);
  if(!fingerprint)return {added:false};
  const normalized=publicEvent(event);
  const match=rows.find(x=>sameReminderProposal(x.event,normalized));
  if(match){
   if(match.status==='pending'&&quality(normalized)>quality(match.event)&&
      // Un OCR incompleto no debe borrar una hora conocida.
      !(match.event.time&&!normalized.time)){
    match.event={...match.event,...normalized};
    match.updatedAt=Date.now();
    save();
    return {added:false,updated:true,duplicate:true,item:match};
   }
   return {added:false,duplicate:true,item:match};
  }
  // Reuniones iguales en dos zonas de una hoja son eventos distintos.
  // Proponer corrección SOLO si ambas lecturas proceden del mismo bloque físico.
  const same=rows.slice().reverse().find(x=>event.regionId&&x.event.regionId===event.regionId&&
   x.event.pageId&&x.event.pageId===event.pageId&&
   fold(x.event.title)===fold(event.title)&&x.event.date===event.date);
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
