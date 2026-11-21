/* V0.61: agendas naturales con título, fecha y hora en renglones separados.
 * Solo construye propuestas; no crea ni modifica eventos de Calendar.
 */
import {autoReminderCandidate,reminderKey} from './reminder-auto.mjs';
const DATE=/(?:\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*(?:20\d{2}|\d{2}))?\b|\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b)/i;
const TIME=/\b(?:[01]?\d|2[0-3])\s*[:h.]\s*[0-5]\d\b/i;
const SIGNAL=/\b(reuni[oó]n|reun[ií]on|cita|consejo|entrevista|capacitaci[oó]n|control m[eé]dico|consulta m[eé]dica|ceremonia|audiencia|entregar|entrega|vencimiento|plazo|tr[aá]mite|turno|matr[ií]cula|inscripci[oó]n|aniversario|recordatorio|recordar)\b/i;
const MATH=/\b(ejercicio|resuelve|resolver|ecuaci[oó]n|fracci[oó]n|tri[aá]ngulo|cuadrado|per[ií]metro|probabilidad|calcular|matem[aá]tica)\b|[=×÷∑√≠≤≥±]/i;
const tidy=s=>String(s||'').replace(/(\d)\s*[/.-]\s*(\d)/g,'$1/$2')
 .replace(/(\d)\s*[:h]\s*([0-5]\d)\b/gi,'$1:$2')
 .replace(/^[•\-–]\s*/,'').trim();
function rowKind(s){
 if(SIGNAL.test(s)&&!MATH.test(s))return 'title';
 if(DATE.test(s)||TIME.test(s))return 'data';
 return 'other';
}
const key=e=>reminderKey(e);
export function extractNaturalMeetings(text,{now=new Date(),regionId=''}={}){
 const lines=String(text||'').split(/[\r\n]+/).map(tidy).filter(Boolean).slice(0,65);
 if(!lines.length)return [];
 const out=[],keys=new Set();
 let pending=null,orphan=[],entryIndex=0;
 function add(source){
  const event=autoReminderCandidate(source,{now});
  if(!event)return;
  const fingerprint=key(event);
  if(!fingerprint||keys.has(fingerprint))return;
  keys.add(fingerprint);
  out.push({...event,source,needsReview:!event.yearExplicit,
   regionId:regionId?regionId+'-item-'+entryIndex++:'line-'+entryIndex++});
 }
 function flush(){
  if(pending){
   const combined=pending.parts.join(' ');
   if(pending.date)add(combined);
  }
  pending=null;
 }
 for(const line of lines){
  const kind=rowKind(line);
  if(kind==='title'){
   flush();
   pending={parts:[line],date:DATE.test(line),time:TIME.test(line),remaining:3};
   if(!pending.date&&orphan.length){
    const mostRecent=orphan.slice(-2);
    if(mostRecent.some(x=>DATE.test(x))){
     pending.parts.push(...mostRecent);pending.date=true;
     pending.time=mostRecent.some(x=>TIME.test(x));
    }
    orphan=[];
   }
   continue;
  }
  if(kind==='data'){
   if(pending&&pending.remaining>0){
    pending.parts.push(line);pending.date ||= DATE.test(line);pending.time ||= TIME.test(line);
    pending.remaining--;
    // If all parts are there, wait one more line only when incomplete.
    if(pending.date&&pending.time)flush();
   }else orphan.push(line);
   continue;
  }
  // A neutral heading or paragraph breaks the association.
  flush();orphan=[];
 }
 flush();
 // Caso típico en una sola línea, también funciona con frases más completas.
 for(const line of lines){
  if(SIGNAL.test(line)&&DATE.test(line)&&!MATH.test(line))add(line);
 }
 return out.slice(0,25);
}
