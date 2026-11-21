/* V0.73 · Agrupación espacial de compromisos marcados con asterisco.
 * Solo observa coordenadas: no requiere que ML Kit lea el símbolo "*".
 * Los marcadores jamás alteran la tinta ni el cuaderno original.
 */
function box(stroke){
 const pts=(stroke?.pts||[]).filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
 if(pts.length<2)return null;
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 const x=Math.min(...xs),right=Math.max(...xs),y=Math.min(...ys),bottom=Math.max(...ys);
 return {x,right,y,bottom,w:right-x,h:bottom-y,cx:(x+right)/2,cy:(y+bottom)/2};
}
const angle=stroke=>{
 const pts=stroke.pts||[];
 const first=pts[0],last=pts[pts.length-1];
 return Math.atan2(last[1]-first[1],last[0]-first[0]);
};
const crossed=(a,b)=>{
 const x=Math.max(0,Math.min(a.box.right,b.box.right)-Math.max(a.box.x,b.box.x));
 const y=Math.max(0,Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.y,b.box.y));
 if(x<1||y<1)return false;
 const diff=Math.abs(Math.atan2(Math.sin(angle(a.stroke)-angle(b.stroke)),Math.cos(angle(a.stroke)-angle(b.stroke))));
 return diff>.48&&diff<2.65;
};
export function detectStarMarkers(strokes){
 const entries=(strokes||[]).map((stroke,i)=>({stroke,box:box(stroke),i}))
  .filter(e=>e.box&&e.box.w<=50&&e.box.h<=60&&e.box.w+e.box.h>=10);
 const candidates=[];
 for(let i=0;i<entries.length;i++){
  const a=entries[i];
  if(a.box.x>360)continue;
  for(let j=i+1;j<entries.length;j++){
   const b=entries[j];
   if(Math.abs(a.box.cy-b.box.cy)>22||Math.abs(a.box.cx-b.box.cx)>22||!crossed(a,b))continue;
   const x=Math.min(a.box.x,b.box.x),right=Math.max(a.box.right,b.box.right);
   const y=Math.min(a.box.y,b.box.y),bottom=Math.max(a.box.bottom,b.box.bottom);
   if(right-x>62||bottom-y>70)continue;
   // An asterisk is the *prefix* of a handwritten heading. A plus sign
   // elsewhere in a calculation does not qualify as a calendar marker.
   const heading=(strokes||[]).some((stroke,k)=>{
    if(k===a.i||k===b.i)return false;
    const other=box(stroke);
    return other&&other.x>right+5&&other.x<right+260&&
      other.cy>y-15&&other.cy<bottom+36;
   });
   if(heading)candidates.push({x,y,right,bottom,cy:(y+bottom)/2,strokeIndices:[a.i,b.i]});
  }
 }
 const unique=[];
 for(const candidate of candidates.sort((a,b)=>a.cy-b.cy||a.x-b.x)){
  if(unique.some(p=>Math.abs(p.cy-candidate.cy)<45&&Math.abs(p.x-candidate.x)<35))continue;
  unique.push(candidate);
 }
 return unique.slice(0,20);
}
/** Returns one group per asterisk from its heading to immediately before the
 * next asterisk. The original stroke objects are never modified. */
export function starredPageGroups(strokes){
 const stars=detectStarMarkers(strokes);
 if(!stars.length)return [];
 return stars.map((star,i)=>{
  const start=star.cy-23,end=stars[i+1]?.cy-23??Infinity;
  const group=(strokes||[]).filter(s=>{
   const b=box(s);return b&&b.cy>=start&&b.cy<end&&
    !(b.cx<star.right+5&&Math.abs(b.cy-star.cy)<27);
  });
  return {star,strokes:group,regionId:'star-'+i};
 }).filter(g=>g.strokes.length>=3);
}
