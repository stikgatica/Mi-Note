/* Ensamblado local de contornos trazados en varias pasadas de la Huion X10.
 * No modifica los puntos originales ni inventa segmentos desconectados. */
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const valid=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const unique=points=>points.filter((p,i)=>i===0||distance(p,points[i-1])>.8);
export function joinClosedStrokes(parts){
 if(!Array.isArray(parts)||parts.length<2||parts.length>6)return null;
 if(parts.some(p=>!Array.isArray(p)||p.length<3||p.some(v=>!valid(v))))return null;
 const flat=parts.flat(),minX=Math.min(...flat.map(p=>p[0])),maxX=Math.max(...flat.map(p=>p[0]));
 const minY=Math.min(...flat.map(p=>p[1])),maxY=Math.max(...flat.map(p=>p[1]));
 const diag=Math.hypot(maxX-minX,maxY-minY),tol=Math.max(13,Math.min(31,diag*.105));
 if(diag<50)return null;
 const total=parts.length;
 // Se prueba una ruta desde cada extremo, porque el orden en que se dibujan
 // lados/arcos no implica necesariamente el orden del contorno.
 for(let first=0;first<total;first++)for(const flip of [false,true]){
  const start=flip?parts[first].slice().reverse():parts[first].slice();
  const used=new Set([first]),chain=start.slice();
  let ok=true;
  while(used.size<total){
   let best=null;
   for(let i=0;i<total;i++){
    if(used.has(i))continue;
    for(const reversed of [false,true]){
     const candidate=reversed?parts[i].slice().reverse():parts[i];
     const gap=distance(chain.at(-1),candidate[0]);
     if(!best||gap<best.gap)best={i,candidate,gap};
    }
   }
   if(!best||best.gap>tol){ok=false;break;}
   // Descartar puntos de unión repetidos, pero conservar el contorno real.
   chain.push(...best.candidate.slice(1));
   used.add(best.i);
  }
  if(!ok||distance(chain[0],chain.at(-1))>tol)continue;
  const ring=unique(chain);
  if(ring.length<12)continue;
  const perimeter=ring.reduce((a,p,i)=>i?a+distance(p,ring[i-1]):a,0);
  if(perimeter<diag*2.1||perimeter>diag*7)return null;
  return ring;
 }
 return null;
}
