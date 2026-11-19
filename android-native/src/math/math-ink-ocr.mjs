/* Reconocimiento local, acotado y conservador de cifras/unidades manuscritas.
   Plantillas vectoriales sin servidor, pesos ni bibliotecas descargables.
   Los resultados dudosos NO sustituyen la escritura; el usuario puede corregirlos. */
const templates={
 '0':[[[.5,0],[.13,.12],[0,.48],[.14,.88],[.50,1],[.86,.88],[1,.5],[.86,.12],[.5,0]]],
 '1':[[[.12,.24],[.54,0],[.54,1]],[[.12,1],[.88,1]]],
 '2':[[[.05,.22],[.22,.05],[.70,0],[.98,.21],[.86,.43],[.61,.62],[.06,.98],[.98,.98]]],
 '3':[[[.08,.08],[.6,0],[.93,.17],[.78,.41],[.44,.50],[.80,.56],[1,.78],[.76,1],[.13,.93]]],
 '4':[[[.70,0],[.07,.62],[1,.62]],[[.70,0],[.70,1]]],
 '5':[[[1,0],[.16,0],[.1,.43],[.62,.42],[1,.64],[.86,.92],[.54,1],[.05,.92]]],
 '6':[[[.85,0],[.25,.25],[.05,.60],[.24,.93],[.55,1],[.89,.79],[.70,.55],[.32,.55],[.05,.67]]],
 '7':[[[.03,0],[1,0],[.38,1]]],
 '8':[[[.50,0],[.14,.19],[.50,.49],[.92,.20],[.5,0]],[[.5,.49],[.05,.75],[.5,1],[.98,.75],[.5,.49]]],
 '9':[[[.75,.43],[.95,.19],[.65,0],[.25,.06],[.05,.30],[.33,.55],[.75,.43],[.88,.68],[.72,1]]],
 'c':[[[1,.1],[.42,0],[.07,.2],[0,.67],[.37,1],[1,.92]]],
 'm':[[[0,1],[0,0],[0,.6],[.23,.08],[.44,.35],[.44,1],[.44,.63],[.70,.06],[.98,.35],[1,1]]],
 '°':[[[.5,0],[.12,.12],[0,.5],[.15,.88],[.5,1],[.86,.86],[1,.5],[.85,.12],[.5,0]]],
 ',':[[[.55,0],[.45,.44],[.18,1]]],
 '.':[[[0,.5],[.5,1],[1,.5],[.5,0],[0,.5]]]
};
const referenceAspect={'0':.68,'1':.26,'2':.74,'3':.73,'4':.74,'5':.72,'6':.7,'7':.76,'8':.69,'9':.69,
 'c':.64,'m':1.2,'°':1,',':.22,'.':.9};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function box(stroke){
 const pts=(stroke?.pts||[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
 if(!pts.length)return null;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const p of pts){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
 return {minX,minY,maxX,maxY,w:maxX-minX,h:maxY-minY};
}
function interpolate(a,b,steps=8){
 const out=[];for(let k=0;k<=steps;k++){const t=k/steps;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}return out;
}
const pathSamples=paths=>{
 const out=[];for(const path of paths)for(let j=1;j<path.length;j++)out.push(...interpolate(path[j-1],path[j],6));
 return out;
};
function normalizeGlyph(paths){
 const points=paths.flat();
 if(points.length<2)return null;
 const x=points.map(p=>p[0]),y=points.map(p=>p[1]);
 const minX=Math.min(...x),maxX=Math.max(...x),minY=Math.min(...y),maxY=Math.max(...y);
 const width=maxX-minX,height=maxY-minY;
 if(width<.1&&height<.1)return null;
 return paths.map(path=>path.map(p=>[(p[0]-minX)/Math.max(width,.001),(p[1]-minY)/Math.max(height,.001)]));
}
const profile={};
for(const [symbol,paths] of Object.entries(templates)){
 const norm=normalizeGlyph(paths);
 profile[symbol]=pathSamples(norm);
}
const NEAREST=(point,pts)=>{let d=Infinity;for(const q of pts)d=Math.min(d,distance(point,q));return d;};
function similarity(points,template){
 const a=points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/120))===0);
 const b=template.filter((_,i)=>i%Math.max(1,Math.floor(template.length/120))===0);
 const f=a.reduce((s,p)=>s+NEAREST(p,b),0)/a.length;
 const r=b.reduce((s,p)=>s+NEAREST(p,a),0)/b.length;
 return clamp(1-(f+r)*1.55,0,1);
}
function classify(paths,b){
 const normalized=normalizeGlyph(paths);if(!normalized)return null;
 const vectors=pathSamples(normalized);const aspect=b.w/Math.max(b.h,1);
 const ranked=Object.entries(profile).map(([symbol,tpl])=>{
  const base=similarity(vectors,tpl);
  const diff=Math.abs(Math.log((aspect+.05)/(referenceAspect[symbol]+.05)));
  let score=base-Math.min(.21,diff*.085);
  // Círculo grande es figura, no el número 0; puntos pequeños no deben
  // convertirse en medidas si están aislados.
  if(symbol==='°'&&b.h>25)score-=.22;
  if((symbol==='.'||symbol===',')&&b.h>20)score-=.25;
  if(symbol==='m'&&b.w<15)score-=.3;
  return {symbol,confidence:clamp(score,0,1)};
 }).sort((a,b)=>b.confidence-a.confidence);
 return {best:ranked[0],second:ranked[1],alternatives:ranked.slice(0,3)};
}
const sameGlyph=(a,b)=>{
 const overlap=Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX));
 const narrow=Math.max(1,Math.min(a.w,b.w));
 const centerDist=Math.abs((a.minX+a.maxX)/2-(b.minX+b.maxX)/2);
 return overlap/narrow>.42||centerDist<Math.min(12,Math.max(a.w,b.w)*.22);
};
function groupGlyphs(strokes){
 const items=strokes.map(s=>({stroke:s,b:box(s)})).filter(x=>x.b);
 const groups=[];for(const item of items){
  let found=null;
  for(const group of groups)if(group.some(x=>sameGlyph(x.b,item.b))){found=group;break;}
  if(found)found.push(item);else groups.push([item]);
 }
 const result=groups.map(group=>{
  const b={minX:Math.min(...group.map(x=>x.b.minX)),minY:Math.min(...group.map(x=>x.b.minY)),
   maxX:Math.max(...group.map(x=>x.b.maxX)),maxY:Math.max(...group.map(x=>x.b.maxY))};
  b.w=b.maxX-b.minX;b.h=b.maxY-b.minY;
  return {strokes:group.map(x=>x.stroke),box:b};
 }).sort((a,b)=>a.box.minX-b.box.minX);
 return result;
}
export function recognizeInk(strokes){
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>16)return null;
 const letters=groupGlyphs(strokes);
 if(!letters.length||letters.length>9)return null;
 const glyphs=[],heights=[];
 for(const item of letters){
  const b=item.box;
  if(b.w>120||b.h>112||b.w<1||b.h<4)return null;
  heights.push(b.h);
  const paths=item.strokes.map(s=>s.pts.filter(p=>Array.isArray(p)&&p.length>=2));
  const res=classify(paths,b);
  if(!res)return null;
  glyphs.push({...res,box:b});
 }
 // Un pequeño círculo situado en superíndice después de un número es °;
 // el mismo círculo a altura normal sigue siendo 0. Evita inventar grados.
 if(glyphs.length>=2){
  const last=glyphs.at(-1),previous=glyphs[glyphs.length-2];
  const maxPrevious=Math.max(...glyphs.slice(0,-1).map(g=>g.box.h));
  const small=last.box.h<maxPrevious*.59&&last.box.h>=6;
  const raised=last.box.maxY<previous.box.maxY-maxPrevious*.22;
  const hasRing=last.alternatives.some(g=>g.symbol==='0'&&g.confidence>=.84);
  if(small&&raised&&hasRing){
   const ring=last.alternatives.find(g=>g.symbol==='0');
   const runner=last.alternatives.find(g=>g.symbol!=='0'&&g.symbol!=='°');
   last.best={symbol:'°',confidence:ring.confidence};
   last.second=runner||{symbol:'?',confidence:0};
  }
 }
 const text=glyphs.map(g=>g.best.symbol).join('');
 if(!/^(?:\d{1,4}(?:[.,]\d{1,2})?)(?:cm|mm|m|°)?$/.test(text))return null;
 const minConf=Math.min(...glyphs.map(g=>g.best.confidence));
 const mean=glyphs.reduce((sum,g)=>sum+g.best.confidence,0)/glyphs.length;
 const margin=Math.min(...glyphs.map(g=>g.best.confidence-g.second.confidence));
 // Sólo tinta que coincide muy claramente con nuestras plantillas.
 // No se finge una certeza que no proporcione el modelo local.
 if(minConf<.79||mean<.86||margin<.055)return null;
 if(glyphs.length===1&&(mean<.93||margin<.10))return null;
 const maxH=Math.max(...heights),minY=Math.min(...glyphs.map(g=>g.box.minY));
 const last=glyphs.at(-1).box;
 const overall={minX:Math.min(...glyphs.map(g=>g.box.minX)),maxX:Math.max(...glyphs.map(g=>g.box.maxX)),
  minY,maxY:Math.max(...glyphs.map(g=>g.box.maxY))};
 for(let i=1;i<glyphs.length;i++){
  const gap=glyphs[i].box.minX-glyphs[i-1].box.maxX;
  if(gap>maxH*.85||gap<-maxH*.15)return null;
  if(Math.abs(glyphs[i].box.maxY-glyphs[i-1].box.maxY)>maxH*.64
     &&text[i]!=='°'&&text[i]!=='.'&&text[i]!==',')return null;
 }
 return {type:'text',label:'Texto matemático',geometry:{kind:'text',text,
   x:(overall.minX+overall.maxX)/2,y:overall.maxY,
   size:clamp(maxH,15,88)},confidence:mean,
  sourceStrokeIds:strokes.map(s=>s.id),
  style:{color:/^#[0-9a-f]{6}$/i.test(strokes[0]?.color)?strokes[0].color:'#000000',width:2}};
}
export const HANDWRITING_TEMPLATES=Object.freeze(templates);
