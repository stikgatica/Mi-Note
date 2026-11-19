// Modo Matemática en WebView Android: puente mínimo de datos, sin tocar BLE ni importar memoria.
// Ejecutar después de todos los parches que construyen stage/app.js y android-ui-main.js.
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),stage=path.join(root,'stage');
await fs.cp(path.join(root,'src','math'),path.join(stage,'math'),{recursive:true});
const appPath=path.join(stage,'app.js');
let app=await fs.readFile(appPath,'utf8');
const original='for(const s of pg.strokes)drawStroke(ctx,s);';
if(!app.includes(original))throw Error('Matemática: no se encontró el pintor de trazos de Mi Note.');
app=app.replace(original,
 'for(const s of pg.strokes)if(!window.MiNoteMathVisibility?.(pg.id,s.id))drawStroke(ctx,s);');
const compare="template:p.template,strokes:p.strokes";
if(!app.includes(compare))throw Error('Matemática: no se localizó comparador de versiones de hoja.');
app=app.replace(compare,"template:p.template,strokes:p.strokes,mathLayer:p.mathLayer||null");
const events=[
 ["pg.strokes.push(stroke);pg.updatedAt=now();nb.updatedAt=now();",
  "pg.strokes.push(stroke);pg.updatedAt=now();nb.updatedAt=now();"+
  "document.dispatchEvent(new CustomEvent('minote:stroke-finished',{detail:{pageId:pg.id,strokeId:stroke.id,source:'huion'}}));"],
 ["page().strokes.push(inStroke);inStroke=null;",
  "page().strokes.push(inStroke);"+
  "document.dispatchEvent(new CustomEvent('minote:stroke-finished',{detail:{pageId:page().id,strokeId:inStroke.id,source:'touch'}}));"+
  "inStroke=null;"]
];
for(const [from,to] of events){
 if(!app.includes(from))throw Error('Matemática automática: no se encontró el evento de trazo terminado: '+from);
 app=app.replace(from,to);
}

app+=`
/* API de la capa matemática. Los trazos originales no se modifican. */
window.MiNoteMathBridge={
 snapshot(){
  if(!state||!page())return null;
  const pg=page();
  return clone({id:pg.id,template:pg.template,orientation:pg.orientation||'landscape-cw',
    strokes:pg.strokes,mathLayer:pg.mathLayer||null});
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
await fs.writeFile(appPath,app);
const entry=path.join(stage,'android-ui-main.js');
let ui=await fs.readFile(entry,'utf8');
const anchor="await load('batería X10',()=>import('./battery-ui-v022.js'));";
if(!ui.includes(anchor))throw Error('Matemática requiere la inicialización final Android tras batería.');
ui=ui.replace(anchor,anchor+"\nawait load('Modo Matemática',()=>import('./math/math-controller.js'));");
await fs.writeFile(entry,ui);
console.log('Matemática: análisis automático al finalizar trazos X10/táctiles y capa reversible integrada.');
