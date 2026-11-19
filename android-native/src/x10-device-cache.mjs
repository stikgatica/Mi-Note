/* HUION X10 - CLEAR_CACHE (0x8C).
 * Fuente: Reginleif86/huion-note-x10-ble, huion_notes/frames.py y
 * android/.../protocol/SyncEngine.kt.
 * Esta orden cambia la memoria física de la X10. NUNCA automática.
 * No equivale al comando individual DELETE_PAGE (0x8B). */
export const CLEAR_CACHE_OPCODE=0x8c;
export function buildHuionClearCacheFrame(){
 return Uint8Array.from([0xcd,CLEAR_CACHE_OPCODE,0x08,0,0,0,0,0xed]);
}
export function clearHuionPhysicalCache(connection,{timeoutMs=6500}={}){
 if(!connection?.connected)throw Error('Primero conecte la Huion X10.');
 if(connection.offlineReading)throw Error('Termine la importación de la Huion antes de limpiar su caché.');
 if(connection.sessionKind!=='agenda-pura')throw Error('La X10 debe estar conectada en modo agenda.');
 if(typeof connection.send!=='function'||typeof connection.subscribeFrames!=='function')
  throw Error('Esta conexión no permite confirmar la respuesta de la Huion X10.');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<200||timeoutMs>30000)
  throw Error('Tiempo de espera fuera de rango.');
 return new Promise((resolve,reject)=>{
  let done=false,unsubscribe=()=>{};
  const finish=(err,result)=>{
   if(done)return;
   done=true;clearTimeout(timer);
   try{unsubscribe();}catch{}
   if(err)reject(err);else resolve(result);
  };
  const timer=setTimeout(()=>finish(new Error('Sin confirmación de la Huion X10. El resultado es desconocido: compruebe las notas antes de repetir.')),timeoutMs);
  try{
   // Suscribir ANTES de enviar para no perder una respuesta 0x8C inmediata.
   unsubscribe=connection.subscribeFrames(packet=>{
    const data=packet instanceof Uint8Array?packet:new Uint8Array(packet||[]);
    if(data.length<4||data[0]!==0xcd||data[1]!==CLEAR_CACHE_OPCODE)return;
    if(data[3]===1)finish(null,{acknowledged:true,opcode:CLEAR_CACHE_OPCODE});
    else finish(new Error('La Huion X10 rechazó la limpieza (respuesta '+data[3]+').'));
   });
   Promise.resolve().then(()=>connection.send(buildHuionClearCacheFrame()))
    .catch(error=>finish(new Error('No se pudo enviar la limpieza a la Huion X10: '+(error?.message||String(error)))));
  }catch(error){finish(error);}
 });
}
