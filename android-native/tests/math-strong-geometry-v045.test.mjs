import test from 'node:test';
import assert from 'node:assert/strict';
import {fitStrongLine,straightenContour,straightenConnectedSides} from '../src/math/math-strong-geometry.mjs';
import {recognizeAutomatic} from '../src/math/math-auto.mjs';
const near=(a,b,t=20)=>Math.hypot(a[0]-b[0],a[1]-b[1])<t;
const stroke=(id,pts)=>({id,color:'#000000',width:3,pts:pts.map(p=>[...p,.5])});
const curve=(a,b,bulge=11,n=20)=>{
 const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),px=-dy/len,py=dx/len;
 return Array.from({length:n+1},(_,i)=>{const t=i/n,v=bulge*Math.sin(Math.PI*t);
 return [a[0]+dx*t+px*v,a[1]+dy*t+py*v];});
};
test('una línea ondulada queda completamente recta y mantiene extremos próximos',()=>{
 const original=curve([100,300],[350,312],15,24);
 const clean=fitStrongLine(original,{lenMin:90,tolerance:.19});
 assert.ok(clean);
 assert.equal(clean.points.length,2);
 assert.ok(near(clean.points[0],[100,300],25));
 assert.ok(near(clean.points[1],[350,312],25));
 assert.equal(JSON.stringify(original),JSON.stringify(curve([100,300],[350,312],15,24)));
 const out=recognizeAutomatic([stroke('onda',original)]);
 assert.equal(out?.geometry.kind,'line');
 assert.equal(out?.geometry.points.length,2);
});
test('triángulo de un solo trazo con lados curvos se convierte en 3 segmentos de vértice a vértice',()=>{
 const A=[130,490],B=[230,255],C=[390,480];
 const points=[...curve(A,B,9,24),...curve(B,C,-11,24).slice(1),...curve(C,A,10,24).slice(1)];
 const out=straightenContour(points);
 assert.equal(out?.kind,'polygon');
 assert.equal(out?.points.length,3);
 for(const vertex of [A,B,C])assert.ok(out.points.some(p=>near(p,vertex,27)));
 const recognized=recognizeAutomatic([stroke('triangle',points)]);
 assert.equal(recognized?.geometry.kind,'polygon');
 assert.equal(recognized.geometry.points.length,3);
});
test('rectángulo de cuatro trazos ondulados con uniones cercanas termina con cuatro esquinas',()=>{
 const A=[120,160],B=[340,166],C=[339,350],D=[121,349];
 const ink=[
  curve(A,B,8,20),curve([345,170],C,-11,20),
  curve([343,354],D,7,20),curve([117,345],[117,163],-8,20)
 ];
 const r=straightenConnectedSides(ink);
 assert.equal(r?.kind,'polygon');
 assert.equal(r.points.length,4);
 const result=recognizeAutomatic(ink.map((p,i)=>stroke('r'+i,p)));
 assert.equal(result?.geometry.kind,'polygon');
 assert.equal(result.geometry.points.length,4);
});
test('no cierra segmentos separados ni inventa figuras entre dos triángulos diferentes',()=>{
 const disjoint=[
  curve([100,100],[260,100],4),curve([500,500],[650,500],7),
  curve([500,500],[580,650],5)
 ];
 assert.equal(straightenConnectedSides(disjoint),null);
 const open=[...curve([100,400],[200,250],8),...curve([200,250],[300,400],6).slice(1)];
 assert.equal(straightenContour(open),null);
});
test('vértices cercanos se unen sin desplazar la figura ni mutar trazos X10',()=>{
 const A=[120,220],B=[330,230],C=[235,400];
 const raw=[
  curve(A,B,9),curve([338,234],C,7),
  curve([229,405],[114,223],-9)
 ];
 const pristine=JSON.stringify(raw);
 const fig=straightenConnectedSides(raw);
 assert.equal(fig?.kind,'polygon');
 assert.equal(fig.points.length,3);
 for(const v of [A,B,C])assert.ok(fig.points.some(p=>near(p,v,28)));
 assert.equal(JSON.stringify(raw),pristine);
});
