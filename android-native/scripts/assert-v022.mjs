import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const app=await fs.readFile('stage/app.js','utf8');
const css=await fs.readFile('stage/floating-ui.css','utf8');
assert(app.includes("liveCanvas.getContext('2d',{alpha:true})"),'La capa activa debe tener alpha');
assert(app.includes('background:transparent!important'),'El overlay debe declarar transparencia explícita');
assert(css.includes('canvas#minoteLiveInkCanvas'),'El selector de CSS debe distinguir el canvas de tinta');
assert(css.includes('background:transparent!important'),'El CSS debe preservar transparencia');
assert(css.includes('canvas#paper'),'La base debe ser el papel blanco');
assert(app.includes('page().strokes.push(inStroke);inStroke=null;'),'El trazo terminado debe guardarse en la hoja');
assert(app.includes('clearLive();paint();updatePage();'),'Al finalizar el trazo, pintar tinta persistida ANTES de guardar');
assert(app.includes('pg.strokes.push(stroke);'),'La tinta X10 terminada debe guardarse');

const [ble,ui,batteryCss,bootstrap]=await Promise.all([
 fs.readFile('stage/x10-ble.js','utf8'),
 fs.readFile('stage/battery-ui-v022.js','utf8'),
 fs.readFile('stage/battery-ui-v022.css','utf8'),
 fs.readFile('stage/android-ui-main.js','utf8')
]);
assert(app.includes("window.MiNoteX10BatteryRefresh="),'Falta puente de batería BLE');
assert(ble.includes("BATTERY_SERVICE='0000180f-"),'Falta servicio estándar de batería');
assert(ble.includes("BATTERY_LEVEL='00002a19-"),'Falta característica de nivel de batería');
assert(ble.includes('this.device.gatt.getPrimaryService(BATTERY_SERVICE)'),'No consulta GATT real');
assert(ble.includes('this.notifyBattery(null)'),'No resetea batería al desconectar');
assert(bootstrap.includes("import './battery-ui-v022.css'"),'Faltan estilos batería');
assert(bootstrap.includes("import('./battery-ui-v022.js')"),'Falta interfaz batería');
assert(ui.includes("level+'%'"),'No presenta porcentaje confirmado');
assert(ui.includes('Batería: no disponible'),'No avisa cuando hardware carece de servicio');
assert(batteryCss.includes('background:transparent!important'),'La tinta superior no es transparente');

console.log('V0.22 OK: tinta visible sobre fondo transparente y persistencia de trazos.');
