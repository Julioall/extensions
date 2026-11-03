/* Master catalog only. The two original service workers are imported verbatim.
   Their message handlers, storage keys, download rules, and date-job flows are unchanged. */
import './src/background.js';
import './background.js';

const STORE = 'modules.catalog.installed';
const LEGACY_STORE = 'installedModules';
const CATALOG_FILE = 'catalog.json';
const GROUPS_FILE = 'module-script-groups.json';
const ALLOWED = new Set(['corrections', 'dates']);
const OBSOLETE = ['mrm-corrections-course', 'mrm-corrections-grading', 'mrm-dates-course', 'mrm-dates-form'];
let serial = Promise.resolve();
const exclusive = handler => {
  const job = serial.then(handler);
  serial = job.catch(() => {});
  return job;
};

const loadData = async path => {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw Error('Arquivo da extensão indisponível.');
  return response.json();
};
const catalog = () => loadData(CATALOG_FILE);
const groups = () => loadData(GROUPS_FILE);
const installed = async () => (await chrome.storage.local.get(STORE))[STORE] || {};
const save = next => chrome.storage.local.set({[STORE]:next});
function safeId(id) {
  if (!ALLOWED.has(id)) throw Error('Módulo não reconhecido.');
  return id;
}
function compare(a,b) {
  const x=String(a||'0.0.0').split('.').map(Number),y=String(b||'0.0.0').split('.').map(Number);
  for(let i=0;i<3;i++)if((x[i]||0)!==(y[i]||0))return (x[i]||0)-(y[i]||0);
  return 0;
}
async function unregister(ids) {
  if (!ids.length) return;
  const available=await chrome.scripting.getRegisteredContentScripts({ids});
  if (available.length)await chrome.scripting.unregisterContentScripts({ids:available.map(x=>x.id)});
}
async function ensureRegistered(id) {
  safeId(id);
  const all=await groups(), expected=all[id];
  if (!Array.isArray(expected)||!expected.length)throw Error('Módulo incompleto.');
  const current=await chrome.scripting.getRegisteredContentScripts({ids:expected.map(x=>x.id)});
  const byId=new Map(current.map(x=>[x.id,x]));
  const changed=expected.filter(x=>byId.has(x.id));
  const missing=expected.filter(x=>!byId.has(x.id));
  // Maintain precisely the content-script sequence/matches/css from the original manifests.
  if (changed.length) await chrome.scripting.updateContentScripts(changed);
  if (missing.length) await chrome.scripting.registerContentScripts(missing);
}
async function disableScripts(id) {
  safeId(id);
  const all=await groups();
  await unregister(all[id].map(x=>x.id));
}
async function reconcile() {
  const all=await groups(), state=await installed();
  const old=(await chrome.storage.local.get(LEGACY_STORE))[LEGACY_STORE] || {};
  const latest={...state};
  // Upgrade from previous Modules; keep the user's active module choices.
  for(const id of ALLOWED) {
    if(!latest[id] && old[id]?.enabled===true) latest[id]={version:old[id].version||'0.0.0'};
  }
  await unregister(OBSOLETE);
  for(const id of ALLOWED) {
    if(latest[id])await ensureRegistered(id);
    else await unregister(all[id].map(x=>x.id));
  }
  if(JSON.stringify(latest)!==JSON.stringify(state))await save(latest);
}
async function install(id) {
  safeId(id);
  const data=await catalog(), descriptor=data.modules.find(x=>x.id===id);
  if(!descriptor)throw Error('Módulo não disponível.');
  const state=await installed();
  if(state[id])throw Error('Módulo já instalado.');
  await ensureRegistered(id);
  try{await save({...state,[id]:{version:descriptor.version}});}
  catch(e){await disableScripts(id);throw e;}
  return {id,version:descriptor.version};
}
async function update(id) {
  safeId(id);
  const state=await installed();if(!state[id])throw Error('Instale o módulo primeiro.');
  const data=await catalog(),d=data.modules.find(x=>x.id===id);
  if(!d || compare(d.version,state[id].version)<=0)throw Error('Nenhuma versão nova incluída.');
  await ensureRegistered(id);
  await save({...state,[id]:{version:d.version}});
  return {id,version:d.version};
}
async function remove(id) {
  safeId(id);
  const state=await installed();
  await disableScripts(id);
  const next={...state};delete next[id];await save(next);
  return {id};
}
chrome.runtime.onInstalled.addListener(()=>void exclusive(reconcile).catch(e=>console.error('[Modules]',e)));
chrome.runtime.onStartup.addListener(()=>void exclusive(reconcile).catch(e=>console.error('[Modules]',e)));
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.source!=='modules.catalog')return false;
  // Only the extension's own popup may install/change modules, never the Moodle page.
  if(sender.id!==chrome.runtime.id || sender.tab || sender.url!==chrome.runtime.getURL('popup.html'))return false;
  exclusive(async()=>{
    if(message.action==='list')return {catalog:await catalog(),installed:await installed()};
    if(message.action==='install')return install(message.id);
    if(message.action==='update')return update(message.id);
    if(message.action==='remove')return remove(message.id);
    throw Error('Ação inválida.');
  }).then(data=>reply({ok:true,data})).catch(e=>reply({ok:false,error:String(e.message||e)}));
  return true;
});
