import {readFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const pages=['index.html','shadow.html','depth.html','methods.html'];
let count=0;
for(const page of pages){
  const content=await readFile(resolve(root,page),'utf8');
  assert.match(content,/<html lang="en">/);assert.match(content,/<title>[^<]+<\/title>/);assert.match(content,/<main id="main">/);
  const ids=[...content.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,`Duplicate IDs in ${page}`);
  for(const match of content.matchAll(/(?:href|src)="([^"]+)"/g)){
    const target=match[1];if(/^(?:https?:|data:|mailto:)/.test(target))continue;
    const [path,hash]=target.split('#'),file=resolve(dirname(resolve(root,page)),path.split('?')[0]||page);
    await stat(file);count++;
    if(hash&&file.endsWith('.html')){const linked=file===resolve(root,page)?content:await readFile(file,'utf8');assert.ok(linked.includes(`id="${hash}"`),`Missing ${target} from ${page}`);}
  }
}
console.log(`Checked ${pages.length} HTML pages and ${count} local links/assets. All targets and fragments exist.`);
