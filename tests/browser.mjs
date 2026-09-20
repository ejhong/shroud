import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const base=new URL(process.argv[2]||process.env.SHROUD_SITE_URL||'http://127.0.0.1:4173/');
const workspace=await mkdtemp(join(tmpdir(),'shroud-browser-'));
const screenshots=process.env.SHROUD_SCREENSHOTS||join(workspace,'screenshots');
const downloads=join(workspace,'downloads');await mkdir(screenshots,{recursive:true});await mkdir(downloads,{recursive:true});
const executable=process.env.SHROUD_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=spawn(executable,['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--disable-extensions','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0',`--user-data-dir=${join(workspace,'profile')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
class CDP {
  constructor(socket){this.socket=socket;this.sequence=0;this.pending=new Map();this.events=[];socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(!m.id){this.events.push(m);return;}const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);});}
  static async connect(url){const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});return new CDP(socket);}
  send(method,params={}){const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Timeout: '+method));},20000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  close(){this.socket.close();}
}
let client,browserClient;
try{
  const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+output.slice(-1000))),15000);const fail=e=>{clearTimeout(timer);reject(e);};browser.once('error',fail);browser.once('exit',code=>fail(new Error('Chrome exited '+code+': '+output.slice(-1500))));browser.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  browserClient=await CDP.connect(endpoint);await browserClient.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  const {targetId}=await browserClient.send('Target.createTarget',{url:'about:blank'});
  const targets=await(await fetch(`http://${new URL(endpoint).host}/json/list`)).json();client=await CDP.connect(targets.find(t=>t.id===targetId).webSocketDebuggerUrl);
  await client.send('Page.enable');await client.send('Runtime.enable');await client.send('Network.enable');
  await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function until(expression,timeout=20000){const end=Date.now()+timeout;do{if(await client.evaluate(expression))return;await wait(100);}while(Date.now()<end);throw new Error('Condition failed: '+expression);}
  async function navigate(path,width=1440,height=1100){await client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await client.send('Page.navigate',{url:new URL(path,base).href});await until(`document.readyState==='complete'`);await client.evaluate('document.fonts.ready.then(()=>true)');await wait(150);assert.ok(await client.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Horizontal overflow: ${path}, ${width}`);}
  async function screenshot(name,full=false){if(full)await client.evaluate(`Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode()})).then(()=>true)`);const clip=full?{...await client.evaluate('({x:0,y:0,width:innerWidth,height:Math.min(document.documentElement.scrollHeight,12000)})'),scale:1}:undefined;const {data}=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(clip?{clip}:{})});await writeFile(join(screenshots,name),Buffer.from(data,'base64'));}
  async function click(selector){await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
  async function input(id,value,event='input'){await client.evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(event)}))`);}
  const ready=`document.body.dataset.ready==='true'`;
  const done=`document.querySelector('#model-status')?.textContent==='Exposure complete'`;
  // The last source works even before the visitor has opened the sunlight lab.
  await navigate('depth.html?source=simulation');await until(ready);
  assert.equal(await client.evaluate(`document.body.dataset.depthMode`),'reconstruction');
  assert.ok(await client.evaluate(`document.getElementById('surface-label').textContent.includes('EXAMPLE SUNLIGHT')`));
  assert.ok(await client.evaluate(`document.getElementById('source-note').textContent.includes('Beauchamp')`));
  await navigate('index.html');await client.evaluate(`document.getElementById('home-depth').loading='eager';document.getElementById('home-depth').decode()`);await screenshot('home-desktop.png');await screenshot('home-full.png',true);
  assert.ok(await client.evaluate(`document.querySelector('#hero-image img').src.endsWith('shroud-face-enrie.jpg')`));
  await client.evaluate(`document.getElementById('physical-experiment').scrollIntoView()`);await screenshot('physical-experiment.png');
  await click('[data-photo="inverse"]');assert.equal(await client.evaluate(`document.querySelector('#hero-image').classList.contains('inverted')`),true);
  await client.evaluate(`document.querySelector('#experiments').scrollIntoView()`);await screenshot('experiments-desktop.png');
  // Navigation previews must remain visible even when all page scripts fail.
  async function assertHomePreviews(){
    const images=await client.evaluate(`Promise.all(['home-apparatus','home-depth','story-apparatus'].map(async id=>{
      const image=document.getElementById(id);image.loading='eager';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=120;canvas.height=65;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,120,65);
      const pixels=ctx.getImageData(0,0,120,65).data;let visible=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>150)visible++;
      return {id,tag:image.tagName,width:image.naturalWidth,visible};
    }))`);
    for(const image of images){assert.equal(image.tag,'IMG');assert.ok(image.width>=1200);assert.ok(image.visible>200,`Black preview: ${image.id}`);}
  }
  await assertHomePreviews();
  await client.send('Emulation.setScriptExecutionDisabled',{value:true});
  await navigate('index.html');await assertHomePreviews();
  await client.evaluate(`document.getElementById('experiments').scrollIntoView()`);await screenshot('home-previews-no-js-desktop.png');
  await navigate('index.html',390,844);await assertHomePreviews();
  await client.evaluate(`document.getElementById('home-depth').scrollIntoView({block:'center'})`);await screenshot('home-previews-no-js-mobile.png');
  await client.send('Emulation.setScriptExecutionDisabled',{value:false});

  await navigate('shadow.html');await until(ready);await screenshot('sunlight-desktop.png');await screenshot('sunlight-full.png',true);
  assert.equal(await client.evaluate(`document.getElementById('painting').value`),'beauchamp');
  assert.equal(await client.evaluate(`document.getElementById('painting-reference').hidden`),false);
  await click('#export-data');await wait(400);await rename(join(downloads,'shroud-experiment.json'),join(downloads,'beauchamp-experiment.json'));
  const originalPainting=JSON.parse(await readFile(join(downloads,'beauchamp-experiment.json'),'utf8'));
  assert.equal(originalPainting.sourceKind,'beauchamp');assert.equal(originalPainting.width,113);assert.equal(originalPainting.height,145);
  assert.ok(originalPainting.painting.some(v=>v===0)&&originalPainting.painting.some(v=>v>.9));
  const savedMask=JSON.parse(await readFile(resolve('assets/results/beauchamp-mask.json'),'utf8'));
  assert.deepEqual(originalPainting.painting,savedMask.data,'Saved examples and the live lab must use the same extracted painting');
  // Automatic persistence works without clicking the 3D-transfer button and
  // without the originating tab's session storage.
  await client.evaluate('sessionStorage.clear()');await navigate('depth.html?source=simulation');await until(ready);
  assert.equal(await client.evaluate(`document.body.dataset.depthMode`),'reconstruction');
  assert.ok(await client.evaluate(`document.getElementById('surface-label').textContent.includes('BEAUCHAMP ORIGINAL')`));
  assert.equal(await client.evaluate(`document.querySelector('#source option[value="simulation"]').textContent`),'Latest sunlight experiment');
  await navigate('shadow.html');await until(ready);
  const originalSpread=await client.evaluate(`Number(document.getElementById('spread').textContent)`);assert.ok(originalSpread>0);
  await click('[data-preset="fixed"]');await until(`document.getElementById('spread').textContent==='0.0'&&${done}`);
  await click('[data-preset="moving"]');await until(`Number(document.getElementById('spread').textContent)>0&&${done}`);
  await input('gap',35);await until(`Number(document.getElementById('spread').textContent)>35&&${done}`);
  await click('#play');await until(`document.getElementById('time').value>0&&document.getElementById('time').value<16`);await click('#play');
  await input('time',0);assert.equal(await client.evaluate(`document.getElementById('time-out').textContent`),'Day 0');
  await input('time',16);await click('#clear');await until(`document.getElementById('contrast').textContent==='0.0 pp'&&${done}`);
  await click('#undo');await until(`Number.parseFloat(document.getElementById('contrast').textContent)>0&&${done}`);
  // A real pointer stroke on the glass, followed by undo.
  await client.evaluate(`document.getElementById('paint').scrollIntoView({block:'center'})`);
  const beforePainting=await client.evaluate(`document.getElementById('paint').toDataURL()`);
  const box=await client.evaluate(`(()=>{const r=document.getElementById('paint').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5}})()`);
  await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});
  await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+15,y:box.y+8,button:'left',buttons:1});
  await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+15,y:box.y+8,button:'left',clickCount:1});await wait(500);await until(done);
  assert.notEqual(await client.evaluate(`document.getElementById('paint').toDataURL()`),beforePainting,'Pointer painting did not change the mask');
  assert.equal(await client.evaluate(`document.getElementById('painting').value`),'custom');
  await click('#undo');await wait(500);await until(done);
  assert.equal(await client.evaluate(`document.getElementById('paint').toDataURL()`),beforePainting,'Undo did not restore the original mask');
  await click('#run-sweep');await until(`document.querySelectorAll('.sweep-card').length===6`);await screenshot('comparison-full.png',true);
  await input('painting','shroud','change');await until(`document.querySelector('#painting-note').textContent.includes('Derived from the supplied')&&${done}`);
  await click('[data-view="negative"]');assert.ok(await client.evaluate(`document.getElementById('output-note').textContent.includes('stretched')`));
  await click('#export-data');await wait(400);const exports=await readdir(downloads);assert.ok(exports.includes('shroud-experiment.json'));const experiment=JSON.parse(await readFile(join(downloads,'shroud-experiment.json'),'utf8'));assert.equal(experiment.painting.length,experiment.width*experiment.height);assert.equal(experiment.sourceKind,'shroud');
  await input('gap',3);await wait(300);await until(done);await click('#fit-mask');await until(`document.getElementById('fit-status').textContent.startsWith('Model fit complete')`,30000);await until(done);
  assert.equal(await client.evaluate(`document.getElementById('fit-plates').hidden`),false);
  assert.equal(await client.evaluate(`document.getElementById('painting').value`),'fitted-shroud');
  await client.evaluate(`document.getElementById('reconstruction').scrollIntoView()`);await screenshot('reconstruction-desktop.png');
  // Saved experiments can be loaded, preserving the original painting and parameters.
  const {root:documentRoot}=await client.send('DOM.getDocument');const {nodeId}=await client.send('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'#import-experiment'});
  await client.send('DOM.setFileInputFiles',{nodeId,files:[join(downloads,'shroud-experiment.json')]});await until(`document.getElementById('gap').value==='35'&&${done}`);
  await input('painting','full','change');await until(`document.getElementById('mask-scale').textContent==='1100 mm wide'&&${done}`);
  await input('painting','shroud','change');await until(`document.getElementById('mask-scale').textContent==='300 mm wide'&&${done}`);
  await click('#to-depth');await until(`location.pathname.endsWith('depth.html')&&${ready}`);assert.ok(await client.evaluate(`document.getElementById('invert').checked`));await screenshot('transferred-depth.png');
  await click('[data-depth-mode="brightness"]');
  await click('[data-depth-preset="known"]');await until(`document.querySelector('#agreement').textContent.includes('1.000')`);
  const surfacesMatch=`document.getElementById('surface').toDataURL()===document.getElementById('baseline-surface').toDataURL()`;
  assert.ok(await client.evaluate(surfacesMatch),'Known unfiltered heights should render identically');
  const beforeOrbit=await client.evaluate(`document.getElementById('surface').toDataURL()`);
  await client.evaluate(`document.getElementById('baseline-surface').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))`);
  assert.ok(await client.evaluate(surfacesMatch),'Rotating the baseline must rotate the adjusted view');
  assert.notEqual(await client.evaluate(`document.getElementById('surface').toDataURL()`),beforeOrbit);
  await client.evaluate(`document.getElementById('surface').dispatchEvent(new KeyboardEvent('keydown',{key:'+'}))`);
  assert.ok(await client.evaluate(surfacesMatch),'Zoom must stay synchronized in both directions');
  await click('[data-depth-preset="portrait"]');await until(`document.querySelector('#surface-label').textContent.includes('SIDE LIGHTING')`);assert.ok(!await client.evaluate(`document.querySelector('#agreement').textContent.includes('1.000')`));
  await click('[data-depth-preset="soft"]');await until(`document.querySelector('#surface-label').textContent.includes('SHROUD FACE')`);
  await input('slice',35);assert.ok(await client.evaluate(`document.querySelector('#profile-caption').textContent.includes('Row 86')`));
  await input('slice-axis','vertical','change');await input('slice',50);
  assert.ok(await client.evaluate(`document.querySelector('#profile-caption').textContent.includes('Column 91 of 180')`));
  await client.evaluate(`document.getElementById('height-lab').scrollIntoView()`);
  await click('#side');await screenshot('depth-profile.png');await click('#orbit-reset');await screenshot('depth-desktop.png');
  assert.equal(await client.evaluate(`document.querySelector('#surface').dataset.fallback`),undefined,'WebGL failed unexpectedly');
  await click('#depth-data');await wait(300);assert.ok((await readdir(downloads)).includes('shroud-height-field.json'));
  const heights=JSON.parse(await readFile(join(downloads,'shroud-height-field.json'),'utf8'));
  assert.equal(heights.baseline.length,heights.heights.length);assert.deepEqual(heights.baseline,heights.original);
  assert.notDeepEqual(heights.baseline,heights.heights);assert.equal(heights.crossSection.axis,'vertical');
  await click('[data-depth-preset="raw"]');await until(surfacesMatch);
  assert.equal(await client.evaluate(`document.getElementById('stretch').checked`),false);
  await input('source','enrie','change');await until(`document.getElementById('surface-label').textContent.includes('ENRIE')`);
  assert.ok(await client.evaluate(surfacesMatch));
  await client.evaluate(`document.getElementById('reconstruction-story').scrollIntoView()`);await screenshot('reconstruction-references.png');
  const {root:depthDocument}=await client.send('DOM.getDocument');const {nodeId:uploadNode}=await client.send('DOM.querySelector',{nodeId:depthDocument.nodeId,selector:'#depth-upload'});
  await client.send('DOM.setFileInputFiles',{nodeId:uploadNode,files:[resolve('assets/images/face-negative.jpg')]});await until(`document.getElementById('source').value==='upload'&&document.getElementById('status').textContent==='Uploaded image loaded.'`);
  await input('source','known','change');await until(`document.getElementById('source').value==='known'&&document.querySelector('#surface-label').textContent.includes('KNOWN DEPTH')`);
  // Bare links open cloth reconstruction; direct relief remains explicitly linkable.
  await navigate('depth.html?mode=brightness');await until(ready);
  assert.equal(await client.evaluate(`document.body.dataset.depthMode`),'brightness');
  assert.equal(await client.evaluate(`document.getElementById('cloth-controls').hidden`),true);
  assert.equal(await client.evaluate(`document.getElementById('smooth').value`),'1.25');
  await navigate('depth.html');await until(ready);
  assert.equal(await client.evaluate(`document.querySelector('[data-depth-mode="reconstruction"]').getAttribute('aria-pressed')`),'true');
  assert.equal(await client.evaluate(`document.getElementById('cloth-controls').hidden`),false);
  assert.equal(await client.evaluate(`document.getElementById('height-field').hidden`),true);
  assert.equal(await client.evaluate(`document.getElementById('smooth').value`),'2.25');
  await client.evaluate(`document.getElementById('height-lab').scrollIntoView()`);await screenshot('cloth-reconstruction-desktop.png');
  assert.ok(!await client.evaluate(surfacesMatch),'Curved cloth must change geometry relative to the flat-cloth candidate');
  await input('cloth-shape','flat','change');assert.ok(await client.evaluate(surfacesMatch));
  await input('cloth-shape','arched','change');await input('comparison','cloth','change');
  assert.ok(await client.evaluate(`document.getElementById('baseline-title').textContent.includes('Assumed cloth')`));
  await click('#side');await screenshot('cloth-and-body-profile.png');await click('#orbit-reset');
  await click('[data-reconstruction-preset="reference"]');await until(`${ready}&&document.getElementById('cloth-shape').value==='reference'&&document.getElementById('surface-label').textContent.includes('SHROUD FACE')`);
  assert.equal(await client.evaluate(`document.getElementById('comparison').value`),'prior');
  assert.equal(await client.evaluate(`document.getElementById('reference-controls').hidden`),false);
  await screenshot('reference-assisted-reconstruction.png');
  await click('#depth-data');await wait(300);
  const reconstruction=JSON.parse(await readFile(join(downloads,'shroud-cloth-reconstruction.json'),'utf8'));
  assert.equal(reconstruction.model,'cloth-distance-1');assert.equal(reconstruction.reconstruction.cloth,'reference');
  assert.equal(reconstruction.body.length,reconstruction.width*reconstruction.height);
  assert.equal(reconstruction.suppliedHead.length,reconstruction.body.length);
  assert.ok(reconstruction.body.every((z,i)=>Math.abs(z-(reconstruction.cloth[i]-reconstruction.gap[i]))<.00001));
  assert.equal(reconstruction.coordinates.lateralUnwrapping,false);assert.equal(reconstruction.control,null);
  await rename(join(downloads,'shroud-cloth-reconstruction.json'),join(downloads,'reference-reconstruction.json'));
  await click('[data-reconstruction-preset="control"]');await until(`${ready}&&Number(document.getElementById('agreement').dataset.rmse)<0.00001`);
  assert.equal(await client.evaluate(`document.getElementById('comparison').value`),'truth');
  assert.equal(await client.evaluate(`document.getElementById('stretch').checked`),false);
  const fixedControlSource=await client.evaluate(`document.getElementById('depth-source').toDataURL()`);
  await screenshot('cloth-known-geometry.png');
  await input('cloth-side',0);assert.ok(await client.evaluate(`Number(document.getElementById('agreement').dataset.rmse)>10`));
  assert.equal(await client.evaluate(`document.getElementById('depth-source').toDataURL()`),fixedControlSource,'Inverse settings must not regenerate the test photograph');
  await click('[data-reconstruction-preset="control"]');await until(`${ready}&&Number(document.getElementById('agreement').dataset.rmse)<0.00001`);
  await input('distance-law','exponential','change');assert.ok(await client.evaluate(`Number(document.getElementById('agreement').dataset.rmse)>5`));
  await click('[data-reconstruction-preset="control"]');await until(`${ready}&&Number(document.getElementById('agreement').dataset.rmse)<0.00001`);
  await click('#depth-data');await wait(300);
  const recovered=JSON.parse(await readFile(join(downloads,'shroud-cloth-reconstruction.json'),'utf8'));
  assert.ok(recovered.control.error.max<.00001);assert.notDeepEqual(recovered.original,recovered.body);
  await click('[data-depth-mode="brightness"]');assert.equal(await client.evaluate(`document.getElementById('cloth-controls').hidden`),true);
  await click('[data-depth-mode="reconstruction"]');assert.ok(await client.evaluate(`Number(document.getElementById('agreement').dataset.rmse)<0.00001`));
  await click('[data-depth-mode="brightness"]');
  await click('[data-depth-preset="raw"]');await until(surfacesMatch);
  assert.equal(await client.evaluate(`document.body.dataset.depthMode`),'brightness');
  await navigate('methods.html');await screenshot('methods-desktop.png');
  await navigate('research.html');await screenshot('research-desktop.png');
  assert.equal(await client.evaluate(`document.querySelectorAll('.agenda-list').length`),1);
  assert.equal(await client.evaluate(`document.querySelectorAll('.agenda-list>li>details.research-project').length`),10);
  assert.equal(await client.evaluate(`document.querySelector('nav[aria-label="Main navigation"] [aria-current="page"]').getAttribute('href')`),'research.html');
  await click('.research-header-actions a[href="#priorities"]');await until(`location.hash==='#priorities'`);
  await client.evaluate(`document.getElementById('priorities').scrollIntoView()`);await screenshot('research-priorities.png');
  await click('#pollen summary');assert.ok(await client.evaluate(`document.getElementById('pollen').open`));
  await client.evaluate(`document.getElementById('pollen').scrollIntoView()`);await screenshot('research-pollen.png');
  await click('#pollen summary');assert.equal(await client.evaluate(`document.getElementById('pollen').open`),false);
  await click('.research-header-actions a[href="#shadow-test"]');await until(`location.hash==='#shadow-test'&&document.getElementById('shadow-test').open`);
  await client.evaluate(`document.getElementById('shadow-test').scrollIntoView()`);await screenshot('research-shadow-test.png');
  await client.evaluate(`document.querySelector('.research-test-table').scrollIntoView()`);await screenshot('research-outcomes.png');
  // Printing includes the complete agenda and preserves the reader's choices.
  const disclosureState=await client.evaluate(`[...document.querySelectorAll('.research-project')].map(study=>study.open)`);
  await client.evaluate(`dispatchEvent(new Event('beforeprint'))`);
  assert.equal(await client.evaluate(`document.querySelectorAll('.research-project[open]').length`),10);
  await client.evaluate(`dispatchEvent(new Event('afterprint'))`);
  assert.deepEqual(await client.evaluate(`[...document.querySelectorAll('.research-project')].map(study=>study.open)`),disclosureState);
  for(const path of ['index.html','shadow.html','depth.html','methods.html','research.html']){
    await navigate(path,390,844);if(path==='shadow.html'||path==='depth.html')await until(ready);
    await screenshot(path.replace('.html','')+'-mobile.png');await screenshot(path.replace('.html','')+'-mobile-full.png',true);
    assert.ok(await client.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Late horizontal overflow: ${path}`);
  }
  for(const width of [390,320]){
    await navigate('depth.html?mode=reconstruction',width,844);await until(ready);
    await client.evaluate(`document.getElementById('height-lab').scrollIntoView()`);await screenshot('cloth-reconstruction-mobile-'+width+'.png');
    await click('[data-reconstruction-preset="reference"]');await until(`${ready}&&document.getElementById('comparison').value==='prior'`);
    await client.evaluate(`document.getElementById('depth-controls').scrollIntoView()`);await screenshot('cloth-controls-mobile-'+width+'.png');
    assert.ok(await client.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  await navigate('research.html#shadow-test',390,844);
  await until(`document.getElementById('shadow-test').open`);
  await client.evaluate(`document.querySelector('.shadow-stages').scrollIntoView()`);await screenshot('research-protocol-mobile.png');
  // Older links reveal the corresponding study in the unified list.
  await navigate('research.html#access-pollen',390,844);await until(`document.getElementById('pollen').open`);
  await client.evaluate(`document.getElementById('pollen').scrollIntoView()`);await screenshot('research-pollen-mobile.png');
  assert.ok(await client.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow in the expanded pollen study');
  await navigate('research.html#dna',390,844);await until(`document.getElementById('dna').open`);
  await client.evaluate(`document.getElementById('dna').scrollIntoView()`);await screenshot('research-dna-mobile.png');
  await navigate('shadow.html?painting=bars&gap=999&days=-5&latitude=999&fixed=true',360,800);await until(ready);
  assert.equal(await client.evaluate(`document.getElementById('gap').value`),'60');assert.equal(await client.evaluate(`document.getElementById('days').value`),'1');
  // The renderer remains usable on browsers without WebGL.
  const {identifier}=await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`const originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:originalContext.call(this,type,...args);};`});
  await navigate('depth.html',390,844);await until(ready);assert.equal(await client.evaluate(`document.getElementById('surface').dataset.fallback`),'true');await screenshot('cloth-reconstruction-fallback.png');await click('[data-depth-mode="brightness"]');await screenshot('depth-fallback.png');await click('[data-depth-mode="reconstruction"]');assert.ok(await client.evaluate(`document.getElementById('processing-note').textContent.includes('physical scale')`));await client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  const exceptions=client.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.deepEqual(exceptions,[],'Uncaught JavaScript exceptions');
  const bad=client.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.startsWith(base.origin)&&e.params.response.status>=400).map(e=>e.params.response.url);assert.deepEqual(bad,[],'Failed local requests');
  console.log(`Browser checks passed: desktop/mobile layouts, original painting and physical-result assets, photo inversion, physical controls, playback, painting/undo, six comparisons, target fitting, JSON export/import, image upload, automatic cross-page persistence, first-visit example, WebGL and its fallback, linked height comparisons, vertical sections, unified research agenda, deep links, print restoration, synthetic controls, cloth inversion, explicit shape priors, fixed known-distance recovery, physical scale, reconstruction exports, 320px layouts, the default cloth reconstruction, direct-relief links, and nonblank homepage previews with JavaScript disabled.\nScreenshots: ${screenshots}\nDownloads: ${downloads}`);
}finally{client?.close();browserClient?.close();browser.kill('SIGTERM');}
