import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatMathDisplay,canAutoConvertMath,normalizeArithmetic,fuseMathCandidates} from '../src/math/math-hybrid-ocr.mjs';
const controller=readFileSync(new URL('../src/math/math-controller.js',import.meta.url),'utf8');

test('operaciones reales se muestran con espacios alrededor de signos',()=>{
 for(const [source,want] of [
  ['7+5=','7 + 5 ='],
  ['24-8=','24 - 8 ='],
  ['36:6=','36 ÷ 6 ='],
  ['36÷6=','36 ÷ 6 ='],
  ['54-20=','54 - 20 ='],
  ['25+38=','25 + 38 ='],
  ['6x8=','6 × 8 ='],
  ['3,75-1,25=','3,75 - 1,25 ='],
  ['-8+15=','-8 + 15 ='],
  ['2×(-3)=','2 × (-3) ='],
  ['(2+3)×4=','(2 + 3) × 4 ='],
  ['12.5÷2','12.5 ÷ 2']
 ]){
  assert.equal(formatMathDisplay(source),want,source);
  assert.equal(normalizeArithmetic(formatMathDisplay(source))?.text,normalizeArithmetic(source)?.text);
 }
});
test('formato es idempotente y no modifica texto no aritmético',()=>{
 assert.equal(formatMathDisplay('7 + 5 ='),'7 + 5 =');
 assert.equal(formatMathDisplay(formatMathDisplay('36:6=')),'36 ÷ 6 =');
 assert.equal(formatMathDisplay('Médico 21/12'),'Médico 21/12');
});
test('el selector solo autoriza autoconversión si está activado y la operación termina con igual',()=>{
 const primary=fuseMathCandidates({mlCandidates:['7+5='],localText:''});
 assert.equal(primary.autoAccept,false);
 assert.equal(canAutoConvertMath(primary,false),false);
 assert.equal(canAutoConvertMath(primary,true),true);
 assert.equal(canAutoConvertMath({...primary,text:'7+5'},true),false);
 assert.equal(canAutoConvertMath({...primary,uncertainDigits:true},true),false);
 assert.equal(canAutoConvertMath({source:'mlkit-es',text:'55'},true),false);
 const agreed=fuseMathCandidates({mlCandidates:['36÷6='],localText:'36÷6=',localConfidence:.93});
 assert.equal(canAutoConvertMath(agreed,true),true);
});
test('tanto hoja digital como propuestas y ajustes muestran texto con espacios',()=>{
 assert.match(controller,/label\.textContent=formatMathDisplay\(g\.text\)/);
 assert.match(controller,/field\.value=formatMathDisplay\(proposal\.text\)/);
 assert.match(controller,/formatMathDisplay\(proposal\.geometry\.text\)/);
 assert.match(controller,/formatMathDisplay\(parsed\.text\)/);
 assert.match(controller,/formatMathDisplay\(text\)/);
 assert.match(controller,/vals\.text=normalizeArithmetic\(text\)\?formatMathDisplay\(text\):text/);
});
test('selector gobierna conversión automática, conserva preferencias y permite corrección',()=>{
 assert.match(controller,/canAutoConvertMath\(recognized,\$\('mathAutoDigital'\)\.checked\)/);
 assert.match(controller,/mathAutoDigital'\)\.addEventListener\('change'/);
 assert.match(controller,/minote:math-auto-convert/);
 assert.match(controller,/await saveLayer\(\[\.\.\.merge\.objects,object\]/);
 assert.match(controller,/Los trazos originales están conservados/);
 assert.match(controller,/reconocer/i);
});
