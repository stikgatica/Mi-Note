/* Mi Note X10: importación segura de la memoria interna de la agenda. */
const $=id=>document.getElementById(id);
const modal=$('x10MemoryDialog'),open=$('x10MemoryOpen'),select=$('x10MemoryNotebook');
const message=$('x10MemoryProgress'),run=$('x10MemoryRun'),cancel=$('x10MemoryCancel');
const resume=$('x10MemoryResumeDrawing');
const exportDiagnostic=$('x10MemoryDiagnosticExport');
function diagnostic(){
 return window.MiNoteX10Offline?.getLastDiagnostic?.(false)||null;
}
let exportingDiagnostic=false;
async function saveDiagnostic(){
 if(exportingDiagnostic||active)return;
 const overview=diagnostic();
 if(!overview){info('Todavía no hay diagnóstico. Conecte la X10 y ejecute Importar memoria; luego exporte el resultado.',true);return;}
 if(!window.MiNotePrivateBackup?.saveDiagnostic){
  info('El selector de archivos Android no está disponible en esta instalación. Compruebe que usa Mi Note V0.28.',true);return;
 }
 const raw=window.confirm('¿Incluir muestras HEX de los paquetes X10? Podrían revelar contenido manuscrito. Aceptar: incluir muestras. Cancelar: solo estadísticas.');
 const data=window.MiNoteX10Offline.getLastDiagnostic(raw);
 exportingDiagnostic=true;
 exportDiagnostic.disabled=true;
 try{
  info('Seleccione una carpeta y confirme el nombre del archivo JSON en Android.');
  const result=await window.MiNotePrivateBackup.saveDiagnostic({content:JSON.stringify(data,null,2)});
  if(result?.cancelled){info('Se canceló el guardado. Ningún archivo fue creado.',true);return;}
  if(!result?.saved)throw Error('Android no confirmó la escritura del archivo.');
  info('Diagnóstico guardado por Android: '+(result.name||'MiNote_X10_diagnostico_local.json')+' ('+(result.bytes||0)+' bytes).');
 }catch(error){
  info('No se pudo guardar el diagnóstico: '+(error?.message||String(error)),true);
 }finally{
  exportingDiagnostic=false;
  exportDiagnostic.disabled=active;
 }
}
exportDiagnostic?.addEventListener('click',()=>void saveDiagnostic());

let active=false;
const info=(value,warn=false)=>{if(message){message.textContent=value;message.dataset.warning=warn?'true':'false';}};
function engine(){return window.MiNoteX10Import;}
function refresh(){
 const api=engine();if(!api){info('La función de lectura todavía no está disponible.',true);return;}
 const old=select.value;
 const list=api.notebooks();
 select.replaceChildren();
 const special=document.createElement('option');special.value='__new__';special.textContent='＋ Crear cuaderno para las páginas X10';
 select.appendChild(special);
 for(const n of list){
  const option=document.createElement('option');option.value=n.id;
  option.textContent=n.title+' · '+n.pages+' páginas';
  select.append(option);
 }
 const previous=list.find(n=>n.id===old);
 select.value=previous?old:'__new__';
 updateNewField();
 if(!api.connected())info('Conecte primero la Huion X10 mediante el botón superior. La lectura no elimina nada de la agenda.');
 else info('Huion conectada. Seleccione el cuaderno de destino y pulse Importar memoria.');
}
function updateNewField(){
 const show=select.value==='__new__';
 $('x10MemoryNewNameWrap').hidden=!show;
}
function busy(flag){
 active=flag;
 run.disabled=flag;select.disabled=flag;
 $('x10MemoryName').disabled=flag;
 $('x10MemoryPin').disabled=flag;
 cancel.disabled=!flag;
 if(resume)resume.disabled=flag;
 if(exportDiagnostic)exportDiagnostic.disabled=flag||exportingDiagnostic;
 $('x10MemoryClose').disabled=flag;
}
async function importMemory(){
 const api=engine();
 if(!api){info('La lectura X10 no está disponible.',true);return;}
 if(!api.connected()){info('Conecte primero la Huion X10 pulsando X10.',true);return;}
 if(api.busy()||active){info('Ya existe una importación en curso.',true);return;}
 const enteredPin=$('x10MemoryPin').value.trim();
 if(enteredPin && !/^\d{6}$/.test(enteredPin)){info('El PIN opcional debe tener exactamente seis cifras.',true);return;}
 // La lectura utiliza siempre la sesión de agenda oficial completa, validada con la X10.
 busy(true);
 let destination=select.value;
 try{
  if(destination==='__new__'){
   const name=$('x10MemoryName').value.trim()||'Huion X10 · Memoria';
   destination=await api.createNotebook(name);
   // Mantener el cuaderno recién creado como destino si falla un paquete:
   // al reintentar no se generan cuadernos vacíos duplicados.
   refresh();select.value=destination;updateNewField();
   info('Cuaderno creado. Iniciando lectura física…');
  }
  const result=await api.start({
   notebookId:destination,pin:enteredPin,
   onProgress:message=>info(message)
  });
  const pending=result.pendingIndices?.length
   ?' Pendientes de recuperar: páginas físicas '+result.pendingIndices.map(i=>i+1).join(', ')+'.'
   :'';
  info('Lectura finalizada: '+result.imported+' páginas guardadas ('+(result.revised||0)+' versiones nuevas, '+result.partialImported+' MUESTRAS PARCIALES), '+result.duplicate+' repetidas, '+(result.incomplete||0)+' pendientes, '+result.empty+' vacías.'+pending+' Datos guardados en Mi Note; memoria X10 intacta.',!!result.incomplete);
  $('x10MemoryPin').value='';
  // Refrescar la lista de cuadernos sin ocultar el mensaje.
  const list=api.notebooks();
  select.replaceChildren();
  for(const n of list){
   const opt=document.createElement('option');opt.value=n.id;opt.textContent=n.title+' · '+n.pages+' páginas';
   select.append(opt);
  }
  select.value=destination;
  updateNewField();
 }catch(e){info('Lectura interrumpida: '+(e?.message||e)+'. Las páginas recuperadas se conservan en Mi Note.',true);}
 finally{
  busy(false);
  // Mantener el modo de agenda después de importar; la escritura en vivo se activa al reconectar.
 }
}
open?.addEventListener('click',()=>{
 $('mobileMoreDialog')?.close();
 if(!modal||!engine())return;
 refresh();modal.showModal();
});
select?.addEventListener('change',updateNewField);
run?.addEventListener('click',()=>void importMemory());
resume?.addEventListener('click',async()=>{
 const api=engine();if(active||api?.busy())return;
 if(!api?.connected()){info('La X10 no está conectada. Pulse X10 para conectarla.',true);return;}
 resume.disabled=true;
 try{
  info('Activando lápiz X10 en la hoja abierta…');
  await api.restore();
  modal?.close();
 }catch(error){info('No fue posible activar la escritura: '+error.message,true);}
 finally{resume.disabled=false;}
});
cancel?.addEventListener('click',()=>{
 if(!active)return;
 engine()?.cancel();
 info('Cancelación solicitada: se conservarán las páginas ya recuperadas.');
});
$('x10MemoryClose')?.addEventListener('click',()=>{if(!active)modal.close();});
modal?.addEventListener('cancel',e=>{if(active)e.preventDefault();});
