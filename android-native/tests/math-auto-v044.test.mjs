import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HANDWRITING_TEMPLATES,recognizeInk} from '../src/math/math-ink-ocr.mjs';
import {recognizeAutomatic,mergeAutomatic} from '../src/math/math-auto.mjs';
import {fingerprint} from '../src/math/math-geometry.mjs';

const make=(id,points,x=130,y=250,w=40,h=52)=>({
 id,color:'#000000',width:3,pts:points.map(p=>[x+p[0]*w,y+p[1]*h,.5])
});
const digit=(value,id='number')=>make(id,HANDWRITING_TEMPLATES[value][0]);
test('OCR de números local reconoce al menos un 7 de trazo inequívoco',()=>{
 const seven=digit('7');
 const result=recognizeInk([seven]);
 assert.equal(result?.geometry?.text,'7');
 assert.deepEqual(result.sourceStrokeIds,['number']);
 assert.equal(result.type,'text');
});
test('OCR local interpreta una medida 7 cm solo con plantillas de tinta inequívoca',()=>{
 const glyph=(symbol,id,x,y,w,h)=>HANDWRITING_TEMPLATES[symbol].map((path,i)=>make(id+i,path,x,y,w,h));
 const strokes=[
  ...glyph('7','seven',100,200,25,42),
  ...glyph('c','centi',135,212,18,30),
  ...glyph('m','meter',161,212,30,30)
 ];
 const result=recognizeInk(strokes);
 assert.equal(result?.geometry?.text,'7cm');
 assert.deepEqual(result.sourceStrokeIds,strokes.map(x=>x.id));
});
test('OCR contextual diferencia 7° de 70 por altura del círculo',()=>{
 const number=make('digit',HANDWRITING_TEMPLATES['7'][0],100,200,30,45);
 const degree=make('degree',HANDWRITING_TEMPLATES['°'][0],141,201,14,14);
 assert.equal(recognizeInk([number,degree])?.geometry?.text,'7°');
 const zero=make('zero',HANDWRITING_TEMPLATES['0'][0],141,200,29,45);
 assert.equal(recognizeInk([number,zero])?.geometry?.text,'70');
});
test('no inventa un número ante tinta ambigua o garabatos',()=>{
 const x=make('ambiguous',[[0,0],[.3,.3],[.6,.2],[1,.9],[0,.8],[.7,0]]);
 assert.equal(recognizeInk([x]),null);
});
test('automatización: recta, círculo y polígonos sin seleccionar manualmente',()=>{
 const line=make('line',[[0,.5],[.5,.5],[1,.5]],30,130,230,10);
 assert.equal(recognizeAutomatic([line])?.geometry?.kind,'line');
 const circle=make('circle',Array.from({length:61},(_,i)=>[
  .5+.5*Math.cos(i*Math.PI*2/60),.5+.5*Math.sin(i*Math.PI*2/60)
 ]),210,340,160,160);
 assert.equal(recognizeAutomatic([circle])?.geometry?.kind,'circle');
 const triangle=make('triangle',[[0,1],[.5,0],[1,1],[0,1]],180,360,170,120);
 assert.equal(recognizeAutomatic([triangle])?.geometry?.kind,'polygon');
});
test('mejoras de varios trazos pueden reemplazar solo reconocimientos automáticos anteriores',()=>{
 const s={id:'a',pts:[[30,50],[230,50]],width:3};
 const before=[{id:'old',automatic:true,type:'line',sources:[{id:s.id,signature:fingerprint(s)}]}];
 const proposal={sources:[{id:s.id,signature:fingerprint(s)},{id:'b',signature:'new'}],type:'polygon'};
 const result=mergeAutomatic(before,proposal);
 assert.deepEqual(result?.objects,[]);
 assert.deepEqual(result?.replaced,['old']);
 assert.equal(mergeAutomatic([{...before[0],automatic:false}],proposal),null);
});
test('Modo Matemática se procesa al levantar el lápiz, sin selector ni IA remota',()=>{
 const stage=readFileSync(new URL('../scripts/math-stage.mjs',import.meta.url),'utf8');
 const controller=readFileSync(new URL('../src/math/math-controller.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/math/math-worker.js',import.meta.url),'utf8');
 for(const source of [stage,controller,worker])
  assert.doesNotMatch(source,/Gemini|fetch\(|XMLHttpRequest|WebSocket/);
 assert.match(stage,/minote:stroke-finished/);
 assert.match(stage,/source:'huion'/);
 assert.match(stage,/source:'touch'/);
 assert.match(controller,/setTimeout\(\(\)=>void scanRecent\(false\),numbersSelected\(\)\?1300:650\)/);
 assert.match(controller,/new Worker\(new URL\('\.\/math-worker\.js'/);
 assert.doesNotMatch(controller,/mathImprove|mathSelectMode|captureSelection\(/);
 assert.match(worker,/recognizeAutomatic/);
 assert.match(controller,/Editar un reconocimiento|Corregir un reconocimiento/);
});
