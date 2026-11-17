/* Mi Note X10: hoja A5 apaisada y pizarra optimizada para TV. */
const get=id=>document.getElementById(id);
const orientation=get('landscapeOrientation'), tv=get('tvBoardToggle');
const toolbar=get('tvBoardToolbar');
let tvMode=false;
let previousOrientation=null;
const pageLayout=()=>window.MiNotePageLayout;
let hintTimer=null;
const toast=message=>{const note=get('tvBoardHint');if(note){note.textContent=message;note.hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>{note.hidden=true;},5200);}};
function updateSelection(){
 const layout=pageLayout();
 if(!layout||!orientation)return;
 const current=layout.get().orientation;
 if(current==='landscape-ccw'){void selectOrientation('landscape-cw');return;}
 orientation.value=current;
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
 const layout=pageLayout();if(layout&&orientation){const value=layout.get().orientation;if(value==='landscape-ccw')void selectOrientation('landscape-cw');else orientation.value=value;}
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
 if(toolbar)toolbar.hidden=false; // La barra permanece visible también en el cuaderno limpio.
 pageLayout()?.repaint();
}
async function toggleTv(next){
 if(next===tvMode)return;
 tvMode=next;
 if(tvMode){
  previousOrientation=pageLayout()?.get()?.orientation||'landscape-cw';
  // Pedir pantalla completa inmediatamente durante el gesto del usuario.
  // Evitar await antes de requestFullscreen, o Android puede rechazarlo.
  const entering=fullscreenStart();
  updateTvLabel();
  if(previousOrientation==='portrait')await selectOrientation('landscape-cw');
  await entering;
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
 const cur=pageLayout()?.get()?.orientation||'landscape-cw';
 void selectOrientation(cur==='landscape-cw'?'portrait':'landscape-cw');
});
get('tvBoardFullscreen')?.addEventListener('click',()=>void fullscreenStart());
document.addEventListener('fullscreenchange',()=>{if(tvMode&&document.fullscreenElement===null)toast('La vista de pizarra sigue activa. Para ocultar barras, toque pantalla completa.');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tvMode&&!document.fullscreenElement)void toggleTv(false);});
window.addEventListener('resize',()=>pageLayout()?.repaint());
window.addEventListener('orientationchange',()=>pageLayout()?.repaint());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateSelection,{once:true});else updateSelection();
