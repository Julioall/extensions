import {REMOTE_CATALOG,validCatalog} from './catalog-v2-lib.js';
const status=document.getElementById('source'),board=document.getElementById('modules'),refresh=document.getElementById('refresh');
const request=async(action,params={})=>{
  const answer=await chrome.runtime.sendMessage({source:'mrm-host',action,...params});
  if(!answer?.ok)throw new Error(answer?.error||'Operação indisponível');
  return answer.data;
};
function el(tag,text,cls){const e=document.createElement(tag);if(typeof text==='string')e.textContent=text;if(cls)e.className=cls;return e;}
async function loadCatalog(){
  const local=await fetch(chrome.runtime.getURL('catalog-v2.json')).then(r=>r.json());
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5500);
  try{
    const result=await fetch(REMOTE_CATALOG,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
    if(!result.ok)throw Error('GitHub '+result.status);
    const data=await result.json();
    if(!validCatalog(data))throw Error('Catálogo remoto inválido');
    return {catalog:data,source:'Catálogo de módulos consultado no GitHub'};
  }catch{
    if(!validCatalog(local))throw Error('Catálogo local inválido');
    return {catalog:local,source:'Sem conexão com GitHub: catálogo embutido nesta versão do Modules'};
  }finally{clearTimeout(timer);}
}
async function execute(action,args,note,button){
  button.disabled=true;
  note.textContent='Executando '+(action==='install'?'instalação':'operação')+'…';
  try{
    await request(action,args);
    await render();
  }catch(e){
    note.textContent=String(e.message||e);
    button.disabled=false;
  }
}
async function render(){
  refresh.disabled=true;board.replaceChildren();
  try{
    const [remote,state]=await Promise.all([loadCatalog(),request('state')]);
    status.textContent=remote.source;
    if(!state.available){
      const warn=el('section',undefined,'help');
      warn.append(el('h2','Ação necessária: Permitir scripts do usuário'));
      warn.append(el('p','No Chrome: chrome://extensions → Modules → Detalhes → Permitir scripts do usuário. Em seguida, volte aqui e clique em Atualizar catálogo.'));
      board.append(warn);
    }
    for(const m of remote.catalog.modules){
      const old=state.installed?.[m.id];
      const card=el('section',undefined,'module');
      const heading=el('div',undefined,'heading');
      heading.append(el('h2',m.name),el('small','v'+m.version+' · '+(m.experimental?'Teste':'Estável')));
      card.append(heading);
      card.append(el('p',m.description,'description'));
      card.append(el('p',old?('Instalado: v'+old.version+' · '+(old.enabled?'Ativo':'Desativado')):'Não instalado','meta'));
      const row=el('div',undefined,'actions');
      const note=el('span','','status');
      if(!old || old.version!==m.version){
        const btn=el('button',old?'Atualizar módulo':'Baixar e ativar','primary');
        btn.disabled=!state.available;
        btn.addEventListener('click',()=>execute('install',{descriptor:m},note,btn));
        row.append(btn);
      }else{
        const btn=el('button',old.enabled?'Desativar':'Ativar');
        btn.disabled=!state.available;
        btn.addEventListener('click',()=>execute('toggle',{id:m.id,enabled:!old.enabled},note,btn));
        row.append(btn);
        const remove=el('button','Remover');
        remove.disabled=!state.available;
        remove.addEventListener('click',()=>execute('remove',{id:m.id},note,remove));
        row.append(remove);
      }
      const link=el('a','Código-fonte');
      link.href=m.scriptUrl;link.target='_blank';link.rel='noopener noreferrer';
      row.append(link);
      card.append(row,note);board.append(card);
    }
  }catch(e){
    status.textContent='Não foi possível carregar o gerenciador.';
    board.append(el('p',String(e.message||e)));
  }finally{refresh.disabled=false;}
}
refresh.addEventListener('click',render);
render();
