/* Mi Note X10 Android: transferencia temporal y privacidad de los archivos exportados.
   Todas las operaciones se ejecutan sin permiso de acceso global a almacenamiento. */
const native=()=>window.MiNoteFileExport;
const SLICE=96*1024; // Evitar sobrecarga de JNI y el puente WebView.
export function encodeBase64(bytes){
 let text='';
 for(let i=0;i<bytes.length;i+=8192)
  text+=String.fromCharCode(...bytes.subarray(i,Math.min(i+8192,bytes.length)));
 return btoa(text);
}
export async function appendBlob(id,blob,onProgress=()=>{}){
 if(!native())throw Error('La exportación nativa de Android no está disponible.');
 if(!(blob instanceof Blob)||blob.size<1)throw Error('El archivo está vacío.');
 if(blob.size>256*1024*1024)throw Error('El archivo excede los 256 MB permitidos.');
 for(let at=0;at<blob.size;at+=SLICE){
  const bytes=new Uint8Array(await blob.slice(at,at+SLICE).arrayBuffer());
  await native().appendExport({id,base64:encodeBase64(bytes)});
  onProgress(Math.min(blob.size,at+bytes.length),blob.size);
 }
}
export async function createFile(blob,filename,mime,onProgress){
 if(!native())throw Error('Este dispositivo no dispone del selector nativo de Android.');
 const token=await native().beginExport({filename,mime});
 try{
  await appendBlob(token.id,blob,onProgress);
  return token;
 }catch(e){
  await native().discardExport({id:token.id}).catch(()=>{});
  throw e;
 }
}
export async function deliverFile(token,action){
 if(!native())throw Error('Android no está disponible.');
 if(action==='save'){
  const result=await native().saveExport({id:token.id});
  await native().discardExport({id:token.id}).catch(()=>{});
  return result;
 }
 if(action==='share')return native().shareExport({id:token.id});
 throw Error('Acción de exportación desconocida.');
}
export async function exportBlob(blob,filename,mime,action,onProgress){
 const token=await createFile(blob,filename,mime,onProgress);
 return deliverFile(token,action);
}
