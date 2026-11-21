/* Mi Note V0.63 · investigación de los comandos de estado Huion X10.
 * Los opcodes 0x8E ELECTRICITY y 0x8F ROM aparecen en capturas y
 * OrderCode.java del cliente oficial (análisis Reginleif86/huion-note-x10-ble).
 * NO se supone que la posición 3 de la respuesta tenga un significado específico.
 * El resultado es exclusivamente un volcado hexadecimal de diagnóstico.
 */
export const VENDOR_STATUS_CODES=Object.freeze({battery:0x8e,memory:0x8f});
const HEX=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join(' ');
export const requestStatusFrame=opcode=>{
 if(opcode!==0x8e&&opcode!==0x8f)throw new Error('Solo se permiten las lecturas 0x8E y 0x8F');
 return Uint8Array.from([0xcd,opcode,0x08,0,0,0,0,0xed]);
};
export function parseStatusFrame(bytes,expectedOpcode){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
 if(b.length<4||b[0]!==0xcd||b[1]!==expectedOpcode||b[2]!==b.length)return null;
 return {opcode:expectedOpcode,hex:HEX(b),length:b.length,payloadHex:HEX(b.slice(3)),
  payloadBytes:[...b.slice(3)]};
}
export async function queryVendorStatus(connection,{timeoutMs=2400}={}){
 if(!connection?.connected||connection.offlineReading||connection.sessionKind!=='agenda-pura')
  throw Error('Conecte la X10 en modo agenda y termine la sincronización antes de consultar.');
 if(typeof connection.send!=='function'||typeof connection.subscribeFrames!=='function')
  throw Error('El lector BLE no permite obtener las respuestas de estado.');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<250||timeoutMs>10000)
  throw Error('Tiempo de espera inválido.');
 const requests=[{name:'batería',op:0x8e},{name:'memoria',op:0x8f}];
 const results=[];
 for(const request of requests){
  const response=await new Promise((resolve,reject)=>{
   let done=false;let detach=()=>{};
   const finish=(error,value)=>{
    if(done)return;done=true;clearTimeout(timer);
    try{detach();}catch{}
    if(error)reject(error);else resolve(value);
   };
   const timer=setTimeout(()=>finish(null,null),timeoutMs);
   try{
    detach=connection.subscribeFrames(packet=>{
     const frame=parseStatusFrame(packet,request.op);
     if(frame)finish(null,frame);
    });
    Promise.resolve().then(()=>connection.send(requestStatusFrame(request.op)))
     .catch(e=>finish(new Error('No pudo solicitarse '+request.name+': '+(e?.message||String(e)))));
   }catch(e){finish(e);}
  });
  results.push({name:request.name,opcode:'0x'+request.op.toString(16).toUpperCase(),
   received:!!response,response:response||null});
 }
 return {results,interpreted:false,
  explanation:'Respuestas BLE en hexadecimal. Las posiciones de los datos todavía no están validadas con el firmware X10.'};
}
