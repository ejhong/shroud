import {drawField,drawApparatus,loadField,Surface} from './visuals.js';
import {beauchampPainting} from './paintings.js';
import {heightFields,reconstruct,metricDisplay,RECONSTRUCTION_PROCESSING} from './depth-model.js';

document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-photo]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  document.getElementById('hero-image').classList.toggle('inverted',button.dataset.photo==='inverse');
}));
const paint=document.createElement('canvas');
const cloth=new Image();cloth.src='assets/results/moving.png';
Promise.all([beauchampPainting(),cloth.decode()]).then(([painting])=>{
  drawField(paint,painting.data,painting.width,painting.height,{mode:'paint'});
  for(const id of ['home-apparatus','story-apparatus']) {
    const c=document.getElementById(id);const draw=()=>drawApparatus(c,paint,cloth,{sun:{east:.4,north:-.3,up:.866}});
    new ResizeObserver(draw).observe(c);draw();
  }
}).catch(()=>{});
try {
  const {data,width,height}=await loadField('assets/images/face-negative.jpg',180);
  const {adjusted}=heightFields(data,width,height,RECONSTRUCTION_PROCESSING);
  const reconstruction=reconstruct(adjusted,width,height);
  const display=metricDisplay(reconstruction.body,width,height,reconstruction.settings.imageWidth);
  const canvas=document.getElementById('home-depth'),surface=new Surface(canvas,{height:display.height});
  surface.setData(display.data,width,height);
  canvas.dataset.ready='true';
}catch(error){document.getElementById('home-depth').setAttribute('aria-label','Open the depth lab to explore the photograph.');}
