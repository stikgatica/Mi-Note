/* Mi Note X10: hoja A5 apaisada y pizarra optimizada para TV. */
const get=id=>document.getElementById(id);
const orientation=get('landscapeOrientation'), tv=get('tvBoardToggle');
const toolbar=get('tvBoardToolbar');
let tvMode=false;
let previousOrientation=null;
const pageLayout=()=>window.MiNotePageLayout;
const toast=message=>{const note=get('tvBoardHint');if(note){note.textContent=message;note.hidden=false;}};
function updateSelection(){
 const layout=pageLayout();
 if(!layout||!orientation)return;
 orientation.value=layout.get().orientation;
 document.body.dataset.pageOrientation=orientation.value;
 layout.repaint();
}
async function selectOrientation(value){
 const layout=pageLayout();if(!layout)return;
 try{
  await layout.set(value);
  updateSelection();
 }catch(e){toast('No fue posible cambiar la hoja: '+e.message);}
}
orientation?.addEventListener('change',()=>{void selectOrientation(orientation.value);});
document.addEventListener('minote:page-rendered',()=>{
 const layout=pageLayout();if(layout&&orientation)orientation.value=layout.get().orientation;
});
async function fullscreenStart(){
 if(!document.fullscreenElement&&document.documentElement.requestFullscreen){
  try{await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch(e){toast('Pantalla completa no disponible; se usa la vista ampliada.');}
 }
 try{
  if(screen.orientation?.lock)await screen.orientation.lock('landscape');
 }catch(e){toast('Gire el teléfono horizontalmente si Android no permite bloquear la orientación.');}
}
async function fullscreenStop(){
 try{screen.orientation?.unlock?.();}catch{}
 if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}
}
function updateTvLabel(){
 if(tv)tv.textContent=tvMode?'Salir de pizarra TV':'Proyectar en TV';
 document.body.classList.toggle('tv-board',tvMode);
 if(toolbar)toolbar.hidden=!tvMode;
 pageLayout()?.repaint();
}
async function toggleTv(next){
 if(next===tvMode)return;
 tvMode=next;
 if(tvMode){
  previousOrientation=pageLayout()?.get()?.orientation||'portrait';
  if(previousOrientation==='portrait')await selectOrientation('landscape-cw');
  updateTvLabel();
  await fullscreenStart();
 }else{
  await fullscreenStop();
  updateTvLabel();
  // La orientación elegida queda guardada en la página.
 }
}
tv?.addEventListener('click',()=>{get('mobileMoreDialog')?.close();void toggleTv(!tvMode);});
get('tvBoardClose')?.addEventListener('click',()=>void toggleTv(false));
get('tvBoardPrev')?.addEventListener('click',()=>get('prevPage')?.click());
get('tvBoardNext')?.addEventListener('click',()=>get('nextPage')?.click());
get('tvBoardPen')?.addEventListener('click',()=>get('penBtn')?.click());
get('tvBoardErase')?.addEventListener('click',()=>get('eraserBtn')?.click());
get('tvBoardUndo')?.addEventListener('click',()=>get('undoBtn')?.click());
get('tvBoardMore')?.addEventListener('click',()=>get('mobileMoreBtn')?.click());
get('tvBoardOrientation')?.addEventListener('click',()=>{
 const cur=pageLayout()?.get()?.orientation||'portrait';
 void selectOrientation(cur==='landscape-cw'?'landscape-ccw':'landscape-cw');
});
get('tvBoardFullscreen')?.addEventListener('click',()=>void fullscreenStart());
document.addEventListener('fullscreenchange',()=>{if(tvMode&&document.fullscreenElement===null)toast('La vista de pizarra sigue activa. Para ocultar barras, toque pantalla completa.');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tvMode&&!document.fullscreenElement)void toggleTv(false);});
window.addEventListener('resize',()=>pageLayout()?.repaint());
window.addEventListener('orientationchange',()=>pageLayout()?.repaint());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateSelection,{once:true});else updateSelection();
