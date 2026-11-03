import {validDescriptor,routeOf,MOODLE_MATCHES} from './catalog-v2-lib.js';
/* Modules host: only packaged privileged code; downloaded modules execute exclusively via chrome.userScripts. */
const STORE='installedModules';
const idFor=id=>'mrm-'+id;
const worldFor=id=>'mrm-'+id;
const BYTES=262144;
const getState=async()=> (await chrome.storage.local.get(STORE))[STORE]||{};
const saveState=async state=>chrome.storage.local.set({[STORE]:state});
const fail=message=>{throw new Error(message);};
async function api(){
  if(!chrome.userScripts) return fail('Ative "Permitir scripts do usuário" nos detalhes da extensão Modules no chrome://extensions.');
  try { await chrome.userScripts.getScripts(); return chrome.userScripts; }
  catch {return fail('A API userScripts está desativada. Habilite "Permitir scripts do usuário" na extensão Modules.');}
}
async function addOrUpdate(module) {
  const scripts=await api();
  await scripts.configureWorld({worldId:worldFor(module.id),messaging:false,csp:"script-src 'self'"});
  const old=await scripts.getScripts({ids:[idFor(module.id)]});
  const spec={id:idFor(module.id),matches:MOODLE_MATCHES,world:'USER_SCRIPT',worldId:worldFor(module.id),runAt:'document_idle',js:[{code:module.code}]};
  if(old.length)await scripts.update([spec]);else await scripts.register([spec]);
}
async function removeLive(id) {
  const scripts=await api();
  const existing=await scripts.getScripts({ids:[idFor(id)]});
  if(existing.length)await scripts.unregister({ids:[idFor(id)]});
}
function isMoodleTab(tab) {return Boolean(tab?.id && routeOf(tab.url)!=='other');}
async function onMoodleTabs(fn){
  const tabs=await chrome.tabs.query({url:MOODLE_MATCHES});
  for(const tab of tabs) if(isMoodleTab(tab))try{await fn(tab);}catch{/* no permission on some tabs; reload when opened */}
}
async function injectNow(module) {
  if(!module.enabled)return;
  await onMoodleTabs(tab=>chrome.userScripts.execute({target:{tabId:tab.id,frameIds:[0]},world:'USER_SCRIPT',worldId:worldFor(module.id),js:[{code:module.code}]}));
}
async function cleanupNow(id){
  const code='globalThis.__mrmModules?.['+JSON.stringify(id)+']?.dispose?.(); if(globalThis.__mrmModules)delete globalThis.__mrmModules['+JSON.stringify(id)+'];';
  await onMoodleTabs(tab=>chrome.userScripts.execute({target:{tabId:tab.id,frameIds:[0]},world:'USER_SCRIPT',worldId:worldFor(id),js:[{code}]}));
}
async function getSource(m){
  if(!validDescriptor(m))fail('Dados do módulo ou endereço inválidos.');
  const response=await fetch(m.scriptUrl,{cache:'no-store',credentials:'omit',redirect:'error'});
  if(!response.ok || response.type==='opaque')fail('Não foi possível baixar o módulo do GitHub.');
  if(!response.url.startsWith('https://raw.githubusercontent.com/Julioall/extensions/'))fail('Origem do arquivo não autorizada.');
  const contentLength=Number(response.headers.get('content-length')||0);
  if(contentLength>m.maxBytes||contentLength>BYTES)fail('Tamanho do módulo acima do limite.');
  const bytes=await response.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>m.maxBytes||bytes.byteLength>BYTES)fail('Arquivo vazio ou acima do limite.');
  const checksum=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const found=Array.from(checksum,b=>b.toString(16).padStart(2,'0')).join('');
  if(found!==m.sha256.toLowerCase())fail('SHA-256 não confere; download recusado.');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
async function install(desc){
  const code=await getSource(desc);
  const old=await getState();
  const previous=old[desc.id];
  const saved={id:desc.id,name:desc.name,description:desc.description,icon:desc.icon,
    routes:[...desc.routes],version:desc.version,sha256:desc.sha256,sourceUrl:desc.scriptUrl,
    enabled:true,installedAt:Date.now(),code};
  try {
    await addOrUpdate(saved);
    await saveState({...old,[desc.id]:saved});
  } catch(error){
    try {if(previous?.enabled)await addOrUpdate(previous);else await removeLive(desc.id);}catch{}
    throw error;
  }
  await injectNow(saved);
  return {id:desc.id,version:desc.version,installed:true};
}
async function toggle(id,enabled){
  const state=await getState();
  const entry=state[id];
  if(!entry)fail('Módulo não instalado.');
  if(!/^[a-z][a-z0-9-]{1,39}$/.test(id))fail('ID inválido.');
  if(enabled)await addOrUpdate(entry);
  else await removeLive(id);
  const updated={...entry,enabled:!!enabled};
  try{await saveState({...state,[id]:updated});}
  catch(e){if(enabled)await removeLive(id);else await addOrUpdate(entry);throw e;}
  if(enabled)await injectNow(updated);
  else await cleanupNow(id);
  return {id,enabled:updated.enabled};
}
async function remove(id){
  const state=await getState();
  if(!state[id])return {id,removed:false};
  await removeLive(id);
  const next={...state};delete next[id];
  await saveState(next);
  await cleanupNow(id);
  return {id,removed:true};
}
async function activate(id,sender){
  if(!sender.tab || sender.frameId!==0 || !Number.isInteger(sender.tab.id))fail('Comando fora de uma aba Moodle.');
  const scope=routeOf(sender.tab.url);
  const state=await getState(),m=state[id];
  if(!m?.enabled||!m.routes.includes(scope))fail('Módulo indisponível nesta rota.');
  const snippet='globalThis.__mrmModules?.['+JSON.stringify(id)+']?.invoke?.();';
  // No imported page code has direct access to chrome.tabs/downloads/storage.
  // A future privileged bridge must validate every operation and site explicitly.
  await (await api()).execute({target:{tabId:sender.tab.id,frameIds:[0]},world:'USER_SCRIPT',
    worldId:worldFor(id),js:[{code:snippet}]});
  return {activated:true};
}
async function restore(){
  const state=await getState();
  for(const entry of Object.values(state)) {
    if(!entry || !entry.id)continue;
    try{if(entry.enabled)await addOrUpdate(entry);else await removeLive(entry.id);}catch(e){console.warn('[Modules] could not restore',entry.id,e);}
  }
}
chrome.runtime.onInstalled.addListener(info=>{if(info.reason==='update')restore().catch(console.error);});
chrome.runtime.onStartup.addListener(()=>restore().catch(console.error));
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||!m||m.source!=='mrm-host')return;
  (async()=>{
    if(m.action==='state')return {installed:await getState(),available:(await api().then(()=>true).catch(()=>false))};
    if(m.action==='install')return install(m.descriptor);
    if(m.action==='toggle')return toggle(m.id,m.enabled);
    if(m.action==='remove')return remove(m.id);
    if(m.action==='activate')return activate(m.id,sender);
    return fail('Ação inválida.');
  })().then(data=>reply({ok:true,data})).catch(err=>reply({ok:false,error:String(err.message||err)}));
  return true;
});
