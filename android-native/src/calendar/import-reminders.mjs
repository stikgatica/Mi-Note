/* Calendar V0.58: procesa páginas Huion ya guardadas sin cambiar la hoja activa.
 * Soporta varias fechas por página y agrupa trazos en renglones de forma conservadora.
 * No escribe en Google Calendar ni en el dispositivo Huion. */
import {autoReminderCandidate,reminderKey} from './reminder-auto.mjs';
import {extractContextualAgenda} from './agenda-context.mjs';

const DATE=/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[./-]\d{1,2}(?:[./-](?:20\d{2}|\d{2}))?|\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+\d{2,4})?)\b/gi;
const AFTER_TIME=/^\s*(?:a\s+las?\s+)?(?:[01]?\d|2[0-3])[:h.]?[0-5]\d(?:\s*(?:hrs?|horas?))?/i;
const MAX_BANDS=12;
const MAX_STROKES=250;
const MAX_POINTS=14000;

export function extractImportedReminders(text,{now=new Date(),heading='',pageDate=null}={}){
 const input=String(text||'').replace(/\r/g,' ').trim().slice(0,3000);
 if(!input)return [];
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
export async function recognizeImportedPage(page,recognize,{now=new Date()}={}){
 if(!page||page.huion?.partial||!Array.isArray(page.strokes)||!page.strokes.length)return [];
 if(typeof recognize!=='function')return [];
 const bands=lineBandsFromPage(page.strokes);
 if(!bands.length)return [];
 const seen=new Set(),events=[];
 const remember=text=>{
  for(const event of extractImportedReminders(text,{now,heading:page.notebookTitle||page.title||'',pageDate:page.createdAt||null})){
   const key=reminderKey(event);
   if(key&&!seen.has(key)){seen.add(key);events.push(event);}
  }
 };
 // Primero intentar leer toda la página si cabe: conserva encabezados.
 const full=compactStrokes(bands.flat());
 const requests=[];
 const recognizedBands=[];
 if(full.length>=2&&full.length<=MAX_STROKES)requests.push(full);
 if(bands.length>1){
  for(const band of bands){
   const chunk=compactStrokes(band);
   if(chunk.length>=2)requests.push(chunk);
  }
 }
 for(const [index,strokes] of requests.slice(0,MAX_BANDS+1).entries()){
  try{
   const result=await recognize({strokes});
   const options=[result?.text,...(Array.isArray(result?.candidates)?result.candidates:[])].filter(x=>typeof x==='string');
   for(const option of options.slice(0,4))remember(option);
   if(index>0&&options[0])recognizedBands.push(options[0]);
  }catch{/* Una lectura fallida no impide revisar otros renglones. */}
 }
 if(recognizedBands.length>1)remember(recognizedBands.join('\n'));
 return events.slice(0,25);
}
