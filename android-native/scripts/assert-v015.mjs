import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const stage=path.join(process.cwd(),'stage');
const html=await fs.readFile(path.join(stage,'index.html'),'utf8');
const js=await fs.readFile(path.join(stage,'floating-page-x10.js'),'utf8');
const app=await fs.readFile(path.join(stage,'app.js'),'utf8');
const css=await fs.readFile(path.join(stage,'floating-ui.css'),'utf8');
const positions=['id="tvBoardPrev"','id="floatingPageNumber"','id="tvBoardNext"'].map(t=>html.indexOf(t));
assert(positions.every(x=>x>=0)&&positions[0]<positions[1]&&positions[1]<positions[2],
 'El número de hoja debe ubicarse entre las flechas izquierda y derecha');
for(const id of ['floatingPageDialog','floatingPageGo','floatingPageDelete','floatingPageClose',
 'floatingX10Quick','floatingX10QuickDot','floatingX10Panel','floatingX10ConnectNow',
 'floatingX10DisconnectNow','floatingX10ViewStatus','floatingX10Label']){
 assert(html.includes('id="'+id+'"'),'Control ausente: '+id);
}
assert(html.includes('src="./floating-page-x10.js"'),'No está cargado el controlador de páginas y BLE');
assert(css.includes('#floatingPageNumber'),'Falta visibilidad del número de página');
assert(css.includes('.x10-status-dot[data-status="connected"]'),'No se muestra el punto verde X10');
assert(js.includes("'x10DirectConnect'"),'Conectar debe invocar selector BLE directo');
assert(js.includes("'x10Connect'"),'Desconectar debe usar lógica BLE original');
assert(js.includes("'deletePage'"),'Eliminar debe ejecutar manejador original confirmado');
assert(js.includes('new MutationObserver(updatePages)'), 'El contador de hojas no se sincroniza');
assert(app.includes('nb.pages.splice(index,1)'),'La eliminación debe preservar páginas vecinas');
assert(app.includes('x10BindCurrent();persist();'),'La Huion debe vincularse a la nueva hoja activa');
console.log('V0.15 OK: página actual/total, eliminación segura y conexión X10 contextual.');
