import {clamp,normalize,sample,shadowShift,DEFAULTS} from './model.js';

export async function loadField(url,maxWidth=180,crop=null) {
  const img=new Image();img.src=url;await img.decode();
  const [x,y,iw,ih]=crop??[0,0,img.naturalWidth,img.naturalHeight];
  const width=Math.max(2,Math.round(Math.min(maxWidth,iw,512*iw/ih))),height=Math.max(2,Math.round(width*ih/iw));
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,x,y,iw,ih,0,0,width,height);
  const rgba=ctx.getImageData(0,0,width,height).data,data=new Float32Array(width*height);
  for(let i=0;i<data.length;i++)data[i]=(0.2126*rgba[i*4]+0.7152*rgba[i*4+1]+0.0722*rgba[i*4+2])/255;
  return {data,width,height};
}

export function drawField(canvas,data,w,h,{mode='gray',texture=false,stretch=false}={}) {
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(w,h);
  const values=stretch?normalize(data):data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x,v=values[i];let rgb;
    if(mode==='linen') {
      const t=clamp((v-.35)/.53),weave=texture?(Math.sin(x*Math.PI*.91)*Math.cos(y*Math.PI*.92)+Math.sin((x+y)*1.5))*.8:0;
      rgb=[125+113*t+weave,99+129*t+weave,66+136*t+weave];
    } else if(mode==='negative') {
      const t=1-v;rgb=[255*t,255*t,255*t];
    } else if(mode==='paint') {const t=clamp(v);rgb=[48+192*t,55+180*t,51+167*t];}
    else if(mode==='heat') {rgb=[255*clamp(v*2),220*clamp(v*2-.4),160*clamp(v*3-1.8)];}
    else rgb=[255*v,255*v,255*v];
    for(let j=0;j<3;j++)pixels.data[i*4+j]=clamp(rgb[j],0,255);
    pixels.data[i*4+3]=255;
  }
  ctx.putImageData(pixels,0,0);
}

export function download(name,content,type='application/json') {
  const blob=content instanceof Blob?content:new Blob([content],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
export function downloadCanvas(canvas,name) {canvas.toBlob(blob=>{if(blob)download(name,blob);});}
export function debounce(fn,ms=130) {let id;return(...args)=>{clearTimeout(id);id=setTimeout(()=>fn(...args),ms);};}

export function bindRanges(root=document) {
  root.querySelectorAll('input[type="range"][data-output]').forEach(input=>{
    const out=document.getElementById(input.dataset.output);
    const update=()=>{out.value=Number(input.value).toFixed(Number(input.dataset.digits||0))+(input.dataset.unit||'');};
    input.addEventListener('input',update);update();
  });
}

/** A compact, accessible WebGL height-field viewer with an orthographic fallback. */
export class Surface {
  constructor(canvas,{height=.65,yaw=-.34,pitch=-.45,mode=0}={}) {
    this.canvas=canvas;this.height=height;this.yaw=yaw;this.pitch=pitch;this.mode=mode;this.zoom=1;
    this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
    if(this.gl)this.init();
    else {this.ctx=canvas.getContext('2d');canvas.dataset.fallback='true';}
    this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(canvas);
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;this.yaw+=(e.clientX-drag.x)*.008;this.pitch=clamp(this.pitch+(e.clientY-drag.y)*.008,-1.45,1.45);drag={x:e.clientX,y:e.clientY};this.draw();});
    canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
    canvas.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key))return;
      e.preventDefault();if(e.key==='ArrowLeft')this.yaw-=.12;if(e.key==='ArrowRight')this.yaw+=.12;
      if(e.key==='ArrowUp')this.pitch=clamp(this.pitch-.12,-1.45,1.45);if(e.key==='ArrowDown')this.pitch=clamp(this.pitch+.12,-1.45,1.45);
      if(e.key==='+'||e.key==='=')this.zoom=clamp(this.zoom+.1,.6,1.8);if(e.key==='-')this.zoom=clamp(this.zoom-.1,.6,1.8);
      if(e.key==='0')this.reset();this.draw();
    });
    canvas.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();this.zoom=clamp(this.zoom-e.deltaY*.002,.6,1.8);this.draw();},{passive:false});
  }
  init() {
    const gl=this.gl;
    const vs=`attribute vec3 aPosition;attribute vec2 aSlope;
      uniform float uHeight,uYaw,uPitch,uAspect,uZoom;varying vec3 vNormal;varying float vValue;
      vec3 turn(vec3 q){q=vec3(cos(uYaw)*q.x+sin(uYaw)*q.z,q.y,-sin(uYaw)*q.x+cos(uYaw)*q.z);return vec3(q.x,cos(uPitch)*q.y-sin(uPitch)*q.z,sin(uPitch)*q.y+cos(uPitch)*q.z);}
      void main(){vec3 q=turn(vec3(aPosition.xy,(aPosition.z-.20)*uHeight));q.z-=3.65/uZoom;
      gl_Position=vec4(q.x*2.5/uAspect,q.y*2.5,-1.0202*q.z-.20202,-q.z);
      vNormal=turn(normalize(vec3(-aSlope*uHeight,1.)));vValue=aPosition.z;}`;
    const fs=`precision mediump float;varying vec3 vNormal;varying float vValue;uniform float uMode;
      void main(){vec3 n=normalize(vNormal);float light=.33+.67*max(0.,dot(n,normalize(vec3(-.45,.7,1.))));
      vec3 color=mix(vec3(.29,.19,.115),vec3(.9,.78,.57),clamp(vValue*.85+.25,0.,1.));
      if(uMode>1.5)color=vec3(.20+.72*vValue);
      if(uMode>.5&&uMode<1.5){float line=step(.94,fract(vValue*20.));color=mix(color,vec3(.16,.105,.06),line*.7);}
      gl_FragColor=vec4(color*light,1.);}`;
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('The 3D renderer could not initialize.');
    this.vertices=gl.createBuffer();this.indices=gl.createBuffer();
    this.uniforms=Object.fromEntries(['Height','Yaw','Pitch','Aspect','Zoom','Mode'].map(n=>[n,gl.getUniformLocation(this.program,'u'+n)]));
  }
  setData(data,w,h) {
    this.data=data;this.width=w;this.heightPixels=h;
    if(!this.gl){this.draw();return;}
    const gl=this.gl,mw=Math.min(180,w),mh=Math.max(2,Math.min(300,Math.round(mw*h/w))),aspect=w/h,fit=1/Math.max(1,aspect);
    const vertices=new Float32Array(mw*mh*5),indices=new Uint16Array((mw-1)*(mh-1)*6);
    const at=(x,y)=>sample(data,w,h,clamp(x,0,mw-1)*(w-1)/(mw-1),clamp(y,0,mh-1)*(h-1)/(mh-1));
    for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
      const i=(y*mw+x)*5;
      vertices.set([(x/(mw-1)-.5)*2*aspect*fit,(.5-y/(mh-1))*2*fit,at(x,y),
        (at(x+1,y)-at(x-1,y))*(mw-1)/(4*aspect*fit),(at(x,y-1)-at(x,y+1))*(mh-1)/(4*fit)],i);
    }
    let t=0;for(let y=0;y<mh-1;y++)for(let x=0;x<mw-1;x++) {
      const a=y*mw+x;indices.set([a,a+mw,a+1,a+1,a+mw,a+mw+1],t);t+=6;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vertices);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);this.count=indices.length;this.draw();
  }
  reset(){this.yaw=-.34;this.pitch=-.45;this.zoom=1;this.draw();}
  draw() {
    const c=this.canvas,w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
    if(!this.gl){this.fallback();return;}
    const gl=this.gl;gl.viewport(0,0,c.width,c.height);gl.clearColor(.094,.098,.09,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(!this.count)return;
    gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.vertices);
    const pos=gl.getAttribLocation(this.program,'aPosition'),slope=gl.getAttribLocation(this.program,'aSlope');
    gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,20,0);
    gl.enableVertexAttribArray(slope);gl.vertexAttribPointer(slope,2,gl.FLOAT,false,20,12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);
    for(const [key,val] of Object.entries({Height:this.height,Yaw:this.yaw,Pitch:this.pitch,Aspect:w/h,Zoom:this.zoom,Mode:this.mode}))gl.uniform1f(this.uniforms[key],val);
    gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
  }
  fallback() {
    const ctx=this.ctx,c=this.canvas;ctx.fillStyle='#181914';ctx.fillRect(0,0,c.width,c.height);if(!this.data)return;
    // Projected scan lines still expose the height field without WebGL.
    ctx.strokeStyle='#c6ac80';ctx.lineWidth=1;
    for(let y=0;y<this.heightPixels;y+=4){ctx.beginPath();for(let x=0;x<this.width;x+=2){
      let px=(x/this.width-.5)*c.width*.62,py=(y/this.heightPixels-.5)*c.height*.7;
      const z=this.data[y*this.width+x]*this.height*c.height*.24;
      const rx=px*Math.cos(this.yaw)-py*Math.sin(this.yaw)*.3;
      const ry=py*Math.cos(this.pitch)-z*Math.sin(-this.pitch+.6);
      if(x===0)ctx.moveTo(c.width/2+rx,c.height*.57+ry);else ctx.lineTo(c.width/2+rx,c.height*.57+ry);
    }ctx.stroke();}
  }
}

/** An affine drawing of two parallel physical planes. Separation is exaggerated. */
export function drawApparatus(canvas,paint,cloth,{sun={east:-.3,north:-.2,up:.8},gap=12,rotation=90,shadow=null,widthMM=300,glass=3,topPaint=true}={}) {
  const dpr=Math.min(devicePixelRatio||1,2),W=canvas.clientWidth,H=canvas.clientHeight;
  canvas.width=W*dpr;canvas.height=H*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  ctx.fillStyle='#181914';ctx.fillRect(0,0,W,H);
  const s=Math.min(W/720,H/410);ctx.translate(W/2,H/2+42*s);ctx.scale(s,s);
  const plane=(x,y,z=0)=>[x*.94+y*.48,y*.38-x*.2-z];
  const corners=[[-164,-143],[164,-143],[164,143],[-164,143]];
  const strokePlane=(z,color,fill)=>{ctx.beginPath();corners.forEach(([x,y],i)=>{const p=plane(x,y,z);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();};
  // A restrained measuring grid beneath the linen.
  ctx.strokeStyle='#ffffff0a';ctx.lineWidth=.6;
  for(let i=-300;i<=300;i+=35){ctx.beginPath();ctx.moveTo(...plane(i,-260,-10));ctx.lineTo(...plane(i,260,-10));ctx.stroke();ctx.beginPath();ctx.moveTo(...plane(-300,i,-10));ctx.lineTo(...plane(300,i,-10));ctx.stroke();}
  const imageOnPlane=(img,z,alpha=1,dx=0,dy=0)=>{if(!img)return;ctx.save();const p=plane(-164+dx,-143+dy,z);ctx.transform(.94,.0-.2,.48,.38,p[0],p[1]);ctx.globalAlpha=alpha;ctx.drawImage(img,0,0,328,286);ctx.restore();};
  strokePlane(0,'#bcaa86','#bba57b');imageOnPlane(cloth,0);
  if(shadow){
    const shift=shadowShift(sun,{...DEFAULTS,gap,rotation,glass,topPaint});
    ctx.save();ctx.beginPath();corners.forEach(([x,y],i)=>{const q=plane(x,y);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.closePath();ctx.clip();
    imageOnPlane(shadow,0,.38,-shift.x*328/widthMM,-shift.y*286/(widthMM*shadow.height/shadow.width));ctx.restore();
  }
  const separation=75+Math.min(gap,60)*.65;
  for(const [x,y]of corners){ctx.strokeStyle='#c9bba036';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(...plane(x,y,0));ctx.lineTo(...plane(x,y,separation));ctx.stroke();ctx.setLineDash([]);}
  strokePlane(separation,'#acbeb673','#9cad9a0c');imageOnPlane(paint,separation,.62);strokePlane(separation,'#c4d1bb70');
  // The schematic follows the same sun direction, in cloth coordinates.
  const r=rotation*Math.PI/180,e=sun.east*Math.cos(r)+sun.north*Math.sin(r),n=sun.east*Math.sin(r)-sun.north*Math.cos(r);
  const sol=plane(e*230,n*150,150+sun.up*115);
  const light=ctx.createRadialGradient(sol[0],sol[1],1,sol[0],sol[1],50);light.addColorStop(0,'#ecc77b25');light.addColorStop(1,'#ecc77b00');ctx.fillStyle=light;ctx.fillRect(sol[0]-50,sol[1]-50,100,100);
  ctx.strokeStyle='#ddba75';ctx.lineWidth=1;ctx.beginPath();ctx.arc(...sol,11,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(sol[0]+Math.cos(a)*17,sol[1]+Math.sin(a)*17);ctx.lineTo(sol[0]+Math.cos(a)*22,sol[1]+Math.sin(a)*22);ctx.stroke();}
  for(const [x,y] of [[-100,-40],[0,0],[100,40]]){const target=plane(x,y,separation);ctx.strokeStyle='#e7c47b35';ctx.beginPath();ctx.moveTo(sol[0]+x*.16,sol[1]);ctx.lineTo(...target);ctx.stroke();}
  ctx.font='10px "IBM Plex Mono", monospace';ctx.fillStyle='#b8c5b3';const gp=plane(164,143,separation);ctx.fillText('PAINTED GLASS',gp[0]-37,gp[1]-13);
  ctx.fillStyle='#d4bf92';const cp=plane(164,143,0);ctx.fillText('LINEN',cp[0]-36,cp[1]+22);
}
