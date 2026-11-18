/* Mi Note 0.2.3 | X10 BLE con reconexión autorizada y Data Ink V10.
   Compatibilidad de lápiz: 55 54, respuestas LEN C8, C9/C8/CA, keepalive D1.
   Agenda: aviso 0x8A y enlace opcional. Nunca se envían DELETE/CLEAR.
   Referencias: DataInk_V10.html del usuario; Reginleif86/huion-note-x10-ble (MIT).
*/
(function(root){
'use strict';
const SERVICE='0000ffe0-0000-1000-8000-00805f9b34fb';
const DATA='0000ffe1-0000-1000-8000-00805f9b34fb';
const COMMAND='0000ffe2-0000-1000-8000-00805f9b34fb';
const DEFAULT_NOTE={maxX:28200,maxY:37400,maxPressure:8191};
const u16=(b,i)=>b[i]|(b[i+1]<<8);
const u24=(b,i)=>b[i]|(b[i+1]<<8)|(b[i+2]<<16);
const frame=(op,a=0,b=0,c=0,d=0)=>new Uint8Array([0xcd,op,0x08,a&255,b&255,c&255,d&255,0xed]);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/* La X10 proyecta aprox. 140.9 × 186.9 mm sobre la hoja A5 (148 × 210 mm).
   Usar margen físico centrado, no estirar los trazos hasta el borde del papel.
   La coordenada original x/y nunca se modifica: se guarda en stroke.x10.raw. */
function mapPoint(raw,maxX,maxY,rotation=0,width=1000,height=1400,physicalA5=false){
 const x=Number(raw.x),y=Number(raw.y);
 if(!Number.isFinite(x)||!Number.isFinite(y)||maxX<=0||maxY<=0)return null;
 let nx=x/maxX,ny=y/maxY;
 if(rotation===90)[nx,ny]=[1-ny,nx];
 else if(rotation===180)[nx,ny]=[1-nx,1-ny];
 else if(rotation===270)[nx,ny]=[ny,1-nx];
 if(physicalA5){
  nx=(3.55+140.9*nx)/148;
  ny=(11.55+186.9*ny)/210;
 }
 return [nx*width,ny*height,Math.min(1,Math.max(.08,Number(raw.press||0)/8191))];
}
// Protocolo Huion Note: una notificación puede contener dos tramas
// ONLINE_DATA CD 8D 0B (11 bytes cada una). No confundir con el ACK CD 8D 04 01.
function parseNotePenFrames(value){
 const b=value instanceof Uint8Array?value:new Uint8Array(value);
 if(!b.length||b.length%11!==0)return null;
 const out=[];
 for(let offset=0;offset<b.length;offset+=11){
  if(b[offset]!==0xcd||b[offset+1]!==0x8d||b[offset+2]!==11)return null;
  const part=b.subarray(offset,offset+11);
  const status=part[3],x=u16(part,4),y=u16(part,6),press=u16(part,8);
  if(status>7||x>DEFAULT_NOTE.maxX||y>DEFAULT_NOTE.maxY||press>16383)return null;
  // 0x02 indica lápiz en contacto, incluso cuando otra notificación
  // todavía anuncia la última posición con presión cero.
  out.push({status,x,y,press,touch:(status&2)!==0&&press>0});
 }
 return out;
}
class Connection{
 constructor(handlers={}){
  this.handlers=handlers;this.device=null;this.cmd=null;this.data=null;
  this.mode='desconectado';this.limits={...DEFAULT_NOTE};
  this.keepalive=null;this.pageEventAt=0;this.unknownTypes=new Set();this.packetCount=0;
  this.frameListeners=new Set();this.offlineReading=false;
  // V0.32: registra si esta conexión GATT recibió comandos de tableta (C9/C8/CA).
  this.tabletCommandsSent=false;this.sessionKind=null;this.noteLivePackets=0;
  this.noteRx={notifications:0,onlineFrames:0,onlineSamples:0,invalidOnline:0,onlineAcks:0,otherPackets:0};
  this.noteBuffer=new Uint8Array(0);
  this._onData=this._onData.bind(this);this._onDisconnected=this._onDisconnected.bind(this);
 }
 get connected(){return !!this.device?.gatt?.connected;}
 status(s){this.handlers.onStatus?.(s);}
 selectDevice(filtered=false){
  if(root.MiNoteNativeBLE)return root.MiNoteNativeBLE.selectDevice(filtered);
  if(!navigator.bluetooth||!root.isSecureContext)
   throw Error('Web Bluetooth no está disponible. Usa Chrome o Edge en HTTPS con Bluetooth activo.');
  // Debe ejecutarse sin await previo, dentro del evento táctil del usuario.
  const options=filtered
   ?{filters:[{namePrefix:'HUION'},{namePrefix:'Huion'},{namePrefix:'T218'}],optionalServices:[SERVICE]}
   :{acceptAllDevices:true,optionalServices:[SERVICE]};
  return navigator.bluetooth.requestDevice(options);
 }
 async connect(filtered=false){
  return this.connectSaved(await this.selectDevice(filtered));
 }
 useAgendaByDefault(){return true;}
 async connectSaved(device){
  if((!root.MiNoteNativeBLE&&(!navigator.bluetooth||!root.isSecureContext))||!device?.gatt)
   throw Error('No se puede recuperar la conexión BLE autorizada.');
  return this._connectDevice(device);
 }
 async _connectDevice(device){
  if(this.connected)return;
  this.intentionalDisconnect=false;
  this.tabletCommandsSent=false;this.sessionKind=null;this.noteLivePackets=0;
  this.noteRx={notifications:0,onlineFrames:0,onlineSamples:0,invalidOnline:0,onlineAcks:0,otherPackets:0};
  this.noteBuffer=new Uint8Array(0);
  if(this.data)try{this.data.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.cmd)try{this.cmd.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.device)try{this.device.removeEventListener('gattserverdisconnected',this._onDisconnected);}catch{}
  this.data=null;this.cmd=null;this.device=device;this.mode='conectando';
  this.status('Conectando X10 mediante protocolo de agenda…');
  device.addEventListener('gattserverdisconnected',this._onDisconnected);
  try{
   const server=await device.gatt.connect();
   const service=await server.getPrimaryService(SERVICE);
   this.data=await service.getCharacteristic(DATA);
   this.cmd=await service.getCharacteristic(COMMAND);
   this.data.addEventListener('characteristicvaluechanged',this._onData);
   await this.data.startNotifications();
   if(this.cmd.properties.notify||this.cmd.properties.indicate){
    try{this.cmd.addEventListener('characteristicvaluechanged',this._onData);await this.cmd.startNotifications();}
    catch(e){this.handlers.onDiagnostic?.('FFE2 sin indicaciones: '+e.message);}
   }
   this.mode='agenda-pendiente';this.sessionKind='agenda-pura';
   this.handlers.onConnected?.(device.name||'Huion X10');
   await this.enableNoteLive();
   // Sin paquetes de tinta todavía no puede confirmarse el modo agenda activo.
  }catch(e){this.disconnect();throw e;}
 }
 async send(bytes){
  if(!this.connected||!this.cmd)throw Error('X10 no conectada.');
  const d=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(this.cmd.properties.writeWithoutResponse&&this.cmd.writeValueWithoutResponse)
   await this.cmd.writeValueWithoutResponse(d);
  else if(this.cmd.properties.write&&this.cmd.writeValueWithResponse)
   await this.cmd.writeValueWithResponse(d);
  else await this.cmd.writeValue(d);
 }
 async enableNoteLive(){
  if(!this.connected)throw Error('Conecte primero la X10.');
  if(this.offlineReading)throw Error('Termine de importar antes de reactivar la escritura.');
  this.sessionKind='agenda-pura';this.mode='agenda-pendiente';
  // Secuencia de la aplicación oficial: configuración, ONLINE_DATA y autenticación.
  await this.send(frame(0x95));await pause(60);
  await this.send(frame(0x96,1,3));await pause(60);
  await this.send(frame(0x96,3,2));await pause(60);
  await this.send(frame(0x91));await pause(60);
  await this.send(frame(0x8d,1,0,0,0));await pause(60);
  await this.send(frame(0x81));
  this.status('Modo agenda solicitado; esperando autorización y trazos 0x8D.');
 }
 async getMtu(){
  try{return await this.device?.gatt?.getMtu?.()??null;}catch{return null;}
 }
 subscribeFrames(listener){
  if(typeof listener!=='function')throw Error('Se requiere un receptor BLE.');
  this.frameListeners.add(listener);
  return ()=>this.frameListeners.delete(listener);
 }
 async enablePhysicalPageButton(){
  if(!this.connected)throw Error('Conecte primero la X10.');
  if(this.offlineReading)throw Error('Termine la importación antes de escuchar el botón.');
  await this.enableNoteLive();
  this.status('Escuchando el botón de página X10 (0x8A).');
 }
 async probeAgenda(){return this.enableNoteLive();}
 startKeepalive(){}
 async _afterVerified(){
  if(this.offlineReading||!this.connected||this.sessionKind!=='agenda-pura')return;
  try{
   await this.send(frame(0x8d,1,0,0,0));
   this.status(this.noteLivePackets?'Trazos X10 recibidos en agenda.':'Modo agenda autorizado; esperando escritura en vivo.');
  }catch(e){this.handlers.onDiagnostic?.('Error al activar escritura agenda: '+e.message);}
 }
 // Normaliza las notificaciones GATT del modo agenda. El firmware puede
 // enviar dos muestras ONLINE_DATA juntas o fragmentar una entre eventos.
 // Conserva como máximo 10 bytes incompletos y nunca altera la tinta.
 _consumeNoteFrames(bytes){
  if(!bytes?.length)return [];
  const pending=this.noteBuffer;
  this.noteBuffer=new Uint8Array(0);
  if(!pending.length&&!(bytes[0]===0xcd&&bytes[1]===0x8d)){
   this.noteRx.otherPackets++;return [];
  }
  if(pending.length&&bytes[0]===0xcd&&bytes[1]!==0x8d){
   // El periférico cambió a otra respuesta; descartar una muestra truncada.
   this.noteRx.invalidOnline++;
   this.noteRx.otherPackets++;return [];
  }
  const data=new Uint8Array(pending.length+bytes.length);
  data.set(pending);data.set(bytes,pending.length);
  const samples=[];let cursor=0;
  while(cursor<data.length){
   const remaining=data.length-cursor;
   if(remaining<3){
    // Solo reservar cabecera parcial cuando comienza por el marcador CD.
    if(data[cursor]===0xcd)this.noteBuffer=data.slice(cursor);
    break;
   }
   if(data[cursor]!==0xcd||data[cursor+1]!==0x8d){
    cursor++;continue;
   }
   const length=data[cursor+2];
   if(length!==11&&length!==4){
    this.noteRx.invalidOnline++;cursor++;continue;
   }
   if(remaining<length){this.noteBuffer=data.slice(cursor);break;}
   if(length===4){
    this.noteRx.onlineAcks++;cursor+=4;continue;
   }
   this.noteRx.onlineFrames++;
   const parsed=parseNotePenFrames(data.subarray(cursor,cursor+11));
   if(parsed?.length)samples.push(...parsed);
   else this.noteRx.invalidOnline++;
   cursor+=11;
  }
  this.noteRx.onlineSamples+=samples.length;
  return samples;
 }
 liveDiagnostic(){
  return {...this.noteRx,liveSamples:this.noteLivePackets,
   writingConfirmed:this.noteLivePackets>0,session:this.sessionKind,connected:this.connected};
 }
 _onData(e){
  const value=e.target?.value;if(!value)return;
  const b=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);this.packetCount++;
  if(this.frameListeners.size&&b[0]===0xcd){
   for(const fn of this.frameListeners){try{fn(b);}catch(e){this.handlers.onDiagnostic?.('Lector de memoria: '+e.message);}}
  }
  if(!this.offlineReading&&this.sessionKind==='agenda-pura'){
   this.noteRx.notifications++;
   const samples=this._consumeNoteFrames(b);
   if(samples.length){
    this.mode='agenda';this.noteLivePackets+=samples.length;
    if(this.noteLivePackets===samples.length)this.status('Se reciben trazos en vivo del modo agenda.');
    for(const p of samples)this.handlers.onPen?.(p,this.limits,'agenda');
    return;
   }
   // Las muestras 0x8D inválidas no se descartan silenciosamente: se registran
   // sin guardar coordenadas ni contenido manuscrito.
   if((this.noteRx.invalidOnline===1||this.noteRx.invalidOnline%25===0)&&this.noteRx.invalidOnline>0)
    this.handlers.onDiagnostic?.('X10 ONLINE_DATA sin interpretar: '+this.noteRx.invalidOnline+' paquetes; longitudes y datos privados no guardados.');
  }
  if(b.length<3||b[0]!==0xcd)return;
  const op=b[1];
  if(op===0x81&&b.length>=6){
   const a=b[3],v=b[4],c=b[5];
   this.send(frame(0x82,((a+v)*4)%255,((v+c)*4)%255,((c+10)*4)%255))
    .catch(e=>this.status('Error al verificar agenda: '+e.message));return;
  }
  if(op===0x82&&b.length>=4){
   if(b[3]===0){this.status('La X10 rechazó el modo agenda.');return;}
   if(b[3]===2){this.status('La X10 solicita PIN para escribir en agenda.');return;}
   if(b[3]!==1)return;
   this.handlers.onMode?.('agenda',this.limits);
   if(!this.offlineReading)void this._afterVerified();return;
  }
  if(op===0x95&&b.length>=11){
   const maxX=u24(b,3),maxY=u24(b,6),maxPressure=u16(b,9);
   if(maxX>=2000&&maxY>=2000&&maxX<=100000&&maxY<=100000){
    this.limits={maxX,maxY,maxPressure:maxPressure||8191};this.handlers.onLimits?.(this.limits);
   }return;
  }
  if(op===0x85&&b.length>=5){this.handlers.onPageCount?.(u16(b,3));return;}
  if(op===0x8a){
   if(Date.now()-this.pageEventAt>350){this.pageEventAt=Date.now();this.handlers.onNewPage?.(b.length>=5?u16(b,3):null);}
   return;
  }
  if(op===0x8d){if(b.length!==4)this.handlers.onUndecodedNote?.(b);return;}
  if(!this.unknownTypes.has(op)){
   this.unknownTypes.add(op);this.handlers.onDiagnostic?.('Evento agenda 0x'+op.toString(16));
  }
 }
 _onDisconnected(){
  this.mode='desconectado';this.noteBuffer=new Uint8Array(0);clearInterval(this.keepalive);this.keepalive=null;
  this.handlers.onDisconnected?.({unexpected:!this.intentionalDisconnect});
  this.status('X10 desconectada. Las notas locales permanecen guardadas.');
 }
 disconnect(){
  this.intentionalDisconnect=true;
  clearInterval(this.keepalive);this.keepalive=null;
  if(this.data)try{this.data.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.cmd)try{this.cmd.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.device){this.device.removeEventListener('gattserverdisconnected',this._onDisconnected);
   try{this.device.gatt?.disconnect();}catch{}}
  this.device=null;this.cmd=null;this.data=null;this.mode='desconectado';this.offlineReading=false;
  this.handlers.onDisconnected?.({unexpected:false});
 }
}
const api={Connection,mapPoint,parseNotePenFrames,frame,DEFAULT_NOTE};
root.MiNoteX10Ble=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
