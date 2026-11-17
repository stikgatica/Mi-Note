/* V0.16: navegación de hojas y cuadernos con acceso al almacén REAL.
   No depende de clics sobre herramientas ocultas. */
const $=id=>document.getElementById(id);
const api=()=>window.MiNoteAndroidActions;
const pager=$('floatingPageNumber');
const pageDialog=$('floatingPageDialog'),libraryDialog=$('floatingLibraryDialog');
const menu=$('mobileMoreDialog');
const feedback=$('floatingLibraryStatus');
const notify=(message)=>{
 if(feedback)feedback.textContent=message;
 let el=$('mobileActionNotice');
 if(!el){el=document.createElement('div');el.id='mobileActionNotice';el.setAttribute('role','status');document.body.append(el);}
 el.textContent=message;el.hidden=false;
 clearTimeout(notify.timer);notify.timer=setTimeout(()=>{el.hidden=true;},5500);
};
let busy=false;
async function act(work){
 if(busy)return;
 busy=true;
 try{
  if(!api())throw Error('El cuaderno todavía no está disponible.');
  await work();
  refresh();
 }catch(e){notify('No se pudo completar la acción: '+(e?.message||e));}
 finally{busy=false;}
}
function closeMenu(){if(menu?.open)menu.close();}
function refresh(){
 const s=api()?.snapshot();
 if(!s)return;
 if(pager){
  pager.textContent=s.index+' / '+s.total;
  pager.title='Página '+s.index+' de '+s.total+'. Tocar para administrar';
  pager.setAttribute('aria-label',pager.title);
 }
 const heading=$('floatingPageDialogTitle');
 if(heading)heading.textContent='Página '+s.index+' de '+s.total;
 const deleteButton=$('floatingPageDelete');
 if(deleteButton)deleteButton.disabled=s.total<=1;
 const hint=$('floatingPageHint');
 if(hint)hint.textContent=s.total<=1?'Debe conservar al menos una hoja.':'Al eliminar, se conservará la hoja vecina. La acción requiere confirmación.';
 if(libraryDialog?.open)fillLibrary(s);
}
function openPages(){
 closeMenu();refresh();
 if(!pageDialog?.open)pageDialog?.showModal();
}
const pagesList=document.createElement('div');
pagesList.id='floatingPageChoices';
pagesList.className='floating-page-choices';
pagesList.hidden=true;
$('floatingPageGo')?.before(pagesList);
function fillPages(){
 const choices=api()?.pages()||[];
 pagesList.replaceChildren();
 for(const pg of choices){
  const b=document.createElement('button');b.type='button';b.className='floating-page-item';
  b.textContent=pg.index+'. '+pg.title+(pg.selected?' ✓':'');
  b.setAttribute('aria-current',pg.selected?'page':'false');
  b.addEventListener('click',()=>void act(async()=>{
   await api().goToPage(pg.id);
   pageDialog.close();pagesList.hidden=true;
  }));
  pagesList.append(b);
 }
}
function openLibrary(focusNew=false){
 closeMenu();refresh();
 if(!libraryDialog){notify('No se pudo abrir la biblioteca.');return;}
 if(!libraryDialog.open)libraryDialog.showModal();
 fillLibrary(api()?.snapshot());
 if(focusNew)$('floatingNewNotebookName')?.focus();
}
function fillLibrary(snapshot){
 const list=$('floatingLibraryItems');if(!list||!snapshot)return;
 list.replaceChildren();
 for(const nb of snapshot.notebooks){
  const b=document.createElement('button');b.type='button';b.className='floating-notebook-item';
  if(nb.selected)b.classList.add('selected');
  const title=document.createElement('strong');title.textContent=nb.title;
  const subtitle=document.createElement('small');
  subtitle.textContent=nb.count+' '+(nb.count===1?'hoja':'hojas')+(nb.selected?' · Actual':'');
  b.append(title,subtitle);
  b.addEventListener('click',()=>void act(async()=>{
   await api().chooseNotebook(nb.id);
   libraryDialog.close();
  }));
  list.append(b);
 }
}
async function createNotebook(){
 const input=$('floatingNewNotebookName');const title=input?.value.trim();
 if(!title){notify('Escriba el nombre del nuevo cuaderno.');input?.focus();return;}
 await act(async()=>{
  await api().addNotebook(title);
  input.value='';
  libraryDialog.close();
  notify('Cuaderno creado correctamente.');
 });
}
function onCapture(id,handler){
 const b=$(id);if(!b)return;
 b.addEventListener('click',event=>{
  // Impide ejecutar simultáneamente los handlers antiguos que dirigían
  // la interfaz a botones de escritorio ocultos.
  event.preventDefault();event.stopImmediatePropagation();
  handler();
 },true);
}
onCapture('tvBoardPrev',()=>void act(()=>api().previous()));
onCapture('tvBoardNext',()=>void act(()=>api().next()));
onCapture('floatingPageNumber',openPages);
onCapture('floatingPageGo',()=>{
 fillPages();pagesList.hidden=!pagesList.hidden;
});
onCapture('floatingPageDelete',()=>{
 const s=api()?.snapshot();if(!s)return;
 if(s.total<=1){notify('Debe conservar al menos una hoja.');return;}
 const current=api().pages().find(p=>p.selected);
 if(!window.confirm('¿Eliminar la hoja '+s.index+' de '+s.total+' («'+(current?.title||'Hoja')+'»)? No se puede deshacer.'))return;
 void act(async()=>{
  await api().deleteCurrent();pageDialog?.close();pagesList.hidden=true;
  notify('Hoja eliminada.');
 });
});
onCapture('tvBoardLibrary',()=>openLibrary());
onCapture('floatingLibraryMenu',()=>openLibrary());
onCapture('floatingLibraryOpenMenu',()=>openLibrary());
onCapture('floatingNewNotebookMenu',()=>openLibrary(true));
$('floatingLibraryClose')?.addEventListener('click',()=>libraryDialog?.close());
$('floatingCreateNotebook')?.addEventListener('click',()=>void createNotebook());
$('floatingNewNotebookName')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void createNotebook();}});
libraryDialog?.addEventListener('click',e=>{if(e.target===libraryDialog)libraryDialog.close();});
$('floatingPageClose')?.addEventListener('click',()=>pageDialog?.close());
document.addEventListener('minote:statechange',refresh);
document.addEventListener('minote:page-rendered',refresh);
refresh();
