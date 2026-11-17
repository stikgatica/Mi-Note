/* Mi Note X10: importación segura de la memoria interna de la agenda. */
const $=id=>document.getElementById(id);
const modal=$('x10MemoryDialog'),open=$('x10MemoryOpen'),select=$('x10MemoryNotebook');
const message=$('x10MemoryProgress'),run=$('x10MemoryRun'),cancel=$('x10MemoryCancel');
const exportDiagnostic=$('x10MemoryDiagnosticExport');
function diagnostic(){
 return window.MiNoteX10Offline?.getLastDiagnostic?.(false)||null;
}
function saveDiagnostic(){
 const overview=diagnostic();
 if(!overview){info('Aún no existe diagnóstico X10. Ejecute una lectura primero.',true);return;}
 const raw=window.confirm('¿Incluir muestras HEX de los paquetes de tinta de su Huion? Pueden contener trazos de escritura personal. Seleccione Cancelar para exportar únicamente contadores y estadísticas.');
 const data=window.MiNoteX10Offline.getLastDiagnostic(raw);
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='MiNote_X10_diagnostico_local.json';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
 info('Diagnóstico X10 exportado localmente ('+(raw?'incluye muestras de paquetes':'solo estadísticas')+'). La memoria física no se modificó.');
}
exportDiagnostic?.addEventListener('click',saveDiagnostic);

let active=false;
const info=(value,warn=false)=>{if(message){message.textContent=value;message.dataset.warning=warn?'true':'false';}};
function engine(){return window.MiNoteX10Import;}
function refresh(){
 const api=engine();if(!api){info('La función de lectura todavía no está disponible.',true);return;}
 if(exportDiagnostic)exportDiagnostic.hidden=!diagnostic();
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
 $('x10MemoryClose').disabled=flag;
}
async function importMemory(){
 const api=engine();
 if(!api){info('La lectura X10 no está disponible.',true);return;}
 if(!api.connected()){info('Conecte la Huion X10 usando Conectar X10.',true);return;}
 if(api.busy()||active){info('Ya existe una importación en curso.',true);return;}
 const enteredPin=$('x10MemoryPin').value.trim();
 if(enteredPin && !/^\d{6}$/.test(enteredPin)){info('El PIN opcional debe tener exactamente seis cifras.',true);return;}
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
  info('Lectura finalizada: '+result.imported+' páginas nuevas, '+result.duplicate+' repetidas y '+result.empty+' vacías. Las páginas ya están guardadas en Mi Note; el respaldo Drive se actualizará cuando esté configurado y activo.');
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
  if(exportDiagnostic)exportDiagnostic.hidden=!diagnostic();
  busy(false);
  if(api.connected()){
   try{await api.restore();}catch(e){info(message.textContent+' · Para continuar escribiendo, vuelva a conectar la Huion si fuese necesario.',true);}
  }
 }
}
open?.addEventListener('click',()=>{
 $('mobileMoreDialog')?.close();
 if(!modal||!engine())return;
 refresh();modal.showModal();
});
select?.addEventListener('change',updateNewField);
run?.addEventListener('click',()=>void importMemory());
cancel?.addEventListener('click',()=>{
 if(!active)return;
 engine()?.cancel();
 info('Cancelación solicitada: se conservarán las páginas ya recuperadas.');
});
$('x10MemoryClose')?.addEventListener('click',()=>{if(!active)modal.close();});
modal?.addEventListener('cancel',e=>{if(active)e.preventDefault();});
