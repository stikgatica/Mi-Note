/* V0.62 — lectura GATT 2A19, no necesariamente igual a la app oficial. */
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
function showBattery(level,connected){
 const ok=connected&&Number.isInteger(level)&&level>=0&&level<=100;
 if(battery){battery.hidden=!ok;if(ok)battery.textContent=level+'%';}
 if(note)note.textContent=ok?'Batería GATT 2A19: '+level+'% (sin corroborar)':connected?'Batería: no disponible (la X10 no ofreció lectura compatible)':'Batería: desconectada';
 if(button)button.disabled=!connected;
}
showBattery(null,false);
window.addEventListener('minote:x10-battery',e=>{
 showBattery(e.detail?.level??null,!!e.detail?.connected);
});
