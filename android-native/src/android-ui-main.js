// Un único punto de entrada Android: primero motor de Mi Note, luego la UI.
const failures=[];
async function load(moduleName,fn){
 try{await fn();}
 catch(error){console.error('Mi Note Android '+moduleName,error);failures.push(moduleName+': '+(error?.message||String(error)));}
}
await load('motor y Bluetooth',()=>import('./native-main.js'));
await load('interfaz Android',()=>import('./mobile-ui.js'));
await load('reproducción',()=>import('./replay.js'));
await load('respaldo personal',()=>import('./personal-backup.js'));
await load('memoria Huion X10',()=>import('./memory-import.js'));
await load('orientación y TV',()=>import('./landscape-ui.js'));
await load('barra flotante',()=>import('./floating-ui.js'));
await load('hojas y X10',()=>import('./floating-page-x10.js'));
await load('biblioteca y navegación',()=>import('./library-page-ui.js'));
if(failures.length){
 const note=document.createElement('button');
 note.type='button';note.id='androidBootErrors';
 note.textContent='⚠ Algunas funciones no cargaron. Toque para ver detalles.';
 note.style.cssText='position:fixed;bottom:42px;left:10px;right:10px;z-index:1800;background:#8f2424;color:white;border:0;border-radius:9px;padding:12px';
 note.addEventListener('click',()=>alert('Errores de Mi Note Android:\\n'+failures.join('\\n')));
 document.body.appendChild(note);
}
