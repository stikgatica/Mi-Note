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
'<label class="landscape-control">Orientación de la hoja<select id="landscapeOrientation"><option value="portrait">Vertical A5</option><option value="landscape-cw" selected>Horizontal · girar derecha ↻</option></select></label>',
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
// V0.15: controles esenciales visibles incluso antes de cargar módulos JS.
const pageCounter='<button id="floatingPageNumber" class="floating-page-counter" type="button" title="Ver páginas o eliminar hoja" aria-label="Página 1 de 1. Administrar hoja">1 / 1</button>';
if(!html.includes('<button id="tvBoardNext"'))throw Error('Barra flotante sin botón siguiente');
html=html.replace('<button id="tvBoardNext"',pageCounter+'<button id="tvBoardNext"');
const x10Quick='<button id="floatingX10Quick" class="floating-x10-button" type="button" title="Conectar o ver estado Huion X10" aria-label="X10 desconectada. Conectar"><span id="floatingX10QuickDot" class="x10-status-dot" aria-hidden="true"></span>X10</button>';
html=html.replace('<button id="tvBoardMore"',x10Quick+'<button id="tvBoardMore"');
const x10Panel=[
 '<section id="floatingX10Panel" class="floating-x10-panel" aria-label="Huion X10">',
 '<div id="floatingX10Indicator" class="floating-x10-indicator" role="status"><span id="floatingX10MenuDot" class="x10-status-dot" aria-hidden="true"></span><strong id="floatingX10Label">Huion X10 · Desconectada</strong></div>',
 '<div class="floating-x10-controls">',
 '<button type="button" id="floatingX10ConnectNow">Conectar X10</button>',
 '<button type="button" id="floatingX10DisconnectNow" disabled>Desconectar</button>',
 '<button type="button" id="floatingX10ViewStatus">Ver estado</button>',
 '</div></section>'
].join('\n');
html=html.replace('<div class="mobile-actions-list">',x10Panel+'<div class="mobile-actions-list">');
const libraryDialog=[
 '<dialog id="floatingLibraryDialog" class="dialog floating-library-dialog" aria-labelledby="floatingLibraryTitle">',
 '<div class="dialog-head"><h2 id="floatingLibraryTitle">Mis cuadernos</h2><button type="button" id="floatingLibraryClose" class="icon-btn" aria-label="Cerrar biblioteca">✕</button></div>',
 '<div id="floatingLibraryItems" class="floating-library-items" role="list"></div>',
 '<label class="field" for="floatingNewNotebookName">Nombre del nuevo cuaderno<input id="floatingNewNotebookName" maxlength="90" autocomplete="off" placeholder="Ej.: Matemática"></label>',
 '<button id="floatingCreateNotebook" type="button" class="primary">＋ Crear cuaderno</button>',
 '<p id="floatingLibraryStatus" role="status" aria-live="polite"></p>',
 '</dialog>'
].join('\n');
html=html.replace('<div class="mobile-actions-list">','<div class="mobile-actions-list"><button id="floatingLibraryOpenMenu" type="button">▤ Mis cuadernos</button><button id="floatingNewNotebookMenu" type="button">＋ Nuevo cuaderno</button>');
html=html.replace('</main>',libraryDialog+'\n</main>');
const pageDialog=[
 '<dialog id="floatingPageDialog" class="dialog floating-page-dialog" aria-labelledby="floatingPageDialogTitle">',
 '<div class="dialog-head"><h2 id="floatingPageDialogTitle">Página 1 de 1</h2><button type="button" id="floatingPageClose" class="icon-btn" aria-label="Cerrar">✕</button></div>',
 '<p>Seleccione una acción para la hoja actual.</p>',
 '<button type="button" id="floatingPageGo">▤ Ir a otra hoja…</button>',
 '<button type="button" id="floatingPageDelete" class="delete-page">Eliminar hoja actual</button>',
 '<small id="floatingPageHint">La eliminación necesita confirmación y no se puede deshacer.</small>',
 '</dialog>'
].join('\n');
html=html.replace('</main>',pageDialog+'\n</main>');
if(!html.includes('<body>'))throw Error('Falta la etiqueta body Android');
html=html.replace('<body>','<body class="minote-android clean-notes">');
// El botón flotante está visible desde el HTML (sin depender del módulo JS).
html=html.replace('id="tvBoardToolbar" hidden','id="tvBoardToolbar" class="floating-bar"');
html=html.replace('</head>','<link rel="stylesheet" href="./mobile-ui.css">\n<link rel="stylesheet" href="./landscape-ui.css">\n<link rel=\"stylesheet\" href=\"./floating-ui.css\">\n</head>');
// El bootstrap importa primero el motor; evita scripts module con atributos escapados
// que Android WebView interpretaba como tipo inválido y no ejecutaba.
html=html.replace(/<script type="module" src="\.\/native-main\.js"><\/script>\s*/,'');
html=html.replace('</body>','<script type="module" src="./android-ui-main.js"></script>\n</body>');
await fs.writeFile(path.join(stage,'index.html'),html);
for(const file of ['mobile-ui.css','mobile-ui.js','replay.js','replay-timeline.mjs','personal-backup.js','memory-import.js','landscape-ui.css','landscape-ui.js','floating-ui.css','floating-ui.js','floating-geometry.mjs','floating-page-x10.js','library-page-ui.js','android-ui-main.js','menu-v019.js','menu-v019.css','library-v021.js','library-v021.css'])await fs.copyFile(path.join(project,'src',file),path.join(stage,file));
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
