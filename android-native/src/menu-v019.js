/* Mi Note Android V0.19 — menú compacto por secciones, sin modo proyectar. */
const menu=document.getElementById('mobileMoreDialog');
const list=menu?.querySelector('.mobile-actions-list');
document.getElementById('tvBoardToggle')?.remove();
document.getElementById('tvBoardClose')?.remove();
if(list){
 const find=(id)=>id.startsWith('action:')?list.querySelector('[data-action="'+id.slice(7)+'"]'):document.getElementById(id);
 const groups=[
  ['Cuadernos',[ 'floatingLibraryOpenMenu','floatingNewNotebookMenu','action:renameNotebookBtn' ]],
  ['Hojas',[ 'action:pageNumber','action:renamePageBtn' ]],
  ['Exportar y respaldar',[ 'action:exportPng','action:exportSvg','action:printPdf','action:backupBtn','action:importBtn','personalBackupOpen' ]],
  ['Más opciones de barra',[ 'floatingLockMenu' ]]
 ];
 for(const [label,ids] of groups){
  const details=document.createElement('details');details.className='minote-menu-group';
  if(label==='Cuadernos')details.open=true;
  const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
  const holder=document.createElement('div');holder.className='minote-menu-rows';
  for(const id of ids){const node=find(id);if(node)holder.append(node);}
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
