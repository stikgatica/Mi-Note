/* V0.51 — Datos de la X10 sin modificar su memoria física.
 * 0x85 devuelve un índice de páginas, NO el espacio restante. */
import './x10-device-info.css';
import {memoryFromIndex,batteryFromGatt,compareHuionReadings} from './x10-metrics.mjs';
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
 '<div class="minote-device-meter" id="x10BatteryMeter" role="img" aria-label="Batería sin lectura"><span id="x10BatteryValue">—</span></div>',
 '<strong>Batería restante</strong><small id="x10BatteryExplanation">Conecte la X10 para consultar.</small>',
 '</div><div class="minote-device-metric">',
 '<div class="minote-device-meter minote-device-memory" id="x10MemoryMeter" role="img" aria-label="Memoria estimada"><span id="x10MemoryValue">—</span></div>',
 '<strong>Memoria restante</strong><small id="x10MemoryExplanation">Capacidad libre no disponible.</small>',
 '</div></div>',
 '<div class="minote-device-actions">',
 '<button type="button" class="subtle" id="x10DeviceRefresh">↻ Consultar información</button>',
 '<button type="button" class="subtle minote-device-danger" id="x10DeviceClearCache">Limpiar caché de la Huion X10</button>',
 '</div>',
 '<div class="minote-metrics-compare"><strong>Comparar con Huion Note (opcional)</strong>', 
 '<p>Ingrese los valores que muestre la app oficial en esta misma sesión. No modifica ni borra páginas.</p>',
 '<div class="minote-metrics-fields"><label>Batería oficial (%)<input id="x10OfficialBattery" type="number" min="0" max="100" step="1" placeholder="0–100"></label>',
 '<label>Memoria libre oficial (de 50)<input id="x10OfficialMemory" type="number" min="0" max="50" step="1" placeholder="0–50"></label></div>',
 '<button id="x10CompareMetrics" type="button">Comparar lecturas</button>',
 '<p id="x10MetricsComparison" role="status" aria-live="polite"></p></div>',
 '<p class="minote-device-note" id="x10DeviceHint">La limpieza de la Huion X10 utiliza el comando físico CLEAR_CACHE (0x8C). Puede afectar las notas almacenadas sin conexión. Exporte y compruebe sus notas antes de utilizarla.</p>',
 '<div class="minote-device-firmware"><strong>Actualizaciones de firmware</strong>',
 '<p>Para comprobar o instalar firmware de la X10, use la aplicación oficial Huion Note. Mi Note no modifica el firmware de la agenda.</p>',
 '</div>'
].join('');
status.before(root);
const $=id=>document.getElementById(id);
let connected=false,level=null,lastIndex=null,queryTimer=0,queryReceived=false,clearing=false;
let batteryAt=null,batterySource='gatt-2a19',batteryCompare=null,sessionReference=null;
const asNumber=input=>input?.value?.trim()!==''&&Number.isInteger(Number(input.value))?Number(input.value):null;
function paint(){
 const meter=$('x10BatteryMeter'),memoryMeter=$('x10MemoryMeter');
 const battery=batteryFromGatt({connected,level,readAt:batteryAt,source:batterySource});
 const memory=connected?memoryFromIndex(lastIndex,{reference:sessionReference}):memoryFromIndex(null);
 const valid=battery.available;
 $('x10BatteryValue').textContent=valid?battery.level+'%':'—';
 meter.style.setProperty('--x10-progress',valid?battery.level+'%':'0%');
 meter.dataset.known=String(valid);
 meter.setAttribute('aria-label',valid?'Lectura GATT '+battery.level+' por ciento':'Sin lectura de batería vigente');
 $('x10BatteryExplanation').textContent=valid?
  'GATT 2A19 · '+new Date(battery.readAt).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+
   ' · no corroborado con Huion Note'+(batteryCompare?.batteryMismatch?' · DISCREPANCIA':''):
  'Batería: '+battery.reason+'. Pulse Consultar información.';
 $('x10MemoryValue').textContent=memory.available?'≈'+memory.free+'/50':'—';
 memoryMeter.style.setProperty('--x10-progress',memory.available?(memory.free/50*100)+'%':'0%');
 memoryMeter.setAttribute('aria-label',memory.available?'Estimación de memoria libre: '+memory.free+' de 50':'Memoria libre no disponible');
 $('x10MemoryExplanation').textContent=memory.available?
  'Estimación no verificada · índice '+memory.index+' (0x85). '+(memory.verified?'Coincide con la app oficial en esta sesión.':'No equivale a espacio libre confirmado.'):
  'Sin lectura de capacidad libre. El índice NO equivale a espacio libre.';
 $('x10DeviceRefresh').disabled=!connected;
 $('x10DeviceClearCache').disabled=!connected||clearing;
 $('x10CompareMetrics').disabled=!connected;
}
function refreshConnection(){
 connected=!!document.getElementById('x10OpenBtn')?.classList.contains('is-connected');
 if(!connected){level=null;lastIndex=null;batteryAt=null;sessionReference=null;batteryCompare=null;}
 paint();
}
window.addEventListener('minote:x10-battery',event=>{
 connected=!!event.detail?.connected;
 level=Number.isInteger(event.detail?.level)?event.detail.level:null;
 batteryAt=Number.isInteger(event.detail?.readAt)?event.detail.readAt:null;
 batterySource=event.detail?.source||'gatt-2a19';
 if(!connected){lastIndex=null;sessionReference=null;batteryCompare=null;}
 paint();
});
window.addEventListener('minote:x10-memory-index',event=>{
 if(!connected)return;
 const index=event.detail?.lastIndex;
 if(Number.isInteger(index)&&index>=0&&index<=65535){
  lastIndex=index;
  sessionReference=null; // Una respuesta nueva exige volver a cotejar con Huion Note.
  queryReceived=true;
  clearTimeout(queryTimer);
  $('x10DeviceHint').textContent='Consulta de solo lectura. El índice informado no permite calcular la memoria libre.';
  paint();
 }
});
$('x10CompareMetrics').addEventListener('click',()=>{
 if(!connected)return;
 const officialBattery=asNumber($('x10OfficialBattery'));
 const officialFree=asNumber($('x10OfficialMemory'));
 if((officialBattery!==null&&(officialBattery<0||officialBattery>100))||
    (officialFree!==null&&(officialFree<0||officialFree>50))){
  $('x10MetricsComparison').textContent='Ingrese batería 0–100 y memoria libre 0–50.';return;
 }
 if(officialBattery===null&&officialFree===null){
  $('x10MetricsComparison').textContent='Ingrese al menos una cifra de la aplicación oficial.';return;
 }
 const estimated=memoryFromIndex(lastIndex);
 batteryCompare=compareHuionReadings({batteryLevel:level,batteryAt,free:estimated.free,
  index:lastIndex,officialBattery,officialFree});
 if(officialFree!==null&&estimated.available){
  sessionReference={index:lastIndex,free:officialFree,capacity:50,sameSession:true};
 }
 const lines=[];
 if(officialBattery!==null){
  if(batteryCompare.batteryDifference===null)lines.push('Batería: lectura BLE sin vigencia; vuelva a consultar.');
  else lines.push('Batería: diferencia '+batteryCompare.batteryDifference+' puntos porcentuales'+
   (batteryCompare.batteryMismatch?'. Las dos aplicaciones discrepan: no tomar el dato GATT como exacto.':'.'));
 }
 if(officialFree!==null){
  lines.push(batteryCompare.memoryComparison==='matches'?
   'Memoria: coincide con la estimación para este índice, pero no demuestra que funcione con otros índices.':
   'Memoria: no coincide o falta una lectura 0x85. Se mantiene como estimación.');
 }
 $('x10MetricsComparison').textContent=lines.join(' ');
 paint();
});
const deviceButton=$('x10OpenBtn');
if(deviceButton)new MutationObserver(refreshConnection).observe(deviceButton,{attributes:true,attributeFilter:['class']});
dialog.addEventListener('close',()=>clearTimeout(queryTimer));
dialog.addEventListener('show',()=>{if(connected)void window.MiNoteX10BatteryRefresh?.();});
$('x10DeviceRefresh').addEventListener('click',async()=>{
 if(!connected)return;
 const hint=$('x10DeviceHint');
 queryReceived=false;
 hint.textContent='Consultando batería GATT 2A19 e índice 0x85 sin borrar contenido…';
 try{
  if(typeof window.MiNoteX10BatteryRefresh==='function')
   void Promise.resolve(window.MiNoteX10BatteryRefresh()).catch(()=>{batteryAt=null;paint();});
  const api=window.MiNoteX10DeviceInfo;
  if(typeof api?.queryMemoryIndex==='function'){
   await api.queryMemoryIndex();
   clearTimeout(queryTimer);
   if(!queryReceived)queryTimer=setTimeout(()=>{
    if(!queryReceived)hint.textContent='La Huion no respondió con un índice. No se borró ni modificó su memoria.';
   },4500);
  }else hint.textContent='Consulta de memoria no disponible en esta versión.';
 }catch(error){
  hint.textContent='No se pudo consultar: '+(error?.message||String(error))+
   '. La memoria de la X10 no se modificó.';
 }
});
$('x10DeviceClearCache').addEventListener('click',async()=>{
 if(!connected||clearing)return;
 const api=window.MiNoteX10DeviceInfo;
 if(typeof api?.clearDeviceCache!=='function'){
  $('x10DeviceHint').textContent='Limpieza física no disponible: el módulo Bluetooth no pudo cargarse.';
  return;
 }
 const notice='ATENCIÓN: Esta opción envía CLEAR_CACHE (0x8C) directamente a la Huion X10. '
  +'El repositorio de ingeniería inversa lo clasifica como destructivo y lo utiliza después de exportar y eliminar páginas. '
  +'No está verificado que elimine por sí solo todas las páginas guardadas. '
  +'Podría eliminar información no respaldada. ¿Ha exportado y comprobado todas sus notas y desea continuar?';
 if(!window.confirm(notice))return;
 const typed=window.prompt('Segunda confirmación: escriba LIMPIAR para autorizar el comando físico 0x8C. Cancelar no modifica la Huion.','');
 if(typed!=='LIMPIAR'){
  $('x10DeviceHint').textContent='Limpieza cancelada. No se envió ningún comando.';
  return;
 }
 clearing=true;paint();
 const hint=$('x10DeviceHint');
 hint.textContent='Enviando orden física 0x8C a la Huion X10 y verificando su respuesta…';
 try{
  const result=await api.clearDeviceCache();
  if(result?.acknowledged){
   lastIndex=null;
   hint.textContent='La Huion confirmó CLEAR_CACHE (0x8C). Compruebe en la app oficial qué notas permanecen. Esto no demuestra que todas las páginas hayan sido borradas.';
  }else hint.textContent='La limpieza no obtuvo confirmación; revise la agenda antes de cualquier nuevo intento.';
 }catch(error){
  hint.textContent='No se pudo confirmar la limpieza: '+(error?.message||String(error))+
   '. Revise la X10 antes de intentar nuevamente.';
 }finally{
  clearing=false;paint();
 }
});
refreshConnection();
