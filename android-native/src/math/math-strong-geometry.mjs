/* GeoInk V2 fue referencia conceptual (Douglas-Peucker y segmentos conectados).
 * Esta implementación es nueva, local, sin BLE, UI ni PWA.
 * Los resultados son geometría NUEVA; nunca se mutan los trazos fuente. */
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bounds=pts=>({
 minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),
 minY:Math.min(...pts.map(p=>p[1])),maxY:Math.max(...pts.map(p=>p[1]))
});
const diagonal=pts=>{const b=bounds(pts);return Math.hypot(b.maxX-b.minX,b.maxY-b.minY);};
const area=pts=>Math.abs(pts.reduce((s,p,i)=>s+cross(p,pts[(i+1)%pts.length]),0))/2;
const sideDistance=(p,a,b)=>{
 const v=sub(b,a),den=dot(v,v)||1,t=clamp(dot(sub(p,a),v)/den,0,1);
 return dist(p,[a[0]+t*v[0],a[1]+t*v[1]]);
};
const deviation=(p,a,b)=>{
 const v=sub(b,a);
 return Math.abs(cross(sub(p,a),v))/Math.max(1,dist(a,b));
};
const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]||0;
const pointAt=(c,v,t)=>[c[0]+t*v[0],c[1]+t*v[1]];
// Recta total least squares: ajusta también los puntos intermedios, no solo
// une los extremos manuscritos. Proyecta extremos para quitar la ondulación.
export function fitStrongLine(pts,{lenMin=16,tolerance=.19}={}){
 if(!Array.isArray(pts)||pts.length<2)return null;
 const a=pts[0],b=pts.at(-1),len=dist(a,b);
 if(len<lenMin)return null;
 const deviations=pts.map(p=>deviation(p,a,b));
 if(percentile(deviations,.85)>Math.max(7,len*tolerance))return null;
 const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length;
 const cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
 let xx=0,xy=0,yy=0;
 for(const p of pts){const x=p[0]-cx,y=p[1]-cy;xx+=x*x;xy+=x*y;yy+=y*y;}
 const theta=.5*Math.atan2(2*xy,xx-yy);
 let v=[Math.cos(theta),Math.sin(theta)];
 if(dot(v,sub(b,a))<0)v=[-v[0],-v[1]];
 const center=[cx,cy],t0=dot(sub(a,center),v),t1=dot(sub(b,center),v);
 if(t1-t0<Math.max(12,lenMin*.8))return null;
 const improved=[pointAt(center,v,t0),pointAt(center,v,t1)];
 // Un trazo ya recto se mantiene con sus extremos exactos.
 const endpoints=percentile(deviations,.85)<Math.max(2.5,len*.014)?[a.slice(),b.slice()]:improved;
 return {points:endpoints,center,direction:v,length:dist(...endpoints),
  residual:percentile(pts.map(p=>deviation(p,...endpoints)),.85)};
}
function simplifyIndices(points,epsilon){
 const keep=new Set([0,points.length-1]),pending=[[0,points.length-1]];
 while(pending.length){
  const [a,b]=pending.pop();let max=0,index=-1;
  for(let i=a+1;i<b;i++){const d=sideDistance(points[i],points[a],points[b]);if(d>max){max=d;index=i;}}
  if(index!==-1&&max>epsilon){keep.add(index);pending.push([a,index],[index,b]);}
 }
 return [...keep].sort((a,b)=>a-b);
}
const signedArea=pts=>pts.reduce((s,p,i)=>s+cross(p,pts[(i+1)%pts.length]),0);
function intersects(a,b,c,d){
 const cross1=cross(sub(b,a),sub(c,a)),cross2=cross(sub(b,a),sub(d,a));
 const cross3=cross(sub(d,c),sub(a,c)),cross4=cross(sub(d,c),sub(b,c));
 return cross1*cross2<-.001&&cross3*cross4<-.001;
}
function simple(pts){
 for(let i=0;i<pts.length;i++)for(let j=i+2;j<pts.length;j++){
  if(i===0&&j===pts.length-1)continue;
  if(intersects(pts[i],pts[(i+1)%pts.length],pts[j],pts[(j+1)%pts.length]))return false;
 }
 return true;
}
function lineIntersection(a,b,near,maxOffset){
 const p=a.points[0],r=sub(a.points[1],p),q=b.points[0],s=sub(b.points[1],q);
 const den=cross(r,s);
 if(Math.abs(den)<.1*Math.hypot(...r)*Math.hypot(...s))return near;
 const t=cross(sub(q,p),s)/den;
 const x=pointAt(p,r,t);
 return dist(x,near)<=maxOffset?x:near;
}
function closure(points,diag){
 const tol=clamp(diag*.20,15,38),n=points.length;
 // La X10 puede dejar una pequeña cola después de pasar por el vértice inicial.
 // Cerrar en el primer retorno creíble cerca del final, sin completar grandes huecos.
 let nearest=n-1,min=dist(points[0],points[n-1]);
 for(let i=Math.floor(n*.65);i<n;i++){
  const gap=dist(points[0],points[i]);
  if(gap<min){min=gap;nearest=i;}
 }
 if(min>tol)return null;
 return points.slice(0,nearest+1);
}
function refinePolygon(ordered,indices,diag){
 const segments=[];
 for(let i=0;i<indices.length-1;i++){
  const slice=ordered.slice(indices[i],indices[i+1]+1);
  const strong=fitStrongLine(slice,{lenMin:Math.max(14,diag*.12),tolerance:.24});
  if(!strong)return null;
  segments.push(strong);
 }
 const vertices=[];
 for(let i=0;i<segments.length;i++){
  const previous=segments[(i+segments.length-1)%segments.length];
  const current=segments[i];
  const anchor=ordered[indices[i]];
  vertices.push(lineIntersection(previous,current,anchor,Math.max(15,diag*.17)));
 }
 if(vertices.some((p,i)=>dist(p,vertices[(i+1)%vertices.length])<Math.max(12,diag*.115)))return null;
 if(area(vertices)<diag*diag*.06||!simple(vertices))return null;
 return vertices;
}
export function straightenContour(input){
 if(!Array.isArray(input)||input.length<4)return null;
 const diag=diagonal(input);
 if(diag<35)return null;
 const closed=closure(input,diag);
 if(!closed||closed.length<4)return null;
 // Preferir puntos extremos para que el primer punto de RDP sea un vértice.
 const pivots=[
  closed.reduce((n,p,i)=>p[0]+p[1]<closed[n][0]+closed[n][1]?i:n,0),
  closed.reduce((n,p,i)=>p[0]-p[1]<closed[n][0]-closed[n][1]?i:n,0),
  closed.reduce((n,p,i)=>p[0]+p[1]>closed[n][0]+closed[n][1]?i:n,0),
  closed.reduce((n,p,i)=>p[0]-p[1]>closed[n][0]-closed[n][1]?i:n,0)
 ];
 let winner=null,score=Infinity;
 const raw=closed.slice(0,-1);
 for(const pivot of [...new Set(pivots)].filter(x=>x<raw.length)){
  const rotated=raw.slice(pivot).concat(raw.slice(0,pivot));
  rotated.push(rotated[0]);
  for(const scale of [.055,.073,.095,.12,.15]){
   const idx=simplifyIndices(rotated,Math.max(5,diag*scale));
   const count=idx.length-1;
   if(count<3||count>6)continue;
   const pts=refinePolygon(rotated,idx,diag);
   if(!pts)continue;
   const error=rotated.reduce((sum,p)=>Math.min(...pts.map((v,i)=>sideDistance(p,v,pts[(i+1)%pts.length])))+sum,0)/rotated.length;
   // Un lado recto por pareja de vértices; penalizar subdivisiones artificiales.
   const quality=error/diag+(count-3)*.018;
   if(quality<score){score=quality;winner=pts;}
  }
 }
 return winner?{kind:'polygon',points:winner}:null;
}
function edgeGroup(parts){
 const edges=[];
 for(const part of parts){
  if(part.length<2)return null;
  const fitted=fitStrongLine(part,{lenMin:17,tolerance:.20});
  if(fitted){edges.push(fitted);continue;}
  // Una sola pasada del lápiz puede contener dos lados de un polígono.
  const diag=diagonal(part);
  if(diag<60)return null;
  const ids=simplifyIndices(part,Math.max(7,diag*.075));
  if(ids.length<3||ids.length>5)return null;
  for(let i=0;i<ids.length-1;i++){
   const seg=fitStrongLine(part.slice(ids[i],ids[i+1]+1),{lenMin:19,tolerance:.23});
   if(!seg)return null;
   edges.push(seg);
  }
 }
 return edges.length>=3&&edges.length<=8?edges:null;
}
export function straightenConnectedSides(parts){
 if(!Array.isArray(parts)||parts.length<2||parts.length>8)return null;
 const edges=edgeGroup(parts);
 if(!edges)return null;
 const endPoints=edges.flatMap(e=>e.points),diag=diagonal(endPoints);
 const tol=clamp(Math.max(12,diag*.11),12,34);
 const representatives=[],assignments=[];
 for(let i=0;i<endPoints.length;i++){
  let best=-1,bestD=tol;
  for(let j=0;j<representatives.length;j++){
   const diff=dist(endPoints[i],representatives[j].mean);
   if(diff<=bestD){bestD=diff;best=j;}
  }
  if(best<0){best=representatives.length;representatives.push({points:[],mean:endPoints[i].slice()});}
  representatives[best].points.push(endPoints[i]);
  representatives[best].mean=representatives[best].points.reduce((acc,p)=>[acc[0]+p[0],acc[1]+p[1]],[0,0])
   .map(v=>v/representatives[best].points.length);
  assignments[i]=best;
 }
 if(representatives.length<3||representatives.length>8||representatives.length!==edges.length)return null;
 const adjacency=representatives.map(()=>[]);
 for(let i=0;i<edges.length;i++){
  const a=assignments[2*i],b=assignments[2*i+1];if(a===b)return null;
  adjacency[a].push({to:b,edge:i});adjacency[b].push({to:a,edge:i});
 }
 if(adjacency.some(a=>a.length!==2))return null;
 const visited=new Set(),order=[],orderEdges=[];
 let current=0,last=-1;
 for(let i=0;i<edges.length;i++){
  if(visited.has(current))return null;
  visited.add(current);order.push(current);
  const choices=adjacency[current].filter(e=>e.to!==last);
  if(!choices.length)return null;
  const {to,edge}=choices[0];orderEdges.push(edge);
  last=current;current=to;
 }
 if(current!==order[0]||visited.size!==edges.length)return null;
 const vertices=order.map((n,i)=>{
  const before=edges[orderEdges[(i+edges.length-1)%edges.length]];
  const after=edges[orderEdges[i]];
  const mean=representatives[n].mean;
  return lineIntersection(before,after,mean,Math.max(14,tol*1.5));
 });
 if(vertices.some((v,i)=>dist(v,vertices[(i+1)%vertices.length])<Math.max(15,diag*.105)))return null;
 if(area(vertices)<diag*diag*.065||!simple(vertices))return null;
 return {kind:'polygon',points:vertices};
}
