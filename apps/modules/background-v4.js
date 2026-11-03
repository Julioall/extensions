/* Modules v0.4.0: independent activation of packaged, complete legacy engines. */
import './legacy/dates/background.js';
import './legacy/corrections/background.js';

const STORE = 'installedModules';
const HOSTS = ['https://ead.fieg.com.br/*', 'https://ead.senai.br/*'];
const CATALOG_URL = 'catalog-v4.json';
const IDS = ['corrections', 'dates'];
const source = name => `legacy/${name}`;

const bundles = {
  corrections: [
    {id:'mrm-corrections-course', matches:HOSTS.map(h => h.replace('/*','/course/view.php*')).concat(HOSTS.map(h => h.replace('/*','/course/index.php*'))),
      js:[source('corrections/course.js')],css:[source('corrections/theme.css')],runAt:'document_idle',persistAcrossSessions:true},
    {id:'mrm-corrections-grading',matches:HOSTS.map(h => h.replace('/*','/mod/assign/view.php*')),
      js:[source('corrections/grading.js')],css:[source('corrections/theme.css')],runAt:'document_idle',persistAcrossSessions:true}
  ],
  dates: [
    {id:'mrm-dates-course',matches:HOSTS.map(h => h.replace('/*','/course/view.php*')),
      js:[source('dates/plan-core.js'),source('dates/course.js')],css:[source('dates/ui.css')],runAt:'document_idle',persistAcrossSessions:true},
    {id:'mrm-dates-form',matches:HOSTS.map(h => h.replace('/*','/course/modedit.php*')),
      js:[source('dates/form.js')],allFrames:true,runAt:'document_idle',persistAcrossSessions:true}
  ]
};
const readCatalog=async()=>{
 const data=await fetch(chrome.runtime.getURL(CATALOG_URL)).then(x=>x.json());
 if(data.schemaVersion!==4 || !Array.isArray(data.modules) || data.modules.length!==2 ||
  !IDS.every(id=>data.modules.some(x=>x.id===id && x.runtime==='packaged')))throw Error('Catálogo inválido.');
 return data;
};
const state=async()=> (await chrome.storage.local.get(STORE))[STORE]||{};
const write=async value=>chrome.storage.local.set({[STORE]:value});
const reject=message=>{throw Error(message);};
const validId=id=>IDS.includes(id);
function toPublic(item){return {id:item.id,name:item.name,version:item.version,enabled:Boolean(item.enabled)};}
const normalize=(entry,descriptor)=>({id:descriptor.id,name:descriptor.name,version:descriptor.version,
 icon:descriptor.icon, routes:[...descriptor.routes],enabled:entry?.enabled===true,
 runtime:'packaged'});

async function syncScripts(id,enabled){
 const expected=bundles[id];if(!expected)return reject('Módulo desconhecido.');
 const current=await chrome.scripting.getRegisteredContentScripts({ids:expected.map(x=>x.id)});
 const existing=new Set(current.map(x=>x.id));
 if(!enabled){if(current.length)await chrome.scripting.unregisterContentScripts({ids:current.map(x=>x.id)});return;}
 const missing=expected.filter(x=>!existing.has(x.id));
 if(missing.length)await chrome.scripting.registerContentScripts(missing);
}
function onModuleRoute(id,url){
 if(typeof url!=='string')return false;
 let u;try{u=new URL(url)}catch{return false}
 if(u.protocol!=='https:'||!['ead.fieg.com.br','ead.senai.br'].includes(u.hostname))return false;
 const valid=x=>/^[1-9]\d*$/.test(u.searchParams.get(x)||'');
 if(id==='corrections')return ((u.pathname==='/course/view.php'&&valid('id'))||(u.pathname==='/course/index.php'&&valid('categoryid'))||u.pathname==='/mod/assign/view.php');
 if(id==='dates')return u.pathname==='/course/view.php'&&valid('id');
 return false;
}
async function injectInOpenTabs(id){
 const tabs=await chrome.tabs.query({url:HOSTS});
 for(const tab of tabs){
  if(!tab.id||!onModuleRoute(id,tab.url))continue;
  const grading=new URL(tab.url).pathname==='/mod/assign/view.php';
  const scripts=bundles[id].filter(s=>id==='corrections'?s.id===`mrm-corrections-${grading?'grading':'course'}`:s.id==='mrm-dates-course');
  for(const item of scripts)try{
    if(item.css?.length)await chrome.scripting.insertCSS({target:{tabId:tab.id},files:item.css});
    await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},files:item.js,world:'ISOLATED'});
  }catch(e){console.warn('[Modules] Recarregue a página para ativar '+id,e.message)}
 }
}
async function removeObsoleteUserScripts(){
 try{
   if(!chrome.userScripts)return;
   const old=await chrome.userScripts.getScripts({ids:IDS.map(x=>'mrm-'+x)});
   if(old.length)await chrome.userScripts.unregister({ids:old.map(x=>x.id)});
 }catch{/* User Scripts opt-in no longer required for packaged compatibility modules. */}
}
async function restore(){
 const data=await state(),cat=await readCatalog();
 const migrated={};
 for(const desc of cat.modules)if(data[desc.id])migrated[desc.id]=normalize(data[desc.id],desc);
 await removeObsoleteUserScripts();
 for(const id of IDS)await syncScripts(id,migrated[id]?.enabled===true);
 if(JSON.stringify(migrated)!==JSON.stringify(data))await write(migrated);
}
async function install(id){
 if(!validId(id))return reject('Módulo inválido');
 const cat=await readCatalog();const desc=cat.modules.find(x=>x.id===id);
 const old=await state();const item=normalize({...old[id],enabled:true},desc);
 await syncScripts(id,true);
 await write({...old,[id]:item});
 await injectInOpenTabs(id);
 return {id,version:item.version,enabled:true};
}
async function toggle(id,enabled){
 if(!validId(id))return reject('Módulo inválido');
 const old=await state();if(!old[id])return reject('Módulo não instalado');
 await syncScripts(id,Boolean(enabled));
 await write({...old,[id]:{...old[id],enabled:Boolean(enabled)}});
 if(enabled)await injectInOpenTabs(id);
 return {id,enabled:Boolean(enabled)};
}
async function remove(id){
 if(!validId(id))return reject('Módulo inválido');
 const old=await state();await syncScripts(id,false);
 const next={...old};delete next[id];await write(next);
 return {id,removed:true};
}
function isMoodle(url){try{return ['ead.fieg.com.br','ead.senai.br'].includes(new URL(url).hostname)}catch{return false}}
chrome.action.onClicked.addListener(async tab=>{
 if(!tab?.id||!isMoodle(tab.url))return;
 try{await chrome.tabs.sendMessage(tab.id,{source:'mrm-host',action:'openCatalog'});}catch{}
});
chrome.runtime.onInstalled.addListener(()=>{void restore().catch(e=>console.error('[Modules]',e))});
chrome.runtime.onStartup.addListener(()=>{void restore().catch(e=>console.error('[Modules]',e))});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(!message||message.source!=='mrm-host'||sender.id!==chrome.runtime.id)return false;
 (async()=>{
  if(message.action==='catalog')return readCatalog();
  if(message.action==='state'){
    const raw=await state();return {installed:Object.fromEntries(Object.entries(raw).map(([id,x])=>[id,toPublic(x)]))};
  }
  if(message.action==='install')return install(message.id);
  if(message.action==='toggle')return toggle(message.id,message.enabled);
  if(message.action==='remove')return remove(message.id);
  throw Error('Operação não autorizada');
 })().then(data=>reply({ok:true,data})).catch(error=>reply({ok:false,error:String(error.message||error)}));
 return true;
});
