/* Mi Note V0.60. OCR incremental: solo trazos nuevos y contexto cercano,
 * sin modificar tinta Huion ni interferir con BLE. */
const MAX_STROKES=90,MAX_POINTS=12000;
const finite=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const bounds=s=>{
 const pts=(s?.pts||[]).filter(finite);
 if(pts.length<2)return null;
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 return {x1:Math.min(...xs),x2:Math.max(...xs),y1:Math.min(...ys),y2:Math.max(...ys),pts};
};
export function incrementalStrokes(page,previousCount=0){
 const strokes=page?.strokes||[];
 if(!strokes.length||previousCount>=strokes.length)return [];
 const newStart=Math.max(0,Math.min(previousCount,strokes.length-1));
 const fresh=strokes.slice(newStart).map(bounds).filter(Boolean);
 if(!fresh.length)return [];
 const y1=Math.min(...fresh.map(b=>b.y1))-95;
 const y2=Math.max(...fresh.map(b=>b.y2))+95;
 const x1=Math.min(...fresh.map(b=>b.x1))-100;
 const x2=Math.max(...fresh.map(b=>b.x2))+100;
 // Contexto: conservar renglón escrito anteriormente, pero no toda la página.
 const near=strokes.map((s,i)=>({i,b:bounds(s)})).filter(({i,b})=>
  b&&(i>=newStart||b.y2>=y1&&b.y1<=y2&&b.x2>=x1&&b.x1<=x2));
 const source=near.slice(-MAX_STROKES);
 let remaining=MAX_POINTS;
 return source.map(({b})=>{
  const step=Math.max(1,Math.ceil(b.pts.length/Math.min(115,remaining)));
  const pts=b.pts.filter((_,i)=>i%step===0).slice(0,remaining);
  remaining-=pts.length;return pts;
 }).filter(x=>x.length>=2);
}
export function createIncrementalCursor(){
 const counts=new Map();
 return {
  previous(page){return counts.get(page?.id)||0;},
  commit(page){if(page?.id)counts.set(page.id,page.strokes?.length||0);},
  reset(id){counts.delete(id);},
  get size(){return counts.size;}
 };
}
