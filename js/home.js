import {gaussianBlur,normalize} from './model.js';
import {drawField,drawApparatus,loadField,Surface} from './visuals.js';
import {beauchampPainting} from './paintings.js';

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
  const {data,width,height}=await loadField('assets/images/face-negative.jpg',144);
  const surface=new Surface(document.getElementById('home-depth'),{height:.6,pitch:-.65,yaw:-.42});
  surface.setData(normalize(gaussianBlur(data,width,height,1.25)),width,height);
}catch(error){document.getElementById('home-depth').setAttribute('aria-label','Open the depth lab to explore the photograph.');}
