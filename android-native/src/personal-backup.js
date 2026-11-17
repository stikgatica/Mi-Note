/* Mi Note X10 V0.9 — documento privado cifrado, elegido con Android.
 * La cuenta de Google nunca se autoriza desde esta app: Android/Drive administra el acceso.
 * Sin acceso global a archivos ni permiso INTERNET. Sync mientras la app está activa.
 */
const native=window.MiNotePrivateBackup;
const el=id=>document.getElementById(id);
const status=el('personalBackupStatus'),dialog=el('personalBackupDialog');
let documentInfo=null;
let key=null, salt=null, remoteSha=null, locked=false, working=Promise.resolve();
let debounce=null;
const shaKey=()=>documentInfo?.fingerprint?'minote_backup_sha_'+documentInfo.fingerprint:null;
const savedSha=()=>shaKey()?localStorage.getItem(shaKey()):null;
const storeSha=v=>{if(shaKey())localStorage.setItem(shaKey(),v);};
const enc=new TextEncoder(),dec=new TextDecoder();
const asBytes=b64=>Uint8Array.from(atob(b64),x=>x.charCodeAt(0));
const asB64=bytes=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
const setStatus=(s,problem=false)=>{if(status){status.textContent=s;status.dataset.error=problem?'true':'false';}};
const password=()=>el('personalBackupPassword')?.value??'';
const snapshot=()=>window.MiNoteBackupSnapshot?.();
function validateEnvelope(data){
 if(!data||data.kind!=='MiNoteX10EncryptedBackup'||data.version!==1||typeof data.salt!=='string'||typeof data.iv!=='string'||typeof data.payload!=='string')throw Error('El archivo seleccionado no es una copia cifrada de Mi Note X10.');
 const s=asBytes(data.salt),iv=asBytes(data.iv);
 if(s.length!==16||iv.length!==12)throw Error('Cabecera de cifrado inválida.');
 if(asBytes(data.payload).length>32*1024*1024)throw Error('Copia demasiado grande.');
 return data;
}
async function importKey(bytes){
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
async function derive(pass,s){
 if(pass.length<12)throw Error('Utilice una contraseña de al menos 12 caracteres.');
 const seed=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:260000,hash:'SHA-256'},seed,256);
 return new Uint8Array(bits);
}
async function encrypt(obj) {
 if(!key||!salt)throw Error('Debe desbloquear su copia de Drive.');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const plaintext=enc.encode(JSON.stringify(obj));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await importKey(key),plaintext));
 return JSON.stringify({kind:'MiNoteX10EncryptedBackup',version:1,salt:asB64(salt),iv:asB64(iv),payload:asB64(ciphertext)});
}
async function decryptEnvelope(obj,material){
 const decoded=validateEnvelope(obj);
 const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:asBytes(decoded.iv)},await importKey(material),asBytes(decoded.payload));
 const parsed=JSON.parse(dec.decode(decrypted));
 if(parsed?.schema!=='mi-note-v1'||!Array.isArray(parsed.notebooks))throw Error('La copia descifrada no corresponde a Mi Note.');
 return parsed;
}
function queue(fn) {
 working=working.catch(()=>{}).then(fn).catch(e=>{locked=true;setStatus('Sincronización detenida: '+e.message,true);});
 return working;
}
function changed(){
 if(!key||!documentInfo||locked||document.hidden)return;
 clearTimeout(debounce);
 debounce=setTimeout(()=>queue(sync),3500);
}
async function sync(){
 if(locked||!key||!salt||!documentInfo||document.hidden)return;
 const current=await native.read();
 if(current.empty&&remoteSha!==null&&remoteSha!==current.sha)throw Error('La copia remota fue vaciada. Revise el archivo antes de continuar.');
 let remote=null;
 const changedRemotely=current.sha!==savedSha();
 if(!current.empty&&changedRemotely){
  try{remote=await decryptEnvelope(JSON.parse(current.content),key);}
  catch(e){throw Error('La copia remota cambió o no pudo descifrarse: '+e.message);}
 }
 if(remote){
  // Fusión no destructiva: Mi Note preserva las páginas divergentes como conflicto.
  if(!window.MiNoteBackupMerge)throw Error('No existe el importador seguro de Mi Note.');
  const result=window.MiNoteBackupMerge(remote);
  if(result.conflicts)setStatus(result.conflicts+' páginas distintas se conservaron como copias de conflicto. Revise el cuaderno.');
 }
 const local=snapshot();
 if(!local)throw Error('No se pudo obtener el cuaderno local.');
 const data=await encrypt(local);
 const result=await native.write({content:data,expectedSha:current.sha});
 remoteSha=result.sha;
 storeSha(result.sha);
 locked=false;
 const when=new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
 setStatus('Copia cifrada actualizada · '+when+' · '+(documentInfo?.name??'Archivo de Drive'));
}
async function choose(create){
 if(!native)return;
 const result=create?await native.create():await native.select();
 if(result.cancelled)return;
 documentInfo=await native.status();
 locked=false;remoteSha=null;key=null;salt=null;
 el('personalBackupPassword').value='';
 el('personalBackupUnlock').disabled=false;
 setStatus('Archivo elegido. Escriba su contraseña de respaldo para activarlo.');
}
async function unlock(){
 if(!documentInfo?.linked)throw Error('Seleccione primero un archivo en Drive.');
 if(!documentInfo.canWrite||!documentInfo.canRead)throw Error('El documento no tiene permiso de lectura y escritura.');
 const raw=await native.read();
 const pass=password();
 if(raw.empty){
  if(pass.length<12)throw Error('La contraseña debe tener 12 caracteres como mínimo.');
  if(pass!==el('personalBackupConfirm').value)throw Error('Las contraseñas no coinciden.');
  salt=crypto.getRandomValues(new Uint8Array(16));
  key=await derive(pass,salt);
 }else{
  let envelope;try{envelope=validateEnvelope(JSON.parse(raw.content));}catch(e){throw Error('No se puede abrir el archivo existente: '+e.message);}
  salt=asBytes(envelope.salt);
  key=await derive(pass,salt);
  try{await decryptEnvelope(envelope,key);}catch{key=null;throw Error('Contraseña incorrecta o archivo dañado. No se modificó Drive.');}
 }
 await native.rememberKey({key:asB64(key)});
 remoteSha=null;
 locked=false;
 el('personalBackupPassword').value='';
 dialog.close();
 setStatus('Conectado. Comprobando cambios y guardando una copia cifrada…');
 await queue(sync);
}
async function boot(){
 if(!native||!crypto.subtle){el('personalBackupOpen')?.setAttribute('disabled','');return;}
 documentInfo=await native.status();
 if(!documentInfo.linked){setStatus('Sin configurar · elija un archivo en Google Drive.');return;}
 if(!documentInfo.canWrite||!documentInfo.canRead){locked=true;setStatus('Debe volver a seleccionar el archivo: Android perdió el permiso de acceso.',true);return;}
 try{
  const saved=await native.recallKey();
  key=asBytes(saved.key);
  const r=await native.read();
  if(r.empty){locked=true;setStatus('El archivo está vacío. Abra la configuración e introduzca la contraseña.',true);return;}
  remoteSha=savedSha();
  salt=asBytes(validateEnvelope(JSON.parse(r.content)).salt);
  await decryptEnvelope(JSON.parse(r.content),key);
  setStatus('Copia privada vinculada · comprobando actualizaciones…');
  void queue(sync);
 }catch(e){
  key=null;locked=true;
  setStatus('Copia existente. Pulse Drive e introduzca la contraseña. '+e.message,true);
 }
}
el('personalBackupOpen')?.addEventListener('click',()=>{el('mobileMoreDialog')?.close();dialog.showModal();});
el('personalBackupClose')?.addEventListener('click',()=>dialog.close());
el('personalBackupNew')?.addEventListener('click',()=>{void choose(true).catch(e=>setStatus(e.message,true));});
el('personalBackupExisting')?.addEventListener('click',()=>{void choose(false).catch(e=>setStatus(e.message,true));});
el('personalBackupUnlock')?.addEventListener('click',()=>{void unlock().catch(e=>{locked=true;setStatus(e.message,true);});});
el('personalBackupSync')?.addEventListener('click',()=>{locked=false;void queue(sync);});
el('personalBackupUnlink')?.addEventListener('click',async()=>{
 if(!confirm('Desvincular el respaldo de este teléfono? La copia en Drive no se eliminará.'))return;
 clearTimeout(debounce);
 await working.catch(()=>{});
 await native.unlink();documentInfo=null;key=null;salt=null;remoteSha=null;locked=false;
 setStatus('Desvinculado. Sus cuadernos locales permanecen en el dispositivo.');
});
window.addEventListener('minote:changed',changed);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&key&&!locked)void queue(sync);});
window.addEventListener('online',()=>{if(key&&!locked)void queue(sync);});
void boot().catch(e=>setStatus('No se pudo iniciar la copia privada: '+e.message,true));
