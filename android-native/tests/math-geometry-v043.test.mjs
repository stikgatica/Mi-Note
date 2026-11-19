import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AXES,propose,hitStroke,fingerprint,validObject} from '../src/math/math-geometry.mjs';

const stroke=(id,pts)=>({id,color:'#000000',width:3,pts:pts.map(p=>[p[0],p[1],.5])});
test('cuatro ejes; solo Geometría está habilitada inicialmente',()=>{
 assert.deepEqual(AXES.map(x=>x.id),['numbers','algebra','geometry','data']);
 assert.deepEqual(AXES.filter(x=>x.ready).map(x=>x.id),['geometry']);
});
test('línea recta local conserva extremos y no modifica el trazo original',()=>{
 const ink=stroke('a',[[100,300],[130,302],[180,299],[230,300],[300,301]]);
 const before=JSON.stringify(ink);
 const out=propose([ink]);
 assert.equal(out?.geometry?.kind,'line');
 assert.deepEqual(out?.sourceStrokeIds,['a']);
 assert.deepEqual(out.geometry.points,[[100,300],[300,301]]);
 assert.equal(JSON.stringify(ink),before);
});
test('círculo a partir de puntos reales sin inferir números ni medidas',()=>{
 const points=Array.from({length:91},(_,i)=>[420+85*Math.cos(i*Math.PI*2/90),640+85*Math.sin(i*Math.PI*2/90)]);
 const result=propose([stroke('circle',points)]);
 assert.equal(result?.geometry?.kind,'circle');
 assert.ok(Math.abs(result.geometry.cx-420)<2);
 assert.ok(Math.abs(result.geometry.cy-640)<2);
 assert.ok(Math.abs(result.geometry.r-85)<2);
 assert.equal(result.label,'Circunferencia');
});
test('triángulo y rectángulo cerrados se digitalizan como polígonos sin inventar medidas',()=>{
 const triangle=stroke('t',[[180,700],[250,550],[330,700],[180,700]]);
 const a=propose([triangle],'polygon');
 assert.equal(a?.geometry?.kind,'polygon');
 assert.equal(a.geometry.points.length,3);
 assert.equal(a.geometry.measurements,undefined);
 const rectangle=stroke('r',[[200,200],[400,200],[400,360],[200,360],[200,200]]);
 const b=propose([rectangle],'polygon');
 assert.equal(b?.geometry?.kind,'polygon');
 assert.equal(b.geometry.points.length,4);
});
test('varias aristas separadas producen solo segmentos, nunca caras automáticas',()=>{
 const edges=[stroke('e1',[[100,100],[280,100]]),stroke('e2',[[280,100],[300,250]])];
 const r=propose(edges,'edges');
 assert.equal(r?.geometry?.kind,'segments');
 assert.equal(r.geometry.segments.length,2);
});
test('rechaza figuras dudosas, y permite seleccionar un trazo por proximidad',()=>{
 assert.equal(propose([stroke('scribble',[[1,1],[2,2],[3,3]])]),null);
 assert.ok(Number.isFinite(hitStroke(stroke('x',[[30,50],[100,50]]),[50,57])));
 assert.equal(hitStroke(stroke('x',[[30,50],[100,50]]),[500,500]),Infinity);
});
test('mejoras aceptadas validan firmas y se invalidan si cambia el original',()=>{
 const s=stroke('source',[[50,100],[120,200]]);
 const page={strokes:[s]};
 const obj={accepted:true,geometry:{kind:'line',points:[[50,100],[120,200]]},
  sources:[{id:s.id,signature:fingerprint(s)}]};
 assert.equal(validObject(obj,page),true);
 s.pts[1][0]+=30;
 assert.equal(validObject(obj,page),false);
});
test('El paquete de geometría funciona sin acceso a red ni al protocolo BLE',()=>{
 const a=readFileSync(new URL('../src/math/math-geometry.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/math/math-worker.js',import.meta.url),'utf8');
 const stage=readFileSync(new URL('../scripts/math-stage.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/math/math-controller.js',import.meta.url),'utf8');
 for(const source of [a,worker,stage,ui])
  assert.doesNotMatch(source,/\b(fetch\(|XMLHttpRequest|WebSocket|Gemini|openai\.com|sendCommand|BLE\.connect)\b/);
 assert.match(stage,/MiNoteMathBridge/);
 assert.match(stage,/window\.MiNoteMathVisibility/);
 assert.match(ui,/new Worker\(new URL\('\.\/math-worker\.js'/);
 assert.match(ui,/const visible=enabled&&/);
 assert.match(ui,/setEnabled/);
});
