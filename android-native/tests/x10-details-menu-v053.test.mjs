import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Opción Detalles X10 visible en el menú de tres puntos',()=>{
 const ui=read('../src/floating-ui.js');
 const mobile=read('../src/mobile-ui.js');
 assert.match(ui,/menuButton\('floatingX10DetailsMenu','⌁ Detalles de Huion X10'/);
 assert.match(ui,/const dialog=\$\('x10Dialog'\)/);
 assert.match(ui,/dialog\.showModal\(\)/);
 assert.match(ui,/if\(panel\.open\)panel\.close\(\);handler\(\)/);
 assert.match(mobile,/mobileMoreDialog/);
});
test('Se mantienen detalles y acción física con doble confirmación',()=>{
 const details=read('../src/x10-device-info-v051.js');
 const pkg=JSON.parse(read('../package.json'));
 assert.match(details,/Batería restante/);
 assert.match(details,/Memoria restante/);
 assert.match(details,/Borrar páginas guardadas en la Huion X10/);
 assert.match(details,/typed!=='LIMPIAR'/);
 assert.ok(Number(pkg.version.split('.')[1])>=53);
});
