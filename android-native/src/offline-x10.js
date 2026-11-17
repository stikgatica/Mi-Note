/* Mi Note Android — lectura NO destructiva de páginas Huion X10.
   Basado en el protocolo de Reginleif86/huion-note-x10-ble (MIT).
   NUNCA transmite 0x8B (DELETE_PAGE), 0x8C (CLEAR_CACHE) ni cambia firmware.
   Requiere una conexión activa al FFE0 que exponga subscribeFrames() y send().
*/
(function(root){
 'use strict';
 const cmd=(op,a=0,b=0,c=0,d=0)=>Uint8Array.of(0xcd,op,8,a&255,b&255,c&255,d&255,0xed);
 const u16=(v,i)=>v[i]|v[i+1]<<8;
 const u24=(v,i)=>v[i]|v[i+1]<<8|v[i+2]<<16;
 const DEFAULT={maxX:28200,maxY:37400,maxPressure:8191};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 function decodePacket(pkt){
  if(pkt.length<12||pkt[0]!==0xcd||![0x87,0x88].includes(pkt[1])||pkt[2]!==0x7e)
   throw Error('Paquete X10 de tinta no reconocido.');
  // Los puntos son bloques de 6 bytes por paquete; el último byte es checksum.
  const n=Math.floor((pkt.length-6)/6);
  const points=[];
  for(let k=0;k<n;k++){
   const i=5+k*6;
   const press=pkt[i+4]|((pkt[i+5]&31)<<8);
   points.push({x:u16(pkt,i),y:u16(pkt,i+2),press,pen_down:(pkt[i+5]>>5)!==0&&press>0});
  }
  return points;
 }
 function decodePage(packets,index,limits){
  const strokes=[];let current=[];
  const flush=()=>{if(current.length>1)strokes.push(current);current=[];};
  for(const packet of packets){
   for(const p of decodePacket(packet)){
    if(!p.pen_down)flush();else current.push(p);
   }
  }
  flush();
  return {page:index,max_x:limits.maxX,max_y:limits.maxY,max_press:limits.maxPressure,strokes};
 }
 async function digestPackets(packets,index){
  const length=packets.reduce((n,p)=>n+p.length,4);
  const bytes=new Uint8Array(length),dv=new DataView(bytes.buffer);
  dv.setUint32(0,index,true);let offset=4;
  for(const pkt of packets){bytes.set(pkt,offset);offset+=pkt.length;}
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
 }
 class Inbox{
  constructor(conn){
   this.buffer=[];this.waiters=[];this.closed=false;
   this.unsubscribe=conn.subscribeFrames(raw=>{
    const p=Uint8Array.from(raw);
    if(p.length<3||p[0]!==0xcd)return;
    const i=this.waiters.findIndex(w=>(w.op===null||w.op===p[1])&&(!w.test||w.test(p)));
    if(i>=0){const w=this.waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(p);}
    else if([0x81,0x82,0x85,0x86,0x87,0x88,0x95].includes(p[1])){
     this.buffer.push(p);
     if(this.buffer.length>24000)this.buffer.shift();
    }
   });
  }
  wait(op,timeout=5000,test=()=>true){
   return this.waitAny([op],timeout,test);
  }
  waitAny(ops,timeout=5000,test=()=>true){
   if(this.closed)return Promise.reject(Error('Descarga cancelada.'));
   const allowed=new Set(ops);
   const matches=p=>allowed.has(p[1])&&test(p);
   const found=this.buffer.findIndex(matches);
   if(found>=0)return Promise.resolve(this.buffer.splice(found,1)[0]);
   return new Promise((resolve,reject)=>{
    const w={op:null,test:matches,resolve,reject};
    w.timer=setTimeout(()=>{
     this.waiters=this.waiters.filter(x=>x!==w);
     reject(Error('La Huion no entregó el paquete solicitado dentro del plazo.'));
    },timeout);
    this.waiters.push(w);
   });
  }
  discard(op){this.buffer=this.buffer.filter(p=>p[1]!==op);}
  close(){
   this.closed=true;this.unsubscribe?.();
   for(const w of this.waiters){clearTimeout(w.timer);w.reject(Error('Descarga finalizada.'));}
   this.waiters=[];this.buffer=[];
  }
 }
 const check=signal=>{if(signal?.aborted)throw Error('Descarga cancelada por el usuario.');};
 async function download(connection,{onPage=async()=>{},onProgress=()=>{},pin='',signal,maxPages=64}={}){
  if(!connection?.connected||typeof connection.subscribeFrames!=='function')
   throw Error('Conecta primero tu Huion X10 por Bluetooth.');
  if(connection.offlineReading)throw Error('Ya hay una descarga de páginas en curso.');
  connection.offlineReading=true;
  if(connection.keepalive){clearInterval(connection.keepalive);connection.keepalive=null;}
  // La lectura de batería opcional no debe competir por el canal BLE durante la descarga.
  const hadBatteryPolling=!!connection.batteryTimer;
  if(connection.batteryTimer){clearInterval(connection.batteryTimer);connection.batteryTimer=null;}
  const inbox=new Inbox(connection);
  let imported=0,empty=0,duplicate=0;
  try{
   onProgress('Iniciando modo agenda y lectura local, sin borrar páginas…');
   check(signal);
   await connection.send(cmd(0x81));
   const challenge=await inbox.wait(0x81,8000,p=>p.length>=6);
   // El manejador de la conexión responde a 0x81 con 0x82.
   const auth=await inbox.wait(0x82,8000,p=>p.length>=4);
   if(auth[3]===2){
    if(!/^\d{6}$/.test(pin))throw Error('La X10 pide un PIN de 6 dígitos. Escríbelo en Mi Note e inténtalo nuevamente.');
    const offsets=[104,117,105,111,110,35];
    const coded=[...pin].map((digit,i)=>(digit.charCodeAt(0)+offsets[i])&255);
    await connection.send(cmd(0x83,1,coded[0],coded[1],coded[2]));
    await connection.send(cmd(0x83,2,coded[3],coded[4],coded[5]));
    const second=await inbox.wait(0x82,7000,p=>p.length>=4);
    if(second[3]!==1)throw Error('PIN rechazado por la Huion.');
   }else if(auth[3]!==1)throw Error('La X10 rechazó el acceso al modo agenda ('+auth[3]+').');
   check(signal);
   inbox.discard(0x95);
   await connection.send(cmd(0x95));
   const info=await inbox.wait(0x95,6000,p=>p.length>=11);
   const limits={maxX:u24(info,3),maxY:u24(info,6),maxPressure:u16(info,9)||8191};
   if(limits.maxX<2000||limits.maxY<2000||limits.maxX>100000||limits.maxY>100000)
    throw Error('Dimensiones físicas X10 inválidas.');
   inbox.discard(0x85);
   await connection.send(cmd(0x85));
   const countReply=await inbox.wait(0x85,6000,p=>p.length>=5);
   const lastIndex=u16(countReply,3);
   if(lastIndex>maxPages)throw Error('La X10 informa '+lastIndex+' páginas; el límite seguro es '+maxPages+'. No se borró nada.');
   await connection.send(cmd(0x96,1,3));await pause(60);
   await connection.send(cmd(0x96,3,2));await pause(60);
   onProgress('Páginas lógicas: '+lastIndex+'. Revisando índices 0 a '+lastIndex+' sin eliminar datos…');
   for(let index=0;index<=lastIndex;index++){
    check(signal);
    inbox.discard(0x86);inbox.discard(0x87);inbox.discard(0x88);
    await connection.send(cmd(0x86,index&255,index>>8,0,0));
    const countFrame=await inbox.wait(0x86,10000,p=>p.length>=5&&p[2]===5);
    const total=u16(countFrame,3);
    if(total===0){empty++;onProgress('Hoja física '+index+': vacía. Seguimos buscando…');continue;}
    if(total>15000)throw Error('La hoja física '+index+' declara '+total+' paquetes: límite seguro alcanzado.');
    const got=new Map();
    const validPacket=p=>p.length>=12&&p[2]===0x7e&&u16(p,3)>=1&&u16(p,3)<=total;
    // Los paquetes pueden llegar fuera de orden, duplicados o con retraso.
    const deadline=Date.now()+Math.min(150000,16000+total*26);
    let lastSeen=false;
    while(got.size<total&&Date.now()<deadline){
     check(signal);
     let p;
     try{p=await inbox.wait(0x87,Math.min(3500,Math.max(250,deadline-Date.now())),validPacket);}
     catch{break;}
     const seq=u16(p,3);
     got.set(seq,p);
     if(seq===total){lastSeen=true;break;}
    }
    if(got.size<total){
     // GET_PAGE_PACKAGE 0x88: solicitar solo las secuencias faltantes.
     // Esperar respuestas 0x88 y datos 0x87 tardíos, no descartar ninguna hoja parcial.
     for(let round=0;round<6&&got.size<total;round++){
      check(signal);
      const missing=[];
      for(let k=1;k<=total;k++)if(!got.has(k))missing.push(k);
      onProgress('Hoja '+index+': '+got.size+'/'+total+' paquetes. Reintentando '+missing.length+' pendientes ('+(round+1)+'/6)…');
      // Drenar paquetes 0x87 tardíos antes de retransmitir.
      for(const seq of missing){
       const late=inbox.buffer.findIndex(p=>p[1]===0x87&&validPacket(p)&&u16(p,3)===seq);
       if(late>=0)got.set(seq,inbox.buffer.splice(late,1)[0]);
      }
      for(const seq of missing){
       if(got.has(seq))continue;
       check(signal);
       await connection.send(cmd(0x88,index&255,index>>8,seq&255,seq>>8));
       try{
        const reply=await inbox.waitAny([0x87,0x88],2600,p=>validPacket(p)&&u16(p,3)===seq);
        got.set(seq,reply);
       }catch{}
       // Pequeña pausa para no saturar BLE en páginas con muchos faltantes.
       if(!got.has(seq))await pause(80);
      }
      if(got.size<total&&round<5)await pause(350+round*180);
     }
    }
    if(got.size!==total)throw Error('Hoja física '+index+' incompleta ('+got.size+'/'+total+' paquetes). No se importó ni borró esa hoja.');
    const ordered=Array.from({length:total},(_,k)=>got.get(k+1));
    const result=decodePage(ordered,index,limits);
    result.digest=await digestPackets(ordered,index);
    result.packet_count=total;
    const outcome=await onPage(result);
    if(outcome==='duplicate')duplicate++;else imported++;
    onProgress('Hoja física '+index+': '+result.strokes.length+' trazos; '+(outcome==='duplicate'?'ya estaba guardada':'guardada localmente')+'.');
   }
   onProgress('Lectura terminada: '+imported+' hojas nuevas, '+duplicate+' ya importadas, '+empty+' vacías. La memoria X10 no se modificó.');
   return {imported,duplicate,empty,totalLogical:lastIndex+1};
  }finally{
   inbox.close();connection.offlineReading=false;
   if(connection.connected){connection.startKeepalive();if(hadBatteryPolling)connection.startBatteryPolling?.();}
  }
 }
 const api={download,decodePacket,decodePage,cmd};
 root.MiNoteX10Offline=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
