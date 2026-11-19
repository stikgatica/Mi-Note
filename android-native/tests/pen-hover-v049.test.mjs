import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isHoverPointer,toVisualPosition} from '../src/pen-hover-geometry.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('puntero pen y mouse solo cuando no hay contacto; touch no aparece',()=>{
 assert.equal(isHoverPointer({pointerType:'pen',buttons:0}),true);
 assert.equal(isHoverPointer({pointerType:'mouse',buttons:0}),true);
 assert.equal(isHoverPointer({pointerType:'touch',buttons:0}),false);
 assert.equal(isHoverPointer({pointerType:'pen',buttons:1}),false);
 assert.equal(isHoverPointer({pointerType:'pen',buttons:0},true),false);
});
test('rotación visual no cambia posiciones manuscritas',()=>{
 assert.deepEqual(toVisualPosition(500,700,'portrait'),{u:.5,v:.5});
 assert.deepEqual(toVisualPosition(1000,0,'landscape-cw'),{u:1,v:1});
 assert.deepEqual(toVisualPosition(0,1400,'landscape-cw'),{u:0,v:0});
 assert.deepEqual(toVisualPosition(0,0,'landscape-ccw'),{u:0,v:1});
 assert.equal(toVisualPosition(-2,3,'portrait'),null);
 assert.equal(toVisualPosition(3,NaN,'portrait'),null);
});
test('aro es visual sin relleno ni marcas en los cuadernos',()=>{
 const css=read('../src/pen-hover.css');
 const hover=read('../src/pen-hover.js');
 assert.match(css,/background:transparent!important/);
 assert.match(css,/pointer-events:none!important/);
 assert.match(css,/width:10px!important/);
 assert.match(hover,/ring\.setAttribute\('aria-hidden','true'\)/);
 assert.match(hover,/ring\.dataset\.visible='false'/);
 assert.doesNotMatch(hover,/\.strokes\.push\(/);
 assert.doesNotMatch(hover,/saveLayer\(/);
});
test('eventos sin contacto Huion X10 requieren datos realmente transmitidos',()=>{
 const stage=read('../scripts/math-stage.mjs');
 const hover=read('../src/pen-hover.js');
 assert.match(stage,/raw\.x>0&&raw\.y>0/);
 assert.match(stage,/MiNoteX10Ble\.mapPoint/);
 assert.match(stage,/minote:x10-hover/);
 assert.match(hover,/minote:x10-hover-end/);
 assert.match(hover,/setTimeout\(hide,450\)/);
 assert.match(stage,/pen-hover\.js/);
 assert.match(stage,/pen-hover\.css/);
});
test('versión APK V0.49 o posterior con firma y publicación propias',()=>{
 const workflow=read('../../.github/workflows/android-release.yml');
 const pkg=JSON.parse(read('../package.json'));
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
 assert.ok(match);
 const minor=Number(match[2]);
 assert.ok(minor>=49);
 assert.match(workflow,new RegExp('versionCode '+minor+'\\b'));
 const tag='v'+match[1]+'.'+match[2];
 assert.ok(workflow.includes('Mi-Note-X10-Android-'+tag+'.apk'));
 assert.ok(workflow.includes('android-'+tag));
});
