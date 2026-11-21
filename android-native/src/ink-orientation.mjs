/* Mi Note V0.78: orientación común para OCR de agenda y Matemática.
 * La X10 almacena coordenadas A5 1000x1400. El giro de pantalla es una
 * transformación de PRESENTACIÓN: nunca mutar strokes ni puntos físicos.
 */
export const INK_PAGE_WIDTH=1000;
export const INK_PAGE_HEIGHT=1400;
export function inkOrientation(value){
 return value==='landscape-cw'||value==='landscape-ccw'?value:'portrait';
}
export function toReadingPoint(point,orientation='portrait'){
 const [x,y,...extra]=point;
 const mode=inkOrientation(orientation);
 if(mode==='landscape-cw')return [INK_PAGE_HEIGHT-y,x,...extra];
 if(mode==='landscape-ccw')return [y,INK_PAGE_WIDTH-x,...extra];
 return [x,y,...extra];
}
export function fromReadingPoint(point,orientation='portrait'){
 const [x,y,...extra]=point;
 const mode=inkOrientation(orientation);
 if(mode==='landscape-cw')return [y,INK_PAGE_HEIGHT-x,...extra];
 if(mode==='landscape-ccw')return [INK_PAGE_WIDTH-y,x,...extra];
 return [x,y,...extra];
}
/** Copias de trazos en el sentido legible de pantalla, con IDs originales. */
export function toReadingStrokes(strokes,orientation='portrait'){
 const mode=inkOrientation(orientation);
 if(mode==='portrait')return strokes||[];
 return (strokes||[]).map(stroke=>({...stroke,
  pts:(stroke.pts||[]).map(point=>toReadingPoint(point,mode))}));
}
/** ML Kit recibe rutas (no objetos stroke) en la orientación de lectura. */
export function toReadingPaths(paths,orientation='portrait'){
 const mode=inkOrientation(orientation);
 if(mode==='portrait')return paths||[];
 return (paths||[]).map(path=>path.map(point=>toReadingPoint(point,mode)));
}
/** Los resultados de ML Kit se guardan en coordenadas físicas de la hoja. */
export function readingGeometryToPage(geometry,orientation='portrait'){
 if(!geometry||geometry.kind!=='text')return geometry;
 const [x,y]=fromReadingPoint([geometry.x,geometry.y],orientation);
 return {...geometry,x,y};
}
/** Contrarrotación SOLO del texto SVG. La geometría conserva su giro. */
export function uprightTextAngle(orientation='portrait'){
 const mode=inkOrientation(orientation);
 return mode==='landscape-cw'?-90:mode==='landscape-ccw'?90:0;
}
