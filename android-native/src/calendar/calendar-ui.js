/* Mi Note agenda inteligente: reconocimiento local y revisión antes de abrir Calendar.
 * Nunca crea eventos automáticamente; la persona confirma en Calendar Android. */
import {registerPlugin} from '@capacitor/core';
import {parseReminder,calendarDraftIsValid} from './reminder-parser.mjs';
import './calendar-ui.css';
const bridge=registerPlugin('MiNoteCalendar');
const $=id=>document.getElementById(id);
const snapshot=()=>window.MiNoteMathBridge?.snapshot?.();
const shell=$('mobileMoreDialog');
const buttons=shell?.querySelector('.mobile-actions-list');
if(!buttons)throw Error('La agenda inteligente necesita el menú de Mi Note.');
const menuButton=document.createElement('button');
menuButton.id='miNoteCalendarMenu';menuButton.type='button';
menuButton.textContent='▦ Recordatorios y Google Calendar';
buttons.append(menuButton);
const dialog=document.createElement('dialog');
dialog.id='miNoteCalendarDialog';dialog.className='dialog minote-calendar-dialog';
dialog.setAttribute('aria-labelledby','miNoteCalendarTitle');
dialog.innerHTML=[
 '<div class="dialog-head"><h2 id="miNoteCalendarTitle">Recordatorios y Calendar</h2>',
 '<button type="button" class="icon-btn" id="miNoteCalendarClose" aria-label="Cerrar">✕</button></div>',
 '<p class="minote-calendar-explain">Reconozca sus notas de forma privada y revise las fechas antes de preparar el evento. Mi Note nunca guarda eventos sin su autorización.</p>',
 '<div class="minote-calendar-row"><button type="button" id="miNoteCalendarScan">Reconocer escritura de esta hoja</button>',
 '<button type="button" id="miNoteCalendarDownload">Descargar modelo español</button></div>',
 '<label class="minote-calendar-opt"><input id="miNoteCalendarAuto" type="checkbox"> Detectar posibles recordatorios automáticamente al terminar de escribir (opcional)</label>',
 '<p class="minote-calendar-hint">El reconocimiento usa ML Kit en el celular. La primera descarga del modelo necesita internet; después funciona sin conexión. La tinta no se envía a Google Calendar.</p>',
 '<label class="field">Texto reconocido (puede corregirlo)<textarea id="miNoteCalendarText" rows="4" placeholder="Ej. Reunión Consejo Escolar, 25 de noviembre 15:30"></textarea></label>',
 '<button type="button" id="miNoteCalendarExtract">Detectar fecha y horario</button>',
 '<div class="minote-calendar-fields">',
 '<label class="field">Título del evento<input id="miNoteCalendarEventTitle" maxlength="160" placeholder="Título o motivo"></label>',
 '<div class="minote-calendar-row"><label class="field">Fecha<input id="miNoteCalendarDate" type="date"></label>',
 '<label class="field">Hora<input id="miNoteCalendarTime" type="time"></label></div>',
 '<label class="minote-calendar-opt"><input id="miNoteCalendarAllDay" type="checkbox"> Evento de todo el día (sin hora)</label>',
 '<label class="field">Descripción<input id="miNoteCalendarDescription" maxlength="1000" placeholder="Opcional"></label>',
 '<button type="button" id="miNoteCalendarOpen">Revisar en Google Calendar</button>',
 '</div>',
 '<p id="miNoteCalendarStatus" role="status" class="minote-calendar-status" aria-live="polite"></p>'
].join('');
document.body.append(dialog);
const status=(str)=>{$('miNoteCalendarStatus').textContent=str;};
const auto=$('miNoteCalendarAuto'),textBox=$('miNoteCalendarText'),allDay=$('miNoteCalendarAllDay');
const eventTitle=$('miNoteCalendarEventTitle'),date=$('miNoteCalendarDate'),time=$('miNoteCalendarTime');
const desc=$('miNoteCalendarDescription');
let busy=false,modelAvailable=false,detectTimer=0,lastSignature='',suggestionSignature='';
try{auto.checked=localStorage.getItem('minote_calendar_auto_v054')==='1';}catch{}
auto.addEventListener('change',()=>{
 try{localStorage.setItem('minote_calendar_auto_v054',auto.checked?'1':'0');}catch{}
 status(auto.checked?'Detección automática activada. Solo se proponen eventos con fechas reconocibles.':
  'Detección automática desactivada.');
});
function toggleTime(){time.disabled=allDay.checked;}
allDay.addEventListener('change',toggleTime);
toggleTime();
async function checkModel(){
 try{
  const state=await bridge.modelStatus();
  modelAvailable=!!state.downloaded;
  $('miNoteCalendarDownload').hidden=modelAvailable;
  status(modelAvailable?'Modelo español disponible. El reconocimiento se ejecuta en su teléfono.':
   'Para reconocer escritura, descargue una vez el modelo español (~20 MB). También puede escribir el recordatorio manualmente.');
 }catch(error){status('Reconocimiento automático no disponible: '+error.message+'. Puede escribir el recordatorio manualmente.');}
}
function show(){
 if(shell.open)shell.close();
 if(!dialog.open)dialog.showModal();
 void checkModel();
}
menuButton.addEventListener('click',show);
$('miNoteCalendarClose').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
$('miNoteCalendarDownload').addEventListener('click',async()=>{
 if(busy)return;
 if(!confirm('¿Descargar el modelo de escritura en español (~20 MB)? Solo se descarga el modelo; sus notas no se envían.'))return;
 busy=true;$('miNoteCalendarDownload').disabled=true;
 status('Descargando el modelo español para reconocimiento local…');
 try{
  await bridge.downloadModel();modelAvailable=true;
  $('miNoteCalendarDownload').hidden=true;
  status('Modelo descargado. Puede reconocer escritura sin conexión.');
 }catch(e){status('No fue posible descargar el modelo: '+e.message);}
 finally{busy=false;$('miNoteCalendarDownload').disabled=false;}
});
function strokesForRecognition(){
 const pg=snapshot();
 if(!pg||!Array.isArray(pg.strokes))throw Error('No hay una hoja activa.');
 const input=pg.strokes.filter(s=>Array.isArray(s.pts)&&s.pts.length>=2).slice(-125)
  .map(s=>s.pts.filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]))
   .filter((_,i)=>i%Math.max(1,Math.ceil(s.pts.length/110))===0)
   .map(p=>[p[0],p[1]])).filter(p=>p.length>=2);
 if(!input.length)throw Error('La hoja no contiene escritura suficiente.');
 const count=input.reduce((sum,p)=>sum+p.length,0);
 if(count>14000)throw Error('La hoja es demasiado extensa. Use un cuaderno con menos notas para el reconocimiento.');
 return input;
}
async function recognize({silent=false}={}){
 if(busy)return;
 if(!modelAvailable){
  if(!silent){show();status('Primero descargue el modelo español para reconocer su escritura.');}
  return;
 }
 busy=true;
 if(!silent)status('Interpretando las notas escritas en esta hoja…');
 try{
  const strokes=strokesForRecognition();
  const result=await bridge.recognize({strokes});
  const candidates=(result.candidates||[]).map(String);
  const selected=candidates.find(x=>parseReminder(x))||result.text||'';
  if(!selected.trim()){
   if(!silent)status('No se pudo reconocer texto en la hoja. Puede escribir el recordatorio manualmente.');
   return;
  }
  if(!silent){textBox.value=selected;applyText();status('Texto reconocido. Revise el título, fecha y hora antes de continuar.');}
  else{
   const event=parseReminder(selected);
   if(!event)return;
   const signature=event.title+'|'+event.date+'|'+event.time;
   if(signature===suggestionSignature)return;
   suggestionSignature=signature;
   textBox.value=selected;applyText();
   announce(event);
  }
 }catch(error){
  if(!silent)status('No fue posible interpretar la escritura: '+error.message+'. Puede escribir el recordatorio manualmente.');
 }finally{busy=false;}
}
$('miNoteCalendarScan').addEventListener('click',()=>void recognize());
function applyText(){
 const parsed=parseReminder(textBox.value);
 if(!parsed){status('No se encontró una fecha válida. Incluya día, mes y año, por ejemplo «25/11/2026», o «mañana».');return;}
 eventTitle.value=parsed.title;
 date.value=parsed.date;
 time.value=parsed.time||'';
 allDay.checked=parsed.allDay;toggleTime();
 desc.value='';
 const explanation=parsed.yearExplicit?'':' El año se ha inferido: revise que sea correcto.';
 status('Fecha propuesta: '+parsed.date+(parsed.time?' a las '+parsed.time:' · todo el día')+'.'+explanation);
}
$('miNoteCalendarExtract').addEventListener('click',applyText);
$('miNoteCalendarOpen').addEventListener('click',async()=>{
 const proposal={title:eventTitle.value.trim(),date:date.value,time:time.value,
  allDay:allDay.checked,description:desc.value.trim()};
 if(!calendarDraftIsValid(proposal)){status('Revise el título, la fecha y la hora. No se abrió Calendar.');return;}
 if(!confirm('¿Abrir la propuesta «'+proposal.title+'» del '+proposal.date+
   ' en su calendario? Tendrá que confirmar el guardado en Calendar.'))return;
 try{
  await bridge.openCalendar(proposal);
  status('Se abrió el formulario de Calendar. Revise la cuenta, los avisos y pulse Guardar allí.');
 }catch(err){status('No se pudo abrir Calendar: '+err.message+'. Instale o habilite una aplicación de calendario.');}
});
function announce(event){
 if(dialog.open)return;
 let prompt=$('miNoteCalendarSuggestion');
 if(!prompt){
  prompt=document.createElement('button');prompt.id='miNoteCalendarSuggestion';prompt.type='button';
  prompt.addEventListener('click',()=>{prompt.hidden=true;show();});
  document.body.append(prompt);
 }
 prompt.textContent='Posible recordatorio: '+event.title+' · '+event.date+' · Revisar';
 prompt.hidden=false;
 clearTimeout(announce.timeout);
 announce.timeout=setTimeout(()=>{prompt.hidden=true;},14000);
}
document.addEventListener('minote:stroke-finished',()=>{
 if(!auto.checked||!modelAvailable||document.hidden||dialog.open)return;
 clearTimeout(detectTimer);
 detectTimer=setTimeout(()=>{
  const pg=snapshot();if(!pg)return;
  const signature=pg.id+'|'+pg.strokes?.length;
  if(signature===lastSignature)return;
  lastSignature=signature;
  void recognize({silent:true});
 },6500);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(detectTimer);});
