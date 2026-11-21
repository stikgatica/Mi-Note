import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fuseMathCandidates,canAutoConvertMath,recognizeHybridLine,formatMathDisplay} from '../src/math/math-hybrid-ocr.mjs';
const controller=readFileSync(new URL('../src/math/math-controller.js',import.meta.url),'utf8');
const stroke=(id,x,y,w=15,h=36)=>({id,pts:[[x,y],[x+w/2,y+h/2],[x+w,y+h]]});
test('captura: ML Kit reconoce 7+5 pero omite =, con selector activado sí debe convertir',()=>{
 const proposal=fuseMathCandidates({mlCandidates:['7+5'],localText:''});
 assert.equal(proposal.text,'7+5');
 assert.equal(canAutoConvertMath(proposal,true),true);
 assert.equal(canAutoConvertMath(proposal,false),false);
 assert.equal(formatMathDisplay(proposal.text),'7 + 5');
});
test('trazos de = presentes en la hoja recuperan 7 + 5 = sin requerir botón',async()=>{
 const strokes=[stroke('seven',20,70),stroke('five',80,70),
  stroke('eq1',130,80,20,2),stroke('eq2',130,95,20,2)];
 const r=await recognizeHybridLine(strokes,async()=>({candidates:['7+5']}));
 assert.equal(r?.text,'7+5=');
 assert.equal(canAutoConvertMath(r,true),true);
 assert.equal(formatMathDisplay(r.text),'7 + 5 =');
});
test('si 0/8 es dudoso, no se autoconvierte aunque el selector esté activado',async()=>{
 const strokes=[stroke('one',20,70),stroke('zero',80,70)];
 const r=await recognizeHybridLine(strokes,async()=>({candidates:['10-0']}));
 assert.equal(r?.uncertainDigits,true);
 assert.equal(canAutoConvertMath(r,true),false);
});
test('no convierte números sueltos, texto o signos aislados a operaciones',()=>{
 for(const text of ['7','55','22','5+','7=','Reunión 12/12']){
  assert.equal(canAutoConvertMath({text,source:'mlkit-es'},true),false,text);
 }
});
test('controlador espera final de la escritura, reintenta propuestas y retira tarjeta convertida',()=>{
 assert.match(controller,/numbersSelected\(\)\?2350:650/);
 assert.match(controller,/void scanHybridMath\(true\)/);
 assert.match(controller,/mathSuggestions\.delete\(key\)/);
 assert.match(controller,/canAutoConvertMath\(recognized,\$\('mathAutoDigital'\)\.checked\)/);
 assert.match(controller,/await saveLayer\(\[\.\.\.merge\.objects,object\]/);
});
