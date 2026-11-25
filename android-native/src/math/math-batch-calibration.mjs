// Independent, explicit cells: never join repetitions or label an entire row as one glyph.
import {toReadingStrokes, inkOrientation, INK_PAGE_WIDTH, INK_PAGE_HEIGHT} from '../ink-orientation.mjs';
import {recordUserCorrection, extractStrokeSignature} from './math-personalization.mjs';

export const BATCH_COUNTS = Object.freeze([5,10,15,20]);
export const BATCH_SYMBOLS = Object.freeze([...Array.from('0123456789'),'+','-','×','÷',':','=','(',')',',','.','x','y','a','b','n','√','%','<','>']);
export function batchLayout(count=10, orientation='portrait') {
  if (!BATCH_COUNTS.includes(count)) throw Error('Cantidad de muestras inválida.');
  const landscape=inkOrientation(orientation)!=='portrait';
  return {count,cols:5,rows:count/5,width:landscape?INK_PAGE_HEIGHT:INK_PAGE_WIDTH,height:landscape?INK_PAGE_WIDTH:INK_PAGE_HEIGHT};
}
export function captureBatchBaseline(page, count=10) {
  if(!page?.id) throw Error('Abra una hoja de calibración.');
  return {pageId:page.id,orientation:inkOrientation(page.orientation),count,ids:new Set((page.strokes||[]).map(s=>s.id))};
}
export function readBatchCells(page, baseline) {
  if(!baseline||page?.id!==baseline.pageId||inkOrientation(page.orientation)!==baseline.orientation)
    throw Error('La hoja u orientación cambió. Inicie otro bloque.');
  const layout=batchLayout(baseline.count,baseline.orientation);
  const {cols,rows,width,height}=layout, cw=width/cols,ch=height/rows;
  const cells=Array.from({length:layout.count},(_,index)=>({index,strokes:[],valid:false}));
  const rejected=[];
  const newStrokes=(page.strokes||[]).filter(s=>!baseline.ids.has(s.id));
  for(const s of toReadingStrokes(newStrokes,baseline.orientation)){
    const pts=s.pts||[];
    if(!pts.length||pts.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<0||p[1]<0||p[0]>=width||p[1]>=height)){rejected.push(s.id);continue;}
    const indexes=new Set(pts.map(p=>Math.floor(p[1]/ch)*cols+Math.floor(p[0]/cw)));
    if(indexes.size!==1){rejected.push(s.id);continue;}
    const index=[...indexes][0];
    cells[index].strokes.push({...s,pts:pts.map(p=>p.slice())});
  }
  for(const cell of cells){
    const sig=extractStrokeSignature(cell.strokes);
    cell.valid=!!sig&&sig.bbox.diag>=4;
  }
  return {layout,cells,rejected};
}
export function trainBatch(profile, symbol, cells) {
  if(!BATCH_SYMBOLS.includes(symbol))throw Error('Símbolo inválido.');
  if(!Array.isArray(cells)||!cells.length)throw Error('Seleccione muestras válidas.');
  let next=profile;
  const seen=new Set();
  for(const cell of cells){
    const sig=extractStrokeSignature(cell.strokes);
    if(!cell.valid||!sig||sig.bbox.diag<4||cell.strokes.some(s=>!s.id||seen.has(s.id)))throw Error('Muestras inválidas o duplicadas.');
    cell.strokes.forEach(s=>seen.add(s.id));
    next=recordUserCorrection(next,{actual:symbol,strokes:cell.strokes,category:/^\d$/.test(symbol)?'numbers':'operators'});
  }
  return next;
}
