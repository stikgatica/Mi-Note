/* Mi Note X10 - conector BLE experimental, no destructivo.
   Protocolo documentado en Reginleif86/huion-note-x10-ble (MIT).
   Las pruebas con la X10 física son necesarias: Web Bluetooth depende del navegador/firmware.
*/
(function(root){
'use strict';
const SERVICE='0000ffe0-0000-1000-8000-00805f9b34fb';
const DATA='0000ffe1-0000-1000-8000-00805f9b34fb';
const COMMAND='0000ffe2-0000-1000-8000-00805f9b34fb';
const DEFAULT_NOTE={maxX:28200,maxY:37400,maxPressure:8191};
const DEFAULT_TABLET={maxX:37400,maxY:28200,maxPressure:8191};
const u16=(b,i)=>b[i]|(b[i+1]<<8);
const u24=(b,i)=>b[i]|(b[i+1]<<8)|(b[i+2]<<16);
const frame=(opcode,a=0,b=0,c=0,d=0)=>new Uint8Array([0xcd,opcode,0x08,a&255,b&255,c&255,d&255,0xed]);
function mapPoint(raw,maxX,maxY,rotation=0,width=1000,height=1400){
 const x=Number(raw.x),y=Number(raw.y);
 if(!Number.isFinite(x)||!Number.isFinite(y)||!(maxX>0)||!(maxY>0))return null;
 // No clamp: conservar desbordes detectables; el origen físico no se modifica.
 let nx=x/maxX,ny=y/maxY;
 if(rotation===90)[nx,ny]=[1-ny,nx];
 else if(rotation===180)[nx,ny]=[1-nx,1-ny];
 else if(rotation===270)[nx,ny]=[ny,1-nx];
 return [nx*width,ny*height,Math.min(1,Math.max(.08,Number(raw.press||0)/8191))];
}
function parseTabletPen(value){
 const b=value instanceof Uint8Array?value:new Uint8Array(value);
 if(b.length<14||b[0]!==0x55||b[1]!==0x54||![0,128,129].includes(b[2]))return null;
 return {status:b[2],x:u24(new Uint8Array([b[3],b[4],b[9]]),0),
   y:u24(new Uint8Array([b[5],b[6],b[10]]),0),
   press:u16(b,7),touch:b[2]===129};
}
class Connection {
 constructor(handlers={}){
  this.handlers=handlers;this.device=null;this.cmd=null;this.data=null;this.mode='desconectado';
  this.limits={...DEFAULT_NOTE};this.keepalive=null;this.pageEventAt=0;this.unknownTypes=new Set();
  this._onData=this._onData.bind(this);this._onDisconnected=this._onDisconnected.bind(this);
 }
 get connected(){return !!this.device?.gatt?.connected;}
 status(message){this.handlers.onStatus?.(message);}
 async connect(){
  if(!navigator.bluetooth||!window.isSecureContext)throw Error('Web Bluetooth no está disponible. Usa Chrome o Edge actualizado en HTTPS, con Bluetooth activo.');
  // RequestDevice se ejecuta directamente desde el clic del usuario.
  const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[SERVICE]});
  this.device=device;this.mode='conectando';this.status('Conectando con '+(device.name||'el dispositivo')+'…');
  if(device.name&&!/huion|t218|x10/i.test(device.name)){
   this.status('El dispositivo seleccionado no parece una Huion Note X10.');
  }
  device.addEventListener('gattserverdisconnected',this._onDisconnected);
  try{
   const server=await device.gatt.connect();
   const service=await server.getPrimaryService(SERVICE);
   this.data=await service.getCharacteristic(DATA);
   this.cmd=await service.getCharacteristic(COMMAND);
   this.data.addEventListener('characteristicvaluechanged',this._onData);
   await this.data.startNotifications();
   try{this.cmd.addEventListener('characteristicvaluechanged',this._onData);await this.cmd.startNotifications();}
   catch(err){this.handlers.onDiagnostic?.('Indicaciones FFE2 no disponibles: '+err.message);}
   this.mode='detectando';this.status('X10 conectada. Esperando identificación y datos del lápiz…');
   this.handlers.onConnected?.(device.name||'Huion X10');
   await this.send(frame(0x81));
   this.status('Consulta de identificación enviada. Esperando respuesta X10…');
  }catch(err){this.disconnect();throw err;}
 }
 async send(bytes){
  if(!this.connected||!this.cmd)throw Error('X10 no conectada');
  const d=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(this.cmd.properties.writeWithoutResponse&&this.cmd.writeValueWithoutResponse)await this.cmd.writeValueWithoutResponse(d);
  else if(this.cmd.properties.write&&this.cmd.writeValueWithResponse)await this.cmd.writeValueWithResponse(d);
  else await this.cmd.writeValue(d);
 }
 async probeTablet(){
  if(!this.connected)throw Error('Conecta primero la Huion X10.');
  for(const op of [0xc9,0xc8,0xca])await this.send([0xcd,op,0,0,0,0,0,0]);
  this.status('Consulta enviada para detectar el modo tableta. El modo agenda sigue siendo prioritario.');
 }
 async _afterVerified(){
  try{
   await this.send(frame(0x95));
   await this.send(frame(0x85));
   if(!this.keepalive)this.keepalive=setInterval(()=>{if(this.connected)this.send(frame(0x80)).catch(()=>{});},5000);
  }catch(e){this.handlers.onDiagnostic?.('Consulta de estado: '+e.message);}
 }
 _onData(e){
  const value=e.target?.value;if(!value)return;
  const b=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  const p=parseTabletPen(b);
  if(p){
   if(this.mode!=='tableta'){
    this.mode='tableta';this.limits={...DEFAULT_TABLET};
    this.handlers.onMode?.('tableta',this.limits);
    this.status('Modo tableta: recibiendo posición del lápiz.');
   }
   this.handlers.onPen?.(p,this.limits,'tableta');return;
  }
  if(b.length<3)return;
  // Modo agenda con fotogramas cd OP LEN ...: nunca se envían comandos de borrado.
  if(b[0]===0xcd){
   const op=b[1];
   if(op===0x81&&b.length>=6){
    const a=b[3],v=b[4],c=b[5];
    this.send(frame(0x82,((a+v)*4)%255,((v+c)*4)%255,((c+10)*4)%255,0)).catch(e=>this.status('Error de identificación: '+e.message));
    return;
   }
   if(op===0x82){
    if(b[3]===0){this.status('La X10 rechazó la verificación Bluetooth.');return;}
    if(b[3]===2){this.status('La X10 solicita PIN; esta prueba no lo implementa.');return;}
    this.mode='agenda';this.limits={...DEFAULT_NOTE};this.handlers.onMode?.('agenda',this.limits);
    this.status('Modo agenda vinculado. Esperando escritura y botón de nueva página.');
    this._afterVerified();return;
   }
   if(op===0x95&&b.length>=11){
    const maxX=u24(b,3),maxY=u24(b,6),maxPressure=u16(b,9);
    if(maxX>1000&&maxY>1000){this.limits={maxX,maxY,maxPressure:maxPressure||8191};this.handlers.onLimits?.(this.limits);}
    return;
   }
   if(op===0x85&&b.length>=5){this.handlers.onPageCount?.(u16(b,3));return;}
   if(op===0x8a){
    if(Date.now()-this.pageEventAt>350){this.pageEventAt=Date.now();this.handlers.onNewPage?.(b.length>=5?u16(b,3):null);}
    return;
   }
   if(op===0x8d){
    // La estructura de puntos del modo agenda no está verificada: nunca se
    // escribirán coordenadas supuestas en los cuadernos existentes.
    this.handlers.onUndecodedNote?.(b);
    return;
   }
   if(!this.unknownTypes.has(op)){this.unknownTypes.add(op);this.handlers.onDiagnostic?.('Paquete X10 recibido: 0x'+op.toString(16));}
  }else if(b[0]!==0x55){this.handlers.onDiagnostic?.('Formato BLE no identificado ('+b.length+' bytes).');}
 }
 _onDisconnected(){
  this.mode='desconectado';clearInterval(this.keepalive);this.keepalive=null;
  this.handlers.onDisconnected?.();this.status('X10 desconectada. Los cuadernos locales permanecen guardados.');
 }
 disconnect(){
  clearInterval(this.keepalive);this.keepalive=null;
  if(this.data)try{this.data.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.cmd)try{this.cmd.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.device){
   try{this.device.gatt?.disconnect();}catch{}
   this.device.removeEventListener('gattserverdisconnected',this._onDisconnected);
  }
  this.device=null;this.cmd=null;this.data=null;this.mode='desconectado';
  this.handlers.onDisconnected?.();
 }
}
const api={Connection,mapPoint,parseTabletPen,frame,DEFAULT_NOTE,DEFAULT_TABLET};
root.MiNoteX10Ble=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
