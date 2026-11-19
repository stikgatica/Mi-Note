/* Figuras reconocidas: nombres, ubicación y deduplicación NO destructiva.
 * Solo se compactan objetos derivados automáticamente. La tinta fuente permanece. */
import {geometryName} from './math-intention.mjs';
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function boundsOf(geometry){
 if(!geometry)return null;
 if(geometry.kind==='circle'){
  const {cx,cy,r}=geometry;
  if(![cx,cy,r].every(Number.isFinite)||r<=0)return null;
  return {minX:cx-r,minY:cy-r,maxX:cx+r,maxY:cy+r};
 }
 let points=[];
 if(geometry.kind==='polygon'||geometry.kind==='line')points=geometry.points||[];
 else if(geometry.kind==='segments')points=(geometry.segments||[]).flat();
 else if(geometry.kind==='text'&&Number.isFinite(geometry.x)&&Number.isFinite(geometry.y)){
  const w=Math.max(12,Number(geometry.size)||24)*(geometry.text?.length||1)*.35;
  points=[[geometry.x-w,geometry.y-14],[geometry.x+w,geometry.y+14]];
 }
 if(points.length<1||points.some(p=>!Number.isFinite(p?.[0])||!Number.isFinite(p?.[1])))return null;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};
}
export function nameOf(object){
 const g=object?.geometry;
 if(g?.kind==='text')return String(g.text||'Número').slice(0,20);
 const specific=String(object?.label||'').trim();
 if(specific&&!['Figura','Polígono','polygon','Cuadrilátero libre'].includes(specific))return specific;
 return geometryName(g);
}
export function positionOf(geometry){
 const b=boundsOf(geometry);
 if(!b)return 'sin ubicación';
 const centerX=(b.minX+b.maxX)/2,centerY=(b.minY+b.maxY)/2;
 return (centerY<467?'arriba':centerY<934?'centro':'abajo')+' '+(centerX<334?'izquierda':centerX<667?'centro':'derecha');
}
const bboxIoU=(a,b)=>{
 const w=Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX));
 const h=Math.max(0,Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY));
 const areaA=(a.maxX-a.minX)*(a.maxY-a.minY);
 const areaB=(b.maxX-b.minX)*(b.maxY-b.minY);
 return w*h/(areaA+areaB-w*h||1);
};
function vertexDistance(a,b){
 if(a.length!==b.length||a.length<3)return Infinity;
 let best=Infinity;
 for(const direction of [1,-1])for(let offset=0;offset<a.length;offset++){
  let max=0;
  for(let i=0;i<a.length;i++){
   const idx=(offset+direction*i+a.length*2)%a.length;
   max=Math.max(max,dist(a[i],b[idx]));
  }
  best=Math.min(best,max);
 }
 return best;
}
export function nearDuplicate(a,b){
 if(!a?.automatic||!b?.automatic||!a.geometry||!b.geometry)return false;
 const ga=a.geometry,gb=b.geometry;
 if(ga.kind!==gb.kind||ga.kind==='text'||nameOf(a)!==nameOf(b))return false;
 const ba=boundsOf(ga),bb=boundsOf(gb);
 if(!ba||!bb||bboxIoU(ba,bb)<.80)return false;
 const diagonal=Math.hypot(ba.maxX-ba.minX,ba.maxY-ba.minY);
 if(ga.kind==='circle'){
  return dist([ga.cx,ga.cy],[gb.cx,gb.cy])<Math.max(6,diagonal*.07)
   && Math.abs(ga.r-gb.r)<Math.max(5,ga.r*.12);
 }
 if(ga.kind==='polygon')return vertexDistance(ga.points,gb.points)<Math.max(7,diagonal*.11);
 if(ga.kind==='line'){
  return Math.min(Math.max(dist(ga.points[0],gb.points[0]),dist(ga.points[1],gb.points[1])),
   Math.max(dist(ga.points[0],gb.points[1]),dist(ga.points[1],gb.points[0])))<Math.max(7,diagonal*.09);
 }
 return false;
}
export function compactAutomatic(objects){
 const keep=[];
 for(const current of objects||[]){
  const previous=keep.findIndex(candidate=>nearDuplicate(candidate,current));
  if(previous<0){keep.push(current);continue;}
  // Prioridad a la figura que incluye más trazos completos; empate: conservar
  // el reconocimiento anterior para que no se regenere en cada repintado.
  const earlier=keep[previous];
  if((current.sources?.length||0)>(earlier.sources?.length||0))keep[previous]=current;
 }
 return keep;
}
export function listObjects(objects,isValid=()=>true){
 const counters=new Map(),result=[];
 for(const obj of objects||[]){
  if(!isValid(obj))continue;
  const name=nameOf(obj),number=(counters.get(name)||0)+1;
  counters.set(name,number);
  result.push({id:obj.id,label:name+' '+number+' · '+positionOf(obj.geometry),object:obj});
 }
 return result;
}
