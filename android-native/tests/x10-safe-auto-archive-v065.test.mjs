import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDeletePage,validEligiblePages,deleteVerifiedPages} from '../src/x10-import-cleanup.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const A='a'.repeat(64),B='b'.repeat(64);
const pages=[{index:1,digest:A},{index:3,digest:B}];
const proof=()=>({verified:true,driveProvider:true,cloudUserConfirmed:true,
 sha:'f'.repeat(64),verifiedAt:Date.now(),pages});
test('el borrado selectivo solo permite 0x8B y orden descendente',async()=>{
 const command=[];
 const subs=new Set();
 const conn={connected:true,sessionKind:'agenda-pura',offlineReading:false,
  subscribeFrames(cb){subs.add(cb);return()=>subs.delete(cb);},
  async send(pkt){
   command.push([...pkt]);
   for(const cb of [...subs])cb(Uint8Array.of(0xcd,0x8b,0x04,1));
  }};
 const result=await deleteVerifiedPages(conn,pages,{proof:proof(),timeoutMs:1500});
 assert.deepEqual(command,[...pages].sort((a,b)=>b.index-a.index).map(x=>[0xcd,0x8b,8,x.index,0,0,0,0xed]));
 assert.deepEqual(result.deleted,[3,1]);
 assert.equal(subs.size,0);
 assert.equal(result.complete,true);
 assert.deepEqual([...buildDeletePage(3)],[0xcd,0x8b,8,3,0,0,0,0xed]);
});
test('páginas repetidas o con hash inválido nunca se borran',()=>{
 assert.equal(validEligiblePages([{index:1,digest:A},{index:1,digest:B}]),false);
 assert.equal(validEligiblePages([{index:1,digest:'invalid'}]),false);
 assert.equal(validEligiblePages([{index:1,digest:A},{index:3,digest:B}]),true);
 assert.throws(()=>buildDeletePage(-1));
});
test('sin Drive comprobado y dos confirmaciones nunca se manda DELETE_PAGE',async()=>{
 let calls=0;
 const conn={connected:true,sessionKind:'agenda-pura',offlineReading:false,subscribeFrames:()=>()=>{},
  async send(){calls++;}};
 for(const patch of [{driveProvider:false},{cloudUserConfirmed:false},{verified:false},
  {sha:'invalid'},{verifiedAt:Date.now()-20*60*1000},
  {pages:[{index:3,digest:B}]}]){
  await assert.rejects(deleteVerifiedPages(conn,pages,{proof:{...proof(),...patch},timeoutMs:500}));
 }
 assert.equal(calls,0);
});
test('desconectada o importando, el motor no borra',async()=>{
 let called=false;
 const conn={connected:false,sessionKind:'agenda-pura',offlineReading:false,
  subscribeFrames:()=>()=>{},send:async()=>{called=true;}};
 await assert.rejects(deleteVerifiedPages(conn,pages,{proof:proof()}));
 await assert.rejects(deleteVerifiedPages({...conn,connected:true,offlineReading:true},pages,{proof:proof()}));
 assert.equal(called,false);
});
test('ante un rechazo del dispositivo se detiene inmediatamente',async()=>{
 let sent=0;const subs=new Set();
 const conn={connected:true,sessionKind:'agenda-pura',offlineReading:false,
  subscribeFrames(cb){subs.add(cb);return()=>subs.delete(cb);},
  async send(){
   sent++;for(const cb of [...subs])cb(Uint8Array.of(0xcd,0x8b,4,0));
  }};
 await assert.rejects(deleteVerifiedPages(conn,pages,{proof:proof(),timeoutMs:500}),/rechazó/i);
 assert.equal(sent,1);
});
test('Drive se cifra, relee y contrasta cada hoja; no se infiere sincronía cloud',()=>{
 const backup=read('../src/personal-backup.js');
 const native=read('../native-backup/PrivateBackupPlugin.java');
 assert.match(backup,/prepareForPhysicalDelete/);
 assert.match(backup,/await sync\(\)/);
 assert.match(backup,/const verified=await native\.read\(\)/);
 assert.match(backup,/decryptEnvelope\(JSON\.parse\(verified\.content\),key\)/);
 assert.match(backup,/cloudUploadGuaranteed:false/);
 assert.match(native,/driveProvider/);
 assert.match(native,/com\.google\.android\.apps\.docs\.storage/);
});
test('importación bloquea borrado parcial y pide doble confirmación antes de 0x8B',()=>{
 const ui=read('../src/memory-import.js');
 const stage=read('../scripts/math-stage.mjs');
 const features=read('../scripts/features.mjs');
 assert.match(ui,/result\.partialImported\|\|result\.incomplete\|\|result\.undecodable/);
 assert.match(ui,/prepareForPhysicalDelete/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/window\.prompt/);
 assert.match(ui,/typed!=='BORRAR '/);
 assert.match(ui,/api\.deleteImported/);
 assert.match(ui,/MiNoteX10LiveStatusRefresh/);
 assert.match(stage,/x10-import-cleanup\.mjs/);
 assert.match(features,/getSaved\(\)/);
});
test('menú de Huion es simple, lectura al abrir y batería con sondeo de 2 minutos',()=>{
 const panel=read('../src/x10-device-info-v051.js');
 const battery=read('../src/battery-ui-v022.js');
 assert.match(panel,/Borrar páginas guardadas en la Huion X10/);
 assert.match(panel,/typed!=='LIMPIAR'/);
 assert.match(panel,/dialog,\{attributes:true,attributeFilter:\['open'\]\}/);
 assert.doesNotMatch(panel,/x10ProbeVendorStatus|x10OfficialBattery|x10OfficialMemory/);
 assert.match(battery,/MiNoteX10LiveStatusRefresh/);
 assert.match(battery,/setInterval\(/);
 assert.match(battery,/120000/);
 assert.match(battery,/minote:x10-vendor-status/);
});
