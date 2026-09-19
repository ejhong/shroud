/** Deterministic, unit-based forward model. See methods.html for assumptions. */
export const MODEL_VERSION = '1.0.0';
export const DEFAULTS = Object.freeze({days:10, gap:3, glass:3, topPaint:true, rotation:90,
  latitude:44, day:172, opacity:0.98, diffuse:0.12, rate:0.055, fixed:false, widthMM:300});
export const clamp = (x, low=0, high=1) => Math.max(low, Math.min(high, x));
const rad = Math.PI / 180;

// NOAA's fractional-year declination approximation. Time is local SOLAR time.
export function sunPosition(latitude, day, hour) {
  const g = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const dec = 0.006918 - 0.399912*Math.cos(g) + 0.070257*Math.sin(g)
    - 0.006758*Math.cos(2*g) + 0.000907*Math.sin(2*g)
    - 0.002697*Math.cos(3*g) + 0.00148*Math.sin(3*g);
  const lat=latitude*rad, h=(hour-12)*15*rad;
  return {east:-Math.cos(dec)*Math.sin(h), north:Math.cos(lat)*Math.sin(dec)-Math.sin(lat)*Math.cos(dec)*Math.cos(h),
    up:Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(h)};
}

/** Top-painted glass refracts the ray; an air gap adds an unrefracted segment. */
export function shadowShift(sun, p) {
  const h=Math.hypot(sun.east,sun.north), r=p.rotation*rad;
  const tg=h / Math.sqrt(1.5**2-h*h); // tan(theta_glass), Snell n=1.5
  const distance=p.gap*h/Math.max(0.01,sun.up)+(p.topPaint?p.glass*tg:0);
  const e=h>1e-9?sun.east/h*distance:0, n=h>1e-9?sun.north/h*distance:0;
  return {x:e*Math.cos(r)+n*Math.sin(r), y:e*Math.sin(r)-n*Math.cos(r)};
}

export function exposurePath(settings={}) {
  const p={...DEFAULTS,...settings}, path=[], step=0.5;
  for(let day=0;day<p.days;day++) {
    for(let hour=0.25;hour<24;hour+=step) {
      const sun=sunPosition(p.latitude, ((p.day+day-1)%365)+1,hour);
      if(sun.up<Math.sin(5*rad))continue;
      // A clear-sky proxy, normalized to unit irradiance for an overhead sun.
      const energy=step*sun.up*Math.exp(-0.14*(1/sun.up-1));
      path.push({sun:p.fixed?{east:0,north:0,up:1}:sun,energy,day:day+1,hour});
    }
  }
  return path;
}

export function sample(data,w,h,x,y,outside=0) {
  const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;
  const get=(a,b)=>a>=0&&a<w&&b>=0&&b<h?data[b*w+a]:outside;
  return (get(ix,iy)*(1-dx)+get(ix+1,iy)*dx)*(1-dy)+(get(ix,iy+1)*(1-dx)+get(ix+1,iy+1)*dx)*dy;
}

export function reflectance(dose,rate) { return 0.88-0.53*Math.exp(-rate*Math.max(0,dose)); }

/** The solar disc is sampled at its centre and four points, radius 0.266 degrees. */
function solarDisc(sun) {
  const out=[{sun,weight:0.4}], radius=0.266*rad*0.707;
  const n=Math.hypot(sun.east,sun.north);
  const a=n>1e-6?[-sun.north/n,sun.east/n,0]:[1,0,0];
  const b=[sun.north*a[2]-sun.up*a[1],sun.up*a[0]-sun.east*a[2],sun.east*a[1]-sun.north*a[0]];
  for(const axis of [a,b]) for(const sign of [-1,1]) {
    let v=[sun.east+axis[0]*radius*sign,sun.north+axis[1]*radius*sign,sun.up+axis[2]*radius*sign];
    const len=Math.hypot(...v);v=v.map(x=>x/len);
    out.push({sun:{east:v[0],north:v[1],up:v[2]},weight:0.15});
  }
  return out;
}

function rayKernel(point,p,w) {
  const kernel=new Map();
  for(const ray of (p.fixed?[{sun:point.sun,weight:1}]:solarDisc(point.sun))) {
    const shift=shadowShift(ray.sun,p),x=shift.x*w/p.widthMM,y=shift.y*w/p.widthMM;
    const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;
    for(const [ox,oy,wt] of [[ix,iy,(1-dx)*(1-dy)],[ix+1,iy,dx*(1-dy)],[ix,iy+1,(1-dx)*dy],[ix+1,iy+1,dx*dy]]) {
      const key=ox+','+oy,old=kernel.get(key);
      if(old)old[2]+=wt*ray.weight;else kernel.set(key,[ox,oy,wt*ray.weight]);
    }
  }
  return [...kernel.values()];
}

/** The same exposure integral represented as a sparse linear transport operator. */
export function transportKernel(w,settings={}) {
  const p={...DEFAULTS,...settings},path=exposurePath(p),kernel=new Map();let energy=0;
  for(const point of path){energy+=point.energy;for(const [x,y,weight] of rayKernel(point,p,w)){
    const key=x+','+y,old=kernel.get(key),v=weight*point.energy;
    if(old)old[2]+=v;else kernel.set(key,[x,y,v]);
  }}
  return {energy,kernel:[...kernel.values()].filter(k=>k[2]>0).map(([x,y,v])=>[x,y,v/(energy||1)])};
}
export function transport(data,w,h,kernel,adjoint=false) {
  const output=new Float32Array(w*h);
  for(let [ox,oy,wt] of kernel){
    if(adjoint){ox=-ox;oy=-oy;}
    const x0=Math.max(0,-ox),x1=Math.min(w,w-ox),y0=Math.max(0,-oy),y1=Math.min(h,h-oy);
    for(let y=y0;y<y1;y++){let i=y*w+x0,src=(y+oy)*w+x0+ox;for(let x=x0;x<x1;x++,i++,src++)output[i]+=data[src]*wt;}
  }
  return output;
}

/** Deliberately target-informed reconstruction. It cannot be independent evidence.
 * Projected gradient descent in exposure space, with a small smoothness penalty.
 */
export function fitMask(target,w,h,settings={},iterations=24) {
  const p={...DEFAULTS,...settings},{energy,kernel}=transportKernel(w,p),block=(1-p.diffuse)*p.opacity;
  if(energy<=0||block<.001)throw new Error('Fitting needs daylight and nonzero paint opacity.');
  const light=reflectance(energy,p.rate),dark=reflectance(energy*(1-block),p.rate);
  // 75% of the achievable constant-field contrast leaves room for moving shadows.
  const desired=Float32Array.from(target,v=>light-(light-dark)*.75*v);
  const targetShade=Float32Array.from(desired,v=>(1+Math.log((.88-v)/.53)/(p.rate*energy))/block);
  const mask=Float32Array.from(target),rms=pred=>Math.sqrt(pred.reduce((sum,v,i)=>sum+(v-desired[i])**2,0)/pred.length);
  const render=a=>Float32Array.from(transport(a,w,h,kernel),v=>reflectance(energy*(1-block*v),p.rate));
  const before=rms(render(mask));
  for(let iter=0;iter<iterations;iter++) {
    const predicted=transport(mask,w,h,kernel),residual=Float32Array.from(predicted,(v,i)=>targetShade[i]-v);
    const step=transport(residual,w,h,kernel,true),old=mask.slice();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const i=y*w+x,mean=(old[y*w+Math.max(0,x-1)]+old[y*w+Math.min(w-1,x+1)]+old[Math.max(0,y-1)*w+x]+old[Math.min(h-1,y+1)*w+x])/4;
      mask[i]=clamp(old[i]+.85*step[i]+.015*(mean-old[i]));
    }
  }
  const predicted=render(mask);
  return {mask,target:desired,predicted,before,after:rms(predicted),iterations,energy,settings:p};
}

/** Integrate moving shadows; then apply a saturating, assumed bleaching response.
 * Equal-dose stationary control uses the moving path's SAME energy weights.
 * Outside the painted rectangle is transparent. Diffuse fill is spatially uniform.
 */
export function simulate(mask,w,h,settings={},frameCount=16) {
  if(mask.length!==w*h)throw new Error('Mask dimensions do not match its data.');
  const p={...DEFAULTS,...settings};
  const path=exposurePath(p), dose=new Float32Array(w*h), frames=[], moments=[];
  const zero=new Float32Array(w*h).fill(reflectance(0,p.rate));
  frames.push(zero);moments.push({day:0,hour:6,energy:0,sun:path[0]?.sun??{east:0,north:0,up:1}});
  let energy=0,sx=0,sy=0,s2=0,nextFrame=1;
  for(let j=0;j<path.length;j++) {
    const point=path[j];energy+=point.energy;
    const mainShift=shadowShift(point.sun,p);
    sx+=mainShift.x*point.energy;sy+=mainShift.y*point.energy;
    s2+=(mainShift.x**2+mainShift.y**2)*point.energy;
    // Merge the subpixel rays into a tiny bilinear kernel before visiting pixels.
    const kernel=rayKernel(point,p,w);
    for(let i=0;i<dose.length;i++)dose[i]+=point.energy;
    for(const [ox,oy,wt] of kernel) {
      const weight=wt*point.energy*(1-p.diffuse)*p.opacity;
      if(weight<1e-10)continue;
      const x0=Math.max(0,-ox),x1=Math.min(w,w-ox),y0=Math.max(0,-oy),y1=Math.min(h,h-oy);
      for(let y=y0;y<y1;y++) {
        let i=y*w+x0,src=(y+oy)*w+x0+ox;
        for(let x=x0;x<x1;x++,i++,src++)dose[i]-=mask[src]*weight;
      }
    }
    if((j+1)/path.length>=nextFrame/frameCount || j===path.length-1) {
      frames.push(Float32Array.from(dose,d=>reflectance(d,p.rate)));
      moments.push({...point,energy});nextFrame++;
    }
  }
  if(!path.length){frames.push(zero.slice());moments.push(moments[0]);}
  const final=frames.at(-1), sorted=Float32Array.from(final).sort();
  const spread=energy?Math.sqrt(Math.max(0,s2/energy-(sx/energy)**2-(sy/energy)**2)):0;
  return {width:w,height:h,frames,moments,settings:p,metrics:{energy,spread,
    tonalRange:sorted[Math.floor(sorted.length*.95)]-sorted[Math.floor(sorted.length*.05)]},version:MODEL_VERSION};
}

const gauss=(x,y,cx,cy,sx,sy)=>Math.exp(-0.5*(((x-cx)/sx)**2+((y-cy)/sy)**2));

/** Independent constructed brush study. No Shroud pixels enter this preset. */
export function paintedFace(w=144,h=192) {
  const a=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const u=x/(w-1),v=y/(h-1);
    let z=0;
    z+=0.84*gauss(u,v,.5,.26,.137,.089); // forehead
    z+=0.85*gauss(u,v,.5,.40,.036,.105); // bridge
    z+=0.93*gauss(u,v,.5,.51,.054,.028); // nose
    z+=0.85*gauss(u,v,.355,.48,.071,.077)+0.85*gauss(u,v,.645,.48,.071,.077);
    z+=0.49*gauss(u,v,.5,.62,.1,.034)+0.60*gauss(u,v,.5,.71,.10,.054);
    z-=0.7*gauss(u,v,.389,.398,.061,.028)+0.7*gauss(u,v,.611,.398,.061,.028);
    z-=0.45*gauss(u,v,.445,.532,.026,.019)+0.45*gauss(u,v,.555,.532,.026,.019);
    z-=0.37*gauss(u,v,.5,.6,.075,.008);
    z+=0.6*gauss(u,v,.27,.49,.027,.20)+0.6*gauss(u,v,.73,.49,.027,.20);
    z+=0.25*gauss(u,v,.34,.73,.048,.085)+0.25*gauss(u,v,.66,.73,.048,.085);
    const brush=.80+.20*Math.sin(x*.66+Math.sin(y*.063)*2)**2;
    a[y*w+x]=clamp(z*brush);
  }
  return a;
}

/** Known geometry for a control; intentionally a schematic face, not anatomy. */
export function knownFace(w=144,h=192) {
  const a=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const u=x/(w-1),v=y/(h-1),ell=((u-.5)/.30)**2+((v-.47)/.36)**2;
    let z=.40*Math.sqrt(Math.max(0,1-ell));
    z+=.34*gauss(u,v,.5,.47,.045,.095)+.12*gauss(u,v,.5,.53,.07,.026);
    z-=.10*gauss(u,v,.37,.40,.06,.038)+.10*gauss(u,v,.63,.40,.06,.038);
    z+=.055*gauss(u,v,.5,.65,.1,.026);
    a[y*w+x]=clamp(z);
  }
  return a;
}

export function litPortrait(w=144,h=192) {
  const geom=knownFace(w,h),a=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x;
    if(geom[i]<.02){a[i]=.08;continue;}
    const dx=(geom[y*w+Math.min(w-1,x+1)]-geom[y*w+Math.max(0,x-1)])*w/5;
    const dy=(geom[Math.min(h-1,y+1)*w+x]-geom[Math.max(0,y-1)*w+x])*h/5;
    const n=Math.hypot(dx,dy,1),light=clamp((-.6*dx+.2*dy+.77)/n);
    const beard=y/h>.60?.48:1;
    a[i]=(.14+.8*light)*beard;
  }
  return a;
}

/** Separable Gaussian with reflected/clamped borders, sigma in source pixels. */
export function gaussianBlur(data,w,h,sigma) {
  if(sigma<=0)return Float32Array.from(data);
  const r=Math.ceil(sigma*3),k=[];let sum=0;
  for(let i=-r;i<=r;i++){const q=Math.exp(-i*i/(2*sigma*sigma));k.push(q);sum+=q;}
  const tmp=new Float32Array(data.length),out=new Float32Array(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    let v=0;for(let d=-r;d<=r;d++)v+=data[y*w+clamp(x+d,0,w-1)]*k[d+r];tmp[y*w+x]=v/sum;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    let v=0;for(let d=-r;d<=r;d++)v+=tmp[clamp(y+d,0,h-1)*w+x]*k[d+r];out[y*w+x]=v/sum;
  }
  return out;
}

export function range(data) {let lo=Infinity,hi=-Infinity;for(const n of data){lo=Math.min(lo,n);hi=Math.max(hi,n);}return {lo,hi};}
export function normalize(data) {const {lo,hi}=range(data);return Float32Array.from(data,x=>(x-lo)/(hi-lo||1));}
export function correlation(a,b) {
  let x=0,y=0,xx=0,yy=0,xy=0,n=a.length;
  for(let i=0;i<n;i++){x+=a[i];y+=b[i];xx+=a[i]**2;yy+=b[i]**2;xy+=a[i]*b[i];}
  return (n*xy-x*y)/Math.sqrt((n*xx-x*x)*(n*yy-y*y)||1);
}
