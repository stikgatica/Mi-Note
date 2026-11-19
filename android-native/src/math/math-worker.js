import {propose} from './math-geometry.mjs';
self.onmessage=({data})=>{
 const {id,strokes,type}=data||{};
 try{
  const result=propose(strokes,type);
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:error?.message||'No se pudo analizar la figura.'});}
};