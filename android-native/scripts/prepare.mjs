// Construye la interfaz del paquete Android a partir de android-native/src.
// No depende de archivos en la raíz ni registra service workers.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(project,'src');
const stage=path.join(project,'stage');
await fs.rm(stage,{recursive:true,force:true});
await fs.mkdir(stage,{recursive:true});

let html=await fs.readFile(path.join(source,'index.html'),'utf8');
if(!html.includes('</body>'))throw Error('Falta cierre de HTML Android.');
html=html.replace('</body>','<script type="module" src="./native-main.js"></script>\n</body>');
const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; connect-src \'none\'; object-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; base-uri \'none\'; form-action \'none\'">';
html=html.replace('<head>','<head>\n'+csp);
await fs.writeFile(path.join(stage,'index.html'),html);
for(const name of ['styles.css','app.js','x10-ble.js','native-main.js','ble-adapter.js','offline-x10.js'])
 await fs.copyFile(path.join(source,name),path.join(stage,name));
await fs.cp(path.join(source,'icons'),path.join(stage,'icons'),{recursive:true});
console.log('Mi Note X10: fuentes Android independientes preparadas.');
