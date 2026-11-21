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
/**
 * Formatos corroborados con la respuesta de una X10 firmware 230819:
 * cd 8e 04 47 => 0x47 = 71 % batería
 * cd 8f 08 2e 32 03 00 01 => 46 libres de 50
 * Los tres últimos bytes de ROM se conservan SIN interpretar.
 * No asumir otros formatos en firmwares diferentes.
 */
export function decodeVendorBattery(frame){
 if(frame?.opcode!==0x8e||frame.length!==4||frame.payloadBytes?.length!==1)return null;
 const percentage=frame.payloadBytes[0];
 if(!Number.isInteger(percentage)||percentage<0||percentage>100)return null;
 return {percent:percentage,source:'huion-0x8e'};
}
export function decodeVendorMemory(frame){
 if(frame?.opcode!==0x8f||frame.length!==8||frame.payloadBytes?.length!==5)return null;
 const [free,total,...unknownBytes]=frame.payloadBytes;
 if(!Number.isInteger(total)||total<1||total>200||free>total)return null;
 return {free,total,used:total-free,source:'huion-0x8f',
  unknownTailHex:HEX(unknownBytes)};
}
export function decodeVendorStatus(results,readAt=Date.now()){
 const batteryFrame=results.find(x=>x.opcode==='0x8E')?.response;
 const memoryFrame=results.find(x=>x.opcode==='0x8F')?.response;
 const battery=decodeVendorBattery(batteryFrame);
 const memory=decodeVendorMemory(memoryFrame);
 return {battery,memory,readAt,interpreted:!!battery||!!memory};
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
 const decoded=decodeVendorStatus(results);
 return {...decoded,results,
  explanation:'0x8E: porcentaje. 0x8F: espacios libres y totales. Bytes adicionales sin interpretar. Validado con un dispositivo X10 fw 230819.'};
}
