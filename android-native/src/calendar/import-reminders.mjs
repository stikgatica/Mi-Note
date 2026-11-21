/* Calendar V0.58: procesa páginas Huion ya guardadas sin cambiar la hoja activa.
 * Soporta varias fechas por página y agrupa trazos en renglones de forma conservadora.
 * No escribe en Google Calendar ni en el dispositivo Huion. */
import {autoReminderCandidate,reminderKey} from './reminder-auto.mjs';
import {extractContextualAgenda} from './agenda-context.mjs';
import {extractNaturalMeetings} from './natural-meetings.mjs';

const DATE=/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[./-]\d{1,2}(?:[./-](?:20\d{2}|\d{2}))?|\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+\d{2,4})?)\b/gi;
const AFTER_TIME=/^\s*(?:a\s+las?\s+)?(?:[01]?\d|2[0-3])[:h.]?[0-5]\d(?:\s*(?:hrs?|horas?))?/i;
const MAX_BANDS=12;
const MAX_STROKES=250;
const MAX_POINTS=14000;

export function extractImportedReminders(text,{now=new Date(),heading='',pageDate=null,regionId=''}={}){
 const input=String(text||'').replace(/\r/g,' ').trim().slice(0,3000);
 if(!input)return [];
 // Los saltos de línea marcan compromisos distintos: no unir fechas de renglones ajenos.
 if(input.includes('\n')){
  const meetings=extractNaturalMeetings(input,{now,regionId});
  const contextual=extractContextualAgenda(input,{now,heading,pageDate});
  const known=new Set(meetings.map(reminderKey));
  for(const item of contextual){
   // Si ya se extrajo un evento por sus propios renglones, no heredar la
   // fecha de un encabezado anterior para crear otro de día completo.
   const normalizedTitle=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   if(item.dateInferred&&meetings.some(m=>
    normalizedTitle(m.title)===normalizedTitle(item.title)&&m.time))continue;
   // Un encabezado numérico entre el título y la hora no es una nueva reunión
   // de día completo cuando ya existe ese mismo compromiso con hora.
   const alreadyTimed=meetings.some(m=>m.date===item.date&&
    m.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===
    item.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()&&m.time);
   if(!item.time&&alreadyTimed)continue;
   if(!known.has(reminderKey(item))){
    meetings.push({...item,regionId:regionId||item.regionId||''});known.add(reminderKey(item));
   }
  }
  return meetings.slice(0,25);
 }
 const found=[...input.matchAll(DATE)];
 if(!found.length)return extractContextualAgenda(input,{now,heading,pageDate});
 const out=[],known=new Set();
 let segmentStart=0;
 for(const match of found.slice(0,30)){
  const matchEnd=match.index+match[0].length;
  const tail=AFTER_TIME.exec(input.slice(matchEnd,matchEnd+35));
  const end=matchEnd+(tail?.[0]?.length||0);
  let segment=input.slice(segmentStart,end).trim();
  segment=segment.replace(/^\s*(?:fechas importantes|agenda|pendientes|recordatorios del mes)\s*[:\-–]?\s*/i,'');
  const candidate=autoReminderCandidate(segment,{now});
  if(candidate){
   const key=reminderKey(candidate);
   if(key&&!known.has(key)){known.add(key);out.push(candidate);}
  }
  segmentStart=end;
 }
 for(const item of extractContextualAgenda(input,{now,heading,pageDate})){
  const key=reminderKey(item);
  if(key&&!known.has(key)){known.add(key);out.push(item);}
 }
 return out.slice(0,25);
}
function strokePoints(stroke){
 return (stroke?.pts||[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=0&&p[0]<=1000&&p[1]>=0&&p[1]<=1400);
}
function median(values){
 if(!values.length)return 0;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.floor(sorted.length/2)];
}
export function lineBandsFromPage(strokes){
 if(!Array.isArray(strokes))return [];
 const mapped=strokes.map((s,index)=>{
  const points=strokePoints(s);
  if(points.length<2)return null;
  const ys=points.map(p=>p[1]);
  const bottom=Math.max(...ys),top=Math.min(...ys);
  return {points,center:(bottom+top)/2,height:bottom-top,index};
 }).filter(Boolean);
 if(!mapped.length)return [];
 // El centro vertical de trazos de un renglón suele estar muy próximo;
 // separar renglones reduce errores de ML Kit con notas de varias fechas.
 const threshold=Math.max(28,Math.min(56,median(mapped.map(s=>s.height))*1.55));
 mapped.sort((a,b)=>a.center-b.center);
 const bands=[];
 for(const entry of mapped){
  const last=bands.at(-1);
  if(last&&Math.abs(entry.center-last.center)<=threshold){
   last.items.push(entry);
   last.center=last.items.reduce((s,x)=>s+x.center,0)/last.items.length;
  }else bands.push({items:[entry],center:entry.center});
 }
 const result=bands.filter(b=>b.items.length>=2).slice(0,MAX_BANDS)
  .map(b=>b.items.sort((a,b)=>a.index-b.index).map(s=>s.points));
 return result;
}
function compactStrokes(strokes){
 const source=strokes.slice(0,MAX_STROKES);
 let remaining=MAX_POINTS;
 const out=[];
 for(const pts of source){
  if(remaining<2)break;
  const step=Math.max(1,Math.ceil(pts.length/Math.min(115,remaining)));
  const reduced=pts.filter((_,i)=>i%step===0).slice(0,remaining);
  if(reduced.length<2)continue;
  out.push(reduced.map(p=>[p[0],p[1]]));
  remaining-=reduced.length;
 }
 return out;
}
/** Agrupa renglones próximos en bloques físicos sin tocar ni reordenar la tinta. */
export function noteBlocksFromBands(bands){
 if(!Array.isArray(bands)||!bands.length)return [];
 const rows=bands.map((strokes,i)=>{
  const ys=strokes.flatMap(points=>points.map(p=>p[1]));
  return {i,strokes,top:Math.min(...ys),bottom:Math.max(...ys)};
 }).sort((a,b)=>a.top-b.top);
 const gaps=rows.slice(1).map((row,i)=>Math.max(0,row.top-rows[i].bottom));
 const nonzero=gaps.filter(g=>g>0);
 const middle=median(nonzero);
 // Separaciones normales entre título, fecha y hora no separan el compromiso.
 // El salto vertical grande entre dos notas crea un nuevo bloque.
 const split=Math.max(125,Math.min(300,middle*1.9));
 const groups=[];let group=[];
 for(let i=0;i<rows.length;i++){
  if(i>0&&rows[i].top-rows[i-1].bottom>split&&group.length){
   groups.push(group);group=[];
  }
  group.push(rows[i]);
 }
 if(group.length)groups.push(group);
 return groups.map(g=>g.map(row=>row.strokes));
}
export async function recognizeImportedPage(page,recognize,{now=new Date()}={}){
 if(!page||page.huion?.partial||!Array.isArray(page.strokes)||!page.strokes.length)return [];
 if(typeof recognize!=='function')return [];
 const bands=lineBandsFromPage(page.strokes);
 if(!bands.length)return [];
 const groups=noteBlocksFromBands(bands);
 const events=[],seen=new Set();
 const heading=page.notebookTitle||page.title||'',pageDate=page.createdAt||null;
 function remember(text,regionId=''){
  const list=extractImportedReminders(text,{now,heading,pageDate,regionId});
  for(const item of list){
   const event={...item,regionId:item.regionId||regionId||''};
   const fingerprint=reminderKey(event);
   if(fingerprint&&!seen.has(fingerprint)){
    seen.add(fingerprint);events.push(event);
   }
  }
 }
 async function read(strokes){
  const prepared=compactStrokes(strokes);
  if(prepared.length<1)return [];
  try{
   const result=await recognize({strokes:prepared});
   return [result?.text,...(Array.isArray(result?.candidates)?result.candidates:[])]
    .filter(x=>typeof x==='string'&&x.trim()).slice(0,3);
  }catch{return [];}
 }
 // Leer primero renglones individuales, ordenados de arriba a abajo.
 // ML Kit puede combinar la hora de otra nota cuando recibe toda la hoja.
 // Nunca superponer una hipótesis de OCR global a una lectura válida por filas.
 for(const [i,group] of groups.slice(0,MAX_BANDS).entries()){
  const regionId='region-'+i;
  const rowOptions=[];
  for(const line of group.slice(0,MAX_BANDS)){
   rowOptions.push(await read(line));
  }
  const primary=rowOptions.map(options=>options[0]||'').filter(Boolean);
  const oldCount=events.length;
  if(primary.length)remember(primary.join('\n'),regionId);
  // ML Kit puede leer un título manuscrito como otra palabra. Dar prioridad
  // a una alternativa que parezca compromiso, siempre dentro de la MISMA zona.
  // Examinarla incluso si la primera lectura recuperó otra nota del bloque.
  if(rowOptions.some(x=>x.length>1)){
   const TITLE=/^(?:acto|taller|actividad|reuni[oó]n|cita|consejo|ceremonia|entrevista|capacitaci[oó]n)\b/i;
   const candidates=rowOptions.map(options=>options.find(x=>TITLE.test(x.trim()))||options[0]||'').filter(Boolean);
   if(candidates.length&&candidates.join('\n')!==primary.join('\n'))
    remember(candidates.join('\n'),regionId);
  }
  if(events.length===oldCount){
   const combined=await read(group.flat());
   for(const text of combined)remember(text,regionId);
  }
 }
 // La lectura global puede entrecruzar renglones de compromisos distintos.
 // Se permite solamente cuando no existe ningún resultado por regiones y
 // la página contiene un único bloque; de otro modo se omite.
 if(!events.length&&groups.length===1){
  const full=await read(bands.flat());
  for(const text of full)remember(text,'region-0');
 }
 return events.slice(0,25);
}
