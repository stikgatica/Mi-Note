/* Mi Note X10 — Matemática Profesional. Se ejecuta solo tras terminar un trazo.
   Motor unificado (DSP + Símbolos + Estructural 2D + Geometría contextual + Datos/Gráficos + Personalización):
   sin nube, sin modificar tinta fuente, sin trabajo en el hilo de escritura y con aislamiento de fallos. */
import {AXES,fingerprint,validObject} from './math-geometry.mjs';
import {registerPlugin} from '@capacitor/core';
import {mathematicalLines,normalizeArithmetic,recognizeHybridLine,formatMathDisplay,canAutoConvertMath} from './math-hybrid-ocr.mjs';
import {mergeAutomatic} from './math-auto.mjs';
import {DRAW_INTENTIONS} from './math-intention.mjs';
import {compactAutomatic,listObjects,nearDuplicate} from './math-objects.mjs';
import {findCircleMeasurements,chooseCircleLabel} from './math-circle-measurements.mjs';
import {recognizeInk} from './math-ink-ocr.mjs';
import {sampledMathStrokes} from './math-hybrid-ocr.mjs';
import {toReadingStrokes,readingGeometryToPage,uprightTextAngle} from '../ink-orientation.mjs';
import {MATH_CATEGORIES,INTERVENTION_LEVELS,runMathPipeline} from './math-pipeline.mjs';
import {createUserProfile,resetUserProfile,recordUserCorrection,serializeUserProfile,deserializeUserProfile} from './math-personalization.mjs';
import {createMathLabUI} from './math-lab.js';
import './math-ui.css';
import './math-lab.css';

export const PRO_AXES=Object.freeze([
 {id:'auto',label:'Automático (inteligente)',ready:true},
 {id:'numbers',label:'Números y operaciones',ready:true},
 {id:'algebra',label:'Álgebra y funciones',ready:true},
 {id:'geometry',label:'Geometría y medición',ready:true},
 {id:'data',label:'Datos y probabilidades',ready:true}
]);
export const PRO_INTERVENTION_OPTIONS=Object.freeze([
 {id:'original',label:'Original (conservar trazos manuscritos)'},
 {id:'assisted',label:'Asistido (sugerencias editables)'},
 {id:'smart',label:'Inteligente (alta confianza automática)'},
 {id:'digital',label:'Digital (objetos editables · reversión 1 clic)'}
]);

const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const elm=(tag,attrs={},text)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
const svg=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
const copy=v=>JSON.parse(JSON.stringify(v)),clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const get=()=>window.MiNoteMathBridge?.snapshot?.();
const original=()=>window.MiNoteMathBridge;
const layerOf=pg=>pg?.mathLayer||{version:1,axis:'auto',visible:true,objects:[]};
const valid=pg=>(layerOf(pg).objects||[]).filter(obj=>validObject(obj,pg));

const PROFILE_KEY='minote_math_profile_v1';
const CATEGORY_KEY='minote_math_category_v1';
const INTERVENTION_KEY='minote_math_intervention_v1';

function loadUserProfile(){
 try{
  const raw=localStorage.getItem(PROFILE_KEY);
  return raw?deserializeUserProfile(raw):createUserProfile();
 }catch{return createUserProfile();}
}
function saveUserProfile(next){
 const safe=createUserProfile(next||{});
 try{localStorage.setItem(PROFILE_KEY,serializeUserProfile(safe));}catch{}
 return safe;
}

const dialog=elm('dialog',{id:'mathDialog',class:'dialog minote-math-dialog','aria-labelledby':'mathTitle'});
dialog.innerHTML=`
 <div class="dialog-head"><h2 id="mathTitle">Modo Matemática Profesional</h2><button type="button" id="mathClose" class="icon-btn" aria-label="Cerrar">✕</button></div>
 <label class="math-switch"><input id="mathMode" type="checkbox"> <strong>Activar Modo Matemática</strong></label>
 <label class="field">Categoría matemática<select id="mathAxis"></select></label>
 <label class="field">Nivel de intervención<select id="mathInterventionLevel"></select></label>
 <p class="math-hint">Mi Note reconoce números, álgebra 2D, geometría contextual y datos/gráficos en segundo plano. La tinta original siempre permanece intacta y reversible en 1 clic.</p>
 <div class="math-actions">
  <button type="button" id="mathOpenLab">Laboratorio y calibración personal</button>
  <button type="button" id="mathRevertLast" class="subtle">Deshacer último objeto digital</button>
 </div>
 <div id="mathPipelineCandidates" class="math-hybrid-candidates" aria-live="polite"></div>
 <section id="mathNumbersControls" hidden>
  <label class="math-switch"><input id="mathAutoDigital" type="checkbox" checked> Convertir automáticamente números y operaciones reconocidas</label>
  <label class="math-switch"><input id="mathNumbersShowLayer" type="checkbox" checked> Mostrar texto matemático digital</label>
  <div class="math-actions"><button type="button" id="mathDownloadModel">Preparar ML Kit</button>
  <button type="button" id="mathScanNumbers">Reconocer operaciones de esta hoja</button></div>
  <p class="math-hint">Con el selector activo, las operaciones reconocidas se convierten tras una pausa, incluso si ML Kit omite el signo igual. Las lecturas dudosas entre 0 y 8 requieren revisión. La tinta original se conserva y no se calculan resultados.</p>
  <div id="mathHybridCandidates" class="math-hybrid-candidates" aria-live="polite"></div>
 </section>
 <section id="mathGeometryControls" hidden>
  <label class="math-switch"><input id="mathShowLayer" type="checkbox" checked> Mostrar capa digital mejorada</label>
  <p class="math-hint">No es necesario seleccionar trazos ni pulsar Mejorar. Los números y medidas solo se digitalizan si el reconocimiento local alcanza una confianza alta; los casos dudosos permanecen manuscritos.</p>
  <button type="button" id="mathScanPage">Analizar también los trazos de esta hoja</button>
  <p class="math-hint">Radios y diámetros: reconoce segmentos que pasan por el centro o unen el centro con el borde, endereza el trazo y convierte medidas manuscritas como 7 cm o 9 cm en texto digital. Si la medida no es clara, mantiene la escritura.</p>
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

// Activar las 5 categorías profesionales (todas ready: true)
for(const axis of PRO_AXES)$('mathAxis').append(elm('option',{value:axis.id},axis.label));
for(const level of PRO_INTERVENTION_OPTIONS)$('mathInterventionLevel').append(elm('option',{value:level.id},level.label));

let savedCategory='auto',savedIntervention='smart';
try{
 const c=localStorage.getItem(CATEGORY_KEY);
 if(MATH_CATEGORIES.includes(c))savedCategory=c;
 const lv=localStorage.getItem(INTERVENTION_KEY);
 if(INTERVENTION_LEVELS.includes(lv))savedIntervention=lv;
}catch{}
$('mathAxis').value=savedCategory;
$('mathInterventionLevel').value=savedIntervention;

for(const shape of DRAW_INTENTIONS)$('mathIntention').append(elm('option',{value:shape.id},shape.label));
$('mathIntention').value='auto';

let enabled=false,worker=null,sequence=0,scanTimer=0,scanRunning=false,scanAgain=false,lastPage='';
let circleScanRunning=false,pipelineEpoch=0;
const mlkitMath=registerPlugin('MiNoteCalendar');
const mathSuggestions=new Map();
const pipelineProposals=new Map();
let hybridScanBusy=false,hybridScanSerial=0;
const activeCategory=()=>MATH_CATEGORIES.includes($('mathAxis').value)?$('mathAxis').value:'auto';
const activeInterventionLevel=()=>INTERVENTION_LEVELS.includes($('mathInterventionLevel').value)?$('mathInterventionLevel').value:'smart';
const numbersSelected=()=>activeCategory()==='numbers';
const geometrySelected=()=>activeCategory()==='geometry';
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
quickDialog.innerHTML='<div class="dialog-head"><h2>Figura que dibujaré</h2><button type="button" id="mathShapeClose" class="icon-btn" aria-label="Cerrar">✕</button></div><p class="math-hint">Elija primero la figura. Al levantar el lápiz se corregirá automáticamente, sin seleccionar trazos.</p><div class="math-shape-grid" id="mathShapeGrid"></div>';
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
 if(g?.kind==='line'||g?.kind==='segment')return svg('line',{...attributes,x1:g.points[0][0],y1:g.points[0][1],x2:g.points[1][0],y2:g.points[1][1]});
 if(g?.kind==='polygon'||Array.isArray(g?.points)&&g.points.length>=3)
  return svg('polygon',{...attributes,points:g.points.map(p=>p.join(',')).join(' ')});
 if(g?.kind==='circle')return svg('circle',{...attributes,cx:g.cx,cy:g.cy,r:g.r});
 if(g?.kind==='ellipse')return svg('ellipse',{...attributes,cx:g.cx,cy:g.cy,rx:g.rx,ry:g.ry,
  ...(Number.isFinite(g.angleDeg)?{transform:`rotate(${g.angleDeg} ${g.cx} ${g.cy})`}:{})});
 if(g?.kind==='segments'){
  const group=svg('g');
  for(const [a,b] of g.segments||[])group.append(svg('line',{...attributes,x1:a[0],y1:a[1],x2:b[0],y2:b[1]}));
  return group;
 }
 return null;
}

function renderDataStructureNode(structure,style,upright){
 if(!structure)return null;
 const group=svg('g');
 const attrs={fill:'none',stroke:style?.color||'#000000','stroke-width':Math.max(1.5,Number(style?.width)||2.2)};
 if((structure.kind==='table'||structure.kind==='frequency_table')&&Array.isArray(structure.rowBoundaries)&&Array.isArray(structure.colBoundaries)){
  const xs=structure.colBoundaries,ys=structure.rowBoundaries;
  for(const y of ys)group.append(svg('line',{...attrs,x1:xs[0],y1:y,x2:xs.at(-1),y2:y}));
  for(const x of xs)group.append(svg('line',{...attrs,x1:x,y1:ys[0],x2:x,y2:ys.at(-1)}));
  for(const row of structure.cells||[]){
   for(const cell of row){
    if(!cell?.writtenText)continue;
    const cx=(cell.bounds.minX+cell.bounds.maxX)/2,cy=(cell.bounds.minY+cell.bounds.maxY)/2;
    const t=svg('text',{...upright(cx,cy),x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'central',
     'font-family':'sans-serif','font-size':20,fill:style?.color||'#000000'});
    t.textContent=cell.writtenText;group.append(t);
   }
  }
  return group;
 }
 return null;
}

function renderOverlay(pg){
 overlay.replaceChildren();
 const visible=enabled&&layerOf(pg).visible!==false;
 overlay.hidden=!visible;
 const mode=pg?.orientation||'landscape-cw';
 const rotated=mode==='landscape-cw'||mode==='landscape-ccw';
 overlay.setAttribute('viewBox',rotated?'0 0 1400 1000':'0 0 1000 1400');
 if(!visible||!pg)return;
 const group=svg('g',mode==='landscape-cw'?{transform:'translate(1400 0) rotate(90)'}:
  mode==='landscape-ccw'?{transform:'translate(0 1000) rotate(-90)'}:{});
 // La hoja y las figuras rotan juntas; solo la escritura digital se endereza.
 const angle=uprightTextAngle(mode);
 const upright=(x,y)=>angle?{transform:`rotate(${angle} ${x} ${y})`}:{};
 for(const object of activeObjects(pg)){
  const g=object.geometry;
  if(object.domain==='data'&&object.structure){
   const dataNode=renderDataStructureNode(object.structure,object.style,upright);
   if(dataNode)group.append(dataNode);
  }else if(g?.kind==='text'){
   // Igualar la altura y anchura del texto digital al manuscrito real.
   const size=Math.max(15,Number(g.size)||28);
   const inkWidth=Number(g.inkWidth);
   const fitted=Number.isFinite(inkWidth)&&inkWidth>15&&String(g.text||'').length>=2;
   const label=svg('text',{...upright(clamp(g.x,0,1000),clamp(g.y,0,1400)),
    x:clamp(g.x,0,1000),y:clamp(g.y,0,1400),'text-anchor':'middle',
    'font-family':'sans-serif','font-size':size,
    ...(fitted?{'textLength':inkWidth,'lengthAdjust':'spacingAndGlyphs'}:{}),
    fill:object.style?.color||'#000000'});
   label.textContent=formatMathDisplay(g.text);
   if(object.domain==='math'&&object.plainText)label.textContent=object.plainText;
   group.append(label);
  }else{const node=shapeNode(g,object.style);if(node)group.append(node);}
  if(highlightId===object.id){
   const node=shapeNode(g,{color:'#e65b20',width:Math.max(5,Number(object.style?.width)||3)+5});
   if(node)group.append(node);
  }
  for(const lab of object.labels||[]){
   if(!lab?.text)continue;
   const label=svg('text',{...upright(clamp(lab.x,0,1000),clamp(lab.y,0,1400)),x:clamp(lab.x,0,1000),y:clamp(lab.y,0,1400),
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

function renderPipelineCandidates(){
 const root=$('mathPipelineCandidates');
 if(!root)return;
 root.replaceChildren();
 for(const [key,entryItem] of pipelineProposals){
  if(entryItem.pageId!==activeMathPage())continue;
  const {result,strokes}=entryItem;
  const winner=result?.winner;
  if(!winner)continue;
  const item=elm('div',{class:'math-hybrid-item'});
  const conf=result.confidence||{score:0,level:'low'};
  const badge=elm('span',{class:`math-conf-pill math-conf-${conf.level||'low'}`},
   `${winner.domain} · ${Math.round((conf.score||0)*100)}% (${conf.level})`);
  const head=elm('div',{class:'math-row'});
  head.append(elm('strong',{},winner.label||winner.plainText||winner.kind||'Propuesta'),badge);
  item.append(head);

  const allOptions=[winner,...(result.alternatives||[])];
  let chosenIndex=0;
  if(allOptions.length>1){
   const lbl=elm('label',{class:'math-hint'},'Alternativas detectadas: ');
   const sel=elm('select',{'aria-label':'Seleccionar alternativa matemática'});
   allOptions.forEach((opt,i)=>{
    const txt=opt.plainText||opt.label||opt.kind||`Opción ${i+1}`;
    const sc=Math.round(((opt.confidence?.score??opt.rawScore??0))*100);
    sel.append(elm('option',{value:String(i)},`${txt} (${sc}%)`));
   });
   sel.addEventListener('change',()=>{chosenIndex=Number(sel.value)||0;});
   lbl.append(sel);item.append(lbl);
  }

  const actions=elm('div',{class:'math-actions'});
  const applyBtn=elm('button',{type:'button'},'Aplicar objeto digital');
  const keepBtn=elm('button',{type:'button',class:'subtle'},'Conservar manuscrito');
  applyBtn.addEventListener('click',async()=>{
   try{
    const chosen=allOptions[chosenIndex]||winner;
    if(chosen!==winner&&chosen.plainText&&winner.plainText){
     saveUserProfile(recordUserCorrection(loadUserProfile(),{
      predicted:winner.plainText,actual:chosen.plainText,strokes,category:activeCategory()
     }));
    }
    await acceptPipelineWinner(entryItem.pageId,chosen,strokes,result.confidence);
    pipelineProposals.delete(key);
    renderPipelineCandidates();
   }catch(err){tell(err?.message||'No se pudo aplicar la propuesta.');}
  });
  keepBtn.addEventListener('click',()=>{
   pipelineProposals.delete(key);
   renderPipelineCandidates();
   tell('Escritura manuscrita conservada intacta.');
  });
  actions.append(applyBtn,keepBtn);
  item.append(actions);
  root.append(item);
 }
}

async function acceptPipelineWinner(pageId,winner,strokes,confidence){
 const pg=get();
 if(!pg||pg.id!==pageId)throw Error('La página activa cambió.');
 const sources=strokes.map(s=>({id:s.id,signature:fingerprint(s)}));
 if(!sigsMatch({sources},pg))throw Error('La tinta cambió. Vuelva a analizar.');
 const prior=layerOf(pg).objects||[];
 const winnerGeometry=winner.domain==='math'&&winner.geometry?.kind==='text'?readingGeometryToPage(winner.geometry,pg.orientation||'landscape-cw'):winner.geometry;
 const geometry=winnerGeometry||{kind:'text',text:winner.plainText||winner.label||'',x:500,y:700,size:28};
 const candidate={
  type:winner.type||winner.kind||winner.domain,
  label:winner.label||winner.plainText||'Objeto matemático',
  domain:winner.domain,
  geometry:copy(geometry),
  style:{color:strokes[0]?.color||'#000000',width:Number(strokes[0]?.width)||2.5},
  sources,
  automatic:true
 };
 const merge=mergeAutomatic(prior,candidate);
 if(!merge)return false;
 const obj={
  id:globalThis.crypto?.randomUUID?.()||'math-'+Date.now()+'-'+(++sequence),
  accepted:true,
  automatic:true,
  revertable:true,
  domain:winner.domain,
  type:candidate.type,
  label:candidate.label,
  geometry:candidate.geometry,
  style:candidate.style,
  sources:copy(sources),
  labels:[],
  confidence,
  ...(winner.domain==='math'?{plainText:winner.plainText,latex:winner.latex,mathml:winner.mathml,ast:winner.ast,preservedAsWritten:true}:{}),
  ...(winner.domain==='data'?{structure:winner.structure,editableModel:winner.editableModel,onlyWrittenDataPreserved:true}:{})
 };
 await saveLayer([...merge.objects,obj],layerOf(pg).visible!==false);
 tell('Objeto digital aplicado: '+(obj.plainText||obj.label)+'. Trazos originales conservados (reversible en 1 clic).');
 return true;
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
  const field=elm('input',{type:'text',maxlength:'60',value:formatMathDisplay(proposal.text),'aria-label':'Editar operación matemática'});
  field.value=formatMathDisplay(proposal.text);
  if((proposal.alternatives||[]).length>1){
   const label=elm('label',{class:'math-hint'},'Otras lecturas posibles (revise con su escritura): ');
   const selector=elm('select',{'aria-label':'Alternativas de lectura matemática'});
   for(const text of proposal.alternatives)selector.append(elm('option',{value:text},formatMathDisplay(text)));
   selector.value=proposal.text;
   selector.addEventListener('change',()=>{field.value=formatMathDisplay(selector.value);});
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
   if(parsed.text!==proposal.text){
    saveUserProfile(recordUserCorrection(loadUserProfile(),{
     predicted:proposal.text,actual:parsed.text,category:'numbers'
    }));
   }
   void acceptMath({...proposal,text:parsed.text,geometry:{...proposal.geometry,text:formatMathDisplay(parsed.text)}})
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
 const candidate={type:'text',label:'Texto matemático',geometry:{...proposal.geometry,text:formatMathDisplay(proposal.geometry.text)},
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
// Numbers now run through the professional pipeline first. Legacy OCR remains a fallback.
async function scanHybridMath(all=false){
 if(!enabled||!numbersSelected()||hybridScanBusy)return;
 const pg=get();if(!pg?.strokes?.length)return;
 if(activeInterventionLevel()==='original')return;
 hybridScanBusy=true;const serial=++hybridScanSerial,epoch=intentionEpoch;
 try{
  // Analizar según la orientación de lectura visible, sin girar la tinta original.
  const orientation=pg.orientation||'landscape-cw';
  // Solo copiar los últimos trazos al girar: el resto de la hoja no se toca.
  const recent=pg.strokes.slice(-(all?160:85));
  const originals=new Map(recent.map(stroke=>[stroke.id,stroke]));
  const maxMathWidth=orientation==='portrait'?700:1150;
  const lines=mathematicalLines(toReadingStrokes(recent,orientation),{maxStrokes:recent.length,maxWidth:maxMathWidth});
  const lastId=pg.strokes.at(-1)?.id;
  const active=all?lines:lines.filter(line=>line.strokeIds.includes(lastId));
  let found=0;
  for(const line of active.slice(0,18)){
   if(serial!==hybridScanSerial||epoch!==intentionEpoch||activeMathPage()!==pg.id)break;
   if(line.strokeIds.length>80)continue;
   if(storedMathObject(get(),line.strokeIds)){
    mathSuggestions.delete(mathProposalKey(pg.id,line.strokeIds));
    continue;
   }
   const key=mathProposalKey(pg.id,line.strokeIds);
   if(rejectedMath.has(key))continue;
   // Volver a evaluar propuestas que quedaron pendientes antes de activar
   // la conversión automática, sin exigir que el usuario pulse Convertir.
   const previous=mathSuggestions.get(key);
   if(!all&&previous&&!$('mathAutoDigital').checked)continue;
   const raw=line.strokeIds.map(id=>originals.get(id)).filter(Boolean);
   let mlkitCandidates=[];
   if(mathModelReady){
    try{
     const response=await mlkitMath.recognize({strokes:sampledMathStrokes(line.strokes)});
     mlkitCandidates=Array.isArray(response?.candidates)?response.candidates:response?.text?[response.text]:[];
    }catch{/* Offline model unavailable: use local pipeline. */}
   }
   const pipe=await recognizeWithPipeline(raw,activeObjects(pg),{
    category:'numbers',
    interventionLevel:$('mathAutoDigital').checked&&activeInterventionLevel()!=='assisted'?'smart':'assisted',
    mlkitCandidates
   });
   if(serial!==hybridScanSerial||epoch!==intentionEpoch||activeMathPage()!==pg.id||!sigsMatch({sources:raw.map(s=>({id:s.id,signature:fingerprint(s)}))},get()))break;
   if(!all&&get()?.strokes?.at(-1)?.id!==lastId){scheduleScan();break;}
   if(pipe?.winner?.domain==='math'){
    const covered=new Set(pipe.winner.sourceStrokeIds||[]);
    const completeCoverage=raw.every(s=>covered.has(s.id));
    // Never hide unrecognized ink or auto-apply an incomplete reading.
    if(completeCoverage&&pipe.winner.complete&&pipe.intervention?.shouldAutoApply&&pipe.confidence?.level==='high'){
     if(await acceptPipelineWinner(pg.id,pipe.winner,raw,pipe.confidence)){
      pipelineProposals.delete(key);mathSuggestions.delete(key);found++;continue;
     }
    }
    if(completeCoverage){
     pipelineProposals.set(key,{pageId:pg.id,result:{...pipe,alternatives:(pipe.alternatives||[]).filter(a=>a.domain==='math')},strokes:raw});
     mathSuggestions.delete(key);found++;continue;
    }
   }
   const recognized=await recognizeHybridLine(line.strokes,mathModelReady?
    async()=>({candidates:mlkitCandidates}):null,{maxWidth:maxMathWidth});
   if(!recognized)continue;
   const fingerprints=Object.fromEntries(line.strokes.map(stroke=>
    [stroke.id,fingerprint(originals.get(stroke.id))]));
   const proposal={...recognized,geometry:readingGeometryToPage(recognized.geometry,orientation),
    pageId:pg.id,fingerprints};
   if(false&&activeInterventionLevel()!=='assisted'&&canAutoConvertMath(recognized,$('mathAutoDigital').checked)){
    try{
     const converted=await acceptMath(proposal);
     if(converted||storedMathObject(get(),line.strokeIds)){
      mathSuggestions.delete(key);
      found++;continue;
     }
    }catch(error){tell('Lectura por confirmar: '+error.message);}
   }
   mathSuggestions.set(key,proposal);found++;
  }
  renderMathSuggestions();renderPipelineCandidates();
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
 if($('mathRevertLast'))$('mathRevertLast').disabled=records.length===0;
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
 const success=await original()?.saveLayer?.({version:1,axis:activeCategory(),visible,objects:compactAutomatic(objects)});
 if(!success)throw Error('No se pudo guardar la capa mejorada.');
 refresh();return true;
}
function updateInterface(){
 $('mathMode').checked=enabled;menuToggle.checked=enabled;updateQuickShape();
 $('mathAxis').disabled=!enabled;
 $('mathInterventionLevel').disabled=!enabled;
 $('mathGeometryControls').hidden=!enabled||numbersSelected();
 $('mathNumbersControls').hidden=!enabled||!numbersSelected();
 $('mathRecognizedDetails').hidden=!enabled;
 $('mathShowLayer').checked=layerOf(get()).visible!==false;
 $('mathNumbersShowLayer').checked=layerOf(get()).visible!==false;
 refresh();
}
function setEnabled(value){
 const previously=enabled;
 enabled=!!value;clearTimeout(scanTimer);intentionEpoch++;pipelineEpoch++;
 if(enabled&&!previously){const page=get();if(page)intentCutoffs.set(page.id,page.strokes?.length||0);}
 updateInterface();
 tell(enabled?'Modo Matemática Profesional activo ('+activeCategory()+' · '+activeInterventionLevel()+'). La tinta original se conserva intacta.':'Modo normal: todos los trazos manuscritos se conservan.');
}
function ensureWorker(){
 if(worker)return worker;
 if(typeof Worker!=='function')throw Error('El dispositivo no admite el reconocedor local.');
 worker=new Worker(new URL('./math-worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{
  const job=jobs.get(data?.id);if(!job)return;jobs.delete(data.id);clearTimeout(job.timer);
  data.error?job.reject(Error(data.error)):job.resolve(data);
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
  jobs.set(id,{resolve:data=>resolve(data?.result),reject,timer});
  service.postMessage({id,action:'automatic',strokes,intention:intendedShape,
    orientation:get()?.orientation||'landscape-cw'});
 });
}
async function recognizeWithPipeline(strokes,existingObjects=[],override={}){
 const epoch=++pipelineEpoch;
 const orientation=get()?.orientation||'landscape-cw';
 const category=override.category||activeCategory();
 const interventionLevel=override.interventionLevel||activeInterventionLevel();
 const profile=loadUserProfile();
 const mlkitCandidates=override.mlkitCandidates||[];
 const intention=category==='numbers'?'auto':intendedShape;
 try{
  const service=ensureWorker(),id=++sequence;
  const response=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{jobs.delete(id);reject(Error('Pipeline timeout'));},3500);
   jobs.set(id,{resolve,reject,timer});
   service.postMessage({
    id,jobId:'pipe-'+id,epoch,action:'pipeline',strokes,existingObjects,
    category,interventionLevel,intention,orientation,profile,mlkitCandidates
   });
  });
  if(response?.cancelled)return null;
  return response?.result||null;
 }catch{
  // Aislamiento total de fallos: si el Worker falla o no existe, ejecutar en modo seguro local sin bloquear escritura.
  try{
   return runMathPipeline(strokes,{category,interventionLevel,intention,orientation,existingObjects,profile,mlkitCandidates});
  }catch{
   return null;
  }
 }
}

const sigsMatch=(candidate,pg)=>{
 const byId=new Map((pg?.strokes||[]).map(s=>[s.id,s]));
 return candidate.sources.every(source=>{
  const s=byId.get(source.id);return !!s&&fingerprint(s)===source.signature;
 });
};
async function runOne(pg,strokes){
 if(!enabled||numbersSelected()||!strokes.length)return false;
 const level=activeInterventionLevel();
 if(level==='original')return false;
 const cat=activeCategory();
 const epoch=intentionEpoch;

 // Para categorías profesionales unificadas (auto, algebra, data) o modo assisted/digital, usar pipeline unificado
 if(cat==='auto'||cat==='algebra'||cat==='data'||level==='assisted'||level==='digital'){
  const pipeResult=await recognizeWithPipeline(strokes,activeObjects(pg));
  if(!pipeResult||!pipeResult.winner||epoch!==intentionEpoch)return false;
  if(pipeResult.intervention?.shouldAutoApply){
   return acceptPipelineWinner(pg.id,pipeResult.winner,strokes,pipeResult.confidence);
  }
  if(pipeResult.intervention?.showSuggestions){
   const key=mathProposalKey(pg.id,strokes.map(s=>s.id));
   pipelineProposals.set(key,{pageId:pg.id,result:pipeResult,strokes});
   renderPipelineCandidates();
   tell('Propuesta lista para revisar ('+pipeResult.winner.label+').');
   return false;
  }
  return false;
 }

 // Flujo V0.80 de geometría rápida + respaldo de pipeline unificado
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

/** Solo las etiquetas cercanas a un radio/diámetro, nunca la hoja completa.
 * Las lecturas sin unidad o con candidatos contradictorios requieren revisión.
 */
async function scanCircleMeasurements(){
 if(!enabled||numbersSelected()||circleScanRunning)return 0;
 const page=get();if(!page?.strokes?.length)return 0;
 const circles=activeObjects(page).filter(obj=>obj.geometry?.kind==='circle');
 if(!circles.length)return 0;
 circleScanRunning=true;let added=0;
 try{
  const found=findCircleMeasurements(circles,page.strokes.slice(-180));
  const done=new Set();
  for(const item of found){
   if(!enabled||numbersSelected()||get()?.id!==page.id)break;
   const lineId=item.stroke.id;
   if(done.has(lineId))continue;
   done.add(lineId);
   const sourceStrokes=[item.stroke,...item.labels];
   if(!item.labels.length||sourceStrokes.length>17)continue;
   const signatures=sourceStrokes.map(stroke=>({id:stroke.id,signature:fingerprint(stroke)}));
   // El reconocimiento local es respaldo; ML Kit se ejecuta directamente
   // también en modo Geometría (el modelo puede haberse descargado antes).
   const labelInk=toReadingStrokes(item.labels,page.orientation||'landscape-cw');
   const local=recognizeInk(labelInk);
   let candidates=local?.geometry?.text?[local.geometry.text]:[];
   try{
    const remote=await mlkitMath.recognize({strokes:sampledMathStrokes(labelInk)});
    if(Array.isArray(remote?.candidates))candidates=[...remote.candidates,...candidates];
    else if(remote?.text)candidates=[remote.text,...candidates];
   }catch{/* Modelo no preparado: la etiqueta original queda visible. */}
   const label=chooseCircleLabel(item.line,candidates);
   if(!label?.reliable||!/ (?:mm|cm|m)$/.test(' '+label.text))continue;
   const existing=layerOf(get()).objects||[];
   if(existing.some(obj=>obj.measurementSource===lineId))continue;
   const live=get();if(live?.id!==page.id||!signatures.every(src=>
     live.strokes.some(st=>st.id===src.id&&fingerprint(st)===src.signature)))continue;
   const proposal={type:'line',label:item.line.type==='radius'?'Radio':'Diámetro',
    geometry:{kind:'line',points:item.line.points},style:{
     color:item.stroke.color||'#000000',width:2.5},sources:signatures,automatic:true};
   const merged=mergeAutomatic(existing,proposal);
   if(!merged)continue;
   const mid=[(item.line.points[0][0]+item.line.points[1][0])/2,
    (item.line.points[0][1]+item.line.points[1][1])/2];
   const labelObject={id:globalThis.crypto?.randomUUID?.()||'measure-'+Date.now()+'-'+(++sequence),
    type:'line',label:proposal.label,measurementSource:lineId,automatic:true,accepted:true,
    geometry:proposal.geometry,style:proposal.style,sources:signatures,
    labels:[{text:label.text,x:mid[0],y:mid[1]-12,size:25}]};
   await saveLayer([...merged.objects,labelObject],layerOf(live).visible!==false);
   added++;
  }
 }catch(error){tell('Medición geométrica: '+(error?.message||String(error)));}
 finally{circleScanRunning=false;}
 return added;
}

async function scanRecent(all=false){
 if(!enabled)return;
 if(activeInterventionLevel()==='original')return;
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
  const circleChanged=geometrySelected()||activeCategory()==='auto'?await scanCircleMeasurements():0;
  if(all)tell('Análisis completado. '+(changed+circleChanged)+' mejora(s) detectada(s), incluidas medidas de círculos; los originales permanecen intactos.');
 }catch(error){tell('Reconocimiento automático: '+error.message);}
 finally{
  scanRunning=false;
  if(scanAgain){scanAgain=false;scheduleScan();}
 }
}
function scheduleScan(){
 if(!enabled)return;
 clearTimeout(scanTimer);
 scanTimer=setTimeout(()=>void scanRecent(false),numbersSelected()?1900:650);
}

let labUI=null;
function openMathLab(){
 try{
  if(!labUI){
   labUI=createMathLabUI({
    getCurrentPage:()=>get()||{id:'empty',strokes:[]},
    runPipeline:(strokes,opts)=>runMathPipeline(strokes,{
     ...opts,
     category:opts?.category||activeCategory(),
     interventionLevel:opts?.interventionLevel||activeInterventionLevel(),
     profile:opts?.profile||loadUserProfile()
    }),
    getProfile:()=>loadUserProfile(),
    saveProfile:next=>saveUserProfile(next),
    // The lab already saves the confirmed correction; do not double-count it.

   });
  }
  dialog.open&&dialog.close();
  labUI.open();
 }catch(err){
  tell('No se pudo abrir el laboratorio: '+(err?.message||String(err)));
 }
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
 if(g?.kind==='text'){add('text','Número o medida',g.text,false);add('x','X',g.x);add('y','Y',g.y);add('size','Tamaño',g.size);}
 else if(g?.kind==='circle'){add('cx','Centro X',g.cx);add('cy','Centro Y',g.cy);add('r','Radio',g.r);}
 else if(g?.kind==='line'||g?.kind==='polygon')g.points.forEach((p,i)=>{add('p'+i+'x','Vértice '+(i+1)+' X',p[0]);add('p'+i+'y','Vértice '+(i+1)+' Y',p[1]);});
 else if(g?.kind==='segments')g.segments.forEach((segment,i)=>segment.forEach((p,j)=>{add('s'+i+j+'x','Arista '+i+' X',p[0]);add('s'+i+j+'y','Arista '+i+' Y',p[1]);}));
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
    vals.text=normalizeArithmetic(text)?formatMathDisplay(text):text;continue;
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
 clearTimeout(scanTimer);intentionEpoch++;pipelineEpoch++;
 mathSuggestions.clear();pipelineProposals.clear();
 renderMathSuggestions();renderPipelineCandidates();
 try{localStorage.setItem(CATEGORY_KEY,activeCategory());}catch{}
 const page=get();if(page)intentCutoffs.set(page.id,page.strokes?.length||0);
 updateInterface();
 if(numbersSelected()){
  void checkMathModel();
  tell('Modo Números y operaciones activo. Escriba una expresión, espere un instante y confirme las lecturas dudosas.');
 }else tell('Categoría activa: '+($('mathAxis').selectedOptions[0]?.textContent||activeCategory())+'. Los trazos originales permanecen intactos.');
});
$('mathInterventionLevel').addEventListener('change',()=>{
 try{localStorage.setItem(INTERVENTION_KEY,activeInterventionLevel());}catch{}
 tell('Nivel de intervención: '+($('mathInterventionLevel').selectedOptions[0]?.textContent||activeInterventionLevel())+'.');
});
$('mathOpenLab').addEventListener('click',openMathLab);
$('mathRevertLast').addEventListener('click',()=>{
 const pg=get();if(!pg)return;
 const objects=layerOf(pg).objects||[];
 if(!objects.length){tell('No hay objetos digitales que revertir.');return;}
 const next=objects.slice(0,-1);
 void saveLayer(next,layerOf(pg).visible!==false)
  .then(()=>tell('Último objeto digital revertido. Los trazos manuscritos originales vuelven a mostrarse.'))
  .catch(e=>tell(e.message));
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
$('mathAutoDigital').addEventListener('change',event=>{
 try{localStorage.setItem('minote:math-auto-convert',event.target.checked?'1':'0');}catch{}
 tell(event.target.checked?
  'Conversión automática activada: al terminar de escribir, se mostrarán números y operaciones como texto digital. Los dígitos dudosos requieren revisión.':
  'Conversión automática desactivada. Las operaciones se mostrarán para revisar y convertir manualmente.');
 if(event.target.checked&&enabled&&numbersSelected())void scanHybridMath(true);
});
try{
 const savedAuto=localStorage.getItem('minote:math-auto-convert');
 if(savedAuto!==null)$('mathAutoDigital').checked=savedAuto==='1';
}catch{}
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
 clearTimeout(scanTimer);intentionEpoch++;pipelineEpoch++;
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
document.addEventListener('minote:open-math-lab',openMathLab);
document.addEventListener('minote:stroke-finished',({detail})=>{
 if(!enabled||!detail?.pageId)return;
 if(detail.pageId!==original()?.activePageId?.())return;
 scheduleScan();
});
document.addEventListener('minote:statechange',()=>{
 const pg=get();if(pg?.id!==lastPage){lastPage=pg?.id||'';clearTimeout(scanTimer);mathSuggestions.clear();pipelineProposals.clear();renderMathSuggestions();renderPipelineCandidates();}
 refresh();
});
document.addEventListener('minote:page-rendered',refresh);
window.addEventListener('minote:changed',()=>{if(enabled)refresh();});
window.addEventListener('resize',refresh,{passive:true});
updateInterface();
window.MiNoteMath={
 get enabled(){return enabled;},
 setEnabled,
 get category(){return activeCategory();},
 get interventionLevel(){return activeInterventionLevel();},
 openLab:openMathLab,
 getProfile:loadUserProfile,
 resetProfile:()=>saveUserProfile(resetUserProfile()),
 runPipeline:(strokes,opts)=>runMathPipeline(strokes,{...opts,category:opts?.category||activeCategory(),interventionLevel:opts?.interventionLevel||activeInterventionLevel(),profile:opts?.profile||loadUserProfile()})
};
