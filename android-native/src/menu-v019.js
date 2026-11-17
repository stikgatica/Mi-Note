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
  ['Huion X10',[ 'x10MemoryOpen','floatingX10Menu' ]],
  ['Exportar y respaldar',[ 'action:exportPng','action:exportSvg','action:printPdf','action:backupBtn','action:importBtn','personalBackupOpen' ]],
  ['Herramientas',[ 'floatingAxisMenu','floatingLockMenu','floatingLibraryMenu' ]]
 ];
 for(const [label,ids] of groups){
  const details=document.createElement('details');details.className='minote-menu-group';
  if(label==='Cuadernos')details.open=true;
  const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
  const holder=document.createElement('div');holder.className='minote-menu-rows';
  for(const id of ids){const node=find(id);if(node)holder.append(node);}
  details.append(holder);list.append(details);
 }
 const stray=Array.from(list.children).filter(n=>n.tagName==='BUTTON');
 if(stray.length){const details=document.createElement('details');details.className='minote-menu-group';
  const summary=document.createElement('summary');summary.textContent='Más opciones';details.append(summary);
  const rows=document.createElement('div');rows.className='minote-menu-rows';
  stray.forEach(el=>rows.append(el));details.append(rows);list.append(details);
 }
 const control=document.querySelector('.landscape-control');
 if(control){const tools=Array.from(list.querySelectorAll('details')).find(e=>e.querySelector('summary')?.textContent==='Herramientas');tools?.append(control);}
 const color=menu.querySelector('.floating-color-label');
 if(color){const tools=Array.from(list.querySelectorAll('details')).find(e=>e.querySelector('summary')?.textContent==='Herramientas');tools?.append(color);}
 const full=document.createElement('button');full.type='button';full.id='menuFullscreen';
 full.className='minote-fullscreen-action';full.textContent='⛶ Pantalla completa';
 full.addEventListener('click',()=>{
  menu.close();
  if(document.fullscreenElement){void document.exitFullscreen?.().catch(()=>{});}
  else if(document.documentElement.requestFullscreen){void document.documentElement.requestFullscreen().catch(()=>{});}
 });
 list.append(full);
}
