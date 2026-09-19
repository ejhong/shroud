import {gaussianBlur,normalize,clamp} from './model.js';

// The comparison baseline shares only the analysis grid and polarity.
// Tonal adjustments never modify the source or the unfiltered baseline.
export function heightFields(data,width,height,{smoothing=0,inverted=false,stretched=false,gamma=1}={}) {
  const baseline=Float32Array.from(data,v=>inverted?1-v:v);
  let adjusted=gaussianBlur(baseline,width,height,smoothing);
  if(stretched)adjusted=normalize(adjusted);
  adjusted=Float32Array.from(adjusted,v=>clamp(v)**gamma);
  return {baseline,adjusted};
}

export function crossSection(data,width,height,axis,position) {
  const vertical=axis==='vertical',count=vertical?width:height;
  const index=Math.round(clamp(position,0,100)/100*(count-1));
  const values=Float32Array.from({length:vertical?height:width},(_,i)=>data[vertical?i*width+index:index*width+i]);
  return {index,count,values};
}
