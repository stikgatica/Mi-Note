import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.join(process.cwd(),'stage');
const read=name=>fs.readFile(path.join(root,name),'utf8');
const [html,app,bootstrap,ui,css]=await Promise.all([
 read('index.html'),read('app.js'),read('android-ui-main.js'),read('library-page-ui.js'),read('floating-ui.css')
]);
const required=['floatingLibraryDialog','floatingLibraryItems','floatingNewNotebookName','floatingCreateNotebook','floatingLibraryOpenMenu','floatingNewNotebookMenu',
 'floatingPageDialog','floatingPageNumber','tvBoardNext','tvBoardPrev','floatingPageDelete'];
for(const id of required)assert(html.includes('id="'+id+'"'),'Falta botón o diálogo: '+id);
assert(html.includes('src="./android-ui-main.js"'),'No se ejecuta el bootstrap Android');
assert(!html.includes('src="./floating-ui.js"'),'No deben quedar scripts module mal escapados');
assert(!html.includes('src="./native-main.js"'),'El motor no debe inicializarse dos veces');
assert(bootstrap.includes("await load('motor y Bluetooth'"),'Motor primero');
assert(bootstrap.includes("await load('biblioteca y navegación'"),'Biblioteca cargada');
assert(app.includes('window.MiNoteAndroidActions='),'Falta API de datos');
for(const name of ['async next(){','async previous(){','async deleteCurrent(){','async addNotebook(title){','async chooseNotebook(id){','async goToPage(id){']){
 assert(app.includes(name),'Falta operación de datos: '+name);
}
assert(app.includes('nb.pages.push(next)'),'Siguiente debe crear hoja al final');
assert(app.includes('nb.pages.splice(index,1)'),'Eliminar debe quitar hoja actual');
assert(app.includes('await persist()'),'Las acciones deben guardar');
for(const id of ['tvBoardNext','tvBoardPrev','floatingPageNumber','floatingPageDelete','floatingLibraryOpenMenu','floatingNewNotebookMenu']){
 assert(ui.includes("onCapture('"+id+"'"),'Control no enlazado: '+id);
}
assert(css.includes('.floating-library-dialog'),'Falta panel cuadernos');
console.log('OK V0.16: bootstrap único; páginas y cuadernos con API directa y persistencia.');
