import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeArithmetic,fuseMathCandidates,mathematicalLines,recognizeHybridLine,sampledMathStrokes} from '../src/math/math-hybrid-ocr.mjs';
import {AXES} from '../src/math/math-geometry.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('normalizar números, decimales y operaciones sin calcular resultados',()=>{
 const cases=[
  ['25 + 38 =','25+38='],['144 : 12','144÷12'],['6 x 8 = 48','6×8=48'],
  ['3,75 - 1,25','3,75-1,25'],['(2 + 3) × 4','(2+3)×4'],
  ['-8 + 15','-8+15'],['25','25'],['12.5÷2','12.5÷2'],
  ['6 · 8','6×8']
 ];
 for(const [input,want] of cases)assert.equal(normalizeArithmetic(input)?.text,want,input);
});
test('rechaza palabras, raíces/facciones avanzadas y expresiones incompletas dudosas',()=>{
 const bad=['','a + b','Reunión 12/12','2+','2++3','4÷','12=3=4','2√3',
  '25 + 8a','1','0','14:00 pm','12/12/2026','2=3+','(2+3','25+38=0='];
 for(const input of bad)assert.equal(normalizeArithmetic(input),null,input);
});
test('dos fuentes de acuerdo convierten automáticamente solo con plantilla confiable',()=>{
 const m=fuseMathCandidates({mlCandidates:['25 + 38 =','25+33='],localText:'25+38=',localConfidence:.95});
 assert.equal(m.text,'25+38=');
 assert.equal(m.source,'hybrid-consensus');
 assert.equal(m.autoAccept,true);
 assert.equal(m.needsReview,false);
});
test('una única fuente o discrepancia no reemplaza escritura automáticamente',()=>{
 const cases=[
  {mlCandidates:['25 + 38 ='],localText:'25+33=',localConfidence:.97},
  {mlCandidates:['25 + 38 ='],localText:'',localConfidence:0},
  {mlCandidates:[],localText:'25+38=',localConfidence:.95}
 ];
 for(const input of cases){
  const m=fuseMathCandidates(input);assert.ok(m);assert.equal(m.autoAccept,false);
  assert.equal(m.needsReview,true);
 }
});
test('sin expresión validable no se inventa propuesta',()=>{
 assert.equal(fuseMathCandidates({mlCandidates:['taller 15/12','fecha','1+'],localText:''}),null);
});
test('agrupa trazos de una operación por línea sin fusionar líneas alejadas',()=>{
 const rows=[{x:50,y:130},{x:85,y:132},{x:130,y:135},{x:62,y:480},{x:103,y:483}];
 const strokes=rows.map((r,i)=>({id:'t'+i,pts:[[r.x,r.y],[r.x+11,r.y+22],[r.x+16,r.y+37]]}));
 const lines=mathematicalLines(strokes);
 assert.equal(lines.length,2);
 assert.deepEqual(lines[0].strokeIds,['t0','t1','t2']);
 assert.deepEqual(lines[1].strokeIds,['t3','t4']);
});
test('nunca consulta más puntos de los presupuestados',()=>{
 const strokes=Array.from({length:90},(_,i)=>({id:String(i),
  pts:Array.from({length:400},(_,j)=>[j%90,Math.floor(j/90)])}));
 const sampled=sampledMathStrokes(strokes);
 assert.ok(sampled.length<=80);
 assert.ok(sampled.reduce((sum,s)=>sum+s.length,0)<=9500);
});
test('ML Kit puede reconocer una operación aunque el clasificador local no logre leerla',async()=>{
 const strokes=[{id:'a',color:'#111827',pts:[[10,20],[25,20],[25,40]]},
  {id:'b',pts:[[35,18],[40,40],[45,18]]}];
 let calls=0;
 const output=await recognizeHybridLine(strokes,async({strokes:pts})=>{
  calls++;assert.equal(pts.length,2);
  return {candidates:['25 + 38 =','25 + 33 =']};
 });
 assert.equal(calls,1);
 assert.equal(output.text,'25+38=');
 assert.equal(output.autoAccept,false);
 assert.equal(output.geometry.kind,'text');
 assert.equal(output.geometry.text,'25+38=');
 assert.deepEqual(output.strokeIds,['a','b']);
});
test('sin modelo descargado, devuelve nulo o alternativa local sin inventar operadores',async()=>{
 const result=await recognizeHybridLine([{id:'s',pts:[[1,10],[10,20],[20,30]]}],async()=>{throw Error('modelo ausente');});
 assert.ok(result===null||result.autoAccept===false);
});
test('Modo Matemática permite cambiar a números, descargar el mismo modelo ML Kit y editar propuestas',()=>{
 const ui=read('../src/math/math-controller.js');
 const axes=AXES.find(a=>a.id==='numbers');
 assert.equal(axes.ready,true);
 for(const id of ['mathNumbersControls','mathScanNumbers','mathDownloadModel','mathHybridCandidates','mathAutoDigital','mathNumbersShowLayer'])
  assert.match(ui,new RegExp(id));
 assert.match(ui,/registerPlugin\('MiNoteCalendar'\)/);
 assert.match(ui,/mlkitMath\.recognize/);
 assert.match(ui,/normalizeArithmetic\(field\.value\)/);
 assert.match(ui,/mergeAutomatic\(prior,candidate\)/);
 assert.match(ui,/Math\.random|crypto\?\.randomUUID/);
});
test('la tinta original no se modifica al convertir a capa digital',()=>{
 const controller=read('../src/math/math-controller.js');
 assert.match(controller,/await saveLayer\(\[\.\.\.merge\.objects,object\]/);
 assert.match(controller,/sigsMatch/);
 const build=read('../scripts/math-stage.mjs');
 assert.match(build,/mathLayer:pg\.mathLayer\|\|null/);
 assert.match(build,/pg\.mathLayer=payload/);
 assert.doesNotMatch(controller,/pg\.strokes\s*=/);
});
