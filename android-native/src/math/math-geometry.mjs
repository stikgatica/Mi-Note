/* Geometría de tinta A5 local. Nunca modifica las muestras de origen.
 * El resultado es una PROPUESTA: la docente debe aceptarla para mostrarla. */
export const AXES=Object.freeze([
 {id:'numbers',label:'Números y operaciones',ready:false},
 {id:'algebra',label:'Álgebra y funciones',ready:false},
 {id:'geometry',label:'Geometría y medición',ready:true},
 {id:'data',label:'Datos y probabilidades',ready:false}
]);
export const PAGE={width:1000,height:1400};
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const finite=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]));
function normalize(stroke){
 const src=Array.isArray(stroke?.pts)?stroke.pts:[];
 if(!stroke?.id||src.length<2||src.length>6000)return [];
 const pts=[];
 for(const raw of src){
  if(!finite(raw))continue;
  const p=[clamp(Number(raw[0]),0,PAGE.width),clamp(Number(raw[1]),0,PAGE.height)];
  if(!pts.length||d(pts.at(-1),p)>1.4)pts.push(p);
 }
 return pts;
}
function bbox(pts){
 const x=pts.map(p=>p[0]),y=pts.map(p=>p[1]);
 return {minX:Math.min(...x),maxX:Math.max(...x),minY:Math.min(...y),maxY:Math.max(...y)};
}
function diagonal(pts){const b=bbox(pts);return Math.hypot(b.maxX-b.minX,b.maxY-b.minY);}
function lineDeviation(p,a,b){
 const vx=b[0]-a[0],vy=b[1]-a[1],n=vx*vx+vy*vy||1;
 return Math.abs((p[0]-a[0])*vy-(p[1]-a[1])*vx)/Math.sqrt(n);
}
function lineOf(pts){
 if(pts.length<2)return null;
 const a=pts[0],b=pts.at(-1),len=d(a,b);
 if(len<15)return null;
 const vals=pts.map(p=>lineDeviation(p,a,b)).sort((x,y)=>x-y);
 const err=vals[Math.floor(vals.length*.90)]||0;
 if(err>Math.max(5,len*.065))return null;
 return {kind:'line',points:[a,b]};
}
function simplify(pts,epsilon){
 if(pts.length<=2)return pts;
 const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;
 const stack=[[0,pts.length-1]];
 while(stack.length){
  const [start,end]=stack.pop();let max=0,idx=-1;
  for(let j=start+1;j<end;j++){
   const v=lineDeviation(pts[j],pts[start],pts[end]);
   if(v>max){max=v;idx=j;}
  }
  if(idx>=0&&max>epsilon){keep[idx]=1;stack.push([start,idx],[idx,end]);}
 }
 return pts.filter((_,i)=>keep[i]);
}
function area(pts){
 let a=0;for(let i=0;i<pts.length;i++){
  const p=pts[i],q=pts[(i+1)%pts.length];a+=p[0]*q[1]-q[0]*p[1];
 }return Math.abs(a)/2;
}
function polygonOf(raw,forced=false){
 const diag=diagonal(raw);if(diag<28||raw.length<5)return null;
 const near=d(raw[0],raw.at(-1))<=Math.max(12,diag*.16);
 if(!near&&!forced)return null;
 let pts=raw.slice();if(near)pts.pop();
 let far=1,dist=0;
 for(let i=1;i<pts.length;i++){const v=d(pts[0],pts[i]);if(v>dist){far=i;dist=v;}}
 if(far===pts.length-1||far===0)return null;
 const epsilon=Math.max(4,diag*.026);
 const a=simplify(pts.slice(0,far+1),epsilon),b=simplify([...pts.slice(far),pts[0]],epsilon);
 const corners=[...a.slice(0,-1),...b.slice(0,-1)];
 if(corners.length<3||corners.length>8)return null;
 const uniq=corners.filter((p,i)=>!i||d(p,corners[i-1])>Math.max(8,diag*.045));
 if(uniq.length<3||uniq.length>8||d(uniq[0],uniq.at(-1))<=Math.max(8,diag*.045))return null;
 if(area(uniq)<diag*diag*.07)return null;
 return {kind:'polygon',points:uniq};
}
function solve3(matrix,vector){
 const a=matrix.map((r,i)=>[...r,vector[i]]);
 for(let k=0;k<3;k++){
  let pivot=k;
  for(let j=k+1;j<3;j++)if(Math.abs(a[j][k])>Math.abs(a[pivot][k]))pivot=j;
  if(Math.abs(a[pivot][k])<1e-8)return null;
  [a[k],a[pivot]]=[a[pivot],a[k]];
  const norm=a[k][k];for(let j=k;j<4;j++)a[k][j]/=norm;
  for(let i=0;i<3;i++)if(i!==k){const factor=a[i][k];for(let j=k;j<4;j++)a[i][j]-=factor*a[k][j];}
 }return a.map(row=>row[3]);
}
function circleOf(pts,forced=false){
 if(pts.length<12)return null;
 const diag=diagonal(pts);if(diag<28)return null;
 if(!forced&&d(pts[0],pts.at(-1))>Math.max(13,diag*.17))return null;
 let sx=0,sy=0,sxx=0,syy=0,sxy=0,sz=0,sxz=0,syz=0;
 for(const [x,y] of pts){
  const z=x*x+y*y;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;sz+=z;sxz+=x*z;syz+=y*z;
 }
 const sol=solve3([[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,pts.length]],[-sxz,-syz,-sz]);
 if(!sol)return null;
 const cx=-sol[0]/2,cy=-sol[1]/2,r2=cx*cx+cy*cy-sol[2],r=Math.sqrt(r2);
 if(!Number.isFinite(r)||r<10||r>800)return null;
 let err=0,angle=0;
 for(let i=0;i<pts.length;i++){
  err+=(d(pts[i],[cx,cy])-r)**2;
  if(i){
   const a=Math.atan2(pts[i-1][1]-cy,pts[i-1][0]-cx);
   const b=Math.atan2(pts[i][1]-cy,pts[i][0]-cx);
   angle+=Math.atan2(Math.sin(b-a),Math.cos(b-a));
  }
 }
 const rms=Math.sqrt(err/pts.length)/r;
 if(rms>(forced?.18:.095)||Math.abs(angle)<(forced?3.1:4.7))return null;
 if(!forced&&(cx<0||cy<0||cx>1000||cy>1400))return null;
 return {kind:'circle',cx,cy,r};
}
function multiPolygon(parts){
 if(parts.length<3||parts.length>8)return null;
 const endpoints=parts.map(pts=>[pts[0],pts.at(-1)]);
 const diag=diagonal(parts.flat());
 const tol=Math.max(13,diag*.07);
 for(let first=0;first<Math.min(parts.length,2);first++){
  let ordered=[endpoints[first][0],endpoints[first][1]];
  const used=new Set([first]);
  while(used.size<parts.length){
   let best=-1,flip=false,gap=Infinity;
   for(let i=0;i<parts.length;i++)if(!used.has(i)){
    for(let k=0;k<2;k++){
     const v=d(ordered.at(-1),endpoints[i][k]);
     if(v<gap){best=i;flip=k===1;gap=v;}
    }
   }
   if(best<0||gap>tol)break;
   const end=flip?endpoints[best][0]:endpoints[best][1];
   ordered.push(end);used.add(best);
  }
  if(used.size===parts.length&&d(ordered.at(-1),ordered[0])<=tol){
   ordered.pop();
   if(ordered.length>=3&&ordered.length<=8&&area(ordered)>=diag*diag*.07)
    return {kind:'polygon',points:ordered};
  }
 }return null;
}
const labelOf=g=>({line:'Línea recta',circle:'Circunferencia',polygon:'Polígono',segments:'Aristas rectas'}[g.kind]||'Figura');
export function propose(strokes,requested='auto'){
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>12)return null;
 const parts=strokes.map(normalize);
 if(parts.some(p=>p.length<2))return null;
 const sourceStrokeIds=strokes.map(s=>s.id);
 let geometry=null;
 if(parts.length===1){
  const pts=parts[0];
  if(requested==='circle'||requested==='auto')geometry=circleOf(pts,requested==='circle');
  if(!geometry&&(requested==='polygon'||requested==='auto'))geometry=polygonOf(pts,requested==='polygon');
  if(!geometry&&(requested==='line'||requested==='auto'))geometry=lineOf(pts);
 }else{
  const lines=parts.map(lineOf);
  if(lines.every(Boolean)){
   if(requested==='polygon'||requested==='auto')geometry=multiPolygon(parts);
   if(!geometry&&(requested==='edges'||requested==='auto'))geometry={kind:'segments',segments:lines.map(x=>x.points)};
  }
 }
 if(!geometry)return null;
 const style={color:/^#[\da-fA-F]{6}$/.test(strokes[0]?.color)?strokes[0].color:'#000000',
  width:Math.max(.8,Math.min(16,Number(strokes[0]?.width)||3))};
 return {type:geometry.kind,label:labelOf(geometry),geometry,sourceStrokeIds,style};
}
export function fingerprint(stroke){
 if(!stroke||!Array.isArray(stroke.pts))return null;
 const points=stroke.pts,n=points.length;let h=2166136261;
 const add=v=>{h=Math.imul(h^(Math.round(v*10)||0),16777619)>>>0;};
 add(n);add(Number(stroke.width)||0);
 const step=Math.max(1,Math.floor(n/31));
 for(let i=0;i<n;i+=step){const p=points[i];add(Number(p?.[0])||0);add(Number(p?.[1])||0);}
 if(n){add(Number(points[n-1]?.[0])||0);add(Number(points[n-1]?.[1])||0);}
 return h.toString(16)+':'+n;
}
export function validObject(obj,page){
 if(!obj||obj.accepted!==true||!obj.geometry||!Array.isArray(obj.sources)||!obj.sources.length)return false;
 const byId=new Map((page?.strokes||[]).map(s=>[s.id,s]));
 return obj.sources.every(x=>byId.has(x.id)&&fingerprint(byId.get(x.id))===x.signature);
}
export function hitStroke(stroke,xy,limit=22){
 const pts=stroke?.pts||[];let min=Infinity;
 for(let i=0;i<pts.length;i++){
  const a=pts[i];if(!finite(a))continue;
  if(i===0){min=Math.min(min,d(a,xy));continue;}
  const b=pts[i-1];if(!finite(b))continue;
  const vx=a[0]-b[0],vy=a[1]-b[1],length=vx*vx+vy*vy||1;
  const t=clamp(((xy[0]-b[0])*vx+(xy[1]-b[1])*vy)/length,0,1);
  min=Math.min(min,d(xy,[b[0]+t*vx,b[1]+t*vy]));
 }
 return min<=limit?min:Infinity;
}
