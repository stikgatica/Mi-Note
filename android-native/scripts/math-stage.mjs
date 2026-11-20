// Modo Matemática en WebView Android: puente mínimo de datos, sin tocar BLE ni importar memoria.
// Ejecutar después de todos los parches que construyen stage/app.js y android-ui-main.js.
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),stage=path.join(root,'stage');
await fs.cp(path.join(root,'src','math'),path.join(stage,'math'),{recursive:true});
await fs.cp(path.join(root,'src','calendar'),path.join(stage,'calendar'),{recursive:true});
// Indicador de proximidad: módulo y estilos exclusivos de Android.
for(const file of ['x10-device-info-v051.js','x10-device-info.css','x10-device-cache.mjs'])
 await fs.copyFile(path.join(root,'src',file),path.join(stage,file));
for(const file of ['pen-hover.js','pen-hover.css','pen-hover-geometry.mjs'])
 await fs.copyFile(path.join(root,'src',file),path.join(stage,file));
// El manejador de Atrás nativo se carga desde android-ui-main.js.
await fs.copyFile(path.join(root,'src','android-back.js'),path.join(stage,'android-back.js'));
const appPath=path.join(stage,'app.js');
let app=await fs.readFile(appPath,'utf8');
const original='for(const s of pg.strokes)drawStroke(ctx,s);';
if(!app.includes(original))throw Error('Matemática: no se encontró el pintor de trazos de Mi Note.');
app=app.replace(original,
 'for(const s of pg.strokes)if(!window.MiNoteMathVisibility?.(pg.id,s.id))drawStroke(ctx,s);');
const compare="template:p.template,strokes:p.strokes";
if(!app.includes(compare))throw Error('Matemática: no se localizó comparador de versiones de hoja.');
app=app.replace(compare,"template:p.template,strokes:p.strokes,mathLayer:p.mathLayer||null");
// El lápiz X10 solo actualiza la marca visual si entrega una posición
// de hover real (presión cero y SIN contacto). No se inventan coordenadas.
const x10Anchor='function x10Pen(raw,limits,mode){';
if(!app.includes(x10Anchor))throw Error('Puntero X10: no se encontró el receptor de muestras.');
app=app.replace(x10Anchor,x10Anchor+`
 if(raw?.touch&&raw?.press>0){
  if(!x10ActiveStroke)document.dispatchEvent(new Event('minote:x10-hover-end'));
 }else if(Number.isFinite(raw?.x)&&Number.isFinite(raw?.y)&&
  raw.x>0&&raw.y>0&&raw.x<=limits.maxX&&raw.y<=limits.maxY){
  const pt=MiNoteX10Ble.mapPoint(raw,limits.maxX,limits.maxY,x10RotationValue(mode),W,H,true);
  if(pt)document.dispatchEvent(new CustomEvent('minote:x10-hover',{detail:{x:pt[0],y:pt[1]}}));
 }
`);
// Exponer únicamente la lectura 0x85 (último índice) sin prometer capacidad.
const pageCountAnchor="onPageCount:n=>{x10Log('Contador lógico X10: '+n);x10Details();},";
if(!app.includes(pageCountAnchor))throw Error('No se encontró lector X10 0x85.');
app=app.replace(pageCountAnchor,
 "onPageCount:n=>{x10Log('Contador lógico X10: '+n);x10Details();"+
 "window.dispatchEvent(new CustomEvent('minote:x10-memory-index',{detail:{lastIndex:n}}));},");
const events=[
 ["pg.strokes.push(stroke);pg.updatedAt=now();nb.updatedAt=now();",
  "pg.strokes.push(stroke);pg.updatedAt=now();nb.updatedAt=now();"+
  "document.dispatchEvent(new CustomEvent('minote:stroke-finished',{detail:{pageId:pg.id,strokeId:stroke.id,source:'huion'}}));"],
 ["page().strokes.push(inStroke);inStroke=null;",
  "page().strokes.push(inStroke);inStroke=null;"+
  "document.dispatchEvent(new CustomEvent('minote:stroke-finished',{detail:{pageId:page().id,strokeId:page().strokes.at(-1).id,source:'touch'}}));"]
];
for(const [from,to] of events){
 if(!app.includes(from))throw Error('Matemática automática: no se encontró el evento de trazo terminado: '+from);
 app=app.replace(from,to);
}

app+=`
/* API de la capa matemática. Los trazos originales no se modifican. */
window.MiNoteMathBridge={
 activePageId:()=>state?.activePageId||null,
 snapshot(){
  if(!state||!page())return null;
  const pg=page();
  // Vista de solo lectura: evita clonar miles de puntos al terminar cada trazo.
  // El módulo matemático copia los objetos antes de editar y solo saveLayer escribe.
  return {id:pg.id,template:pg.template,orientation:pg.orientation||'landscape-cw',
    strokes:pg.strokes,mathLayer:pg.mathLayer||null};
 },
 pointFromEvent:event=>pointFromEvent(event),
 repaint:()=>paint(),
 async saveLayer(layer){
  const pg=page();
  if(!pg||!layer||!Array.isArray(layer.objects)||layer.objects.length>250)
   throw Error('Capa matemática inválida.');
  const payload=clone({version:1,axis:'geometry',visible:layer.visible!==false,objects:layer.objects});
  // Las referencias son metadatos de una capa secundaria, nunca alteran pg.strokes.
  pg.mathLayer=payload;
  pg.updatedAt=now();note().updatedAt=now();
  await persist();
  window.dispatchEvent(new Event('minote:math-changed'));
  return true;
 }
};
`;
// Lectura de una hoja ya guardada, por IDs, sin cambiar la hoja activa.
app+=`
window.MiNoteCalendarImportRead=(notebookId,pageId)=>{
 const nb=state?.notebooks?.find(n=>n.id===notebookId);
 const pg=nb?.pages?.find(p=>p.id===pageId);
 if(!pg)return null;
 return {id:pg.id,title:pg.title,notebookTitle:nb.title,
  huion:pg.huion||null,strokes:pg.strokes};
};
`;
app+=`
window.MiNoteX10DeviceInfo={
 async queryMemoryIndex(){
  if(!x10Connection?.connected)throw Error('Primero conecte la Huion X10.');
  if(x10Connection.offlineReading)throw Error('Termine la importación de páginas antes de consultar.');
  if(x10Connection.sessionKind!=='agenda-pura')throw Error('La Huion no está en modo agenda.');
  // Solicitud de contador: NO es 0x8B (borrado) ni 0x8C (limpieza física).
  await x10Connection.send(Uint8Array.from([0xcd,0x85,0x08,0,0,0,0,0xed]));
 },
 // Modo explícito, sin reintentos. El módulo BLE espera respuesta 0x8C.
 clearDeviceCache(){
  return import('./x10-device-cache.mjs').then(module=>module.clearHuionPhysicalCache(x10Connection));
 }
};
`;
await fs.writeFile(appPath,app);
const entry=path.join(stage,'android-ui-main.js');
let ui=await fs.readFile(entry,'utf8');
const anchor="await load('batería X10',()=>import('./battery-ui-v022.js'));";
if(!ui.includes(anchor))throw Error('Matemática requiere la inicialización final Android tras batería.');
ui=ui.replace(anchor,anchor+"\nawait load('Modo Matemática',()=>import('./math/math-controller.js'));\nawait load('Indicador de punta',()=>import('./pen-hover.js'));\nawait load('Detalles seguros X10',()=>import('./x10-device-info-v051.js'));\nawait load('Recordatorios y Calendar',()=>import('./calendar/calendar-ui.js'));");
await fs.writeFile(entry,ui);
console.log('Matemática: análisis automático al finalizar trazos X10/táctiles y capa reversible integrada.');
