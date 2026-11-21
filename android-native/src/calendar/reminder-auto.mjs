/* Reconocimiento conservador de INTENCIÓN de agenda.
 * No basta una fecha suelta ni una fórmula matemática.
 * No se lee Google Calendar: evita duplicar SUGERENCIAS locales, no eventos remotos. */
import {parseReminder,calendarDraftIsValid} from './reminder-parser.mjs';

const signal=/\b(recordatorio|recordar|recuerda|reunion|reunirme|acto|taller|apoderado|apoderada|apoderados|actividad escolar|cita|consulta|medica|medico|control|doctor|dentista|entrevista|consejo escolar|capacitacion|ceremonia|acto escolar|evento|cumpleanos|aniversario|evaluacion de desempeno|vencimiento|plazo|entregar|entrega|presentacion|audiencia|tramite|turno|pago|pagar|matricula|inscripcion|agendar|agenda|reservar|reserva)\b/;
const mathVocabulary=/\b(ejercicio|matematica|calcular|resuelve|resolver|ecuacion|fraccion|porcentaje|cuartil|percentil|grafico|problema|triangulo|cuadrado|perimetro|area|division|multiplicacion|potencia|factorizar|probabilidad|datos)\b/;
const mathSymbols=/[=×÷∑√≠≤≥±]|\b\d+\s*[-+*]\s*\d+\s*=/;
const yearsOrDatesOnly=/^(?:fecha|dia|hoy)?\s*[:\-]?\s*\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\s*(?:\d{1,2}:\d{2})?\s*$/;
const fold=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const normalizedTitle=title=>fold(title).replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
export function reminderKey(event){
 if(!event||!event.date)return null;
 const title=normalizedTitle(event.title);
 return title?event.date+'|'+(event.time||'todo-el-dia')+'|'+title:null;
}
export function autoReminderCandidate(text,{now=new Date(),mathMode=false}={}){
 if(mathMode)return null;
 const source=fold(text);
 if(source.length<12||source.length>1200||yearsOrDatesOnly.test(source))return null;
 if(mathSymbols.test(source))return null;
 if(mathVocabulary.test(source)&&!/\b(recordatorio|reunion|cita|agendar)\b/.test(source))return null;
 const result=parseReminder(text,now);
 if(!result||!calendarDraftIsValid(result))return null;
 if(!signal.test(source))return null;
 const title=normalizedTitle(result.title);
 if((title.length<5&&title!=='acto')||!/\p{L}/u.test(title)||/^(?:fecha|dia|hoy|manana|pendiente)$/i.test(title))return null;
 return result;
}
const STORE='minote_calendar_suggestions_v057';
const MAX_RECORDS=160;
const TTL=180*86400000;
const hash=str=>{
 let a=2166136261,b=0x9e3779b9;
 for(const ch of str){const c=ch.codePointAt(0);a=Math.imul(a^c,16777619);b=Math.imul(b+c,2246822519);}
 return [a>>>0,b>>>0,str.length].map(x=>x.toString(36)).join('-');
};
function read(storage,nowMs){
 let data={};
 try{data=JSON.parse(storage?.getItem(STORE)||'{}')||{};}catch{}
 if(typeof data!=='object'||Array.isArray(data))data={};
 return Object.fromEntries(Object.entries(data).filter(([k,v])=>
  /^[\w-]{3,90}$/.test(k)&&v&&Number.isFinite(v.at)&&nowMs-v.at>=0&&nowMs-v.at<TTL&&
  ['dismissed','opened'].includes(v.status)).slice(-MAX_RECORDS));
}
export function createReminderLedger(storage,clock=()=>Date.now()){
 const fingerprint=e=>{const key=reminderKey(e);return key?hash(key):null;};
 return {
  has(e){const id=fingerprint(e);return !!id&&!!read(storage,clock())[id];},
  mark(e,status){
   if(!['dismissed','opened'].includes(status))throw Error('Estado no admitido');
   const id=fingerprint(e);if(!id)return false;
   const records=read(storage,clock());records[id]={status,at:clock()};
   const recent=Object.entries(records).sort((a,b)=>a[1].at-b[1].at).slice(-MAX_RECORDS);
   try{storage?.setItem(STORE,JSON.stringify(Object.fromEntries(recent)));}catch{return false;}
   return true;
  },
  status(e){const id=fingerprint(e);return id?read(storage,clock())[id]?.status||null:null;}
 };
}
