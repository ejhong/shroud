import {CLOTH_VERSION,CLOTH_WIDTH,buildCloth,sectionMetrics,clothMesh,headMesh} from './cloth-model.js?v=cloth-1';
import {ClothView,drawImprint,drawSection} from './cloth-visuals.js?v=cloth-1';
import {bindRanges,download,downloadCanvas} from './visuals.js';

const $=id=>document.getElementById(id);
let source,models,shape='head',animation=0,headView,clothView;
const texture=document.createElement('canvas');
bindRanges();$('cloth-controls').addEventListener('submit',event=>event.preventDefault());
const settings=()=>({drape:+$('cloth-drape').value/100,relief:+$('relief-depth').value/100,reach:+$('cloth-reach').value,transfer:$('cloth-transfer').value,slice:+$('cloth-slice').value});
const selected=()=>models[shape];

function stop(){cancelAnimationFrame(animation);animation=0;updatePlaybackLabel();}
function updatePlaybackLabel(){
  const value=+$('cloth-unfold').value;
  $('cloth-play').textContent=animation?'Pause':value===100?'Wrap again ↙':'Unfold the cloth ↗';
  $('cloth-unfold-out').value=value+'%';
  $('cloth-stage-label').textContent=value===0?'Draped':value===100?'Laid flat':'Unfolding · '+value+'%';
}
function updateScene(){
  const model=selected(),t=+$('cloth-unfold').value/100;
  clothView.centerZ=(1-t)*model.peak*.48;
  clothView.setMesh(clothMesh(model,t,{columns:clothView.gl?141:71,rowStep:clothView.gl?2:3}));
  updatePlaybackLabel();
}
function updateTexture(){
  drawImprint(texture,selected(),{negative:$('cloth-negative').checked,guides:$('cloth-guides').checked,scale:2});
  clothView.setTexture(texture);clothView.draw();
}
function updateMeasurements(){
  const options=settings();
  for(const name of ['head','relief']){
    const metric=sectionMetrics(models[name],options.slice);
    $(name+'-span').textContent=metric.flattened.toFixed(1)+' mm';$(name+'-span').dataset.value=metric.flattened;
    $(name+'-widening').textContent='+'+metric.widening.toFixed(1)+'% wider';
    drawImprint($(name+'-imprint'),models[name],{negative:$('cloth-negative').checked,guides:$('cloth-guides').checked,slice:options.slice});
  }
  $('cloth-result-note').textContent='Dots track a 120 mm span at your chosen slice. '+(options.transfer==='distance'?'The shared transfer range can make a shallow relief nearly solid.':'Only near-contact regions transfer; gaps can leave blank patches.');
  const metric=sectionMetrics(selected(),options.slice);
  $('cloth-finding').textContent=`At this section, 120 mm across the ${shape==='head'?'head':'relief'} follows ${metric.flattened.toFixed(1)} mm of cloth. Laying that path flat adds ${metric.widening.toFixed(1)}% to the guide span.`;
  drawSection($('cloth-profile'),selected(),options.slice);
}
function updateSelected(){
  for(const button of document.querySelectorAll('[data-shape]'))button.setAttribute('aria-pressed',String(button.dataset.shape===shape));
  const model=selected();headView.centerZ=model.peak*.48;headView.guides=$('cloth-guides').checked;headView.setMesh(headMesh(source,model.depth));
  $('form-title').textContent=shape==='head'?'01 / Full-depth head':'01 / Shallow relief';
  document.body.dataset.clothShape=shape;
  updateTexture();updateScene();updateMeasurements();
}
function rebuild(){
  stop();const options=settings();models={head:buildCloth(source,options,1),relief:buildCloth(source,options,options.relief)};
  $('reach-field').hidden=options.transfer==='contact';
  $('transfer-note').textContent=options.transfer==='contact'?'A mark appears within a 1 mm contact band. No pressure or material response is modeled.':`Smaller vertical gaps make darker marks. Signal falls linearly to zero at ${options.reach} mm.`;
  $('relief-caption').textContent=Math.round(options.relief*100)+'% depth';
  $('cloth-status').textContent=options.transfer==='contact'?'Contact only':'Distance falloff';
  document.body.dataset.clothTransfer=options.transfer;updateSelected();
}
export function comparisonImage(){
  const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=880;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f4efe5';ctx.fillRect(0,0,1400,880);ctx.fillStyle='#995d3d';ctx.font='15px "IBM Plex Mono",monospace';ctx.fillText('THE SHROUD / CLOTH LAB',60,65);
  ctx.fillStyle='#28291f';ctx.font='50px Newsreader,Georgia,serif';ctx.fillText('When the cloth unfolds.',60,132);
  const options=settings();ctx.font='16px "IBM Plex Mono",monospace';ctx.fillStyle='#666657';ctx.fillText(`Wrap ${Math.round(options.drape*100)}% · ${options.transfer==='contact'?'Contact ≤ 1 mm':'Linear distance falloff to '+options.reach+' mm'} · Section ${options.slice}%`,60,177);
  for(const [i,name] of ['head','relief'].entries()){
    const x=60+i*665,model=models[name],print=document.createElement('canvas'),metric=sectionMetrics(model,options.slice);
    drawImprint(print,model,{negative:$('cloth-negative').checked,guides:$('cloth-guides').checked,slice:options.slice,scale:3});
    ctx.fillStyle='#28291f';ctx.font='35px Newsreader,Georgia,serif';ctx.fillText(name==='head'?'Full head':`Relief · ${Math.round(options.relief*100)}% depth`,x,264);
    ctx.drawImage(print,x,290,615,615*model.physicalHeight/CLOTH_WIDTH);
    ctx.font='38px Newsreader,Georgia,serif';ctx.fillText(metric.flattened.toFixed(1)+' mm',x,639);
    ctx.fillStyle='#666657';ctx.font='14px "IBM Plex Mono",monospace';ctx.fillText(`120 mm guide span → +${metric.widening.toFixed(1)}% wider`,x,675);
  }
  ctx.strokeStyle='#d7d1c1';ctx.beginPath();ctx.moveTo(60,727);ctx.lineTo(1340,727);ctx.stroke();ctx.fillStyle='#666657';ctx.font='14px "IBM Plex Mono",monospace';
  for(const [i,line] of ['Equal cloth scale · Model millimetres · Independent strips, not woven-sheet mechanics.',
    'Reference geometry adapted from Cicero Moraes · doi:10.6084/m9.figshare.29645060 · CC BY 4.0',
    `Model ${CLOTH_VERSION} · ejhong.github.io/shroud/cloth.html · No Shroud likeness score.`].entries())ctx.fillText(line,60,767+i*30);
  return canvas;
}

try{
  const response=await fetch('assets/models/moraes-head.json');if(!response.ok)throw new Error('Reference model unavailable');source=await response.json();
  headView=new ClothView($('cloth-head'),{frameHeight:370,yaw:-.3,pitch:-.2});
  clothView=new ClothView($('cloth-surface'),{frameHeight:370,frameWidth:750,yaw:-.28,pitch:-.5});
  rebuild();
  for(const id of ['cloth-drape','relief-depth','cloth-reach'])$(id).addEventListener('input',rebuild);
  $('cloth-transfer').addEventListener('change',rebuild);
  $('cloth-slice').addEventListener('input',updateMeasurements);
  for(const id of ['cloth-guides','cloth-negative'])$(id).addEventListener('change',()=>{headView.guides=$('cloth-guides').checked;headView.draw();updateTexture();updateMeasurements();});
  for(const button of document.querySelectorAll('[data-shape]'))button.addEventListener('click',()=>{stop();shape=button.dataset.shape;updateSelected();});
  $('cloth-unfold').addEventListener('input',()=>{stop();updateScene();});
  $('cloth-play').addEventListener('click',()=>{
    if(animation){stop();return;}
    const start=+$('cloth-unfold').value,end=start===100?0:100;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){$('cloth-unfold').value=end;updateScene();return;}
    const began=performance.now(),duration=2200*Math.abs(end-start)/100;
    const frame=now=>{const t=Math.min(1,(now-began)/duration),eased=t*t*(3-2*t);$('cloth-unfold').value=Math.round(start+(end-start)*eased);updateScene();if(t<1){animation=requestAnimationFrame(frame);}else{animation=0;updatePlaybackLabel();}};
    animation=requestAnimationFrame(frame);updatePlaybackLabel();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  $('cloth-front').addEventListener('click',()=>{headView.front();clothView.front();});
  $('cloth-oblique').addEventListener('click',()=>{headView.reset();clothView.reset();});
  $('cloth-reset').addEventListener('click',()=>{
    stop();$('cloth-controls').reset();$('cloth-unfold').value=0;shape='head';
    for(const input of document.querySelectorAll('#cloth-controls input[data-output]'))$(input.dataset.output).value=input.value+(input.dataset.unit||'');
    headView.reset();clothView.reset();rebuild();
  });
  $('cloth-export').addEventListener('click',()=>{downloadCanvas(comparisonImage(),'shroud-cloth-comparison.png');$('cloth-message').textContent='Saved both imprints, settings, scale, and geometry credit.';});
  $('cloth-data').addEventListener('click',()=>{
    const serialize=model=>({depth:model.depth,width:model.width,height:model.height,signal:Array.from(model.signal),sourceX:Array.from(model.sourceX),gaps:Array.from(model.gaps),section:sectionMetrics(model,settings().slice),strips:model.strips.map(s=>({x:Array.from(s.x),z:Array.from(s.z),s:Array.from(s.s),centre:s.centre}))});
    download('shroud-cloth-model.json',JSON.stringify({model:CLOTH_VERSION,settings:settings(),source,coordinates:{clothWidth:CLOTH_WIDTH,clothHeight:selected().physicalHeight,unit:'assumed model mm',registration:'s=0 at projected x=0 in each independent row',mechanics:'No coupling between rows; longitudinal strain, shear, gravity, friction and pressure are not solved.'},head:serialize(models.head),relief:serialize(models.relief)},null,2));
    $('cloth-message').textContent='Saved the reference geometry, both cloth maps, signals, gaps, guide spans, and settings.';
  });
  new ResizeObserver(()=>drawSection($('cloth-profile'),selected(),settings().slice)).observe($('cloth-profile'));
  $('cloth-settings').disabled=false;for(const id of ['cloth-play','cloth-unfold','cloth-export','cloth-data'])$(id).disabled=false;
  document.body.dataset.ready='true';
}catch(error){
  console.error(error);$('cloth-status').textContent='Model unavailable';$('cloth-message').textContent='The reference geometry could not load. Reload this page, or read the method and saved comparison in Sources.';$('cloth-message').classList.add('error');
}
