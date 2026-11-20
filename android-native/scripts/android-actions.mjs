import fs from 'node:fs/promises';
import path from 'node:path';
const file=path.join(process.cwd(),'stage','app.js');
let app=await fs.readFile(file,'utf8');
if(!app.includes('function render(){syncActive();'))throw Error('No se encontró render');
app=app.replace('function render(){syncActive();',"function render(){syncActive();queueMicrotask(()=>document.dispatchEvent(new Event('minote:statechange')));");
if(!app.includes('function x10Flush(')||!app.includes('const emptyNotebook ='))throw Error('No se reconoció la aplicación');
// V0.17: start() es asíncrona por IndexedDB; el import del módulo NO la espera.
if(!app.includes('\nstart();\n'))throw Error('No se encontró el arranque de Mi Note');
app=app.replace('\nstart();\n', `
\nwindow.MiNoteAndroidReady=start().then(()=>{
 if(!state||!Array.isArray(state.notebooks)||!state.notebooks.length)
   throw Error('No se pudo cargar la biblioteca de cuadernos.');
 return true;
});
`);
app+='\n'+"window.MiNoteAndroidActions={\n snapshot(){\n  if(!state)return null;\n  const nb=note(),pg=page(),i=nb.pages.findIndex(p=>p.id===pg.id);\n  return {notebookId:nb.id,pageId:pg.id,index:i+1,total:nb.pages.length,\n   notebooks:state.notebooks.map(n=>({id:n.id,title:n.title,count:n.pages.length,\n    selected:n.id===nb.id}))};\n },\n pages(){\n  if(!state)return [];\n  return note().pages.map((p,i)=>({id:p.id,title:p.title,index:i+1,\n   count:p.strokes?.length||0,selected:p.id===page().id}));\n },\n async next(){\n  if(!state)throw Error('Mi Note está cargando los cuadernos.');\n  x10Flush();\n  const nb=note(),current=page(),i=nb.pages.findIndex(p=>p.id===current.id);\n  if(i<0)throw Error('No se encontró la hoja actual.');\n  if(i===nb.pages.length-1){\n   const next=emptyPage(nb.pages.length+1);\n   next.template=current.template;next.orientation=current.orientation||'landscape-cw';\n   nb.pages.push(next);nb.updatedAt=now();state.activePageId=next.id;\n  }else state.activePageId=nb.pages[i+1].id;\n  render();if(x10Connection?.connected)x10BindCurrent();\n  await persist();return this.snapshot();\n },\n async previous(){\n  if(!state)throw Error('Mi Note está cargando los cuadernos.');\n  x10Flush();const nb=note(),i=nb.pages.findIndex(p=>p.id===page().id);\n  if(i>0){\n   state.activePageId=nb.pages[i-1].id;render();\n   if(x10Connection?.connected)x10BindCurrent();await persist();\n  }\n  return this.snapshot();\n },\n async goToPage(id){\n  if(!state)throw Error('Mi Note está cargando los cuadernos.');\n  if(!note().pages.some(p=>p.id===id))throw Error('La hoja seleccionada ya no existe.');\n  x10Flush();state.activePageId=id;render();\n  if(x10Connection?.connected)x10BindCurrent();\n  await persist();return this.snapshot();\n },\n async deleteCurrent(){\n  if(!state)throw Error('Mi Note está cargando los cuadernos.');\n  const nb=note(),current=page();\n  if(nb.pages.length<=1)throw Error('Debe conservarse al menos una hoja.');\n  x10Flush();const index=nb.pages.findIndex(p=>p.id===current.id);\n  if(index<0)throw Error('La hoja ya no existe.');\n  nb.pages.splice(index,1);undoState.delete(current.id);nb.updatedAt=now();\n  state.activePageId=nb.pages[Math.min(index,nb.pages.length-1)].id;\n  if($('pagesDialog')?.open)$('pagesDialog').close();\n  render();if(x10Connection?.connected)x10BindCurrent();\n  await persist();return this.snapshot();\n },\n async addNotebook(title){\n  if(!state)throw Error('Mi Note está cargando los cuadernos.');\n  const value=String(title||'').trim().slice(0,90);\n  if(!value)throw Error('Escriba un nombre para el cuaderno.');\n  x10Flush();const nb=emptyNotebook(value);\n  state.notebooks.push(nb);state.activeNotebookId=nb.id;state.activePageId=nb.pages[0].id;\n  undoState.clear();render();\n  if(x10Connection?.connected)x10BindCurrent();\n  await persist();return this.snapshot();\n },\n async chooseNotebook(id){\n  if(!state)throw Error('Mi Note está cargando los cuadernos.');\n  const nb=state.notebooks.find(n=>n.id===id);\n  if(!nb)throw Error('Ese cuaderno ya no existe.');\n  x10Flush();state.activeNotebookId=nb.id;state.activePageId=nb.pages[0]?.id;\n  undoState.clear();render();if(x10Connection?.connected)x10BindCurrent();\n  await persist();return this.snapshot();\n }\n};"+'\n';
// Add-on: import a read-only Huion archive without replacing notebooks.
// Stable notebook/page IDs make repeating the same import idempotent.
app+=`
window.MiNoteAndroidActions.importHuionArchive=async function(archive){
 if(!state)throw Error('La biblioteca todavía no está preparada.');
 if(!validBackup(archive)||archive.notebooks.length!==1)
  throw Error('El archivo convertido no es un respaldo de Mi Note válido.');
 const incoming=archive.notebooks[0];
 if(!incoming.pages.length||incoming.pages.length>300)throw Error('Cantidad de páginas no válida.');
 let nb=state.notebooks.find(x=>x.id===incoming.id);
 let added=0,duplicates=0;
 const importedPageIds=[];
 if(!nb){nb=clone(incoming);state.notebooks.push(nb);added=nb.pages.length;
  importedPageIds.push(...nb.pages.map(p=>p.id));}
 else{
  for(const p of incoming.pages){
   if(nb.pages.some(x=>x.id===p.id)){duplicates++;continue;}
   nb.pages.push(clone(p));added++;importedPageIds.push(p.id);
  }
  nb.updatedAt=now();
 }
 x10Flush();
 state.activeNotebookId=nb.id;
 state.activePageId=nb.pages[0].id;
 render();
 await persist();
 for(const pageId of importedPageIds){
  document.dispatchEvent(new CustomEvent('minote:x10-page-imported',{detail:{
   notebookId:nb.id,pageId,source:'huion-archive'
  }}));
 }
 document.dispatchEvent(new CustomEvent('minote:x10-import-finished',{detail:{source:'huion-archive',imported:added}}));
 return {added,duplicates,total:nb.pages.length};
};
`;
await fs.writeFile(file,app);
console.log('API Android directa para cuadernos y hojas.');
