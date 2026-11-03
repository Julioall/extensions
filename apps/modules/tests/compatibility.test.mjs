import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(resolve(root,file),'utf8');
const object = file => JSON.parse(read(file));
const manifest=object('manifest.json');
const catalog=object('catalog-v4.json');

// Reference hashes ensure exact fidelity to the two original working engines.
const originals={
 'legacy/corrections/background.js':'bf778a0d41bf8ddd54199390936c314a44ad3a0737435bfd09ded69a9be746a1',
 'legacy/corrections/course.js':'59ff15737958b8b362e6a98853c7e5ff8192a57d286db7c214ef210cee477dc1',
 'legacy/corrections/grading.js':'f82dfb217bf6a096dabbba94165097a589be03a746c2b466d0a49818ba6fe369',
 'legacy/corrections/radar/minilm-service.js':'1f22441b7c0214e33a234cbdd667be9b74c1b84045d938c1246629afa7fbfd7e',
 'legacy/corrections/theme.css':'c3e4ec74f43290c1f91de756e37865f658454e7a215a24d4e98767e4b563ed20',
 'legacy/corrections/vendor/transformers.min.js':'9d7bad5df4c8ebd8e88a798035c490bd23ea876605f59e901769f0ed772e21b6',
 'legacy/dates/background.js':'d5d0216f92344881f3f2bb8547ead513d3e9b7aeb778753187194cd521c256d7',
 'legacy/dates/course.js':'9e385d631eb14ab4f438daf707c5af22f981f522b23a718ea8d85ab8bd93fbf9',
 'legacy/dates/form.js':'9341dc87e95bd22b856264ec9dff607e548102549576162ca506c6e5e1c1bf6f',
 'legacy/dates/plan-core.js':'c71a234e15385d52d1449c0726b37197aa7c78ed214ebddf525268acb88d6b3f',
 'legacy/dates/ui.css':'632f1aa731b958be514a5f1d14f34bbb9f05b435021dbaeb0f8ba351e5be3f83'
};

test('host is a single installable MV3 extension',()=>{
 assert.equal(manifest.version,'0.4.0');
 assert.equal(manifest.manifest_version,3);
 assert.equal(manifest.content_scripts.length,1);
 assert.deepEqual(manifest.content_scripts[0].js,['content-v4.js']);
 assert.equal(manifest.background.service_worker,'background-v4.js');
 for(const permission of ['storage','downloads','tabs','alarms','scripting'])assert.ok(manifest.permissions.includes(permission));
 assert.ok(!manifest.permissions.includes('userScripts'));
 assert.ok(!manifest.action.default_popup);
});

test('catalog contains exactly Corrections and Dates, with their original versions',()=>{
 assert.equal(catalog.schemaVersion,4);
 assert.deepEqual(catalog.modules.map(x=>x.id),['corrections','dates']);
 assert.deepEqual(catalog.modules.map(x=>x.version),['1.7.8','1.3.8']);
 assert.ok(catalog.modules.every(x=>x.runtime==='packaged'));
});

test('unmodified native engine sources, including course and grading code, are present',()=>{
 for(const [path,expected] of Object.entries(originals)){
  const digest=createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');
  assert.equal(digest,expected,path);
 }
});

test('Corrections has scan, download, import, grading, category route',()=>{
 const js=read('content-v4.js'),core=read('legacy/corrections/course.js');
 for(const action of ["id:'search'","id:'download'","id:'import'"])assert.ok(js.includes(action));
 for(const query of ['imn-refresh','imn-download','imn-batch-open','imn-launcher'])assert.ok(js.includes(query));
 assert.ok(core.includes('course/index.php'));
 assert.ok(core.includes('imn-batch-open'));
 assert.ok(read('legacy/corrections/grading.js').includes('imn-launcher'));
});

test('Dates keeps full panel and background verified form writer',()=>{
 const core=read('legacy/dates/course.js'),service=read('legacy/dates/background.js');
 for(const phrase of ['mdate-dialog','mdate-apply','applyQuickFill','applySchedule','__mrmReturnModal'])assert.ok(core.includes(phrase));
 for(const phrase of ['MOD_DATE_START','MOD_DATE_FILL','modDateJobV13','matchFields'])assert.ok(service.includes(phrase));
 assert.ok(read('legacy/dates/form.js').includes('MOD_DATE_FILL'));
});

test('modal only: compact catalog icons and original toolbar restored inside dialog',()=>{
 const menu=read('content-v4.js'),style=read('modal-v4.css');
 for(const x of ['mrm-icon-action','mrm-modal-body','mrm-overlay','transition(','mrm-dialog-wide'])assert.ok(menu.includes(x));
 for(const x of ["act('download'","act('refresh'","act('trash'"])assert.ok(menu.includes(x));
 assert.ok(!menu.includes("act('power'"));
 assert.match(style,/\.mrm-embedded-toolbar \.imn-bar-row[^{]*\{[\s\S]*?display:flex!important/);
 assert.ok(style.includes('.mdate-dialog'));
});

test('install/remove register only the chosen module and protect the other',async()=>{
 const listeners={},storage={},scripts=new Map();
 const event=name=>({addListener:cb=>(listeners[name]??=[]).push(cb)});
 const chrome={
  runtime:{id:'test-host',getURL:x=>'chrome-extension://host/'+x,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
  action:{onClicked:event('action')},
  tabs:{query:async()=>[],sendMessage:async()=>({ok:true})},
  scripting:{
   getRegisteredContentScripts:async({ids})=>[...scripts.values()].filter(x=>ids.includes(x.id)),
   registerContentScripts:async arr=>arr.forEach(x=>scripts.set(x.id,x)),
   unregisterContentScripts:async({ids})=>ids.forEach(x=>scripts.delete(x)),
   executeScript:async()=>{},insertCSS:async()=>{}
  },
  storage:{local:{get:async key=>({[key]:storage[key]}),set:async v=>Object.assign(storage,v)}}
 };
 const script=read('background-v4.js').replace(/^import .*;\s*/gm,'');
 vm.runInNewContext(script,{chrome,fetch:async()=>({json:async()=>catalog}),console,URL,Promise,Error,Set,Map,Number,Array,Object,String}, {filename:'background-v4.js'});
 async function call(action,extra={}){
  let response;
  const accepted=listeners.message[0]({source:'mrm-host',action,...extra},{id:chrome.runtime.id},r=>response=r);
  assert.equal(accepted,true);
  for(let i=0;response===undefined&&i<30;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(response);
  if(!response.ok)throw Error(response.error);
  return response.data;
 }
 await call('install',{id:'corrections'});
 assert.deepEqual([...scripts.keys()].sort(),['mrm-corrections-course','mrm-corrections-grading']);
 await call('install',{id:'dates'});assert.equal(scripts.size,4);
 await call('remove',{id:'corrections'});
 assert.deepEqual([...scripts.keys()].sort(),['mrm-dates-course','mrm-dates-form']);
 await call('toggle',{id:'dates',enabled:false});assert.equal(scripts.size,0);
 await call('toggle',{id:'dates',enabled:true});assert.equal(scripts.size,2);
 let rejected=false;try{await call('install',{id:'unknown'})}catch{rejected=true}assert.ok(rejected);
});
