/* Mi Note X10 Android: compartir una hoja o el cuaderno completo con SAF/Chooser.
   SVG = vector editable; PNG = imagen; PDF = A5 multipágina; libros SVG/PNG = ZIP. */
import JSZip from 'jszip';
import {exportBlob,encodeBase64,deliverFile} from './export-native.js';
const $=id=>document.getElementById(id);
const dialog=$('shareDocumentDialog');
const scope=$('shareDocumentScope'),format=$('shareDocumentFormat'),action=$('shareDocumentAction');
const status=$('shareDocumentStatus'),run=$('shareDocumentRun');
const native=()=>window.MiNoteFileExport;
let busy=false;
const safe=s=>String(s||'MiNote').normalize('NFKC').replace(/[\\/<>:"|?*\x00-\x1f]/g,'_').trim().slice(0,64)||'MiNote';
const tell=s=>{if(status)status.textContent=s;};
const uri=()=>window.MiNoteExportSnapshot?.();
function orientedSvg(page){
 const src=window.MiNoteExportSvg?.(page);
 if(!src||!src.includes('<svg'))throw Error('No se pudo generar el SVG de esta hoja.');
 if(page.orientation!=='landscape-cw')return src;
 const inside=src.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000" viewBox="0 0 1400 1000">'+
  '<g transform="translate(1400 0) rotate(90)">'+inside+'</g></svg>';
}
function imageFromSvg(svg){
 return new Promise((resolve,reject)=>{
  const obj=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  const im=new Image();
  im.onload=()=>{URL.revokeObjectURL(obj);resolve(im);};
  im.onerror=()=>{URL.revokeObjectURL(obj);reject(Error('No se pudo convertir la hoja a imagen.'));};
  im.src=obj;
 });
}
async function pngPage(page){
 const svg=orientedSvg(page);
 const im=await imageFromSvg(svg);
 const isLandscape=page.orientation==='landscape-cw';
 const canvas=document.createElement('canvas');
 canvas.width=isLandscape?1400:1000;canvas.height=isLandscape?1000:1400;
 const context=canvas.getContext('2d',{alpha:false});
 if(!context)throw Error('Android no dispone del lienzo para exportar imágenes.');
 context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
 context.drawImage(im,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 canvas.width=1;canvas.height=1;
 if(!blob||!blob.size)throw Error('Android no pudo codificar la imagen PNG.');
 return blob;
}
async function pdfBook(pages,name,actionType){
 const plugin=native();
 if(!plugin)throw Error('El módulo nativo de exportación no está instalado.');
 const token=await plugin.beginPdf({filename:name+'.pdf'});
 let completed=false;
 try{
  for(let i=0;i<pages.length;i++){
   tell('Preparando PDF: hoja '+(i+1)+' de '+pages.length+'…');
   const blob=await pngPage(pages[i]);
   if(blob.size>8*1024*1024)throw Error('Una hoja supera el límite PNG del PDF (8 MB).');
   const raw=new Uint8Array(await blob.arrayBuffer());
   await plugin.appendPdfPage({id:token.id,base64:encodeBase64(raw)});
  }
  await plugin.finishPdf({id:token.id});completed=true;
  return await deliverFile(token,actionType);
 }catch(error){
  await plugin.discardExport({id:token.id}).catch(()=>{});
  throw error;
 }
}
async function zipBook(pages,name,fmt,actionType){
 const zip=new JSZip();
 for(let i=0;i<pages.length;i++){
  tell('Preparando '+fmt.toUpperCase()+': hoja '+(i+1)+' de '+pages.length+'…');
  const filename=String(i+1).padStart(3,'0')+'_'+safe(pages[i].title);
  if(fmt==='svg')zip.file(filename+'.svg',orientedSvg(pages[i]));
  else zip.file(filename+'.png',await pngPage(pages[i]));
 }
 tell('Comprimiendo las '+pages.length+' hojas…');
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
 return exportBlob(blob,name+'_'+fmt.toUpperCase()+'.zip','application/zip',actionType);
}
function open(){
 if(busy)return;
 const snap=uri();if(!snap?.pages?.length){alert('No existe una hoja para compartir.');return;}
 $('mobileMoreDialog')?.close();
 scope.value='page';format.value='pdf';action.value='share';
 tell('Seleccione hoja o cuaderno, formato y destino.');
 if(!dialog.open)dialog.showModal();
}
async function perform(){
 if(busy)return;
 busy=true;run.disabled=true;$('shareDocumentClose').disabled=true;
 try{
  const snap=uri();
  if(!snap?.pages?.length)throw Error('El cuaderno ya no está disponible.');
  const single=scope.value==='page',fmt=format.value,act=action.value;
  if(!['pdf','png','svg'].includes(fmt)||!['save','share'].includes(act))throw Error('Formato o acción no permitidos.');
  const pages=single?[snap.pages.find(p=>p.id===snap.pageId)||snap.pages[0]]:snap.pages;
  if(pages.length>150)throw Error('Para compartir un cuaderno se admite un máximo de 150 hojas.');
  const name=safe(single?pages[0].title:snap.title);
  let result;
  if(fmt==='pdf')result=await pdfBook(pages,name,act);
  else if(!single)result=await zipBook(pages,name,fmt,act);
  else if(fmt==='svg'){
   result=await exportBlob(new Blob([orientedSvg(pages[0])],{type:'image/svg+xml'}),name+'.svg','image/svg+xml',act);
  }else result=await exportBlob(await pngPage(pages[0]),name+'.png','image/png',act);
  if(result?.cancelled){tell('Guardado cancelado. El cuaderno no se modificó.');return;}
  tell(act==='save'?'Archivo guardado mediante Android.':'Panel Compartir de Android abierto.');
  if(act==='share')dialog.close();
 }catch(e){tell('No se pudo exportar: '+e.message);}
 finally{busy=false;run.disabled=false;$('shareDocumentClose').disabled=false;}
}
$('shareDocumentOpen')?.addEventListener('click',open);
$('shareDocumentClose')?.addEventListener('click',()=>{if(!busy)dialog.close();});
run?.addEventListener('click',()=>void perform());
dialog?.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
