/* Mi Note agenda inteligente: reconocimiento local y revisión antes de abrir Calendar.
 * Nunca crea eventos automáticamente; la persona confirma en Calendar Android. */
import {registerPlugin} from '@capacitor/core';
import {parseReminder,calendarDraftIsValid} from './reminder-parser.mjs';
import {autoReminderCandidate,reminderKey,createReminderLedger} from './reminder-auto.mjs';
import {recognizeImportedPage,extractImportedReminders} from './import-reminders.mjs';
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
 '<p id="miNoteCalendarDetectionFeedback" class="minote-calendar-detection-feedback" role="status" aria-live="polite">Ingrese una fecha como 15/12 o 05/01 y pulse Detectar.</p>',
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
let busy=false,modelAvailable=false,detectTimer=0,lastSignature='',suggestionSignature='',pendingReminder=null;
const importedPageIds=[],importSeen=new Set(),suggestionQueue=[];
let importingScan=false,importScanSerial=0;
const ledger=createReminderLedger(window.localStorage);
// Predeterminado activo cuando no existe una elección previa; desactivarlo se respeta.
try{auto.checked=localStorage.getItem('minote_calendar_auto_v054')!=='0';}catch{auto.checked=true;}
auto.addEventListener('change',()=>{
 try{localStorage.setItem('minote_calendar_auto_v054',auto.checked?'1':'0');}catch{}
 if(!auto.checked){clearTimeout(detectTimer);closeSuggestion();suggestionQueue.length=0;}
 else void checkModel({silent:true}).then(()=>void scanImportedPages());
 status(auto.checked?'Detección automática activada. Solo se proponen eventos con fechas reconocibles.':
  'Detección automática desactivada.');
});
function toggleTime(){time.disabled=allDay.checked;}
allDay.addEventListener('change',toggleTime);
toggleTime();
async function checkModel({silent=false}={}){
 try{
  const state=await bridge.modelStatus();
  modelAvailable=!!state.downloaded;
  $('miNoteCalendarDownload').hidden=modelAvailable;
  if(!silent)status(modelAvailable?'Modelo español disponible. El reconocimiento se ejecuta en su teléfono.':
   'Para reconocer escritura, descargue una vez el modelo español (~20 MB). También puede escribir el recordatorio manualmente.');
 }catch(error){
  modelAvailable=false;
  if(!silent)status('Reconocimiento automático no disponible: '+error.message+'. Puede escribir el recordatorio manualmente.');
 }
}
function show(){
 if(shell.open)shell.close();
 if(!dialog.open)dialog.showModal();
 void checkModel();
}
menuButton.addEventListener('click',show);
$('miNoteCalendarClose').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
dialog.addEventListener('close',()=>maybeShowNextSuggestion());
$('miNoteCalendarDownload').addEventListener('click',async()=>{
 if(busy)return;
 if(!confirm('¿Descargar el modelo de escritura en español (~20 MB)? Solo se descarga el modelo; sus notas no se envían.'))return;
 busy=true;$('miNoteCalendarDownload').disabled=true;
 status('Descargando el modelo español para reconocimiento local…');
 try{
  await bridge.downloadModel();modelAvailable=true;
  $('miNoteCalendarDownload').hidden=true;
  void scanImportedPages();
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
  const mathMode=!!window.MiNoteMath?.enabled;
  const automatic=silent?candidates.map(x=>({text:x,event:autoReminderCandidate(x,{mathMode})}))
   .find(item=>item.event):null;
  const selected=silent?(result.text||automatic?.text||''):(candidates.find(x=>parseReminder(x))||result.text||'');
  if(!selected.trim()){
   if(!silent)status('No se pudo reconocer texto en la hoja. Puede escribir el recordatorio manualmente.');
   return;
  }
  if(!silent){textBox.value=selected;applyText();status('Texto reconocido. Revise el título, fecha y hora antes de continuar.');}
  else{
   const event=automatic?.event;
   // Usar primero la lectura por renglones; nunca crear una propuesta mezclando títulos.
   const contextual=extractImportedReminders(result.text||selected,{now:new Date()});
   if(contextual.length){
    for(const proposal of contextual)enqueueImportedSuggestion(proposal,{imported:false});
    maybeShowNextSuggestion();
    return;
   }
   if(!event||ledger.has(event)||pendingReminder){maybeShowNextSuggestion();return;}
   const signature=reminderKey(event);
   if(signature===suggestionSignature)return;
   suggestionSignature=signature;
   textBox.value=selected;applyText();
   announce(event);
   maybeShowNextSuggestion();
  }
 }catch(error){
  if(!silent)status('No fue posible interpretar la escritura: '+error.message+'. Puede escribir el recordatorio manualmente.');
 }finally{busy=false;}
}
$('miNoteCalendarScan').addEventListener('click',()=>void recognize());
function applyText(){
 const feedback=$('miNoteCalendarDetectionFeedback');
 const parsed=parseReminder(textBox.value);
 if(!parsed){
  feedback.textContent='No se reconoció una fecha válida. Pruebe 15/12, 05/01 o 25/11/2026.';
  feedback.dataset.state='error';
  status(feedback.textContent);
  return;
 }
 eventTitle.value=parsed.title;
 date.value=parsed.date;
 time.value=parsed.time||'';
 allDay.checked=parsed.allDay;toggleTime();
 desc.value='';
 const explanation=parsed.yearExplicit?'':' Año calculado según la fecha actual del teléfono; revíselo.';
 const message='Detectado: '+parsed.title+' · '+parsed.date+(parsed.time?' · '+parsed.time:' · todo el día')+'.'+explanation;
 feedback.textContent=message;
 feedback.dataset.state='success';
 status(message);
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
  // Se recuerda que ya se ofreció el evento; no se afirma que Calendar lo guardó.
  ledger.mark(proposal,'opened');
  closeSuggestion();
  status('Se abrió el formulario de Calendar. Revise la cuenta, los avisos y pulse Guardar allí.');
 }catch(err){status('No se pudo abrir Calendar: '+err.message+'. Instale o habilite una aplicación de calendario.');}
});
function closeSuggestion(){
 const prompt=$('miNoteCalendarSuggestion');
 if(prompt)prompt.hidden=true;
 pendingReminder=null;
 suggestionSignature='';
 queueMicrotask(()=>maybeShowNextSuggestion());
}
function formatProposal(event){
 return event.date.split('-').reverse().join('/')+(event.time?' · '+event.time:' · Todo el día');
}
function announce(event){
 if(dialog.open||ledger.has(event)||!auto.checked)return;
 pendingReminder=event;
 let prompt=$('miNoteCalendarSuggestion');
 if(!prompt){
  prompt=document.createElement('section');
  prompt.id='miNoteCalendarSuggestion';
  prompt.setAttribute('role','alertdialog');
  prompt.setAttribute('aria-label','Posible recordatorio detectado');
  prompt.innerHTML=[
   '<div class="minote-suggestion-title">¿Agregar este recordatorio a Calendar?</div>',
   '<div class="minote-suggestion-event" id="miNoteCalendarSuggestionEvent"></div>',
   '<div class="minote-suggestion-actions">',
   '<button id="miNoteCalendarSuggestionAdd" type="button">Agregar</button>',
   '<button id="miNoteCalendarSuggestionEdit" type="button">Editar</button>',
   '<button id="miNoteCalendarSuggestionDismiss" type="button">Descartar</button>',
   '</div>'
  ].join('');
  document.body.append(prompt);
  $('miNoteCalendarSuggestionAdd').addEventListener('click',async()=>{
   const selected=pendingReminder;
   if(!selected)return;
   $('miNoteCalendarSuggestionAdd').disabled=true;
   try{
    // No guarda automáticamente: Android Calendar presenta el formulario.
    await bridge.openCalendar({title:selected.title,date:selected.date,
     time:selected.time,allDay:selected.allDay,description:''});
    ledger.mark(selected,'opened');
    closeSuggestion();
   }catch(error){
    status('No se pudo abrir Calendar: '+error.message);
    $('miNoteCalendarSuggestionAdd').disabled=false;
   }
  });
  $('miNoteCalendarSuggestionEdit').addEventListener('click',()=>{
   if(!pendingReminder)return;
   textBox.value=pendingReminder.source||pendingReminder.title+' '+formatProposal(pendingReminder);
   applyText();
   closeSuggestion();
   show();
  });
  $('miNoteCalendarSuggestionDismiss').addEventListener('click',()=>{
   if(pendingReminder)ledger.mark(pendingReminder,'dismissed');
   closeSuggestion();
  });
 }
 $('miNoteCalendarSuggestionEvent').textContent=event.title+' · '+formatProposal(event)+
  (event.fromImportedPage?' · Hoja Huion importada':'');
 $('miNoteCalendarSuggestionAdd').disabled=false;
 prompt.hidden=false;
}

/* V0.58: cada hoja física se guarda antes de revisar OCR. El análisis se
 * ejecuta DESPUÉS de importar; nunca bloquea BLE ni elimina trazos. */
const importDialog=$('x10MemoryDialog');
const archiveDialog=$('x10ArchiveDialog');
const importInfo=document.createElement('p');
importInfo.id='miNoteImportedCalendarSummary';
importInfo.className='minote-calendar-import-summary';
importInfo.setAttribute('role','status');
importInfo.setAttribute('aria-live','polite');
importInfo.textContent='Al recuperar hojas nuevas, Mi Note buscará reuniones y recordatorios.';
const memoryStatus=$('x10MemoryProgress');
if(memoryStatus)memoryStatus.after(importInfo);
function importedSummary(text){importInfo.textContent=text;}
function enqueueImportedSuggestion(event,{imported=true}={}){
 const key=reminderKey(event);
 if(!key||ledger.has(event)||suggestionQueue.some(x=>reminderKey(x)===key)||
  pendingReminder&&reminderKey(pendingReminder)===key)return;
 suggestionQueue.push({...event,fromImportedPage:imported});
}
function maybeShowNextSuggestion(){
 if(document.hidden||pendingReminder||dialog.open||importDialog?.open||archiveDialog?.open||
  !auto.checked)return;
 while(suggestionQueue.length){
  const next=suggestionQueue.shift();
  if(ledger.has(next))continue;
  textBox.value=next.source||next.title+' '+next.date+(next.time?' '+next.time:'');
  applyText();
  announce(next);
  break;
 }
}
async function scanImportedPages(){
 if(importingScan||!auto.checked||!importedPageIds.length)return;
 if(!modelAvailable){
  await checkModel({silent:true});
  if(!modelAvailable){
   importedSummary('Hojas guardadas. Para reconocer fechas automáticamente, descargue una vez el modelo español en Recordatorios y Calendar.');
   return;
  }
 }
 importingScan=true;
 const serial=++importScanSerial;
 let scanned=0,found=0,partial=0;
 importedSummary('Revisando reuniones en las hojas importadas, sin modificar los originales…');
 try{
  while(importedPageIds.length&&auto.checked&&serial===importScanSerial){
   const item=importedPageIds.shift();
   const pg=window.MiNoteCalendarImportRead?.(item.notebookId,item.pageId);
   if(!pg)continue;
   if(pg.huion?.partial){partial++;continue;}
   const events=await recognizeImportedPage(pg,args=>bridge.recognize(args));
   scanned++;
   for(const event of events){
    if(ledger.has(event))continue;
    const before=suggestionQueue.length;
    enqueueImportedSuggestion(event);
    if(suggestionQueue.length>before)found++;
   }
  }
 }catch(error){
  importedSummary('Revisión interrumpida: '+(error?.message||String(error))+'. Las páginas importadas se conservaron.');
 }finally{
  importingScan=false;
  if(auto.checked){
   importedSummary('Revisión local terminada: '+scanned+' hojas revisadas; '+found+
    ' compromisos nuevos por confirmar'+(partial?'; '+partial+' hojas parciales omitidas':'')+
    '. Cierre esta ventana para ver los avisos.');
   maybeShowNextSuggestion();
  }
 }
}
document.addEventListener('minote:x10-page-imported',({detail})=>{
 if(!detail?.notebookId||!detail?.pageId||!auto.checked)return;
 const id=String(detail.notebookId)+'|'+String(detail.pageId);
 if(importSeen.has(id))return;
 importSeen.add(id);
 importedPageIds.push({notebookId:detail.notebookId,pageId:detail.pageId});
});
document.addEventListener('minote:x10-import-finished',()=>void scanImportedPages());
importDialog?.addEventListener('close',()=>{
 if(importedPageIds.length)void scanImportedPages();
 maybeShowNextSuggestion();
});
archiveDialog?.addEventListener('close',()=>maybeShowNextSuggestion());

document.addEventListener('minote:stroke-finished',()=>{
 if(!auto.checked||!modelAvailable||document.hidden||dialog.open||window.MiNoteMath?.enabled)return;
 clearTimeout(detectTimer);
 detectTimer=setTimeout(()=>{
  const pg=snapshot();if(!pg)return;
  const signature=pg.id+'|'+pg.strokes?.length;
  if(signature===lastSignature)return;
  lastSignature=signature;
  void recognize({silent:true});
 },6500);
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){clearTimeout(detectTimer);closeSuggestion();}
 else if(auto.checked)void checkModel({silent:true});
});
// Recuperar el estado real de ML Kit al iniciar la app; la casilla se
// conserva entre sesiones, pero modelAvailable comienza en false.
if(auto.checked)void checkModel({silent:true});
