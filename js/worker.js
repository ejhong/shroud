import {simulate,fitMask} from './model.js';
self.onmessage=({data})=>{
  try {
    if(data.action==='fit'){
      const result=fitMask(new Float32Array(data.target),data.width,data.height,data.settings);
      self.postMessage({id:data.id,result},[result.mask.buffer,result.target.buffer,result.predicted.buffer]);return;
    }
    const result=simulate(new Float32Array(data.mask),data.width,data.height,data.settings,data.frames??16);
    self.postMessage({id:data.id,result},result.frames.map(f=>f.buffer));
  } catch(error){self.postMessage({id:data.id,error:error.message});}
};
