import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.join(process.cwd(),'stage');
const appFile=path.join(root,'app.js');
let app=await fs.readFile(appFile,'utf8');
function swap(a,b,label){if(!app.includes(a))throw Error('V0.21: falta '+label);app=app.replace(a,b);}
swap("selected:n.id===nb.id}))",
"selected:n.id===nb.id,cover:n.cover||'slate',updatedAt:n.updatedAt||'',createdAt:n.createdAt||n.updatedAt||''}))",
"campos de cuaderno");
swap(" async addNotebook(title){"," async addNotebook(title,options={}){","creador avanzado");
swap("x10Flush();const nb=emptyNotebook(value);\n  state.notebooks.push(nb);",
"x10Flush();const nb=emptyNotebook(value);nb.createdAt=now();\n  nb.cover=['slate','ocean','mint','coral','sand'].includes(options.cover)?options.cover:'slate';\n  nb.pages[0].template=['grid','ruled','plain'].includes(options.template)?options.template:'grid';\n  nb.pages[0].orientation=options.orientation==='portrait'?'portrait':'landscape-cw';\n  state.notebooks.push(nb);","opciones para nuevo cuaderno");
swap("window.MiNoteAndroidActions={\n snapshot(){",
"window.MiNoteAndroidActions={\n previewNotebook(id){const nb=state?.notebooks.find(n=>n.id===id);const p=nb?.pages[0];if(!p)return null;return {template:p.template,strokes:p.strokes.slice(-26).map(s=>({color:s.color,width:s.width,pts:s.pts.filter((_,i)=>i%Math.max(1,Math.ceil(s.pts.length/160))===0)}))};},\n snapshot(){",
"miniaturas");
await fs.writeFile(appFile,app);
const uiFile=path.join(root,'android-ui-main.js');
let ui=await fs.readFile(uiFile,'utf8');
if(!ui.includes("import './menu-v019.css';"))throw Error('V0.21 requiere V0.19');
ui=ui.replace("import './menu-v019.css';","import './menu-v019.css';\nimport './library-v021.css';");
const before="await load('biblioteca y navegación',()=>import('./library-page-ui.js'));";
if(!ui.includes(before))throw Error('Falta bootstrap biblioteca');
ui=ui.replace(before,"await load('biblioteca Huion',()=>import('./library-v021.js'));");
await fs.writeFile(uiFile,ui);
console.log('V0.21: biblioteca Huion y portadas configurables activadas.');
