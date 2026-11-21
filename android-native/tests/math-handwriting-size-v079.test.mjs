import test from 'node:test';
import assert from 'node:assert/strict';
import {mathematicalLines,hasHandwrittenEquals,recognizeHybridLine,canAutoConvertMath} from '../src/math/math-hybrid-ocr.mjs';
import {toReadingStrokes,fromReadingPoint} from '../src/ink-orientation.mjs';

const stroke=(id,pts)=>({id,color:'#111827',width:3,pts:pts.map(([x,y])=>[x,y,.6])});
const large=[
 stroke('2a',[[90,110],[120,86],[150,95],[150,118],[96,191],[157,192]]),
 stroke('2b',[[172,111],[200,86],[228,98],[226,122],[175,192],[236,193]]),
 stroke('plusV',[[274,108],[274,172]]),
 stroke('plusH',[[247,141],[303,137]]),
 stroke('seven',[[334,92],[397,94],[358,187]]),
 stroke('equals1',[[440,110],[495,112]]),
 stroke('equals2',[[440,130],[495,134]])
];
for(const orientation of ['portrait','landscape-cw','landscape-ccw']){
 test('igual manuscrito se incorpora al renglón completo en '+orientation,()=>{
  const real=large.map(s=>({...s,pts:s.pts.map(p=>fromReadingPoint(p,orientation))}));
  const reading=toReadingStrokes(real,orientation);
  const lines=mathematicalLines(reading,{maxWidth:1150});
  assert.equal(lines.length,1);
  assert.equal(lines[0].strokes.length,7);
  assert.equal(hasHandwrittenEquals(lines[0].strokes),true);
 });
}
test('OCR conserva tamaño y ancho manuscritos y el signo igual visible',async()=>{
 const result=await recognizeHybridLine(large,async()=>({candidates:['22+7']}),{maxWidth:1150});
 assert.ok(result);
 assert.equal(result.text,'22+7=');
 assert.equal(result.drawnEquals,true);
 assert.ok(result.geometry.size>95);
 assert.ok(result.geometry.inkWidth>380);
 assert.equal(canAutoConvertMath(result,true),true);
});
test('nunca convierte antes de un igual, incluso con ML Kit',()=>{
 assert.equal(canAutoConvertMath({text:'22+7',source:'mlkit-es'},true),false);
 assert.equal(canAutoConvertMath({text:'22+7=',source:'mlkit-es'},true),true);
});
