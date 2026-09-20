import test from 'node:test';
import assert from 'node:assert/strict';
import {heightFields,crossSection,signalToGap,gapToSignal,reconstruct,distanceControl,geometryError,metricDisplay,CLOTH_DATUM} from '../js/depth-model.js';

test('unfiltered heights preserve the input tones, including their limited range',()=>{
  const data=Float32Array.of(.2,.4,.6,.8),original=data.slice();
  const {baseline,adjusted}=heightFields(data,2,2);
  assert.deepEqual(baseline,data);assert.deepEqual(adjusted,data);assert.deepEqual(data,original);
  const inverted=heightFields(data,2,2,{inverted:true});
  assert.deepEqual(inverted.baseline,Float32Array.from(data,v=>1-v));
  assert.deepEqual(inverted.adjusted,inverted.baseline);
});

test('processing can change the adjusted relief without changing its comparison baseline',()=>{
  const data=Float32Array.from({length:63},(_,i)=>i%2?.8:.2),original=data.slice();
  const a=heightFields(data,7,9,{inverted:true});
  const b=heightFields(data,7,9,{inverted:true,smoothing:1.25,stretched:true,gamma:2});
  assert.deepEqual(a.baseline,b.baseline);assert.deepEqual(data,original);
  assert.notDeepEqual(a.adjusted,b.adjusted);
  assert.equal(Math.min(...b.adjusted),0);assert.equal(Math.max(...b.adjusted),1);
});

test('cross-sections preserve row and column orientation on rectangular images',()=>{
  const data=Float32Array.from({length:12},(_,i)=>i);
  assert.deepEqual([...crossSection(data,3,4,'horizontal',100).values],[9,10,11]);
  assert.deepEqual([...crossSection(data,3,4,'vertical',50).values],[1,4,7,10]);
  assert.equal(crossSection(data,3,4,'horizontal',50).index,2);
  assert.deepEqual([...crossSection(data,3,4,'vertical',-10).values],[0,3,6,9]);
  assert.deepEqual([...crossSection(data,3,4,'vertical',110).values],[2,5,8,11]);
});

test('distance laws preserve contact, endpoint, monotonicity and intermediate gaps',()=>{
  for(const law of ['linear','exponential']){
    assert.ok(Math.abs(signalToGap(1,37,law))<1e-10);
    assert.equal(signalToGap(0,37,law),37);
    let previous=Infinity;
    for(let i=0;i<=100;i++){
      const signal=i/100,gap=signalToGap(signal,37,law);
      assert.ok(gap<=previous);previous=gap;
      assert.ok(Math.abs(gapToSignal(gap,37,law)-signal)<1e-12);
    }
  }
  assert.ok(signalToGap(.5,37,'exponential')<signalToGap(.5,37,'linear'));
});

test('a fixed synthetic photograph recovers independent geometry only under the matching assumptions',()=>{
  const control=distanceControl(90,120),original=control.data.slice();
  const recover=options=>reconstruct(control.data,control.width,control.height,{...control.settings,...options});
  assert.ok(geometryError(recover().body,control.body).max<.00001);
  assert.ok(geometryError(recover({cloth:'flat'}).body,control.body).rmse>14);
  assert.ok(geometryError(recover({range:37}).body,control.body).rmse>5);
  assert.ok(geometryError(recover({law:'exponential'}).body,control.body).rmse>5);
  const blurred=heightFields(control.data,90,120,{smoothing:3,stretched:true});
  assert.ok(geometryError(reconstruct(blurred.adjusted,90,120,control.settings).body,control.body).rmse>1);
  assert.deepEqual(control.data,original);
});

test('different cloth and body pairs reproduce the same signal, so image fit cannot select the cloth',()=>{
  const signal=Float32Array.from({length:35},(_,i)=>(i%7)/6);
  const flat=reconstruct(signal,7,5,{cloth:'flat'}),curved=reconstruct(signal,7,5,{cloth:'arched'});
  assert.notDeepEqual(flat.body,curved.body);assert.deepEqual(flat.gap,curved.gap);
  for(const result of [flat,curved])for(let i=0;i<signal.length;i++){
    assert.ok(result.body[i]<=result.cloth[i]+1e-6);
    assert.ok(Math.abs(gapToSignal(result.cloth[i]-result.body[i],37)-signal[i])<1e-6);
  }
  assert.equal(flat.cloth[0],CLOTH_DATUM);
});

test('a constant image contributes no facial features to the explicitly supplied broad shape',()=>{
  const signal=new Float32Array(31*41).fill(.4);
  const result=reconstruct(signal,31,41,{cloth:'reference'});
  assert.ok(geometryError(result.body,result.prior).max<1e-5);
  const noHead=reconstruct(signal,31,41,{cloth:'reference',headDepth:0});
  assert.ok(noHead.body.every(z=>Math.abs(z)<1e-5));
});

test('metric display keeps vertical distances on the same scale as horizontal image distances',()=>{
  for(const [w,h] of [[180,240],[240,180]]){
    const widthMM=160,display=metricDisplay(Float32Array.of(10,30),w,h,widthMM);
    const actualDelta=(display.data[1]-display.data[0])*display.height;
    const xScale=2*(w/h)/Math.max(1,w/h)/widthMM;
    assert.ok(Math.abs(actualDelta-20*xScale)<1e-7);
  }
});
