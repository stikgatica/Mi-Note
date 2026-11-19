/* Motor automático de Matemática. Solo analiza copias de trazos ya finalizados.
   La tinta manuscrita se conserva en su propio arreglo de puntos. */
import {propose,fingerprint} from './math-geometry.mjs';
import {fitStrongLine,straightenContour,straightenConnectedSides} from './math-strong-geometry.mjs';
import {recognizeInk} from './math-ink-ocr.mjs';
import {interpretGeometry,fitIntendedQuadrilateral,fitIntendedCircle,geometryName} from './math-intention.mjs';
import {joinClosedStrokes} from './math-contours.mjs';
const box=strokes=>{
 const pts=strokes.flatMap(s=>s.pts||[]).filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]));
 if(!pts.length)return null;
 return {minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),
  minY:Math.min(...pts.map(p=>p[1])),maxY:Math.max(...pts.map(p=>p[1]))};
};
const extent=b=>Math.max(b.maxX-b.minX,b.maxY-b.minY);
const candidate=(proposal,strokes)=>proposal?{
 ...proposal,sourceStrokeIds:strokes.map(s=>s.id),
 sources:strokes.map(s=>({id:s.id,signature:fingerprint(s)})),automatic:true
}:null;
const same=idList=>new Set(idList).size===idList.length;
const fit=(strokes,kind,intention='auto')=>{
 if(!strokes.length||strokes.length>9||!same(strokes.map(s=>s.id)))return null;
 const b=box(strokes);
 if(!b||extent(b)>550)return null;
 let result=null;
 if(kind==='text'){
  if(intention!=='auto')return null;
  // Los números y unidades nunca se infieren a partir de líneas grandes o figuras.
  if(extent(b)>150||b.maxY-b.minY>115)return null;
  result=recognizeInk(strokes);
 }else if(kind==='shape'){
  // Prioridad absoluta a la figura elegida; el ajuste de un círculo no
  // debe convertirse en un polígono, y un cuadrado no debe quedar trapezoidal.
  const parts=strokes.map(s=>(s.pts||[])
    .filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1]))
    .map(p=>[p[0],p[1]]));
  if(parts.some(p=>p.length<2))return null;
  const joined=parts.length>1?joinClosedStrokes(parts):null;
  if(intention==='circle'){
   const ring=parts.length===1?parts[0]:joined;
   const circle=ring&&fitIntendedCircle(ring);
   if(!circle)return null;
   return candidate({type:'circle',label:'Circunferencia',geometry:circle,sourceStrokeIds:strokes.map(s=>s.id),
    style:{color:strokes[0]?.color||'#000000',width:Number(strokes[0]?.width)||3}},strokes);
  }
  if(['square','rectangle'].includes(intention)&&(parts.length===1||joined)){
   const quad=fitIntendedQuadrilateral(parts.length===1?parts[0]:joined,intention);
   if(quad)return candidate({type:'polygon',label:intention==='square'?'Cuadrado':'Rectángulo',
    geometry:quad,sourceStrokeIds:strokes.map(s=>s.id),
    style:{color:strokes[0]?.color||'#000000',width:Number(strokes[0]?.width)||3}},strokes);
  }
  // Mantener las circunferencias reales antes de intentar aproximarlas
  // a polígonos: RDP podría convertir erróneamente un círculo en un hexágono.
  if(intention==='auto'){
   const ring=parts.length===1?parts[0]:joined;
   const precise=ring&&fitIntendedCircle(ring,{strict:true});
   if(precise&&extent(b)>=60)
    return candidate({type:'circle',label:'Circunferencia',geometry:precise,
     sourceStrokeIds:strokes.map(s=>s.id),
     style:{color:strokes[0]?.color||'#000000',width:Number(strokes[0]?.width)||3}},strokes);
  }
  // La corrección fuerte trabaja sobre una COPIA local y endereza curvas.
  // No modifica los puntos manuscritos, no inventa caras y conserva la posición.
  let strong=null;
  if(parts.length===1){
   strong=straightenContour(parts[0]);
   if(!strong){
    const line=fitStrongLine(parts[0],{lenMin:95,tolerance:.19});
    if(line)strong={kind:'line',points:line.points};
   }
  }else{
   strong=straightenConnectedSides(parts);
   // Una misma figura puede dibujarse en dos trazos o con lados combinados.
   if(!strong&&joined)strong=straightenContour(joined);
  }
  if(strong){
   const enough=strong.kind==='line'?extent(b)>=105
    :strong.kind==='polygon'?extent(b)>=62:false;
   if(enough)result={type:strong.kind,label:strong.kind==='line'?'Línea recta':'Polígono',
    geometry:strong,sourceStrokeIds:strokes.map(s=>s.id),
    style:{color:strokes[0]?.color||'#000000',width:Number(strokes[0]?.width)||3}};
  }
  if(!result)result=propose(strokes,intention==='circle'?'circle':'auto');
  if(!result)return null;
  if(result.geometry.kind==='segments')return null; // No completar aristas arbitrarias.
  if(result.geometry.kind==='line'&&extent(b)<105)return null;
  if(result.geometry.kind==='polygon'&&extent(b)<62)return null;
  if(result.geometry.kind==='circle'&&extent(b)<60)return null;
  // La intención elegida no inventa vértices: exige 3 para triángulo, 4 para cuadrados.
  const final=interpretGeometry(result.geometry,intention);
  if(!final)return null;
  result={...result,geometry:final,label:intention==='auto'?geometryName(final):
   ({square:'Cuadrado',rectangle:'Rectángulo',rhombus:'Rombo',parallelogram:'Paralelogramo',
     trapezoid:'Trapecio',pentagon:'Pentágono',hexagon:'Hexágono',triangle:'Triángulo',
     circle:'Circunferencia',line:'Línea recta'}[intention]||geometryName(final))};
 }
 return candidate(result,strokes);
};
export function recognizeAutomatic(strokes,intention='auto'){
 if(!Array.isArray(strokes)||strokes.length<1||strokes.length>9)return null;
 // Cuando el usuario escoge figura, nunca interpretar sus lados como números
 // ni guardar una línea aislada antes de cerrar un cuadrado/triángulo.
 if(intention!=='auto'){
  if(intention==='circle'){
   for(let n=Math.min(strokes.length,6);n>=2;n--){
    const matched=fit(strokes.slice(-n),'shape',intention);
    if(matched?.geometry?.kind==='circle')return matched;
   }
   return fit([strokes.at(-1)],'shape',intention);
  }
  if(intention==='line')return fit([strokes.at(-1)],'shape',intention);
  for(let n=Math.min(strokes.length,8);n>=2;n--){
   const result=fit(strokes.slice(-n),'shape',intention);
   if(result?.geometry?.kind==='polygon')return result;
  }
  return fit([strokes.at(-1)],'shape',intention);
 }
 // Evaluar primeramente figuras cerradas con varios trazos y textos agrupados.
 // Se procesan últimos segmentos terminados sin alterar el registro original.
 for(let n=Math.min(strokes.length,7);n>=2;n--){
  const subset=strokes.slice(-n);
  const result=fit(subset,'shape',intention);
  if(result?.geometry.kind==='polygon'||result?.geometry.kind==='circle')return result;
 }
 for(let n=Math.min(strokes.length,9);n>=2;n--){
  const subset=strokes.slice(-n),text=fit(subset,'text',intention);
  if(text)return text;
 }
 const last=strokes.at(-1);
 const shape=fit([last],'shape',intention);
 if(shape)return shape;
 const text=fit([last],'text',intention);
 if(text)return text;
 return null;
}
export function overlapSources(objects,sources){
 const wanted=new Set((sources||[]).map(s=>s.id));
 return (objects||[]).filter(o=>(o.sources||[]).some(x=>wanted.has(x.id)));
}
export function mergeAutomatic(objects,recognized){
 if(!recognized?.sources?.length)return null;
 const conflicted=overlapSources(objects,recognized.sources);
 if(conflicted.some(o=>!o.automatic))return null;
 const signatures=new Set(recognized.sources.map(x=>x.id+':'+x.signature));
 const unchanged=conflicted.length===1&&
  conflicted[0].type===recognized.type&&
  conflicted[0].sources.length===recognized.sources.length&&
  conflicted[0].sources.every(x=>signatures.has(x.id+':'+x.signature))&&
  JSON.stringify(conflicted[0].geometry)===JSON.stringify(recognized.geometry);
 if(unchanged)return null;
 const keep=(objects||[]).filter(o=>!conflicted.includes(o));
 return {objects:keep,replaced:conflicted.map(o=>o.id)};
}
