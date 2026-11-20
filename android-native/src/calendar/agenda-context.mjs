/* Mi Note V0.59: lectura contextual de agendas en el dispositivo.
 * Hereda la fecha de encabezados de mes/día; nunca crea eventos sin confirmar. */
import {parseReminder} from './reminder-parser.mjs';
import {autoReminderCandidate,reminderKey} from './reminder-auto.mjs';

const MONTHS={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,
 septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
const DAYS={domingo:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6};
const MONTH='enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const WEEK='lunes|martes|miercoles|jueves|viernes|sabado|domingo';
const DATE_HEAD=new RegExp('^(?:(?:'+WEEK+')\\s+)?(?:\\d{1,2}[./-]\\d{1,2}(?:[./-]\\d{2,4})?|20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}\\s+(?:de\\s+)?(?:'+MONTH+')(?:\\s+(?:de|del)\\s+\\d{2,4})?)\\s*[.:–-]?$','i');
const WEEK_DAY_HEAD=new RegExp('^('+WEEK+')\\s+(\\d{1,2})(?:\\s*[.:–-])?$','i');
const MONTH_HEAD=new RegExp('^(?:(?:agenda|mes|fechas importantes|calendario)\\s*(?:de|:)?\\s*)?('+MONTH+')(?:\\s+(20\\d{2}))?\\s*[.:–-]?$','i');
const WEEK_INLINE=new RegExp('\\b(?:el\\s+|proximo\\s+|este\\s+)?('+WEEK+')\\b','i');
const WEEK_NUMBER=new RegExp('\\b('+WEEK+')\\s+(\\d{1,2})\\b','i');
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const pad=n=>String(n).padStart(2,'0');
const localDate=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
function validDate(y,m,d){const x=new Date(y,m-1,d);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d?x:null;}
function monthHeading(s){return MONTH_HEAD.exec(fold(s))?.slice(1)||null;}
function weekday(s){const m=new RegExp('^('+WEEK+')\\b','i').exec(fold(s));return m?DAYS[m[1]]:null;}
function nextWeekday(name,now){
 const target=DAYS[name];if(target===undefined)return null;
 let delta=(target-now.getDay()+7)%7;if(delta===0)delta=7;
 return new Date(now.getFullYear(),now.getMonth(),now.getDate()+delta);
}
function headerDate(raw,{now,month,year}){
 const line=fold(raw).replace(/\s*[.:–-]\s*$/,'').trim();
 const numbered=WEEK_DAY_HEAD.exec(line);
 if(numbered){
  if(!month)return null; // "martes 24" sin mes es ambiguo.
  const dt=validDate(year??now.getFullYear(),month,Number(numbered[2]));
  return dt&&dt.getDay()===DAYS[numbered[1]]?localDate(dt):null;
 }
 if(!DATE_HEAD.test(line))return null;
 const found=parseReminder(line,now);if(!found)return null;
 const wd=weekday(line);
 if(wd!==null){
  const [y,m,d]=found.date.split('-').map(Number);
  if(new Date(y,m-1,d).getDay()!==wd)return null;
 }
 return found.date;
}
const cleanLine=s=>String(s||'').trim().replace(/^[•*–-]\s*/,'').trim().slice(0,350);
function inferWeekday(line,base,{allowRelative,month,year}){
 const normalized=fold(line);
 const numbered=WEEK_NUMBER.exec(normalized);
 if(numbered&&month){
  const dt=validDate(year??base.getFullYear(),month,Number(numbered[2]));
  if(!dt||dt.getDay()!==DAYS[numbered[1]])return null;
  return {date:localDate(dt),cleaned:(line.slice(0,numbered.index)+line.slice(numbered.index+numbered[0].length)).replace(/\s+/g,' ').trim()};
 }
 if(!allowRelative)return null;
 const match=WEEK_INLINE.exec(normalized);if(!match)return null;
 const dt=nextWeekday(match[1],base);if(!dt)return null;
 return {date:localDate(dt),cleaned:(line.slice(0,match.index)+line.slice(match.index+match[0].length)).replace(/\s+/g,' ').trim()};
}
/** Texto OCR con saltos de línea; no registra ni sincroniza contenido privado. */
export function extractContextualAgenda(text,{now=new Date(),pageDate=null,heading='',mathMode=false}={}){
 if(mathMode)return [];
 const input=String(text||'').replace(/\r/g,'\n').slice(0,4500);
 const lines=input.split(/\n|[•·]\s+(?=\p{L})/u).map(cleanLine).filter(Boolean).slice(0,75);
 if(!lines.length)return [];
 const reference=pageDate?new Date(pageDate):now;
 const base=Number.isNaN(reference.getTime())?now:reference;
 // No reinterpretar "el jueves" como futuro cuando se importa una hoja antigua.
 const allowRelative=!pageDate||Math.abs(now.getTime()-base.getTime())<=14*86400000;
 let month=null,year=null,date=null,sourceDate='';
 const parent=monthHeading(heading);
 if(parent){month=MONTHS[parent[0]];year=parent[1]?Number(parent[1]):base.getFullYear();}
 const out=[],seen=new Set();
 for(let i=0;i<lines.length;i++){
  const line=lines[i],normalized=fold(line);
  const monthMatch=monthHeading(line);
  if(monthMatch){
   month=MONTHS[monthMatch[0]];year=monthMatch[1]?Number(monthMatch[1]):base.getFullYear();
   date=null;sourceDate='';continue;
  }
  if(DATE_HEAD.test(normalized)||WEEK_DAY_HEAD.test(normalized)){
   date=headerDate(line,{now:base,month,year});sourceDate=line;
   continue; // Fecha inválida anula el encabezado anterior.
  }
  let event=autoReminderCandidate(line,{now:base});
  if(!event){
   const relative=inferWeekday(line,base,{allowRelative,month,year});
   if(relative)event=autoReminderCandidate(relative.cleaned+' '+relative.date,{now:base});
  }
  if(!event&&date)event=autoReminderCandidate(line+' '+date,{now:base});
  if(!event)continue;
  const key=reminderKey(event);if(!key||seen.has(key))continue;
  seen.add(key);
  out.push({...event,source:line,dateContext:sourceDate,sourceLine:i,
   dateInferred:!!(date&&!parseReminder(line,base)),needsReview:!event.yearExplicit});
 }
 return out.slice(0,25);
}