import {knownFace,litPortrait,paintedFace,correlation,MODEL_VERSION,DEFAULTS} from './model.js';
import {loadField,drawField,Surface,bindRanges,download,downloadCanvas} from './visuals.js';
import {loadExposure} from './experiments.js';
import {beauchampPainting} from './paintings.js';
import {heightFields,crossSection,reconstruct,distanceControl,geometryError,metricDisplay,RECONSTRUCTION_DEFAULTS,RECONSTRUCTION_PROCESSING,RECONSTRUCTION_VERSION,CLOTH_DATUM} from './depth-model.js';
const $=id=>document.getElementById(id);bindRanges();$('depth-controls').addEventListener('submit',e=>e.preventDefault());
const surface=new Surface($('surface')),baselineSurface=new Surface($('baseline-surface'));
for(const [a,b] of [[surface,baselineSurface],[baselineSurface,surface]])a.onViewChange=view=>{Object.assign(b,view);b.draw();};
let source=null,processed=null,baseline=null,reference=null,name='',serial=0,loadedKind='shroud';
let mode='brightness',reconstruction=null,control=null;
const processingByMode={reconstruction:RECONSTRUCTION_PROCESSING};
function refreshSimulationOption(){const stored=loadExposure();$('source').querySelector('[value="simulation"]').textContent=stored?'Latest sunlight experiment':'Sunlight experiment · example';return stored;}
let examplePromise;
function exampleExposure(){
  if(!examplePromise)examplePromise=beauchampPainting().then(({data:mask,width,height})=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{worker.terminate();if(data.error){reject(new Error(data.error));return;}
      resolve({width,height,data:data.result.frames.at(-1),invert:true,name:'Example sunlight exposure · Beauchamp glass painting',
        note:'Beauchamp example: 10 modeled days, 3 mm gap, inverted reflectance. Run the sunlight lab to replace it.'});};
    worker.onerror=()=>{worker.terminate();reject(new Error('Example exposure could not be calculated.'));};
    worker.postMessage({mask:mask.buffer,width,height,settings:DEFAULTS,frames:1});
  })).catch(error=>{examplePromise=null;throw error;});
  return examplePromise;
}
refreshSimulationOption();window.addEventListener('storage',refreshSimulationOption);
const notes={shroud:'Supplied photographic negative; tones are uncalibrated. Resampled to 180 pixels wide.',enrie:'Enrie reproduction via Wikimedia Commons, without the home display’s contrast adjustment. It is not the original reconstruction-study input.',archive:'Supplied archival negative, cropped to remove its mount and caption. Uncalibrated tones.',known:'A schematic face with known geometry. Pixel values are the actual heights used to construct it.',portrait:'The known geometry with side lighting and a darker beard. A synthetic control.',painted:'Independent brush study with no Shroud pixels or known reference geometry.'};
function settings(){return {smoothing:Number($('smooth').value),inverted:$('invert').checked,stretched:$('stretch').checked,gamma:Number($('gamma').value)};}
function reconstructionSettings(){
  return {cloth:$('cloth-shape').value,range:Number($('distance-range').value),law:$('distance-law').value,
    sideDrop:Number($('cloth-side').value),lengthDrop:Number($('cloth-length').value),
    headDepth:Number($('head-depth').value),broadScale:Number($('broad-scale').value),imageWidth:Number($('image-width').value)};
}
function setValue(id,value){
  const input=$(id);input.value=value;
  if(input.dataset.output)$(input.dataset.output).value=Number(value).toFixed(Number(input.dataset.digits||0))+(input.dataset.unit||'');
}
function applyProcessing(p){
  setValue('smooth',p.smoothing);setValue('gamma',p.gamma);$('stretch').checked=p.stretched;$('invert').checked=p.inverted;
}
function applyReconstruction(p){
  for(const [key,id] of Object.entries({cloth:'cloth-shape',range:'distance-range',law:'distance-law',sideDrop:'cloth-side',lengthDrop:'cloth-length',headDepth:'head-depth',broadScale:'broad-scale',imageWidth:'image-width'}))setValue(id,p[key]);
}
function setMode(next){
  if(next!==mode){
    processingByMode[mode]=settings();
    // Polarity follows the current source even when switching modes.
    const inverted=$('invert').checked;
    mode=next;applyProcessing({...processingByMode[mode],inverted});
  }
  const distance=mode==='reconstruction';document.body.dataset.depthMode=mode;
  for(const id of ['reconstruction-presets','cloth-controls','comparison-field','image-width-field','reconstruction-equation','reconstruction-finding'])$(id).hidden=!distance;
  for(const id of ['brightness-presets','height-field'])$(id).hidden=distance;
  document.querySelectorAll('[data-depth-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.depthMode===mode)));
  $('processing-number').textContent=distance?'03':'02';$('display-number').textContent=distance?'04':'03';
  $('mode-explanation').textContent=distance?'Assume brighter negative tones mean a smaller gap to the cloth. Subtract the gap from a chosen cloth surface to estimate the face.':'See exactly what the photograph’s tones become when treated as heights.';
  $('scale-note').textContent=distance?'One scale for x, y, and z. All millimetres are model assumptions, not measurements of the Shroud.':'Proportions preserved. Height is relative, not millimetres.';
  $('depth-limit').innerHTML=distance?'<strong>A candidate surface, not a recovered identity.</strong> This model assumes vertical gaps and unchanged image coordinates. It does not simulate cloth mechanics, unwrap lateral distortion, or add skin and anatomy. <a href="methods.html#cloth-distance">Method &amp; limits ↗</a>':'<strong>Brightness is not a depth measurement.</strong> An awkward relief does not refute a full reconstruction; a convincing one does not establish anatomy or identity. <a href="methods.html#depth">Method &amp; limits ↗</a>';
  update();
}
function profile(){
  if(!source||!processed)return;
  drawField($('depth-source'),source.data,source.width,source.height);
  const axis=$('slice-axis').value,position=Number($('slice').value),vertical=axis==='vertical';
  const section=data=>crossSection(data,source.width,source.height,axis,position);
  const raw=section(baseline),adjusted=section(processed),distance=mode==='reconstruction';
  const lines=[[raw.values,'#62756b',[4,3]],[adjusted.values,'#995d3d',[]]];
  const showCloth=distance&&$('comparison').value!=='cloth';$('cloth-legend').hidden=!showCloth;
  if(showCloth)lines.push([section(reconstruction.cloth).values,'#a89268',[2,3]]);
  const sc=$('depth-source').getContext('2d');sc.strokeStyle='#c69055';sc.lineWidth=1.5;sc.beginPath();
  if(vertical){sc.moveTo(raw.index,0);sc.lineTo(raw.index,source.height);}else{sc.moveTo(0,raw.index);sc.lineTo(source.width,raw.index);}sc.stroke();
  const c=$('profile'),dpr=Math.min(devicePixelRatio||1,2),W=c.clientWidth,H=c.clientHeight;
  if(!W||!H)return;c.width=W*dpr;c.height=H*dpr;
  const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.strokeStyle='#c9c2af';ctx.lineWidth=.5;
  let lo=0,hi=1;
  if(distance){lo=Infinity;hi=-Infinity;for(const [values] of lines)for(const v of values){lo=Math.min(lo,v);hi=Math.max(hi,v);}lo=Math.floor(lo/10)*10;hi=Math.max(lo+10,Math.ceil(hi/10)*10);}
  const py=value=>H-15-(value-lo)/(hi-lo)*(H-30);
  for(const val of [lo,(lo+hi)/2,hi]){const y=py(val);ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(W-5,y);ctx.stroke();ctx.fillStyle='#827b69';ctx.font='8px monospace';ctx.fillText(val.toFixed(distance?0:1),0,y+3);}
  for(const [values,color,dash] of lines){
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash(dash);ctx.beginPath();
    for(let x=0;x<values.length;x++){const y=py(values[x]),xx=30+x/(values.length-1)*(W-35);x?ctx.lineTo(xx,y):ctx.moveTo(xx,y);}ctx.stroke();
  }
  $('profile-caption').textContent=(vertical?'Column ':'Row ')+(raw.index+1)+' of '+raw.count+'. Read '+(vertical?'forehead → chin':'left → right')+'. '+(distance?'Assumed mm; cloth-to-body separation is the modeled gap.':'Relative units, before relief scaling.');
  c.setAttribute('aria-label',distance?'Cross-section of the comparison, candidate body, and assumed cloth in model millimetres.':'Graph comparing unfiltered and adjusted heights along the selected cross-section.');
}
function update(){
  if(!source)return;
  const p=settings(),fields=heightFields(source.data,source.width,source.height,p),distance=mode==='reconstruction';
  const {width,height}=source;
  if(distance){
    reconstruction=reconstruct(fields.adjusted,width,height,reconstructionSettings());
    const r=reconstruction.settings;
    $('arched-controls').hidden=r.cloth!=='arched';$('reference-controls').hidden=r.cloth!=='reference';
    $('comparison').querySelector('[value="prior"]').disabled=!reconstruction.prior;
    $('comparison').querySelector('[value="truth"]').disabled=!control;
    if(($('comparison').value==='prior'&&!reconstruction.prior)||($('comparison').value==='truth'&&!control))$('comparison').value='flat';
    const comparisons={flat:[reconstruction.flatBody,'Flat-cloth candidate','Same processed image'],cloth:[reconstruction.cloth,'Assumed cloth','Added geometry'],prior:[reconstruction.prior,'Supplied broad shape','No image features'],truth:[control?.body,'Known geometry','Synthetic ground truth']};
    const [field,title,subtitle]=comparisons[$('comparison').value];baseline=field;processed=reconstruction.body;
    $('baseline-title').textContent='01 / '+title;$('baseline-subtitle').textContent=subtitle;
    $('adjusted-title').textContent='02 / Candidate body';$('adjusted-subtitle').textContent=r.cloth==='reference'?'Reference + image detail':r.cloth==='flat'?'Below flat cloth':'Below curved cloth';
    $('baseline-legend').textContent=title;$('adjusted-legend').textContent='Candidate body';
    for(const [view,data] of [[surface,processed],[baselineSurface,baseline]]){
      const display=metricDisplay(data,width,height,r.imageWidth);view.height=display.height;view.mode=Number($('material').value);view.setData(display.data,width,height);
    }
    $('processing-note').textContent=r.cloth==='reference'?'Broad shape supplied; finer variations come from the processed image. Both panels use the same physical scale.':'Both panels use the same physical scale. The cross-section shows the assumed cloth above the candidate body.';
    $('cloth-note').textContent=r.cloth==='reference'?'The head shape is supplied. Cloth is derived from that shape and the smoothed gap map; it is not independent evidence.':'Cloth shape and distance scale are supplied assumptions. Neither is measured from this image.';
    if(control){
      const error=geometryError(processed,control.body);
      $('agreement').textContent='Height error against known geometry: RMSE '+error.rmse.toFixed(3)+' mm · maximum '+error.max.toFixed(3)+' mm.';
      $('agreement').dataset.rmse=String(error.rmse);$('finding-label').textContent='A test with a known answer';
      $('finding-text').textContent='The source was generated from a fixed face beneath a known cloth. Change the drape, gap range, or tonal processing: the error measures how far the recovered surface moves from that face. This checks the algorithm within its own model.';
    }else{
      $('agreement').textContent='No matching reference geometry for this input. Appearance alone cannot be scored.';delete $('agreement').dataset.rmse;
      $('finding-label').textContent=r.cloth==='reference'?'What the reference contributes':'One image, more than one body';
      $('finding-text').textContent=r.cloth==='reference'?'The head outline comes from a featureless oval cap. Finer image variations are added to it after broad shape is filtered out. A more familiar face can therefore depend on geometry supplied by the model.':'Different cloth shapes yield different bodies from exactly the same gap map. The image alone cannot choose between them; that needs independent information about the drape or anatomy.';
    }
    $('surface').setAttribute('aria-label','Candidate body beneath the assumed cloth. Drag or use arrow keys to rotate both views.');
    $('baseline-surface').setAttribute('aria-label',title+'. Drag or use arrow keys to rotate both views.');
  }else{
    reconstruction=null;baseline=fields.baseline;processed=fields.adjusted;
    for(const [view,data] of [[surface,processed],[baselineSurface,baseline]]){view.height=Number($('height').value);view.mode=Number($('material').value);view.setData(data,width,height);}
    $('baseline-title').textContent='01 / Unfiltered brightness';$('baseline-subtitle').textContent='Shared polarity only';
    $('adjusted-title').textContent='02 / Adjusted brightness';$('adjusted-subtitle').textContent='Your adjustments';
    $('baseline-legend').textContent='Unfiltered';$('adjusted-legend').textContent='Adjusted';
    $('processing-note').textContent='Both views: '+width+' × '+height+' samples, '+(p.inverted?'inverted':'original')+' polarity. Right: smoothing '+p.smoothing.toFixed(2)+' px · stretch '+(p.stretched?'on':'off')+' · exponent '+p.gamma.toFixed(2)+'.';
    $('agreement').textContent=reference?'Agreement with known heights: Pearson r = '+correlation(processed,reference).toFixed(3)+'. Relative shape only.':'No reference geometry; anatomical accuracy cannot be scored.';delete $('agreement').dataset.rmse;
    $('surface').setAttribute('aria-label','Adjusted brightness as a 3D height map. Drag or use arrow keys to rotate both views.');
    $('baseline-surface').setAttribute('aria-label','Unfiltered brightness as a 3D height map. Drag or use arrow keys to rotate both views.');
  }
  profile();$('depth-status').textContent=width+' × '+height+' samples';document.body.dataset.ready='true';
}
for(const id of ['height','smooth','gamma','invert','stretch','material','slice','slice-axis','cloth-shape','distance-range','distance-law','cloth-side','cloth-length','head-depth','broad-scale','image-width','comparison'])$(id).addEventListener($(id).type==='range'?'input':'change',()=>{
  if(['slice','slice-axis'].includes(id)){profile();return;}
  if(!['material','comparison'].includes(id))document.querySelectorAll('[data-depth-preset],[data-reconstruction-preset]').forEach(button=>button.classList.remove('active'));
  update();
});
// Selecting the reference also reveals which shape was supplied.
$('cloth-shape').addEventListener('change',()=>{$('comparison').value=$('cloth-shape').value==='reference'?'prior':'flat';update();});
document.querySelectorAll('[data-depth-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.depthMode)));
async function choose(kind){
  const id=++serial;document.body.dataset.ready='false';$('status').textContent='Loading the source image…';
  try {
    let next,ref=null,nextControl=null,note=notes[kind]||'',inv=false,label='';
    if(kind==='shroud'){next=await loadField('assets/images/face-negative.jpg',180);label='Shroud face · supplied negative';}
    else if(kind==='enrie'){next=await loadField('assets/images/shroud-face-enrie.jpg',180);label='Shroud face · Enrie reproduction';}
    else if(kind==='archive'){next=await loadField('assets/images/face-archive.jpg',180,[45,20,1190,1400]);label='Alternative archival negative';}
    else if(kind==='distance'){nextControl=distanceControl();next=nextControl;label='Synthetic face · known cloth-distance signal';note='Fixed geometry encoded through a known curved cloth. “Known-distance test” restores its true settings.';}
    else if(kind==='simulation'){
      const stored=refreshSimulationOption(),s=stored||await exampleExposure();
      next={data:Float32Array.from(s.data),width:s.width,height:s.height};inv=s.invert;note=s.note;label=stored?'Sunlight result · '+s.name:s.name;
    }else{const width=180,height=240;next={width,height,data:kind==='known'?knownFace(width,height):kind==='portrait'?litPortrait(width,height):paintedFace(width,height)};ref=kind==='known'||kind==='portrait'?knownFace(width,height):null;label=kind==='known'?'Synthetic face · known depth':kind==='portrait'?'Synthetic face · side lighting':'Independent brush study';}
    if(id!==serial)return;source=next;reference=ref;control=nextControl;name=label;loadedKind=kind;$('source').querySelector('[data-local]')?.remove();$('source').value=kind;$('source-note').textContent=note;$('surface-label').textContent=label.toUpperCase();$('invert').checked=inv;update();$('status').textContent=$('surface').dataset.fallback?'WebGL is unavailable. A projected line-surface view is displayed instead.':'Source loaded. Drag the surface, or use its arrow-key controls.';
  }catch(error){if(id!==serial)return;document.body.dataset.ready=String(Boolean(source));$('source').value=loadedKind;$('status').textContent='The source could not be read. Please try another image.';}
}
$('source').addEventListener('change',()=>{document.querySelectorAll('[data-depth-preset],[data-reconstruction-preset]').forEach(button=>button.classList.remove('active'));choose($('source').value);});
$('depth-upload').addEventListener('change',async()=>{
  const file=$('depth-upload').files[0];if(!file)return;if(file.size>10*1024*1024){$('status').textContent='Please choose an image smaller than 10 MB.';return;}
  const id=++serial,url=URL.createObjectURL(file);document.body.dataset.ready='false';
  try{const next=await loadField(url,180);if(id!==serial)return;source=next;reference=null;control=null;name='Uploaded: '+file.name;loadedKind='upload';$('source').querySelector('[data-local]')?.remove();const option=new Option('Uploaded photograph · local',loadedKind);option.disabled=true;option.dataset.local='true';$('source').add(option);$('source').value=loadedKind;$('invert').checked=false;$('source-note').textContent='Your photograph is processed locally. Brightness includes lighting and surface reflectance.';$('surface-label').textContent=name;update();$('status').textContent='Uploaded image loaded.';}
  catch{if(id!==serial)return;document.body.dataset.ready=String(Boolean(source));$('status').textContent='That image could not be read. Try a PNG, JPEG, or WebP file.';}finally{URL.revokeObjectURL(url);}
});
document.querySelectorAll('[data-depth-preset]').forEach(b=>b.addEventListener('click',async()=>{
  setMode('brightness');const p=b.dataset.depthPreset;document.querySelectorAll('[data-depth-preset]').forEach(x=>x.classList.toggle('active',x===b));
  $('smooth').value=p==='soft'?1.25:0;$('gamma').value=1;$('height').value=.7;$('stretch').checked=p==='soft';
  for(const id of ['smooth','gamma','height'])$(id).dispatchEvent(new Event('input'));
  document.querySelectorAll('[data-depth-preset]').forEach(x=>x.classList.toggle('active',x===b));
  const kind=p==='known'?'known':p==='portrait'?'portrait':'shroud';$('source').value=kind;await choose(kind);
}));
document.querySelectorAll('[data-reconstruction-preset]').forEach(button=>button.addEventListener('click',async()=>{
  const preset=button.dataset.reconstructionPreset;setMode('reconstruction');
  const isControl=preset==='control';
  applyReconstruction(isControl?distanceControl(12,16).settings:{...RECONSTRUCTION_DEFAULTS,cloth:preset});
  applyProcessing(isControl?{smoothing:0,gamma:1,inverted:false,stretched:false}:RECONSTRUCTION_PROCESSING);
  $('comparison').value=isControl?'truth':preset==='reference'?'prior':'flat';
  document.querySelectorAll('[data-reconstruction-preset]').forEach(b=>b.classList.toggle('active',b===button));
  surface.reset();await choose(isControl?'distance':'shroud');
}));
$('front').addEventListener('click',()=>{surface.yaw=0;surface.pitch=0;surface.viewChanged();});
$('side').addEventListener('click',()=>{surface.yaw=-Math.PI/2;surface.pitch=0;surface.viewChanged();});
$('orbit-reset').addEventListener('click',()=>surface.reset());
$('depth-export').addEventListener('click',()=>{surface.draw();downloadCanvas($('surface'),mode==='reconstruction'?'shroud-cloth-reconstruction.png':'shroud-height-view.png');});
$('depth-data').addEventListener('click',()=>{
  if(!source)return;
  if(mode==='reconstruction'){
    const r=reconstruction,signal=heightFields(source.data,source.width,source.height,settings()).adjusted;
    download('shroud-cloth-reconstruction.json',JSON.stringify({model:RECONSTRUCTION_VERSION,mode,source:name,sourceKind:loadedKind,width:source.width,height:source.height,
      processing:settings(),reconstruction:r.settings,units:'Assumed model millimetres; no Shroud calibration.',
      equation:'body = cloth - gap',coordinates:{x:'(column / (width - 1) - 0.5) * imageWidth',y:'(0.5 - row / (height - 1)) * imageWidth * height / width',zDatum:CLOTH_DATUM,lateralUnwrapping:false},
      processingOrder:['resample and encoded RGB grayscale','optional inversion','Gaussian smoothing','optional min–max stretch','tonal exponent','inverse distance law','subtract gap from assumed cloth'],
      distanceLaw:r.settings.law==='linear'?'gap = range * (1 - signal)':'gap = -range / 3 * log(exp(-3) + signal * (1 - exp(-3)))',
      referenceDefinition:r.prior?'Featureless oval cap plus GaussianBlur(gap, width * broadScale / 100) minus gap; broad shape is supplied.':null,
      comparison:$('comparison').value,crossSection:{axis:$('slice-axis').value,positionPercent:Number($('slice').value)},
      original:Array.from(source.data),signal:Array.from(signal),gap:Array.from(r.gap),cloth:Array.from(r.cloth),body:Array.from(r.body),
      flatClothBody:Array.from(r.flatBody),suppliedHead:r.prior?Array.from(r.prior):null,
      control:control?{settings:control.settings,body:Array.from(control.body),cloth:Array.from(control.cloth),error:geometryError(r.body,control.body)}:null},null,2));return;
  }
  download('shroud-height-field.json',JSON.stringify({model:MODEL_VERSION,source:name,width:source.width,height:source.height,
    ...settings(),heightScale:Number($('height').value),processingOrder:['resample and encoded RGB grayscale','optional inversion (both surfaces)','Gaussian smoothing (adjusted only)','optional range stretch (adjusted only)','tonal exponent (adjusted only)'],
    crossSection:{axis:$('slice-axis').value,positionPercent:Number($('slice').value)},
    baselineDefinition:'Resampled grayscale with shared polarity; no additional smoothing, range stretch, or tonal exponent.',
    units:'Arbitrary relative height. Not calibrated to anatomy.',original:Array.from(source.data),baseline:Array.from(baseline),heights:Array.from(processed)},null,2));
});
new ResizeObserver(profile).observe($('profile'));
const query=new URLSearchParams(location.search),requestedSource=query.get('source');
setMode(query.get('mode')==='brightness'?'brightness':'reconstruction');
if([...$('source').options].some(option=>option.value===requestedSource))$('source').value=requestedSource;
await choose($('source').value);
