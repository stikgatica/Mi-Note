/* Mi Note V0.65. Elimina ÚNICAMENTE páginas físicas importadas,
 * después de guardar una copia verificada y recibir doble consentimiento.
 * 0x8B es DELETE_PAGE; nunca enviar CLEAR_CACHE 0x8C automáticamente. */
export const buildDeletePage=index=>{
 if(!Number.isInteger(index)||index<0||index>65535)throw Error('Índice físico inválido.');
 return Uint8Array.of(0xcd,0x8b,0x08,index&255,index>>8,0,0,0xed);
};
export function validEligiblePages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>64)return false;
 const seen=new Set();
 return pages.every(p=>{
  const valid=Number.isInteger(p?.index)&&p.index>=0&&p.index<=63&&
   typeof p.digest==='string'&&/^[0-9a-f]{64}$/i.test(p.digest)&&!seen.has(p.index);
  if(valid)seen.add(p.index);
  return valid;
 });
}
export async function deleteVerifiedPages(connection,pages,{onProgress=()=>{},timeoutMs=6500,proof=null}={}){
 if(!connection?.connected||connection.offlineReading||connection.sessionKind!=='agenda-pura')
  throw Error('Debe estar conectada la X10 en modo agenda y haber terminado la importación.');
 if(typeof connection.send!=='function'||typeof connection.subscribeFrames!=='function')
  throw Error('La conexión Bluetooth no permite confirmar eliminación.');
 if(!validEligiblePages(pages))throw Error('No hay páginas completas verificadas para borrar.');
 if(!proof?.verified||!proof?.driveProvider||typeof proof.sha!=='string'||!proof.sha.match(/^[0-9a-f]{64}$/))
  throw Error('El respaldo cifrado en Drive no está comprobado.');
 if(!validEligiblePages(proof.pages)||pages.some(p=>!proof.pages.some(v=>v.index===p.index&&v.digest===p.digest)))
  throw Error('El respaldo no contiene todas las páginas físicas que se pretenden borrar.');
 if(timeoutMs<500||timeoutMs>30000)throw Error('Tiempo de espera inválido.');
 const deleted=[];
 // Borrar índices físicos DE MAYOR A MENOR impide desplazamientos ascendentes.
 const ordered=[...pages].sort((a,b)=>b.index-a.index);
 for(const page of ordered){
  const acknowledgement=await new Promise((resolve,reject)=>{
   let done=false;let unsubscribe=()=>{};
   const finish=(error,value)=>{
    if(done)return;done=true;clearTimeout(timer);
    try{unsubscribe();}catch{}
    if(error)reject(error);else resolve(value);
   };
   const timer=setTimeout(()=>finish(new Error('Sin respuesta de la X10 al borrar página '+(page.index+1)+'. Se detuvo el borrado.')),timeoutMs);
   try{
    unsubscribe=connection.subscribeFrames(packet=>{
     const b=packet instanceof Uint8Array?packet:new Uint8Array(packet||[]);
     if(b.length<4||b[0]!==0xcd||b[1]!==0x8b)return;
     if(b[3]===1)finish(null,true);
     else finish(new Error('Huion rechazó borrado de página '+(page.index+1)+'.'));
    });
    Promise.resolve().then(()=>connection.send(buildDeletePage(page.index)))
     .catch(e=>finish(new Error('Error Bluetooth: '+(e?.message||String(e)))));
   }catch(error){finish(error);}
  });
  if(!acknowledgement)throw Error('Sin confirmación.');
  deleted.push(page.index);
  onProgress('Página física '+(page.index+1)+' eliminada; '+deleted.length+'/'+ordered.length+' confirmadas.');
 }
 return {deleted,attempted:ordered.map(x=>x.index),complete:deleted.length===ordered.length};
}
