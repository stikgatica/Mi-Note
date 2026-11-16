/* Mi Note V0.2.10: actualización segura. Sin eliminar datos IndexedDB. */
(()=>{
'use strict';
const BUILD='0.2.10';
const $=id=>document.getElementById(id);
const setStatus=msg=>{const el=$('pwaUpdateStatus');if(el)el.textContent=msg;};
const version=$('pwaVersion');if(version)version.textContent='Mi Note V'+BUILD;
let refreshing=false,hasControllerChanged=false,manual=false;
function busy(){
 try{return !!((typeof x10Connection!=='undefined'&&x10Connection?.connected)||
   (typeof x10Connecting!=='undefined'&&x10Connecting)||
   (typeof inStroke!=='undefined'&&inStroke)||
   (typeof x10ActiveStroke!=='undefined'&&x10ActiveStroke));}
 catch{return true;}
}
async function reloadSafely(){
 if(refreshing)return;
 if(busy()&&!manual){
  setStatus('Hay escritura o una X10 conectada. Pulsa «Actualizar Mi Note» cuando termines.');
  return;
 }
 refreshing=true;
 setStatus('Guardando cuadernos antes de actualizar…');
 try{
  if(typeof x10Flush==='function')x10Flush();
  if(typeof persist==='function')await persist();
 }catch(err){
  refreshing=false;
  setStatus('No se pudo asegurar el guardado. Haz un respaldo JSON antes de actualizar.');
  return;
 }
 const next=new URL(location.href);
 next.searchParams.set('v',BUILD);
 next.searchParams.set('actualizacion',String(Date.now()));
 location.replace(next.href);
}
async function check(){
 if(!('serviceWorker'in navigator)){
  setStatus('Este navegador no admite actualizaciones PWA automáticas.');
  return;
 }
 try{
  const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
  await reg.update();
  if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
  setStatus('Versión '+BUILD+' cargada. Si aún ves controles antiguos, pulsa «Actualizar Mi Note».');
 }catch(e){setStatus('No se pudo comprobar la actualización: '+e.message);}
}
$('pwaUpdateBtn')?.addEventListener('click',()=>{manual=true;void check().then(reloadSafely);});
if('serviceWorker'in navigator){
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(hasControllerChanged)return;
  hasControllerChanged=true;
  // Una sola recarga por sesión/version: evita bucles por instalaciones iniciales.
  if(sessionStorage.getItem('minote_sw_reloaded_for')===BUILD){
   setStatus('Actualización preparada. Pulsa «Actualizar Mi Note» si necesitas recargar.');
   return;
  }
  sessionStorage.setItem('minote_sw_reloaded_for',BUILD);
  if(!busy())void reloadSafely();
  else setStatus('Actualización disponible. Termina de escribir y pulsa «Actualizar Mi Note».');
 });
 void check();
}
})();