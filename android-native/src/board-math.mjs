/* Geometría A5 de Mi Note X10. Las coordenadas de la tinta no cambian:
   al girar físicamente la agenda rotamos la presentación, no los datos. */
export const W=1000,H=1400;
export const DIRECTIONS=['portrait','landscape-right','landscape-left'];
export function direction(value){return DIRECTIONS.includes(value)?value:'portrait';}
export function landscape(value){return direction(value)!=='portrait';}
export function transform(value,pixelW,pixelH){
 const o=direction(value);
 if(o==='landscape-right')return [0,pixelH/W,-pixelW/H,0,pixelW,0];
 if(o==='landscape-left')return [0,-pixelH/W,pixelW/H,0,0,pixelH];
 return [pixelW/W,0,0,pixelH/H,0,0];
}
export function pointerToPage(value,unitX,unitY,pressure=0.75){
 const u=Math.min(1,Math.max(0,Number(unitX)||0)),v=Math.min(1,Math.max(0,Number(unitY)||0));
 const p=Math.min(1,Math.max(0,Number(pressure)||0));
 const o=direction(value);
 if(o==='landscape-right')return [v*W,(1-u)*H,p];
 if(o==='landscape-left')return [(1-v)*W,u*H,p];
 return [u*W,v*H,p];
}
export function pageToScreen(value,x,y){
 const o=direction(value);
 if(o==='landscape-right')return [H-y,x];
 if(o==='landscape-left')return [y,W-x];
 return [x,y];
}
export function orientSvg(svg,value){
 const o=direction(value);
 if(o==='portrait')return svg;
 const start=svg.indexOf('>');
 if(start<0||!svg.startsWith('<svg'))throw Error('SVG no válido.');
 const content=svg.slice(start+1).replace(/<\/svg>\s*$/,'');
 const transformAttr=o==='landscape-right'?'translate(1400,0) rotate(90)':'translate(0,1000) rotate(-90)';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000" viewBox="0 0 1400 1000"><g transform="'+transformAttr+'">'+content+'</g></svg>';
}
