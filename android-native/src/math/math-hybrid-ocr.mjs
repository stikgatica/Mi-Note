/* Mi Note V0.72 — Reconocimiento matemático híbrido, sin resolver operaciones.
 * Fuente 1: plantillas locales de cifras/medidas.
 * Fuente 2: alternativas manuscritas de ML Kit ya instalado (es-ES).
 * Las discrepancias jamás sustituyen tinta por una conjetura silenciosa.
 */
import {recognizeInk} from './math-ink-ocr.mjs';

const bounds=strokes=>{
 const pts=(strokes||[]).flatMap(s=>s.pts||[]).filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
 if(!pts.length)return null;
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 return {x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys),
  width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
};
const flat=s=>String(s||'').normalize('NFKC').replace(/[−–—]/g,'-').replace(/[×✕∗]/g,'×')
 .replace(/[÷]/g,'÷').replace(/[·]/g,'×').replace(/\s+/g,' ').trim();

/** Solo aritmética: no fechas, prosa, álgebra ni resultados inferidos. */
export function normalizeArithmetic(value){
 const raw=flat(value);
 if(!raw||raw.length>65||/[a-wyzA-WYZ]/.test(raw.replace(/(?<=\d)[xX](?=\d)/g,'')))return null;
 let compact=raw.replace(/\s+/g,'').replace(/(?<=[0-9)])[xX](?=[0-9(])/g,'×')
  .replace(/[∶:]/g,'÷').replace(/[=＝]/g,'=');
 if(!/^[0-9.,()+\-×÷=]+$/.test(compact))return null;
 if(compact.length>60)return null;
 const tokens=compact.match(/\d+(?:[.,]\d+)?|[()+\-×÷=]/g);
 if(!tokens||tokens.join('')!==compact||tokens.length>35)return null;
 let depth=0,expectOperand=true,equalities=0,operators=0,nums=0;
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i],number=/^\d+(?:[.,]\d+)?$/.test(t);
  if(expectOperand){
   if(t==='('){depth++;if(depth>3)return null;continue;}
   if(t==='-'&&(i===0||['(','+','-','×','÷','='].includes(tokens[i-1])))continue;
   if(!number)return null;
   nums++;expectOperand=false;continue;
  }
  if(t===')'){if(!depth)return null;depth--;continue;}
  if(t==='='){
   equalities++;if(equalities>1||depth!==0)return null;
   operators++;expectOperand=true;continue;
  }
  if(['+','-','×','÷'].includes(t)){operators++;expectOperand=true;continue;}
  return null;
 }
 if(depth||!nums||(!operators&&!/^\d+(?:[.,]\d+)?$/.test(compact)))return null;
 if(expectOperand&&tokens.at(-1)!=='=')return null;
 // Evita propuestas espurias "1" o "0" provenientes de curvas y figuras.
 if(operators===0&&nums===1&&compact.replace(/[.,]/g,'').length<2)return null;
 return {text:compact,hasOperator:operators>0,numbers:nums,terminalEquals:tokens.at(-1)==='='};
}
/** Espaciado de lectura. No altera la expresión matemática ni calcula el
 * resultado. Conserva el signo negativo unario junto a su operando. */
export function formatMathDisplay(value){
 const parsed=normalizeArithmetic(value);
 if(!parsed)return String(value??'');
 const tokens=parsed.text.match(/\d+(?:[.,]\d+)?|[()+\-×÷=]/g)||[];
 let result='',expectsOperand=true;
 for(const token of tokens){
  if(token==='-'&&expectsOperand){result+='-';continue;}
  if(['+','-','×','÷','='].includes(token)){
   result=result.trimEnd()+' '+token+' ';
   expectsOperand=true;
  }else if(token==='('){result+='(';expectsOperand=true;}
  else if(token===')'){result+=')';expectsOperand=false;}
  else{result+=token;expectsOperand=false;}
 }
 return result.replace(/\s{2,}/g,' ').trim();
}
/** El selector explícito autoriza usar la lectura principal de ML Kit aunque
 * no coincida con las plantillas locales. La tinta original sigue almacenada
 * y el texto puede corregirse. No convertir fragmentos sin "=" final. */
export function canAutoConvertMath(proposal,enabled=false){
 if(!enabled||!proposal||!hasBinaryArithmetic(proposal.text))return false;
 const parsed=normalizeArithmetic(proposal.text);
 if(!parsed?.terminalEquals)return false;
 return proposal.source==='mlkit-es'||proposal.source==='hybrid-consensus'||
  (proposal.source==='local-templates'&&proposal.autoAccept===true);
}

/** Only real binary arithmetic is promoted to a conversion proposal.
 * A standalone number, a minus sign alone, or an equals sign alone
 * can occur as part of geometry and must not become digital ink.
 */
export function hasBinaryArithmetic(value){
 const parsed=normalizeArithmetic(value);
 if(!parsed)return false;
 const t=parsed.text.match(/\d+(?:[.,]\d+)?|[()+\-×÷=]/g)||[];
 let previous='start',binary=0;
 for(const token of t){
  if(['+','-','×','÷'].includes(token)&&
     (previous==='number'||previous===')'))binary++;
  previous=/^\d/.test(token)?'number':token;
 }
 return binary>0&&parsed.numbers>=2;
}
/** Reject a large enclosing contour with a number written inside,
 * for example a circled "5". The ink is still available as geometry.
 */
export function enclosedMathAnnotation(strokes){
 const boxes=(strokes||[]).map(stroke=>({stroke,box:bounds([stroke])})).filter(item=>item.box);
 for(const item of boxes){
  const pts=item.stroke.pts||[],b=item.box;
  if(pts.length<12||b.width<52||b.height<52||b.width/b.height<.55||b.width/b.height>1.85)continue;
  const start=pts[0],end=pts[pts.length-1];
  if(Math.hypot(start[0]-end[0],start[1]-end[1])>Math.max(15,.23*Math.max(b.width,b.height)))continue;
  if(boxes.some(other=>other!==item&&other.box.width<.72*b.width&&other.box.height<.72*b.height&&
    other.box.x>=b.x+.06*b.width&&other.box.right<=b.right-.06*b.width&&
    other.box.y>=b.y+.06*b.height&&other.box.bottom<=b.bottom-.06*b.height))return true;
 }
 return false;
}

const same=(a,b)=>a?.text===b?.text;

/** Cruza resultados sin falsificar probabilidades propias de ML Kit.
 * El OCR local devuelve una confianza distinta de la de ML Kit.
 * Solo consenso de dos fuentes se autoconvierte; una fuente requiere revisión. */
export function fuseMathCandidates({mlCandidates=[],localText='',localConfidence=0}={}){
 const options=[...new Set((Array.isArray(mlCandidates)?mlCandidates:[])
  .map(s=>normalizeArithmetic(s)?.text).filter(s=>s&&hasBinaryArithmetic(s)))].slice(0,5);
 const local=hasBinaryArithmetic(localText)?normalizeArithmetic(localText):null;
 // An actual handwritten equals sign is a strong signal; prefer that
 // complete candidate over a weaker partial transcription.
 const ml=options.find(s=>s.endsWith('=')||/=[0-9]/.test(s))||options[0]||null;
 if(!ml&&!local)return null;
 const agreement=!!local&&options.includes(local.text);
 const chosen=agreement?local.text:ml||local?.text||null;
 const parsed=normalizeArithmetic(chosen);
 if(!parsed)return null;
 return {text:chosen,alternatives:[...new Set([chosen,...options,...(local?[local.text]:[])])].slice(0,5),
  source:agreement?'hybrid-consensus':ml?'mlkit-es':'local-templates',
  confidence:agreement?'high':'review',autoAccept:agreement&&localConfidence>=0.86,
  needsReview:!agreement||localConfidence<0.86};
}
/** Grupos de tinta por renglón, respetando las posiciones originales.
 * Descarta trazos extremadamente altos para evitar figuras cerradas grandes.
 */
/** Cluster tall digit strokes into horizontal rows, then attach tiny
 * punctuation (+, colon dots, minus, equals) to the nearest row.
 * Previously tiny points often became their own row, causing ML Kit to
 * read "24:7=" as fragments or drop it entirely. */
export function mathematicalLines(strokes,{maxStrokes=160}={}){
 const entries=(strokes||[]).slice(-maxStrokes).map((stroke,i)=>{
  const b=bounds([stroke]);
  if(!stroke?.id||!b||b.height>150||b.width>180||b.width+b.height<3)return null;
  return {stroke,b,i,mid:(b.y+b.bottom)/2};
 }).filter(Boolean);
 if(!entries.length)return [];
 const heights=entries.map(x=>x.b.height).filter(x=>x>=10).sort((a,b)=>a-b);
 const medianHeight=heights[Math.floor(heights.length/2)]||25;
 const dotThreshold=Math.max(5,Math.min(13,medianHeight*.28));
 const anchors=entries.filter(x=>x.b.height>dotThreshold||x.b.width>dotThreshold*1.8)
  .sort((a,b)=>a.mid-b.mid);
 const tiny=entries.filter(x=>!anchors.includes(x));
 const rows=[];
 const tolerance=Math.max(22,Math.min(57,medianHeight*.92));
 for(const entry of anchors){
  const row=rows.find(r=>Math.abs(entry.mid-r.center)<=tolerance&&
    entry.b.y<=r.bottom+tolerance&&entry.b.bottom>=r.top-tolerance);
  if(!row)rows.push({items:[entry],center:entry.mid,top:entry.b.y,bottom:entry.b.bottom});
  else{
   row.items.push(entry);
   const tall=row.items.filter(x=>x.b.height>dotThreshold);
   row.center=tall.reduce((acc,x)=>acc+x.mid,0)/tall.length;
   row.top=Math.min(row.top,entry.b.y);row.bottom=Math.max(row.bottom,entry.b.bottom);
  }
 }
 // A dot or a short dash is not a new expression. Preserve its original
 // order within the row when submitting the complete ink to ML Kit.
 for(const entry of tiny){
  const row=rows.reduce((best,cur)=>{
   const distance=entry.mid<cur.top?cur.top-entry.mid:
    entry.mid>cur.bottom?entry.mid-cur.bottom:0;
   return !best||distance<best.distance?{row:cur,distance}:best;
  },null);
  if(row&&row.distance<=tolerance){
   row.row.items.push(entry);
   row.row.top=Math.min(row.row.top,entry.b.y);
   row.row.bottom=Math.max(row.row.bottom,entry.b.bottom);
  }
 }
 return rows.map(r=>{
  const items=r.items.sort((a,b)=>a.i-b.i),part=items.map(x=>x.stroke);
  return {strokes:part,box:bounds(part),strokeIds:items.map(x=>x.stroke.id),
   lastIndex:Math.max(...items.map(x=>x.i))};
 }).filter(line=>line.strokes.length<=80&&line.box.width<=700&&line.box.height<=155)
  .sort((a,b)=>a.box.y-b.box.y);
}
export function sampledMathStrokes(strokes){
 let budget=9500;
 return (strokes||[]).slice(0,80).map(stroke=>{
  const points=(stroke.pts||[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
  const step=Math.max(1,Math.ceil(points.length/Math.min(120,budget)));
  const out=points.filter((_,i)=>i%step===0).slice(0,Math.max(0,budget));
  budget-=out.length;return out;
 }).filter(p=>p.length>=2);
}
/** Conservatively detect a trailing equals sign drawn with two short
 * horizontal strokes. This does not fabricate a numerical answer or correct
 * digits; it only restores a clearly drawn punctuation symbol. */
export function hasHandwrittenEquals(strokes){
 const entries=(strokes||[]).map(stroke=>({stroke,b:bounds([stroke])})).filter(x=>x.b);
 if(entries.length<3)return false;
 const all=bounds(strokes),minimum=all.x+all.width*.68;
 const horizontal=entries.filter(x=>{
  const b=x.b,pts=x.stroke.pts||[];
  return b.x>=minimum&&b.width>=10&&b.width<=80&&b.height<=Math.max(8,b.width*.32)&&
   pts.length>=2;
 });
 for(let i=0;i<horizontal.length;i++)for(let j=i+1;j<horizontal.length;j++){
  const a=horizontal[i].b,b=horizontal[j].b;
  const vertical=Math.abs((a.y+a.bottom)/2-(b.y+b.bottom)/2),overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x));
  if(vertical>=5&&vertical<=24&&overlap>=Math.min(a.width,b.width)*.58)return true;
 }
 return false;
}
/** Small digits can be confused by ML Kit. Candidate 0/8 changes are shown
 * as explicitly unverified alternatives, never used for automatic conversion. */
export function reviewDigitAmbiguities(text){
 const parsed=normalizeArithmetic(text);
 if(!parsed||!hasBinaryArithmetic(text))return [];
 const token=/\d+(?:[.,]\d+)?/g;
 const matches=[...parsed.text.matchAll(token)];
 const last=matches.at(-1);if(!last)return [];
 const i=last.index+last[0].length-1,terminal=parsed.text[i];
 if(terminal!=='0'&&terminal!=='8')return [];
 const alternate=parsed.text.slice(0,i)+(terminal==='0'?'8':'0')+parsed.text.slice(i+1);
 return normalizeArithmetic(alternate)?[alternate]:[];
}

export async function recognizeHybridLine(strokes,recognizeNative){
 const box=bounds(strokes);
 if(!box||box.width>700||box.height>155||strokes.length>80||
    enclosedMathAnnotation(strokes))return null;
 const local=strokes.length<=16?recognizeInk(strokes):null;
 let candidates=[];
 if(typeof recognizeNative==='function'){
  try{
   const response=await recognizeNative({strokes:sampledMathStrokes(strokes)});
   candidates=Array.isArray(response?.candidates)?response.candidates:response?.text?[response.text]:[];
  }catch{/* ML Kit sin modelo descargado: se conserva alternativa local. */}
 }
 const fused=fuseMathCandidates({mlCandidates:candidates,localText:local?.geometry?.text,
  localConfidence:local?.confidence||0});
 if(!fused)return null;
 // If the equals sign is physically present but was omitted by ML Kit,
 // preserve the visible sign as a suggestion only; do not auto-accept it.
 const drawnEquals=hasHandwrittenEquals(strokes);
 let suggestion=fused;
 if(drawnEquals&&!fused.text.includes('=')){
  const complete=normalizeArithmetic(fused.text+'=');
  if(complete&&hasBinaryArithmetic(complete.text)){
   suggestion={...fused,text:complete.text,alternatives:[complete.text,...fused.alternatives],
    confidence:'review',autoAccept:false,needsReview:true};
  }
 }
 const ambiguities=reviewDigitAmbiguities(suggestion.text);
 return {...suggestion,
  alternatives:[...new Set([...suggestion.alternatives,...ambiguities])].slice(0,6),
  uncertainDigits:ambiguities.length>0,
  geometry:{kind:'text',text:suggestion.text,
  x:(box.x+box.right)/2,y:box.bottom,size:Math.max(18,Math.min(55,box.height||26))},
  style:{color:strokes[0]?.color||'#111827',width:2.5},strokeIds:strokes.map(x=>x.id)};
}
