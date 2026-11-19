/* Motor automático de Matemática. Solo analiza copias de trazos ya finalizados.
   La tinta manuscrita se conserva en su propio arreglo de puntos. */
import {propose,fingerprint} from './math-geometry.mjs';
import {recognizeInk} from './math-ink-ocr.mjs';
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
const fit=(strokes,kind)=>{
 if(!strokes.length||strokes.length>9||!same(strokes.map(s=>s.id)))return null;
 const b=box(strokes);
 if(!b||extent(b)>550)return null;
 let result=null;
 if(kind==='text'){
  // Los números y unidades nunca se infieren a partir de líneas grandes o figuras.
  if(extent(b)>150||b.maxY-b.minY>115)return null;
  result=recognizeInk(strokes);
 }else if(kind==='shape'){
  result=propose(strokes,'auto');
  if(!result)return null;
  if(result.geometry.kind==='segments')return null; // No completar aristas arbitrarias.
  if(result.geometry.kind==='line'&&extent(b)<105)return null;
  // Polígonos pequeños pueden ser números. No reemplazarlos automáticamente.
  if(result.geometry.kind==='polygon'&&extent(b)<64)return null;
  if(result.geometry.kind==='circle'&&extent(b)<60)return null;
 }
 return candidate(result,strokes);
};
export function recognizeAutomatic(strokes){
 if(!Array.isArray(strokes)||strokes.length<1||strokes.length>9)return null;
 // Evaluar primeramente figuras cerradas con varios trazos y textos agrupados.
 // Se procesan últimos segmentos terminados sin alterar el registro original.
 for(let n=Math.min(strokes.length,7);n>=3;n--){
  const subset=strokes.slice(-n);
  const result=fit(subset,'shape');
  if(result?.geometry.kind==='polygon')return result;
 }
 for(let n=Math.min(strokes.length,9);n>=2;n--){
  const subset=strokes.slice(-n),text=fit(subset,'text');
  if(text)return text;
 }
 const last=strokes.at(-1);
 const shape=fit([last],'shape');
 if(shape)return shape;
 const text=fit([last],'text');
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
  conflicted[0].sources.every(x=>signatures.has(x.id+':'+x.signature));
 if(unchanged)return null;
 const keep=(objects||[]).filter(o=>!conflicted.includes(o));
 return {objects:keep,replaced:conflicted.map(o=>o.id)};
}
