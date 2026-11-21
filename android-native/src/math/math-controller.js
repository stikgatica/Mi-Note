/* Mi Note X10 — Matemática automática. Se ejecuta solo tras terminar un trazo.
   Motor de geometría + reconocimiento conservador de números y medidas:
   sin nube, sin modificar tinta fuente, sin trabajo en el hilo de escritura. */
import {AXES,fingerprint,validObject} from './math-geometry.mjs';
import {registerPlugin} from '@capacitor/core';
import {mathematicalLines,normalizeArithmetic,recognizeHybridLine} from './math-hybrid-ocr.mjs';
import {mergeAutomatic} from './math-auto.mjs';
import {DRAW_INTENTIONS} from './math-intention.mjs';
import {compactAutomatic,listObjects,nearDuplicate} from './math-objects.mjs';
import './math-ui.css';

const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const elm=(tag,attrs={},text)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
const svg=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
const copy=v=>JSON.parse(JSON.stringify(v)),clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const get=()=>window.MiNoteMathBridge?.snapshot?.();
const original=()=>window.MiNoteMathBridge;
const layerOf=pg=>pg?.mathLayer||{version:1,axis:'geometry',visible:true,objects:[]};
const valid=pg=>(layerOf(pg).objects||[]).filter(obj=>validObject(obj,pg));
const dialog=elm('dialog',{id:'mathDialog',class:'dialog minote-math-dialog','aria-labelledby':'mathTitle'});
dialog.innerHTML=`
 <div class="dialog-head"><h2 id="mathTitle">Modo Matemática</h2><button type="button" id="mathClose" class="icon-btn" aria-label="Cerrar">✕</button></div>
 <label class="math-switch"><input id="mathMode" type="checkbox"> <strong>Activar Modo Matemática</strong></label>
 <label class="field">Eje<select id="mathAxis"></select></label>
 <p class="math-hint">Mi Note mejora automáticamente figuras y propone texto digital al terminar de escribir en la Huion. El original permanece intacto.</p>
 <section id="mathNumbersControls" hidden>
  <label class="math-switch"><input id="mathAutoDigital" type="checkbox" checked> Convertir automáticamente solo si coinciden ambos reconocedores</label>
  <label class="math-switch"><input id="mathNumbersShowLayer" type="checkbox" checked> Mostrar texto matemático digital</label>
  <div class="math-actions"><button type="button" id="mathDownloadModel">Preparar ML Kit</button>
  <button type="button" id="mathScanNumbers">Reconocer operaciones de esta hoja</button></div>
  <p class="math-hint">Se combinan plantillas locales y ML Kit. No se calculan resultados; si la lectura es dudosa, se puede editar antes de convertir. La tinta manuscrita permanece guardada.</p>
  <div id="mathHybridCandidates" class="math-hybrid-candidates" aria-live="polite"></div>
 </section>
 <section id="mathGeometryControls" hidden>
  <label class="math-switch"><input id="mathShowLayer" type="checkbox" checked> Mostrar capa digital mejorada</label>
  <p class="math-hint">No es necesario seleccionar trazos ni pulsar Mejorar. Los números y medidas solo se digitalizan si el reconocimiento local alcanza una confianza alta; los casos dudosos permanecen manuscritos.</p>
  <button type="button" id="mathScanPage">Analizar también los trazos de esta hoja</button>
  <label class="field">Figura que voy a dibujar
   <select id="mathIntention"></select>
  </label>
  <p class="math-hint">Seleccione una figura antes de dibujar. La corrección automática respetará esa intención y mantendrá intacta la tinta original.</p>
 </section>
 <details id="mathRecognizedDetails"><summary>Objetos digitales (administrar)</summary>
  <label class="field">Figuras reconocidas en esta hoja
   <select id="mathSavedObjects"></select>
  </label>
  <p id="mathObjectCount" class="math-hint"></p>
  <div class="math-actions"><button type="button" id="mathFindObject">Resaltar figura seleccionada</button><button type="button" id="mathCleanDuplicates">Limpiar reconocimientos repetidos</button></div>
  <details id="mathEditDetails"><summary>Corregir un reconocimiento</summary>
   <div id="mathCoordinateEditor" class="math-edit-fields"></div>
   <div class="math-actions"><button type="button" id="mathSaveEdit">Guardar corrección</button><button type="button" id="mathRemoveObject">Volver al original</button></div>
   <label class="field">Etiqueta adicional (opcional)<input type="text" id="mathLabel" maxlength="40" placeholder="Ej. 7 cm o 45°"></label>
   <div class="math-row"><label>Posición X<input type="number" id="mathLabelX" min="0" max="1000" value="500"></label>
   <label>Posición Y<input type="number" id="mathLabelY" min="0" max="1400" value="700"></label></div>
   <button type="button" id="mathAddLabel">Añadir etiqueta</button>
   <div id="mathLabels"></div>
  </details>
  </details>
 <p id="mathStatus" class="math-hint" role="status" aria-live="polite"></p>
`;
document.body.append(dialog);
const menu=document.querySelector('#mobileMoreDialog .mobile-actions-list');
const entry=elm('div',{class:'math-menu-entry'}),menuSwitch=elm('label',{class:'math-switch'});
const menuToggle=elm('input',{id:'mathMenuToggle',type:'checkbox'});
menuSwitch.append(menuToggle,document.createTextNode(' Modo Matemática'));
const settings=elm('button',{id:'mathOpenPanel',type:'button'},'Configurar');
entry.append(menuSwitch,settings);menu?.prepend(entry);
const paper=$('paper'),shell=document.querySelector('.paper-shell');
if(!paper||!shell)throw Error('No se encontró la hoja de Mi Note.');
const overlay=svg('svg',{id:'mathOverlay',preserveAspectRatio:'none','aria-label':'Figuras y números mejorados'});
overlay.style.pointerEvents='none';shell.style.position='relative';paper.after(overlay);
for(const axis of AXES)$('mathAxis').append(elm('option',{value:axis.id,...(axis.ready?{}:{disabled:'disabled'})},axis.label+(axis.ready?'':' (próximamente)')));
$('mathAxis').value='geometry';
for(const shape of DRAW_INTENTIONS)$('mathIntention').append(elm('option',{value:shape.id},shape.label));
$('mathIntention').value='auto';

let enabled=false,worker=null,sequence=0,scanTimer=0,scanRunning=false,scanAgain=false,lastPage='';
const mlkitMath=registerPlugin('MiNoteCalendar');
const mathSuggestions=new Map();
let hybridScanBusy=false,hybridScanSerial=0;
const numbersSelected=()=>$('mathAxis').value==='numbers';
const intentCutoffs=new Map();
let intentionEpoch=0;
const shapePreference='minote_math_intention_v047';
let intendedShape='auto';
try{
 const saved=localStorage.getItem(shapePreference);
 if(DRAW_INTENTIONS.some(s=>s.id===saved))intendedShape=saved;
}catch{}
$('mathIntention').value=intendedShape;
const quickDialog=elm('dialog',{id:'mathShapeDialog',class:'dialog minote-shape-dialog','aria-label':'Elegir figura geométrica'});
quickDialog.innerHTML='<div class="dialog-head"><h2>Figura que dibujaré</h2><button type="button" class="icon-btn" id="mathShapeClose" aria-label="Cerrar">✕</button></div><p class="math-hint">Elija primero la figura. Al levantar el lápiz se corregirá automáticamente, sin seleccionar trazos.</p><div class="math-shape-grid" id="mathShapeGrid"></div>';
document.body.append(quickDialog);
const quickButton=elm('button',{type:'button',id:'mathShapeShortcut','aria-label':'Elegir figura matemática',title:'Elegir figura matemática'},'◯');
const floatingToolbar=$('tvBoardToolbar');
if(floatingToolbar){
 const before=$('tvBoardMore');
 if(before)before.before(quickButton);else floatingToolbar.append(quickButton);
}else{
 const fallback=elm('div',{class:'math-quick-floating'});
 fallback.append(quickButton);document.body.append(fallback);
}
function updateQuickShape(){
 const current=DRAW_INTENTIONS.find(x=>x.id===intendedShape)||DRAW_INTENTIONS[0];
 const icons={auto:'◇',circle:'◯',square:'□',rectangle:'▭',triangle:'△',rhombus:'◇',
  parallelogram:'▱',trapezoid:'⏢',pentagon:'⬠',hexagon:'⬡',line:'╱',polygon:'⬡'};
 quickButton.textContent=icons[current.id]||'◇';
 quickButton.title='Figura: '+current.label;
 quickButton.setAttribute('aria-label','Figura: '+current.label+'. Cambiar');
 quickButton.hidden=!enabled;
 for(const button of quickDialog.querySelectorAll('[data-math-shape]')){
  button.classList.toggle('selected',button.dataset.mathShape===intendedShape);
 }
}
for(const shape of DRAW_INTENTIONS){
 const button=elm('button',{type:'button','data-math-shape':shape.id},shape.label);
 button.addEventListener('click',()=>{
  $('mathIntention').value=shape.id;
  $('mathIntention').dispatchEvent(new Event('change'));
  quickDialog.close();
 });
 $('mathShapeGrid').append(button);
}
quickButton.addEventListener('click',()=>{updateQuickShape();quickDialog.showModal();});
$('mathShapeClose').addEventListener('click',()=>quickDialog.close());
quickDialog.addEventListener('click',e=>{if(e.target===quickDialog)quickDialog.close();});
let cachedPage='',hiddenIds=new Set(),lastStatus='';
const jobs=new Map();
const tell=s=>{lastStatus=s;$('mathStatus').textContent=s;};
function activeObjects(pg){return valid(pg);}
function syncHidden(pg){
 cachedPage=pg?.id||'';hiddenIds=new Set();
 if(!enabled||layerOf(pg).visible===false)return;
 for(const item of activeObjects(pg))for(const source of item.sources||[])hiddenIds.add(source.id);
}
window.MiNoteMathVisibility=(pageId,id)=>enabled&&pageId===cachedPage&&hiddenIds.has(id);
function shapeNode(g,style){
 const attributes={fill:'none',stroke:style?.color||'#000000','stroke-width':Math.max(1,Number(style?.width)||3),
  'stroke-linecap':'round','stroke-linejoin':'round'};
 if(g?.kind==='line')return svg('line',{...attributes,x1:g.points[0][0],y1:g.points[0][1],x2:g.points[1][0],y2:g.points[1][1]});
 if(g?.kind==='polygon')return svg('polygon',{...attributes,points:g.points.map(p=>p.join(',')).join(' ')});
 if(g?.kind==='circle')return svg('circle',{...attributes,cx:g.cx,cy:g.cy,r:g.r});
 if(g?.kind==='segments'){
  const group=svg('g');
  for(const [a,b] of g.segments||[])group.append(svg('line',{...attributes,x1:a[0],y1:a[1],x2:b[0],y2:b[1]}));
  return group;
 }
 return null;
}
function renderOverlay(pg){
 overlay.replaceChildren();
 const visible=enabled&&layerOf(pg).visible!==false;
 overlay.hidden=!visible;
 const rotated=(pg?.orientation||'landscape-cw')==='landscape-cw';
 overlay.setAttribute('viewBox',rotated?'0 0 1400 1000':'0 0 1000 1400');
 if(!visible||!pg)return;
 const group=svg('g',rotated?{transform:'translate(1400 0) rotate(90)'}:{});
 for(const object of activeObjects(pg)){
  const g=object.geometry;
  if(g?.kind==='text'){
   const label=svg('text',{x:clamp(g.x,0,1000),y:clamp(g.y,0,1400),'text-anchor':'middle',
    'font-family':'sans-serif','font-size':Math.max(15,Number(g.size)||28),
    fill:object.style?.color||'#000000'});
   label.textContent=g.text;group.append(label);
  }else{const node=shapeNode(g,object.style);if(node)group.append(node);}
  if(highlightId===object.id){
   const node=shapeNode(g,{color:'#e65b20',width:Math.max(5,Number(object.style?.width)||3)+5});
   if(node)group.append(node);
  }
  for(const lab of object.labels||[]){
   if(!lab?.text)continue;
   const label=svg('text',{x:clamp(lab.x,0,1000),y:clamp(lab.y,0,1400),
    fill:object.style?.color||'#000000','font-size':Math.max(14,Number(lab.size)||24),
    'font-family':'sans-serif','text-anchor':'middle'});
   label.textContent=lab.text;group.append(label);
  }
 }
 overlay.append(group);
}
let mathModelReady=false;
const rejectedMath=new Set();
const activeMathPage=()=>get()?.id||'';
function mathProposalKey(pageId,strokeIds){
 return pageId+':'+strokeIds.join('|');
}
function storedMathObject(pg,ids){
 const key=new Set(ids);
 return (layerOf(pg).objects||[]).some(o=>o.geometry?.kind==='text'&&
  (o.sources||[]).length===ids.length&&o.sources.every(x=>key.has(x.id)));
}
function renderMathSuggestions(){
 const root=$('mathHybridCandidates');
 root.replaceChildren();
 if(!mathSuggestions.size){
  root.append(elm('p',{class:'math-hint'},'Escriba un número u operación y deje de escribir un instante. Los resultados dudosos se mostrarán aquí.'));
  return;
 }
 for(const [key,proposal] of mathSuggestions){
  if(proposal.pageId!==activeMathPage())continue;
  const item=elm('div',{class:'math-hybrid-item'});
  item.append(elm('small',{},proposal.autoAccept?'Coincidencia de dos reconocedores':
    proposal.source==='mlkit-es'?'ML Kit · confirmar lectura':'Plantillas locales · confirmar lectura'));
  const field=elm('input',{type:'text',maxlength:'60',value:proposal.text,'aria-label':'Editar operación matemática'});
  field.value=proposal.text;
  if((proposal.alternatives||[]).length>1){
   const label=elm('label',{class:'math-hint'},'Otras lecturas posibles (revise con su escritura): ');
   const selector=elm('select',{'aria-label':'Alternativas de lectura matemática'});
   for(const text of proposal.alternatives)selector.append(elm('option',{value:text},text));
   selector.value=proposal.text;
   selector.addEventListener('change',()=>{field.value=selector.value;});
   label.append(selector);item.append(label);
  }
  if(proposal.uncertainDigits){
   item.append(elm('small',{},'Dígito final dudoso: compruebe si escribió 0 u 8. Mi Note no decidirá automáticamente.'));
  }
  const buttons=elm('div',{class:'math-actions'});
  const confirm=elm('button',{type:'button'},'Convertir a texto');
  const discard=elm('button',{type:'button',class:'subtle'},'Conservar manuscrito');
  confirm.addEventListener('click',()=>{
   const parsed=normalizeArithmetic(field.value);
   if(!parsed){tell('Operación no válida. Revise números, comas y signos + − × ÷ =.');return;}
   void acceptMath({...proposal,text:parsed.text,geometry:{...proposal.geometry,text:parsed.text}})
    .then(()=>{mathSuggestions.delete(key);renderMathSuggestions();})
    .catch(e=>tell(e.message));
  });
  discard.addEventListener('click',()=>{rejectedMath.add(key);mathSuggestions.delete(key);renderMathSuggestions();});
  buttons.append(confirm,discard);item.append(field,buttons);root.append(item);
 }
}
async function acceptMath(proposal){
 const pg=get();if(!pg||pg.id!==proposal.pageId||!enabled||!numbersSelected())
  throw Error('Abra la página original en el modo Números y operaciones.');
 const ids=new Set(proposal.strokeIds),selected=(pg.strokes||[]).filter(stroke=>ids.has(stroke.id));
 if(selected.length!==ids.size)throw Error('La escritura cambió; vuelva a reconocerla.');
 if(selected.some(stroke=>fingerprint(stroke)!==proposal.fingerprints[stroke.id]))
  throw Error('Los trazos cambiaron desde su lectura. Vuelva a reconocer.');
 const sources=selected.map(stroke=>({id:stroke.id,signature:fingerprint(stroke)}));
 if(storedMathObject(pg,proposal.strokeIds))return false;
 const candidate={type:'text',label:'Texto matemático',geometry:proposal.geometry,
  style:proposal.style,sources,automatic:true};
 const prior=layerOf(pg).objects||[];
 const merge=mergeAutomatic(prior,candidate);
 if(!merge)throw Error('Hay una corrección manual sobre esos trazos; no se reemplazará.');
 const object={id:globalThis.crypto?.randomUUID?.()||'math-'+Date.now()+'-'+(++sequence),
  accepted:true,automatic:true,type:'text',label:'Texto matemático',
  geometry:copy(candidate.geometry),style:copy(candidate.style),sources:copy(candidate.sources),labels:[]};
 await saveLayer([...merge.objects,object],layerOf(pg).visible!==false);
 tell('Texto digital: '+proposal.geometry.text+'. Los trazos originales están conservados; puede volver al manuscrito.');
 return true;
}
async function scanHybridMath(all=false){
 if(!enabled||!numbersSelected()||hybridScanBusy)return;
 const pg=get();if(!pg?.strokes?.length)return;
 hybridScanBusy=true;const serial=++hybridScanSerial,epoch=intentionEpoch;
 try{
  const lines=mathematicalLines(pg.strokes,{maxStrokes:all?160:85});
  const lastId=pg.strokes.at(-1)?.id;
  const active=all?lines:lines.filter(line=>line.strokeIds.includes(lastId));
  let found=0;
  for(const line of active.slice(all?0:-1).slice(0,18)){
   if(serial!==hybridScanSerial||epoch!==intentionEpoch||activeMathPage()!==pg.id)break;
   if(line.strokeIds.length>80||storedMathObject(get(),line.strokeIds))continue;
   const key=mathProposalKey(pg.id,line.strokeIds);
   if(rejectedMath.has(key)||(!all&&mathSuggestions.has(key)))continue;
   const recognized=await recognizeHybridLine(line.strokes,mathModelReady?
    args=>mlkitMath.recognize(args):null);
   if(!recognized)continue;
   const fingerprints=Object.fromEntries(line.strokes.map(stroke=>[stroke.id,fingerprint(stroke)]));
   const proposal={...recognized,pageId:pg.id,fingerprints};
   if(recognized.autoAccept&&$('mathAutoDigital').checked){
    try{await acceptMath(proposal);found++;continue;}
    catch(error){tell('Lectura por confirmar: '+error.message);}
   }
   mathSuggestions.set(key,proposal);found++;
  }
  renderMathSuggestions();
  if(all){
   const pending=[...mathSuggestions.values()].filter(x=>x.pageId===pg.id).length;
   tell('Análisis matemático: '+pending+' propuesta(s) pendientes de revisión ('+found+
    ' lectura(s) obtenidas en este análisis). Los trazos originales permanecen intactos.');
  }
 }catch(error){tell('Reconocimiento matemático: '+(error.message||String(error)));}
 finally{hybridScanBusy=false;}
}
async function checkMathModel(){
 try{
  const status=await mlkitMath.modelStatus();
  mathModelReady=!!status?.downloaded;
  $('mathDownloadModel').textContent=mathModelReady?'ML Kit preparado ✓':'Descargar modelo de escritura ML Kit';
 }catch{
  mathModelReady=false;
  $('mathDownloadModel').textContent='ML Kit no disponible (usar plantillas)';
 }
}
function selectedObject(){
 const pg=get(),id=$('mathSavedObjects').value;
 return (layerOf(pg).objects||[]).find(obj=>obj.id===id)||null;
}
function updateList(pg){
 const select=$('mathSavedObjects'),keep=select.value;
 const objects=layerOf(pg).objects||[];
 const records=listObjects(objects,obj=>validObject(obj,pg));
 select.replaceChildren(elm('option',{value:''},records.length?'Seleccione una figura…':'Ninguna figura reconocida'));
 for(const item of records){
  select.append(elm('option',{value:item.id},item.label));
 }
 if([...select.options].some(x=>x.value===keep))select.value=keep;
 else select.value='';
 $('mathObjectCount').textContent=records.length+' reconocimiento(s) válido(s). Se muestra su ubicación para identificar cada uno.';
 $('mathRecognizedDetails').querySelector('summary').textContent='Figuras reconocidas ('+records.length+') · administrar';
 $('mathFindObject').disabled=!select.value;
 $('mathCleanDuplicates').disabled=compactAutomatic(objects).length===objects.length;
}
let highlightId='',highlightTimer=null;
function highlightSelected(){
 const obj=selectedObject(),pg=get();
 if(!obj||!pg)return;
 highlightId=obj.id;renderOverlay(pg);
 clearTimeout(highlightTimer);
 highlightTimer=setTimeout(()=>{
  highlightId='';const current=get();if(current)renderOverlay(current);
 },2400);
}

let refreshQueued=false;
function refresh(){
 if(refreshQueued)return;
 refreshQueued=true;
 requestAnimationFrame(()=>{
  refreshQueued=false;const pg=get();if(!pg)return;
  syncHidden(pg);renderOverlay(pg);updateList(pg);original()?.repaint?.();
 });
}
async function saveLayer(objects,visible){
 const success=await original()?.saveLayer?.({version:1,axis:'geometry',visible,objects:compactAutomatic(objects)});
 if(!success)throw Error('No se pudo guardar la capa mejorada.');
 refresh();return true;
}
function updateInterface(){
 $('mathMode').checked=enabled;menuToggle.checked=enabled;updateQuickShape();
 $('mathAxis').disabled=!enabled;
 $('mathGeometryControls').hidden=!enabled||numbersSelected();
 $('mathNumbersControls').hidden=!enabled||!numbersSelected();
 $('mathRecognizedDetails').hidden=!enabled;
 $('mathShowLayer').checked=layerOf(get()).visible!==false;
 $('mathNumbersShowLayer').checked=layerOf(get()).visible!==false;
 refresh();
}
function setEnabled(value){
 const previously=enabled;
 enabled=!!value;clearTimeout(scanTimer);intentionEpoch++;
 if(enabled&&!previously){const page=get();if(page)intentCutoffs.set(page.id,page.strokes?.length||0);}
 updateInterface();
 tell(enabled?'Automático activo. Escriba normalmente en la agenda; las mejoras aparecen al terminar cada trazo.':'Modo normal: todos los trazos manuscritos se conservan.');
}
function ensureWorker(){
 if(worker)return worker;
 if(typeof Worker!=='function')throw Error('El dispositivo no admite el reconocedor local.');
 worker=new Worker(new URL('./math-worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{
  const job=jobs.get(data?.id);if(!job)return;jobs.delete(data.id);clearTimeout(job.timer);
  data.error?job.reject(Error(data.error)):job.resolve(data.result);
 };
 worker.onerror=()=>{
  for(const job of jobs.values()){clearTimeout(job.timer);job.reject(Error('Falló el reconocimiento local.'));}
  jobs.clear();worker.terminate();worker=null;
 };
 return worker;
}
function recognize(strokes){
 const service=ensureWorker(),id=++sequence;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{jobs.delete(id);reject(Error('El reconocedor local tardó demasiado.'));},3500);
  jobs.set(id,{resolve,reject,timer});
  service.postMessage({id,action:'automatic',strokes,intention:intendedShape});
 });
}
const sigsMatch=(candidate,pg)=>{
 const byId=new Map((pg?.strokes||[]).map(s=>[s.id,s]));
 return candidate.sources.every(source=>{
  const s=byId.get(source.id);return !!s&&fingerprint(s)===source.signature;
 });
};
async function runOne(pg,strokes){
 if(!enabled||numbersSelected()||!strokes.length)return false;
 const epoch=intentionEpoch;
 const candidate=await recognize(strokes);
 if(!candidate||epoch!==intentionEpoch)return false;
 const current=get();if(!current||current.id!==pg.id||!sigsMatch(candidate,current))return false;
 const previous=layerOf(current).objects||[];
 if(previous.some(o=>nearDuplicate(o,candidate)))return false;
 const merge=mergeAutomatic(previous,candidate);
 if(!merge)return false;
 const obj={id:globalThis.crypto?.randomUUID?.()||'math-'+Date.now()+'-'+sequence,
  accepted:true,automatic:true,type:candidate.type,label:candidate.label,geometry:copy(candidate.geometry),
  sources:copy(candidate.sources),style:copy(candidate.style),labels:[]};
 await saveLayer([...merge.objects,obj],layerOf(current).visible!==false);
 tell(candidate.geometry.kind==='text'?'Medida o número detectado: '+candidate.geometry.text+' (revise si es correcto).':'Figura mejorada automáticamente: '+candidate.label+'.');
 return true;
}
async function scanRecent(all=false){
 if(!enabled)return;
 if(numbersSelected()){await scanHybridMath(all);return;}
 if(scanRunning){scanAgain=true;return;}
 scanRunning=true;
 try{
  const page=get();if(!page?.strokes?.length)return;
  const total=page.strokes.length;
  // Solo copias de ventanas acotadas en el Worker; no analiza durante el trazo.
  const begin=all?Math.max(0,total-150):Math.max(0,total-9);
  const ends=all?Array.from({length:total-begin},(_,i)=>begin+i+1):[total];
  let changed=0;
  for(const end of ends){
   if(!enabled||get()?.id!==page.id)break;
   const current=get();if(!current||current.id!==page.id)break;
   const cutoff=all?0:(intentCutoffs.get(current.id)??0);
   if(end<=cutoff)continue;
   const count=Math.min(end-cutoff,9),window=current.strokes.slice(end-count,end);
   if(await runOne(page,window))changed++;
   if(all&&end%8===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(all)tell('Análisis completado. '+changed+' mejora(s) detectada(s); los originales permanecen intactos.');
 }catch(error){tell('Reconocimiento automático: '+error.message);}
 finally{
  scanRunning=false;
  if(scanAgain){scanAgain=false;scheduleScan();}
 }
}
function scheduleScan(){
 if(!enabled)return;
 clearTimeout(scanTimer);
 scanTimer=setTimeout(()=>void scanRecent(false),numbersSelected()?1300:650);
}
function editFields(){
 const obj=selectedObject(),editor=$('mathCoordinateEditor');editor.replaceChildren();$('mathLabels').replaceChildren();
 if(!obj)return;
 const add=(key,title,value,number=true)=>{
  const row=elm('label',{},title+' '),input=elm('input',number?
   {type:'number',step:'.1',min:0,max:1400,value:Number(value).toFixed(1),'data-key':key}:
   {type:'text',maxlength:40,value:String(value),'data-key':key});
  row.append(input);editor.append(row);
 };
 const g=obj.geometry;
 if(g.kind==='text'){add('text','Número o medida',g.text,false);add('x','X',g.x);add('y','Y',g.y);add('size','Tamaño',g.size);}
 else if(g.kind==='circle'){add('cx','Centro X',g.cx);add('cy','Centro Y',g.cy);add('r','Radio',g.r);}
 else if(g.kind==='line'||g.kind==='polygon')g.points.forEach((p,i)=>{add('p'+i+'x','Vértice '+(i+1)+' X',p[0]);add('p'+i+'y','Vértice '+(i+1)+' Y',p[1]);});
 else if(g.kind==='segments')g.segments.forEach((segment,i)=>segment.forEach((p,j)=>{add('s'+i+j+'x','Arista '+i+' X',p[0]);add('s'+i+j+'y','Arista '+i+' Y',p[1]);}));
 for(let i=0;i<(obj.labels||[]).length;i++){
  const lab=obj.labels[i],row=elm('div',{class:'math-row'});
  const remove=elm('button',{type:'button'},'Quitar');
  remove.addEventListener('click',()=>void mutate(o=>{o.labels.splice(i,1);}));
  row.append(elm('span',{},lab.text),remove);$('mathLabels').append(row);
 }
}
async function mutate(edit){
 const page=get(),o=selectedObject();if(!page||!o)return;
 const list=copy(layerOf(page).objects||[]),target=list.find(x=>x.id===o.id);if(!target)return;
 edit(target);target.automatic=false;
 try{await saveLayer(list,layerOf(page).visible!==false);editFields();tell('Corrección guardada; la escritura original no se modificó.');}
 catch(e){tell(e.message);}
}
function readGeometry(geometry){
 const vals={};
 for(const input of $('mathCoordinateEditor').querySelectorAll('input')){
  if(input.dataset.key==='text'){
    const text=input.value.trim();
    if(!text||text.length>60||(!normalizeArithmetic(text)&&!/^[\dcm°., -]+$/i.test(text)))
     throw Error('Texto matemático o medida inválidos.');
    vals.text=normalizeArithmetic(text)?.text||text;continue;
   }
  if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw Error('Coordenada inválida.');
  vals[input.dataset.key]=Number(input.value);
  if(vals[input.dataset.key]<0||vals[input.dataset.key]>1400)throw Error('Coordenada fuera de la hoja.');
 }
 const result=copy(geometry);
 const p=(x,y)=>[clamp(vals[x],0,1000),clamp(vals[y],0,1400)];
 if(result.kind==='text'){Object.assign(result,{text:vals.text,x:vals.x,y:vals.y,size:clamp(vals.size,12,90)});}
 else if(result.kind==='circle'){Object.assign(result,{cx:vals.cx,cy:vals.cy,r:vals.r});if(result.cx>1000||result.r<1||result.r>800)throw Error('Circunferencia inválida.');}
 else if(result.kind==='line'||result.kind==='polygon')result.points=result.points.map((_,i)=>p('p'+i+'x','p'+i+'y'));
 else if(result.kind==='segments')result.segments=result.segments.map((seg,i)=>seg.map((_,j)=>p('s'+i+j+'x','s'+i+j+'y')));
 return result;
}
$('mathAxis').addEventListener('change',()=>{
 clearTimeout(scanTimer);intentionEpoch++;
 mathSuggestions.clear();renderMathSuggestions();
 const page=get();if(page)intentCutoffs.set(page.id,page.strokes?.length||0);
 updateInterface();
 if(numbersSelected()){
  void checkMathModel();
  tell('Modo números y operaciones activo. Escriba una expresión, espere un instante y confirme las lecturas dudosas.');
 }else tell('Modo geometría activo. Los trazos originales permanecen intactos.');
});
$('mathDownloadModel').addEventListener('click',async()=>{
 const button=$('mathDownloadModel');
 button.disabled=true;tell('Comprobando modelo de escritura ML Kit…');
 try{
  await mlkitMath.downloadModel();mathModelReady=true;
  button.textContent='ML Kit preparado ✓';
  tell('Modelo de escritura preparado. Reconocimiento local disponible sin conexión.');
 }catch(error){tell('Modelo no preparado: '+(error?.message||String(error)));}
 finally{button.disabled=false;}
});
$('mathScanNumbers').addEventListener('click',()=>void scanHybridMath(true));
$('mathNumbersShowLayer').addEventListener('change',async e=>{
 const pg=get();if(!pg)return;
 try{await saveLayer(copy(layerOf(pg).objects||[]),e.target.checked);}
 catch(error){tell(error.message);}
});
renderMathSuggestions();
$('mathMode').addEventListener('change',e=>setEnabled(e.target.checked));
menuToggle.addEventListener('change',e=>setEnabled(e.target.checked));
$('mathClose').addEventListener('click',()=>dialog.close());
settings.addEventListener('click',()=>{$('mobileMoreDialog')?.close();dialog.showModal();updateInterface();});
$('mathShowLayer').addEventListener('change',async e=>{
 const pg=get();if(!pg)return;
 try{await saveLayer(copy(layerOf(pg).objects||[]),e.target.checked);}
 catch(err){tell(err.message);}
});
$('mathIntention').addEventListener('change',event=>{
 intendedShape=event.target.value;
 clearTimeout(scanTimer);intentionEpoch++;
 const current=get();if(current)intentCutoffs.set(current.id,current.strokes?.length||0);
 try{localStorage.setItem(shapePreference,intendedShape);}catch{}
 updateQuickShape();
 tell(intendedShape==='auto'
  ?'Detección automática activada. Se respetan los cuadriláteros irregulares.'
  :'Figura prevista: '+$('mathIntention').selectedOptions[0]?.textContent+
    '. La corrección actuará automáticamente al levantar el lápiz.');
 // No reprocesar tinta de figuras antiguas al cambiar de intención.
});
$('mathScanPage').addEventListener('click',()=>void scanRecent(true));
$('mathSavedObjects').addEventListener('change',()=>{editFields();$('mathFindObject').disabled=!selectedObject();});
$('mathFindObject').addEventListener('click',highlightSelected);
$('mathCleanDuplicates').addEventListener('click',()=>{
 const pg=get();if(!pg)return;
 const objects=layerOf(pg).objects||[],clean=compactAutomatic(objects);
 if(clean.length===objects.length){tell('No hay reconocimientos automáticos duplicados.');return;}
 void saveLayer(clean,layerOf(pg).visible!==false).then(()=>
  tell('Reconocimientos repetidos retirados: '+(objects.length-clean.length)+'. Los trazos originales permanecen intactos.')
 ).catch(e=>tell(e.message));
});
$('mathSaveEdit').addEventListener('click',()=>{
 const obj=selectedObject();if(!obj)return;
 try{const geometry=readGeometry(obj.geometry);void mutate(o=>{o.geometry=geometry;});}
 catch(e){tell(e.message);}
});
$('mathRemoveObject').addEventListener('click',()=>{
 const pg=get(),obj=selectedObject();if(!pg||!obj)return;
 void saveLayer((layerOf(pg).objects||[]).filter(o=>o.id!==obj.id),layerOf(pg).visible!==false)
  .then(()=>{editFields();tell('Reconocimiento retirado. Vuelve a verse la escritura original.');})
  .catch(e=>tell(e.message));
});
$('mathAddLabel').addEventListener('click',()=>{
 const txt=$('mathLabel').value.trim(),x=Number($('mathLabelX').value),y=Number($('mathLabelY').value);
 if(!txt||txt.length>40||!Number.isFinite(x)||!Number.isFinite(y)||!selectedObject()){tell('Seleccione una figura y escriba una etiqueta válida.');return;}
 void mutate(o=>{(o.labels||=[]).push({text:txt,x:clamp(x,0,1000),y:clamp(y,0,1400),size:24});});
});
document.addEventListener('minote:stroke-finished',({detail})=>{
 if(!enabled||!detail?.pageId)return;
 if(detail.pageId!==original()?.activePageId?.())return;
 scheduleScan();
});
document.addEventListener('minote:statechange',()=>{
 const pg=get();if(pg?.id!==lastPage){lastPage=pg?.id||'';clearTimeout(scanTimer);mathSuggestions.clear();renderMathSuggestions();}
 refresh();
});
document.addEventListener('minote:page-rendered',refresh);
window.addEventListener('minote:changed',()=>{if(enabled)refresh();});
window.addEventListener('resize',refresh,{passive:true});
updateInterface();
window.MiNoteMath={get enabled(){return enabled;},setEnabled};
