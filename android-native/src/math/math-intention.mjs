/* Intención explícita de dibujo, independiente de la X10 y de la tinta original.
 * Una figura seleccionada se normaliza localmente al finalizar sus trazos. */
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const scale=(a,s)=>[a[0]*s,a[1]*s];
const len=a=>Math.hypot(...a);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const dist=(a,b)=>len(sub(a,b));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const DRAW_INTENTIONS=Object.freeze([
 {id:'auto',label:'Automático (detectar figura)'},
 {id:'circle',label:'Círculo / circunferencia'},
 {id:'square',label:'Cuadrado'},
 {id:'rectangle',label:'Rectángulo'},
 {id:'triangle',label:'Triángulo'},
 {id:'rhombus',label:'Rombo'},
 {id:'parallelogram',label:'Paralelogramo'},
 {id:'trapezoid',label:'Trapecio'},
 {id:'pentagon',label:'Pentágono'},
 {id:'hexagon',label:'Hexágono'},
 {id:'line',label:'Línea recta'},
 {id:'polygon',label:'Polígono libre'}
]);
export const geometryName=geometry=>{
 if(!geometry)return 'Figura';
 if(geometry.kind==='circle')return 'Circunferencia';
 if(geometry.kind==='line')return 'Línea recta';
 if(geometry.kind==='polygon')return ({
  3:'Triángulo',4:'Cuadrilátero',5:'Pentágono',6:'Hexágono',7:'Heptágono',8:'Octágono'
 })[geometry.points?.length]||'Polígono';
 return geometry.kind==='text'?'Número o medida':'Figura';
};
const signedArea=points=>points.reduce((s,p,i)=>
 s+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0);

/* Corrige un cuadrilátero identificado; conserva centro, giro y dimensiones.
 * Solo se utiliza si el usuario solicitó esa figura específica. */
export function regularizeQuadrilateral(points,intention){
 if(!['square','rectangle','rhombus','parallelogram'].includes(intention)||points?.length!==4)return null;
 if(!points.every(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)))return null;
 const center=scale(points.reduce(add,[0,0]),.25);
 const edges=points.map((p,i)=>sub(points[(i+1)%4],p));
 const lengths=edges.map(len);
 const min=Math.min(...lengths),max=Math.max(...lengths);
 if(min<12||max/min>4||Math.abs(signedArea(points))<250)return null;
 let result;
 if(intention==='square'||intention==='rectangle'){
  let axis=sub(edges[0],edges[2]);
  if(len(axis)<1)axis=edges[0];
  axis=scale(axis,1/Math.max(1,len(axis)));
  const vertical=[-axis[1]*(signedArea(points)>=0?1:-1),axis[0]*(signedArea(points)>=0?1:-1)];
  const w=Math.max(20,(lengths[0]+lengths[2])/2);
  const h=Math.max(20,(lengths[1]+lengths[3])/2);
  const size=intention==='square'?(w+h)/2:null;
  const hw=(size??w)/2,hh=(size??h)/2;
  result=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]
   .map(([x,y])=>add(center,add(scale(axis,x),scale(vertical,y))));
 }else{
  const a=scale(sub(points[0],points[2]),.5);
  let b=scale(sub(points[1],points[3]),.5);
  if(intention==='rhombus'){
   let perpendicular=[-a[1],a[0]];
   perpendicular=scale(perpendicular,1/Math.max(1,len(perpendicular)));
   if(dot(perpendicular,b)<0)perpendicular=scale(perpendicular,-1);
   b=scale(perpendicular,len(b));
  }
  result=[add(center,a),add(center,b),sub(center,a),sub(center,b)];
 }
 const diag=Math.hypot(Math.max(lengths[0],lengths[2]),Math.max(lengths[1],lengths[3]));
 const avgMove=result.reduce((s,p,i)=>s+dist(p,points[i]),0)/4;
 if(avgMove>diag*.42)return null;
 return {kind:'polygon',points:result};
}

/* Rescate de cuadrados/rectángulos de trazo continuo con curvas o esquinas
 * que el detector libre simplificó como 5-6 vértices. Exige contorno cerrado,
 * evidencia de LAS CUATRO esquinas y ajuste a cuatro lados; un triángulo no pasa. */
export function fitIntendedQuadrilateral(pts,intention){
 if(!['square','rectangle'].includes(intention)||!Array.isArray(pts)||pts.length<8)return null;
 const points=pts.filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]));
 if(points.length<8)return null;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const diag=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
 if(diag<48||dist(points[0],points.at(-1))>Math.max(16,diag*.23))return null;
 let best=null;
 // Buscar la orientación que mejor explica cuatro lados en lugar de
 // suponer que los ejes de la hoja son los ejes del cuadrado.
 for(let j=0;j<90;j++){
  const a=j*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const proj=points.map(p=>[p[0]*c+p[1]*s,-p[0]*s+p[1]*c]);
  const u=proj.map(p=>p[0]),v=proj.map(p=>p[1]);
  const x0=Math.min(...u),x1=Math.max(...u),y0=Math.min(...v),y1=Math.max(...v);
  if(x1-x0<25||y1-y0<25)continue;
  const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  const closeCorner=corners.map(q=>Math.min(...proj.map(p=>dist(p,q))));
  // Esta comprobación impide dibujar un cuadrado inventado desde un círculo.
  if(Math.max(...closeCorner)>diag*.125)continue;
  const residual=proj.reduce((sum,p)=>sum+Math.min(
   Math.abs(p[0]-x0),Math.abs(p[0]-x1),Math.abs(p[1]-y0),Math.abs(p[1]-y1)
  ),0)/proj.length/diag;
  const score=residual+Math.max(...closeCorner)/diag*.3;
  if(!best||score<best.score){
   const rotated=corners.map(([x,y])=>[x*c-y*s,x*s+y*c]);
   best={score,points:rotated};
  }
 }
 if(!best||best.score>.13)return null;
 return regularizeQuadrilateral(best.points,intention);
}

/* Cuando se eligió circunferencia, usar una corrección más tolerante que el
 * modo automático, pero nunca cerrar un arco abierto ni una línea suelta. */
export function fitIntendedCircle(pts,{strict=false}={}){
 if(!Array.isArray(pts)||pts.length<12)return null;
 const points=pts.filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]));
 if(points.length<12)return null;
 const x=points.map(p=>p[0]),y=points.map(p=>p[1]);
 const minX=Math.min(...x),maxX=Math.max(...x),minY=Math.min(...y),maxY=Math.max(...y);
 const w=maxX-minX,h=maxY-minY,diag=Math.hypot(w,h);
 if(Math.min(w,h)<28||Math.max(w,h)/Math.min(w,h)>(strict?1.33:1.62))return null;
 if(dist(points[0],points.at(-1))>Math.max(15,diag*(strict?.17:.22)))return null;
 let cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 // Afinar el centro por minimización de variación radial.
 // Evita desplazar los círculos dibujados irregularmente a un rincón del cuadro.
 let delta=Math.min(w,h)*.07;
 const error=(px,py)=>{
  const radii=points.map(p=>Math.hypot(p[0]-px,p[1]-py));
  const mean=radii.reduce((s,v)=>s+v,0)/radii.length;
  const rms=Math.sqrt(radii.reduce((s,v)=>s+(v-mean)**2,0)/radii.length)/Math.max(1,mean);
  return {r:mean,rms};
 };
 let best=error(cx,cy);
 for(let k=0;k<4;k++){
  for(const [dx,dy] of [[delta,0],[-delta,0],[0,delta],[0,-delta]]){
   const next=error(cx+dx,cy+dy);
   if(next.rms<best.rms){cx+=dx;cy+=dy;best=next;}
  }
  delta*=.52;
 }
 if(best.r<14||best.r>800||best.rms>(strict?.145:.225))return null;
 let sweep=0,perimeter=0;
 for(let i=1;i<points.length;i++){
  const p=points[i-1],q=points[i];
  perimeter+=dist(p,q);
  const a=Math.atan2(p[1]-cy,p[0]-cx),b=Math.atan2(q[1]-cy,q[0]-cx);
  sweep+=Math.atan2(Math.sin(b-a),Math.cos(b-a));
 }
 // Cobertura angular completa, no un arco ni dos bucles superpuestos.
 if(Math.abs(sweep)<(strict?5.35:4.8)||Math.abs(sweep)>8.3)return null;
 if(perimeter<4.6*best.r||perimeter>9.2*best.r)return null;
 // En modo automático, un cuadrado redondeado sigue teniendo tramos rectos y
 // cuatro cambios bruscos de dirección: no convertirlo en circunferencia.
 if(strict){
  const count=16,walk=[],lengths=[0];
  for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+dist(points[i],points[i-1]));
  for(let j=0;j<count;j++){
   const target=perimeter*j/count;
   let i=1;
   while(i<lengths.length-1&&lengths[i]<target)i++;
   const span=Math.max(1e-9,lengths[i]-lengths[i-1]);
   const t=Math.max(0,Math.min(1,(target-lengths[i-1])/span));
   walk.push([points[i-1][0]+t*(points[i][0]-points[i-1][0]),
    points[i-1][1]+t*(points[i][1]-points[i-1][1])]);
  }
  let corners=0;
  for(let i=0;i<count;i++){
   const before=sub(walk[i],walk[(i+count-1)%count]);
   const after=sub(walk[(i+1)%count],walk[i]);
   const cosine=dot(before,after)/(Math.max(1,len(before))*Math.max(1,len(after)));
   if(cosine<.65)corners++;
  }
  if(corners>=3)return null;
 }
 if(cx<0||cx>1000||cy<0||cy>1400)return null;
 return {kind:'circle',cx,cy,r:best.r};
}
export function interpretGeometry(geometry,intention='auto'){
 if(!geometry)return null;
 if(intention==='square'||intention==='rectangle'||intention==='rhombus'||intention==='parallelogram'){
  if(geometry.kind!=='polygon'||geometry.points?.length!==4)return null;
  return regularizeQuadrilateral(geometry.points,intention);
 }
 if(intention==='line')return geometry.kind==='line'?geometry:null;
 if(intention==='circle')return geometry.kind==='circle'?geometry:null;
 if(intention==='triangle')return geometry.kind==='polygon'&&geometry.points?.length===3?geometry:null;
 if(intention==='pentagon')return geometry.kind==='polygon'&&geometry.points?.length===5?geometry:null;
 if(intention==='hexagon')return geometry.kind==='polygon'&&geometry.points?.length===6?geometry:null;
 if(intention==='trapezoid')return geometry.kind==='polygon'&&geometry.points?.length===4?geometry:null;
 if(intention==='polygon')return geometry.kind==='polygon'?geometry:null;
 return geometry;
}
