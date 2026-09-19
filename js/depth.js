import {gaussianBlur,normalize,knownFace,litPortrait,paintedFace,correlation,clamp,MODEL_VERSION,DEFAULTS} from './model.js';
import {loadField,drawField,Surface,bindRanges,download,downloadCanvas} from './visuals.js';
import {loadExposure} from './experiments.js';
import {beauchampPainting} from './paintings.js';
const $=id=>document.getElementById(id);bindRanges();$('depth-controls').addEventListener('submit',e=>e.preventDefault());
const surface=new Surface($('surface'));let source=null,processed=null,reference=null,name='',serial=0,loadedKind='shroud';
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
const notes={shroud:'An uncalibrated photographic negative supplied with the original Python experiment. Analysis uses a 180-pixel-wide resampling.',archive:'A second supplied archival negative. A fixed crop excludes the mount and handwritten caption; tones are not calibrated.',known:'A schematic face with known geometry. Pixel values are the actual heights used to construct it.',portrait:'The same schematic geometry with side illumination and darker beard reflectance. This is a rendered control, not a photograph of a person.',painted:'The independently constructed brush study from the sunlight lab. It contains no Shroud pixels and has no known underlying face geometry.'};
function profile(){
  if(!source||!processed)return;
  drawField($('depth-source'),source.data,source.width,source.height);
  const row=Math.round(Number($('slice').value)/100*(source.height-1));
  const sc=$('depth-source').getContext('2d');sc.strokeStyle='#c69055';sc.lineWidth=1.5;sc.beginPath();sc.moveTo(0,row);sc.lineTo(source.width,row);sc.stroke();
  const c=$('profile'),dpr=Math.min(devicePixelRatio||1,2),W=c.clientWidth,H=c.clientHeight;c.width=W*dpr;c.height=H*dpr;
  const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.strokeStyle='#d1c8b5';ctx.lineWidth=1;
  for(const val of [0,.5,1]){const y=H-15-val*(H-30);ctx.beginPath();ctx.moveTo(24,y);ctx.lineTo(W-5,y);ctx.stroke();ctx.fillStyle='#827b69';ctx.font='8px monospace';ctx.fillText(val.toFixed(1),0,y+3);}
  ctx.strokeStyle='#995d3d';ctx.lineWidth=1.5;ctx.beginPath();
  for(let x=0;x<source.width;x++){const y=H-15-processed[row*source.width+x]*(H-30),xx=24+x/(source.width-1)*(W-29);x?ctx.lineTo(xx,y):ctx.moveTo(xx,y);}ctx.stroke();
  $('profile-caption').textContent='Row '+(row+1)+' of '+source.height+'. Height before relief scaling. Horizontal proportions follow the source image.';
}
function update(){
  if(!source)return;
  let data=gaussianBlur(source.data,source.width,source.height,Number($('smooth').value));
  if($('invert').checked)data=Float32Array.from(data,v=>1-v);
  if($('stretch').checked)data=normalize(data);
  processed=Float32Array.from(data,v=>clamp(v)**Number($('gamma').value));
  surface.height=Number($('height').value);surface.mode=Number($('material').value);surface.setData(processed,source.width,source.height);profile();
  $('agreement').textContent=reference?'Agreement with known heights: Pearson r = '+correlation(processed,reference).toFixed(3)+'. This measures relative shape, not a calibrated depth scale.':'Reference geometry: unavailable for this image. No anatomical accuracy score is implied.';
  $('depth-status').textContent=source.width+' × '+source.height+' samples';document.body.dataset.ready='true';
}
for(const id of ['height','smooth','gamma','invert','stretch','material','slice'])$(id).addEventListener($(id).type==='range'?'input':'change',id==='slice'?profile:update);
async function choose(kind){
  const id=++serial;$('status').textContent='Loading the source image…';
  try {
    let next,ref=null,note=notes[kind]||'',inv=false,label='';
    if(kind==='shroud'){next=await loadField('assets/images/face-negative.jpg',180);label='Shroud face · supplied negative';}
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
  $('smooth').value=p==='soft'?1.25:0;$('gamma').value=1;$('height').value=.7;$('stretch').checked=true;
  for(const id of ['smooth','gamma','height'])$(id).dispatchEvent(new Event('input'));
  const kind=p==='known'?'known':p==='portrait'?'portrait':'shroud';$('source').value=kind;await choose(kind);
}));
$('front').addEventListener('click',()=>{surface.yaw=0;surface.pitch=0;surface.draw();});
$('side').addEventListener('click',()=>{surface.yaw=-1.12;surface.pitch=-.1;surface.draw();});
$('orbit-reset').addEventListener('click',()=>surface.reset());
$('depth-export').addEventListener('click',()=>{surface.draw();downloadCanvas($('surface'),'shroud-height-view.png');});
$('depth-data').addEventListener('click',()=>{
  if(!source)return;download('shroud-height-field.json',JSON.stringify({model:MODEL_VERSION,source:name,width:source.width,height:source.height,
    smoothing:Number($('smooth').value),gamma:Number($('gamma').value),inverted:$('invert').checked,stretched:$('stretch').checked,heightScale:Number($('height').value),
    units:'Arbitrary relative height. Not calibrated to anatomy.',original:Array.from(source.data),heights:Array.from(processed)},null,2));
});
new ResizeObserver(profile).observe($('profile'));
if(new URLSearchParams(location.search).get('source')==='simulation')$('source').value='simulation';
await choose($('source').value);
