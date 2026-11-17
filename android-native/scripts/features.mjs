// Patch exclusivamente para el paquete Android: la PWA clásica sigue disponible.
// Inserta controles para escuchar 0x8A y leer páginas almacenadas sin borrarlas.
import fs from 'node:fs/promises';
import path from 'node:path';
const stage=path.resolve('stage');
const index=path.join(stage,'index.html');
const app=path.join(stage,'app.js');
let html=await fs.readFile(index,'utf8');
const target='<div id="x10Details" class="x10-details">';
if(!html.includes(target))throw Error('Falta panel de estado X10.');
html=html.replace(target, `<section id="x10PhysicalTools" style="margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:10px">
  <strong>Agenda física X10</strong>
  <div class="x10-row">
    <button type="button" id="x10ListenPage" class="subtle">Activar botón físico de nueva página</button>
    <button type="button" id="x10RestorePen" class="subtle">Volver a escritura en vivo</button>
    <button type="button" id="x10OfflineDownload" class="primary">Extraer páginas guardadas</button>
  </div>
  <label class="field">PIN de la X10 (solo si la agenda lo pide)
    <input id="x10OfflinePin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="Opcional, 6 dígitos">
  </label>
  <div id="x10OfflineStatus" class="x10-details" role="status" aria-live="polite">Conecta la X10 antes de descargar.</div>
  <div class="x10-row"><button type="button" id="x10CancelDownload" class="subtle" hidden>Detener lectura</button></div>
  <small>No se borran páginas de la agenda; las hojas se importan como nuevas al cuaderno activo. Guarda copia JSON antes de reinstalar el APK.</small>
 </section>
`+target);
await fs.writeFile(index,html);

let js=await fs.readFile(app,'utf8');
const anchor='function x10RefreshCapability(){';
if(!js.includes(anchor))throw Error('No existe el punto de inserción x10RefreshCapability.');
const features=`
let x10DownloadController=null;
async function x10ImportOfflinePage(result,destinationId){
 if(!result?.digest||!Array.isArray(result.strokes))throw Error('La página X10 no tiene un formato válido.');
 const notebook=state.notebooks.find(n=>n.id===destinationId);
 if(!notebook)throw Error('El cuaderno de destino ya no existe. No se importó esta página.');
 if(state.notebooks.some(n=>n.pages.some(p=>p.huion?.digest===result.digest&&p.huion?.physicalPage===result.page)))
  return 'duplicate';
 if(!result.strokes.length)throw Error('La hoja física '+result.page+' no contiene trazos decodificables. No se guardará una página vacía.');
 
 const imported=emptyPage(notebook.pages.length+1);
 imported.title='X10 · página física '+(result.page+1)+(result.partial?' · MUESTRA PARCIAL':'');
 imported.template='plain';
 imported.huion={device:'Huion Note X10',physicalPage:result.page,digest:result.digest,
   packetCount:result.packet_count,partial:!!result.partial,partialReason:result.partialReason||null,sampleCount:result.sampleCount||null,
   createdBy:'offline-read-only',readAt:now(),source:'internal-memory'};
 const limits={maxX:result.max_x,maxY:result.max_y,maxPressure:result.max_press};
 // El formato de la X10 entrega coordenadas absolutas de hoja A5.
 for(const source of result.strokes){
  const points=[],raw=[];
  for(const p of source){
   if(p.x>limits.maxX||p.y>limits.maxY||p.x<0||p.y<0)continue;
   const xy=MiNoteX10Ble.mapPoint(p,limits.maxX,limits.maxY,0,W,H,true);
   if(xy){
    points.push([xy[0],xy[1],Math.max(.08,Math.min(1,p.press/(limits.maxPressure||8191)))]);
    raw.push([p.x,p.y,p.press]);
   }
  }
  if(points.length>=1)imported.strokes.push({
   id:uid(),color:'#173f7a',width:3,pts:points,
   x10:{device:'Huion Note X10',mode:'offline',rotation:0,limits:clone(limits),raw}
  });
 }
 if(!imported.strokes.length)throw Error('La hoja física '+result.page+' llegó sin trazos válidos. No se importó.');
 // Un cuaderno creado para la importación no necesita conservar una primera hoja en blanco.
 if(notebook.huionSource==='internal-memory'&&notebook.pages.length===1&&
    notebook.pages[0].strokes.length===0&&notebook.pages[0].title==='Hoja 1'){
  notebook.pages.splice(0,1);
 }
 notebook.pages.push(imported);
 notebook.updatedAt=now();
 // Refrescar los contadores sin cambiar la página visible.
 render();
 // El guardado normal emitirá el evento de sincronización de Drive.
 await persist();
 return 'imported';
}
function setupX10PhysicalTools(){
 if(!window.MiNoteNativeBLE)return;
 const listen=$('x10ListenPage'),sync=$('x10OfflineDownload'),restore=$('x10RestorePen');
 const status=$('x10OfflineStatus'),cancel=$('x10CancelDownload'),pin=$('x10OfflinePin');
 if(!listen||!sync)return;

 window.MiNoteX10Import={
  connected:()=>!!x10Connection?.connected,
  busy:()=>!!x10DownloadController,
  notebooks:()=>state.notebooks.map(n=>({id:n.id,title:n.title,pages:n.pages.length})),
  async createNotebook(title){
   if(x10DownloadController)throw Error('No es posible crear un cuaderno mientras se importa.');
   const name=String(title||'Huion X10 · Memoria').trim().slice(0,90);
   if(!name)throw Error('Indique un nombre de cuaderno.');
   const nb=emptyNotebook(name);
   nb.huionSource='internal-memory';
   state.notebooks.push(nb);
   await persist();
   render();
   return nb.id;
  },
  cancel(){if(x10DownloadController)x10DownloadController.abort();},
  restore:()=>{if(!x10Connection?.connected)throw Error('Conecte primero la Huion X10.');return x10Connection.probeTablet();},
  async start({notebookId,pin:pinCode='',onProgress=()=>{}}={}){
   if(!x10Connection?.connected)throw Error('Primero conecte la Huion X10 desde el botón superior.');
   if(!window.MiNoteX10Offline)throw Error('El lector de memoria física X10 no está disponible.');
   if(x10DownloadController)throw Error('Ya hay una importación en curso.');
   if(!state.notebooks.some(n=>n.id===notebookId))throw Error('Seleccione un cuaderno de destino válido.');
   if(pinCode && !/^\\d{6}$/.test(pinCode))throw Error('El PIN debe contener seis cifras.');
   x10Flush();
   const controller=new AbortController();
   x10DownloadController=controller;
   sync.disabled=true;listen.disabled=true;restore.disabled=true;cancel.hidden=false;cancel.disabled=false;
   const notify=message=>{onProgress(message);status.textContent=message;};
   try{
    notify('Comprobando memoria interna; no se borrará ningún dato físico…');
    const result=await MiNoteX10Offline.download(x10Connection,{
     pin:pinCode,signal:controller.signal,maxPages:64,
     onProgress:notify,
     onPage:async result=>x10ImportOfflinePage(result,notebookId)
    });
    notify('Importación terminada: '+result.imported+' páginas nuevas ('+(result.partialImported||0)+' muestras PARCIALES, no escritura reconstruida), '+result.duplicate+' repetidas y '+result.empty+' vacías. Sin borrado de memoria X10.');
    return result;
   }catch(err){
    notify('Importación interrumpida: '+err.message+'. Las páginas que sí se guardaron se conservan.');
    throw err;
   }finally{
    x10DownloadController=null;
    sync.disabled=false;listen.disabled=false;restore.disabled=false;cancel.hidden=true;cancel.disabled=false;
    pin.value='';
    x10Details();
   }
  }
 };

 listen.onclick=async()=>{
  if(!x10Connection?.connected){status.textContent='Primero conecta tu Huion X10.';return;}
  try{
   await x10Connection.enablePhysicalPageButton();
   status.textContent='Modo agenda solicitado. Pulsa el botón físico de nueva página y comprueba si aparece una hoja digital.';
  }catch(e){status.textContent='No se pudo activar: '+e.message;}
 };
 restore.onclick=async()=>{
  if(!x10Connection?.connected){status.textContent='Conecta primero la X10.';return;}
  try{
   if(x10DownloadController)throw Error('Termina la lectura antes de activar la escritura.');
   await x10Connection.probeTablet();
   status.textContent='Modo escritura en vivo solicitado. Haz un trazo sobre la agenda.';
  }catch(e){status.textContent='No se pudo restaurar la escritura: '+e.message;}
 };
 cancel.onclick=()=>{x10DownloadController?.abort();cancel.disabled=true;status.textContent='Cancelando después del paquete en curso…';};
 sync.onclick=()=>{
  window.MiNoteX10Import.start({
   notebookId:note().id,
   pin:pin.value.trim(),
   onProgress:msg=>{status.textContent=msg;}
  }).catch(err=>{status.textContent='Importación interrumpida: '+err.message;});
 };
}
`;
js=js.replace(anchor,features+'\n'+anchor);
const setupEnd='function setupX10(){';
if(!js.includes(setupEnd))throw Error('No existe setupX10.');
js=js.replace(setupEnd,setupEnd+'\n setupX10PhysicalTools();');
await fs.writeFile(app,js);
console.log('Funcionalidades X10 Android: cambio de hoja y extracción offline incorporadas.');
