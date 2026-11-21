/* Mi Note Android V0.13: una sola barra flotante, también en modo TV. */
import {clampPosition,snapPosition,toRelative,fromRelative} from './floating-geometry.mjs';
const $=id=>document.getElementById(id);
const toolbar=$('tvBoardToolbar');
const panel=$('mobileMoreDialog');
const shell=$('sidebar');
if(!toolbar||!panel||!shell)throw Error('Mi Note V0.13 requiere la barra, biblioteca y menú de la V0.12.');
document.body.classList.add('clean-notes');
toolbar.hidden=false;
toolbar.setAttribute('aria-label','Herramientas flotantes Mi Note');
toolbar.classList.add('floating-bar');
const storage='minote_v013_';
const getBool=(key,fallback=false)=>{
 const value=localStorage.getItem(storage+key);return value===null?fallback:value==='1';
};
const saveBool=(key,value)=>localStorage.setItem(storage+key,value?'1':'0');
let axis=window.innerWidth>window.innerHeight?'vertical':'horizontal';
let locked=getBool('locked');
let minimized=getBool('minimized');
let idleTimer=null,move=null;
const node=(id,txt,title)=>{
 const button=document.createElement('button');button.type='button';button.id=id;button.textContent=txt;
 button.title=title;button.setAttribute('aria-label',title);return button;
};
const handle=node('tvBoardHandle','⠿','Mantenga pulsado para mover la barra');
handle.className='floating-handle';
toolbar.prepend(handle);
const redo=node('tvBoardRedo','↷','Rehacer');
$('tvBoardUndo')?.after(redo);
const library=node('tvBoardLibrary','▤','Abrir biblioteca de cuadernos');
$('tvBoardNext')?.after(library);
const minimize=node('floatingMinimize','−','Minimizar herramientas');
$('tvBoardMore')?.after(minimize);
const closeTv=$('tvBoardClose');
const libraryBackdrop=document.createElement('button');
libraryBackdrop.id='floatingLibraryBackdrop';libraryBackdrop.type='button';
libraryBackdrop.setAttribute('aria-label','Cerrar biblioteca');
libraryBackdrop.hidden=true;
document.body.append(libraryBackdrop);
const closeLibrary=node('floatingSidebarClose','✕','Cerrar biblioteca');
closeLibrary.className='icon-btn';shell.prepend(closeLibrary);
const menuItems=panel.querySelector('.mobile-actions-list');
const menuButton=(id,text,handler)=>{
 const b=node(id,text,text);menuItems?.append(b);b.addEventListener('click',()=>{
  if(panel.open)panel.close();handler();
 });return b;
};
menuButton('floatingLibraryMenu','▤ Biblioteca de cuadernos',()=>openLibrary());
menuButton('floatingX10DetailsMenu','⌁ Detalles de Huion X10',()=>{
 const dialog=$('x10Dialog');
 if(!dialog){window.alert('No se pudo abrir el panel Huion X10.');return;}
 if(!dialog.open)dialog.showModal();
});

const lockButton=menuButton('floatingLockMenu','◌ Bloquear posición de la barra',()=>setLocked(!locked));
const colorLabel=document.createElement('label');colorLabel.className='floating-color-label field';
colorLabel.textContent='Color del lápiz';
const color=document.createElement('input');color.type='color';color.id='floatingPenColor';
color.value=$('penColor')?.value||'#111827';
color.setAttribute('aria-label','Color del lápiz');colorLabel.append(color);
// Ajuste visible justo debajo del grosor, fuera de cualquier sección del menú.
const widthField=$('mobilePenWidth')?.closest('label');
if(widthField)widthField.after(colorLabel);else panel.append(colorLabel);
color.addEventListener('input',()=>{
 const original=$('penColor');if(!original)return;
 original.value=color.value;original.dispatchEvent(new Event('input',{bubbles:true}));
 original.dispatchEvent(new Event('change',{bubbles:true}));
});
$('penColor')?.addEventListener('input',()=>{color.value=$('penColor').value;});
function openLibrary(){
 if(panel.open)panel.close();
 document.body.classList.add('library-open');
 libraryBackdrop.hidden=false;
 shell.setAttribute('aria-hidden','false');
 closeLibrary.focus();
 wake();
}
function closeLibraryPanel(){
 document.body.classList.remove('library-open');
 libraryBackdrop.hidden=true;
 wake();
}
libraryBackdrop.addEventListener('click',closeLibraryPanel);
closeLibrary.addEventListener('click',closeLibraryPanel);
shell.querySelector('#notebookList')?.addEventListener('click',()=>queueMicrotask(closeLibraryPanel));
$('addNotebook')?.addEventListener('click',()=>queueMicrotask(closeLibraryPanel));
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&document.body.classList.contains('library-open')){
  e.preventDefault();closeLibraryPanel();
 }
});
library.addEventListener('click',openLibrary);
redo.addEventListener('click',()=>$('redoBtn')?.click());
function refresh(){
 toolbar.classList.toggle('floating-vertical',axis==='vertical');
 toolbar.classList.toggle('floating-locked',locked);
 toolbar.classList.toggle('floating-minimized',minimized);
 handle.disabled=locked;
 handle.title=locked?'La barra está bloqueada; desbloquee en el menú':'Arrastre para mover las herramientas';
 minimize.textContent=minimized?'▣':'−';
 minimize.title=minimized?'Expandir herramientas':'Minimizar herramientas';
 minimize.setAttribute('aria-label',minimize.title);
 lockButton.textContent=locked?'◉ Desbloquear barra':'◌ Bloquear barra';
 closeTv.hidden=!document.body.classList.contains('tv-board');
 $('tvBoardFullscreen').hidden=!document.body.classList.contains('tv-board');
 $('tvBoardOrientation').hidden=!document.body.classList.contains('tv-board');
 wake();
}
function setLocked(value){locked=value;saveBool('locked',locked);refresh();}
function syncAutomaticAxis(){
 // Se utiliza la orientación real del viewport; ambos giros horizontales
 // comparten la misma barra vertical, sin preferencia manual persistida.
 const desired=window.innerWidth>window.innerHeight?'vertical':'horizontal';
 if(axis===desired)return false;
 axis=desired;refresh();
 return true;
}
minimize.addEventListener('click',()=>{
 minimized=!minimized;saveBool('minimized',minimized);refresh();
 requestAnimationFrame(()=>place(true));
});
function getSavedPosition(){
 const landscape=window.innerWidth>window.innerHeight;
 const key=storage+'position_'+(landscape?'landscape':'portrait')+'_'+axis;
 try{
  const value=JSON.parse(localStorage.getItem(key));
  if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))return value;
 }catch{}
 return null;
}
function savePosition(){
 const landscape=window.innerWidth>window.innerHeight;
 localStorage.setItem(storage+'position_'+(landscape?'landscape':'portrait')+'_'+axis,
  JSON.stringify(toRelative({x:toolbar.offsetLeft,y:toolbar.offsetTop},window.innerWidth,window.innerHeight)));
}
function setPosition(x,y){
 const r=toolbar.getBoundingClientRect();
 const p=clampPosition(x,y,r.width,r.height,window.innerWidth,window.innerHeight,8);
 toolbar.style.setProperty('left',p.x+'px','important');
 toolbar.style.setProperty('top',p.y+'px','important');
 toolbar.style.setProperty('right','auto','important');
 toolbar.style.setProperty('bottom','auto','important');
 toolbar.style.setProperty('transform','none','important');
}
function place(keep=false){
 if(move)return;
 const rect=toolbar.getBoundingClientRect(),saved=getSavedPosition();
 let p;
 if(keep&&toolbar.style.left){
  p=clampPosition(toolbar.offsetLeft,toolbar.offsetTop,rect.width,rect.height,window.innerWidth,window.innerHeight,8);
 }else if(saved){
  p=fromRelative(saved,rect.width,rect.height,window.innerWidth,window.innerHeight,8);
 }else{
  p={x:Math.max(8,window.innerWidth-rect.width-9),y:Math.max(38,Math.min(62,window.innerHeight-rect.height-8))};
 }
 setPosition(p.x,p.y);
}
function wake(){
 toolbar.classList.remove('floating-idle');
 clearTimeout(idleTimer);
 idleTimer=setTimeout(()=>{
  if(!move&&!panel.open&&!document.body.classList.contains('library-open'))toolbar.classList.add('floating-idle');
 },3600);
}
toolbar.addEventListener('pointerdown',wake);
toolbar.addEventListener('focusin',wake);
handle.addEventListener('pointerdown',event=>{
 if(locked||event.button!==0&&event.pointerType==='mouse')return;
 event.preventDefault();event.stopPropagation();
 const box=toolbar.getBoundingClientRect();
 move={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top};
 handle.setPointerCapture(event.pointerId);
 toolbar.classList.add('floating-dragging');wake();
});
handle.addEventListener('pointermove',event=>{
 if(!move||event.pointerId!==move.pointerId)return;
 const dx=event.clientX-move.x,dy=event.clientY-move.y;
 setPosition(move.left+dx,move.top+dy);
});
const stopMove=event=>{
 if(!move||event.pointerId!==move.pointerId)return;
 const r=toolbar.getBoundingClientRect();
 const p=snapPosition(r.left,r.top,r.width,r.height,window.innerWidth,window.innerHeight,8);
 move=null;toolbar.classList.remove('floating-dragging');
 setPosition(p.x,p.y);savePosition();wake();
 try{handle.releasePointerCapture(event.pointerId);}catch{}
};
handle.addEventListener('pointerup',stopMove);
handle.addEventListener('pointercancel',stopMove);
function syncMode(){
 toolbar.hidden=false;
 closeTv.hidden=!document.body.classList.contains('tv-board');
 refresh();
 requestAnimationFrame(()=>place(true));
}
const tvObserver=new MutationObserver(syncMode);
tvObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
window.addEventListener('resize',()=>{
 requestAnimationFrame(()=>{
  const changed=syncAutomaticAxis();
  place(!changed);window.MiNotePageLayout?.repaint();
 });
},{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(()=>{
 syncAutomaticAxis();place(false);
},160),{passive:true});
syncAutomaticAxis();refresh();
requestAnimationFrame(()=>place(false));
