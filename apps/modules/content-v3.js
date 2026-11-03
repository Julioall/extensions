/* Modules v0.3 — one radial menu and one animated modal for every screen. */
(() => {
  'use strict';
  if (window.top !== window) return;
  const ID = 'moodle-tools-radial';
  const ICON = {
    plus:'<path d="M12 4v16M4 12h16"/>',
    modules:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    'file-check':'<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><path d="m9 14 3 3L22 7M8 8h5"/>',
    'calendar-days':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/>',
    puzzle:'<path d="M12 3H3v9h3a2 2 0 1 1 0 4H3v5h9v-3a2 2 0 1 1 4 0v3h5v-9h-3a2 2 0 1 1-4 0Z"/>',
    x:'<path d="M18 6 6 18M6 6l12 12"/>'
  };
  const svg = name => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.puzzle) + '</svg>';
  const route = () => {
    const u=new URL(location.href), id=key=>/^[1-9]\d*$/.test(u.searchParams.get(key)||'');
    if(u.pathname==='/course/view.php'&&id('id'))return 'course';
    if(u.pathname==='/course/index.php'&&id('categoryid'))return 'category';
    if(u.pathname==='/mod/assign/view.php'&&u.searchParams.get('action')==='grading')return 'grading';
    return 'other';
  };
  let installed={}, root, radial, toggle, overlay, originButton, oldFocus;
  let radialOpen=false, closing=false, priorMenuState=false;
  const request=async (action,extra={}) => {
    const answer=await chrome.runtime.sendMessage({source:'mrm-host',action,...extra});
    if (!answer?.ok) throw Error(answer?.error||'Operação não concluída');
    return answer.data;
  };
  function node(tag,text,className){
    const item=document.createElement(tag);
    if(text!==undefined)item.textContent=text;
    if(className)item.className=className;
    return item;
  }
  function closeRadial(open){
    radialOpen=Boolean(open);
    root.classList.toggle('is-open',radialOpen);
    radial.inert=!radialOpen;
    radial.setAttribute('aria-hidden',String(!radialOpen));
    toggle.setAttribute('aria-expanded',String(radialOpen));
    toggle.setAttribute('aria-label',radialOpen?'Fechar Modules':'Abrir Modules');
  }
  function position(i,len){
    const first=4,level=i<first?0:1;
    const length=Math.min(first,len-level*first),index=i-level*first;
    const angle=(length===1?225:180+90*index/(length-1))*Math.PI/180;
    const radius=level?153:89;
    return [Math.round(Math.cos(angle)*radius),Math.round(Math.sin(angle)*radius)];
  }
  function icons(){
    const moduleItems=Object.values(installed).filter(m=>m?.enabled===true && Array.isArray(m.routes))
      .sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(m=>({
        id:m.id,name:m.name,icon:m.icon||'puzzle',enabled:m.routes.includes(route()),kind:'module'
      }));
    return [...moduleItems,{id:'catalog',name:'Modules',icon:'modules',enabled:true,kind:'catalog'}];
  }
  function redraw(){
    if(!radial)return;
    radial.replaceChildren();
    const items=icons();
    for(let i=0;i<items.length;i++){
      const m=items[i], [x,y]=position(i,items.length);
      const button=node('button',undefined,'mrm-action');
      button.type='button';button.dataset.module=m.id;
      button.disabled=!m.enabled;
      button.style.setProperty('--mrm-x',x+'px');
      button.style.setProperty('--mrm-y',y+'px');
      button.style.setProperty('--mrm-delay',(i*25)+'ms');
      const label=m.enabled?m.name:m.name+' — indisponível';
      button.setAttribute('aria-label',label);button.title=label;
      button.innerHTML=svg(m.icon);
      const tip=node('span',label,'mrm-tip');tip.setAttribute('aria-hidden','true');button.append(tip);
      button.addEventListener('click',()=>{
        if(button.disabled)return;
        if(m.kind==='catalog')openCatalog(button);
        else openModule(m,button);
      });
      radial.append(button);
    }
  }
  async function refresh(){
    try{
      installed=(await chrome.storage.local.get('installedModules')).installedModules||{};
      redraw();
    }catch(e){console.warn('[Modules] Estado indisponível',e);}
  }
  const animate = (dialog,from,to,reverse=false) => {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
    const src=from?.getBoundingClientRect(),dest=dialog.getBoundingClientRect();
    if(!src||!dest.width||!dest.height)return Promise.resolve();
    const dx=src.left-dest.left,dy=src.top-dest.top,sx=src.width/dest.width,sy=src.height/dest.height;
    const start={transform:'translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')',borderRadius:'999px',opacity:'.86'};
    const end={transform:'translate(0,0) scale(1,1)',borderRadius:'18px',opacity:'1'};
    const frames=reverse?[end,start]:[start,end];
    return dialog.animate(frames,{duration:reverse?200:330,easing:'cubic-bezier(.2,.85,.2,1)',fill:'both'}).finished.catch(()=>{});
  };
  function modalParts(title,button){
    if(overlay)removeDialog(false);
    oldFocus=document.activeElement;
    originButton=button&&button.isConnected?button:toggle;
    priorMenuState=radialOpen;
    overlay=node('div',undefined,'mrm-overlay');
    const dialog=node('section',undefined,'mrm-dialog');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','mrm-modal-title');
    const head=node('div',undefined,'mrm-modal-head');
    const h=node('h2',title,'mrm-modal-title');h.id='mrm-modal-title';
    const exit=node('button',undefined,'mrm-close');exit.type='button';exit.setAttribute('aria-label','Fechar');
    exit.innerHTML=svg('x');
    exit.addEventListener('click',()=>closeDialog());
    head.append(h,exit);
    const body=node('div',undefined,'mrm-modal-body');body.id='mrm-modal-body';
    dialog.append(head,body);overlay.append(dialog);document.body.append(overlay);
    overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)closeDialog();});
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();closeDialog();return;}
      if(e.key!=='Tab')return;
      const elements=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')]
        .filter(el=>el.getClientRects().length);
      if(!elements.length){e.preventDefault();exit.focus();return;}
      const first=elements[0],last=elements[elements.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
    dialog.dataset.open='1';
    animate(dialog,originButton).then(()=>{if(dialog.isConnected)exit.focus();});
    return body;
  }
  function removeDialog(restore){
    if(!overlay)return;
    overlay.remove();overlay=null;closing=false;
    if(restore&&root?.isConnected){
      closeRadial(priorMenuState);
      const focus=originButton?.isConnected?originButton:toggle;
      focus.focus();
    }else if(oldFocus?.isConnected)oldFocus.focus();
  }
  async function closeDialog(){
    if(!overlay||closing)return;
    closing=true;
    const dialog=overlay.querySelector('.mrm-dialog'),from=originButton;
    await animate(dialog,from,null,true);
    removeDialog(true);
  }
  function pending(body){
    const spinner=node('div',undefined,'mrm-loading');
    spinner.setAttribute('role','status');spinner.setAttribute('aria-label','Carregando');
    body.replaceChildren(spinner);
  }
  function error(body,message){
    const line=node('p',message,'mrm-error');
    line.setAttribute('role','alert');
    body.replaceChildren(line);
  }
  async function openModule(m,button){
    const body=modalParts(m.name,button);
    pending(body);
    try{
      await request('activate',{id:m.id});
      if(!body.isConnected)return;
      if(!body.children.length || (body.childElementCount===1&&body.firstElementChild?.classList.contains('mrm-loading')))
        error(body,'Atualize o módulo no catálogo.');
    }catch(e){if(body.isConnected)error(body,String(e.message||e));}
  }
  async function openCatalog(button){
    const body=modalParts('Modules',button);
    pending(body);
    const render=async()=>{
      try{
        const [res,state]=await Promise.all([request('catalog'),request('state')]);
        if(!body.isConnected)return;
        const list=node('div',undefined,'mrm-catalog');
        for(const item of res.modules){
          const old=state.installed?.[item.id];
          const row=node('div',undefined,'mrm-catalog-row');
          const name=node('div',undefined,'mrm-catalog-name');
          name.append(node('strong',item.name),node('span','v'+item.version,'mrm-version'));
          const actions=node('div',undefined,'mrm-catalog-actions');
          const make=(caption,action,values,primary=false)=>{
            const b=node('button',caption,primary?'mrm-primary-btn':'mrm-small-btn');
            b.type='button';
            b.disabled=!state.available;
            b.addEventListener('click',async()=>{
              b.disabled=true;
              try{await request(action,values);await refresh();if(body.isConnected)await render();}
              catch(e){
                if(!body.isConnected)return;
                let line=body.querySelector('.mrm-feedback');
                if(!line){line=node('p',undefined,'mrm-feedback');line.setAttribute('role','alert');body.append(line);}
                line.textContent=String(e.message||e);
                b.disabled=false;
              }
            });
            actions.append(b);
          };
          if(!old)make('Instalar','install',{descriptor:item},true);
          else if(old.version!==item.version)make('Atualizar','install',{descriptor:item},true);
          else{
            make(old.enabled?'Desativar':'Ativar','toggle',{id:item.id,enabled:!old.enabled});
            make('Remover','remove',{id:item.id});
          }
          row.append(name,actions);list.append(row);
        }
        body.replaceChildren(list);
        if(!state.available) {
          const hint=node('p','Habilite “Permitir scripts do usuário” nos detalhes do Modules.','mrm-feedback');
          body.append(hint);
        }
      }catch(e){if(body.isConnected)error(body,String(e.message||e));}
    };
    await render();
  }
  function boot(){
    if(document.getElementById(ID)||!document.body)return;
    root=node('div');root.id=ID;root.setAttribute('aria-label','Modules');
    radial=node('div',undefined,'mrm-items');radial.inert=true;radial.setAttribute('aria-hidden','true');
    toggle=node('button',undefined,'mrm-toggle');toggle.type='button';toggle.title='Modules';
    toggle.innerHTML=svg('plus');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir Modules');
    root.append(radial,toggle);document.body.append(root);
    toggle.addEventListener('click',()=>closeRadial(!radialOpen));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&radialOpen&&!overlay){closeRadial(false);toggle.focus();}});
    document.addEventListener('pointerdown',e=>{if(radialOpen&&!overlay&&!root.contains(e.target))closeRadial(false);},true);
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.installedModules)refresh();});
    chrome.runtime.onMessage.addListener((message)=>{
      if(message?.source==='mrm-host'&&message.action==='openCatalog'){openCatalog(toggle);}
    });
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
