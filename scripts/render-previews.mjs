// Render the homepage illustrations from the actual lab models.
// Start `npm run dev`, then run `npm run previews`. No image editing or AI generation.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const base=new URL(process.argv[2]||process.env.SHROUD_SITE_URL||'http://127.0.0.1:4173/');
const profile=await mkdtemp(join(tmpdir(),'shroud-previews-'));
const executable=process.env.SHROUD_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=spawn(executable,['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+output.slice(-1000))),15000);
    browser.once('error',error=>{clearTimeout(timer);reject(error);});
    browser.once('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code));});
    browser.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  const targets=await(await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
  socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map();
  socket.addEventListener('message',({data})=>{const message=JSON.parse(data),request=pending.get(message.id);if(!request)return;clearTimeout(request.timer);pending.delete(message.id);message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timeout: '+method));},20000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:2,mobile:false});
  await send('Page.navigate',{url:new URL('index.html',base).href});
  for(let i=0;i<100;i++){if(await evaluate(`location.href===${JSON.stringify(new URL('index.html',base).href)}&&document.readyState==='complete'`))break;await new Promise(resolve=>setTimeout(resolve,100));}
  const result=await evaluate(`(async()=>{
    const {drawField,drawApparatus,loadField,Surface}=await import('./js/visuals.js');
    const {beauchampPainting}=await import('./js/paintings.js');
    const {heightFields,reconstruct,metricDisplay,RECONSTRUCTION_PROCESSING,RECONSTRUCTION_VERSION}=await import('./js/depth-model.js');
    await document.fonts.ready;
    const createCanvas=height=>{const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:600px;height:'+height+'px;';document.body.append(canvas);return canvas;};
    const cloth=new Image();cloth.src='assets/results/moving.png';
    const [painting,input]=await Promise.all([beauchampPainting(),loadField('assets/images/face-negative.jpg',180),cloth.decode()]);
    const paint=document.createElement('canvas');drawField(paint,painting.data,painting.width,painting.height,{mode:'paint'});
    const sun={east:.4,north:-.3,up:.866},sunlight=createCanvas(325),story=createCanvas(370);
    drawApparatus(sunlight,paint,cloth,{sun});drawApparatus(story,paint,cloth,{sun});
    const {adjusted}=heightFields(input.data,input.width,input.height,RECONSTRUCTION_PROCESSING);
    const reconstruction=reconstruct(adjusted,input.width,input.height);
    const display=metricDisplay(reconstruction.body,input.width,input.height,reconstruction.settings.imageWidth);
    const depth=createCanvas(325),surface=new Surface(depth,{height:display.height});
    if(!surface.gl)throw new Error('WebGL is required to generate the saved clay-surface preview.');
    surface.setData(display.data,input.width,input.height);
    const save=canvas=>{const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>150)visible++;return {width:canvas.width,height:canvas.height,visible,png:canvas.toDataURL('image/png').split(',')[1]};};
    return {images:{'home-sunlight.png':save(sunlight),'home-depth-curved.png':save(depth),'home-apparatus.png':save(story)},record:{model:RECONSTRUCTION_VERSION,source:'assets/images/face-negative.jpg',width:input.width,height:input.height,processing:RECONSTRUCTION_PROCESSING,reconstruction:reconstruction.settings,camera:{yaw:surface.yaw,pitch:surface.pitch,zoom:surface.zoom},sun,method:'Unedited canvas renders from the same modules used by the labs.'}};
  })()`);
  const output=new URL('../assets/results/',import.meta.url);await mkdir(output,{recursive:true});
  for(const [name,image] of Object.entries(result.images)){
    assert.ok(image.visible>10000,`Blank preview: ${name}`);
    await writeFile(new URL(name,output),Buffer.from(image.png,'base64'));
    console.log(`${name}: ${image.width} × ${image.height}; ${image.visible} visible pixels`);
  }
  await writeFile(new URL('home-previews.json',output),JSON.stringify(result.record,null,2)+'\n');
}finally{socket?.close();browser.kill('SIGTERM');}
