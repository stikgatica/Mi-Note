// Geometría de reproducción, independiente de Android/Bluetooth y de la base de datos.
export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1400;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
function validPoint(p) {
 if(!Array.isArray(p)||p.length<2) return null;
 const x=Number(p[0]),y=Number(p[1]),pressure=Number(p[2]);
 if(!Number.isFinite(x)||!Number.isFinite(y)) return null;
 return [clamp(x,0,PAGE_WIDTH),clamp(y,0,PAGE_HEIGHT),Number.isFinite(pressure)?clamp(pressure,0,1):0.5];
}
export function createTimeline(strokes) {
 const clips=[];
 let cursor=0;
 if(!Array.isArray(strokes)) return {clips,total:1,strokes:0};
 for(const source of strokes){
  const points=(Array.isArray(source?.pts)?source.pts:[]).map(validPoint).filter(Boolean);
  if(!points.length) continue;
  const steps=[];
  let length=0;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];
   const distance=Math.max(0.25,Math.hypot(b[0]-a[0],b[1]-a[1]));
   steps.push({a,b,from:length,to:length+distance});
   length+=distance;
  }
  if(!steps.length) length=14;
  cursor+=clips.length?24:0; // Separación visual entre trazos.
  const duration=Math.max(14,length);
  const width=Number(source.width);
  clips.push({
   color:/^#[0-9a-fA-F]{6}$/.test(source.color)?source.color:'#153f82',
   width:Number.isFinite(width)?clamp(width,0.6,25):3,
   points,steps,start:cursor,end:cursor+duration,duration
  });
  cursor+=duration;
 }
 return {clips,total:Math.max(1,cursor),strokes:clips.length};
}
export function timelineAt(timeline, fraction){
 const f=clamp(Number.isFinite(Number(fraction))?Number(fraction):0,0,1);
 return f*timeline.total;
}
