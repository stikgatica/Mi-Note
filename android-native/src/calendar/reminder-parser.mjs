/* Detector conservador de recordatorios: nunca crea eventos por sí solo. */
const MONTHS={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
const pad=n=>String(n).padStart(2,'0');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const real=(y,m,d)=>{const dt=new Date(y,m-1,d);return y>=2020&&y<=2100&&dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d;};
const yearFor=(year,m,d,now)=>{
 if(year!=null)return year<100?year+2000:year;
 const thisYear=now.getFullYear();
 return new Date(thisYear,m-1,d)<new Date(thisYear,now.getMonth(),now.getDate())?thisYear+1:thisYear;
};
function dateFrom(match,d,m,y,now){
 const day=Number(d),month=Number(m),year=yearFor(y==null?null:Number(y),month,day,now);
 return real(year,month,day)?{date:year+'-'+pad(month)+'-'+pad(day),index:match.index,matched:match[0],yearExplicit:y!=null}:null;
}
export function parseReminder(text,now=new Date()){
 const original=String(text||'').trim().slice(0,4000);
 const normalized=norm(original);
 if(!normalized)return null;
 let found=null,match;
 const iso=/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g;
 while((match=iso.exec(normalized))&&!found)found=dateFrom(match,match[3],match[2],match[1],now);
 if(!found){
  const numeric=/\b(0?[1-9]|[12]\d|3[01])([\/.-])(0?[1-9]|1[0-2])\2(20\d{2}|\d{2})?\b/g;
  while((match=numeric.exec(normalized))&&!found)found=dateFrom(match,match[1],match[3],match[4],now);
 }
 if(!found){
  const named=/\b(0?[1-9]|[12]\d|3[01])\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(20\d{2}|\d{2}))?\b/g;
  while((match=named.exec(normalized))&&!found)found=dateFrom(match,match[1],MONTHS[match[2]],match[3],now);
 }
 if(!found){
  const rel=/\b(pasado\s+manana|manana|hoy)\b/.exec(normalized);
  if(rel){
   const days=rel[1]==='hoy'?0:rel[1]==='manana'?1:2;
   const dt=new Date(now.getFullYear(),now.getMonth(),now.getDate()+days);
   found={date:dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate()),index:rel.index,matched:rel[0],yearExplicit:false};
  }
 }
 if(!found)return null;
 const masked=normalized.slice(0,found.index)+' '.repeat(found.matched.length)+normalized.slice(found.index+found.matched.length);
 const timeMatch=/\b(?:a\s+las?\s+)?([01]?\d|2[0-3])[:h.]([0-5]\d)(?:\s*(?:hrs?|horas?))?\b|\b(?:a\s+las?\s+)([01]?\d|2[0-3])(?:\s*(?:hrs?|horas?))?\b/.exec(masked);
 let time='',endTime='';
 if(timeMatch){
  time=pad(Number(timeMatch[1]??timeMatch[3]))+':'+(timeMatch[2]||'00');
  const trailing=masked.slice(timeMatch.index+timeMatch[0].length);
  const end=/^\s*(?:a|-|hasta)\s*(\d{1,2})[:h.]([0-5]\d)\b/.exec(trailing);
  if(end&&Number(end[1])<24)endTime=pad(Number(end[1]))+':'+end[2];
 }
 // El texto mostrado es editable: eliminar solo segmentos reconocidos.
 const chars=[...original];
 const erase=(start,length)=>{for(let i=start;i<start+length;i++)if(i>=0&&i<chars.length)chars[i]=' ';};
 erase(found.index,found.matched.length);
 if(timeMatch)erase(timeMatch.index,timeMatch[0].length);
 const title=chars.join('').replace(/\b(?:recordatorio|recordar|importante|fecha importante|agendar|calendario|pendiente)\s*[:\-]?\s*/gi,' ')
  .replace(/[\r\n•]+/g,' ').replace(/\s{2,}/g,' ').replace(/^[,;:\s-]+|[,;:\s-]+$/g,'').slice(0,130).trim();
 return {title:title||'Recordatorio',date:found.date,time,endTime,allDay:!time,source:original,yearExplicit:found.yearExplicit};
}
export function calendarDraftIsValid(draft){
 const {title,date,time,allDay}=draft||{};
 if(!String(title||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
 const [y,m,d]=date.split('-').map(Number);
 return real(y,m,d)&&(!!allDay||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time||''));
}
