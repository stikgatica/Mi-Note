/* Huion Note AHN/AHNS → Mi Note. Only local data, no network requests.
   AHNS is a ZIP containing an AHN ZIP. The inner note.info contains page IDs,
   and page/<id>.page contains an array of strokes with JSON-encoded elements.
*/
import JSZip from 'jszip';
const MAX_ARCHIVE=16*1024*1024, MAX_TOTAL=36*1024*1024, MAX_POINTS=600000;
const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function fingerprint(bytes){
 const buffer=await crypto.subtle.digest('SHA-256',bytes);
 return hex(new Uint8Array(buffer)).slice(0,24);
}
function assertSize(entries){
 let total=0;
 for(const f of Object.values(entries)){
  if(f.dir)continue;
  const len=Number(f?._data?.uncompressedSize||0);
  if(len>MAX_TOTAL)throw Error('El archivo Huion contiene un elemento demasiado grande.');
  total+=len;
  if(total>MAX_TOTAL)throw Error('El archivo Huion supera el límite de descompresión segura.');
 }
}
async function loadZip(bytes){
 if(bytes.byteLength>MAX_ARCHIVE||bytes.byteLength<10)throw Error('Archivo Huion demasiado grande o vacío.');
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true,createFolders:false});
 assertSize(zip.files);
 return zip;
}
function asPoint(v){
 if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return null;
 const press=Number.isFinite(v.press)?v.press:50;
 return [Number(Math.max(0,Math.min(1000,v.x*1000/1480)).toFixed(3)),
         Number(Math.max(0,Math.min(1400,v.y*1400/2100)).toFixed(3)),
         Number(Math.max(.08,Math.min(1,press/100)).toFixed(3))];
}
export async function parseHuionArchive(bytes,{selection='last-two',filename='Archivo Huion'}={}){
 if(!(bytes instanceof Uint8Array))throw Error('El archivo Huion no contiene bytes válidos.');
 const hash=await fingerprint(bytes);
 let zip=await loadZip(bytes);
 if(!zip.file('note.info')){
  const child=Object.values(zip.files).filter(f=>!f.dir&&/\.ahn$/i.test(f.name));
  if(child.length!==1)throw Error('No se encontró un documento .ahn único dentro del .ahns.');
  const inner=await child[0].async('uint8array');
  zip=await loadZip(inner);
 }
 const metaFile=zip.file('note.info');
 if(!metaFile)throw Error('No se encontró note.info en el archivo Huion.');
 const metadata=JSON.parse(await metaFile.async('string'));
 const order=metadata?.noteData?.pageInfos;
 if(!Array.isArray(order)||order.length<1||order.length>300)
  throw Error('La información de páginas Huion es inválida.');
 const selected=selection==='all'?order:order.slice(-2);
 const notebookId='huion-ahn-'+hash;
 const pages=[],seen=new Set();
 let totalPoints=0;
 for(const info of selected){
  const id=info?.id;
  if(!Number.isInteger(id)||id<0||id>10000||seen.has(id))continue;
  seen.add(id);
  const file=zip.file('page/'+id+'.page');
  if(!file)continue;
  const records=JSON.parse(await file.async('string'));
  if(!Array.isArray(records)||records.length>40000)throw Error('Página Huion no válida: '+id);
  const strokes=[];
  for(let j=0;j<records.length;j++){
   const v=records[j];
   let el;try{el=typeof v.element==='string'?JSON.parse(v.element):v.element;}catch{continue;}
   if(!Array.isArray(el?.points))continue;
   const points=[];
   for(const pt of el.points){
    const parsed=asPoint(pt);
    if(parsed){points.push(parsed);totalPoints++;}
    if(totalPoints>MAX_POINTS)throw Error('El archivo excede el límite de puntos permitido.');
   }
   if(points.length)strokes.push({
    id:notebookId+'-p'+id+'-s'+j,color:'#111827',width:2.5,pts:points,
    x10:{device:'Huion Note X10',mode:'official-ahns-import',sourcePage:id,sourceFormat:'ahn/ahns'}
   });
  }
  if(!strokes.length)continue;
  pages.push({
   id:notebookId+'-p'+id,title:'Huion oficial · página '+(id+1),
   template:'plain',strokes,updatedAt:new Date().toISOString(),
   huion:{device:'Huion Note X10',source:'huion-archive-import',originalPageIndex:id,
    originalPointCount:strokes.reduce((v,s)=>v+s.pts.length,0),sourceHashPrefix:hash}
  });
 }
 if(!pages.length)throw Error('No hay trazos en las páginas seleccionadas. Elija Todas las páginas para comprobar otras hojas.');
 return {schema:'mi-note-v1',exportedAt:new Date().toISOString(),notebooks:[{
  id:notebookId,title:'Huion · '+String(metadata.desc||filename||'Cuaderno').slice(0,60),
  pages,updatedAt:new Date().toISOString()
 }],summary:{pages:pages.length,points:totalPoints,sourcePages:order.length,selection}};
}
function decodeB64(b64){
 if(typeof b64!=='string'||b64.length>MAX_ARCHIVE*1.4)throw Error('El archivo Huion excede el límite permitido.');
 const raw=atob(b64),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
async function importFromAndroid(){
 const status=document.getElementById('x10ArchiveStatus');
 const say=t=>{if(status)status.textContent=t;};
 const trigger=document.getElementById('x10ImportArchive');
 if(trigger?.disabled)return;
 trigger.disabled=true;
 try{
  if(!window.MiNotePrivateBackup?.openHuionArchive)throw Error('Debe instalar la APK Mi Note V0.30.');
  const native=await window.MiNotePrivateBackup.openHuionArchive();
  if(native?.cancelled){say('Selección de archivo cancelada.');return;}
  say('Interpretando archivo Huion localmente…');
  const choice=document.getElementById('x10ArchiveSelection')?.value||'last-two';
  const content=await parseHuionArchive(decodeB64(native.base64),{selection:choice,filename:native.name});
  const out=await window.MiNoteAndroidActions.importHuionArchive(content);
  say('Archivo '+native.name+': '+content.summary.pages+' páginas / '+content.summary.points+' puntos. '+out.added+' nuevas; '+out.duplicates+' ya importadas. Abra Mis cuadernos.');
 }catch(e){say('No se pudo importar el archivo Huion: '+(e?.message||String(e)));}
 finally{trigger.disabled=false;}
}
if(typeof document!=='undefined')document.getElementById('x10ImportArchive')?.addEventListener('click',()=>void importFromAndroid());
