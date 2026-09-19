import {clamp} from './model.js';
import {loadField} from './visuals.js';

export const BEAUCHAMP={
  source:'https://shadowshroud.com/images/window.jpg',
  credit:'David Beauchamp · original glass painting, published by N. D. Wilson',
  file:'assets/images/beauchamp-glass.jpg',crop:[65,90,113,145],
  method:'Face-only crop [65,90,113,145] from the 250×344 source photograph. Rec.709-weighted encoded RGB brightness; opacity = clamp((brightness − 0.30) / 0.60, 0, 1). No smoothing, redraw, or generative enhancement. Opacity and a 300 mm model width are assumed, not measured.'
};
export async function beauchampPainting(){
  const image=await loadField(BEAUCHAMP.file,144,BEAUCHAMP.crop);
  return {...image,data:Float32Array.from(image.data,v=>clamp((v-.30)/.60))};
}
