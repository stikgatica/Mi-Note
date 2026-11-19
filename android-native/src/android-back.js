/* Un único manejo de Atrás físico/gestual para el WebView Android.
 * Prioridad: teclado/controles > diálogo superior > panel > minimizar.
 * No interfiere con Bluetooth ni con los selectores nativos del sistema. */
import {App} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';

const active=()=>document.activeElement;
const visible=el=>{
 if(!el||el.hidden)return false;
 const style=getComputedStyle(el);
 return style.display!=='none'&&style.visibility!=='hidden';
};
export function closeTopLayer(doc=document){
 // Diálogos HTML nativos: el último modal abierto es el superior.
 const dialogs=[...doc.querySelectorAll('dialog[open]')].filter(visible);
 if(dialogs.length){
  const top=dialogs.at(-1);
  // Reutilizar cancel para respetar operaciones delicadas en curso.
  const event=new Event('cancel',{cancelable:true});
  if(top.dispatchEvent(event)){
   top.close();
  }
  return true;
 }
 // Biblioteca flotante personalizada que no usa <dialog>.
 if(doc.body.classList.contains('library-open')){
  const close=doc.getElementById('floatingLibraryClose');
  if(close){close.click();return true;}
  doc.body.classList.remove('library-open');
  return true;
 }
 const sidebar=doc.getElementById('sidebar');
 if(sidebar?.classList.contains('open')){
  sidebar.classList.remove('open');
  return true;
 }
 for(const detail of [...doc.querySelectorAll('details[open]')].reverse()){
  if(visible(detail)){detail.open=false;return true;}
 }
 return false;
}
function keyboardActive(){
 const el=active();
 return el?.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable="true"]')&&visible(el);
}
async function back(){
 // En Android el botón físico suele cerrar el IME automáticamente; evitar
 // cerrar simultáneamente un diálogo si el campo aún tiene el foco.
 if(keyboardActive()){
  active().blur();
  return;
 }
 if(closeTopLayer())return;
 try{await App.minimizeApp();}catch{
  // Sin menús, dejar la aplicación visible si Android no ofrece minimizar.
 }
}
if(Capacitor.getPlatform()==='android'&&Capacitor.isNativePlatform()){
 await App.addListener('backButton',()=>{void back();});
}
