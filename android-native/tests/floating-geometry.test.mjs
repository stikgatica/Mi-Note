import test from 'node:test';
import assert from 'node:assert/strict';
import {clampPosition,snapPosition,toRelative,fromRelative} from '../src/floating-geometry.mjs';

test('la barra nunca sale de los márgenes de pantalla',()=>{
 const actual=clampPosition(999,-30,220,48,360,720);
 assert.deepEqual(actual,{x:132,y:8});
});
test('la barra se ancla al borde más cercano',()=>{
 const left=snapPosition(31,340,190,42,400,800);
 assert.equal(left.edge,'left');assert.equal(left.x,8);
 const right=snapPosition(250,340,120,42,400,800);
 assert.equal(right.edge,'right');assert.equal(right.x,272);
});
test('las coordenadas relativas sobreviven al giro del teléfono',()=>{
 const relative=toRelative({x:120,y:160},400,800);
 const p=fromRelative(relative,150,45,800,400);
 assert.equal(p.x,240);assert.equal(p.y,80);
});
test('pantallas pequeñas aceptan barras mayores que el área útil',()=>{
 const p=clampPosition(200,100,800,600,340,560);
 assert.equal(p.x,8);assert.equal(p.y,8);
});
