import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeAutomatic} from '../src/math/math-auto.mjs';
import {joinClosedStrokes} from '../src/math/math-contours.mjs';
import {fitIntendedCircle} from '../src/math/math-intention.mjs';
const stroke=(id,p)=>({id,color:'#000000',width:3,pts:p.map(q=>[...q,.5])});
const curve=(a,b,bulge=8,n=25)=>{
 const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
 return Array.from({length:n+1},(_,i)=>{
  const t=i/n,v=bulge*Math.sin(Math.PI*t);
  return [a[0]+dx*t-dy/len*v,a[1]+dy*t+dx/len*v];
 });
};
const circle=(cx,cy,r,start=0,end=2*Math.PI,n=70)=>
 Array.from({length:n+1},(_,i)=>{
  const t=start+(end-start)*i/n;
  return [cx+r*Math.cos(t)+2*Math.sin(4*t),cy+r*Math.sin(t)+2*Math.cos(3*t)];
 });
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const edges=p=>p.map((x,i)=>[x,p[(i+1)%p.length]]);
test('circunferencia irregular con un trazo se digitaliza sin cambiar coordenadas fuente',()=>{
 const raw=circle(320,450,95);
 const pristine=JSON.stringify(raw);
 const out=recognizeAutomatic([stroke('circle',raw)],'circle');
 assert.equal(out?.geometry?.kind,'circle');
 assert.ok(dist([out.geometry.cx,out.geometry.cy],[320,450])<12);
 assert.ok(Math.abs(out.geometry.r-95)<12);
 assert.equal(JSON.stringify(raw),pristine);
});
test('dos medios círculos conectados forman una única circunferencia',()=>{
 const a=circle(300,360,90,0,Math.PI),b=circle(300,360,90,Math.PI,2*Math.PI);
 const result=recognizeAutomatic([stroke('a',a),stroke('b',b)],'circle');
 assert.equal(result?.geometry?.kind,'circle');
 assert.deepEqual(result.sourceStrokeIds,['a','b']);
});
test('un arco abierto no se convierte en círculo completo',()=>{
 const arc=circle(300,400,95,0,Math.PI*1.5);
 assert.equal(fitIntendedCircle(arc),null);
 assert.equal(recognizeAutomatic([stroke('arc',arc)],'circle'),null);
});
test('cuadrado realizado con dos trazos de dos lados cada uno',()=>{
 const A=[140,160],B=[310,157],C=[313,326],D=[137,331];
 const p1=[...curve(A,B,6),...curve(B,C,-7).slice(1)];
 const p2=[...curve(C,D,8),...curve(D,A,-5).slice(1)];
 const result=recognizeAutomatic([stroke('a',p1),stroke('b',p2)],'square');
 assert.equal(result?.geometry?.kind,'polygon');
 const sides=edges(result.geometry.points);
 assert.equal(sides.length,4);
 const lengths=sides.map(e=>dist(...e));
 assert.ok(lengths.every(d=>Math.abs(d-lengths[0])<.0001));
 assert.deepEqual(result.sourceStrokeIds,['a','b']);
});
test('un triángulo dibujado no se convierte en cuadrado por intención',()=>{
 const p=[[100,300],[200,90],[340,300],[100,300]];
 assert.equal(recognizeAutomatic([stroke('triangle',p)],'square'),null);
});
test('figuras alejadas no se unen como una sola figura',()=>{
 const a=circle(200,300,80,0,Math.PI),b=circle(600,700,80,Math.PI,2*Math.PI);
 assert.equal(joinClosedStrokes([a,b]),null);
 assert.equal(recognizeAutomatic([stroke('a',a),stroke('b',b)],'circle'),null);
});
