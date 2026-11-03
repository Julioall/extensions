(() => {
  'use strict';
  const box=document.getElementById('catalog'),note=document.getElementById('feedback');
  const glyphs={
    install:'<path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/>',
    update:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M19 15a8 8 0 0 1-14 2l-1-5"/>',
    remove:'<path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6m4-6v6"/>'
  };
  const title={install:'Instalar módulo',update:'Atualizar módulo',remove:'Remover módulo'};
  const send=async(action,id)=>{
    const result=await chrome.runtime.sendMessage({source:'modules.catalog',action,id});
    if(!result?.ok)throw Error(result?.error||'Operação não concluída.');
    return result.data;
  };
  const msg=(s,error=false)=>{note.hidden=!s;note.textContent=s;note.classList.toggle('error',error);};
  const compare=(a,b)=>{
    const x=String(a||'0').split('.').map(Number),y=String(b||'0').split('.').map(Number);
    for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)-(y[i]||0);}
    return 0;
  };
  function actionButton(kind,id,enabled,action){
    const el=document.createElement('button');
    el.type='button';el.dataset.action=kind;el.disabled=!enabled;
    el.title=title[kind];el.setAttribute('aria-label',`${title[kind]} ${id}`);
    el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${glyphs[kind]}</svg>`;
    el.addEventListener('click',async()=>{
      for(const b of document.querySelectorAll('button'))b.disabled=true;
      msg('');
      try {await send(action,id);await render();msg('Recarregue a página do Moodle para aplicar a alteração.');}
      catch(e){msg(String(e.message||e),true);await render(false);}
    });
    return el;
  }
  async function render(clear=true){
    if(clear)msg('');
    const data=await send('list');
    box.replaceChildren();
    for(const mod of data.catalog.modules){
      const have=data.installed[mod.id];
      const row=document.createElement('div');row.className='module-row';
      const label=document.createElement('div');label.className='module-name';
      const name=document.createElement('strong');name.textContent=mod.name;
      const version=document.createElement('span');version.textContent='v'+mod.version;
      label.append(name,version);
      const buttons=document.createElement('div');buttons.className='module-buttons';
      buttons.append(actionButton('install',mod.id,!have,'install'));
      buttons.append(actionButton('update',mod.id,!!have&&compare(mod.version,have.version)>0,'update'));
      buttons.append(actionButton('remove',mod.id,!!have,'remove'));
      row.append(label,buttons);box.append(row);
    }
  }
  render().catch(e=>msg(String(e.message||e),true));
})();
