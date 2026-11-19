import {propose} from './math-geometry.mjs';
import {recognizeAutomatic} from './math-auto.mjs';
self.onmessage=({data})=>{
 const {id,strokes,type,action,intention='auto'}=data||{};
 try{
  const result=action==='automatic'?recognizeAutomatic(strokes,intention):propose(strokes,type);
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:error?.message||'No se pudo analizar la figura.'});}
};