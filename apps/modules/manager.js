import {CATALOG_URL, validCatalog, canDownload, releaseFileName} from './catalog-lib.js';

const source=document.getElementById('source');
const list=document.getElementById('modules');
const refresh=document.getElementById('refresh');

async function readCatalog() {
  const local=await fetch(chrome.runtime.getURL('catalog.json')).then(r=>r.json());
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  try {
    const response=await fetch(CATALOG_URL,{credentials:'omit',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('GitHub HTTP '+response.status);
    const value=await response.json();
    if(!validCatalog(value))throw new Error('Catálogo remoto inválido');
    source.textContent='Catálogo atualizado pelo GitHub';
    return value;
  } catch(e) {
    source.textContent='Catálogo local em uso (offline ou indisponível)';
    if(!validCatalog(local))throw new Error('Catálogo local inválido');
    return local;
  } finally {clearTimeout(timeout);}
}
function element(tag,text,cls) {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(cls)el.className=cls;
  return el;
}
function prefsFor(data,id) {
  return data && typeof data[id]==='boolean'?data[id]:true;
}
async function download(module,status,button){
  if(!canDownload(module))return;
  button.disabled=true;
  status.textContent='Verificando integridade do pacote…';
  try {
    const response=await fetch(module.downloadUrl,{credentials:'omit'});
    if(!response.ok)throw new Error('Falha HTTP '+response.status);
    const length=Number(response.headers.get('content-length')||0);
    if(length>25*1024*1024)throw new Error('Pacote excede 25 MB');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>25*1024*1024)throw new Error('Pacote excede 25 MB');
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(actual.toLowerCase()!==module.sha256.toLowerCase())throw new Error('SHA-256 não corresponde à release');
    const blob=new Blob([bytes],{type:'application/zip'});
    const objectUrl=URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({url:objectUrl,filename:'Modules/'+releaseFileName(module),saveAs:true});
      status.textContent='Download solicitado. Extraia o ZIP e instale manualmente em chrome://extensions.';
    } finally {setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);}
  } catch(e) {
    status.textContent='Download não realizado: '+String(e.message||e);
  } finally {button.disabled=false;}
}
async function render() {
  refresh.disabled=true;
  list.replaceChildren();
  try {
    const catalog=await readCatalog();
    const current=(await chrome.storage.local.get('shortcutVisibility')).shortcutVisibility||{};
    for(const module of catalog.modules) {
      const card=element('section',undefined,'module');
      const heading=element('div',undefined,'heading');
      heading.append(element('h2',module.name),element('small','v'+module.version));
      card.append(heading,element('p',module.description,'description'),element('p','Tipo: extensão Chrome independente · Canal: '+(module.channel||'stable'),'meta'));
      const row=element('div',undefined,'actions');
      const label=element('label');
      const enabled=document.createElement('input');
      enabled.type='checkbox';
      enabled.checked=prefsFor(current,module.id);
      enabled.addEventListener('change',async ()=>{
        const data=(await chrome.storage.local.get('shortcutVisibility')).shortcutVisibility||{};
        await chrome.storage.local.set({shortcutVisibility:{...data,[module.id]:enabled.checked}});
      });
      label.append(enabled,document.createTextNode('Mostrar atalhos'));
      row.append(label);
      const button=element('button',canDownload(module)?'Baixar ZIP':'Sem release disponível','primary');
      button.disabled=!canDownload(module);
      const status=element('span','', 'status');
      button.addEventListener('click',()=>download(module,status,button));
      row.append(button);
      card.append(row,status);
      list.append(card);
    }
  } catch(e){source.textContent='Erro ao carregar catálogo';list.append(element('p',String(e.message||e)));}
  finally{refresh.disabled=false;}
}
refresh.addEventListener('click',render);
render();
