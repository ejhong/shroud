// A geometric strip model, not a fabric-dynamics solver. All lengths are model mm.
export const CLOTH_VERSION='cloth-strips-1';
export const CLOTH_DEFAULTS=Object.freeze({drape:.9,relief:.15,reach:25,transfer:'distance',slice:65});
export const CLOTH_WIDTH=700;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;

/** Least concave majorant: a taut, nonpenetrating envelope over one section. */
export function upperEnvelope(values){
  const hull=[];
  for(let i=0;i<values.length;i++){
    while(hull.length>1){
      const a=hull.at(-2),b=hull.at(-1);
      if((values[b]-values[a])/(b-a)>(values[i]-values[b])/(i-b))break;
      hull.pop();
    }
    hull.push(i);
  }
  const out=new Float64Array(values.length);
  for(let j=1;j<hull.length;j++){
    const a=hull[j-1],b=hull[j];
    for(let i=a;i<=b;i++)out[i]=mix(values[a],values[b],(i-a)/(b-a));
  }
  return out;
}

/** Map a cross-section to intrinsic cloth distance, registered at its centre. */
export function makeStrip(body,spacing,{drape=1,peak=Math.max(...body),clothWidth=CLOTH_WIDTH}={}){
  const n=body.length,centre=(n-1)/2;
  if(!Number.isInteger(centre))throw new Error('A strip needs an odd number of samples.');
  const envelope=upperEnvelope(body),z=Float64Array.from(envelope,h=>mix(peak,h,clamp(drape)));
  const s=new Float64Array(n);
  for(let i=centre+1;i<n;i++)s[i]=s[i-1]+Math.hypot(spacing,z[i]-z[i-1]);
  for(let i=centre-1;i>=0;i--)s[i]=s[i+1]-Math.hypot(spacing,z[i+1]-z[i]);
  if(s[0]<-clothWidth/2||s[n-1]>clothWidth/2)throw new Error('The chosen cloth is too narrow for this section.');
  const x=Float64Array.from({length:n+2},(_,i)=>i===0?-centre*spacing+(-clothWidth/2-s[0]):i===n+1?centre*spacing+(clothWidth/2-s[n-1]):(i-1-centre)*spacing);
  return {x,z:Float64Array.from([z[0],...z,z[n-1]]),s:Float64Array.from([-clothWidth/2,...s,clothWidth/2]),centre:centre+1};
}

/** Unbend segment angles, preserving every strip segment's length at every step. */
export function unfoldStrip(strip,amount){
  const t=clamp(amount),{s,centre}=strip,n=s.length,x=new Float64Array(n),z=new Float64Array(n);
  x[centre]=strip.x[centre];z[centre]=(1-t)*strip.z[centre];
  const segment=i=>{
    const angle=Math.atan2(strip.z[i+1]-strip.z[i],strip.x[i+1]-strip.x[i])*(1-t),length=s[i+1]-s[i];
    return [length*Math.cos(angle),length*Math.sin(angle)];
  };
  for(let i=centre;i<n-1;i++){const [dx,dz]=segment(i);x[i+1]=x[i]+dx;z[i+1]=z[i]+dz;}
  for(let i=centre-1;i>=0;i--){const [dx,dz]=segment(i);x[i]=x[i+1]-dx;z[i]=z[i+1]-dz;}
  return {x,z};
}

export function interpolate(axis,values,p){
  if(p<=axis[0])return values[0];
  if(p>=axis.at(-1))return values.at(-1);
  let lo=0,hi=axis.length-1;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(axis[mid]>p)hi=mid;else lo=mid;}
  return mix(values[lo],values[hi],(p-axis[lo])/(axis[hi]-axis[lo]));
}

export function transferSignal(gap,{transfer='distance',reach=25}={}){
  // Contact has a fixed 1 mm numerical band, not a pressure or chemistry model.
  return transfer==='contact'?(gap<=1+1e-7?1:0):clamp(1-gap/Math.max(.01,reach));
}

export function buildCloth(source,options={},depth=1){
  const settings={...CLOTH_DEFAULTS,...options},w=source.width,h=source.height;
  const physicalWidth=source.coordinates.width,physicalHeight=source.coordinates.height,dx=physicalWidth/(w-1);
  const body=Float32Array.from(source.data,z=>z*depth),peak=body.reduce((a,b)=>Math.max(a,b),0),strips=[];
  const width=351,height=h,signal=new Float32Array(width*height),sourceX=new Float32Array(signal.length),gaps=new Float32Array(signal.length);
  for(let y=0;y<h;y++){
    const row=body.subarray(y*w,(y+1)*w),strip=makeStrip(row,dx,{drape:settings.drape,peak});strips.push(strip);
    for(let col=0;col<width;col++){
      const i=y*width+col,u=(col/(width-1)-.5)*CLOTH_WIDTH,x=interpolate(strip.s,strip.x,u);
      const z=interpolate(strip.s,strip.z,u),px=(x/physicalWidth+.5)*(w-1),left=Math.floor(px),t=px-left;
      sourceX[i]=x;
      if(left<0||left>=w-1){gaps[i]=z;continue;}
      const depthAt=mix(row[left],row[left+1],t),mask=mix(source.mask[y*w+left],source.mask[y*w+left+1],t);
      gaps[i]=Math.max(0,z-depthAt);
      signal[i]=mask*transferSignal(gaps[i],settings);
    }
  }
  return {settings,depth,body,strips,signal,sourceX,gaps,width,height,physicalWidth,physicalHeight,sourceWidth:w,peak};
}

export function sectionMetrics(model,position=65,guideWidth=120){
  const row=Math.round(clamp(position/100)*(model.height-1)),strip=model.strips[row];
  const a=interpolate(strip.x,strip.s,-guideWidth/2),b=interpolate(strip.x,strip.s,guideWidth/2);
  return {row,projected:guideWidth,flattened:b-a,widening:100*((b-a)/guideWidth-1),left:a,right:b};
}

/** Mesh vertices share fixed material coordinates through the entire animation. */
export function clothMesh(model,amount,{columns=141,rowStep=2}={}){
  const rows=Math.ceil((model.height-1)/rowStep)+1,positions=new Float32Array(columns*rows*3),uv=new Float32Array(columns*rows*2);
  for(let y=0;y<rows;y++){
    const row=Math.min(model.height-1,y*rowStep),strip=model.strips[row],unfolded=unfoldStrip(strip,amount);
    for(let x=0;x<columns;x++){
      const i=y*columns+x,u=(x/(columns-1)-.5)*CLOTH_WIDTH;
      positions.set([interpolate(strip.s,unfolded.x,u),(.5-row/(model.height-1))*model.physicalHeight,interpolate(strip.s,unfolded.z,u)],i*3);
      uv.set([x/(columns-1),row/(model.height-1)],i*2);
    }
  }
  return {positions,uv,columns,rows};
}

export function headMesh(source,depth=1){
  const columns=source.width,rows=source.height,positions=new Float32Array(columns*rows*3);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)positions.set([
    (x/(columns-1)-.5)*source.coordinates.width,
    (.5-y/(rows-1))*source.coordinates.height,source.data[y*columns+x]*depth
  ],(y*columns+x)*3);
  return {positions,columns,rows,mask:source.mask};
}
