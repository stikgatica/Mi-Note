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
await fs.cp(path.join(root,'icons'),path.join(stage,'icons'),{recursive:true});
console.log('Mi Note Android preparado a partir de la interfaz y protocolo existentes.');
