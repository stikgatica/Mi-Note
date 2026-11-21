/* Mi Note X10: importación segura de la memoria interna de la agenda. */
const $=id=>document.getElementById(id);
const modal=$('x10MemoryDialog'),open=$('x10MemoryOpen'),select=$('x10MemoryNotebook');
const message=$('x10MemoryProgress'),run=$('x10MemoryRun'),cancel=$('x10MemoryCancel');
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
  // Importación y copia local NO autorizan por sí solas a borrar la X10.
  // El respaldo debe estar cifrado, releído y cotejado, y el usuario debe
  // confirmar que Drive terminó la sincronización en la nube.
  const eligible=result.eligiblePages||[];
  if(!eligible.length){
   info('Importación guardada en Mi Note. No hay páginas completas verificadas para borrar; la Huion permanece intacta.');
  }else if(result.partialImported||result.incomplete||result.undecodable||result.pendingIndices?.length){
   info('Importación guardada, pero hay páginas parciales, ilegibles o pendientes. Por seguridad NO se borrará ninguna página física.',true);
  }else{
   info('Importación guardada. Actualizando automáticamente el respaldo cifrado de Drive y verificando su contenido…');
   try{
    const backup=await window.MiNoteDriveBackup?.prepareForPhysicalDelete?.(eligible);
    if(!backup?.verified||!backup.driveProvider)
     throw Error('El respaldo verificado en Google Drive no está disponible.');
    // Primera confirmación: SAF solo garantiza la copia del proveedor,
    // no que la nube de Google ya haya recibido el archivo.
    const first=window.confirm(
     'Mi Note guardó y volvió a leer la copia cifrada «'+backup.name+'» desde Google Drive. '+
     'Google Drive puede estar sincronizando en segundo plano. ¿Comprobó en Drive que '+
     'la copia ya está disponible en la nube y desea borrar SOLO las '+eligible.length+
     ' páginas importadas y verificadas de la agenda física?');
    if(!first){
     info('Respaldo cifrado actualizado. Borrado físico cancelado: las páginas permanecen en la Huion.');
    }else{
     const typed=window.prompt('Segunda confirmación: escriba BORRAR '+eligible.length+
      ' para eliminar de la Huion únicamente las páginas completas importadas.','');
     if(typed!=='BORRAR '+eligible.length){
      info('Segunda confirmación cancelada. No se borró ninguna página física.');
     }else{
      info('Respaldo verificado. Eliminando '+eligible.length+' páginas de la Huion, de mayor a menor índice…');
      const deletion=await api.deleteImported({pages:eligible,
       proof:{...backup,cloudUserConfirmed:true},onProgress:message=>info(message)});
      info('Huion confirmó el borrado de '+deletion.deleted.length+' páginas importadas. '+
       'Actualizando el estado de memoria…');
      try{
       const status=await window.MiNoteX10LiveStatusRefresh?.({force:true});
       info('Borrado confirmado: '+deletion.deleted.length+' páginas. Memoria X10: '+
        (status?.memory?status.memory.free+'/'+status.memory.total:'sin respuesta de la Huion')+
        '. Las copias locales y el respaldo cifrado permanecen conservados.');
      }catch{
       info('Borrado de '+deletion.deleted.length+' páginas confirmado. No fue posible leer la nueva memoria: vuelva a conectar la Huion.',true);
      }
     }
    }
   }catch(error){
    info('No se ha completado el borrado seguro: '+(error?.message||String(error))+
     '. Revise la memoria física y el respaldo antes de intentar de nuevo.',true);
   }
  }
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
  // La lectura termina en la misma sesión de agenda, sin reactivar ni cambiar de modo.
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
