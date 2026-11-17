import fs from 'node:fs/promises';
import path from 'node:path';
// Exclusivo Android: mantener puntos originales de 1000x1400 y transformar solo la vista.
const file=path.join(process.cwd(),'stage','app.js');
let app=await fs.readFile(file,'utf8');
const change=(a,b,label)=>{if(!app.includes(a))throw Error('Landscape: falta '+label);app=app.replace(a,b);};
change("function paint(){const pg=page();if(!pg)return;const dpr=",
 "function paint(){const pg=page();if(!pg)return;const shell=document.querySelector('.paper-shell');if(shell)shell.dataset.orientation=pg.orientation||'landscape-cw';const dpr=", 'canvas');
change("ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);drawBackground(ctx,pg.template);",
 "if(pg.orientation==='landscape-cw')ctx.setTransform(0,canvas.height/W,-canvas.width/H,0,canvas.width,0);else if(pg.orientation==='landscape-ccw')ctx.setTransform(0,-canvas.height/W,canvas.width/H,0,0,canvas.height);else ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);drawBackground(ctx,pg.template);",
 'transformacion');
change("function pointFromEvent(e){const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(W,(e.clientX-b.left)*W/b.width)),Math.max(0,Math.min(H,(e.clientY-b.top)*H/b.height)),e.pointerType==='pen'?Math.min(1,Math.max(.08,e.pressure||.5)):.75];}",
 "function pointFromEvent(e){const b=canvas.getBoundingClientRect();const u=Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),v=Math.max(0,Math.min(1,(e.clientY-b.top)/b.height));const rot=page()?.orientation||'landscape-cw';const x=rot==='landscape-cw'?v*W:rot==='landscape-ccw'?(1-v)*W:u*W;const y=rot==='landscape-cw'?(1-u)*H:rot==='landscape-ccw'?u*H:v*H;return [x,y,e.pointerType==='pen'?Math.min(1,Math.max(.08,e.pressure||.5)):.75];}",
 'inversa tactil');
change("$('paperSelect').value=pg.template;",
 "$('paperSelect').value=pg.template;document.dispatchEvent(new CustomEvent('minote:page-rendered',{detail:{orientation:pg.orientation||'landscape-cw'}}));",
 'render');
change("pg.template=nb.pages.find(p=>p.id===x10ActivePageId)?.template||'plain';",
 "pg.template=nb.pages.find(p=>p.id===x10ActivePageId)?.template||'plain';pg.orientation=nb.pages.find(p=>p.id===x10ActivePageId)?.orientation||'landscape-cw';",
 'nueva hoja fisica');
change("pg.template=page().template;note().pages.push(pg);",
 "pg.template=page().template;pg.orientation=page().orientation||'landscape-cw';note().pages.push(pg);",
 'nueva hoja digital');
app += "\nwindow.MiNotePageLayout={get:()=>({orientation:page()?.orientation||'landscape-cw',pageId:page()?.id}),set:async orientation=>{if(!['portrait','landscape-cw'].includes(orientation))throw Error('Orientación inválida');if(!state||!page())throw Error('Mi Note no inició');x10Flush();if(inStroke)throw Error('Termine el trazo antes de girar');const pg=page();pg.orientation=orientation;pg.updatedAt=now();note().updatedAt=now();render();await persist();return orientation;},repaint:()=>paint()};\n";
await fs.writeFile(file,app);
console.log('Orientación por hoja + transformación inversa táctil añadidas.');
