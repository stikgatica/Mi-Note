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
'<button type="button" id="replayOpen">▶ Reproducir escritura</button>',
'<button type="button" id="x10MemoryOpen">▣ Importar memoria Huion X10</button>',
'<button type="button" id="personalBackupOpen">☁ Copia automática en Drive</button>',
'<button type="button" id="tvBoardToggle">▣ Proyectar en TV</button>',
'<button type="button" data-action="pageNumber">Todas las hojas</button>',
'<button type="button" data-action="renamePageBtn">Renombrar hoja</button>',
'<button type="button" data-action="exportSvg">Exportar SVG</button>',
'<button type="button" data-action="exportPng">Exportar PNG</button>',
'<button type="button" data-action="printPdf">Imprimir PDF</button>',
'<button type="button" data-action="backupBtn">Respaldo JSON</button>',
'<button type="button" data-action="importBtn">Importar archivo</button>',
'<button type="button" data-action="renameNotebookBtn">Renombrar cuaderno</button>',
'</div>',
'<label class="landscape-control">Orientación de la hoja<select id="landscapeOrientation"><option value="portrait">Vertical A5</option><option value="landscape-cw">Horizontal · girar derecha ↻</option><option value="landscape-ccw">Horizontal · girar izquierda ↺</option></select></label>',
'<label class="field">Papel<select id="mobilePaperSelect"><option value="grid">Cuadrícula</option><option value="ruled">Rayas</option><option value="plain">Blanco</option></select></label>',
'<label class="field">Grosor del lápiz <output id="mobileWidthValue">3</output><input id="mobilePenWidth" type="range" min="1" max="15" value="3"></label>',
'</dialog>'
].join('\n');

// El botón auxiliar "Conectar directamente" era una solución temporal. Conservamos
// su ID invisible para reutilizar el evento nativo Bluetooth del controlador principal,
// pero nunca lo mostramos en horizontal, TV o pantallas grandes.
html=html.replace(/<div id="x10DirectArea"[\s\S]*?<\/div>/,
  '<div id="x10DirectArea" hidden aria-hidden="true" style="display:none!important"><button id="x10DirectConnect" type="button" tabindex="-1">Conectar X10</button></div>');
html=html.replace('aria-label="Opciones Huion Note X10"','aria-label="Conectar Huion X10"');
html=html.replace('◌ X10</button><button id="settingsBtn"','◌ Conectar X10</button><button id="settingsBtn"');
html=html.replace('<button id="fullscreenBtn" class="icon-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>','<button id="fullscreenBtn" class="icon-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button><button id="mobileMoreBtn" type="button" class="icon-btn mobile" title="Más opciones" aria-label="Más opciones">⋮</button>');
if(!html.includes('id="mobileMoreBtn"'))throw Error('No se pudo insertar menú móvil');
const replayDialog=[
'<dialog id="replayDialog" class="dialog replay-dialog" aria-labelledby="replayTitle">',
'<div class="dialog-head"><h2 id="replayTitle">Reproducir escritura</h2><button type="button" id="replayClose" class="icon-btn" aria-label="Cerrar reproducción">✕</button></div>',
'<p id="replayStatus" role="status" aria-live="polite">Preparando trazos…</p>',
'<canvas id="replayCanvas" width="700" height="980" aria-label="Vista previa de la escritura"></canvas>',
'<div class="replay-controls"><input id="replaySeek" type="range" min="0" max="1000" value="0" aria-label="Avance de la reproducción"><output id="replayProgress">0%</output></div>',
'<div class="replay-controls"><button id="replayPlay" type="button" class="primary">▶ Reproducir</button><button id="replayRestart" type="button">↺ Reiniciar</button><label>Velocidad <select id="replaySpeed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label></div>',
'<div class="replay-controls"><button id="replayVideo" type="button">Guardar video WebM</button></div>',
'<small>Los trazos se reproducen en orden. Para hojas antiguas, la duración es aproximada. La hoja original no se modifica.</small>',
'</dialog>'
].join('\n');

const memoryDialog=[
'<dialog id="x10MemoryDialog" class="dialog memory-import-dialog" aria-labelledby="x10MemoryTitle">',
'<div class="dialog-head"><h2 id="x10MemoryTitle">Importar memoria Huion X10</h2><button type="button" id="x10MemoryClose" class="icon-btn" aria-label="Cerrar">✕</button></div>',
'<p>Recupere las páginas que escribió con la Huion desconectada. No se eliminará ninguna hoja de la memoria física.</p>',
'<label class="field">Guardar páginas en<select id="x10MemoryNotebook" aria-label="Cuaderno de destino"></select></label>',
'<label id="x10MemoryNewNameWrap" class="field">Nombre del cuaderno nuevo<input id="x10MemoryName" type="text" maxlength="90" value="Huion X10 · Memoria"></label>',
'<label class="field">PIN de la agenda, solo si lo pide<input id="x10MemoryPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="Opcional"></label>',
'<div id="x10MemoryProgress" class="x10-details" role="status" aria-live="polite">Conecte la Huion antes de importar.</div>',
'<div class="memory-import-actions"><button id="x10MemoryRun" type="button" class="primary">↓ Importar memoria</button><button id="x10MemoryCancel" type="button" disabled>Cancelar lectura</button></div>',
'<small>Importación no destructiva. Se omiten páginas ya recuperadas. Las nuevas hojas se guardan localmente y entran en el respaldo cifrado de Drive si está configurado. La lectura del protocolo Bluetooth requiere validación con su Huion física.</small>',
'</dialog>'
].join('\n');
const personalDialog="<dialog id=\"personalBackupDialog\" class=\"dialog personal-backup-dialog\" aria-labelledby=\"personalBackupTitle\">\n<div class=\"dialog-head\"><h2 id=\"personalBackupTitle\">Copia privada en Drive</h2><button id=\"personalBackupClose\" class=\"icon-btn\" aria-label=\"Cerrar\">✕</button></div>\n<p>Seleccione Google Drive desde el selector de archivos de Android. Mi Note accederá únicamente al archivo que usted autorice.</p>\n<div class=\"personal-backup-actions\"><button id=\"personalBackupNew\" type=\"button\">Crear copia nueva</button><button id=\"personalBackupExisting\" type=\"button\">Vincular copia existente</button></div>\n<label class=\"field\">Contraseña de cifrado (mínimo 12 caracteres)<input id=\"personalBackupPassword\" type=\"password\" autocomplete=\"new-password\" minlength=\"12\"></label>\n<label class=\"field\">Repita la contraseña si crea una copia nueva<input id=\"personalBackupConfirm\" type=\"password\" autocomplete=\"new-password\" minlength=\"12\"></label>\n<div class=\"personal-backup-actions\"><button id=\"personalBackupUnlock\" type=\"button\" class=\"primary\">Activar copia cifrada</button><button id=\"personalBackupSync\" type=\"button\">Sincronizar ahora</button></div>\n<div id=\"personalBackupStatus\" class=\"x10-details\" role=\"status\" aria-live=\"polite\">Sin configurar</div>\n<button id=\"personalBackupUnlink\" type=\"button\" class=\"subtle\">Desvincular archivo</button>\n<small>La contraseña no se envía a Google. La clave de cifrado se protege en Android Keystore. La copia es un archivo cifrado; sin la contraseña no se podrá recuperar tras reinstalar. La sincronización funciona mientras la app está activa y puede quedar pendiente hasta que Google Drive suba el archivo. No se eliminan sus cuadernos locales.</small>\n</dialog>";
const projectionToolbar="<div id=\"tvBoardToolbar\" hidden aria-label=\"Controles de pizarra\">\n<button id=\"tvBoardPen\" type=\"button\" title=\"Lápiz\" aria-label=\"Lápiz\">✎</button>\n<button id=\"tvBoardErase\" type=\"button\" title=\"Borrador\" aria-label=\"Borrador\">⌫</button>\n<button id=\"tvBoardUndo\" type=\"button\" title=\"Deshacer\" aria-label=\"Deshacer\">↶</button>\n<button id=\"tvBoardPrev\" type=\"button\" title=\"Página anterior\" aria-label=\"Página anterior\">‹</button>\n<button id=\"tvBoardNext\" type=\"button\" title=\"Página siguiente\" aria-label=\"Página siguiente\">›</button>\n<button id=\"tvBoardOrientation\" type=\"button\" title=\"Girar hoja\" aria-label=\"Girar hoja\">⤾</button>\n<button id=\"tvBoardFullscreen\" type=\"button\" title=\"Pantalla completa\" aria-label=\"Pantalla completa\">⛶</button>\n<button id=\"tvBoardMore\" type=\"button\" title=\"Opciones\" aria-label=\"Opciones\">⋮</button>\n<button id=\"tvBoardClose\" type=\"button\" title=\"Salir de proyección\" aria-label=\"Salir de pizarra\">✕</button>\n</div>\n<div id=\"tvBoardHint\" hidden role=\"status\"></div>";
html=html.replace('</main>',menu+'\n'+replayDialog+'\n'+personalDialog+'\n'+memoryDialog+'\n'+projectionToolbar+'\n</main>');
html=html.replace('</head>','<link rel="stylesheet" href="./mobile-ui.css">\n<link rel="stylesheet" href="./landscape-ui.css">\n</head>');
html=html.replace('</body>','<script type="module" src="./mobile-ui.js"></script>\n<script type="module" src="./replay.js"></script>\n<script type="module" src="./personal-backup.js"></script>\n<script type="module" src="./memory-import.js"></script>\n<script type="module" src="./landscape-ui.js"></script>\n</body>');
await fs.writeFile(path.join(stage,'index.html'),html);
for(const file of ['mobile-ui.css','mobile-ui.js','replay.js','replay-timeline.mjs','personal-backup.js','memory-import.js','landscape-ui.css','landscape-ui.js'])await fs.copyFile(path.join(project,'src',file),path.join(stage,file));
console.log('Mi Note Android V0.6 preparado: escritura principal y X10 directo');

// Solo en el paquete Android: acceso seguro a una copia de la hoja actual.
const appFile=path.join(stage,'app.js');
let app=await fs.readFile(appFile,'utf8');
const replayHook="window.MiNoteReplaySnapshot=()=>({title:page().title,template:page().template,strokes:clone(page().strokes)});";
if(!app.includes('start();'))throw Error('No se pudo registrar la lectura de la hoja');
app=app.replace(/start\(\);\s*$/,match=>match+'\n'+replayHook+'\n'
 +'window.MiNoteBackupSnapshot=()=>({schema:VERSION,notebooks:clone(state.notebooks),exportedAt:now()});\n'
 +'window.MiNoteBackupMerge=(data)=>mergeBackup(data);\n');
await fs.writeFile(appFile,app);

if(!app.includes('minote:changed')){
  app=app.replace("function persist(){const snapshot=clone(state);",
    "function persist(){const snapshot=clone(state);queueMicrotask(()=>window.dispatchEvent(new Event('minote:changed')));");
}
await fs.writeFile(appFile,app);
