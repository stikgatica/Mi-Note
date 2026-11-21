/* V0.64 — preferir Huion 0x8E; 2A19 solo como lectura alternativa. */
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
button.textContent='↻ Consultar batería';button.className='minote-battery-refresh';
button.addEventListener('click',()=>{
 const fn=window.MiNoteX10BatteryRefresh;
 if(!fn){note.textContent='Batería: primero conecte la Huion X10';return;}
 note.textContent='Consultando batería…';
 Promise.resolve(fn()).catch(()=>{note.textContent='Batería: no disponible';});
});
group?.append(button);
let connected=false,vendorLevel=null,vendorAt=null,gattLevel=null;
function showBattery(){
 const validVendor=connected&&Number.isInteger(vendorLevel)&&
   vendorLevel>=0&&vendorLevel<=100&&Number.isInteger(vendorAt)&&Date.now()-vendorAt<=180000;
 const validGatt=connected&&Number.isInteger(gattLevel)&&gattLevel>=0&&gattLevel<=100;
 const level=validVendor?vendorLevel:validGatt?gattLevel:null;
 if(battery){battery.hidden=level===null;if(level!==null)battery.textContent=level+'%';}
 if(note)note.textContent=validVendor?'Batería Huion 0x8E: '+level+'%':
  validGatt?'Batería GATT alternativa: '+level+'% (no corroborado)':
  connected?'Batería: no disponible':'Batería: desconectada';
 if(button)button.disabled=!connected;
}
showBattery();
window.addEventListener('minote:x10-battery',e=>{
 connected=!!e.detail?.connected;
 gattLevel=Number.isInteger(e.detail?.level)?e.detail.level:null;
 if(!connected){vendorLevel=null;vendorAt=null;}
 showBattery();
});
window.addEventListener('minote:x10-vendor-battery',e=>{
 if(!e.detail?.connected)return;
 connected=true;
 vendorLevel=Number.isInteger(e.detail.level)?e.detail.level:null;
 vendorAt=Number.isInteger(e.detail.readAt)?e.detail.readAt:Date.now();
 showBattery();
});
