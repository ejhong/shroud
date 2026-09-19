import {knownFace,litPortrait,paintedFace,correlation,MODEL_VERSION,DEFAULTS} from './model.js';
import {loadField,drawField,Surface,bindRanges,download,downloadCanvas} from './visuals.js';
import {loadExposure} from './experiments.js';
import {beauchampPainting} from './paintings.js';
import {heightFields,crossSection} from './depth-model.js';
const $=id=>document.getElementById(id);bindRanges();$('depth-controls').addEventListener('submit',e=>e.preventDefault());
const surface=new Surface($('surface')),baselineSurface=new Surface($('baseline-surface'));
for(const [a,b] of [[surface,baselineSurface],[baselineSurface,surface]])a.onViewChange=view=>{Object.assign(b,view);b.draw();};
let source=null,processed=null,baseline=null,reference=null,name='',serial=0,loadedKind='shroud';
function refreshSimulationOption(){const stored=loadExposure();$('source').querySelector('[value="simulation"]').textContent=stored?'Latest sunlight experiment':'Sunlight experiment · example';return stored;}
let examplePromise;
function exampleExposure(){
  if(!examplePromise)examplePromise=beauchampPainting().then(({data:mask,width,height})=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{worker.terminate();if(data.error){reject(new Error(data.error));return;}
      resolve({width,height,data:data.result.frames.at(-1),invert:true,name:'Example sunlight exposure · Beauchamp glass painting',
        note:'A built-in example: Beauchamp’s glass painting after 10 modeled days, with a 3 mm air gap. Run the sunlight lab to replace it with your own latest exposure. The modeled reflectance is inverted here.'});};
    worker.onerror=()=>{worker.terminate();reject(new Error('Example exposure could not be calculated.'));};
    worker.postMessage({mask:mask.buffer,width,height,settings:DEFAULTS,frames:1});
  })).catch(error=>{examplePromise=null;throw error;});
  return examplePromise;
}
refreshSimulationOption();window.addEventListener('storage',refreshSimulationOption);
const notes={shroud:'An uncalibrated photographic negative supplied with the original Python experiment. Analysis uses a 180-pixel-wide resampling.',enrie:'The Enrie negative reproduction used on the home page, via Wikimedia Commons. This analysis uses the file’s original tones without the home page’s CSS contrast. It is not the input file used by Downing or the 1997 VP-8 demonstration.',archive:'A second supplied archival negative. A fixed crop excludes the mount and handwritten caption; tones are not calibrated.',known:'A schematic face with known geometry. Pixel values are the actual heights used to construct it.',portrait:'The same schematic geometry with side illumination and darker beard reflectance. This is a rendered control, not a photograph of a person.',painted:'The independently constructed brush study from the sunlight lab. It contains no Shroud pixels and has no known underlying face geometry.'};
function settings(){return {smoothing:Number($('smooth').value),inverted:$('invert').checked,stretched:$('stretch').checked,gamma:Number($('gamma').value)};}
function profile(){
  if(!source||!processed)return;
  drawField($('depth-source'),source.data,source.width,source.height);
  const axis=$('slice-axis').value,position=Number($('slice').value),vertical=axis==='vertical';
  const raw=crossSection(baseline,source.width,source.height,axis,position),adjusted=crossSection(processed,source.width,source.height,axis,position);
  const sc=$('depth-source').getContext('2d');sc.strokeStyle='#c69055';sc.lineWidth=1.5;sc.beginPath();
  if(vertical){sc.moveTo(raw.index,0);sc.lineTo(raw.index,source.height);}else{sc.moveTo(0,raw.index);sc.lineTo(source.width,raw.index);}sc.stroke();
  const c=$('profile'),dpr=Math.min(devicePixelRatio||1,2),W=c.clientWidth,H=c.clientHeight;c.width=W*dpr;c.height=H*dpr;
  const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.strokeStyle='#d1c8b5';ctx.lineWidth=1;
  for(const val of [0,.5,1]){const y=H-15-val*(H-30);ctx.beginPath();ctx.moveTo(24,y);ctx.lineTo(W-5,y);ctx.stroke();ctx.fillStyle='#827b69';ctx.font='8px monospace';ctx.fillText(val.toFixed(1),0,y+3);}
  for(const [values,color,dash] of [[raw.values,'#62756b',[4,3]],[adjusted.values,'#995d3d',[]]]){
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash(dash);ctx.beginPath();
    for(let x=0;x<values.length;x++){const y=H-15-values[x]*(H-30),xx=24+x/(values.length-1)*(W-29);x?ctx.lineTo(xx,y):ctx.moveTo(xx,y);}ctx.stroke();
  }
  $('profile-caption').textContent=(vertical?'Column ':'Row ')+(raw.index+1)+' of '+raw.count+'. Read '+(vertical?'forehead → chin':'left → right')+'. Relative height before relief scaling; neither axis is calibrated in millimetres.';
}
function update(){
  if(!source)return;
  const p=settings(),fields=heightFields(source.data,source.width,source.height,p);baseline=fields.baseline;processed=fields.adjusted;
  for(const [view,data] of [[surface,processed],[baselineSurface,baseline]]){view.height=Number($('height').value);view.mode=Number($('material').value);view.setData(data,source.width,source.height);}profile();
  $('processing-note').textContent='Both: '+source.width+' × '+source.height+' samples, '+(p.inverted?'inverted':'original')+' polarity, same camera and relief scale. Right only: smoothing '+p.smoothing.toFixed(2)+' px · stretch '+(p.stretched?'on':'off')+' · exponent '+p.gamma.toFixed(2)+'.';
  $('agreement').textContent=reference?'Agreement with known heights: Pearson r = '+correlation(processed,reference).toFixed(3)+'. This measures relative shape, not a calibrated depth scale.':'Reference geometry: unavailable for this image. No anatomical accuracy score is implied.';
  $('depth-status').textContent=source.width+' × '+source.height+' samples';document.body.dataset.ready='true';
}
for(const id of ['height','smooth','gamma','invert','stretch','material','slice','slice-axis'])$(id).addEventListener($(id).type==='range'?'input':'change',id==='slice'||id==='slice-axis'?profile:update);
async function choose(kind){
  const id=++serial;$('status').textContent='Loading the source image…';
  try {
    let next,ref=null,note=notes[kind]||'',inv=false,label='';
    if(kind==='shroud'){next=await loadField('assets/images/face-negative.jpg',180);label='Shroud face · supplied negative';}
    else if(kind==='enrie'){next=await loadField('assets/images/shroud-face-enrie.jpg',180);label='Shroud face · Enrie reproduction';}
    else if(kind==='archive'){next=await loadField('assets/images/face-archive.jpg',180,[45,20,1190,1400]);label='Alternative archival negative';}
    else if(kind==='simulation'){
      const stored=refreshSimulationOption(),s=stored||await exampleExposure();
      next={data:Float32Array.from(s.data),width:s.width,height:s.height};inv=s.invert;note=s.note;label=stored?'Sunlight result · '+s.name:s.name;
    }else{const width=180,height=240;next={width,height,data:kind==='known'?knownFace(width,height):kind==='portrait'?litPortrait(width,height):paintedFace(width,height)};ref=kind==='known'||kind==='portrait'?knownFace(width,height):null;label=kind==='known'?'Synthetic face · known depth':kind==='portrait'?'Synthetic face · side lighting':'Independent brush study';}
    if(id!==serial)return;source=next;reference=ref;name=label;loadedKind=kind;$('source').querySelector('[data-local]')?.remove();$('source').value=kind;$('source-note').textContent=note;$('surface-label').textContent=label.toUpperCase();$('invert').checked=inv;update();$('status').textContent=$('surface').dataset.fallback?'WebGL is unavailable. A projected line-surface view is displayed instead.':'Source loaded. Drag the surface, or use its arrow-key controls.';
  }catch(error){if(id!==serial)return;$('source').value=loadedKind;$('status').textContent='The source could not be read. Please try another image.';}
}
$('source').addEventListener('change',()=>choose($('source').value));
$('depth-upload').addEventListener('change',async()=>{
  const file=$('depth-upload').files[0];if(!file)return;if(file.size>10*1024*1024){$('status').textContent='Please choose an image smaller than 10 MB.';return;}
  const id=++serial,url=URL.createObjectURL(file);
  try{const next=await loadField(url,180);if(id!==serial)return;source=next;reference=null;name='Uploaded: '+file.name;loadedKind='upload';$('source').querySelector('[data-local]')?.remove();const option=new Option('Uploaded photograph · local',loadedKind);option.disabled=true;option.dataset.local='true';$('source').add(option);$('source').value=loadedKind;$('invert').checked=false;$('source-note').textContent='Your photograph is processed locally. Brightness includes lighting and surface reflectance.';$('surface-label').textContent=name;update();$('status').textContent='Uploaded image loaded.';}
  catch{$('status').textContent='That image could not be read. Try a PNG, JPEG, or WebP file.';}finally{URL.revokeObjectURL(url);}
});
document.querySelectorAll('[data-depth-preset]').forEach(b=>b.addEventListener('click',async()=>{
  const p=b.dataset.depthPreset;document.querySelectorAll('[data-depth-preset]').forEach(x=>x.classList.toggle('active',x===b));
  $('smooth').value=p==='soft'?1.25:0;$('gamma').value=1;$('height').value=.7;$('stretch').checked=p==='soft';
  for(const id of ['smooth','gamma','height'])$(id).dispatchEvent(new Event('input'));
  const kind=p==='known'?'known':p==='portrait'?'portrait':'shroud';$('source').value=kind;await choose(kind);
}));
$('front').addEventListener('click',()=>{surface.yaw=0;surface.pitch=0;surface.viewChanged();});
$('side').addEventListener('click',()=>{surface.yaw=-Math.PI/2;surface.pitch=0;surface.viewChanged();});
$('orbit-reset').addEventListener('click',()=>surface.reset());
$('depth-export').addEventListener('click',()=>{surface.draw();downloadCanvas($('surface'),'shroud-height-view.png');});
$('depth-data').addEventListener('click',()=>{
  if(!source)return;download('shroud-height-field.json',JSON.stringify({model:MODEL_VERSION,source:name,width:source.width,height:source.height,
    ...settings(),heightScale:Number($('height').value),processingOrder:['resample and encoded RGB grayscale','optional inversion (both surfaces)','Gaussian smoothing (adjusted only)','optional range stretch (adjusted only)','tonal exponent (adjusted only)'],
    crossSection:{axis:$('slice-axis').value,positionPercent:Number($('slice').value)},
    baselineDefinition:'Resampled grayscale with shared polarity; no additional smoothing, range stretch, or tonal exponent.',
    units:'Arbitrary relative height. Not calibrated to anatomy.',original:Array.from(source.data),baseline:Array.from(baseline),heights:Array.from(processed)},null,2));
});
new ResizeObserver(profile).observe($('profile'));
const requestedSource=new URLSearchParams(location.search).get('source');
if([...$('source').options].some(option=>option.value===requestedSource))$('source').value=requestedSource;
await choose($('source').value);
