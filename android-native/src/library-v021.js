/* Biblioteca V0.21 inspirada en la organización visual de Huion Note. */
const $=id=>document.getElementById(id),api=()=>window.MiNoteAndroidActions;
const dialog=$('floatingLibraryDialog'),menu=$('mobileMoreDialog');
if(!dialog)throw Error('Falta biblioteca');
dialog.classList.add('huion-library');
dialog.innerHTML=[
'<header class="huion-library-head"><h2>Mis cuadernos</h2><div class="huion-library-tools">',
'<button id="huionSearchToggle" type="button" aria-label="Buscar">⌕</button>',
'<button id="huionNewNotebook" type="button" aria-label="Nuevo cuaderno">＋</button>',
'<button id="floatingLibraryClose" type="button" aria-label="Cerrar">✕</button></div></header>',
'<div id="huionSearchWrap" hidden><input id="huionSearch" type="search" placeholder="Buscar cuadernos…"></div>',
'<nav class="huion-sort"><button id="huionSortModified" type="button" class="active">Fecha modificada</button>',
'<button id="huionSortCreated" type="button">Fecha creada</button></nav>',
'<section id="floatingLibraryItems" class="huion-notebook-grid"></section>',
'<section id="huionNewForm" class="huion-create-panel" hidden><div class="huion-create-head"><h3>Nuevo cuaderno</h3>',
'<button id="huionCancelNew" type="button">✕</button></div>',
'<label>Nombre<input id="floatingNewNotebookName" maxlength="90" placeholder="Ej.: Matemática"></label>',
'<p>Portada</p><div id="huionCoverOptions" class="huion-cover-options"></div>',
'<div class="huion-create-fields"><label>Papel<select id="huionNewTemplate"><option value="grid">Cuadrícula</option>',
'<option value="ruled">Rayas</option><option value="plain">Blanco</option></select></label>',
'<label>Orientación<select id="huionNewOrientation"><option value="landscape-cw">Horizontal ↻</option>',
'<option value="portrait">Vertical A5</option></select></label></div>',
'<button id="floatingCreateNotebook" type="button">Crear cuaderno</button></section>',
'<div id="floatingLibraryStatus" role="status" aria-live="polite"></div>'
].join('');
let order='modified',query='',cover='slate',busy=false;
const covers={slate:'#4b5e77',ocean:'#3476ac',mint:'#43867d',coral:'#b96f64',sand:'#b69b66'};
for(const [id,color] of Object.entries(covers)){
 const b=document.createElement('button');b.type='button';b.className='huion-cover-choice';
 b.style.setProperty('--cover-color',color);b.setAttribute('aria-label','Portada '+id);
 b.classList.toggle('selected',id===cover);
 b.addEventListener('click',()=>{cover=id;document.querySelectorAll('.huion-cover-choice').forEach(x=>x.classList.toggle('selected',x===b));});
 $('huionCoverOptions').append(b);
}
function status(message){$('floatingLibraryStatus').textContent=message;}
function closeLibrary(){if(dialog.open)dialog.close();}
function showCreation(show){$('huionNewForm').hidden=!show;if(show)$('floatingNewNotebookName').focus();}
function openLibrary(create=false){
 if(menu?.open)menu.close();
 if(!dialog.open)dialog.showModal();
 showCreation(create);renderLibrary();
}
function dateFor(n){const v=order==='created'?n.createdAt:n.updatedAt;const d=new Date(v||0);return Number.isFinite(d.getTime())?d.toLocaleDateString('es-CL'):'';}
function preview(canvas,id){
 const page=api()?.previewNotebook?.(id),ctx=canvas.getContext('2d');
 if(!ctx)return;
 canvas.width=220;canvas.height=300;
 ctx.fillStyle='#fff';ctx.fillRect(0,0,220,300);
 if(!page)return;
 ctx.strokeStyle='#e2eaf3';ctx.lineWidth=.65;
 if(page.template==='grid')for(let i=0;i<=220;i+=12){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,300);ctx.stroke();}
 if(page.template!=='plain')for(let i=0;i<=300;i+=12){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(220,i);ctx.stroke();}
 ctx.save();ctx.scale(.22,300/1400);
 for(const s of page.strokes||[]){
  if(!s.pts?.length)continue;ctx.strokeStyle=s.color||'#1b426f';ctx.lineWidth=Math.max(2,s.width||3);
  ctx.lineJoin='round';ctx.beginPath();
  s.pts.forEach((pt,i)=>{if(i)ctx.lineTo(pt[0],pt[1]);else ctx.moveTo(pt[0],pt[1]);});ctx.stroke();
 }
 ctx.restore();
}
function renderLibrary(){
 const s=api()?.snapshot(),grid=$('floatingLibraryItems');if(!s)return;
 grid.replaceChildren();
 const books=s.notebooks.filter(n=>n.title.toLocaleLowerCase('es').includes(query))
  .sort((a,b)=>new Date(order==='created'?b.createdAt:b.updatedAt||0)-new Date(order==='created'?a.createdAt:a.updatedAt||0));
 for(const nb of books){
  const card=document.createElement('button');card.type='button';card.className='huion-book-card';
  if(nb.selected)card.classList.add('selected');
  const jacket=document.createElement('span');jacket.className='huion-book-cover';
  jacket.style.setProperty('--book-cover',covers[nb.cover]||covers.slate);
  const thumb=document.createElement('canvas');thumb.className='huion-book-preview';
  const tag=document.createElement('span');tag.className='huion-a5-tag';tag.textContent='A5';
  jacket.append(thumb,tag);
  const title=document.createElement('strong');title.textContent=nb.title;
  const meta=document.createElement('small');meta.textContent=nb.count+' '+(nb.count===1?'hoja':'hojas')+' · '+dateFor(nb);
  card.append(jacket,title,meta);
  card.addEventListener('click',async()=>{
   if(busy)return;busy=true;
   try{await api().chooseNotebook(nb.id);closeLibrary();}catch(e){status(e.message);}finally{busy=false;}
  });
  grid.append(card);requestAnimationFrame(()=>{if(card.isConnected)preview(thumb,nb.id);});
 }
 if(!books.length){const p=document.createElement('p');p.textContent='No se encontraron cuadernos.';grid.append(p);}
}
async function createNotebook(){
 if(busy)return;const title=$('floatingNewNotebookName').value.trim();
 if(!title){status('Escriba un nombre para su cuaderno.');return;}
 busy=true;try{
  await api().addNotebook(title,{cover,template:$('huionNewTemplate').value,orientation:$('huionNewOrientation').value});
  $('floatingNewNotebookName').value='';closeLibrary();
 }catch(e){status(e.message);}finally{busy=false;}
}
document.addEventListener('click',e=>{
 const hit=e.target?.closest?.('#tvBoardLibrary,#floatingLibraryMenu,#floatingLibraryOpenMenu,#floatingNewNotebookMenu');
 if(!hit)return;
 e.preventDefault();e.stopImmediatePropagation();openLibrary(hit.id==='floatingNewNotebookMenu');
},true);
dialog.querySelector('#floatingLibraryClose').addEventListener('click',closeLibrary);
$('huionNewNotebook').addEventListener('click',()=>showCreation(true));
$('huionCancelNew').addEventListener('click',()=>showCreation(false));
$('floatingCreateNotebook').addEventListener('click',()=>void createNotebook());
$('floatingNewNotebookName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void createNotebook();}});
$('huionSearchToggle').addEventListener('click',()=>{const wrap=$('huionSearchWrap');wrap.hidden=!wrap.hidden;if(!wrap.hidden)$('huionSearch').focus();});
$('huionSearch').addEventListener('input',e=>{query=e.target.value.toLocaleLowerCase('es');renderLibrary();});
for(const [id,value] of [['huionSortModified','modified'],['huionSortCreated','created']]){
 $(id).addEventListener('click',()=>{order=value;$('huionSortModified').classList.toggle('active',order==='modified');$('huionSortCreated').classList.toggle('active',order==='created');renderLibrary();});
}
dialog.addEventListener('click',e=>{if(e.target===dialog)closeLibrary();});
function capture(id,handler){
 $(id)?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();handler();},true);
}
function refreshPages(){
 const s=api()?.snapshot();if(!s)return;
 $('floatingPageNumber').textContent=s.index+' / '+s.total;
 $('floatingPageDialogTitle').textContent='Página '+s.index+' de '+s.total;
 $('floatingPageDelete').disabled=s.total<=1;
}
const pageDlg=$('floatingPageDialog'),pages=document.createElement('div');
pages.id='floatingPageChoices';pages.className='floating-page-choices';pages.hidden=true;
$('floatingPageGo').before(pages);
async function perform(task){try{await task();refreshPages();}catch(e){status(e.message);}}
capture('tvBoardPrev',()=>void perform(()=>api().previous()));
capture('tvBoardNext',()=>void perform(()=>api().next()));
capture('floatingPageNumber',()=>{refreshPages();if(!pageDlg.open)pageDlg.showModal();});
capture('floatingPageGo',()=>{
 pages.replaceChildren();
 for(const pg of api()?.pages()||[]){
  const b=document.createElement('button');b.type='button';b.className='floating-page-item';
  b.textContent=pg.index+'. '+pg.title;
  b.addEventListener('click',()=>void perform(async()=>{await api().goToPage(pg.id);pageDlg.close();}));
  pages.append(b);
 }
 pages.hidden=!pages.hidden;
});
capture('floatingPageDelete',()=>{
 const s=api()?.snapshot();if(!s||s.total<=1)return;
 if(!confirm('¿Eliminar la hoja '+s.index+' de '+s.total+'? No se puede deshacer.'))return;
 void perform(async()=>{await api().deleteCurrent();pageDlg.close();});
});
$('floatingPageClose')?.addEventListener('click',()=>pageDlg.close());
document.addEventListener('minote:statechange',refreshPages);
document.addEventListener('minote:page-rendered',refreshPages);
refreshPages();
