import test from 'node:test';
import assert from 'node:assert/strict';
import {saveExposure,loadExposure} from '../js/experiments.js';
const example={width:2,height:2,data:[.35,.4,.6,.88],name:'Test exposure',note:'Modeled linen',invert:true};
function memory(initial){let value=initial??null;return {getItem:()=>value,setItem:(_,text)=>{value=text;}};}
const unavailable={getItem(){throw new Error('Storage blocked');},setItem(){throw new Error('Quota exceeded');}};
test('a completed exposure remains available without the originating tab storage',()=>{
  const persistent=memory(),session=memory();assert.equal(saveExposure(example,[persistent,session]),true);
  assert.deepEqual(loadExposure([persistent,memory()]).data,example.data);
});
test('the newest exposure wins over an older per-tab result',()=>{
  const old=memory(JSON.stringify({...example,name:'Old tab',savedAt:1}));
  const recent=memory(JSON.stringify({...example,name:'New run',savedAt:2}));
  assert.equal(loadExposure([old,recent]).name,'New run');
});
test('blocked or corrupt storage does not hide a valid exposure',()=>{
  const good=memory();assert.equal(saveExposure(example,[unavailable,good]),true);
  assert.equal(loadExposure([memory('{broken'),unavailable,good]).name,example.name);
  assert.equal(saveExposure(example,[unavailable]),false);assert.equal(loadExposure([unavailable]),null);
});
test('malformed image dimensions and invalid reflectance values are rejected',()=>{
  for(const change of [{width:0},{height:4},{data:[.35,1.2,.6,.88]},{data:[.35,null,.6,.88]}]){
    assert.equal(saveExposure({...example,...change},[memory()]),false);
    assert.equal(loadExposure([memory(JSON.stringify({...example,...change}))]),null);
  }
});
