/* Mi Note X10: hoja A5 apaisada y pizarra optimizada para TV. */
const get=id=>document.getElementById(id);
const orientation=get('landscapeOrientation'), tv=get('tvBoardToggle');
const toolbar=get('tvBoardToolbar');
let tvMode=false;
let previousOrientation=null;
const pageLayout=()=>window.MiNotePageLayout;
let hintTimer=null;
const toast=message=>{const note=get('tvBoardHint');if(note){note.textContent=message;note.hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>{note.hidden=true;},5200);}};
// Android cambia el viewport al girar físicamente el celular (autorrotación).
// Ambas orientaciones apaisadas mantienen landscape-cw, la misma rotación
// utilizada por Mi Note, sin espejar ni alterar coordenadas de tinta Huion.
const viewportOrientation=()=>window.innerWidth>window.innerHeight?'landscape-cw':'portrait';
function syncBoardViewport(){
 const landscape=window.innerWidth>window.innerHeight;
 document.body.classList.toggle('landscape-board',landscape);
 document.body.dataset.viewportMode=landscape?'pizarra-horizontal':'cuaderno-vertical';
 // La tinta sigue en el sistema original de coordenadas A5 de la X10.
 requestAnimationFrame(()=>pageLayout()?.repaint?.());
}
syncBoardViewport();
let orienting=false,orientationQueued=false;
async function updateSelection(){
 const layout=pageLayout();if(!layout)return;
 syncBoardViewport();
 const wanted=viewportOrientation();
 document.body.dataset.pageOrientation=wanted;
 if(orientation)orientation.value=wanted;
 if(layout.get()?.orientation===wanted){layout.repaint();return;}
 if(orienting){orientationQueued=true;return;}
 orienting=true;
 try{await layout.set(wanted);}
 catch(e){
  if(/trazo/i.test(e.message||'')){orientationQueued=true;}
  else toast('No fue posible adaptar la hoja al giro: '+e.message);
 }finally{
  orienting=false;
  if(orientationQueued){
   orientationQueued=false;
   setTimeout(()=>void updateSelection(),160);
  }
 }
}
const scheduleOrientation=()=>{
 syncBoardViewport();
 clearTimeout(scheduleOrientation.timer);
 scheduleOrientation.timer=setTimeout(()=>void updateSelection(),85);
};
orientation?.remove(); // La selección manual se reemplaza por el giro de Android.
document.addEventListener('minote:page-rendered',scheduleOrientation);
window.addEventListener('resize',scheduleOrientation,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(scheduleOrientation,120),{passive:true});
screen.orientation?.addEventListener?.('change',scheduleOrientation);
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
  if(previousOrientation==='portrait')await updateSelection();
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
// La hoja sigue siempre la orientación física: no hay giro manual.
get('tvBoardFullscreen')?.addEventListener('click',()=>void fullscreenStart());
document.addEventListener('fullscreenchange',()=>{if(tvMode&&document.fullscreenElement===null)toast('La vista de pizarra sigue activa. Para ocultar barras, toque pantalla completa.');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tvMode&&!document.fullscreenElement)void toggleTv(false);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleOrientation,{once:true});else scheduleOrientation();
