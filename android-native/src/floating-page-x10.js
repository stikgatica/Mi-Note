/* V0.15: navegación de páginas y conexión X10 desde la barra móvil.
 * Reutiliza el almacén, navegación y BLE originales, sin duplicarlos. */
const $=id=>document.getElementById(id);
const num=$('floatingPageNumber'),count=$('pageCount'),originalNum=$('pageNumber');
const pageDialog=$('floatingPageDialog'),menu=$('mobileMoreDialog');
const x10Button=$('floatingX10Quick'),statusElement=$('x10Status'),deviceButton=$('x10OpenBtn');
const x10Panel=$('floatingX10Panel');
function pageState(){
 const index=Number.parseInt(originalNum?.textContent||'1',10);
 const total=Number.parseInt(count?.textContent||'1',10);
 const safeTotal=Number.isFinite(total)&&total>0?total:1;
 return {index:Math.max(1,Math.min(safeTotal,Number.isFinite(index)?index:1)),total:safeTotal};
}
function updatePages(){
 if(!num)return;
 const {index,total}=pageState();
 num.textContent=index+' / '+total;
 num.title='Página '+index+' de '+total+'. Abrir menú para ir a otra hoja o eliminar';
 num.setAttribute('aria-label',num.title);
 $('floatingPageDialogTitle').textContent='Página '+index+' de '+total;
 const deleteBtn=$('floatingPageDelete');
 if(deleteBtn){
  deleteBtn.disabled=total<=1;
  deleteBtn.title=total<=1?'Debe conservar al menos una hoja':'Eliminar hoja '+index+' de '+total;
 }
 const hint=$('floatingPageHint');
 if(hint)hint.textContent=total<=1?'Un cuaderno debe conservar al menos una hoja.':'Se pedirá confirmación antes de eliminar. La eliminación no se puede deshacer.';
}
function openPageMenu(){
 updatePages();
 if(!pageDialog.open){
  menu?.close();
  pageDialog.showModal();
 }
}
num?.addEventListener('click',openPageMenu);
$('floatingPageClose')?.addEventListener('click',()=>pageDialog?.close());
pageDialog?.addEventListener('click',event=>{if(event.target===pageDialog)pageDialog.close();});
$('floatingPageGo')?.addEventListener('click',()=>{
 pageDialog.close();
 originalNum?.click(); // abre el diálogo real que enumera todas las hojas
});
$('floatingPageDelete')?.addEventListener('click',()=>{
 const {total}=pageState();
 if(total<=1){updatePages();return;}
 // La acción original usa confirmación nativa y persiste automáticamente.
 // No crear un segundo borrador de datos que pueda divergir del cuaderno.
 $('deletePage')?.click();
 pageDialog.close();
 updatePages();
});
if(originalNum)new MutationObserver(updatePages).observe(originalNum,{childList:true,characterData:true,subtree:true});
if(count)new MutationObserver(updatePages).observe(count,{childList:true,characterData:true,subtree:true});
document.addEventListener('minote:page-rendered',updatePages);
updatePages();

const connectionButton=$('floatingX10ConnectNow'),disconnectButton=$('floatingX10DisconnectNow');
let manualConnecting=false;
function deviceState(){
 const connected=!!deviceButton?.classList.contains('is-connected');
 const message=(statusElement?.textContent||'').trim();
 const pending=!connected&&(/conectando|reconectando|selector|buscando|solicitando|dispositivo seleccionado/i.test(message)||manualConnecting);
 const failed=!connected&&!pending&&/error|fall[oó]|no pudo|no respondió|agotad|rechaz|cancelad|denegad/i.test(message);
 const value=connected?'connected':pending?'connecting':failed?'error':'disconnected';
 return {value,connected,message};
}
function updateX10(){
 const state=deviceState();
 const label=state.connected?'Conectada':state.value==='connecting'?'Conectando…':state.value==='error'?'Error de conexión':'Desconectada';
 for(const el of [$('floatingX10QuickDot'),$('floatingX10MenuDot')]){
  if(el)el.dataset.status=state.value;
 }
 $('floatingX10Label').textContent='Huion X10 · '+label;
 if(x10Panel)x10Panel.dataset.status=state.value;
 if(x10Button){
  x10Button.title='X10 '+label+'. '+(state.connected?'Ver detalles':'Conectar');
  x10Button.setAttribute('aria-label',x10Button.title);
  x10Button.dataset.status=state.value;
 }
 connectionButton.disabled=state.connected||state.value==='connecting';
 disconnectButton.disabled=!state.connected;
 const shortcut=$('floatingX10Menu');
 if(shortcut)shortcut.textContent=(state.connected?'●':state.value==='connecting'?'◌':state.value==='error'?'!':'○')+' Huion X10 · '+label;
}
function closeMenu(){if(menu?.open)menu.close();}
function openX10Details(){
 closeMenu();
 const dialog=$('x10Dialog');
 if(dialog&&!dialog.open)dialog.showModal();
}
function connectDirect(){
 // No abrir otro diálogo antes del selector BLE: debe partir del toque real.
 closeMenu();
 manualConnecting=true;
 updateX10();
 $('x10DirectConnect')?.click();
 // El estado definitivo se consulta desde el botón nativo X10 y su diagnóstico.
 // Reiniciar solo el estado pendiente local, no desconectar Bluetooth.
 setTimeout(()=>{manualConnecting=false;updateX10();},14000);
}
function disconnectX10(){
 closeMenu();
 if(!deviceState().connected)return;
 // Misma acción que el diálogo X10, que detiene reconexiones y libera BLE.
 $('x10Connect')?.click();
 updateX10();
}
x10Button?.addEventListener('click',()=>{
 if(deviceState().connected||deviceState().value==='connecting')openX10Details();
 else connectDirect();
});
connectionButton?.addEventListener('click',connectDirect);
disconnectButton?.addEventListener('click',disconnectX10);
$('floatingX10ViewStatus')?.addEventListener('click',openX10Details);
const statusHint=$('floatingX10Indicator');
statusHint?.addEventListener('click',openX10Details);
if(deviceButton)new MutationObserver(updateX10).observe(deviceButton,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true});
if(statusElement)new MutationObserver(updateX10).observe(statusElement,{childList:true,characterData:true,subtree:true});
menu?.addEventListener('click',event=>{
 if(event.target?.id==='floatingX10Panel')event.stopPropagation();
});
updateX10();
