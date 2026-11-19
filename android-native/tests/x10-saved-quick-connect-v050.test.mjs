import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeBLE} from '../src/ble-adapter.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Android reconecta Huion X10 por ID conocido sin escanear lista',async()=>{
 const calls=[];
 const store=new Map([['minote_native_device_name','Huion X10']]);
 const ble={
  async initialize(){calls.push('initialize');},
  async isEnabled(){return true;},
  async connect(id){calls.push('connect:'+id);},
  async getServices(){return [];},
  async requestDevice(){calls.push('requestDevice');throw Error('No debe abrir el selector');}
 };
 const api=createNativeBLE(ble,{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)});
 const device=await api.getSavedDevice('saved-huion-id');
 assert.equal(device.name,'Huion X10');
 await device.gatt.connect();
 assert.ok(calls.includes('connect:saved-huion-id'));
 assert.ok(!calls.includes('requestDevice'));
});
test('El icono X10 conecta dispositivo guardado y conserva selector inicial',()=>{
 const app=read('../src/app.js');
 const quick=read('../src/floating-page-x10.js');
 assert.match(quick,/\$\('x10DirectConnect'\)\?\.click\(\)/);
 assert.match(app,/const rememberedId=localStorage\.getItem\('minote_x10_device_id'\)/);
 assert.match(app,/window\.MiNoteNativeBLE\?\.getSavedDevice/);
 assert.match(app,/connection\.connectSaved\(device\)/);
 assert.match(app,/const connection=x10MakeConnection\(\);x10Connection=connection;\s*let chooser/);
 assert.match(app,/chooser=connection\.selectDevice\(false\)/);
 assert.match(app,/if\(device\.id\)localStorage\.setItem\('minote_x10_device_id',device\.id\)/);
});
test('Estados de error Bluetooth no permanecen como búsqueda perpetua',()=>{
 const ui=read('../src/floating-page-x10.js');
 assert.match(ui,/function x10State\(\)/);
 assert.match(ui,/const pending=/);
 assert.match(ui,/const failure=/);
 assert.match(ui,/clearTimeout\(connectTimer\)/);
 assert.match(ui,/Error Bluetooth/);
});
test('APK V0.50 y mismo paquete de instalación',()=>{
 const workflow=read('../../.github/workflows/android-release.yml');
 const pkg=JSON.parse(read('../package.json'));
 assert.equal(pkg.version,'0.50.0');
 assert.match(workflow,/versionCode 50/);
 assert.match(workflow,/Mi-Note-X10-Android-v0\.50\.apk/);
 assert.match(workflow,/android-v0\.50/);
});
