/* Mi Note V0.65 — Detalles simples de la Huion X10.
 * Valores procedentes del protocolo 0x8E/0x8F, sin herramientas de diagnóstico.
 * CLEAR_CACHE 0x8C solo bajo doble confirmación explícita.
 */
import './x10-device-info.css';
const dialog=document.getElementById('x10Dialog');
const status=document.getElementById('x10Status');
if(!dialog||!status)throw Error('No está disponible el diálogo Huion X10.');
const root=document.createElement('section');
root.id='x10DeviceInfo';
root.className='minote-device-info';
root.setAttribute('aria-label','Detalles del dispositivo');
root.innerHTML=[
 '<h3>Detalles del dispositivo</h3>',
 '<div class="minote-device-metrics">',
 '<div class="minote-device-metric">',
 '<div class="minote-device-meter" id="x10BatteryMeter" role="img" aria-label="Batería"><span id="x10BatteryValue">—</span></div>',
 '<strong>Batería restante</strong><small id="x10BatteryExplanation">Conecte la X10 para consultar.</small>',
 '</div><div class="minote-device-metric">',
 '<div class="minote-device-meter minote-device-memory" id="x10MemoryMeter" role="img" aria-label="Memoria libre"><span id="x10MemoryValue">—</span></div>',
 '<strong>Memoria restante</strong><small id="x10MemoryExplanation">Conecte la X10 para consultar.</small>',
 '</div></div>',
 '<div class="minote-device-actions">',
 '<button type="button" class="subtle" id="x10DeviceRefresh">↻ Consultar información</button>',
 '<button type="button" class="subtle minote-device-danger" id="x10DeviceClearCache">Borrar páginas guardadas en la Huion X10</button>',
 '</div>',
 '<p class="minote-device-note" id="x10DeviceHint">Borrar páginas de la agenda física (0x8C) elimina notas almacenadas en la Huion. El respaldo local de Mi Note no se modifica.</p>',
 '<div class="minote-device-firmware"><strong>Firmware</strong>',
 '<p>Para actualizaciones de firmware utilice Huion Note oficial. Mi Note no cambia el firmware.</p></div>'
].join('');
status.before(root);
const $=id=>document.getElementById(id);
let connected=false,clearing=false,lastBattery=null,lastMemory=null,lastReadAt=0;
function paint(){
 const valid=connected&&lastReadAt>0&&Date.now()-lastReadAt<180000;
 const battery=valid?lastBattery:null,memory=valid?lastMemory:null;
 const batMeter=$('x10BatteryMeter'),memMeter=$('x10MemoryMeter');
 $('x10BatteryValue').textContent=battery?battery.percent+'%':'—';
 $('x10MemoryValue').textContent=memory?memory.free+'/'+memory.total:'—';
 batMeter.style.setProperty('--x10-progress',battery?battery.percent+'%':'0%');
 memMeter.style.setProperty('--x10-progress',memory?(memory.free/memory.total*100)+'%':'0%');
 batMeter.setAttribute('aria-label',battery?'Batería restante: '+battery.percent+'%':'Batería sin lectura');
 memMeter.setAttribute('aria-label',memory?'Memoria libre: '+memory.free+' de '+memory.total:'Memoria sin lectura');
 $('x10BatteryExplanation').textContent=battery?
   'Huion · '+new Date(lastReadAt).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):
   connected?'Lectura no disponible.':'Desconectada.';
 $('x10MemoryExplanation').textContent=memory?'Espacios disponibles de la Huion X10.':
   connected?'Lectura no disponible.':'Desconectada.';
 $('x10DeviceRefresh').disabled=!connected||clearing;
 $('x10DeviceClearCache').disabled=!connected||clearing||!!window.MiNoteX10Import?.busy?.();
}
function refreshConnection(){
 connected=!!$('x10OpenBtn')?.classList.contains('is-connected');
 if(!connected){lastBattery=null;lastMemory=null;lastReadAt=0;}
 paint();
}
window.addEventListener('minote:x10-battery',event=>{
 if(event.detail?.connected===false){connected=false;lastBattery=null;lastMemory=null;lastReadAt=0;paint();}
});
window.addEventListener('minote:x10-vendor-status',event=>{
 if(!event.detail?.connected)return;
 connected=true;
 lastBattery=event.detail.battery||null;
 lastMemory=event.detail.memory||null;
 lastReadAt=event.detail.readAt||Date.now();
 paint();
});
const button=$('x10OpenBtn');
if(button)new MutationObserver(refreshConnection).observe(button,{attributes:true,attributeFilter:['class']});
async function readStatus(){
 refreshConnection();
 if(!connected||clearing)return null;
 const hint=$('x10DeviceHint');
 hint.textContent='Consultando batería (0x8E) y memoria (0x8F) sin modificar páginas…';
 try{
  const result=await window.MiNoteX10LiveStatusRefresh?.({force:true});
  if(!result?.battery&&!result?.memory)throw Error('La Huion no respondió con datos de estado válidos.');
  hint.textContent='Estado actualizado. No se modificaron las páginas guardadas.';
  return result;
 }catch(error){
  hint.textContent='No se pudo actualizar: '+(error?.message||String(error))+'.';
  return null;
 }
}
$('x10DeviceRefresh').addEventListener('click',()=>{void readStatus();});
// Los elementos <dialog> no emiten un evento "show" estándar.
// Observar el atributo open funciona al pulsar Detalles X10 desde cualquier menú.
new MutationObserver(()=>{
 if(dialog.open){
  refreshConnection();
  if(connected)void readStatus();
 }
}).observe(dialog,{attributes:true,attributeFilter:['open']});
$('x10DeviceClearCache').addEventListener('click',async()=>{
 if(!connected||clearing||window.MiNoteX10Import?.busy?.())return;
 const api=window.MiNoteX10DeviceInfo;
 if(typeof api?.clearDeviceCache!=='function'){
  $('x10DeviceHint').textContent='El dispositivo no permite el borrado seguro en esta conexión.';
  return;
 }
 const notice='ATENCIÓN: BORRAR PÁGINAS de la Huion X10. '
  +'Este botón envía CLEAR_CACHE (0x8C), que elimina las páginas guardadas en la memoria física. '
  +'Solo continúe después de comprobar que tiene una copia de las notas importantes. ¿Desea continuar?';
 if(!window.confirm(notice))return;
 const typed=window.prompt('SEGUNDA CONFIRMACIÓN: escriba LIMPIAR para borrar las páginas físicas.','');
 if(typed!=='LIMPIAR'){
  $('x10DeviceHint').textContent='Borrado cancelado. No se modificaron las páginas.';return;
 }
 clearing=true;paint();
 const hint=$('x10DeviceHint');
 hint.textContent='Borrando páginas guardadas y comprobando respuesta de Huion…';
 try{
  const result=await api.clearDeviceCache();
  if(!result?.acknowledged)throw Error('La Huion no confirmó el borrado.');
  lastMemory=null;lastBattery=null;lastReadAt=0;
  hint.textContent='Huion confirmó la operación. Consultando nuevamente la memoria…';
  clearing=false;paint();
  const refreshed=await readStatus();
  hint.textContent=refreshed?.memory?
   'Borrado confirmado. Memoria libre: '+refreshed.memory.free+'/'+refreshed.memory.total+'.':
   'Borrado confirmado. No fue posible consultar la nueva capacidad; vuelva a intentar Consultar información.';
 }catch(error){
  hint.textContent='No se pudo confirmar el resultado: '+(error?.message||String(error))+
   '. Revise las páginas físicas antes de repetir la operación.';
 }finally{clearing=false;paint();}
});
refreshConnection();
