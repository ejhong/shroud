import test from 'node:test';
import assert from 'node:assert/strict';
import {heightFields,crossSection} from '../js/depth-model.js';

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
