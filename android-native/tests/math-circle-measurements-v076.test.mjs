import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitCircleMeasurementLine,parseCircleMeasure,findCircleMeasurements,chooseCircleLabel} from '../src/math/math-circle-measurements.mjs';
const circle={kind:'circle',cx:200,cy:250,r:90};
const st=(id,pts)=>({id,pts});
const radius=st('radius',[[200,250],[216,238],[245,226],[275,200]]);
const diameter=st('diameter',[[110,250],[145,251],[200,250],[250,251],[290,250]]);
const ring=st('ring',Array.from({length:41},(_,i)=>{
 const a=2*Math.PI*i/40;return [200+90*Math.cos(a),250+90*Math.sin(a)];
}));
test('radio: endereza desde el centro de la circunferencia hasta su perímetro',()=>{
 const x=fitCircleMeasurementLine(circle,radius);
 assert.ok(x);assert.equal(x.type,'radius');
 assert.deepEqual(x.points[0],[200,250]);
 assert.ok(Math.abs(Math.hypot(x.points[1][0]-200,x.points[1][1]-250)-90)<1e-6);
});
test('diámetro: endereza hacia dos puntos opuestos pasando por el centro',()=>{
 const x=fitCircleMeasurementLine(circle,diameter);
 assert.equal(x?.type,'diameter');
 assert.equal(Math.hypot(x.points[1][0]-x.points[0][0],x.points[1][1]-x.points[0][1]),180);
});
test('no confunde borde circular, cuerda corta o anotación con radio/diámetro',()=>{
 const chord=st('chord',[[145,220],[170,220],[195,220]]);
 const short=st('short',[[200,250],[205,245],[210,240]]);
 assert.equal(fitCircleMeasurementLine(circle,ring),null);
 assert.equal(fitCircleMeasurementLine(circle,chord),null);
 assert.equal(fitCircleMeasurementLine(circle,short),null);
});
test('interpreta correctamente unidades y no inventa el valor a partir del radio dibujado',()=>{
 assert.deepEqual(parseCircleMeasure('7cm'),{text:'7 cm',type:null});
 assert.deepEqual(parseCircleMeasure('9 cm'),{text:'9 cm',type:null});
 assert.deepEqual(parseCircleMeasure('r = 5'),{text:'5',type:'radius'});
 assert.deepEqual(parseCircleMeasure('D: 9cm'),{text:'9 cm',type:'diameter'});
 assert.deepEqual(parseCircleMeasure('7,5 mm'),{text:'7,5 mm',type:null});
 for(const v of ['','30:00','5/12','abc','-2 cm','7 cm2','0 cm']){
  assert.equal(parseCircleMeasure(v),null,v);
 }
});
test('asocia trazos al círculo sin tomar el contorno como número',()=>{
 const label=[st('7',[[223,225],[226,218],[230,210]]),st('cm',[[235,220],[237,216],[248,217]])];
 const objects=[{id:'circleA',geometry:circle,sources:[{id:'ring'}]}];
 const matches=findCircleMeasurements(objects,[ring,radius,...label]);
 assert.ok(matches.length>=1);
 const found=matches.find(m=>m.stroke.id==='radius');
 assert.ok(found);
 assert.ok(found.labels.length>=1);
 assert.equal(found.labels.some(s=>s.id==='ring'),false);
});
test('conflictos OCR y prefijos incompatibles dejan la escritura intacta',()=>{
 const detected=fitCircleMeasurementLine(circle,radius);
 assert.deepEqual(chooseCircleLabel(detected,['7cm']),{text:'7 cm',reliable:true,options:['7 cm']});
 assert.equal(chooseCircleLabel(detected,['7cm','9cm']).reliable,false);
 assert.equal(chooseCircleLabel(detected,['D: 7cm']),null);
 assert.deepEqual(chooseCircleLabel(detected,['5']).text,'5');
});
test('controlador integra escaneo automático después de las figuras; tinta original intacta',()=>{
 const src=readFileSync(new URL('../src/math/math-controller.js',import.meta.url),'utf8');
 assert.match(src,/async function scanCircleMeasurements/);
 assert.match(src,/await scanCircleMeasurements\(\)/);
 assert.match(src,/chooseCircleLabel\(item\.line,candidates\)/);
 assert.match(src,/mergeAutomatic\(existing,proposal\)/);
 assert.match(src,/await saveLayer\(\[\.\.\.merged\.objects,labelObject\]/);
 assert.doesNotMatch(src,/page\.strokes\s*=/);
});
