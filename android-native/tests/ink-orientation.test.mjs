import test from 'node:test';
import assert from 'node:assert/strict';
import {toReadingPoint,fromReadingPoint,toReadingStrokes,toReadingPaths,
 readingGeometryToPage,uprightTextAngle} from '../src/ink-orientation.mjs';
import {mathematicalLines,formatMathDisplay} from '../src/math/math-hybrid-ocr.mjs';
import {lineBandsFromPage} from '../src/calendar/import-reminders.mjs';
const portrait=[
 {id:'two',pts:[[80,120],[100,110],[118,125],[95,154]]},
 {id:'seven',pts:[[140,111],[170,111],[148,158]]},
 {id:'plusA',pts:[[193,135],[215,135]]},
 {id:'plusB',pts:[[205,122],[205,149]]},
 {id:'six',pts:[[241,112],[232,141],[258,154],[262,129],[239,138]]},
 {id:'eqA',pts:[[298,128],[329,128]]},
 {id:'eqB',pts:[[298,145],[329,145]]},
];
for(const mode of ['portrait','landscape-cw','landscape-ccw']){
 test('OCR Matemática agrupa expresión escrita en '+mode,()=>{
  const physical=portrait.map(stroke=>({...stroke,
   pts:stroke.pts.map(p=>fromReadingPoint(p,mode))}));
  const visible=toReadingStrokes(physical,mode);
  const lines=mathematicalLines(visible);
  assert.equal(lines.length,1);
  assert.deepEqual(new Set(lines[0].strokeIds),new Set(portrait.map(s=>s.id)));
  for(let i=0;i<physical.length;i++)
   assert.deepEqual(physical[i].pts.map(p=>toReadingPoint(p,mode)),portrait[i].pts);
  const geometry=readingGeometryToPage({kind:'text',x:200,y:160,text:'27+6='},mode);
  assert.deepEqual(toReadingPoint([geometry.x,geometry.y],mode),[200,160]);
 });
}
test('Renglones de agenda con letras y fechas conservan su lectura al girar',()=>{
 const writing=[
  {id:'a',pts:[[60,88],[70,92],[80,95]]},
  {id:'b',pts:[[97,87],[106,93],[120,96]]},
  {id:'c',pts:[[60,180],[70,187],[80,196]]},
  {id:'d',pts:[[100,180],[112,188],[124,195]]}
 ];
 for(const mode of ['portrait','landscape-cw','landscape-ccw']){
  const raw=writing.map(s=>({...s,pts:s.pts.map(p=>fromReadingPoint(p,mode))}));
  const readable=toReadingStrokes(raw,mode);
  assert.equal(lineBandsFromPage(readable).length,2);
  assert.deepEqual(toReadingPaths(raw.map(s=>s.pts),mode),writing.map(s=>s.pts));
 }
});
test('Texto digital siempre queda horizontal respecto de la vista',()=>{
 assert.equal(uprightTextAngle('portrait'),0);
 assert.equal(uprightTextAngle('landscape-cw'),-90);
 assert.equal(uprightTextAngle('landscape-ccw'),90);
 assert.equal(formatMathDisplay('27+6='),'27 + 6 =');
});
