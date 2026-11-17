// Monta la versión Android a partir de los archivos web existentes.
// No edita la PWA de GitHub Pages ni su almacén IndexedDB.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'..');
const root=path.resolve(project,'..');
const stage=path.join(project,'stage');
await fs.rm(stage,{recursive:true,force:true});
await fs.mkdir(stage,{recursive:true});

let html=await fs.readFile(path.join(root,'index.html'),'utf8');
html=html.replace(/<link rel="manifest"[^>]*>\s*/g,'');
html=html.replace(/<script src="\.\/(?:app|x10-ble|x10-android-help|pwa-update)\.js" defer><\/script>\s*/g,'');
if (!html.includes('</body>')) throw Error('No se encontró el cierre de index.html');
html=html.replace('</body>','<script type="module" src="./native-main.js"></script>\n</body>');
await fs.writeFile(path.join(stage,'index.html'),html);
for(const name of ['styles.css','app.js','x10-ble.js','x10-android-help.js'])
 await fs.copyFile(path.join(root,name),path.join(stage,name));
await fs.copyFile(path.join(project,'src','native-main.js'),path.join(stage,'native-main.js'));
await fs.copyFile(path.join(project,'src','ble-adapter.js'),path.join(stage,'ble-adapter.js'));
await fs.copyFile(path.join(project,'src','offline-x10.js'),path.join(stage,'offline-x10.js'));
await fs.cp(path.join(root,'icons'),path.join(stage,'icons'),{recursive:true});
const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; connect-src \'none\'; object-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; base-uri \'none\'; form-action \'none\'">';
let safeHtml=await fs.readFile(path.join(stage,'index.html'),'utf8');
safeHtml=safeHtml.replace('<head>','<head>\n'+csp);
safeHtml=safeHtml.replace('<button id="settingsBtn" class="subtle">☁ Drive</button>',
 '<button id="settingsBtn" class="subtle" hidden disabled aria-hidden="true">☁ Drive</button>');
safeHtml=safeHtml.replace('<strong id="pwaVersion">Mi Note V0.2.10</strong>','<strong id="pwaVersion">Mi Note X10 Android V0.4</strong>');
safeHtml=safeHtml.replace('<button id="pwaUpdateBtn" class="subtle" type="button">↻ Actualizar Mi Note</button>',
 '<button id="pwaUpdateBtn" class="subtle" type="button" hidden disabled>Actualizar Mi Note</button>');
await fs.writeFile(path.join(stage,'index.html'),safeHtml);

let safeApp=await fs.readFile(path.join(stage,'app.js'),'utf8');
const begin=safeApp.indexOf('function loadGoogleScript()');
const end=safeApp.indexOf('async function start()',begin);
if(begin===-1||end<=begin)throw Error('No se pudo deshabilitar Google Drive dentro de la app Android');
const blocked="Google Drive está desactivado en la versión Android privada. Usa el respaldo JSON local.";
const stubs=[
 "function loadGoogleScript(){return Promise.reject(Error("+JSON.stringify(blocked)+"));}",
 "async function authorizeDrive(){throw Error("+JSON.stringify(blocked)+");}",
 "async function driveFetch(){throw Error("+JSON.stringify(blocked)+");}",
 "async function driveList(){throw Error("+JSON.stringify(blocked)+");}",
 "async function getDriveFolder(){throw Error("+JSON.stringify(blocked)+");}",
 "async function uploadSnapshot(){throw Error("+JSON.stringify(blocked)+");}",
 "async function loadLatestSnapshot(){throw Error("+JSON.stringify(blocked)+");}"
].join('\n');
safeApp=safeApp.slice(0,begin)+stubs+'\n'+safeApp.slice(end);
await fs.writeFile(path.join(stage,'app.js'),safeApp);
console.log('Mi Note Android preparado a partir de la interfaz y protocolo existentes.');
