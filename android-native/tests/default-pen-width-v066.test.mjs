import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('escritura nueva usa grosor 2.5 y tinta negra oscura',()=>{
 const app=read('../src/app.js');
 assert.match(app,/currentColor = '#111827', currentWidth = 2\.5/);
 assert.match(app,/width:currentWidth,pts:/);
 assert.match(app,/x10ActiveStroke=\{id:uid\(\),color:currentColor,width:currentWidth/);
});
test('ambos selectores permiten pasos de medio punto y arrancan en 2.5',()=>{
 const index=read('../src/index.html');
 const mobile=read('../scripts/mobile.mjs');
 assert.match(index,/id="penWidth"[^>]*step="0\.5" value="2\.5"/);
 assert.match(index,/<output id="penWidthLabel">2\.5<\/output>/);
 assert.match(mobile,/id="mobilePenWidth"[^>]*step="0\.5" value="2\.5"/);
 assert.match(mobile,/<output id=\\"mobileWidthValue\\">2\.5<\/output>/);
});
test('ambos importadores Huion preservan negro y grosor 2.5',()=>{
 const app=read('../src/app.js');
 const features=read('../scripts/features.mjs');
 assert.match(app,/color:'#111827',width:2\.5,pts/);
 assert.match(features,/color:'#111827',width:2\.5,pts:points/);
});
test('no se migran ni sobrescriben grosores de trazos existentes',()=>{
 const app=read('../src/app.js');
 const features=read('../scripts/features.mjs');
 assert.doesNotMatch(app,/\.strokes\.forEach\([^)]*\.width\s*=/);
 assert.doesNotMatch(features,/\.strokes\.forEach\([^)]*\.width\s*=/);
});
