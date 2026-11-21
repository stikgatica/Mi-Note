'use strict';
/* Mi Note 0.2.0 — local first, no telemetry, no secrets in code. */
const $ = id => document.getElementById(id);
const W = 1000, H = 1400;
const VERSION = 'mi-note-v1';
const key = 'state';
let db, state, tool = 'pen', inStroke = null, isErasing = false, undoState = new Map();
let currentColor = '#111827', currentWidth = 2.5, saveQueue = Promise.resolve();
const canvas = $('paper'), ctx = canvas.getContext('2d', {alpha: false});
const clone = v => JSON.parse(JSON.stringify(v));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2);
const now = () => new Date().toISOString();
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const stamp = () => new Date().toISOString().replace(/[:.]/g,'-');
const emptyPage = (n=1) => ({id:uid(),title:`Hoja ${n}`,template:'grid',strokes:[],updatedAt:now()});
const emptyNotebook = (title='Mi primer cuaderno') => ({id:uid(),title,pages:[emptyPage()],updatedAt:now()});
function starter(){const nb=emptyNotebook();return {schema:VERSION,deviceId:uid(),notebooks:[nb],activeNotebookId:nb.id,activePageId:nb.pages[0].id};}
function note(){return state.notebooks.find(n=>n.id===state.activeNotebookId)||state.notebooks[0];}
function page(){return note()?.pages.find(p=>p.id===state.activePageId)||note()?.pages[0];}
function syncActive(){if(!state.notebooks.length)state=starter();if(!state.notebooks.some(n=>n.id===state.activeNotebookId))state.activeNotebookId=state.notebooks[0].id;const nb=note();if(!nb.pages.length)nb.pages.push(emptyPage());if(!nb.pages.some(p=>p.id===state.activePageId))state.activePageId=nb.pages[0].id;}
function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('MiNotePrivate',1);request.onupgradeneeded=()=>request.result.createObjectStore('kv');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function getSaved(){return new Promise((resolve,reject)=>{const r=db.transaction('kv').objectStore('kv').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function putSaved(value){return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
function persist(){const snapshot=clone(state);$('localStatus').textContent='◌ Guardando…';saveQueue=saveQueue.catch(()=>{}).then(()=>putSaved(snapshot)).then(()=>{$('localStatus').textContent='● Guardado local';}).catch(err=>{console.error(err);$('localStatus').textContent='⚠ Error de guardado';notice('No se pudo guardar localmente. Exporta un respaldo.',true);});return saveQueue;}
let toastTimer;
function notice(message, warning=false){const el=$('notice');el.textContent=message;el.className='notice '+(warning?'warn':'good');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.className='notice';el.textContent='Mi Note guarda tus cambios en este dispositivo.';},6500);}
function makeButton(text, css, onClick){const b=document.createElement('button');b.textContent=text;b.className=css;b.addEventListener('click',onClick);return b;}
function render(){syncActive();const nb=note(),pg=page();$('notebookTitle').textContent=nb.title;$('pageCount').textContent=`${nb.pages.length} ${nb.pages.length===1?'hoja':'hojas'}`;$('pageTitle').textContent=pg.title;$('pageInfo').textContent=`${pg.strokes.length} trazos · ${pg.template==='grid'?'Cuadrícula':pg.template==='ruled'?'Rayas':'Blanco'}`;$('paperSelect').value=pg.template;$('penWidthLabel').value=currentWidth;$('penWidthLabel').textContent=currentWidth;const pageIndex=nb.pages.findIndex(p=>p.id===pg.id);$('pageNumber').textContent=String(pageIndex+1);$('pageNumber').setAttribute('aria-label',`Hoja ${pageIndex+1} de ${nb.pages.length}. Mostrar lista de hojas`);$('prevPage').disabled=pageIndex===0;$('nextPage').title=pageIndex===nb.pages.length-1?'Crear una nueva hoja':'Siguiente hoja';$('nextPage').setAttribute('aria-label',$('nextPage').title);
 const nav=$('notebookList');nav.replaceChildren();for(const n of state.notebooks){const b=document.createElement('button');b.className='notebook-item'+(n.id===nb.id?' selected':'');const ico=document.createElement('span');ico.textContent='▤';ico.style.fontSize='20px';const d=document.createElement('span');d.className='nb-detail';const name=document.createElement('b');name.textContent=n.title;const small=document.createElement('small');small.textContent=`${n.pages.length} ${n.pages.length===1?'hoja':'hojas'}`;d.append(name,small);b.append(ico,d);b.onclick=()=>{x10Flush();state.activeNotebookId=n.id;state.activePageId=n.pages[0].id;undoState.clear();$('sidebar').classList.remove('open');render();persist();};nav.append(b);}
 const list=$('pageList');list.replaceChildren();nb.pages.forEach((p,i)=>{const b=document.createElement('button');b.className='page-chip'+(p.id===pg.id?' selected':'');const t=document.createElement('strong');t.textContent=p.title;const small=document.createElement('small');small.textContent=`${i+1} · ${p.strokes.length} trazos`;b.append(t,small);b.onclick=()=>{x10Flush();state.activePageId=p.id;$('pagesDialog').close();render();persist();};list.append(b);});setTool(tool);resizeCanvas();}
function setTool(next){tool=next;$('penBtn').classList.toggle('active',next==='pen');$('eraserBtn').classList.toggle('active',next==='eraser');canvas.style.cursor=next==='eraser'?'cell':'crosshair';}
function drawBackground(context,template){context.fillStyle='#fff';context.fillRect(0,0,W,H);context.strokeStyle=template==='grid'?'#dce7f4':'#e6ebf3';context.lineWidth=1;if(template==='grid'){for(let x=0;x<=W;x+=40){context.beginPath();context.moveTo(x,0);context.lineTo(x,H);context.stroke();}for(let y=0;y<=H;y+=40){context.beginPath();context.moveTo(0,y);context.lineTo(W,y);context.stroke();}}else if(template==='ruled'){for(let y=75;y<H;y+=55){context.beginPath();context.moveTo(0,y);context.lineTo(W,y);context.stroke();}}}
function drawStroke(context,stroke){const pts=stroke.pts;if(!pts?.length)return;context.strokeStyle=stroke.color||'#163f82';context.fillStyle=stroke.color||'#163f82';context.lineJoin='round';context.lineCap='round';const w=Number(stroke.width)||3;if(pts.length===1){const [x,y,p]=pts[0];context.beginPath();context.arc(x,y,Math.max(.5,w*(.45+.55*(p||.5))/2),0,Math.PI*2);context.fill();return;}for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],pr=(Number(a[2]||.5)+Number(b[2]||.5))/2;context.lineWidth=Math.max(.8,w*(.45+.55*pr));context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.stroke();}}
function paint(){const pg=page();if(!pg)return;const dpr=Math.max(1,Math.min(devicePixelRatio||1,2));const bounds=canvas.getBoundingClientRect();const cw=Math.max(1,Math.round(bounds.width*dpr)),ch=Math.max(1,Math.round(bounds.height*dpr));if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);drawBackground(ctx,pg.template);for(const s of pg.strokes)drawStroke(ctx,s);if(inStroke)drawStroke(ctx,inStroke);if(x10ActiveStroke&&state?.activePageId===x10ActivePageId)drawStroke(ctx,x10ActiveStroke);}
let resizeObserver;
function resizeCanvas(){requestAnimationFrame(paint);}
function pointFromEvent(e){const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(W,(e.clientX-b.left)*W/b.width)),Math.max(0,Math.min(H,(e.clientY-b.top)*H/b.height)),e.pointerType==='pen'?Math.min(1,Math.max(.08,e.pressure||.5)):.75];}
function historyFor(id){if(!undoState.has(id))undoState.set(id,{undo:[],redo:[]});return undoState.get(id);}
function beforeChange(){const h=historyFor(page().id);h.undo.push(clone(page().strokes));if(h.undo.length>35)h.undo.shift();h.redo=[];}
function updatePage(){page().updatedAt=now();note().updatedAt=now();renderMeta();persist();}
function renderMeta(){const pg=page();$('pageInfo').textContent=`${pg.strokes.length} trazos · ${pg.template==='grid'?'Cuadrícula':pg.template==='ruled'?'Rayas':'Blanco'}`;const selected=$('pageList').querySelector('.selected small');if(selected)selected.textContent=`${note().pages.findIndex(x=>x.id===pg.id)+1} · ${pg.strokes.length} trazos`;}
function pointSegmentDistance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const z=dx*dx+dy*dy||1;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/z));return Math.hypot(x-(a[0]+t*dx),y-(a[1]+t*dy));}
function eraseAt(pt){const pg=page();for(let i=pg.strokes.length-1;i>=0;i--){const s=pg.strokes[i],pts=s.pts;if(!pts?.length)continue;let hit=pts.some(a=>Math.hypot(pt[0]-a[0],pt[1]-a[1])<22);if(!hit)for(let j=1;j<pts.length;j++){if(pointSegmentDistance(pt[0],pt[1],pts[j-1],pts[j])<22){hit=true;break;}}if(hit){pg.strokes.splice(i,1);paint();return true;}}return false;}
function drawStart(e){if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();canvas.setPointerCapture(e.pointerId);const pt=pointFromEvent(e);if(tool==='pen'){beforeChange();inStroke={id:uid(),color:currentColor,width:currentWidth,pts:[pt]};paint();}else{beforeChange();isErasing=true;eraseAt(pt);}}
function drawMove(e){if(!canvas.hasPointerCapture(e.pointerId))return;const pt=pointFromEvent(e);if(inStroke){const last=inStroke.pts.at(-1);if(Math.hypot(pt[0]-last[0],pt[1]-last[1])>1.2){inStroke.pts.push(pt);paint();}}else if(isErasing)eraseAt(pt);}
function drawEnd(e){if(!canvas.hasPointerCapture(e.pointerId))return;if(inStroke){const pt=pointFromEvent(e);inStroke.pts.push(pt);page().strokes.push(inStroke);inStroke=null;}if(isErasing)isErasing=false;try{canvas.releasePointerCapture(e.pointerId);}catch{}paint();updatePage();}
function undo(){x10Flush();const h=historyFor(page().id);if(!h.undo.length)return;h.redo.push(clone(page().strokes));page().strokes=h.undo.pop();paint();updatePage();}
function redo(){x10Flush();const h=historyFor(page().id);if(!h.redo.length)return;h.undo.push(clone(page().strokes));page().strokes=h.redo.pop();paint();updatePage();}
function safeFile(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,48)||'documento';}
function download(data,filename,mime){const blob=data instanceof Blob?data:new Blob([data],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function svgFor(pg){let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400" viewBox="0 0 1000 1400"><rect width="1000" height="1400" fill="white"/>`;if(pg.template==='grid'){for(let x=0;x<=W;x+=40)s+=`<path d="M ${x} 0 V ${H}" stroke="#dce7f4" stroke-width="1"/>`;for(let y=0;y<=H;y+=40)s+=`<path d="M 0 ${y} H ${W}" stroke="#dce7f4" stroke-width="1"/>`;}else if(pg.template==='ruled'){for(let y=75;y<H;y+=55)s+=`<path d="M 0 ${y} H ${W}" stroke="#e6ebf3" stroke-width="1"/>`;}for(const stroke of pg.strokes){const p=stroke.pts;if(!p.length)continue;const color=/^#[0-9A-Fa-f]{6}$/.test(stroke.color)?stroke.color:'#153f82';const sw=Math.max(.6,Math.min(20,Number(stroke.width)||3));if(p.length===1){s+=`<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${(sw/2).toFixed(2)}" fill="${color}"/>`;}else{const d=p.map((v,i)=>(i?'L':'M')+v[0].toFixed(2)+' '+v[1].toFixed(2)).join(' ');s+=`<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;}}return s+'</svg>';}
function backupObject(){return {schema:VERSION,exportedAt:now(),notebooks:clone(state.notebooks)};}
function exportBackup(){x10Flush();download(JSON.stringify(backupObject(),null,2),`MiNote_respaldo_${stamp()}.json`,'application/json');notice('Respaldo descargado. Guarda una copia en un lugar seguro.');}
function validBackup(obj){return obj&&obj.schema===VERSION&&Array.isArray(obj.notebooks)&&obj.notebooks.length<10000&&obj.notebooks.every(n=>typeof n.id==='string'&&Array.isArray(n.pages)&&n.pages.length<10000&&n.pages.every(p=>typeof p.id==='string'&&Array.isArray(p.strokes)));}
function pageContent(p){return JSON.stringify({title:(p.title||'').replace(/ \(conflicto importado\)$/,''),template:p.template,strokes:p.strokes});}
function mergeBackup(remote){if(!validBackup(remote))throw Error('El archivo no corresponde a un respaldo Mi Note compatible.');let added=0,conflicts=0;for(const n of remote.notebooks){let local=state.notebooks.find(x=>x.id===n.id);if(!local){state.notebooks.push(clone(n));added+=n.pages.length;continue;}for(const rp of n.pages){const lp=local.pages.find(x=>x.id===rp.id);if(!lp){local.pages.push(clone(rp));added++;continue;}if(pageContent(lp)===pageContent(rp))continue;const sameCopy=local.pages.some(x=>x.sourcePageId===rp.id&&pageContent(x)===pageContent(rp));if(sameCopy)continue;const c=clone(rp);c.sourcePageId=rp.id;c.id=uid();c.title=(rp.title||'Hoja')+' (conflicto importado)';local.pages.push(c);added++;conflicts++;}}syncActive();render();persist();return {added,conflicts};}
function importHuion(obj){const maxX=Number(obj.max_x??obj.maxX),maxY=Number(obj.max_y??obj.maxY),maxP=Number(obj.max_press??obj.maxPress??8191);if(!Number.isFinite(maxX)||maxX<=0||!Number.isFinite(maxY)||maxY<=0)throw Error('Faltan las dimensiones max_x/max_y del archivo X10.');const mode=prompt('Orientación de la hoja X10: 0, 90, 180 o 270 grados. Prueba 90 para escritura vertical.','90');if(mode===null)return;const rotate=Number(mode);if(![0,90,180,270].includes(rotate))throw Error('La orientación debe ser 0, 90, 180 o 270.');const imported=emptyPage(note().pages.length+1);imported.title='Huion X10 · hoja '+(obj.page??(note().pages.length+1));imported.template='plain';for(const src of obj.strokes){if(!Array.isArray(src)||!src.length)continue;const pts=[];for(const p of src){if(!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))continue;let x=Math.max(0,Math.min(1,Number(p.x)/maxX)),y=Math.max(0,Math.min(1,Number(p.y)/maxY));if(rotate===90)[x,y]=[1-y,x];if(rotate===180)[x,y]=[1-x,1-y];if(rotate===270)[x,y]=[y,1-x];const pr=Math.min(1,Math.max(.1,(Number(p.press)||0)/maxP));pts.push([x*W,y*H,pr]);}if(pts.length)imported.strokes.push({id:uid(),color:'#111827',width:2.5,pts});}note().pages.push(imported);state.activePageId=imported.id;render();persist();notice(`Importados ${imported.strokes.length} trazos desde JSON de Huion X10.`);}
function setupEvents(){setupX10();canvas.addEventListener('pointerdown',drawStart);canvas.addEventListener('pointermove',drawMove);canvas.addEventListener('pointerup',drawEnd);canvas.addEventListener('pointercancel',drawEnd);canvas.addEventListener('contextmenu',e=>e.preventDefault());resizeObserver=new ResizeObserver(resizeCanvas);resizeObserver.observe(canvas);
 $('penBtn').onclick=()=>setTool('pen');$('eraserBtn').onclick=()=>setTool('eraser');$('penColor').oninput=e=>{currentColor=e.target.value;setTool('pen');};$('penWidth').oninput=e=>{currentWidth=Number(e.target.value);$('penWidthLabel').textContent=currentWidth;};$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;
 $('paperSelect').onchange=e=>{page().template=e.target.value;paint();updatePage();};
 $('addNotebook').onclick=()=>{const title=prompt('Nombre del nuevo cuaderno:','Nuevo cuaderno');if(!title?.trim())return;const n=emptyNotebook(title.trim().slice(0,90));state.notebooks.push(n);state.activeNotebookId=n.id;state.activePageId=n.pages[0].id;render();persist();};
 $('renameNotebookBtn').onclick=()=>{const title=prompt('Nuevo nombre del cuaderno:',note().title);if(!title?.trim())return;note().title=title.trim().slice(0,90);render();persist();};
 function addNewPage(){x10Flush();const pg=emptyPage(note().pages.length+1);pg.template=page().template;note().pages.push(pg);state.activePageId=pg.id;render();persist();}
 $('pageNumber').onclick=()=>{x10Flush();$('pagesDialog').showModal();};
 $('closePages').onclick=()=>$('pagesDialog').close();
 $('prevPage').onclick=()=>{x10Flush();const pages=note().pages,i=pages.findIndex(p=>p.id===page().id);if(i>0){state.activePageId=pages[i-1].id;render();persist();}};
 $('nextPage').onclick=()=>{x10Flush();const pages=note().pages,i=pages.findIndex(p=>p.id===page().id);if(i<pages.length-1){state.activePageId=pages[i+1].id;render();persist();}else{addNewPage();notice('Nueva hoja creada. Puedes volver usando ‹.');}};
 $('addPage').onclick=()=>{addNewPage();$('pagesDialog').close();};
 $('renamePageBtn').onclick=()=>{const title=prompt('Nombre de la hoja:',page().title);if(!title?.trim())return;page().title=title.trim().slice(0,90);page().updatedAt=now();render();persist();};
 $('deletePage').onclick=()=>{x10Flush();const nb=note();if(nb.pages.length<=1){notice('Un cuaderno debe conservar al menos una hoja.',true);return;}if(!confirm(`¿Eliminar «${page().title}»? Este cambio no se puede deshacer.`))return;nb.pages=nb.pages.filter(x=>x.id!==page().id);state.activePageId=nb.pages.at(-1).id;render();persist();};
 $('exportSvg').onclick=()=>download(svgFor(page()),safeFile(page().title)+'.svg','image/svg+xml');
 $('exportPng').onclick=()=>{paint();canvas.toBlob(b=>{if(b)download(b,safeFile(page().title)+'.png','image/png');},'image/png');};
 $('printPdf').onclick=()=>{const blob=new Blob([svgFor(page())],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);const win=window.open('','_blank');if(!win){URL.revokeObjectURL(url);notice('El navegador bloqueó la ventana de impresión.',true);return;}win.document.write('<!doctype html><html><head><title>Imprimir Mi Note</title><style>body{margin:0}img{display:block;width:100%;max-height:100vh;object-fit:contain}@page{size:A4;margin:8mm}</style></head><body><img id="doc" alt="Hoja"/></body></html>');win.document.close();const img=win.document.getElementById('doc');img.onload=()=>{win.focus();win.print();setTimeout(()=>URL.revokeObjectURL(url),4000);};img.src=url;};
 $('backupBtn').onclick=exportBackup;
 $('importBtn').onclick=()=>$('importInput').click();$('importInput').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>15*1024*1024){notice('Archivo demasiado grande para este importador (máximo 15 MB).',true);return;}try{const obj=JSON.parse(await f.text());if(validBackup(obj)){const result=mergeBackup(obj);notice(`Combinación completa: ${result.added} hojas añadidas; ${result.conflicts} conflictos preservados.`);}else if(Array.isArray(obj.strokes)&&('max_x'in obj||'maxX'in obj))importHuion(obj);else throw Error('No reconozco el formato JSON. Usa un respaldo Mi Note o el formato de extracción Huion X10.');}catch(err){notice('Importación fallida: '+err.message,true);}};
 $('toggleSidebar').onclick=()=>$('sidebar').classList.toggle('open');$('fullscreenBtn').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.();};
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}}});

}

/* Integración Huion Note X10: solo escritura confirmada y asociación de páginas.
   Las notas existentes y formato IndexedDB V0.2 no se alteran. */
let x10Connection=null,x10ActiveStroke=null,x10ActivePageId=null,x10ActiveNoteId=null,
  x10PointCount=0,x10Unknown=0,x10LastUnknown='',x10Logs=[],x10PhysicalPages=0,x10Orientation=0;
function x10Log(s){x10Logs.push(new Date().toISOString()+' '+s);if(x10Logs.length>80)x10Logs.shift();}
function x10SetStatus(s){$('x10Status').textContent=s;x10Log(s);}
function x10Details(){const mode=x10Connection?.mode||'desconectado',idx=note()?.pages.findIndex(p=>p.id===x10ActivePageId)??-1;
 const ble=x10Connection?.liveDiagnostic?.();
 $('x10Details').textContent='Modo: '+mode+' · Hoja vinculada: '+(idx>=0?idx+1:'ninguna')+
 '\\nPuntos dibujados: '+x10PointCount+' · Paquetes sin interpretar: '+x10Unknown+
 (ble?'\\nBluetooth: '+ble.notifications+' notificaciones · '+ble.onlineFrames+' tramas 8D · '+ble.onlineSamples+' muestras · '+ble.invalidOnline+' rechazadas · '+ble.otherPackets+' otras.':'')+
 ' · Páginas físicas notificadas: '+x10PhysicalPages;
 $('x10OpenBtn').classList.toggle('is-connected',!!x10Connection?.connected);
 $('x10OpenBtn').textContent=x10Connection?.connected?'● X10':'◌ X10';
}
function x10RotationValue(mode=x10Connection?.mode){
 const val=$('x10Rotation').value;
 return val==='auto'?0:Number(val); // Solo modo agenda.
}
function x10Flush(){
 if(!x10ActiveStroke)return;
 const stroke=x10ActiveStroke;x10ActiveStroke=null;
 const nb=state.notebooks.find(n=>n.id===x10ActiveNoteId),pg=nb?.pages.find(p=>p.id===x10ActivePageId);
 if(!pg||!stroke.pts.length)return;
 pg.strokes.push(stroke);pg.updatedAt=now();nb.updatedAt=now();
 if(page()?.id===pg.id)paint();
 renderMeta();persist();
}
function x10BindCurrent(){x10Flush();x10ActiveNoteId=note().id;x10ActivePageId=page().id;
 x10SetStatus('Hoja '+(note().pages.findIndex(p=>p.id===x10ActivePageId)+1)+' vinculada a X10.');x10Details();}
function x10NewPhysicalPage(physicalIndex){
 x10Flush();x10PhysicalPages++;
 if(!$('x10AutoPage').checked){x10ActivePageId=null;x10SetStatus('La X10 cambió de hoja. Vincula la nueva hoja antes de escribir.');x10Details();return;}
 const nb=state.notebooks.find(n=>n.id===x10ActiveNoteId);
 if(!nb){x10ActivePageId=null;x10SetStatus('Selecciona un cuaderno y vincula su hoja antes de usar X10.');return;}
 const pg=emptyPage(nb.pages.length+1);
 pg.template=nb.pages.find(p=>p.id===x10ActivePageId)?.template||'plain';
 pg.huion={device:'Huion Note X10',physicalPage:Number.isInteger(physicalIndex)?physicalIndex:null,createdBy:'physical-page-event'};
 nb.pages.push(pg);x10ActivePageId=pg.id;
 if(state.activeNotebookId===nb.id)state.activePageId=pg.id;
 render();persist();x10SetStatus('X10 avisó una página nueva. Hoja digital '+nb.pages.length+' creada.');x10Details();
}
function x10Pen(raw,limits,mode){
 // Al navegar por páginas el lápiz sigue la hoja actualmente visible,
 // sin crear páginas ni borrar los trazos importados.
 if(!x10ActivePageId||!x10ActiveNoteId||
    state.activeNotebookId!==x10ActiveNoteId||page().id!==x10ActivePageId){
  if(!raw.touch||raw.press<=0){x10Flush();return;}
  x10BindCurrent();
 }
 if(!raw.touch||raw.press<=0){x10Flush();return;}
 const rot=x10RotationValue(mode);
 const coord=MiNoteX10Ble.mapPoint(raw,limits.maxX,limits.maxY,rot,W,H,true);
 if(!coord)return;
 coord[2]=Math.min(1,Math.max(.08,raw.press/(limits.maxPressure||8191)));
 if(!x10ActiveStroke){
  const pg=page();beforeChange();
  x10ActiveStroke={id:uid(),color:currentColor,width:currentWidth,pts:[],
   x10:{device:'Huion Note X10',mode,rotation:rot,limits:clone(limits),raw:[]}};
 }
 x10ActiveStroke.pts.push(coord);
 x10ActiveStroke.x10.raw.push([raw.x,raw.y,raw.press]);
 x10PointCount++;if(x10PointCount%8===0)x10Details();
 paint();
}
function x10Reorient(){
 const pg=page(),targets=pg.strokes.filter(s=>s.x10&&Array.isArray(s.x10.raw));
 if(!targets.length){x10SetStatus('Esta hoja no tiene trazos BLE X10 que se puedan reorientar.');return;}
 x10Flush();beforeChange();const rot=x10RotationValue();
 for(const s of targets){
  const {limits,raw}=s.x10;
  s.pts=raw.map(([x,y,press])=>{const pt=MiNoteX10Ble.mapPoint({x,y,press},limits.maxX,limits.maxY,rot,W,H,true);if(pt)pt[2]=Math.min(1,Math.max(.08,press/(limits.maxPressure||8191)));return pt;}).filter(Boolean);
  s.x10.rotation=rot;
 }
 pg.updatedAt=now();paint();updatePage();x10SetStatus('Orientación '+rot+'° aplicada a '+targets.length+' trazos, sin cambiar los datos físicos originales.');
}
/* Vincular una sola vez; después utilizar getDevices() del navegador si conservó el permiso. */
let x10AutoTimer=null,x10AutoTries=0,x10Connecting=false,x10ManualPause=false,x10ManualAttempt=null,
 x10InMemoryDevice=null; // BluetoothDevice autorizado vivo durante la sesión, también en Android.
function x10AutoEnabled(){return $('x10AutoConnect').checked&&localStorage.getItem('minote_x10_auto_connect')!=='false';}
function x10CancelRetry(){if(x10AutoTimer!==null)clearTimeout(x10AutoTimer);x10AutoTimer=null;}
function x10ScheduleRetry(){
 if(!x10AutoEnabled()||x10ManualPause||(!localStorage.getItem('minote_x10_device_id')&&!x10InMemoryDevice)||x10Connection?.connected)return;
 if(x10AutoTimer!==null||document.hidden)return;
 const delays=[2000,5000,12000,25000];
 if(x10AutoTries>=delays.length){
  x10SetStatus('Reconexión automática agotada. Enciende la X10 y pulsa «Conectar X10».');
  return;
 }
 const delay=delays[x10AutoTries++];
 x10Log('Reintento de conexión automática '+x10AutoTries+'/'+delays.length);
 x10AutoTimer=setTimeout(()=>{
  x10AutoTimer=null;
  if(!document.hidden)void x10TryAutomatic('reintento');
 },delay);
}
function x10MakeConnection(){
 const {Connection}=MiNoteX10Ble;
 const connection=new Connection({
  onStatus:x10SetStatus,
  onConnected:name=>{
   if(x10Connection!==connection)return;
   // Mantener la referencia BLE incluso tras perder GATT: permite reabrirla
   // Reutilizar el permiso BLE autorizado mientras Android conserve la actividad.
   x10InMemoryDevice=connection.device;
   if(!x10ActiveNoteId||!x10ActivePageId||!state.notebooks.some(n=>n.id===x10ActiveNoteId&&n.pages.some(p=>p.id===x10ActivePageId))){
    x10BindCurrent();
   }
   $('x10Connect').textContent='Desconectar X10';
   x10Details();
  },
  onDisconnected:info=>{
   if(x10Connection!==connection)return;
   x10Flush();
   $('x10Connect').textContent='Conectar X10';
   x10Details();
   if(info?.unexpected&&!x10Connecting)x10ScheduleRetry();
  },
  onMode:(mode,limits)=>{x10SetStatus('Modo '+mode+' identificado.');x10Log('Límites: '+JSON.stringify(limits));x10Details();},
  onLimits:limits=>{x10Log('Límites físicos actualizados: '+JSON.stringify(limits));x10Details();},
  onPen:x10Pen,
  onLiveDiagnostic:()=>{
   x10Details();
  },
  onNewPage:x10NewPhysicalPage,
  onPageCount:n=>{x10Log('Contador lógico X10: '+n);x10Details();},
  onUndecodedNote:b=>{
   x10Unknown++;
   if(x10Unknown===1)x10SetStatus('La X10 envía tinta en modo agenda, pero aún falta validar este formato.');
   if(x10Unknown%20===0)x10Details();
  },
  onDiagnostic:x10Log
 });
 return connection;
}
async function x10TryAutomatic(reason='inicio'){
 if(x10Connecting||x10Connection?.connected||!x10AutoEnabled()||x10ManualPause||document.hidden)return false;
 const id=localStorage.getItem('minote_x10_device_id');
 if(!id&&!x10InMemoryDevice)return false;
 // Android instalado: no intentar recuperar permisos al arrancar si aún no hay
 // un BluetoothDevice vivo. La petición pendiente podría interferir con el toque.
 if(/Android/i.test(navigator.userAgent||'')&&!x10InMemoryDevice&&!window.MiNoteNativeBLE)return false;
 x10Connecting=true;
 try{
  // En Android getDevices() suele estar deshabilitado, pero el objeto retornado
  // por requestDevice() sigue siendo reutilizable mientras la página esté viva.
  let known=x10InMemoryDevice&&(!id||x10InMemoryDevice.id===id)?x10InMemoryDevice:null;
  if(!known&&window.MiNoteNativeBLE)known=await window.MiNoteNativeBLE.getSavedDevice(id);
  let method=known?'sesión activa':'permiso guardado';
  if(!known&&navigator.bluetooth&&typeof navigator.bluetooth.getDevices==='function'){
   const devices=await navigator.bluetooth.getDevices();
   // El identificador procede de la autorización de esta misma web.
   known=devices.find(d=>d.id===id);
  }
  if(!known){
   x10SetStatus('La X10 necesita autorización manual en este navegador. Pulsa «Conectar X10»; la reconexión durante la sesión sí puede ser automática.');
   x10RefreshCapability();
   return false;
  }
  x10SetStatus('Reconectando X10 ('+method+', '+reason+')…');
  const connection=x10MakeConnection();x10Connection=connection;
  await connection.connectSaved(known);
  x10InMemoryDevice=known;
  x10AutoTries=0;x10CancelRetry();
  x10SetStatus('X10 reconectada automáticamente. Puedes escribir en tu agenda.');
  x10Details();return true;
 }catch(err){
  x10SetStatus('La X10 no respondió a la reconexión: '+err.message);
  x10Log('Error reconexión: '+err.message);
  x10ScheduleRetry();
  return false;
 }finally{x10Connecting=false;x10Details();}
}
function x10RefreshCapability(){
 const el=$('x10ReconnectHint');
 if(el)el.textContent='Android puede reconectar la X10 autorizada cuando Bluetooth esté disponible. Mantenga la app abierta para conservar la sesión.';
}
function setupX10(){
 if(!window.MiNoteX10Ble){$('x10OpenBtn').disabled=true;return;}
 $('x10Rotation').value=localStorage.getItem('minote_x10_rotation')||'auto';
 $('x10AutoPage').checked=localStorage.getItem('minote_x10_auto_page')!=='false';
 $('x10AutoConnect').checked=localStorage.getItem('minote_x10_auto_connect')!=='false';
 x10RefreshCapability();
 $('x10Rotation').onchange=e=>{localStorage.setItem('minote_x10_rotation',e.target.value);x10SetStatus('Orientación seleccionada. Se aplicará a los nuevos trazos.');};
 $('x10AutoPage').onchange=e=>localStorage.setItem('minote_x10_auto_page',String(e.target.checked));
 $('x10AutoConnect').onchange=e=>{
  localStorage.setItem('minote_x10_auto_connect',String(e.target.checked));
  x10CancelRetry();x10AutoTries=0;
  if(e.target.checked){x10ManualPause=false;void x10TryAutomatic('preferencia activada');}
  else x10SetStatus('Conexión automática desactivada. Puedes seguir conectando de forma manual.');
 };
 const directArea=$('x10DirectArea');
 const installedAndroid=!!window.MiNoteNativeBLE || /Android/i.test(navigator.userAgent||'') &&
  (window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches);
 directArea.hidden=!installedAndroid;
 $('x10DirectConnect').onclick=()=>{
  if(x10Connection?.connected){
   notice('La Huion X10 ya está conectada.');return;
  }
  x10ManualPause=false;x10CancelRetry();x10AutoTries=0;
  // El identificador fue guardado únicamente después de una selección y
  // conexión exitosas. En Android el adaptador BLE puede conectar por ID sin
  // volver a buscar ni mostrar el selector de dispositivos.
  const rememberedId=localStorage.getItem('minote_x10_device_id');
  if(rememberedId&&window.MiNoteNativeBLE?.getSavedDevice){
   const connection=x10MakeConnection();
   x10Connection=connection;
   const attempt=Symbol('X10 recordada');
   x10ManualAttempt=attempt;
   x10SetStatus('Reconectando Huion X10 guardada sin buscar dispositivos…');
   x10Details();
   Promise.resolve().then(()=>window.MiNoteNativeBLE.getSavedDevice(rememberedId))
    .then(async device=>{
     if(x10ManualAttempt!==attempt)return;
     if(!device?.gatt)throw Error('No se pudo recuperar la X10 guardada.');
     await connection.connectSaved(device);
     if(x10ManualAttempt!==attempt)return;
     x10InMemoryDevice=device;
     x10SetStatus('X10 guardada conectada. Ya puedes escribir.');
     notice('Huion X10 reconectada sin abrir el selector Bluetooth.');
     x10Details();
    }).catch(error=>{
     if(x10ManualAttempt!==attempt)return;
     x10SetStatus('Error al reconectar la X10 guardada: '+error.message+
      '. Enciende la agenda y vuelve a tocar Bluetooth; para cambiarla, usa Conectar X10 en los ajustes.');
     x10Details();
    });
   return;
  }
  // Sin dispositivo previamente vinculado: solo entonces abrir el selector.
  const connection=x10MakeConnection();x10Connection=connection;
  let chooser;
  // CRÍTICO: requestDevice() se inicia directamente en el clic, sin awaits,
  // sin showModal y sin diálogos HTML activos.
  try{
   chooser=connection.selectDevice(false);
   x10SetStatus('Selector Bluetooth solicitado fuera del diálogo.');
   notice('Solicitando el selector Bluetooth desde la pantalla principal…');
  }catch(e){
   const msg='Bluetooth no pudo iniciar: '+(e.name||'Error')+' · '+e.message;
   x10SetStatus(msg);notice(msg,true);return;
  }
  let pending=true;
  const timer=setTimeout(()=>{
   if(pending){
    x10SetStatus('Android no abrió el selector ni respondió. Puede tratarse del permiso de Bluetooth de la instalación WebAPK.');
    notice('Android no mostró el selector Bluetooth desde la pantalla principal.',true);
   }
  },10000);
  chooser.then(async device=>{
   pending=false;clearTimeout(timer);
   x10SetStatus('Huion seleccionada. Conectando…');
   await connection.connectSaved(device);
   x10InMemoryDevice=device;
   if(device.id)localStorage.setItem('minote_x10_device_id',device.id);
   x10SetStatus('X10 conectada correctamente desde la aplicación.');
   notice('Huion X10 conectada. Ya puedes escribir.');
   x10Details();
  }).catch(e=>{
   pending=false;clearTimeout(timer);
   const msg='Bluetooth: '+(e.name||'Error')+' · '+e.message;
   x10SetStatus(msg);notice(msg,true);
  });
 };
 $('x10OpenBtn').onclick=()=>$('x10Dialog').showModal();
 $('x10Close').onclick=()=>$('x10Dialog').close();
 $('x10BindPage').onclick=x10BindCurrent;
 $('x10ApplyRotation').onclick=x10Reorient;
 $('x10CopyDiagnostic').onclick=async()=>{
  const txt=x10Logs.join('\\n')+'\\n'+JSON.stringify({mode:x10Connection?.mode,limits:x10Connection?.limits,unknown:x10Unknown,points:x10PointCount,physicalPages:x10PhysicalPages},null,2);
  try{await navigator.clipboard.writeText(txt);x10SetStatus('Diagnóstico copiado. No incluye trazos ni contenido de tus notas.');}
  catch(e){x10SetStatus('No se pudo copiar: '+e.message);}
 };
 $('x10Connect').onclick=()=>{
  // No awaits antes de requestDevice: el selector requiere activación táctil.
  if(x10Connection?.connected){
   x10ManualPause=true;x10CancelRetry();x10Flush();x10InMemoryDevice=null;
   x10Connection.disconnect();x10SetStatus('X10 desconectada manualmente.');
   x10Details();return;
  }
  x10ManualPause=false;x10CancelRetry();x10AutoTries=0;
  // Un intento automático puede quedar pendiente sin resolver en Android.
  // No bloquear el clic del usuario por ese intento anterior.
  const connection=x10MakeConnection();
  const previous=x10Connection;
  x10Connection=connection;
  let selection;
  try{
   x10SetStatus('Abriendo selector Bluetooth de Android…');
   selection=connection.selectDevice(false); // petición inmediata, sin await
  }catch(e){
   x10SetStatus('No se pudo abrir el selector: '+e.name+' · '+e.message);
   x10Details();return;
  }
  const attempt=Symbol('selección X10');
  x10ManualAttempt=attempt;
  let waiting=true;
  const watchdog=setTimeout(()=>{
   if(waiting&&x10ManualAttempt===attempt)
    x10SetStatus('Android no mostró el selector Bluetooth. Prueba «Buscar solo Huion»; si tampoco aparece, envía el diagnóstico.');
  },10000);
  selection.then(async device=>{
   if(x10ManualAttempt!==attempt)return;
   waiting=false;clearTimeout(watchdog);
   x10SetStatus('Dispositivo seleccionado: '+(device.name||'X10')+'. Estableciendo conexión…');
   await connection.connectSaved(device);
   if(x10ManualAttempt!==attempt)return;
   x10InMemoryDevice=device;
   if(device.id)localStorage.setItem('minote_x10_device_id',device.id);
   x10SetStatus('X10 conectada. Escribe con el lápiz de tinta.');
   x10Details();
  }).catch(e=>{
   if(x10ManualAttempt!==attempt)return;
   waiting=false;clearTimeout(watchdog);
   x10SetStatus('Bluetooth: '+(e.name||'Error')+' · '+e.message);
   x10Details();
  });
 };
 $('x10FilteredConnect').onclick=()=>{
  if(x10Connection?.connected)return;
  const connection=x10MakeConnection();x10Connection=connection;
  let selection;
  try{selection=connection.selectDevice(true);x10SetStatus('Buscando dispositivos Huion…');}
  catch(e){x10SetStatus('Bluetooth: '+e.name+' · '+e.message);return;}
  const attempt=Symbol('Huion filtrada');x10ManualAttempt=attempt;
  selection.then(async device=>{
   if(x10ManualAttempt!==attempt)return;
   await connection.connectSaved(device);
   if(x10ManualAttempt!==attempt)return;
   x10InMemoryDevice=device;
   if(device.id)localStorage.setItem('minote_x10_device_id',device.id);
   x10SetStatus('X10 conectada.');x10Details();
  }).catch(e=>{if(x10ManualAttempt===attempt)x10SetStatus('Bluetooth: '+e.name+' · '+e.message);});
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)x10Flush();
  else if(!x10Connection?.connected){x10CancelRetry();x10AutoTries=0;void x10TryAutomatic('volver a la aplicación');}
 });
 x10Details();
 // Nunca solicita nuevos permisos en segundo plano: usa únicamente el dispositivo ya autorizado.
 Promise.resolve().then(()=>x10TryAutomatic('inicio'));
}

async function start(){try{db=await openDb();state=await getSaved();if(!state||state.schema!==VERSION||!Array.isArray(state.notebooks))state=starter();syncActive();setupEvents();render();await persist();}catch(err){console.error(err);document.body.innerHTML='<main style="padding:25px"><h1>No se pudo iniciar Mi Note</h1><p>El navegador debe permitir IndexedDB. Prueba Chrome o Edge en HTTPS o localhost.</p><pre>'+esc(err.message)+'</pre></main>';}}
start();
