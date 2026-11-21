/* V0.76: segmentación no destructiva de radios, diámetros y etiquetas. */
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const points=s=>(s?.pts||[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
const box=ss=>{const p=ss.flatMap(points);if(!p.length)return null;
 const x=p.map(v=>v[0]),y=p.map(v=>v[1]);
 return {x:Math.min(...x),y:Math.min(...y),right:Math.max(...x),bottom:Math.max(...y)};};
export function fitCircleMeasurementLine(circle,stroke){
 if(circle?.kind!=='circle'||circle.r<20)return null;
 const p=points(stroke);if(p.length<2)return null;
 const a=p[0],b=p.at(-1),r=circle.r,c=[circle.cx,circle.cy],length=dist(a,b);
 if(length<r*.42||length>r*2.3)return null;
 const err=Math.max(...p.map(q=>Math.abs((b[0]-a[0])*(a[1]-q[1])-(a[0]-q[0])*(b[1]-a[1]))/(length||1)));
 if(err>Math.max(7,r*.13))return null;
 const da=dist(a,c),db=dist(b,c),tol=Math.max(10,r*.18);
 let type=null;
 if((da<=tol&&Math.abs(db-r)<tol)||(db<=tol&&Math.abs(da-r)<tol))type='radius';
 else if(Math.abs(da-r)<tol&&Math.abs(db-r)<tol&&
   dist([(a[0]+b[0])/2,(a[1]+b[1])/2],c)<tol&&Math.abs(length-2*r)<2*tol)type='diameter';
 if(!type)return null;
 const direction=type==='radius'?(da<db?[b[0]-c[0],b[1]-c[1]]:[a[0]-c[0],a[1]-c[1]]):
  [b[0]-a[0],b[1]-a[1]];
 const n=Math.hypot(...direction)||1,ux=direction[0]/n,uy=direction[1]/n;
 const endpoints=type==='radius'?[c,[c[0]+r*ux,c[1]+r*uy]]:
  [[c[0]-r*ux,c[1]-r*uy],[c[0]+r*ux,c[1]+r*uy]];
 return {type,points:endpoints,center:c,r};
}
export function parseCircleMeasure(raw){
 const v=String(raw??'').trim().normalize('NFKC').replace(/,/g,'.').replace(/\s+/g,' ');
 const m=/^(?:(radio|r|di[aá]metro|d)\s*[:=]?\s*)?(\d{1,4}(?:\.\d{1,2})?)\s*(mm|cm|m)?$/i.exec(v);
 if(!m||Number(m[2])<=0)return null;
 const prefix=m[1]?/^(?:r|radio)$/i.test(m[1])?'radius':'diameter':null;
 return {text:m[2].replace('.',',')+(m[3]?' '+m[3].toLowerCase():''),type:prefix};
}
export function findCircleMeasurements(circleObjects,strokes){
 const found=[];
 for(const o of circleObjects||[]){
  if(o.geometry?.kind!=='circle')continue;
  const circle=o.geometry,sourceIds=new Set((o.sources||[]).map(s=>s.id));
  for(const stroke of strokes||[]){
   if(sourceIds.has(stroke.id))continue;
   const line=fitCircleMeasurementLine(circle,stroke);if(!line)continue;
   const middle=[(line.points[0][0]+line.points[1][0])/2,(line.points[0][1]+line.points[1][1])/2];
   const labels=(strokes||[]).filter(s=>!sourceIds.has(s.id)&&s.id!==stroke.id).filter(s=>{
    const b=box([s]);if(!b)return false;
    const mid=[(b.x+b.right)/2,(b.y+b.bottom)/2];
    return dist(mid,middle)<circle.r*.9&&
      Math.max(b.right-b.x,b.bottom-b.y)<circle.r*.68;
   }).slice(0,16);
   found.push({circle:o,stroke,line,labels});
  }
 }
 return found;
}
export function chooseCircleLabel(line,readings){
 const parsed=(readings||[]).map(parseCircleMeasure).filter(Boolean);
 if(!parsed.length)return null;
 const best=parsed[0];
 if(best.type&&best.type!==line.type)return null;
 const conflicting=parsed.some(p=>p.text!==best.text||p.type&&p.type!==line.type);
 return {text:best.text,reliable:!conflicting,options:[...new Set(parsed.map(p=>p.text))]};
}
