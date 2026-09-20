import {DEFAULTS,MODEL_VERSION,paintedFace,normalize,clamp,exposurePath} from './model.js';
import {loadField,drawField,drawApparatus,bindRanges,debounce,download,downloadCanvas} from './visuals.js';
import {saveExposure} from './experiments.js';
import {beauchampPainting,BEAUCHAMP} from './paintings.js';
const $=id=>document.getElementById(id);
const keys=Object.keys(DEFAULTS).filter(k=>k!=='widthMM');
let mask=new Float32Array(113*145),w=113,h=145,widthMM=300,sourceName='Beauchamp original glass painting',sourceKind='beauchamp';
let result=null,worker=null,revision=0,loadRevision=0,history=[],erasing=false,playing=false,animation=0,view='linen',current=null,path=[];
let settingBatch=false,targetInput=null,fitReport=null,fitWorker=null;
const paint=$('paint'),cloth=$('cloth'),scene=$('apparatus');
const naturalCloth=document.createElement('canvas'),shadowStencil=document.createElement('canvas');
bindRanges();$('controls').addEventListener('submit',e=>e.preventDefault());
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
function settings(){return {...Object.fromEntries(keys.map(k=>[k,$(k).type==='checkbox'?$(k).checked:Number($(k).value)])),widthMM};}
function setSettings(p){settingBatch=true;for(const k of keys)if(k in p){if($(k).type==='checkbox')$(k).checked=!!p[k];else $(k).value=p[k];$(k).dispatchEvent(new Event('input'));}settingBatch=false;}
function updatePaint(){drawField(paint,mask,w,h,{mode:'paint'});$('mask-scale').textContent=widthMM+' mm wide';
  shadowStencil.width=w;shadowStencil.height=h;const ctx=shadowStencil.getContext('2d'),pixels=ctx.createImageData(w,h);for(let i=0;i<mask.length;i++)pixels.data[i*4+3]=Math.round(mask[i]*255);ctx.putImageData(pixels,0,0);
}
function showPaintingSelection(kind,label){
  const select=$('painting');select.querySelector('[data-local]')?.remove();
  if(label){const option=new Option(label,kind);option.disabled=true;option.dataset.local='true';select.add(option);}
  select.value=kind;$('painting-reference').hidden=kind!=='beauchamp';
}
function markCustom(){sourceKind='custom';showPaintingSelection(sourceKind,'Custom painting · local');$('share').disabled=true;$('painting-note').textContent='Your local painting, included in experiment downloads.';}
function stop(){playing=false;cancelAnimationFrame(animation);$('play').textContent='↻ Play exposure';}

function drawProgress() {
  if(!result)return;
  const t=Number($('time').value),a=Math.floor(t),b=Math.min(result.frames.length-1,a+1),blend=t-a;
  current=blend>0?Float32Array.from(result.frames[a],(v,i)=>v*(1-blend)+result.frames[b][i]*blend):result.frames[a];
  drawField(cloth,current,w,h,{mode:view,texture:view==='linen',stretch:view==='negative'});
  const fraction=t/(result.frames.length-1),point=path[Math.min(path.length-1,Math.floor(fraction*(path.length-1)))];
  const day=fraction===0?0:(point?.day??0);
  $('time-out').value='Day '+day;$('time-out').textContent='Day '+day;
  drawField(naturalCloth,current,w,h,{mode:'linen',texture:true});
  drawApparatus(scene,paint,naturalCloth,{...result.settings,sun:point?.sun??{east:0,north:0,up:1},shadow:shadowStencil});
}

function compute({keepFit=false}={}) {
  const rev=++revision;worker?.terminate();stop();
  if(!keepFit){fitReport=null;fitWorker?.terminate();fitWorker=null;$('fit-plates').hidden=true;$('fit-explanation').hidden=true;$('fit-status').textContent=targetInput?'Target ready. Find a paint mask under the current conditions.':'Start with a Shroud-derived face or full-cloth mask.';}
  $('fit-mask').disabled=!targetInput;
  $('model-status').textContent='Calculating exposure';status('Tracing the light through the current painting…');
  $('to-depth').disabled=true;$('export-png').disabled=true;$('export-data').disabled=true;
  worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  const settingsNow=settings(),maskSnapshot=mask.slice();
  worker.onmessage=({data})=>{
    if(rev!==revision)return;
    if(data.error){status(data.error,true);$('model-status').textContent='Calculation unavailable';worker.terminate();return;}
    result=data.result;worker.terminate();worker=null;path=exposurePath(result.settings);
    $('time').max=result.frames.length-1;$('time').step=.02;$('time').value=result.frames.length-1;
    $('energy').textContent=result.metrics.energy.toFixed(1);
    $('spread').textContent=result.metrics.spread.toFixed(1);
    $('contrast').textContent=(result.metrics.tonalRange*100).toFixed(1)+' pp';
    $('model-status').textContent='Exposure complete';
    $('to-depth').disabled=false;$('export-png').disabled=false;$('export-data').disabled=false;
    status(targetInput?'Reconstruction exercise: the painting is derived from the target photograph. A resemblance is partly supplied by that input.':'Exposure complete. Play the exposure, paint on the glass, or change a condition.');
    drawProgress();saveExposure(exposureRecord(result.frames.at(-1),'Completed exposure'));document.body.dataset.ready='true';
  };
  worker.onerror=()=>{if(rev===revision){status('The calculation could not start. Reload the page to try again.',true);$('model-status').textContent='Calculation unavailable';}};
  worker.postMessage({id:rev,mask:maskSnapshot.buffer,width:w,height:h,settings:settingsNow},[maskSnapshot.buffer]);
}
const schedule=debounce(compute,180);
for(const k of keys)$(k).addEventListener($(k).tagName==='SELECT'||$(k).type==='checkbox'?'change':'input',()=>{if(settingBatch)return;document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));schedule();});

async function choosePainting(kind) {
  const id=++loadRevision;
  try {
    let next,nextW=144,nextH=192,nextMM=300,note='',name='';
    if(kind==='beauchamp') {
      // Exclude the frame and writing. The photographed brightness is an opacity
      // proxy, not a measurement of the original paint's spectral transmission.
      const image=await beauchampPainting();next=image.data;nextW=image.width;nextH=image.height;
      name='Beauchamp original glass painting · photographic mask';
      note='Beauchamp’s photographed painting, cropped to the face. Brightness approximates paint opacity. Assumed width: 300 mm.';
    }else if(kind==='shroud') {
      const image=await loadField('assets/images/face-negative.jpg',144);next=normalize(image.data);nextW=image.width;nextH=image.height;
      name='Shroud-derived face mask';note='Derived from the supplied negative: highlights become paint. The target already supplies the face.';
    }else if(kind==='full') {
      const image=await loadField('assets/images/shroud-full.jpg',96);next=normalize(Float32Array.from(image.data,v=>1-v));nextW=image.width;nextH=image.height;nextMM=1100;
      name='Full-cloth photograph-derived mask';note='Target-derived mask, including burns and repairs. Assumed width: 1.1 m; proportions follow the photograph.';
    }else if(kind==='bars') {
      next=new Float32Array(nextW*nextH);for(let y=0;y<nextH;y++)for(let x=0;x<nextW;x++){
        const circle=Math.hypot(x-nextW/2,y-nextH*.68)<nextW*.20;
        next[y*nextW+x]=(y<nextH*.4&&y>nextH*.15&&x>20&&x<nextW-20&&(Math.floor(x/8)%2===0))||circle?1:0;
      }name='Line and circle control';note='An independent geometric pattern. Watch how moving shadows change edge sharpness and fine lines.';
    }else if(kind==='blank'){next=new Float32Array(nextW*nextH);name='Custom blank-glass drawing';note='The glass is clear. Draw light paint on the dark pane to shelter the linen below.';}
    else {next=paintedFace();name='Independent brush study';note='An independent brush study with no Shroud pixels. Draw on the glass to edit it.';}
    if(id!==loadRevision)return;
    mask=next;w=nextW;h=nextH;widthMM=nextMM;sourceName=name;sourceKind=kind;targetInput=kind==='shroud'||kind==='full'?next.slice():null;history=[];$('undo').disabled=true;
    showPaintingSelection(kind);$('painting-note').textContent=note;$('share').disabled=false;updatePaint();compute();
  }catch(error){status('The image could not be loaded. Your previous painting is still available.',true);}
}
$('painting').addEventListener('change',()=>choosePainting($('painting').value));
$('upload').addEventListener('change',async()=>{
  const file=$('upload').files[0];if(!file)return;
  if(file.size>10*1024*1024){status('Please choose an image smaller than 10 MB.',true);return;}
  const id=++loadRevision,url=URL.createObjectURL(file);
  try {const im=await loadField(url,144);if(id!==loadRevision)return;mask=normalize(im.data);w=im.width;h=im.height;widthMM=300;sourceName='Uploaded painting: '+file.name;targetInput=null;history=[];$('undo').disabled=true;markCustom();updatePaint();compute();}
  catch{status('That image could not be read. Try a PNG, JPEG, or WebP file.',true);}finally{URL.revokeObjectURL(url);}
});

function snapshot(){history.push(mask.slice());if(history.length>12)history.shift();$('undo').disabled=false;}
let dragging=false,last=null;
function point(e){const r=paint.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*w,y:(e.clientY-r.top)/r.height*h};}
function dab(x,y){const radius=Number($('brush').value),x0=Math.max(0,Math.floor(x-radius)),x1=Math.min(w-1,Math.ceil(x+radius)),y0=Math.max(0,Math.floor(y-radius)),y1=Math.min(h-1,Math.ceil(y+radius));
  for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){const amount=clamp(1-Math.hypot(xx-x,yy-y)/radius)*.65,i=yy*w+xx;mask[i]=erasing?mask[i]*(1-amount):mask[i]+(1-mask[i])*amount;}}
function paintTo(p){if(last){const d=Math.hypot(p.x-last.x,p.y-last.y),n=Math.max(1,Math.ceil(d/2));for(let i=1;i<=n;i++)dab(last.x+(p.x-last.x)*i/n,last.y+(p.y-last.y)*i/n);}else dab(p.x,p.y);last=p;updatePaint();}
paint.addEventListener('pointerdown',e=>{e.preventDefault();stop();worker?.terminate();revision++;$('to-depth').disabled=true;$('export-png').disabled=true;$('export-data').disabled=true;snapshot();dragging=true;last=null;paint.setPointerCapture(e.pointerId);paintTo(point(e));markCustom();});
paint.addEventListener('pointermove',e=>{if(dragging)paintTo(point(e));});
const endPaint=()=>{if(!dragging)return;dragging=false;last=null;compute();};
paint.addEventListener('pointerup',endPaint);paint.addEventListener('pointercancel',endPaint);
$('erase').addEventListener('click',()=>{erasing=!erasing;$('erase').setAttribute('aria-pressed',String(erasing));});
$('undo').addEventListener('click',()=>{if(!history.length)return;mask=history.pop();$('undo').disabled=!history.length;markCustom();updatePaint();compute();});
$('clear').addEventListener('click',()=>{snapshot();mask.fill(0);markCustom();updatePaint();compute();});

document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('output-note').textContent=view==='linen'?'Illustrative colors and weave; texture does not affect exposure.':'Negative, with tones stretched for display only.';drawProgress();}));
$('time').addEventListener('input',()=>{stop();drawProgress();});
$('play').addEventListener('click',()=>{
  if(!result)return;if(playing){stop();return;}playing=true;$('play').textContent='Ⅱ Pause exposure';const start=performance.now();
  const tick=now=>{if(!playing)return;const fraction=clamp((now-start)/18000);$('time').value=fraction*(result.frames.length-1);drawProgress();if(fraction===1){stop();return;}animation=requestAnimationFrame(tick);};animation=requestAnimationFrame(tick);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
new ResizeObserver(()=>{if(result)drawProgress();else drawApparatus(scene,paint,null);}).observe(scene);

document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
  const preset=b.dataset.preset,p={fixed:false,gap:DEFAULTS.gap,rotation:90};if(preset==='fixed')p.fixed=true;if(preset==='across')p.rotation=0;if(preset==='wide')p.gap=35;
  setSettings(p);document.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('active',x===b));compute();
}));
$('reset').addEventListener('click',()=>{setSettings(DEFAULTS);$('painting').value='beauchamp';choosePainting('beauchamp');document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset==='moving'));});
$('export-png').addEventListener('click',()=>downloadCanvas(cloth,'shroud-simulation-'+view+'.png'));
function record(){return {model:MODEL_VERSION,created:new Date().toISOString(),source:sourceName,sourceKind,
  inputProvenance:sourceKind==='beauchamp'?BEAUCHAMP:null,
  notice:'Optical simulation with an assumed bleaching response. No chemical or historical validation is implied.',
  settings:result.settings,width:w,height:h,painting:Array.from(mask),frame:Number($('time').value),reflectance:Array.from(current),metrics:result.metrics,
  targetInput:targetInput?Array.from(targetInput):null,fit:fitReport?{before:fitReport.before,after:fitReport.after,iterations:fitReport.iterations}:null};}
$('export-data').addEventListener('click',()=>{if(result)download('shroud-experiment.json',JSON.stringify(record(),null,2));});
function exposureRecord(data,stage){return {data:Array.from(data),width:w,height:h,invert:true,name:sourceName,
  note:stage+' from '+sourceName+'. The modeled reflectance is inverted in the depth viewer.',settings:result.settings};}
$('to-depth').addEventListener('click',()=>{
  if(!result||!current)return;
  if(saveExposure(exposureRecord(current,$('time-out').textContent)))location.href='depth.html?source=simulation#height-lab';
  else status('Your browser could not store the result. Download the image and upload it in the depth lab.',true);
});
$('share').addEventListener('click',async()=>{
  if(sourceKind==='custom'||sourceKind.startsWith('fitted')){status('Custom paintings are included in downloaded experiment data. A settings link cannot carry this drawing.');return;}
  const url=new URL(location.href);url.hash='';url.search='';url.searchParams.set('painting',sourceKind);for(const [k,v]of Object.entries(settings()))url.searchParams.set(k,String(v));
  try{await navigator.clipboard.writeText(url.href);status('Settings link copied. It restores this preset and all physical settings.');}catch{status('Copy this address: '+url.href);}
});

$('choose-target').addEventListener('click',async()=>{$('painting').value='shroud';await choosePainting('shroud');$('fit-status').textContent='Shroud face selected. The target is ready for fitting.';});
$('fit-mask').addEventListener('click',()=>{
  if(!targetInput)return;stop();const rev=revision;
  $('fit-mask').disabled=true;$('fit-status').textContent='Searching for a bounded paint mask · 24 steps…';
  fitWorker?.terminate();fitWorker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  fitWorker.onmessage=({data})=>{
    if(rev!==revision)return;fitWorker.terminate();fitWorker=null;$('fit-mask').disabled=false;
    if(data.error){$('fit-status').textContent=data.error;return;}
    snapshot();fitReport=data.result;mask=fitReport.mask;sourceKind='fitted-'+(w===96?'full':'shroud');sourceName='Target-fitted Shroud '+(w===96?'full-cloth':'face')+' mask';
    showPaintingSelection(sourceKind,'Fitted Shroud mask · local');$('share').disabled=true;$('painting-note').textContent='Target-fitted mask with opacity constrained to 0–1. A modern reconstruction exercise.';
    drawField($('fit-target'),fitReport.target,w,h,{mode:'linen'});drawField($('fit-result'),fitReport.predicted,w,h,{mode:'linen'});
    const difference=Float32Array.from(fitReport.predicted,(v,i)=>clamp(Math.abs(v-fitReport.target[i])/.2));drawField($('fit-residual'),difference,w,h,{mode:'heat'});
    $('fit-plates').hidden=false;$('fit-explanation').hidden=false;
    $('fit-status').textContent='Model fit complete. Reflectance RMSE: '+(fitReport.before*100).toFixed(2)+' → '+(fitReport.after*100).toFixed(2)+' percentage points. This measures fit to the chosen target tones, not historical accuracy.';
    updatePaint();compute({keepFit:true});
  };
  fitWorker.onerror=()=>{$('fit-status').textContent='The mask search could not finish. Try a smaller gap or reload the page.';$('fit-mask').disabled=false;fitWorker?.terminate();fitWorker=null;};
  fitWorker.postMessage({action:'fit',target:targetInput.slice().buffer,width:w,height:h,settings:settings()});
});

$('import-experiment').addEventListener('change',async()=>{
  const file=$('import-experiment').files[0];if(!file)return;
  try{
    if(file.size>8*1024*1024)throw new Error('Choose an experiment smaller than 8 MB.');
    const data=JSON.parse(await file.text());
    if(!Number.isInteger(data.width)||!Number.isInteger(data.height)||data.width<2||data.height<2||data.width>512||data.height>512||data.width*data.height>200000||!Array.isArray(data.painting)||data.painting.length!==data.width*data.height||!data.painting.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('This file has no valid painting array.');
    const next={...DEFAULTS};for(const k of keys){const el=$(k),v=data.settings?.[k];if(el.type==='checkbox'){if(typeof v==='boolean')next[k]=v;}else if(el.tagName==='SELECT'){if([...el.options].some(o=>o.value===String(v)))next[k]=v;}else if(Number.isFinite(v))next[k]=clamp(v,Number(el.min),Number(el.max));}
    loadRevision++;mask=Float32Array.from(data.painting);w=data.width;h=data.height;widthMM=clamp(Number(data.settings?.widthMM)||300,50,5000);sourceName='Imported: '+String(data.source||file.name).slice(0,160);sourceKind='custom';
    targetInput=Array.isArray(data.targetInput)&&data.targetInput.length===mask.length&&data.targetInput.every(v=>Number.isFinite(v)&&v>=0&&v<=1)?Float32Array.from(data.targetInput):null;
    history=[];$('undo').disabled=true;setSettings(next);markCustom();updatePaint();compute();
  }catch(error){status('Could not load the experiment: '+error.message,true);}
});

async function runOne(mask,w,h,settings){return new Promise((resolve,reject)=>{const wk=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});wk.onmessage=({data})=>{wk.terminate();data.error?reject(new Error(data.error)):resolve(data.result);};wk.onerror=()=>{wk.terminate();reject(new Error('Comparison calculation failed.'));};wk.postMessage({mask:mask.slice().buffer,width:w,height:h,settings,frames:1});});}
$('run-sweep').addEventListener('click',async()=>{
  const rev=revision,params=settings(),snapshot=mask.slice(),sw=w,sh=h;
  $('run-sweep').disabled=true;$('sweep-results').replaceChildren();
  try{
    let i=0;
    for(const fixed of [true,false])for(const gap of [0,12,35]){
      $('sweep-status').textContent='Computing comparison '+(++i)+' of 6…';
      const res=await runOne(snapshot,sw,sh,{...params,fixed,gap});
      if(rev!==revision){$('sweep-status').textContent='Settings changed. Run the comparisons again to use the new experiment.';return;}
      const card=document.createElement('button');card.type='button';card.className='sweep-card';const canvas=document.createElement('canvas');drawField(canvas,res.frames.at(-1),sw,sh,{mode:'linen',texture:true});
      const caption=document.createElement('span');caption.className='caption';caption.textContent=(fixed?'Stationary':'Moving sun')+' · '+gap+' mm gap · '+(res.metrics.tonalRange*100).toFixed(1)+' pp tonal range';card.append(canvas,caption);
      card.addEventListener('click',()=>{setSettings({fixed,gap});compute();window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});$('sweep-results').append(card);
    }
    $('sweep-status').textContent='Six comparisons complete. These retain the painting, date, and total exposure of this run.';
  }catch(e){$('sweep-status').textContent=e.message;}finally{$('run-sweep').disabled=false;}
});

// Restore only validated controls. Custom uploaded images are never put in a URL.
const query=new URLSearchParams(location.search);
settingBatch=true;
for(const key of keys){if(!query.has(key))continue;const el=$(key);if(el.type==='checkbox')el.checked=query.get(key)==='true';else if(el.tagName==='SELECT'){if([...el.options].some(o=>o.value===query.get(key)))el.value=query.get(key);}else{const v=Number(query.get(key));if(Number.isFinite(v))el.value=clamp(v,Number(el.min),Number(el.max));}el.dispatchEvent(new Event('input'));}
settingBatch=false;
const selected=query.get('painting');if([...$('painting').options].some(o=>o.value===selected))$('painting').value=selected;
updatePaint();drawApparatus(scene,paint,null);await choosePainting($('painting').value);
if(query.get('fit')==='true'&&targetInput)$('fit-mask').click();
