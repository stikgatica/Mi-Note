/* Mi Note Android V0.19 — menú compacto por secciones, sin modo proyectar. */
const menu=document.getElementById('mobileMoreDialog');
const list=menu?.querySelector('.mobile-actions-list');
document.getElementById('tvBoardToggle')?.remove();
document.getElementById('tvBoardClose')?.remove();

const THEME_STORAGE_KEY='minote_theme_v1';
function applyTheme(mode){
 const resolved=mode==='dark'?'dark':'light';
 document.documentElement.dataset.minoteTheme=resolved;
 try{localStorage.setItem(THEME_STORAGE_KEY,resolved);}catch{}
 return resolved;
}
let currentTheme='light';
try{
 const saved=localStorage.getItem(THEME_STORAGE_KEY);
 if(saved==='dark'||saved==='light')currentTheme=saved;
}catch{}
applyTheme(currentTheme);

if(list){
 const find=(id)=>id.startsWith('action:')?list.querySelector('[data-action="'+id.slice(7)+'"]'):document.getElementById(id);
 const groups=[
  ['Cuadernos',[ 'floatingLibraryOpenMenu','floatingNewNotebookMenu','action:renameNotebookBtn' ]],
  ['Hojas',[ 'action:pageNumber','action:renamePageBtn' ]],
  ['Exportar y respaldar',[ 'shareDocumentOpen','action:exportPng','action:exportSvg','action:printPdf','action:backupBtn','action:importBtn','personalBackupOpen' ]],
  ['Más opciones de barra',[ 'floatingLockMenu' ]]
 ];
 for(const [label,ids] of groups){
  const details=document.createElement('details');details.className='minote-menu-group';
  if(label==='Cuadernos')details.open=true;
  const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
  const holder=document.createElement('div');holder.className='minote-menu-rows';
  for(const id of ids){const node=find(id);if(node)holder.append(node);}
  if(label==='Más opciones de barra'){
   // Acceso discreto al Laboratorio de reconocimiento y Tema claro/oscuro sin sobrecargar la barra de escritura.
   const labBtn=document.createElement('button');
   labBtn.type='button';labBtn.id='mathLabOpenMenu';labBtn.className='minote-lab-btn';
   labBtn.textContent='Laboratorio matemático y perfil';
   labBtn.addEventListener('click',()=>{
    menu?.close?.();
    if(typeof window.MiNoteMath?.openLab==='function')window.MiNoteMath.openLab();
    else if(typeof window.MiNoteMathLab?.open==='function')window.MiNoteMathLab.open();
    else document.dispatchEvent(new CustomEvent('minote:open-math-lab'));
   });
   const themeBtn=document.createElement('button');
   themeBtn.type='button';themeBtn.id='minoteThemeToggle';themeBtn.className='minote-theme-btn';
   const syncThemeLabel=()=>{themeBtn.textContent=currentTheme==='dark'?'Tema: Oscuro (cambiar a claro)':'Tema: Claro (cambiar a oscuro)';};
   syncThemeLabel();
   themeBtn.addEventListener('click',()=>{
    currentTheme=applyTheme(currentTheme==='dark'?'light':'dark');
    syncThemeLabel();
   });
   holder.append(labBtn,themeBtn);
  }
  details.append(holder);list.append(details);
 }
 // Importación como acción única y directa, sin acordeón Huion X10.
 const importButton=find('x10MemoryOpen');
 if(importButton){
  importButton.textContent='Importar memoria agenda';
  importButton.classList.add('minote-import-agenda');
  list.append(importButton);
 }
 const stray=Array.from(list.children).filter(n=>n.tagName==='BUTTON'&&n!==importButton);
 if(stray.length){const details=document.createElement('details');details.className='minote-menu-group';
  const summary=document.createElement('summary');summary.textContent='Más opciones';details.append(summary);
  const rows=document.createElement('div');rows.className='minote-menu-rows';
  stray.forEach(el=>rows.append(el));details.append(rows);list.append(details);
 }
}
