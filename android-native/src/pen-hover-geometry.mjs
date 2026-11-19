/* Coordenadas del punto de escritura original A5 (1000×1400).
 * El indicador solo cambia de posición visual; nunca transforma los trazos. */
export function toVisualPosition(x,y,orientation='portrait'){
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1000||y<0||y>1400)return null;
 const u=x/1000,v=y/1400;
 if(orientation==='landscape-cw')return {u:1-v,v:u};
 if(orientation==='landscape-ccw')return {u:v,v:1-u};
 return {u,v};
}
export function isHoverPointer(event,drawing=false){
 return !drawing&&['pen','mouse'].includes(event?.pointerType)&&event?.buttons===0;
}
