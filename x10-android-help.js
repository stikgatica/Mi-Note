/* Diagnóstico Web Bluetooth Android para Mi Note. No transmite datos. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const URL_CHROME='https://stikgatica.github.io/Mi-Note/?v=0.2.5';
const info=$('x10BrowserCheck'),status=$('x10Status');
const isEmbedded=()=>{const ua=navigator.userAgent||'';
 try{return window.self!==window.top||ua.includes('; wv)')||ua.includes('WebView');}
 catch{return true;}
};
const hasBluetooth=()=>!!(window.isSecureContext&&navigator.bluetooth&&typeof navigator.bluetooth.requestDevice==='function');
const blockedByPolicy=()=>{
 try{const p=document.permissionsPolicy||document.featurePolicy;
 return !!(p?.allowsFeature&&p.allowsFeature('bluetooth')===false);}
 catch{return false;}
};
const explain=()=>{
 if(!window.isSecureContext)return 'Mi Note necesita HTTPS para Bluetooth. Abre la dirección segura directamente en Chrome.';
 if(blockedByPolicy())return 'Este visor bloquea el permiso Bluetooth. Abre Mi Note directamente en Chrome para Android.';
 if(!navigator.bluetooth||typeof navigator.bluetooth.requestDevice!=='function')
  return 'El navegador actual no permite seleccionar equipos Bluetooth. Abre Mi Note en la aplicación Chrome, no dentro de ChatGPT, WhatsApp u otro visor.';
 return '';
};
async function check(){
 if(!info)return;
 const android=(navigator.userAgent||'').includes('Android');
 const embedded=isEmbedded();
 const lines=[(android?'Android':'Otro sistema')+(embedded?' · navegador integrado':' · navegador web'),
  'Conexión segura: '+(window.isSecureContext?'sí':'no'),
  'Selector Bluetooth: '+(hasBluetooth()?'disponible':'NO disponible')];
 if(hasBluetooth()&&navigator.bluetooth.getAvailability){
  try{const available=await navigator.bluetooth.getAvailability();
   lines.push('Bluetooth del equipo: '+(available?'disponible':'no disponible; revisa que esté activado'));}
  catch{lines.push('Estado del adaptador: no se pudo consultar');}
 }
 if(blockedByPolicy())lines.push('Permiso Bluetooth bloqueado por este visor.');
 const problem=explain();
 lines.push(problem||'Si no aparece el selector, revisa los permisos Bluetooth de Chrome y que la X10 no esté conectada a otra aplicación.');
 info.textContent=lines.join('\n');
 return !problem;
}
const connect=$('x10Connect');
connect?.addEventListener('click',event=>{
 const problem=explain();
 if(problem){
  event.preventDefault();
  event.stopImmediatePropagation();
  if(status)status.textContent=problem;
  if(info)info.textContent=problem;
  void check();
  return;
 }
 if(status)status.textContent='Solicitando selector Bluetooth… Si no aparece, revisa permisos de Chrome.';
},true);
$('x10OpenBtn')?.addEventListener('click',()=>{void check();});
$('x10BrowserCheckBtn')?.addEventListener('click',()=>{void check();});
$('x10CopyUrl')?.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(URL_CHROME);
  if(status)status.textContent='Enlace copiado. Abre Chrome y pégalo en su barra de direcciones.';}
 catch{if(status)status.textContent='Copia esta dirección y ábrela en Chrome: '+URL_CHROME;}
});
void check();
})();