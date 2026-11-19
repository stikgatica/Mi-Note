import {createTimeline, timelineAt} from './replay-timeline.mjs';
import {exportBlob} from './export-native.js';
const $=id=>document.getElementById(id);
const dialog=$('replayDialog'),canvas=$('replayCanvas'),ctx=canvas?.getContext('2d',{alpha:false});
const play=$('replayPlay'),seek=$('replaySeek'),status=$('replayStatus'),video=$('replayVideo'),shareVideo=$('replayShareVideo');
let snapshot=null,timeline=null,position=0,running=false,raf=0,previous=0,recording=false;
const clamp=(x,a,b)=>Math.max(a,Math.min(x,b));
const tell=s=>{if(status)status.textContent=s;};
function paintBackground(){
 ctx.fillStyle='white';ctx.fillRect(0,0,1000,1400);
 ctx.lineWidth=1;ctx.strokeStyle='#dce7f4';ctx.beginPath();
 if(snapshot.template==='grid'){
  for(let x=0;x<=1000;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,1400);}
  for(let y=0;y<=1400;y+=40){ctx.moveTo(0,y);ctx.lineTo(1000,y);}
 }else if(snapshot.template==='ruled'){
  for(let y=75;y<1400;y+=55){ctx.moveTo(0,y);ctx.lineTo(1000,y);}
 }
 ctx.stroke();
}
function drawSegment(a,b,c,w){
 ctx.strokeStyle=c;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.lineWidth=Math.max(.8,w*(.45+.55*((a[2]||.5)+(b[2]||.5))/2));
 ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
}
function drawAt(f){
 if(!timeline||!ctx)return;
 position=clamp(Number(f)||0,0,1);
 const t=timelineAt(timeline,position);
 ctx.setTransform(canvas.width/1000,0,0,canvas.height/1400,0,0);
 paintBackground();
 for(const clip of timeline.clips){
  if(t<clip.start)break;
  if(clip.points.length===1){
   const p=clip.points[0];ctx.fillStyle=clip.color;ctx.beginPath();
   ctx.arc(p[0],p[1],Math.max(.5,clip.width/2),0,Math.PI*2);ctx.fill();
   continue;
  }
  const elapsed=clamp(t-clip.start,0,clip.duration);
  for(const seg of clip.steps){
   if(elapsed<=seg.from)break;
   if(elapsed>=seg.to)drawSegment(seg.a,seg.b,clip.color,clip.width);
   else{
    const k=clamp((elapsed-seg.from)/(seg.to-seg.from),0,1);
    const b=[seg.a[0]+(seg.b[0]-seg.a[0])*k,seg.a[1]+(seg.b[1]-seg.a[1])*k,seg.a[2]+(seg.b[2]-seg.a[2])*k];
    drawSegment(seg.a,b,clip.color,clip.width);break;
   }
  }
 }
 seek.value=String(Math.round(position*1000));
 $('replayProgress').textContent=Math.round(position*100)+'%';
}
function stop(){running=false;cancelAnimationFrame(raf);raf=0;previous=0;play.textContent='▶ Reproducir';}
function animate(time){
 if(!running)return;
 const elapsed=previous?Math.min(100,time-previous):0;previous=time;
 const length=clamp(timeline.total/350,5,90);
 const speed=Number($('replaySpeed').value)||1;
 drawAt(position+elapsed*speed/(1000*length));
 if(position>=1){stop();return;}
 raf=requestAnimationFrame(animate);
}
function start(){
 if(!timeline?.strokes||recording)return;
 if(position>=1)drawAt(0);
 running=true;previous=0;play.textContent='⏸ Pausar';raf=requestAnimationFrame(animate);
}
function open(){
 if(!window.MiNoteReplaySnapshot){tell('No se pudo obtener la hoja.');return;}
 snapshot=window.MiNoteReplaySnapshot();
 timeline=createTimeline(snapshot.strokes);stop();$('mobileMoreDialog')?.close();dialog.showModal();drawAt(0);
 play.disabled=!timeline.strokes;video.disabled=!timeline.strokes;if(shareVideo)shareVideo.disabled=!timeline.strokes;
 tell(timeline.strokes+' trazos. Se reproduce el orden original; el tiempo es aproximado.');
}
function close(){
 stop();recording=false;dialog.close();snapshot=null;timeline=null;
}
async function exportVideo(action='save'){
 if(recording||!timeline?.strokes)return;
 if(!canvas.captureStream||!window.MediaRecorder){tell('La grabación de video no está disponible en este Android.');return;}
 const mime=['video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported?.(x));
 if(!mime){tell('Este Android no admite WebM. Puede reproducir la escritura en pantalla.');return;}
 stop();drawAt(0);recording=true;video.disabled=true;if(shareVideo)shareVideo.disabled=true;
 let stream,recorder;
 try{
  stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:mime});
  const parts=[];recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
  const complete=new Promise(resolve=>{recorder.onstop=resolve;});
  recorder.start(500);tell('Grabando WebM. Mantenga abierta la reproducción.');
  await new Promise(resolve=>{
   const duration=clamp(timeline.total/350,5,90),started=performance.now();
   function frame(){
    if(!recording||!dialog.open){resolve();return;}
    const p=clamp((performance.now()-started)/(duration*1000),0,1);
    drawAt(p);
    if(p>=1){resolve();return;}
    raf=requestAnimationFrame(frame);
   }
   raf=requestAnimationFrame(frame);
  });
  if(recorder.state!=='inactive')recorder.stop();
  await complete;
  if(parts.length){
   const name='MiNote_reproduccion_'+String(snapshot?.title||'hoja').replace(/[\\/<>:"|?*]/g,'_').slice(0,50)+'.webm';
   tell(action==='save'?'Abriendo selector de Android para guardar el video…':'Preparando video para compartir…');
   const result=await exportBlob(new Blob(parts,{type:'video/webm'}),name,'video/webm',action,(done,total)=>{
    if(total>4*1024*1024)tell('Transfiriendo WebM a Android: '+Math.round(done/total*100)+'%');
   });
   if(result?.cancelled)tell('Guardado cancelado. La hoja no se modificó.');
   else tell(action==='save'?'Video guardado con Android en la ubicación elegida.':'Panel Compartir de Android abierto. El video está listo para enviar.');
  }
  else tell('No se obtuvieron datos de video.');
 }catch(e){tell('No se pudo exportar el video: '+e.message);}
 finally{
  try{if(recorder?.state!=='inactive')recorder.stop();}catch{}
  stream?.getTracks().forEach(track=>track.stop());
  recording=false;video.disabled=false;if(shareVideo)shareVideo.disabled=false;cancelAnimationFrame(raf);
 }
}
$('replayOpen')?.addEventListener('click',open);
$('replayClose')?.addEventListener('click',close);
dialog?.addEventListener('cancel',e=>{e.preventDefault();close();});
play?.addEventListener('click',()=>running?stop():start());
$('replayRestart')?.addEventListener('click',()=>{stop();drawAt(0);});
seek?.addEventListener('input',()=>{if(!recording){stop();drawAt(Number(seek.value)/1000);}});
video?.addEventListener('click',()=>{void exportVideo('save');});
shareVideo?.addEventListener('click',()=>{void exportVideo('share');});
