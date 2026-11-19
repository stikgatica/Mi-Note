import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactAutomatic,listObjects,nearDuplicate} from '../src/math/math-objects.mjs';

const object=(id,pts,{automatic=true,label='Cuadrado',sources=[id]}={})=>({
 id,accepted:true,automatic,label,type:'polygon',
 geometry:{kind:'polygon',points:pts},
 sources:sources.map(id=>({id,signature:id}))
});
const square=[[100,100],[260,100],[260,260],[100,260]];
const shifted=square.map(([x,y])=>[x+3,y+2]);
test('figuras repetidas casi idénticas se compactan sin modificar manuscritos',()=>{
 const a=object('a',square),b=object('b',shifted,{sources:['a','b']});
 const original=JSON.stringify([a,b]);
 assert.equal(nearDuplicate(a,b),true);
 const clean=compactAutomatic([a,b]);
 assert.equal(clean.length,1);
 assert.equal(clean[0].id,'b');
 assert.equal(JSON.stringify([a,b]),original);
});
test('figuras alejadas y objetos corregidos manualmente NO se eliminan',()=>{
 const a=object('a',square),far=object('far',square.map(([x,y])=>[x+280,y+300]));
 const manual=object('manual',shifted,{automatic:false});
 const clean=compactAutomatic([a,far,manual]);
 assert.equal(clean.length,3);
 assert.equal(nearDuplicate(a,manual),false);
});
test('identificadores por nombre y ubicación facilitan encontrar figuras',()=>{
 const a=object('a',square),b=object('b',square.map(([x,y])=>[x+300,y+450]));
 const listed=listObjects([a,b]);
 assert.match(listed[0].label,/Cuadrado 1 · arriba izquierda/);
 assert.match(listed[1].label,/Cuadrado 2 · centro centro/);
});
test('la pantalla ofrece administración plegable, ubicación y limpieza',()=>{
 const source=readFileSync(new URL('../src/math/math-controller.js',import.meta.url),'utf8');
 assert.match(source,/mathRecognizedDetails/);
 assert.match(source,/mathCleanDuplicates/);
 assert.match(source,/mathFindObject/);
 assert.match(source,/compactAutomatic/);
 assert.match(source,/listObjects/);
});
test('Atrás nativo cierra interfaces primero sin salir cuando hay diálogo',()=>{
 const nav=readFileSync(new URL('../src/android-back.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/android-ui-main.js',import.meta.url),'utf8');
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.dependencies['@capacitor/app'],'^8.0.0');
 assert.match(nav,/App.addListener\('backButton'/);
 assert.match(nav,/closeTopLayer\(\)/);
 assert.match(nav,/dialog\[open\]/);
 assert.match(nav,/doc\.body\.classList\.contains\('library-open'\)/);
 assert.match(nav,/top\.close\(\)/);
 assert.match(nav,/App.minimizeApp\(\)/);
 assert.match(ui,/import\('\.\/android-back\.js'\)/);
});
