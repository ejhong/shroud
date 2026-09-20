import {CLOTH_WIDTH,sectionMetrics} from './cloth-model.js?v=cloth-1';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function drawImprint(canvas,model,{negative=false,guides=false,slice=null,scale=2}={}){
  const w=canvas.width=model.width*scale,h=canvas.height=model.height*scale,ctx=canvas.getContext('2d');
  const pixels=ctx.createImageData(w,h),base=negative?[28,31,26]:[233,221,195],ink=negative?[222,214,192]:[109,80,49];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const px=x/(w-1)*(model.width-1),py=y/(h-1)*(model.height-1),ix=Math.floor(px),iy=Math.floor(py),tx=px-ix,ty=py-iy;
    const read=a=>{
      const a0=a[iy*model.width+ix],a1=a[iy*model.width+Math.min(ix+1,model.width-1)];
      const j=Math.min(iy+1,model.height-1)*model.width;
      return (a0+(a1-a0)*tx)*(1-ty)+(a[j+ix]+(a[j+Math.min(ix+1,model.width-1)]-a[j+ix])*tx)*ty;
    };
    const signal=read(model.signal),weave=negative?0:1.4*Math.sin(x*2.3)*Math.cos(y*2.1)+.7*Math.sin(x*12.9898+y*78.233);
    let guide=0;
    if(guides){
      const sx=read(model.sourceX),sy=y/(h-1)*model.physicalHeight;
      const gx=Math.abs(sx/20-Math.round(sx/20))*20,gy=Math.abs(sy/20-Math.round(sy/20))*20;
      if(Math.abs(sx)<100&&sy>20&&sy<model.physicalHeight-15)guide=clamp(1-Math.min(gx,gy)/.85,0,1)*.48;
    }
    const i=(y*w+x)*4;
    for(let c=0;c<3;c++){const tone=base[c]+(ink[c]-base[c])*signal+weave;pixels.data[i+c]=tone*(1-guide)+[153,87,45][c]*guide;}
    pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  if(slice!==null){
    const metrics=sectionMetrics(model,slice),y=metrics.row/(model.height-1)*(h-1),left=(metrics.left/CLOTH_WIDTH+.5)*w,right=(metrics.right/CLOTH_WIDTH+.5)*w;
    ctx.strokeStyle=negative?'#d9b888':'#8a492e';ctx.lineWidth=scale*.7;
    ctx.setLineDash([3*scale,3*scale]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);
    for(const x of [left,right]){ctx.fillStyle=negative?'#dec18b':'#88482b';ctx.beginPath();ctx.arc(x,y,2.4*scale,0,Math.PI*2);ctx.fill();}
  }
  return canvas;
}

function normalize(x,y,z){const d=Math.hypot(x,y,z)||1;return [x/d,y/d,z/d];}

/** Small orthographic mesh viewer; no external renderer or remote dependencies. */
export class ClothView{
  constructor(canvas,{frameHeight=390,frameWidth=0,yaw=-.3,pitch=-.28,centerZ=110}={}){
    Object.assign(this,{canvas,frameHeight,frameWidth,yaw,pitch,centerZ,zoom:1,guides:false});
    this.initial={yaw,pitch};this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
    if(this.gl)this.init();else{this.ctx=canvas.getContext('2d');canvas.dataset.fallback='true';}
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;this.yaw+=(e.clientX-drag[0])*.008;this.pitch=clamp(this.pitch+(e.clientY-drag[1])*.008,-1.25,1.25);drag=[e.clientX,e.clientY];this.draw();});
    for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>drag=null);
    canvas.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key))return;
      e.preventDefault();if(e.key==='ArrowLeft')this.yaw-=.12;if(e.key==='ArrowRight')this.yaw+=.12;
      if(e.key==='ArrowUp')this.pitch=clamp(this.pitch-.12,-1.25,1.25);if(e.key==='ArrowDown')this.pitch=clamp(this.pitch+.12,-1.25,1.25);
      if(e.key==='+'||e.key==='=')this.zoom=clamp(this.zoom+.1,.6,1.7);if(e.key==='-')this.zoom=clamp(this.zoom-.1,.6,1.7);
      if(e.key==='0')this.reset();else this.draw();
    });
  }
  init(){
    const gl=this.gl;
    const vertex=`attribute vec3 aPosition,aNormal;attribute vec2 aUV;
      uniform vec2 uScale;uniform float uYaw,uPitch,uCenter;varying vec3 vNormal,vWorld;varying vec2 vUV;
      vec3 turn(vec3 p){p=vec3(cos(uYaw)*p.x+sin(uYaw)*p.z,p.y,-sin(uYaw)*p.x+cos(uYaw)*p.z);return vec3(p.x,cos(uPitch)*p.y-sin(uPitch)*p.z,sin(uPitch)*p.y+cos(uPitch)*p.z);}
      void main(){vec3 p=turn(aPosition-vec3(0.,0.,uCenter));gl_Position=vec4(p.xy*uScale,-p.z/1500.,1.);vNormal=turn(aNormal);vWorld=aPosition;vUV=aUV;}`;
    const fragment=`precision mediump float;varying vec3 vNormal,vWorld;varying vec2 vUV;uniform sampler2D uImage;uniform bool uCloth,uGuides;uniform float uGridTop;
      void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;float light=max(0.,dot(n,normalize(vec3(-.45,.65,1.))));
        vec3 color=uCloth?texture2D(uImage,vUV).rgb:vec3(.77,.64,.46);
        if(!uCloth&&uGuides){float y=uGridTop-vWorld.y;vec2 d=abs(mod(vec2(vWorld.x,y)+10.,20.)-10.);float line=1.-smoothstep(.25,.65,min(d.x,d.y));if(abs(vWorld.x)<100.&&y>20.&&y<2.*uGridTop-15.)color=mix(color,vec3(.43,.25,.14),line*.7);}
        float shade=uCloth?.69+.31*light:.31+.69*light;gl_FragColor=vec4(color*shade,1.);}`;
    const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
    this.buffer=gl.createBuffer();this.elements=gl.createBuffer();this.texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([230,219,195,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.uniforms=Object.fromEntries(['uScale','uYaw','uPitch','uCenter','uImage','uCloth','uGuides','uGridTop'].map(name=>[name,gl.getUniformLocation(this.program,name)]));
  }
  setTexture(canvas){
    this.cloth=true;
    if(this.gl){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);}
    else this.texturePixels={data:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
  }
  setMesh(mesh){
    this.mesh=mesh;const {positions,columns,rows,mask,uv}=mesh,n=positions.length/3,normals=new Float32Array(positions.length),indices=[];
    const triangle=(a,b,c)=>{
      if(mask&&(!mask[a]||!mask[b]||!mask[c]))return;
      indices.push(a,b,c);const ux=positions[b*3]-positions[a*3],uy=positions[b*3+1]-positions[a*3+1],uz=positions[b*3+2]-positions[a*3+2];
      const vx=positions[c*3]-positions[a*3],vy=positions[c*3+1]-positions[a*3+1],vz=positions[c*3+2]-positions[a*3+2];
      const normal=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
      for(const i of [a,b,c])for(let k=0;k<3;k++)normals[i*3+k]+=normal[k];
    };
    for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const a=y*columns+x;triangle(a,a+columns,a+1);triangle(a+1,a+columns,a+columns+1);}
    this.indices=new Uint16Array(indices);this.normals=normals;
    if(this.gl){
      const vertices=new Float32Array(n*8);for(let i=0;i<n;i++){vertices.set(positions.subarray(i*3,i*3+3),i*8);vertices.set(normalize(...normals.subarray(i*3,i*3+3)),i*8+3);vertices.set(uv?uv.subarray(i*2,i*2+2):[0,0],i*8+6);}
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.elements);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,this.indices,gl.STATIC_DRAW);
    }
    this.draw();
  }
  reset(){Object.assign(this,this.initial,{zoom:1});this.draw();}
  front(){this.yaw=0;this.pitch=0;this.draw();}
  turn(x,y,z){const c=Math.cos(this.yaw),s=Math.sin(this.yaw),xx=c*x+s*z,zz=-s*x+c*z;return [xx,Math.cos(this.pitch)*y-Math.sin(this.pitch)*zz,Math.sin(this.pitch)*y+Math.cos(this.pitch)*zz];}
  draw(){
    if(!this.mesh)return;
    const {canvas}=this,dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const aspect=w/h,extent=Math.max(this.frameHeight,this.frameWidth/aspect)/this.zoom,sx=2/(extent*aspect),sy=2/extent;
    if(!this.gl){this.drawFallback(w,h,sx,sy);return;}
    const gl=this.gl,u=this.uniforms;gl.viewport(0,0,w,h);gl.clearColor(.094,.098,.078,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);for(const [name,size,offset] of [['aPosition',3,0],['aNormal',3,12],['aUV',2,24]]){const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset);}
    gl.uniform2f(u.uScale,sx,sy);gl.uniform1f(u.uYaw,this.yaw);gl.uniform1f(u.uPitch,this.pitch);gl.uniform1f(u.uCenter,this.centerZ);gl.uniform1i(u.uCloth,this.cloth?1:0);gl.uniform1i(u.uGuides,this.guides?1:0);
    gl.uniform1f(u.uGridTop,this.mesh.positions[1]);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(u.uImage,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.elements);gl.drawElements(gl.TRIANGLES,this.indices.length,gl.UNSIGNED_SHORT,0);
  }
  drawFallback(w,h,sx,sy){
    const ctx=this.ctx,{positions,uv}=this.mesh,points=[];
    ctx.fillStyle='#181914';ctx.fillRect(0,0,w,h);
    for(let i=0;i<positions.length;i+=3){const p=this.turn(positions[i],positions[i+1],positions[i+2]-this.centerZ);points.push([w/2+p[0]*sx*w/2,h/2-p[1]*sy*h/2,p[2]]);}
    const faces=[];
    for(let i=0;i<this.indices.length;i+=3){const ids=[...this.indices.subarray(i,i+3)];faces.push({ids,z:ids.reduce((v,j)=>v+points[j][2],0)});}
    faces.sort((a,b)=>a.z-b.z);
    for(const {ids} of faces){
      const a=ids[0],n=this.turn(...normalize(...this.normals.subarray(a*3,a*3+3))),light=Math.max(0,n[0]*-.36+n[1]*.51+n[2]*.78);
      let color=[196,163,117],shade=.31+.69*light;
      if(this.guides&&!this.cloth){
        const x=positions[a*3],top=positions[1],y=top-positions[a*3+1];
        if(Math.abs(x)<100&&y>20&&y<2*top-15&&Math.min(Math.abs(x/20-Math.round(x/20))*20,Math.abs(y/20-Math.round(y/20))*20)<.65)color=[146,110,70];
      }
      if(this.texturePixels){const t=this.texturePixels,x=clamp(Math.round(uv[a*2]*(t.width-1)),0,t.width-1),y=clamp(Math.round(uv[a*2+1]*(t.height-1)),0,t.height-1);color=[...t.data.subarray((y*t.width+x)*4,(y*t.width+x)*4+3)];shade=.69+.31*light;}
      ctx.fillStyle=`rgb(${color.map(v=>Math.round(v*shade)).join(',')})`;ctx.beginPath();ids.forEach((j,i)=>{const p=points[j];i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.closePath();ctx.fill();
    }
  }
}

export function drawSection(canvas,model,slice){
  const dpr=Math.min(devicePixelRatio||1,2),w=canvas.width=Math.round(canvas.clientWidth*dpr),h=canvas.height=Math.round(canvas.clientHeight*dpr),ctx=canvas.getContext('2d');
  if(!w||!h)return;
  ctx.scale(dpr,dpr);const W=w/dpr,H=h/dpr,metrics=sectionMetrics(model,slice),strip=model.strips[metrics.row],row=model.body.subarray(metrics.row*model.sourceWidth,(metrics.row+1)*model.sourceWidth);
  const scale=Math.min((W-48)/280,(H-45)/270),X=x=>W/2+x*scale,Y=z=>H-24-z*scale;
  ctx.strokeStyle='#d7d1c1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(20,Y(0));ctx.lineTo(W-20,Y(0));ctx.stroke();
  ctx.beginPath();row.forEach((z,i)=>{const x=(i/(row.length-1)-.5)*model.physicalWidth;i?ctx.lineTo(X(x),Y(z)):ctx.moveTo(X(x),Y(z));});
  ctx.lineTo(X(model.physicalWidth/2),Y(0));ctx.lineTo(X(-model.physicalWidth/2),Y(0));ctx.closePath();ctx.fillStyle='#d5bd99';ctx.fill();
  ctx.beginPath();for(let i=1;i<strip.x.length-1;i++){const x=X(strip.x[i]),y=Y(strip.z[i]);i===1?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.strokeStyle='#6b7559';ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle='#995d3d';ctx.setLineDash([3,4]);
  for(const x of [-60,60]){ctx.beginPath();ctx.moveTo(X(x),Y(0)+5);ctx.lineTo(X(x),12);ctx.stroke();}
  ctx.setLineDash([]);ctx.font='9px "IBM Plex Mono", monospace';ctx.fillStyle='#666657';ctx.textAlign='center';ctx.fillText('120 mm projected guide span',W/2,H-5);
}
