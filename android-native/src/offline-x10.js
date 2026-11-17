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
 let lastDiagnostic=null;
 const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
 function getLastDiagnostic(includeRaw=false){
  if(!lastDiagnostic)return null;
  const snapshot=JSON.parse(JSON.stringify(lastDiagnostic));
  if(!includeRaw)for(const p of snapshot.pages)delete p.rawSampleHex;
  return snapshot;
 }
 function pointStatistics(packets,limits){
  const statuses=Array(8).fill(0);let points=0,penDown=0,withPressure=0,validCoords=0;
  let run=0,maxRun=0,visibleRuns=0,penDownWithPressure=0;
  for(const packet of packets)for(const p of decodePacket(packet)){
   points++;
   if(p.pen_down){penDown++;run++;maxRun=Math.max(maxRun,run);}
   else {if(run>1)visibleRuns++;run=0;}
   if(p.press>0)withPressure++;
   if(p.press>0&&p.pen_down)penDownWithPressure++;
   if(p.x<=limits.maxX&&p.y<=limits.maxY)validCoords++;
  }
  if(run>1)visibleRuns++;
  // Status is also summarized directly from the sixth byte of each record.
  for(const packet of packets){
   const n=Math.floor((packet.length-6)/6);
   for(let k=0;k<n;k++)statuses[packet[10+k*6]>>5]++;
  }
  return {points,penDown,withPressure,penDownWithPressure,validCoords,maxConsecutiveActivePoints:maxRun,estimatedStrokes:visibleRuns,statuses};
 }

 function decodePacket(pkt){
  if(pkt.length<6||pkt[0]!==0xcd||![0x87,0x88].includes(pkt[1])||pkt[2]!==pkt.length||((pkt.length-6)%6)!==0)
   throw Error('Paquete X10 de tinta inválido o incompleto.');
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
  // Determinados firmware rellenan 19 de 20 registros de cada paquete con
  // cero. En ese caso la escritura disponible es una muestra MUY dispersa:
  // conservar cada punto auténtico como marca aislada, sin interpolar trazos.
  if(!strokes.length){
   const ink=[];
   let sparse=true;
   for(const packet of packets){
    const points=decodePacket(packet);
    const active=points.filter(p=>p.pen_down&&p.x<=limits.maxX&&p.y<=limits.maxY);
    const blank=points.every(p=>p.pen_down||(!p.x&&!p.y&&!p.press));
    if(active.length!==1||!blank){sparse=false;break;}
    ink.push(active[0]);
   }
   if(sparse&&ink.length>=8&&new Set(ink.map(p=>p.x+','+p.y)).size>=4)return {
    page:index,max_x:limits.maxX,max_y:limits.maxY,max_press:limits.maxPressure,
    strokes:ink.map(p=>[p]),partial:true,partialReason:'one-sample-per-packet',
    sampleCount:ink.length
   };
  }
  return {page:index,max_x:limits.maxX,max_y:limits.maxY,max_press:limits.maxPressure,strokes,partial:false};
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
  let imported=0,partialImported=0,empty=0,duplicate=0,undecodable=0,noReply=0;
  const diagnostic={format:'MiNoteX10OfflineDiagnostic',version:1,startedAt:new Date().toISOString(),cursor:null,scanEnd:null,limits:null,pages:[],result:null,error:null};
  lastDiagnostic=diagnostic;
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
   if(lastIndex>=maxPages)throw Error('La X10 informa '+lastIndex+' páginas; el límite seguro de índices es '+(maxPages-1)+'. No se borró nada.');
   // El firmware puede conservar páginas vacías iniciales y escribir en índices 7+.
   // Consultar un mínimo acotado de 16 índices si 0x85 informa un contador bajo.
   const scanEnd=Math.min(maxPages-1,Math.max(lastIndex,15));
   diagnostic.cursor=lastIndex;diagnostic.scanEnd=scanEnd;diagnostic.limits=limits;
   await connection.send(cmd(0x96,1,3));await pause(60);
   await connection.send(cmd(0x96,3,2));await pause(60);
   onProgress('Indicador X10: '+lastIndex+'. Explorando índices físicos 0 a '+scanEnd+' (incluidos vacíos), sin eliminar datos…');
   for(let index=0;index<=scanEnd;index++){
    check(signal);
    const entry={index,status:'checking'};
    diagnostic.pages.push(entry);
    inbox.discard(0x86);inbox.discard(0x87);inbox.discard(0x88);
    await connection.send(cmd(0x86,index&255,index>>8,0,0));
    let countFrame;
    try{
     countFrame=await inbox.wait(0x86,index<=lastIndex?10000:2100,p=>p.length>=5&&p[2]===5);
    }catch(error){
     if(index<=lastIndex)throw error;
     noReply++;entry.status='no-response';
     onProgress('Índice '+index+': sin respuesta adicional; continuamos sin modificar la X10.');
     continue;
    }
    const total=u16(countFrame,3);entry.packetCount=total;
    if(total===0){entry.status='empty';empty++;onProgress('Hoja física '+index+': vacía. Seguimos buscando…');continue;}
    if(total>15000)throw Error('La hoja física '+index+' declara '+total+' paquetes: límite seguro alcanzado.');
    const got=new Map();
    const validPacket=p=>{
     // El último paquete 0x87/0x88 suele ser más corto que los 126 bytes
     // del stream. byte[2] declara la longitud REAL, no siempre 0x7E.
     if(!p||p.length<6||p[0]!==0xcd||![0x87,0x88].includes(p[1]))return false;
     if(p[2]!==p.length||((p.length-6)%6)!==0)return false;
     const seq=u16(p,3);return seq>=1&&seq<=total;
    };
    // Los paquetes pueden llegar fuera de orden, duplicados o con retraso.
    const deadline=Date.now()+Math.min(150000,16000+total*26);
    let shortPacketCount=0;
    let lastSeen=false;
    while(got.size<total&&Date.now()<deadline){
     check(signal);
     let p;
     try{p=await inbox.wait(0x87,Math.min(3500,Math.max(250,deadline-Date.now())),validPacket);}
     catch{break;}
     const seq=u16(p,3);
     got.set(seq,p);
     if(p.length<126)shortPacketCount++;
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
       if(late>=0){const pkt=inbox.buffer.splice(late,1)[0];got.set(seq,pkt);if(pkt.length<126)shortPacketCount++;}
      }
      for(const seq of missing){
       if(got.has(seq))continue;
       check(signal);
       await connection.send(cmd(0x88,index&255,index>>8,seq&255,seq>>8));
       try{
        const reply=await inbox.waitAny([0x87,0x88],2600,p=>validPacket(p)&&u16(p,3)===seq);
        got.set(seq,reply);
        if(reply.length<126)shortPacketCount++;
       }catch{}
       // Pequeña pausa para no saturar BLE en páginas con muchos faltantes.
       if(!got.has(seq))await pause(80);
      }
      if(got.size<total&&round<5)await pause(350+round*180);
     }
    }
    if(got.size!==total){
     entry.status='incomplete';entry.receivedPackets=got.size;
     const missing=[];
     for(let seq=1;seq<=total;seq++)if(!got.has(seq))missing.push(seq);
     const nearby=inbox.buffer.filter(p=>(p[1]===0x87||p[1]===0x88)&&p.length>=5)
      .slice(-8).map(p=>'#'+u16(p,3)+'('+p.length+'B)').join(', ');
     throw Error('Hoja física '+index+' incompleta ('+got.size+'/'+total+' paquetes); faltan secuencias '
      +missing.slice(0,16).join(', ')+(missing.length>16?'…':'')+
      '. Paquetes cortos recibidos: '+shortPacketCount+'. Otros fragmentos: '+(nearby||'ninguno')+
      '. No se importó ni borró esa hoja.');
    }
    const ordered=Array.from({length:total},(_,k)=>got.get(k+1));
    // Some X10 firmware responds to 0x87 with 1 ink point + zero padding.
    // Ask 0x88 for a small sample to see if retransmission restores more data.
    // This is read-only. Never replace a good packet with a sparser reply.
    const liveCount=p=>decodePacket(p).filter(v=>v.pen_down).length;
    const sparseFrame=ordered.length>=8&&ordered.every(p=>liveCount(p)===1);
    if(sparseFrame){
     const selected=[...new Set([1,Math.max(1,Math.floor(total/2)),total])];
     const checkResult={tested:0,moreComplete:0,lateResponses:0,recovered:0};
     for(const seq of selected){
      check(signal);
      inbox.discard(0x88);
      await connection.send(cmd(0x88,index&255,index>>8,seq&255,seq>>8));
      try{
       const answer=await inbox.waitAny([0x87,0x88],1000,p=>validPacket(p)&&u16(p,3)===seq);
       checkResult.tested++;
       if(liveCount(answer)>liveCount(ordered[seq-1])){
        ordered[seq-1]=answer;checkResult.moreComplete++;checkResult.recovered++;
       }
      }catch{checkResult.lateResponses++;}
     }
     if(checkResult.moreComplete){
      for(let seq=1;seq<=total&&seq<=1000;seq++){
       if(selected.includes(seq))continue;
       check(signal);
       await connection.send(cmd(0x88,index&255,index>>8,seq&255,seq>>8));
       try{
        const answer=await inbox.waitAny([0x87,0x88],650,p=>validPacket(p)&&u16(p,3)===seq);
        if(liveCount(answer)>liveCount(ordered[seq-1])){
         ordered[seq-1]=answer;checkResult.recovered++;
        }
       }catch{}
      }
     }
     entry.retransmitProbe=checkResult;
     onProgress('Hoja '+index+': verificados '+selected.length+' paquetes con 0x88; '+checkResult.recovered+' se recibieron con más puntos de escritura. Sin borrar datos.');
    }
    const result=decodePage(ordered,index,limits);
    entry.status=result.partial?'partial':result.strokes.length?'decodable':'undecodable';
    entry.strokes=result.strokes.length;
    entry.partial=!!result.partial;
    entry.partialSamples=result.partial?result.sampleCount:0;
    entry.receivedPackets=ordered.length;
    entry.stats=pointStatistics(ordered,limits);
    if(!result.strokes.length){
     // La muestra cruda permanece solamente en memoria hasta que el usuario
     // confirme su exportación explícita; puede contener escritura personal.
     const sampled=[...ordered.slice(0,12),...ordered.slice(-2)];
     entry.rawSampleHex=[...new Set(sampled.map(hex))];
    } 
    if(!result.strokes.length){
     // Paquetes sin tinta decodificable no deben ocultar páginas posteriores.
     // Nunca guardar hojas vacías ni borrarlas de la memoria física.
     undecodable++;
     const sample=ordered.slice(0,3).flatMap(decodePacket).slice(0,12);
     const down=sample.filter(p=>p.pen_down).length;
     const pressure=sample.filter(p=>p.press>0).length;
     onProgress('Índice '+index+': '+total+' paquetes pero 0 trazos; muestra '+down+'/'+sample.length+' puntos activos y '+pressure+' con presión. Buscando otras hojas; memoria intacta.');
     continue;
    }
    result.digest=await digestPackets(ordered,index);
    result.packet_count=total;
    const outcome=await onPage(result);
    if(outcome==='duplicate'){duplicate++;entry.status='duplicate';}
    else {imported++;if(result.partial)partialImported++;entry.status=result.partial?'partial-imported':'imported';}
    onProgress(result.partial
     ?'Hoja física '+index+': guardadas '+result.sampleCount+' MARCAS AISLADAS como muestra parcial. NO es la escritura completa; no se unieron puntos ni se borró la X10.'
     :'Hoja física '+index+': '+result.strokes.length+' trazos; '+(outcome==='duplicate'?'ya estaba guardada':'guardada localmente')+'.');
   }
   if(imported===0&&duplicate===0)
    throw Error('Se revisaron los índices 0 a '+scanEnd+' sin encontrar tinta importable: '+empty+' vacíos, '+undecodable+' con paquetes sin trazos y '+noReply+' sin respuesta. La memoria X10 NO se modificó. No borre las páginas con Huion Note.');
   diagnostic.result={imported,partialImported,duplicate,empty,undecodable,noReply};
   onProgress('Lectura terminada: '+imported+' hojas nuevas ('+partialImported+' con muestras PARCIALES), '+duplicate+' repetidas, '+empty+' vacías, '+undecodable+' sin trazos y '+noReply+' sin respuesta. X10 intacta.');
   return {imported,partialImported,duplicate,empty,undecodable,noReply,scanned:scanEnd+1,totalLogical:lastIndex+1};
  }catch(error){
   diagnostic.error=error?.message||String(error);
   throw error;
  }finally{
   diagnostic.endedAt=new Date().toISOString();
   inbox.close();connection.offlineReading=false;
   if(connection.connected){connection.startKeepalive();if(hadBatteryPolling)connection.startBatteryPolling?.();}
  }
 }
 const api={download,decodePacket,decodePage,cmd,getLastDiagnostic};
 root.MiNoteX10Offline=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
