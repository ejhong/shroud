import {gaussianBlur,normalize,clamp,knownFace} from './model.js';

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

export const RECONSTRUCTION_VERSION='cloth-distance-1';
export const CLOTH_DATUM=60; // Arbitrary z origin, in assumed model millimetres.
export const RECONSTRUCTION_DEFAULTS=Object.freeze({
  cloth:'arched',range:37,law:'linear',sideDrop:30,lengthDrop:10,
  headDepth:45,broadScale:15,imageWidth:160
});

// Both laws have signal 1 at contact and 0 at the chosen maximum distance.
// The exponential is truncated and rescaled, with an illustrative k = 3.
// Neither law is a calibration of the Shroud photograph.
export function signalToGap(signal,range,law='linear') {
  const s=clamp(signal);
  return range*(law==='exponential'?-Math.log(Math.exp(-3)+s*(1-Math.exp(-3)))/3:1-s);
}
export function gapToSignal(gap,range,law='linear') {
  const d=clamp(gap/range);
  return law==='exponential'?(Math.exp(-3*d)-Math.exp(-3))/(1-Math.exp(-3)):1-d;
}

export function clothSurface(width,height,{sideDrop=30,lengthDrop=10}={}) {
  const cloth=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=2*x/(width-1)-1,v=2*y/(height-1)-1;
    cloth[y*width+x]=CLOTH_DATUM-sideDrop*u*u-lengthDrop*v*v;
  }
  return cloth;
}

// A featureless oval cap. Its shape is supplied, never inferred from the image.
export function broadHead(width,height,depth) {
  return Float32Array.from({length:width*height},(_,i)=>{
    const u=(i%width/(width-1)-.5)/.42,v=(Math.floor(i/width)/(height-1)-.47)/.46;
    return depth*Math.sqrt(Math.max(0,1-u*u-v*v));
  });
}

/** An explicit vertical-gap model on unchanged image x/y coordinates.
 * Does not solve cloth mechanics, lateral unwrapping, or missing anatomy.
 * Reference mode replaces the broad image shape, just as visibly as a prior.
 */
export function reconstruct(signal,width,height,options={}) {
  const p={...RECONSTRUCTION_DEFAULTS,...options};
  const gap=Float32Array.from(signal,s=>signalToGap(s,p.range,p.law));
  const flatBody=Float32Array.from(gap,d=>CLOTH_DATUM-d);
  let cloth,prior=null;
  if(p.cloth==='reference') {
    prior=broadHead(width,height,p.headDepth);
    const broadGap=gaussianBlur(gap,width,height,width*p.broadScale/100);
    cloth=Float32Array.from(prior,(z,i)=>z+broadGap[i]);
  }else cloth=clothSurface(width,height,p.cloth==='flat'?{sideDrop:0,lengthDrop:0}:p);
  const body=Float32Array.from(cloth,(z,i)=>z-gap[i]);
  return {gap,cloth,body,flatBody,prior,settings:p};
}

// The test photograph stays fixed while inverse assumptions change.
// Geometry is specified before rendering its gap signal; it is not the
// reconstruction output saved as its own supposed ground truth.
export function distanceControl(width=180,height=240) {
  const settings={...RECONSTRUCTION_DEFAULTS,range:60,sideDrop:24,lengthDrop:12};
  const body=Float32Array.from(knownFace(width,height),z=>65*z);
  const cloth=clothSurface(width,height,settings);
  const gap=Float32Array.from(cloth,(z,i)=>z-body[i]);
  if(gap.some(d=>d<0||d>settings.range))throw new Error('Control geometry exceeds its encoding range.');
  const data=Float32Array.from(gap,d=>gapToSignal(d,settings.range,settings.law));
  return {width,height,data,body,cloth,gap,settings};
}

export function geometryError(candidate,truth) {
  let squared=0,max=0;
  for(let i=0;i<truth.length;i++){const error=Math.abs(candidate[i]-truth[i]);squared+=error*error;max=Math.max(max,error);}
  return {rmse:Math.sqrt(squared/truth.length),max};
}

// One common physical scale for all panels. The renderer subtracts .2
// before scaling z, so this centers z at 30 mm without changing distances.
export function metricDisplay(data,width,height,imageWidth) {
  const aspect=width/height,fit=1/Math.max(1,aspect);
  return {data:Float32Array.from(data,z=>.2+(z-30)/100),height:200*fit/(imageWidth/aspect)};
}
