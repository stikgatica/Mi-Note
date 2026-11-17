import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {parseHuionArchive} from '../src/huion-archive.js';
const record=(x,y)=>[{element:JSON.stringify({mode:3,points:[
 {x,y,press:50},{x:x+7,y:y+9,press:75}]})}];
async function fixture(wrap){
 const inner=new JSZip();
 inner.file('note.info',JSON.stringify({desc:'Agenda de prueba',noteData:{pageInfos:[
 {id:3},{id:4},{id:5}]}}));
 for(const [id,x] of [[3,120],[4,300],[5,900]]){
  inner.file('page/'+id+'.page',JSON.stringify(record(x,350)));
 }
 const bytes=await inner.generateAsync({type:'uint8array',compression:'DEFLATE'});
 if(!wrap)return bytes;
 const outer=new JSZip();outer.file('Agenda.ahn',bytes);
 return outer.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
test('lee .ahns anidado, importa solo las dos últimas páginas de forma predeterminada',async()=>{
 const data=await parseHuionArchive(await fixture(true));
 assert.equal(data.schema,'mi-note-v1');
 assert.equal(data.notebooks.length,1);
 assert.equal(data.notebooks[0].pages.length,2);
 assert.equal(data.summary.points,4);
 assert.deepEqual(data.notebooks[0].pages.map(p=>p.huion.originalPageIndex),[4,5]);
 assert.ok(data.notebooks[0].pages.every(p=>p.strokes[0].pts.length===2));
});
test('acepta .ahn directamente y permite importar todas las páginas',async()=>{
 const input=await fixture(false);
 const data=await parseHuionArchive(input,{selection:'all'});
 assert.deepEqual(data.notebooks[0].pages.map(p=>p.huion.originalPageIndex),[3,4,5]);
 assert.equal(data.summary.points,6);
 assert.deepEqual((await parseHuionArchive(input,{selection:'all'})).notebooks[0].pages.map(p=>p.id),data.notebooks[0].pages.map(p=>p.id));
});
