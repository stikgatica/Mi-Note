/* V0.15: navegación de páginas y conexión X10 desde la barra móvil.
 * Reutiliza el almacén, navegación y BLE originales, sin duplicarlos. */
const $=id=>document.getElementById(id);
const num=$('floatingPageNumber'),count=$('pageCount'),originalNum=$('pageNumber');
const pageDialog=$('floatingPageDialog'),menu=$('mobileMoreDialog');
const x10Button=$('floatingX10Quick'),statusElement=$('x10Status'),deviceButton=$('x10OpenBtn');
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

// Único control de Bluetooth para Android: Conectar X10.
let connecting=false;
function x10State(){
 const connected=!!deviceButton?.classList.contains('is-connected');
 const message=(statusElement?.textContent||'').trim();
 const pending=!connected&&(connecting||/conectando|reconectando|selector|buscando|solicitando|dispositivo seleccionado/i.test(message));
 const failure=!connected&&!pending&&/error|fall[oó]|no pudo|no respondió|agotad|rechaz|cancelad|denegad/i.test(message);
 return {connected,pending,failure,message};
}
function refreshX10(){
 const state=x10State();
 const dot=$('floatingX10QuickDot');
 if(dot)dot.dataset.status=state.connected?'connected':state.pending?'connecting':state.failure?'error':'disconnected';
 if(!x10Button)return;
 x10Button.disabled=state.pending;
 x10Button.dataset.status=dot?.dataset.status||'disconnected';
 x10Button.title=state.connected?'Huion X10 conectada':state.pending?'Conectando X10…':state.failure?'Error Bluetooth · toque para reintentar':'Conectar Huion X10';
 x10Button.setAttribute('aria-label',x10Button.title);
 // No ofrecer una segunda acción oculta al tocar el indicador.
 x10Button.lastChild.textContent=state.connected?' X10 conectada':state.pending?' Conectando X10':' Conectar X10';
}
x10Button?.addEventListener('click',()=>{
 if(x10State().connected||x10State().pending)return;
 menu?.close();
 connecting=true;refreshX10();
 // La petición nativa BLE se lanza en el mismo gesto táctil, sin await.
 $('x10DirectConnect')?.click();
 setTimeout(()=>{connecting=false;refreshX10();},12000);
});
if(deviceButton)new MutationObserver(refreshX10).observe(deviceButton,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true});
if(statusElement)new MutationObserver(()=>{connecting=false;refreshX10();}).observe(statusElement,{childList:true,characterData:true,subtree:true});
refreshX10();
