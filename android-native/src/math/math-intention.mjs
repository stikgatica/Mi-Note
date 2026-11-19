/* Interpretación de intención de dibujo: auto, cuadrado, rectángulo, triángulo.
   Corrige geometría en la capa digital, nunca la tinta manuscrita. */
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const scale=(a,s)=>[a[0]*s,a[1]*s];
const len=a=>Math.hypot(...a);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const DRAW_INTENTIONS=Object.freeze([
 {id:'auto',label:'Detectar automáticamente'},
 {id:'square',label:'Cuadrado (4 lados iguales, 90°)'},
 {id:'rectangle',label:'Rectángulo (ángulos de 90°)'},
 {id:'triangle',label:'Triángulo (3 lados)'},
 {id:'polygon',label:'Cuadrilátero libre (sin corregir ángulos)'}
]);
/** Ajusta solo un cuadrilátero validado. Para la intención explícita,
 *  se toman dimensiones promedio y se fuerzan vértices a 90°.
 *  El centro, la rotación y las dimensiones aproximadas se conservan.
 *  No se inventa un cuarto vértice de un triángulo. */
export function regularizeQuadrilateral(points,intention){
 if(!['square','rectangle'].includes(intention)||points?.length!==4)return null;
 if(!points.every(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)))return null;
 const center=scale(points.reduce(add,[0,0]),.25);
 const edges=points.map((p,i)=>sub(points[(i+1)%4],p));
 const lengths=edges.map(len);
 const min=Math.min(...lengths),max=Math.max(...lengths);
 if(min<12||max/min>4)return null;
 // Dirección del lado principal a partir de los lados opuestos, que apuntan
 // en sentido inverso. Ayuda cuando una esquina está desplazada.
 let axis=sub(edges[0],edges[2]);
 if(len(axis)<1)axis=edges[0];
 axis=scale(axis,1/Math.max(1,len(axis)));
 const signed=edges.reduce((s,e,i)=>s+points[i][0]*points[(i+1)%4][1]-points[(i+1)%4][0]*points[i][1],0);
 const winding=signed>=0?1:-1;
 const vertical=[-axis[1]*winding,axis[0]*winding];
 const w=Math.max(20,(lengths[0]+lengths[2])/2);
 const h=Math.max(20,(lengths[1]+lengths[3])/2);
 const size=intention==='square'?(w+h)/2:null;
 const hw=(size??w)/2,hh=(size??h)/2;
 const order=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
 const result=order.map(([x,y])=>add(center,add(scale(axis,x),scale(vertical,y))));
 // No desplazar el objeto fuera de su región original de forma extrema.
 const diagonal=Math.hypot(w,h);
 const avgMove=result.reduce((s,p,i)=>s+len(sub(p,points[i])),0)/4;
 if(avgMove>diagonal*.42)return null;
 return {kind:'polygon',points:result};
}
export function interpretGeometry(geometry,intention='auto'){
 if(!geometry)return null;
 if(intention==='square'||intention==='rectangle'){
  if(geometry.kind!=='polygon'||geometry.points?.length!==4)return null;
  return regularizeQuadrilateral(geometry.points,intention);
 }
 if(intention==='triangle'){
  return geometry.kind==='polygon'&&geometry.points?.length===3?geometry:null;
 }
 if(intention==='polygon'){
  return geometry.kind==='polygon'?geometry:null;
 }
 return geometry;
}
