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
const DEFAULT_TABLET={maxX:37400,maxY:28200,maxPressure:8191};
const u16=(b,i)=>b[i]|(b[i+1]<<8);
const u24=(b,i)=>b[i]|(b[i+1]<<8)|(b[i+2]<<16);
const frame=(op,a=0,b=0,c=0,d=0)=>new Uint8Array([0xcd,op,0x08,a&255,b&255,c&255,d&255,0xed]);
const tabletCommand=op=>new Uint8Array([0xcd,op,0,0,0,0,0,0]);
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
function parseTabletPen(value){
 const b=value instanceof Uint8Array?value:new Uint8Array(value);
 if(b.length<13||b[0]!==0x55||b[1]!==0x54||![0,0x80,0x81].includes(b[2]))return null;
 return {status:b[2],x:b[3]+256*b[4]+65536*b[9],
  y:b[5]+256*b[6]+65536*b[10],press:u16(b,7),touch:b[2]===0x81};
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
function parseTabletInfo(b){
 // Data Ink V10: [length, C8, X(3 LE), Y(3 LE), pressure(2 LE), ...].
 if(b.length<10||b[0]!==b.length||b[1]!==0xc8)return null;
 const maxX=u24(b,2),maxY=u24(b,5),maxPressure=u16(b,8);
 if(maxX<2000||maxY<2000||maxX>100000||maxY>100000)return null;
 return {maxX,maxY,maxPressure:maxPressure||8191};
}
class Connection{
 constructor(handlers={}){
  this.handlers=handlers;this.device=null;this.cmd=null;this.data=null;
  this.mode='desconectado';this.limits={...DEFAULT_TABLET};
  this.keepalive=null;this.pageEventAt=0;this.unknownTypes=new Set();this.packetCount=0;
  this.frameListeners=new Set();this.offlineReading=false;
  // V0.32: registra si esta conexión GATT recibió comandos de tableta (C9/C8/CA).
  this.tabletCommandsSent=false;this.sessionKind=null;this.noteLivePackets=0;
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
  const device=await this.selectDevice(filtered);
  return this._connectDevice(device,{agendaOnly:this.useAgendaByDefault(),startNoteLive:this.useAgendaByDefault()});
 }
 useAgendaByDefault(){
  return true; // Modo agenda siempre, incluso si versiones anteriores guardaron "tableta".
 }
 async connectSaved(device){
  // getDevices() devuelve únicamente equipos que ya autorizó el usuario para este origen.
  if((!root.MiNoteNativeBLE&&(!navigator.bluetooth||!root.isSecureContext))||!device?.gatt)
   throw Error('Este dispositivo no permite recuperar la conexión autorizada.');
  return this._connectDevice(device,{agendaOnly:this.useAgendaByDefault(),startNoteLive:this.useAgendaByDefault()});
 }
 async _connectDevice(device,options={}){
  if(this.connected)return;
  this.intentionalDisconnect=false;
  this.tabletCommandsSent=false;this.sessionKind=null;this.noteLivePackets=0;
  // Tras una desconexión, las características GATT deben obtenerse otra vez.
  if(this.data)try{this.data.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.cmd)try{this.cmd.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.device)try{this.device.removeEventListener('gattserverdisconnected',this._onDisconnected);}catch{}
  this.data=null;this.cmd=null;
  this.device=device;this.mode='conectando';
  this.status('Conectando con '+(device.name||'la Huion X10')+'…');
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
   this.mode='detectando';
   this.handlers.onConnected?.(device.name||'Huion X10');
   if(options.agendaOnly){
    // Sesión limpia como la app oficial: sin C9/C8/CA ni keepalive D1.
    this.mode='agenda-pura';this.sessionKind='agenda-pura';
    this.status('Conectada en modo agenda. Preparando escritura en vivo…');
    if(options.startNoteLive)await this.enableNoteLive();
    return;
   }
   this.sessionKind='tableta';
   // Mismo orden y pausa de Data Ink V10, comprobado por el usuario.
   await this.probeTablet();
   this.startKeepalive();
   this.status('Conectada como Data Ink. Escribe sobre la X10 y comprueba los trazos.');
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
  if(!this.connected)throw Error('Conecta primero la X10.');
  if(this.offlineReading)throw Error('Termine la importación antes de reactivar el lápiz.');
  this.sessionKind='agenda-pura';this.mode='agenda-pura';
  // Orden observado en Huion Note: capacidades, configuración, nombre y
  // ONLINE_DATA antes del reto 0x81/0x82. No se envían comandos de tableta.
  await this.send(frame(0x95));await pause(60);
  await this.send(frame(0x96,1,3));await pause(60);
  await this.send(frame(0x96,3,2));await pause(60);
  await this.send(frame(0x91));await pause(60);
  await this.send(frame(0x8d,1,0,0,0));await pause(60);
  await this.send(frame(0x81));
  this.status('Modo agenda solicitado; esperando autorización y datos de escritura 0x8D.');
 }
 async switchToAgendaLive(){
  if(this.offlineReading)throw Error('La importación todavía está en curso.');
  if(!this.connected)throw Error('Conecta primero la X10.');
  if(this.sessionKind!=='agenda-pura')await this.reconnectAgendaOnly();
  await this.enableNoteLive();
 }
 async probeTablet(){
  if(!this.connected)throw Error('Conecta primero la X10.');
  this.tabletCommandsSent=true;this.sessionKind='tableta';
  for(const op of [0xc9,0xc8,0xca]){await this.send(tabletCommand(op));await pause(150);}
  this.handlers.onDiagnostic?.('Comandos Data Ink C9, C8 y CA enviados.');
  this.status('Lápiz X10 activado. Esperando paquetes de escritura…');
 }
 async getMtu(){
  // Solo diagnóstico: Web Bluetooth no expone el MTU y devuelve null.
  try{return await this.device?.gatt?.getMtu?.()??null;}catch{return null;}
 }
 async reconnectTabletOnly({settleMs=1500}={}){
  // Tras importar páginas la sesión queda en modo agenda puro; el lápiz
  // Data Ink necesita un enlace GATT nuevo y su handshake C9/C8/CA.
  // No solicita un dispositivo nuevo ni envía comandos de borrado 8B/8C.
  if(this.offlineReading)throw Error('Termine la lectura de memoria antes de dibujar.');
  if(this.connected&&this.sessionKind==='tableta'&&this.mode!=='agenda'){
   this.startKeepalive();
   return;
  }
  const device=this.device;
  if(!device?.gatt)throw Error('La Huion X10 no está conectada. Pulse X10 para volver a conectarla.');
  this.intentionalDisconnect=true;
  clearInterval(this.keepalive);this.keepalive=null;
  if(this.batteryTimer){clearInterval(this.batteryTimer);this.batteryTimer=null;}
  if(this.data)try{this.data.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.cmd)try{this.cmd.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  try{device.removeEventListener('gattserverdisconnected',this._onDisconnected);}catch{}
  this.status('Reactivando lápiz X10 en la hoja actual…');
  if(typeof device.gatt.disconnectAsync==='function')await device.gatt.disconnectAsync();
  else try{device.gatt.disconnect();}catch{}
  this.cmd=null;this.data=null;this.mode='desconectado';
  this.handlers.onDisconnected?.({unexpected:false});
  await pause(settleMs);
  this.device=null;
  try{await this._connectDevice(device);}
  catch(first){
   await pause(settleMs*1.5);
   this.device=null;
   await this._connectDevice(device);
  }
 }
 async reconnectAgendaOnly({settleMs=1500}={}){
  // V0.32 experimental: cerrar la conexión GATT actual (posiblemente en modo
  // tableta) y abrir otra que solo habla el protocolo de agenda. No borra nada.
  const device=this.device;
  if(!device?.gatt)throw Error('Conecta primero la X10.');
  if(this.offlineReading)throw Error('Ya hay una descarga de páginas en curso.');
  this.intentionalDisconnect=true;
  clearInterval(this.keepalive);this.keepalive=null;
  if(this.batteryTimer){clearInterval(this.batteryTimer);this.batteryTimer=null;}
  if(this.data)try{this.data.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  if(this.cmd)try{this.cmd.removeEventListener('characteristicvaluechanged',this._onData);}catch{}
  try{device.removeEventListener('gattserverdisconnected',this._onDisconnected);}catch{}
  this.status('Cerrando la conexión actual para abrir una sesión de agenda limpia…');
  if(typeof device.gatt.disconnectAsync==='function')await device.gatt.disconnectAsync();
  else try{device.gatt.disconnect();}catch{}
  this.cmd=null;this.data=null;this.mode='desconectado';
  this.handlers.onDisconnected?.({unexpected:false});
  await pause(settleMs);
  this.device=null;
  try{await this._connectDevice(device,{agendaOnly:true});}
  catch(first){
   // Android puede tardar en liberar la conexión anterior: un único reintento.
   await pause(settleMs*1.5);
   this.device=null;
   await this._connectDevice(device,{agendaOnly:true});
  }
 }
 subscribeFrames(listener){
  if(typeof listener!=='function')throw Error('Se requiere un receptor BLE.');
  this.frameListeners.add(listener);
  return ()=>this.frameListeners.delete(listener);
 }
 async enablePhysicalPageButton(){
  if(!this.connected)throw Error('Conecta primero la X10.');
  if(this.offlineReading)throw Error('Finaliza la extracción antes de escuchar el botón.');
  await this.probeAgenda();
  this.status('Escuchando avisos físicos 0x8A de nuevas páginas. Pulsa el botón de la X10.');
 }
 async probeAgenda(){
  if(!this.connected)throw Error('Conecta primero la X10.');
  await this.send(frame(0x81));
  this.status('Consulta enviada en modo agenda. Esperando confirmación X10…');
 }
 startKeepalive(){
  if(this.keepalive)clearInterval(this.keepalive);
  // Igual que Data Ink: D1 cada 5 segundos (modo lápiz/tableta).
  this.keepalive=setInterval(()=>{if(this.connected&&this.mode!=='agenda'&&this.mode!=='agenda-pura'&&this.sessionKind!=='agenda-pura')
   this.send(tabletCommand(0xd1)).catch(e=>this.handlers.onDiagnostic?.('Keepalive: '+e.message));},5000);
 }
 async _afterVerified(){
  if(this.offlineReading||!this.connected||this.sessionKind!=='agenda-pura')return;
  try{
   await this.send(frame(0x8d,1,0,0,0)); // Solicitar ONLINE_DATA tras autorización.
   this.status('Modo agenda autorizado; esperando trazos reales del lápiz 0x8D.');
  }catch(e){this.handlers.onDiagnostic?.('Activación de lápiz en modo agenda: '+e.message);}
 }
 _onData(e){
  const value=e.target?.value;if(!value)return;
  const b=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);this.packetCount++;
  if(!this.offlineReading&&this.sessionKind==='agenda-pura'){
   const samples=parseNotePenFrames(b);
   if(samples){
    this.mode='agenda';
    if(!this.noteLivePackets++)this.status('Recibiendo escritura en vivo en modo agenda X10.');
    for(const sample of samples)this.handlers.onPen?.(sample,this.limits?.maxX===DEFAULT_TABLET.maxX?{...DEFAULT_NOTE}:this.limits,'agenda');
    return;
   }
  }
  if(this.frameListeners.size&&b[0]===0xcd)for(const handler of this.frameListeners){try{handler(b);}catch(e){this.handlers.onDiagnostic?.('Receptor de datos X10: '+e.message);}}
  const limits=parseTabletInfo(b);
  if(limits){
   this.limits=limits;this.handlers.onLimits?.(limits);
   this.handlers.onDiagnostic?.('Resolución X10 (Data Ink): '+limits.maxX+'×'+limits.maxY);
   return;
  }
  const p=parseTabletPen(b);
  if(p){
   if(this.mode!=='tableta'){
    this.mode='tableta';
    if(!this.limits||this.limits.maxX<2000)this.limits={...DEFAULT_TABLET};
    this.handlers.onMode?.('tableta',this.limits);
    this.status('Recibiendo el lápiz de tinta mediante Data Ink.');
   }
   // Ignora coordenadas imposibles; no se guardan trazos inválidos.
   if(p.x<0||p.y<0||p.x>this.limits.maxX*1.15||p.y>this.limits.maxY*1.15)return;
   this.handlers.onPen?.(p,this.limits,'tableta');
   return;
  }
  if(b.length<3)return;
  if(b[0]===0xcd){
   const op=b[1];
   if(op===0x81&&b.length>=6){
    const a=b[3],v=b[4],c=b[5];
    this.send(frame(0x82,((a+v)*4)%255,((v+c)*4)%255,((c+10)*4)%255))
     .catch(err=>this.status('Error al verificar agenda: '+err.message));
    return;
   }
   if(op===0x82){
    if(b[3]===0){this.status('La X10 rechazó la verificación de agenda.');return;}
    if(b[3]===2){this.status('Modo agenda requiere PIN; no implementado todavía.');return;}
    if(b[3]!==1)return;
    this.mode='agenda';this.limits={...DEFAULT_NOTE};
    this.handlers.onMode?.('agenda',this.limits);
    this.status('Modo agenda autorizado. Esperando recepción de trazos en vivo.');
    if(!this.offlineReading)this._afterVerified();return;
   }
   if(op===0x95&&b.length>=11){
    const maxX=u24(b,3),maxY=u24(b,6),maxPressure=u16(b,9);
    if(maxX>2000&&maxY>2000){this.limits={maxX,maxY,maxPressure:maxPressure||8191};
     this.handlers.onLimits?.(this.limits);}
    return;
   }
   if(op===0x85&&b.length>=5){this.handlers.onPageCount?.(u16(b,3));return;}
   if(op===0x8a){
    if(Date.now()-this.pageEventAt>350){this.pageEventAt=Date.now();
     this.handlers.onNewPage?.(b.length>=5?u16(b,3):null);}
    return;
   }
   if(op===0x8d){this.handlers.onUndecodedNote?.(b);return;}
   if(!this.unknownTypes.has(op)){
    this.unknownTypes.add(op);this.handlers.onDiagnostic?.('Evento de agenda 0x'+op.toString(16));
   }
  }else if(this.packetCount<=8){
   this.handlers.onDiagnostic?.('Datos BLE recibidos: '+b.length+' bytes, formato sin identificar.');
  }
 }
 _onDisconnected(){
  this.mode='desconectado';clearInterval(this.keepalive);this.keepalive=null;
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
const api={Connection,mapPoint,parseTabletPen,parseTabletInfo,parseNotePenFrames,frame,DEFAULT_NOTE,DEFAULT_TABLET};
root.MiNoteX10Ble=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
