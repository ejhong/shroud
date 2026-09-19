import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {DEFAULTS,MODEL_VERSION,simulate,clamp,fitMask} from '../js/model.js';
import {createHash} from 'node:crypto';

// Minimal PNG writer: these assets are calculated model outputs, not illustrations.
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);}
function png(data,w,h,{paint=false,negative=false,maskOnly=false}={}){
  const rows=Buffer.alloc(h*(w*3+1));
  let lo=Infinity,hi=-Infinity;if(negative)for(const v of data){lo=Math.min(lo,v);hi=Math.max(hi,v);}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=data[y*w+x],t=clamp((v-.35)/.53),weave=(Math.sin(x*Math.PI*.91)*Math.cos(y*Math.PI*.92)+Math.sin((x+y)*1.5))*.8;
    const gray=255*(1-(v-lo)/(hi-lo||1));
    const rgb=maskOnly?[255*v,255*v,255*v]:negative?[gray,gray,gray]:paint?[48+192*v,55+180*v,51+167*v]:[125+113*t+weave,99+129*t+weave,66+136*t+weave];
    const offset=y*(w*3+1)+1+x*3;for(let j=0;j<3;j++)rows[offset+j]=clamp(Math.round(rgb[j]),0,255);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir(new URL('../assets/results/',import.meta.url),{recursive:true});
const painting=JSON.parse(await readFile(new URL('../assets/results/beauchamp-mask.json',import.meta.url),'utf8'));
const sourceHash=createHash('sha256').update(await readFile(new URL('../assets/images/beauchamp-glass.jpg',import.meta.url))).digest('hex');
if(sourceHash!==painting.sourceSHA256)throw new Error('The Beauchamp photograph changed. Re-extract the mask before regenerating results.');
const {width,height}=painting,mask=Float32Array.from(painting.data),records=[];
await writeFile(new URL('../assets/results/painting.png',import.meta.url),png(mask,width,height,{paint:true}));
await writeFile(new URL('../assets/results/beauchamp-mask.png',import.meta.url),png(mask,width,height,{maskOnly:true}));
for(const [name,changes]of [['fixed',{fixed:true}],['moving',{}],['wide-gap',{gap:35}],['rotated',{rotation:0}]]){
  const result=simulate(mask,width,height,{...DEFAULTS,...changes},1);
  await writeFile(new URL('../assets/results/'+name+'.png',import.meta.url),png(result.frames.at(-1),width,height));
  records.push({name,settings:result.settings,metrics:result.metrics});
  console.log(name,JSON.stringify(result.metrics));
}
await writeFile(new URL('../assets/results/experiments.json',import.meta.url),JSON.stringify({version:MODEL_VERSION,width,height,
  input:painting.method,source:painting.source,sourceSHA256:painting.sourceSHA256,display:'Assumed linen palette with display-only weave; no tonal stretching',records},null,2)+'\n');
const target=JSON.parse(await readFile(new URL('../assets/results/face-target.json',import.meta.url),'utf8'));
const fitted=fitMask(Float32Array.from(target.data),target.width,target.height,{...DEFAULTS,gap:3});
for(const [name,data,paint] of [['face-fitted',fitted.predicted,false],['face-fit-target',fitted.target,false],['face-fit-painting',fitted.mask,true]])
  await writeFile(new URL('../assets/results/'+name+'.png',import.meta.url),png(data,target.width,target.height,{paint}));
await writeFile(new URL('../assets/results/face-fitted-negative.png',import.meta.url),png(fitted.predicted,target.width,target.height,{negative:true}));
await writeFile(new URL('../assets/results/reconstruction.json',import.meta.url),JSON.stringify({version:MODEL_VERSION,
  source:target.source,sourceSHA256:target.sourceSHA256,inputMethod:target.method,width:target.width,height:target.height,
  settings:fitted.settings,iterations:fitted.iterations,reflectanceRMSEBefore:fitted.before,reflectanceRMSEAfter:fitted.after,
  interpretation:'Target-informed fit to mapped photograph tones. This is not independent validation of image formation.'},null,2)+'\n');
console.log('target-informed face fit',JSON.stringify({before:fitted.before,after:fitted.after}));
