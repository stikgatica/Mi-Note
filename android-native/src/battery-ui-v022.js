/* Mi Note V0.65: indicador junto a Bluetooth.
 * Prioriza el comando Huion 0x8E, no el 2A19 que puede ser erróneo.
 * Lee 0x8E/0x8F cada 2 min mientras la app está visible y conectada.
 */
const bar=document.getElementById('floatingX10Quick');
const group=document.getElementById('floatingX10Panel');
const battery=document.createElement('span');
battery.id='floatingX10Battery';
battery.className='minote-battery-indicator';
battery.hidden=true;
battery.setAttribute('aria-label','Nivel de batería de Huion X10');
bar?.append(battery);
const note=document.createElement('small');
note.id='floatingX10BatteryStatus';
note.className='minote-battery-status';
note.textContent='Batería: esperando conexión';
group?.append(note);
const button=document.createElement('button');
button.id='floatingX10RefreshBattery';button.type='button';
button.textContent='↻ Actualizar batería';button.className='minote-battery-refresh';
group?.append(button);
let connected=false,vendorLevel=null,vendorAt=null,gattLevel=null;
let inFlight=null,lastQueryAt=0;
function showBattery(){
 const validVendor=connected&&Number.isInteger(vendorLevel)&&
  vendorLevel>=0&&vendorLevel<=100&&Number.isInteger(vendorAt)&&
  Date.now()-vendorAt<=180000;
 const level=validVendor?vendorLevel:null;
 if(battery){battery.hidden=level===null;if(level!==null)battery.textContent=level+'%';}
 if(note)note.textContent=validVendor?'Batería Huion 0x8E: '+level+'%':
  connected?'Batería Huion: esperando lectura válida':'Batería: desconectada';
 button.disabled=!connected||!!inFlight;
}
/** Una única consulta coordinada: panel, botón y temporizador comparten la promesa. */
window.MiNoteX10LiveStatusRefresh=async({force=false}={})=>{
 if(!connected||document.hidden)return null;
 if(inFlight)return inFlight;
 if(!force&&Date.now()-lastQueryAt<25000)return null;
 const api=window.MiNoteX10DeviceInfo;
 if(typeof api?.queryVendorStatus!=='function')return null;
 lastQueryAt=Date.now();
 inFlight=(async()=>{
  const status=await api.queryVendorStatus();
  if(!connected)return null;
  const detail={...status,connected:true};
  window.dispatchEvent(new CustomEvent('minote:x10-vendor-status',{detail}));
  return status;
 })();
 showBattery();
 try{return await inFlight;}
 finally{inFlight=null;showBattery();}
};
button.addEventListener('click',()=>{
 void window.MiNoteX10LiveStatusRefresh({force:true})
  .catch(error=>{note.textContent='No se pudo actualizar: '+(error?.message||String(error));});
});
showBattery();
window.addEventListener('minote:x10-battery',e=>{
 const wasConnected=connected;
 connected=!!e.detail?.connected;
 gattLevel=Number.isInteger(e.detail?.level)?e.detail.level:null;
 if(!connected){vendorLevel=null;vendorAt=null;lastQueryAt=0;}
 showBattery();
 if(connected&&!wasConnected&&!document.hidden)
  void window.MiNoteX10LiveStatusRefresh({force:true}).catch(()=>{});
});
window.addEventListener('minote:x10-vendor-status',e=>{
 if(!e.detail?.connected)return;
 connected=true;
 vendorLevel=Number.isInteger(e.detail.battery?.percent)?e.detail.battery.percent:null;
 vendorAt=Number.isInteger(e.detail.readAt)?e.detail.readAt:Date.now();
 showBattery();
});
window.addEventListener('minote:x10-vendor-battery',e=>{
 if(!e.detail?.connected)return;
 connected=true;
 vendorLevel=Number.isInteger(e.detail.level)?e.detail.level:null;
 vendorAt=Number.isInteger(e.detail.readAt)?e.detail.readAt:Date.now();
 showBattery();
});
setInterval(()=>{
 if(connected&&!document.hidden)
  void window.MiNoteX10LiveStatusRefresh().catch(()=>{showBattery();});
 else showBattery();
},120000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&connected)
  void window.MiNoteX10LiveStatusRefresh({force:true}).catch(()=>{});
});
