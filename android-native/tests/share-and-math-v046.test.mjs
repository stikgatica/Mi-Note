import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addMiNoteProvider,PROVIDER_CLASS,PROVIDER_AUTHORITY} from '../native-backup/share-provider.mjs';
import {regularizeQuadrilateral,interpretGeometry} from '../src/math/math-intention.mjs';
import {recognizeAutomatic,mergeAutomatic} from '../src/math/math-auto.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const close=(a,b,eps=1e-5)=>Math.abs(a-b)<eps;
const stroke=(id,p)=>({id,color:'#000000',width:3,pts:p.map(v=>[...v,.5])});
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];

test('el proveedor de compartir se añade aunque otro FileProvider de Capacitor esté presente',()=>{
 const old='<manifest><application><provider android:name="androidx.core.content.FileProvider" android:authorities="other.provider" /></application></manifest>';
 const xml=addMiNoteProvider(old);
 assert.match(xml,/other\.provider/);
 assert.ok(xml.includes(PROVIDER_CLASS));
 assert.ok(xml.includes(PROVIDER_AUTHORITY));
 assert.ok(xml.includes('@xml/minote_share_paths'));
 assert.equal(xml.match(/MiNoteShareProvider/g)?.length,1);
 assert.equal(addMiNoteProvider(xml),xml);
 const setup=read('../native-backup/setup.mjs'),native=read('../native-backup/MiNoteShareProvider.java');
 assert.match(setup,/addMiNoteProvider\(manifest\)/);
 assert.match(setup,/MiNoteShareProvider\.java/);
 assert.match(native,/extends FileProvider/);
});
test('Compartir HTML usa saltos de línea reales en diálogo, no secuencias visibles',()=>{
 const builder=read('../scripts/mobile.mjs');
 const context=builder.slice(builder.indexOf('const shareDialog=['),builder.indexOf('const memoryDialog=['));
 const realJoin="].join('"+String.fromCharCode(92)+"n');";
 const literalJoin="].join('"+String.fromCharCode(92)+String.fromCharCode(92)+"n');";
 assert.ok(context.includes(realJoin),'el diálogo debe unirse con saltos reales');
 assert.ok(!context.includes(literalJoin),'no debe mostrarse la secuencia literal barra-n');
});
test('cuadrilátero trapezoidal intencional se ajusta a cuadrado girado de 90°',()=>{
 const input=[[120,130],[265,118],[291,291],[109,277]];
 const original=JSON.stringify(input);
 const result=regularizeQuadrilateral(input,'square');
 assert.ok(result);
 const pts=result.points;
 assert.equal(pts.length,4);
 const sides=pts.map((p,i)=>sub(pts[(i+1)%4],p));
 for(const side of sides)assert.ok(close(dist([0,0],side),dist([0,0],sides[0]),1e-4));
 for(let i=0;i<4;i++)assert.ok(Math.abs(dot(sides[i],sides[(i+1)%4]))<1e-4);
 assert.equal(JSON.stringify(input),original,'jamás modificar el original');
 assert.equal(interpretGeometry({kind:'polygon',points:input},'square')?.kind,'polygon');
});
test('Rectángulo respeta dos dimensiones y es ortogonal',()=>{
 const input=[[100,100],[310,105],[330,185],[108,195]];
 const out=regularizeQuadrilateral(input,'rectangle');
 assert.ok(out);
 const p=out.points,e=p.map((v,i)=>sub(p[(i+1)%4],v));
 assert.ok(dist([0,0],e[0])>dist([0,0],e[1])*1.9);
 assert.ok(Math.abs(dot(e[0],e[1]))<1e-4);
 assert.equal(interpretGeometry({kind:'polygon',points:input},'triangle'),null);
 assert.equal(regularizeQuadrilateral(input,'auto'),null);
});
test('detectar cuadrado previsto no altera triángulos ni inventa vértices',()=>{
 const triangle=stroke('tri',[[110,320],[190,140],[310,315],[110,320]]);
 assert.equal(recognizeAutomatic([triangle],'square'),null);
 const ink=stroke('square',[[100,100],[270,94],[286,266],[97,274],[100,100]]);
 const proposed=recognizeAutomatic([ink],'square');
 assert.equal(proposed?.geometry?.kind,'polygon');
 const sides=proposed.geometry.points.map((p,i)=>dist(p,proposed.geometry.points[(i+1)%4]));
 assert.ok(sides.every(d=>Math.abs(d-sides[0])<1e-5));
});
test('cambiar intención actualiza geometría automática, pero nunca la corregida manualmente',()=>{
 const from={id:'id',automatic:true,type:'polygon',geometry:{kind:'polygon',points:[[0,0],[2,0],[4,4],[0,4]]},
  sources:[{id:'t1',signature:'a'}]};
 const newValue={type:'polygon',geometry:{kind:'polygon',points:[[0,0],[4,0],[4,4],[0,4]]},
  sources:[{id:'t1',signature:'a'}]};
 assert.deepEqual(mergeAutomatic([from],newValue)?.objects,[]);
 assert.equal(mergeAutomatic([{...from,automatic:false}],newValue),null);
});
test('El selector de figura es explícito y se envía al worker; Bluetooth no se modifica',()=>{
 const ui=read('../src/math/math-controller.js'),worker=read('../src/math/math-worker.js');
 assert.match(ui,/id="mathIntention"/);
 assert.match(ui,/intention:intendedShape/);
 assert.match(ui,/orientation:get\(\)\?\.orientation/);
 assert.match(worker,/recognizeAutomatic\(strokes,intention,orientation\)/);
 assert.match(worker,/orientation='portrait'/);
});
