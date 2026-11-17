// Geometría pura de la barra flotante (sin DOM), usada también por las pruebas.
export function clampPosition(x,y,width,height,viewWidth,viewHeight,pad=8){
 const maxX=Math.max(pad,viewWidth-width-pad);
 const maxY=Math.max(pad,viewHeight-height-pad);
 const finite=(n,fallback)=>Number.isFinite(Number(n))?Number(n):fallback;
 return {x:Math.max(pad,Math.min(maxX,finite(x,pad))),
         y:Math.max(pad,Math.min(maxY,finite(y,pad)))};
}
export function snapPosition(x,y,width,height,viewWidth,viewHeight,pad=8){
 let p=clampPosition(x,y,width,height,viewWidth,viewHeight,pad);
 const edges=[
  ['left',p.x-pad],['right',viewWidth-pad-(p.x+width)],
  ['top',p.y-pad],['bottom',viewHeight-pad-(p.y+height)]
 ];
 edges.sort((a,b)=>a[1]-b[1]);
 const edge=edges[0][0];
 if(edge==='left')p.x=pad;
 if(edge==='right')p.x=Math.max(pad,viewWidth-width-pad);
 if(edge==='top')p.y=pad;
 if(edge==='bottom')p.y=Math.max(pad,viewHeight-height-pad);
 return {...p,edge};
}
export function toRelative(position,viewWidth,viewHeight){
 return {x:Math.max(0,Math.min(1,position.x/Math.max(1,viewWidth))),
         y:Math.max(0,Math.min(1,position.y/Math.max(1,viewHeight)))};
}
export function fromRelative(position,width,height,viewWidth,viewHeight,pad=8){
 const x=Number(position?.x)*viewWidth;
 const y=Number(position?.y)*viewHeight;
 return clampPosition(x,y,width,height,viewWidth,viewHeight,pad);
}
