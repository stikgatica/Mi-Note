/* V0.51 — Datos de la X10 sin modificar su memoria física.
 * 0x85 devuelve un índice de páginas, NO el espacio restante. */
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
 '<div class="minote-device-meter" id="x10BatteryMeter" role="img" aria-label="Batería sin lectura"><span id="x10BatteryValue">—</span></div>',
 '<strong>Batería restante</strong><small id="x10BatteryExplanation">Conecte la X10 para consultar.</small>',
 '</div><div class="minote-device-metric">',
 '<div class="minote-device-meter minote-device-memory" role="img" aria-label="Memoria restante no disponible"><span>—</span></div>',
 '<strong>Memoria restante</strong><small id="x10MemoryExplanation">Capacidad libre no disponible.</small>',
 '</div></div>',
 '<div class="minote-device-actions">',
 '<button type="button" class="subtle" id="x10DeviceRefresh">↻ Consultar información</button>',
 '<button type="button" class="subtle minote-device-danger" id="x10DeviceClearCache">Limpiar caché de la Huion X10</button>',
 '</div>',
 '<p class="minote-device-note" id="x10DeviceHint">La limpieza de la Huion X10 utiliza el comando físico CLEAR_CACHE (0x8C). Puede afectar las notas almacenadas sin conexión. Exporte y compruebe sus notas antes de utilizarla.</p>',
 '<div class="minote-device-firmware"><strong>Actualizaciones de firmware</strong>',
 '<p>Para comprobar o instalar firmware de la X10, use la aplicación oficial Huion Note. Mi Note no modifica el firmware de la agenda.</p>',
 '</div>'
].join('');
status.before(root);
const $=id=>document.getElementById(id);
let connected=false,level=null,lastIndex=null,queryTimer=0,queryReceived=false,clearing=false;
function paint(){
 const meter=$('x10BatteryMeter');
 const valid=connected&&Number.isInteger(level)&&level>=0&&level<=100;
 $('x10BatteryValue').textContent=valid?level+'%':'—';
 meter.style.setProperty('--x10-progress',valid?level+'%':'0%');
 meter.dataset.known=String(valid);
 meter.setAttribute('aria-label',valid?'Batería '+level+' por ciento':'Batería sin lectura compatible');
 $('x10BatteryExplanation').textContent=valid?'Nivel real entregado por Bluetooth.':
  'Sin lectura compatible de la Huion X10.';
 $('x10MemoryExplanation').textContent=connected&&Number.isInteger(lastIndex)?
  'Último índice de página informado: '+lastIndex+'. No equivale a espacio libre.':
  'Sin lectura de capacidad libre.';
 $('x10DeviceRefresh').disabled=!connected;
 $('x10DeviceClearCache').disabled=!connected||clearing;
}
function refreshConnection(){
 connected=!!document.getElementById('x10OpenBtn')?.classList.contains('is-connected');
 if(!connected){level=null;lastIndex=null;}
 paint();
}
window.addEventListener('minote:x10-battery',event=>{
 connected=!!event.detail?.connected;
 level=Number.isInteger(event.detail?.level)?event.detail.level:null;
 paint();
});
window.addEventListener('minote:x10-memory-index',event=>{
 if(!connected)return;
 const index=event.detail?.lastIndex;
 if(Number.isInteger(index)&&index>=0&&index<=65535){
  lastIndex=index;
  queryReceived=true;
  clearTimeout(queryTimer);
  $('x10DeviceHint').textContent='Consulta de solo lectura. El índice informado no permite calcular la memoria libre.';
  paint();
 }
});
const deviceButton=$('x10OpenBtn');
if(deviceButton)new MutationObserver(refreshConnection).observe(deviceButton,{attributes:true,attributeFilter:['class']});
dialog.addEventListener('close',()=>clearTimeout(queryTimer));
$('x10DeviceRefresh').addEventListener('click',async()=>{
 if(!connected)return;
 const hint=$('x10DeviceHint');
 queryReceived=false;
 hint.textContent='Consultando batería e índice de páginas sin borrar contenido…';
 try{
  if(typeof window.MiNoteX10BatteryRefresh==='function')
   void Promise.resolve(window.MiNoteX10BatteryRefresh()).catch(()=>{});
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
