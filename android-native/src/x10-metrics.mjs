/* Mi Note V0.62 — X10: valores con procedencia y grado de certeza.
 * 0x85 = índice, no número certificado de páginas ocupadas.
 * 2A19 = GATT estándar; puede diferir de la app oficial.
 */
export const X10_REFERENCE_CAPACITY=50;
export const X10_BATTERY_MAX_AGE_MS=3*60*1000;
export const X10_CALIBRATION_MAX_AGE_MS=10*60*1000;
const validInt=n=>Number.isInteger(n);
export function memoryFromIndex(index,{capacity=X10_REFERENCE_CAPACITY,reference=null}={}){
 if(!validInt(index)||index<0||index>=capacity)
  return {available:false,index:validInt(index)?index:null,free:null,capacity,verified:false};
 const free=capacity-index-1;
 // Una coincidencia aislada es evidencia, no una garantía de correspondencia general.
 const verified=!!reference&&reference.index===index&&reference.free===free&&
  reference.capacity===capacity&&reference.sameSession===true;
 return {available:true,index,usedEstimate:index+1,free,capacity,
  verified,source:verified?'Índice cotejado con Huion Note en esta sesión':'Estimación: índice 0x85 (sin verificar)',
  confidence:verified?'corroborated':'estimated'};
}
export function batteryFromGatt({connected=false,level=null,readAt=null,source='gatt-2a19'}={},now=Date.now()){
 const number=validInt(level)&&level>=0&&level<=100;
 const fresh=number&&validInt(readAt)&&readAt>0&&readAt<=now&&now-readAt<=X10_BATTERY_MAX_AGE_MS;
 const available=!!connected&&fresh;
 return {available,level:available?level:null,rawLevel:number?level:null,
  source,readAt:validInt(readAt)?readAt:null,
  reason:!connected?'Desconectada':!number?'No disponible':!fresh?'Lectura antigua':'Lectura GATT 2A19, no corroborada'};
}
export function compareHuionReadings({batteryLevel=null,batteryAt=null,free=null,capacity=X10_REFERENCE_CAPACITY,
 index=null,officialBattery=null,officialFree=null,now=Date.now()}={}){
 const compareBattery=validInt(officialBattery)&&officialBattery>=0&&officialBattery<=100&&
   validInt(batteryLevel)&&batteryLevel>=0&&batteryLevel<=100&&
   validInt(batteryAt)&&batteryAt<=now&&now-batteryAt<=X10_CALIBRATION_MAX_AGE_MS;
 const difference=compareBattery?Math.abs(officialBattery-batteryLevel):null;
 const memoryMatches=validInt(officialFree)&&officialFree>=0&&officialFree<=capacity&&
  validInt(free)&&free>=0&&free<=capacity&&validInt(index)&&index>=0;
 return {batteryDifference:difference,batteryMismatch:difference!==null&&difference>=10,
  memoryComparison:memoryMatches?(officialFree===free?'matches':'differs'):'unknown'};
}
