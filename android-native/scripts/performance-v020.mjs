import fs from 'node:fs/promises';
import path from 'node:path';
const file=path.join(process.cwd(),'stage','app.js');
let app=await fs.readFile(file,'utf8');
function replace(a,b,label){if(!app.includes(a))throw Error('V0.20 no encontró '+label);app=app.replace(a,b);}
const overlay=[
"const liveCanvas=document.createElement('canvas');",
"liveCanvas.id='minoteLiveInkCanvas';liveCanvas.setAttribute('aria-hidden','true');",
"liveCanvas.style.cssText='position:absolute;inset:0;pointer-events:none;width:100%;height:100%;z-index:3';",
"canvas.parentElement.style.position='relative';canvas.after(liveCanvas);",
"const liveCtx=liveCanvas.getContext('2d',{alpha:true});",
"let liveQueue=[],liveFrame=0,livePageId=null,paintPending=0;",
"function inkTransform(context,pg){",
" if((pg.orientation||'landscape-cw')==='landscape-cw')context.setTransform(0,liveCanvas.height/W,-liveCanvas.width/H,0,liveCanvas.width,0);",
" else if(pg.orientation==='landscape-ccw')context.setTransform(0,-liveCanvas.height/W,liveCanvas.width/H,0,0,liveCanvas.height);",
" else context.setTransform(liveCanvas.width/W,0,0,liveCanvas.height/H,0,0);",
"}",
"function clearLive(){",
" if(liveFrame){cancelAnimationFrame(liveFrame);liveFrame=0;}",
" liveQueue.length=0;",
" if(liveCanvas.width&&liveCanvas.height){liveCtx.setTransform(1,0,0,1,0,0);liveCtx.clearRect(0,0,liveCanvas.width,liveCanvas.height);}",
" livePageId=page()?.id||null;",
"}",
"function resetLiveSize(pg){",
" if(liveCanvas.width!==canvas.width||liveCanvas.height!==canvas.height){",
"  liveCanvas.width=canvas.width;liveCanvas.height=canvas.height;",
"  liveCtx.setTransform(1,0,0,1,0,0);liveCtx.clearRect(0,0,liveCanvas.width,liveCanvas.height);",
"  inkTransform(liveCtx,pg);if(inStroke)drawStroke(liveCtx,inStroke);",
"  if(x10ActiveStroke&&state?.activePageId===x10ActivePageId)drawStroke(liveCtx,x10ActiveStroke);",
" }",
"}",
"function queueLive(stroke){",
" if(!stroke||!stroke.pts.length)return;",
" if(livePageId!==page()?.id)clearLive();",
" const pts=stroke.pts;const segment=pts.length===1?[pts[0]]:[pts[pts.length-2],pts[pts.length-1]];",
" liveQueue.push({pts:segment,color:stroke.color,width:stroke.width});",
" if(liveFrame)return;",
" liveFrame=requestAnimationFrame(()=>{",
"  liveFrame=0;const pg=page();if(!pg){liveQueue.length=0;return;}",
"  const wasResized=liveCanvas.width!==canvas.width||liveCanvas.height!==canvas.height;",
"  resetLiveSize(pg);inkTransform(liveCtx,pg);",
"  const pending=liveQueue.splice(0);if(!wasResized)for(const s of pending)drawStroke(liveCtx,s);",
" });",
"}"
].join('\n');
replace("const canvas = $('paper'), ctx = canvas.getContext('2d', {alpha: false});",
 "const canvas = $('paper'), ctx = canvas.getContext('2d', {alpha: false});\n"+overlay,"overlay");
replace("if(inStroke)drawStroke(ctx,inStroke);if(x10ActiveStroke&&state?.activePageId===x10ActivePageId)drawStroke(ctx,x10ActiveStroke);}",
 "resetLiveSize(pg);if(!inStroke&&!x10ActiveStroke)clearLive();}","paint overlay");
replace("inStroke={id:uid(),color:currentColor,width:currentWidth,pts:[pt]};paint();}",
 "inStroke={id:uid(),color:currentColor,width:currentWidth,pts:[pt]};queueLive(inStroke);}","inicio trazo");
replace("function drawMove(e){if(!canvas.hasPointerCapture(e.pointerId))return;const pt=pointFromEvent(e);if(inStroke){const last=inStroke.pts.at(-1);if(Math.hypot(pt[0]-last[0],pt[1]-last[1])>1.2){inStroke.pts.push(pt);paint();}}else if(isErasing)eraseAt(pt);}",
 "function drawMove(e){if(!canvas.hasPointerCapture(e.pointerId))return;const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];for(const raw of events.length?events:[e]){const pt=pointFromEvent(raw);if(inStroke){const last=inStroke.pts.at(-1);if(Math.hypot(pt[0]-last[0],pt[1]-last[1])>1.2){inStroke.pts.push(pt);queueLive(inStroke);}}else if(isErasing)eraseAt(pt);}}","movimiento fluido");
replace("try{canvas.releasePointerCapture(e.pointerId);}catch{}paint();updatePage();}",
 "try{canvas.releasePointerCapture(e.pointerId);}catch{}clearLive();paint();updatePage();}","finalización");
replace(" x10PointCount++;if(x10PointCount%8===0)x10Details();\n paint();",
 " x10PointCount++;if(x10PointCount%32===0)x10Details();\n queueLive(x10ActiveStroke);","BLE sin repintado completo");
replace("function resizeCanvas(){requestAnimationFrame(paint);}",
 "function resizeCanvas(){if(paintPending)cancelAnimationFrame(paintPending);paintPending=requestAnimationFrame(()=>{paintPending=0;paint();});}","resize");
const oldSave="function persist(){const snapshot=clone(state);$('localStatus').textContent='◌ Guardando…';saveQueue=saveQueue.catch(()=>{}).then(()=>putSaved(snapshot)).then(()=>{$('localStatus').textContent='● Guardado local';}).catch(err=>{console.error(err);$('localStatus').textContent='⚠ Error de guardado';notice('No se pudo guardar localmente. Exporta un respaldo.',true);});return saveQueue;}";
const newSave=[
"let inkSaveTimer=0,inkSaveWaiting=[],inkSavePending=false;",
"function flushInkSave(){",
" clearTimeout(inkSaveTimer);inkSaveTimer=0;",
" if(!inkSavePending)return saveQueue;",
" inkSavePending=false;",
" const waiting=inkSaveWaiting.splice(0),snapshot=clone(state);",
" saveQueue=saveQueue.catch(()=>{}).then(()=>putSaved(snapshot)).then(()=>{",
"  $('localStatus').textContent='● Guardado local';waiting.forEach(({resolve})=>resolve());",
" }).catch(err=>{",
"  console.error(err);$('localStatus').textContent='⚠ Error de guardado';",
"  notice('No se pudo guardar localmente. Exporta un respaldo.',true);",
"  waiting.forEach(({reject})=>reject(err));",
" });",
" return saveQueue;",
"}",
"function persist(){",
" $('localStatus').textContent='◌ Guardando…';",
" inkSavePending=true;clearTimeout(inkSaveTimer);",
" inkSaveTimer=setTimeout(flushInkSave,400);",
" return new Promise((resolve,reject)=>inkSaveWaiting.push({resolve,reject}));",
"}",
"document.addEventListener('visibilitychange',()=>{if(document.hidden)void flushInkSave();});",
"window.addEventListener('pagehide',()=>{void flushInkSave();});"
].join('\n');
replace(oldSave,newSave,'guardar por lotes');
await fs.writeFile(file,app);
console.log('V0.20: overlay de tinta, rAF y guardado diferido 400ms.');
