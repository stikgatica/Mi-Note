import fs from 'node:fs/promises';
import path from 'node:path';
// Solamente APK Android; no afecta GitHub Pages.
const project=process.cwd(),stage=path.join(project,'stage');
let html=await fs.readFile(path.join(stage,'index.html'),'utf8');
if(!html.includes('id="x10OpenBtn"')||!html.includes('id="x10DirectConnect"'))throw Error('Faltan botones X10 originales');
const menu=[
'<div id="mobilePageDock" aria-label="Páginas"><span id="mobileTotalPages"></span></div>',
'<dialog id="mobileMoreDialog" class="dialog mobile-actions-dialog" aria-labelledby="mobileMoreTitle">',
'<div class="dialog-head"><h2 id="mobileMoreTitle">Opciones del cuaderno</h2><button id="closeMobileMore" class="icon-btn" type="button" aria-label="Cerrar">✕</button></div>',
'<div class="mobile-actions-list">',
'<button type="button" data-action="pageNumber">Todas las hojas</button>',
'<button type="button" data-action="renamePageBtn">Renombrar hoja</button>',
'<button type="button" data-action="exportSvg">Exportar SVG</button>',
'<button type="button" data-action="exportPng">Exportar PNG</button>',
'<button type="button" data-action="printPdf">Imprimir PDF</button>',
'<button type="button" data-action="backupBtn">Respaldo JSON</button>',
'<button type="button" data-action="importBtn">Importar archivo</button>',
'<button type="button" data-action="renameNotebookBtn">Renombrar cuaderno</button>',
'</div>',
'<label class="field">Papel<select id="mobilePaperSelect"><option value="grid">Cuadrícula</option><option value="ruled">Rayas</option><option value="plain">Blanco</option></select></label>',
'<label class="field">Grosor del lápiz <output id="mobileWidthValue">3</output><input id="mobilePenWidth" type="range" min="1" max="15" value="3"></label>',
'</dialog>'
].join('\n');
html=html.replace('aria-label="Opciones Huion Note X10"','aria-label="Conectar Huion X10"');
html=html.replace('◌ X10</button><button id="settingsBtn"','◌ Conectar X10</button><button id="settingsBtn"');
html=html.replace('<button id="fullscreenBtn" class="icon-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>','<button id="fullscreenBtn" class="icon-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button><button id="mobileMoreBtn" type="button" class="icon-btn mobile" title="Más opciones" aria-label="Más opciones">⋮</button>');
if(!html.includes('id="mobileMoreBtn"'))throw Error('No se pudo insertar menú móvil');
html=html.replace('</main>',menu+'\n</main>');
html=html.replace('</head>','<link rel="stylesheet" href="./mobile-ui.css">\n</head>');
html=html.replace('</body>','<script type="module" src="./mobile-ui.js"></script>\n</body>');
await fs.writeFile(path.join(stage,'index.html'),html);
for(const file of ['mobile-ui.css','mobile-ui.js'])await fs.copyFile(path.join(project,'src',file),path.join(stage,file));
console.log('Mi Note Android V0.6 preparado: escritura principal y X10 directo');
