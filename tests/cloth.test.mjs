import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {upperEnvelope,makeStrip,unfoldStrip,buildCloth,sectionMetrics,clothMesh,transferSignal,CLOTH_WIDTH} from '../js/cloth-model.js';
const source=JSON.parse(readFileSync(new URL('../assets/models/moraes-head.json',import.meta.url)));
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} ≠ ${b}`);

test('a draped semicircle flattens to its analytically known arc length',()=>{
  const radius=50,n=1001,dx=2*radius/(n-1),circle=Float64Array.from({length:n},(_,i)=>Math.sqrt(Math.max(0,radius**2-(-radius+i*dx)**2)));
  const strip=makeStrip(circle,dx,{clothWidth:400}),arc=strip.s.at(-2)-strip.s[1];
  close(arc,Math.PI*radius,.005);
  const flat=unfoldStrip(strip,1);close(flat.x.at(-2)-flat.x[1],arc);assert.ok(flat.z.every(z=>Math.abs(z)<1e-10));
});

test('unfolding preserves every segment at intermediate frames and both endpoints',()=>{
  const strip=makeStrip([0,10,9,35,15,17,0],10);
  for(const t of [0,.17,.5,.93,1]){
    const p=unfoldStrip(strip,t);
    for(let i=1;i<p.x.length;i++)close(Math.hypot(p.x[i]-p.x[i-1],p.z[i]-p.z[i-1]),strip.s[i]-strip.s[i-1]);
    if(t===0)for(let i=0;i<p.x.length;i++){close(p.x[i],strip.x[i]);close(p.z[i],strip.z[i]);}
    if(t===1)for(let i=0;i<p.x.length;i++){close(p.x[i],strip.s[i]);close(p.z[i],0);}
  }
});

test('the envelope bridges hollows without penetrating the reference',()=>{
  const shape=[0,12,3,24,0,11,0],envelope=upperEnvelope(shape);
  assert.ok(envelope[2]>shape[2]);assert.ok(envelope[4]>shape[4]);
  for(let i=0;i<shape.length;i++)assert.ok(envelope[i]>=shape[i]-1e-10);
  for(let i=1;i<shape.length-1;i++)assert.ok(envelope[i]-envelope[i-1]>=envelope[i+1]-envelope[i]-1e-10);
  for(const drape of [0,.5,1]){
    const strip=makeStrip(shape,10,{drape});
    for(let i=0;i<shape.length;i++)assert.ok(strip.z[i+1]>=shape[i]-1e-10);
  }
});

test('flat starting cloth gives zero widening for either geometry',()=>{
  for(const depth of [1,.15]){
    const m=buildCloth(source,{drape:0},depth);
    for(const position of [10,30,62,90])close(sectionMetrics(m,position).flattened,120);
    for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)close(m.sourceX[y*m.width+x],(x/(m.width-1)-.5)*CLOTH_WIDTH,.0001);
  }
});

test('equal depths yield identical results; a shallow relief reduces geometric widening',()=>{
  const full=buildCloth(source,{},1),same=buildCloth(source,{},1),relief=buildCloth(source,{},.15);
  assert.deepEqual(full.signal,same.signal);assert.deepEqual(full.sourceX,same.sourceX);
  const head=sectionMetrics(full),low=sectionMetrics(relief);
  assert.ok(head.widening>30&&head.widening<45);assert.ok(low.widening<2);
  assert.ok(head.flattened>low.flattened);
});

test('changing transfer changes the signal, leaving cloth coordinates and width fixed',()=>{
  const distance=buildCloth(source),contact=buildCloth(source,{transfer:'contact'});
  assert.notDeepEqual(distance.signal,contact.signal);assert.deepEqual(distance.sourceX,contact.sourceX);assert.deepEqual(distance.strips,contact.strips);
  close(transferSignal(0),1);close(transferSignal(12.5),.5);close(transferSignal(25),0);
  close(transferSignal(1,{transfer:'contact'}),1);close(transferSignal(1.01,{transfer:'contact'}),0);
});

test('the mesh retains material UVs and signal throughout unfolding',()=>{
  const model=buildCloth(source),before=model.signal.slice(),start=clothMesh(model,0),flat=clothMesh(model,1);
  assert.deepEqual(start.uv,flat.uv);assert.deepEqual(model.signal,before);
  assert.notDeepEqual(start.positions,flat.positions);assert.ok(flat.positions.every(Number.isFinite));
  for(let i=0;i<flat.positions.length;i+=3){close(flat.positions[i],(flat.uv[i/3*2]-.5)*CLOTH_WIDTH,.0001);close(flat.positions[i+2],0,.0001);}
});

test('reference and extreme settings stay finite and within the material domain',()=>{
  assert.equal(source.license,'CC BY 4.0');assert.equal(source.data.length,source.width*source.height);
  assert.match(source.sha256,/^[a-f0-9]{64}$/);assert.ok(source.data.every(z=>Number.isFinite(z)&&z>=0));
  for(const drape of [0,1])for(const depth of [.05,1]){
    const model=buildCloth(source,{drape,reach:5},depth);
    assert.ok(model.signal.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.ok(model.gaps.every(v=>v>=0));
    for(const strip of model.strips){close(strip.s[0],-CLOTH_WIDTH/2);close(strip.s.at(-1),CLOTH_WIDTH/2);for(let i=1;i<strip.s.length;i++)assert.ok(strip.s[i]>strip.s[i-1]);}
  }
});
