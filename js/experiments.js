// Share the latest exposure across pages and tabs without sending images anywhere.
const KEY='shroud-simulation';
function browserStores(){
  const stores=[];
  for(const name of ['localStorage','sessionStorage'])try{if(globalThis[name])stores.push(globalThis[name]);}catch{}
  return stores;
}
function valid(value){
  return value&&Number.isInteger(value.width)&&Number.isInteger(value.height)&&value.width>=2&&value.height>=2&&value.width<=512&&value.height<=512&&
    Array.isArray(value.data)&&value.data.length===value.width*value.height&&value.data.length<=200000&&value.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&
    typeof value.name==='string'&&typeof value.note==='string'&&typeof value.invert==='boolean';
}
export function saveExposure(value,stores=browserStores()){
  if(!valid(value))return false;
  const text=JSON.stringify({...value,savedAt:Date.now()});let saved=false;
  for(const store of stores)try{store.setItem(KEY,text);saved=true;}catch{}
  return saved;
}
export function loadExposure(stores=browserStores()){
  let latest=null;
  for(const store of stores)try{
    const value=JSON.parse(store.getItem(KEY));
    if(valid(value)&&(!latest||(Number(value.savedAt)||0)>(Number(latest.savedAt)||0)))latest=value;
  }catch{}
  return latest;
}
