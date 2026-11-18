import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const stage=path.join(process.cwd(),'stage');
const html=await fs.readFile(path.join(stage,'index.html'),'utf8');
const app=await fs.readFile(path.join(stage,'app.js'),'utf8');
const ui=await fs.readFile(path.join(stage,'landscape-ui.js'),'utf8');
const floating=await fs.readFile(path.join(stage,'floating-ui.js'),'utf8');
// V0.41: no hay selector manual; vertical es A5 y ambos giros de
// pantalla apaisada utilizan la misma transformación validada landscape-cw.
assert(!html.includes('id="landscapeOrientation"'),'No debe mostrarse un selector manual de orientación');
assert(ui.includes("window.innerWidth>window.innerHeight?'landscape-cw':'portrait'"),
 'La hoja no sigue la orientación física de Android');
assert(ui.includes('layout.set(wanted)'),'Falta aplicar la orientación de la pantalla');
assert(ui.includes("screen.orientation?.addEventListener?.('change'"),
 'Falta escuchar el giro del teléfono');
assert(floating.includes("window.innerWidth>window.innerHeight?'vertical':'horizontal'"),
 'La barra debe ser vertical en horizontal y horizontal en A5');
assert(app.includes("if((pg.orientation||'landscape-cw')==='landscape-cw')"),
 'No se conserva la transformación apaisada de la agenda');
assert(app.includes("const rot=page()?.orientation||'landscape-cw'"),
 'El toque no sigue la transformación de la hoja');
assert(!ui.includes("?'landscape-ccw':"),
 'No debe invertir el giro horizontal izquierdo');
console.log('OK V0.41: hoja y barra automáticas, ambos giros horizontales con landscape-cw.');
