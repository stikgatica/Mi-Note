/* Mi Note Matemática — capa local reversible para Geometría y medición.
 * No accede a BLE, a Internet, al firmware ni al respaldo directamente. */
import {AXES,fingerprint,hitStroke,validObject,PAGE} from './math-geometry.mjs';
import './math-ui.css';

const $=id=>document.getElementById(id);
const svgNS='http://www.w3.org/2000/svg';
const make=(tag,attrs={},text)=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;};
const nsvg=(tag,attrs={})=>{const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const bridge=()=>window.MiNoteMathBridge;
const dialog=make('dialog',{id:'mathDialog',class:'dialog minote-math-dialog','aria-labelledby':'mathTitle'});
dialog.innerHTML=\`
 <div class="dialog-head"><h2 id="mathTitle">Modo Matemática</h2><button type="button" id="mathClose" aria-label="Cerrar" class="icon-btn">✕</button></div>
 <label class="math-switch"><input id="mathMode" type="checkbox"> <strong>Activar Modo Matemática</strong></label>
 <label class="field">Eje<select id="mathAxis"></select></label>
 <p class="math-hint">Los trazos originales nunca se modifican. La mejora es una capa independiente.</p>
 <section id="mathGeometryControls" hidden>
  <label class="math-switch"><input id="mathShowLayer" type="checkbox" checked> Mostrar capa mejorada</label>
  <button type="button" id="mathSelectMode">Seleccionar trazos en la hoja</button>
  <div id="mathSelectionCount" class="math-hint">Ningún trazo seleccionado.</div>
  <label class="field">Interpretar como<select id="mathShapeType">
   <option value="auto">Detectar automáticamente</option><option value="line">Línea recta</option>
   <option value="polygon">Polígono</option><option value="circle">Circunferencia</option>
   <option value="edges">Aristas (sin completar caras)</option>
  </select></label>
  <div class="math-actions"><button type="button" id="mathImprove" class="primary">Mejorar selección</button>
   <button type="button" id="mathClearSelection">Limpiar selección</button></div>
  <div id="mathProposal" class="math-hint">Seleccione trazos tocándolos con el dedo en la hoja.</div>
  <div class="math-actions"><button type="button" id="mathAccept" class="primary" disabled>Aceptar propuesta</button>
   <button type="button" id="mathReject" disabled>Descartar</button></div>
  <label class="field">Figura mejorada guardada<select id="mathSavedObjects"></select></label>
  <details id="mathEditDetails"><summary>Corregir figura o etiqueta</summary>
   <div id="mathCoordinateEditor" class="math-edit-fields"></div>
   <div class="math-actions"><button type="button" id="mathSaveEdit">Guardar correcciones</button>
    <button type="button" id="mathRemoveObject">Eliminar mejora</button></div>
   <label class="field">Etiqueta escrita manualmente (sin reconocimiento automático)
    <input type="text" id="mathLabel" maxlength="40" placeholder="Ej. 7 cm o 45°"></label>
   <div class="math-row"><label>X <input type="number" id="mathLabelX" min="0" max="1000" value="500"></label>
    <label>Y <input type="number" id="mathLabelY" min="0" max="1400" value="700"></label></div>
   <button type="button" id="mathAddLabel">Agregar etiqueta</button>
   <div id="mathLabels"></div>
  </details>
  <small>Para números y medidas manuscritos se añadirá reconocimiento local en la siguiente fase. No se inventan dimensiones.</small>
 </section>
 <p id="mathStatus" class="math-hint" role="status" aria-live="polite"></p>
\`;
document.body.append(dialog);
const menu=document.querySelector('#mobileMoreDialog .mobile-actions-list');
const mathMenu=make('div',{class:'math-menu-entry'});
const menuSwitch=make('label',{class:'math-switch'});
const switchInput=make('input',{id:'mathMenuToggle',type:'checkbox'});
menuSwitch.append(switchInput,document.createTextNode(' Modo Matemática'));
const openButton=make('button',{id:'mathOpenPanel',type:'button'},'Configurar Matemática');
mathMenu.append(menuSwitch,openButton);
menu?.prepend(mathMenu);

const shell=document.querySelector('.paper-shell'),paper=$('paper');
if(!shell||!paper)throw Error('No se encontró el lienzo de escritura de Mi Note.');
const layer=nsvg('svg',{id:'mathOverlay',role:'img','aria-label':'Capa matemática mejorada',preserveAspectRatio:'none'});
layer.style.pointerEvents='none';
shell.style.position='relative';
paper.after(layer);

const axis=$('mathAxis');
for(const entry of AXES)axis.append(make('option',{value:entry.id,...(entry.ready?{}:{disabled:'disabled'})},entry.label+(entry.ready?'':' (próximamente)')));
axis.value='geometry';

let enabled=false,selecting=false,selected=new Set(),proposal=null,busy=false,worker=null,workerSeq=0;
const pending=new Map();
const status=message=>{$('mathStatus').textContent=message;};
const nowPage=()=>bridge()?.snapshot?.();
const currentLayer=page=>page?.mathLayer||{version:1,axis:'geometry',visible:true,objects:[]};
const copy=v=>JSON.parse(JSON.stringify(v));
const objectList=page=>(currentLayer(page).objects||[]).filter(o=>validObject(o,page));
const objectSourceIds=page=>{
 const ids=new Set();
 if(!enabled||!currentLayer(page).visible)return ids;
 for(const o of objectList(page))for(const source of o.sources)ids.add(source.id);
 return ids;
};
let hiddenSourceIds=new Set(),cachedPageId='';
function updateHidden(page){
 hiddenSourceIds=objectSourceIds(page);cachedPageId=page?.id||'';
}
window.MiNoteMathVisibility=(pageId,strokeId)=>enabled&&cachedPageId===pageId&&hiddenSourceIds.has(strokeId);
function geometryElement(geo,style,preview=false){
 const attrs={fill:'none',stroke:preview?'#1685f6':style.color||'#000000',
  'stroke-width':Math.max(1,Number(style.width)||3),'stroke-linecap':'round','stroke-linejoin':'round'};
 if(preview)attrs['stroke-dasharray']='10 5';
 if(geo?.kind==='line')return nsvg('line',{...attrs,x1:geo.points[0][0],y1:geo.points[0][1],x2:geo.points[1][0],y2:geo.points[1][1]});
 if(geo?.kind==='circle')return nsvg('circle',{...attrs,cx:geo.cx,cy:geo.cy,r:geo.r});
 if(geo?.kind==='polygon')return nsvg('polygon',{...attrs,points:geo.points.map(p=>p.join(',')).join(' ')});
 if(geo?.kind==='segments'){
  const g=nsvg('g');
  for(const [a,b] of geo.segments||[])g.append(nsvg('line',{...attrs,x1:a[0],y1:a[1],x2:b[0],y2:b[1]}));
  return g;
 }
 return nsvg('g');
}
function drawOverlay(page){
 const visible=enabled&&currentLayer(page).visible;
 layer.replaceChildren();
 layer.hidden=!visible;
 const rotated=page?.orientation==='landscape-cw';
 layer.setAttribute('viewBox',rotated?'0 0 1400 1000':'0 0 1000 1400');
 if(!visible||!page)return;
 const group=nsvg('g',rotated?{transform:'translate(1400 0) rotate(90)'}:{});
 for(const obj of objectList(page)){
  group.append(geometryElement(obj.geometry,obj.style||{}));
  for(const label of obj.labels||[]){
   if(!label?.text)continue;
   const text=nsvg('text',{x:clamp(label.x,0,1000),y:clamp(label.y,0,1400),
    fill:obj.style?.color||'#000000','font-size':Math.max(13,Number(label.size)||24),
    'font-family':'sans-serif','text-anchor':'middle'});
   text.textContent=label.text;group.append(text);
  }
 }
 if(proposal&&proposal.pageId===page.id)group.append(geometryElement(proposal.geometry,proposal.style||{},true));
 layer.append(group);
}
function refresh(){
 const pg=nowPage();if(!pg)return;
 updateHidden(pg);drawOverlay(pg);
 bridge()?.repaint?.();
 updateSavedList(pg);
}
const workingPage=()=>nowPage();
function clearSelection(){selected.clear();proposal=null;$('mathSelectionCount').textContent='Ningún trazo seleccionado.';$('mathAccept').disabled=true;$('mathReject').disabled=true;}
function updateSavedList(pg){
 const sel=$('mathSavedObjects'),id=sel.value;
 sel.replaceChildren(make('option',{value:''},'Seleccionar figura…'));
 for(const obj of objectList(pg))sel.append(make('option',{value:obj.id},obj.name||obj.label||obj.type));
 if([...sel.options].some(o=>o.value===id))sel.value=id;
}
function updateUi(){
 $('mathMode').checked=enabled;switchInput.checked=enabled;
 $('mathGeometryControls').hidden=!enabled;axis.disabled=!enabled;
 $('mathShowLayer').checked=currentLayer(nowPage()).visible!==false;
 $('mathSelectMode').textContent=selecting?'Terminar selección de trazos':'Seleccionar trazos en la hoja';
 paper.classList.toggle('math-selecting',enabled&&selecting);
 refresh();
}
function deactivate(){selecting=false;clearSelection();enabled=false;updateUi();}
function setEnabled(value){
 if(busy)return;
 enabled=!!value;if(!enabled){selecting=false;clearSelection();}
 updateUi();
 status(enabled?'Seleccione uno o varios trazos, luego pulse Mejorar selección.':'Modo normal: se muestran todos los trazos originales.');
}
function nearestStroke(pg,xy){
 let min=Infinity,found=null;
 const saved=objectSourceIds(pg);
 for(const stroke of pg.strokes||[]){
  if(saved.has(stroke.id))continue;
  const hit=hitStroke(stroke,xy,26);
  if(hit<min){min=hit;found=stroke;}
 }return found;
}
function captureSelection(e){
 if(!enabled||!selecting)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 if(e.type!=='pointerdown')return;
 const pg=workingPage();if(!pg)return;
 const xy=bridge()?.pointFromEvent?.(e);if(!xy)return;
 const s=nearestStroke(pg,xy);
 if(!s){status('No se encontró un trazo cerca del toque.');return;}
 if(selected.has(s.id))selected.delete(s.id);else if(selected.size<12)selected.add(s.id);
 else{status('Seleccione como máximo 12 trazos para una figura.');return;}
 proposal=null;$('mathAccept').disabled=true;$('mathReject').disabled=true;
 $('mathSelectionCount').textContent=selected.size+' trazo(s) seleccionado(s).';
 drawOverlay(pg);
}
for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])paper.addEventListener(type,captureSelection,{capture:true});
function ensureWorker(){
 if(worker)return worker;
 if(typeof Worker!=='function')throw Error('Android no permite iniciar el procesamiento local sin conexión.');
 worker=new Worker(new URL('./math-worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{
  const job=pending.get(data?.id);if(!job)return;
  pending.delete(data.id);clearTimeout(job.timer);
  if(data.error)job.reject(Error(data.error));else job.resolve(data.result);
 };
 worker.onerror=()=>{
  for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Error del motor geométrico local.'));}
  pending.clear();worker.terminate();worker=null;
 };
 return worker;
}
function recognize(strokes,type){
 const instance=ensureWorker(),id=++workerSeq;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Análisis excedió el tiempo permitido.'));},5000);
  pending.set(id,{resolve,reject,timer});
  instance.postMessage({id,strokes,type});
 });
}
async function improve(){
 if(busy||!enabled)return;
 const pg=workingPage();
 const strokes=(pg?.strokes||[]).filter(s=>selected.has(s.id));
 if(!strokes.length){status('Seleccione trazos de la hoja antes de mejorar.');return;}
 busy=true;$('mathImprove').disabled=true;status('Analizando geometría en el dispositivo…');
 try{
  const candidate=await recognize(strokes,$('mathShapeType').value);
  if(!candidate){status('No hay una figura fiable. Seleccione otros trazos o cambie la interpretación.');return;}
  proposal={...candidate,pageId:pg.id,sources:strokes.map(s=>({id:s.id,signature:fingerprint(s)}))};
  $('mathProposal').textContent='Propuesta: '+candidate.label+'. Compruebe la forma azul discontinua antes de aceptarla.';
  $('mathAccept').disabled=false;$('mathReject').disabled=false;
  drawOverlay(pg);
  if(dialog.open){dialog.close();status('Vista previa sobre la hoja. Abra Matemática para aceptar o descartar.');}
 }catch(error){status(error.message);}
 finally{busy=false;$('mathImprove').disabled=false;}
}
function activePageCheck(pageId){const pg=workingPage();if(!pg||pg.id!==pageId)throw Error('La hoja cambió. Repita la selección.');return pg;}
async function writeLayer(objects,visible){
 const result=await bridge()?.saveLayer?.({version:1,axis:'geometry',visible,objects});
 if(!result)throw Error('No se guardaron los objetos de Matemática.');
 refresh();return result;
}
async function accept(){
 if(!proposal||busy)return;
 const pg=activePageCheck(proposal.pageId);
 if(!proposal.sources.every(s=>fingerprint(pg.strokes.find(x=>x.id===s.id))===s.signature)){
  clearSelection();status('Los trazos cambiaron. Seleccione de nuevo.');return;
 }
 const o={id:crypto.randomUUID?.()||'g-'+Date.now(),accepted:true,type:proposal.type,
  label:proposal.label,name:proposal.label,geometry:copy(proposal.geometry),
  sources:copy(proposal.sources),style:copy(proposal.style),labels:[]};
 const layer=currentLayer(pg);
 try{
  await writeLayer([...(layer.objects||[]),o],true);
  clearSelection();selecting=false;updateUi();status('Mejora guardada. Los trazos originales permanecen intactos.');
 }catch(e){status(e.message);}
}
function selectedObject(){
 const pg=workingPage(),id=$('mathSavedObjects').value;
 return (currentLayer(pg).objects||[]).find(o=>o.id===id)||null;
}
function coordinateEditor(geo){
 const el=$('mathCoordinateEditor');el.replaceChildren();
 if(!geo)return;
 const add=(key,value)=>{const label=make('label',{},key+' '),inp=make('input',{type:'number',step:'0.1',min:0,max:1400,'data-key':key,value:Number(value).toFixed(1)});label.append(inp);el.append(label);};
 if(geo.kind==='circle'){add('cx',geo.cx);add('cy',geo.cy);add('r',geo.r);}
 if(geo.kind==='line'||geo.kind==='polygon')for(let i=0;i<geo.points.length;i++){add('p'+i+'x',geo.points[i][0]);add('p'+i+'y',geo.points[i][1]);}
 if(geo.kind==='segments')for(let i=0;i<geo.segments.length;i++)for(let j=0;j<2;j++){add('s'+i+j+'x',geo.segments[i][j][0]);add('s'+i+j+'y',geo.segments[i][j][1]);}
}
function editSelectedObject(){
 const obj=selectedObject();coordinateEditor(obj?.geometry);
 $('mathLabels').replaceChildren();
 if(!obj)return;
 for(let i=0;i<(obj.labels||[]).length;i++){
  const lab=obj.labels[i];
  const row=make('div',{class:'math-row'}),text=make('span',{},lab.text+' ('+Math.round(lab.x)+', '+Math.round(lab.y)+')');
  const del=make('button',{type:'button'},'Quitar');del.onclick=()=>void modifyObject(o=>{o.labels.splice(i,1);});
  row.append(text,del);$('mathLabels').append(row);
 }
}
async function modifyObject(mutator){
 const pg=workingPage(),obj=selectedObject();if(!pg||!obj)return;
 const objects=copy(currentLayer(pg).objects||[]),index=objects.findIndex(o=>o.id===obj.id);
 if(index<0)return;
 mutator(objects[index]);
 try{await writeLayer(objects,currentLayer(pg).visible!==false);editSelectedObject();status('Corrección guardada.');}
 catch(e){status(e.message);}
}
function coordinateValues(geo){
 const fields=[...$('mathCoordinateEditor').querySelectorAll('input')],values={};
 for(const input of fields){
  const v=Number(input.value);if(!input.value.trim()||!Number.isFinite(v)||v<0||v>1400)throw Error('Revise las coordenadas numéricas.');
  values[input.dataset.key]=v;
 }
 if(geo.kind==='circle'){
  const result={...geo,cx:values.cx,cy:values.cy,r:values.r};
  if(result.r<1||result.r>800||result.cx>1000)throw Error('El radio o el centro no son válidos.');
  return result;
 }
 const point=(x,y)=>[clamp(values[x],0,1000),clamp(values[y],0,1400)];
 if(geo.kind==='line'||geo.kind==='polygon')return {...geo,points:geo.points.map((_,i)=>point('p'+i+'x','p'+i+'y'))};
 if(geo.kind==='segments')return {...geo,segments:geo.segments.map((pair,i)=>pair.map((_,j)=>point('s'+i+j+'x','s'+i+j+'y')))};
 throw Error('Forma desconocida.');
}
$('mathMode').addEventListener('change',e=>setEnabled(e.target.checked));
switchInput.addEventListener('change',e=>setEnabled(e.target.checked));
$('mathClose').addEventListener('click',()=>dialog.close());
openButton.addEventListener('click',()=>{document.getElementById('mobileMoreDialog')?.close();dialog.showModal();updateUi();});
$('mathSelectMode').addEventListener('click',()=>{
 selecting=!selecting;dialog.close();updateUi();
 status(selecting?'Toque los trazos originales en la hoja. Repita un toque para deseleccionar.':'Selección terminada.');
});
$('mathClearSelection').addEventListener('click',()=>{clearSelection();refresh();});
$('mathShowLayer').addEventListener('change',async e=>{
 const pg=workingPage();if(!pg)return;
 try{await writeLayer(copy(currentLayer(pg).objects||[]),e.target.checked);}
 catch(err){status(err.message);}
});
$('mathImprove').addEventListener('click',()=>void improve());
$('mathAccept').addEventListener('click',()=>void accept());
$('mathReject').addEventListener('click',()=>{proposal=null;$('mathAccept').disabled=true;$('mathReject').disabled=true;refresh();status('Propuesta descartada.');});
$('mathSavedObjects').addEventListener('change',editSelectedObject);
$('mathSaveEdit').addEventListener('click',()=>{
 const obj=selectedObject();if(!obj)return;
 try{const geo=coordinateValues(obj.geometry);void modifyObject(o=>{o.geometry=geo;});}
 catch(e){status(e.message);}
});
$('mathRemoveObject').addEventListener('click',()=>{
 const pg=workingPage(),obj=selectedObject();if(!pg||!obj)return;
 void writeLayer((currentLayer(pg).objects||[]).filter(o=>o.id!==obj.id),currentLayer(pg).visible!==false)
  .then(()=>{editSelectedObject();status('Mejora eliminada; los trazos originales siguen disponibles.');})
  .catch(e=>status(e.message));
});
$('mathAddLabel').addEventListener('click',()=>{
 const text=$('mathLabel').value.trim(),x=Number($('mathLabelX').value),y=Number($('mathLabelY').value);
 if(!text||text.length>40||!Number.isFinite(x)||!Number.isFinite(y)){status('Escriba una etiqueta y coordenadas válidas.');return;}
 if(!selectedObject()){status('Seleccione primero una figura guardada.');return;}
 void modifyObject(o=>{(o.labels||=[]).push({text,x:clamp(x,0,1000),y:clamp(y,0,1400),size:24});});
});
let lastPageId='';
document.addEventListener('minote:statechange',()=>{const pg=workingPage();if(pg?.id!==lastPageId){lastPageId=pg?.id||'';clearSelection();}
 refresh();});
document.addEventListener('minote:page-rendered',()=>{refresh();});
window.addEventListener('resize',()=>{drawOverlay(workingPage());},{passive:true});
dialog.addEventListener('cancel',()=>{});
updateUi();
window.MiNoteMath={get enabled(){return enabled;},get selecting(){return selecting;},setEnabled};
