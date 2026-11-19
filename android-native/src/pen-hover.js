/* Indicador previo de punta: sólo capa visual.
 * Android S Pen / ratón: pointermove sin contacto.
 * Huion Note X10: exclusivamente muestras BLE no táctiles con coordenadas.
 * Si el hardware no transmite hover, no se simula una posición falsa. */
import './pen-hover.css';
import {isHoverPointer,toVisualPosition} from './pen-hover-geometry.mjs';

const paper=document.getElementById('paper');
const shell=paper?.closest('.paper-shell');
if(!paper||!shell)throw Error('No se encontró la hoja para el puntero de previsualización.');

const ring=document.createElement('span');
ring.id='minoteHoverTip';
ring.setAttribute('aria-hidden','true');
ring.dataset.visible='false';
shell.append(ring);

let touching=false,bleTimer=0,lastLocalHover=0;
const hide=()=>{
 clearTimeout(bleTimer);
 ring.dataset.visible='false';
};
function showClient(x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y)||document.hidden||touching)return;
 const p=paper.getBoundingClientRect(),s=shell.getBoundingClientRect();
 if(x<p.left||x>p.right||y<p.top||y>p.bottom)return hide();
 ring.style.left=(x-s.left)+'px';
 ring.style.top=(y-s.top)+'px';
 ring.dataset.visible='true';
}
function localHover(event){
 if(!isHoverPointer(event,touching||paper.hasPointerCapture?.(event.pointerId))){
  if(event.pointerType==='pen'||event.pointerType==='mouse')hide();
  return;
 }
 lastLocalHover=Date.now();
 showClient(event.clientX,event.clientY);
}
paper.addEventListener('pointerenter',localHover);
paper.addEventListener('pointerover',localHover);
paper.addEventListener('pointermove',localHover);
paper.addEventListener('pointerdown',event=>{
 if(event.pointerType==='pen'||event.pointerType==='mouse'){
  touching=true;hide();
 }
});
paper.addEventListener('pointerup',event=>{
 if(event.pointerType==='pen'||event.pointerType==='mouse'){
  touching=false;
  // Al levantar la punta se espera otra posición real sin contacto.
  hide();
 }
});
paper.addEventListener('pointercancel',()=>{touching=false;hide();});
paper.addEventListener('pointerleave',hide);
window.addEventListener('blur',hide);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
document.addEventListener('minote:page-rendered',hide);
window.addEventListener('orientationchange',hide,{passive:true});
window.addEventListener('resize',hide,{passive:true});

document.addEventListener('minote:x10-hover',event=>{
 // El dibujo y el hover sobre el teléfono tienen prioridad sobre Bluetooth.
 if(touching||Date.now()-lastLocalHover<800)return;
 const {x,y}=event.detail||{};
 const orientation=window.MiNotePageLayout?.get?.()?.orientation||'portrait';
 const uv=toVisualPosition(x,y,orientation);
 if(!uv)return hide();
 const p=paper.getBoundingClientRect();
 showClient(p.left+uv.u*p.width,p.top+uv.v*p.height);
 // Descarta posiciones antiguas si la tableta deja de informar proximidad.
 clearTimeout(bleTimer);
 bleTimer=setTimeout(hide,450);
});
document.addEventListener('minote:x10-hover-end',hide);
