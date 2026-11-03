/* Modules: radial actions keep original module engines; only UI chrome is centralized. */
(() => {
 'use strict';
 if(top!==self)return;
 const ID='moodle-tools-radial';
 const paths = {
  plus:'<path d="M12 4v16M4 12h16"/>',
  modules:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
  upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M19 15a8 8 0 0 1-14 2l-1-5"/>',
  power:'<path d="M12 3v9"/><path d="M7 5a9 9 0 1 0 10 0"/>',
  trash:'<path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>'
 };
 const svg=name=>'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
 const make=(tag,cls='',text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 let installed={}, root,menu,toggle,overlay,originButton,returnPlace,modalBusy=false,open=false;
 let lastNativeButton=null,originalFocus=null,refreshQueued=false;
 const request=async(action,extra={})=>{
  const response=await chrome.runtime.sendMessage({source:'mrm-host',action,...extra});
  if(!response?.ok)throw Error(response?.error||'Operação indisponível');
  return response.data;
 };
 function route(){
  const u=new URL(location.href),valid=k=>/^[1-9]\d*$/.test(u.searchParams.get(k)||'');
  if(u.pathname==='/course/view.php'&&valid('id'))return 'course';
  if(u.pathname==='/course/index.php'&&valid('categoryid'))return 'category';
  if(u.pathname==='/mod/assign/view.php'&&u.searchParams.get('action')==='grading')return 'grading';
  return 'other';
 }
 function findOriginal(kind){
  const r=route();
  if(kind==='dates')return r==='course'?document.getElementById('mod-date-button'):null;
  if(kind==='import')return r==='grading'?document.querySelector('.imn-launcher'):
    ['course','category'].includes(r)?document.querySelector('.imn-root.imn-bar .imn-batch-open'):null;
  if(!['course','category'].includes(r))return null;
  return document.querySelector(kind==='search'?'.imn-root.imn-bar .imn-refresh':'.imn-root.imn-bar .imn-download');
 }
 function actions(){
  const a=[];
  if(installed.corrections?.enabled){
    a.push({id:'search',name:'Buscar pendências',icon:'search',module:'corrections'});
    a.push({id:'download',name:'Baixar pendentes',icon:'download',module:'corrections'});
    a.push({id:'import',name:'Importar notas',icon:'upload',module:'corrections'});
  }
  if(installed.dates?.enabled)a.push({id:'dates',name:'Ajustar datas',icon:'calendar',module:'dates'});
  a.push({id:'catalog',name:'Modules',icon:'modules',module:'host'});
  return a;
 }
 function enabled(action){
  if(action.id==='catalog')return true;
  if(!installed[action.module]?.enabled)return false;
  const b=findOriginal(action.id);
  return Boolean(b && b.isConnected && !b.disabled);
 }
 function at(i,n){
  const level=Math.floor(i/4),j=i%4,count=Math.min(4,n-level*4);
  const angle=(count===1?225:180+(j*(90/(count-1))))*Math.PI/180;
  const r=level?153:89;
  return [Math.round(Math.cos(angle)*r),Math.round(Math.sin(angle)*r)];
 }
 function setMenu(next){
  open=Boolean(next);root.classList.toggle('is-open',open);
  menu.inert=!open;menu.setAttribute('aria-hidden',String(!open));
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Fechar Modules':'Abrir Modules');
 }
 function redraw(){
  if(!menu)return;
  const list=actions();menu.replaceChildren();
  list.forEach((action,i)=>{
   const [x,y]=at(i,list.length),b=make('button','mrm-action');b.type='button';b.dataset.radialAction=action.id;
   b.style.setProperty('--mrm-x',x+'px');b.style.setProperty('--mrm-y',y+'px');b.style.setProperty('--mrm-delay',`${i*25}ms`);
   b.disabled=!enabled(action);
   const label=b.disabled?action.name+' — indisponível':action.name;
   b.title=label;b.setAttribute('aria-label',label);b.innerHTML=svg(action.icon);
   const tip=make('span','mrm-tip',label);tip.setAttribute('aria-hidden','true');b.append(tip);
   b.addEventListener('click',()=>{if(!b.disabled)perform(action,b);});menu.append(b);
  });
 }
 function queueRedraw(){if(refreshQueued)return;refreshQueued=true;setTimeout(()=>{refreshQueued=false;if(root?.isConnected)redraw();},100);}
 async function refresh(){
  try{installed=(await chrome.storage.local.get('installedModules')).installedModules||{};redraw();}
  catch(e){console.warn('[Modules]',e);}
 }
 function transition(dialog,anchor,reverse=false){
  if(!dialog?.isConnected||!anchor?.isConnected||matchMedia('(prefers-reduced-motion:reduce)').matches)return Promise.resolve();
  const from=anchor.getBoundingClientRect(),to=dialog.getBoundingClientRect();
  if(!to.width||!to.height)return Promise.resolve();
  const dx=from.left-to.left,dy=from.top-to.top;
  const small={transform:`translate(${dx}px,${dy}px) scale(${Math.max(.03,from.width/to.width)},${Math.max(.03,from.height/to.height)})`,borderRadius:'50%',opacity:'.55'};
  const large={transform:'none',borderRadius:getComputedStyle(dialog).borderRadius||'16px',opacity:'1'};
  return dialog.animate(reverse?[large,small]:[small,large],{duration:reverse?190:310,easing:'cubic-bezier(.22,.8,.22,1)',fill:'both'}).finished.catch(()=>{});
 }
 function nativeModal(sourceButton,selector){
  lastNativeButton=sourceButton;
  const observe=new MutationObserver(()=>{
   const dlg=document.querySelector(selector);
   if(!dlg||!dlg.getClientRects().length||dlg.dataset.mrmMorph)return;
   dlg.dataset.mrmMorph='1';observe.disconnect();clearTimeout(timeout);void transition(dlg,sourceButton);
  });
  observe.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style']});
  const timeout=setTimeout(()=>observe.disconnect(),90000);
 }
 // Called by the original Dates editor when its own close button is clicked.
 globalThis.__mrmReturnModal=async legacyOverlay=>{
  const target=legacyOverlay?.querySelector('.mdate-dialog');
  try{if(target)await transition(target,lastNativeButton||toggle,true);}finally{
   legacyOverlay?.remove();
   if(lastNativeButton?.isConnected)lastNativeButton.focus();
  }
 };
 function modal(title,button,wide=false){
  if(overlay)closeModal(true);
  originalFocus=document.activeElement;originButton=button;setMenu(false);
  overlay=make('div','mrm-overlay');
  const dlg=make('section','mrm-dialog'+(wide?' mrm-dialog-wide':''));
  dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-labelledby','mrm-title');
  const head=make('div','mrm-modal-head');const label=make('h2','mrm-modal-title',title);label.id='mrm-title';
  const close=make('button','mrm-close');close.type='button';close.title='Fechar';close.setAttribute('aria-label','Fechar');close.innerHTML=svg('x');close.addEventListener('click',()=>closeModal());
  head.append(label,close);const body=make('div','mrm-modal-body');body.id='mrm-modal-body';
  dlg.append(head,body);overlay.append(dlg);document.body.append(overlay);
  overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)closeModal();});
  overlay.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();closeModal();return;}
   if(e.key!=='Tab')return;
   const controls=[...dlg.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')].filter(x=>x.getClientRects().length);
   if(!controls.length){e.preventDefault();close.focus();return;}
   if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus();}
   else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus();}
  });
  void transition(dlg,button).then(()=>{if(close.isConnected)close.focus();});return body;
 }
 async function closeModal(instant=false){
  if(!overlay||modalBusy)return;
  modalBusy=true;const current=overlay;overlay=null;
  if(!instant)await transition(current.querySelector('.mrm-dialog'),originButton,true);
  if(returnPlace?.bar?.isConnected){
   returnPlace.bar.classList.remove('mrm-embedded-toolbar');
   returnPlace.parent.insertBefore(returnPlace.bar,returnPlace.next?.isConnected?returnPlace.next:null);
  }
  returnPlace=null;current.remove();modalBusy=false;
  if(originalFocus?.isConnected)originalFocus.focus();else if(originButton?.isConnected)originButton.focus();
 }
 function corrections(action,button){
  const target=findOriginal(action.id);if(!target||target.disabled)return;
  const toolbar=document.querySelector('.imn-root.imn-bar');
  if(action.id==='import'){
   // A native file picker needs the user activation of the radial click: do not await anything first.
   nativeModal(button,'.imn-backdrop:not([hidden]) .imn-dialog');
   setMenu(false);target.click();return;
  }
  if(!toolbar)return;
  const body=modal('Corrections',button,true);
  returnPlace={bar:toolbar,parent:toolbar.parentNode,next:toolbar.nextSibling};
  body.append(toolbar);
  toolbar.classList.add('mrm-embedded-toolbar');
  if(action.id==='search')target.click();
  if(action.id==='download')target.click();
 }
 function perform(action,button){
  if(action.id==='catalog'){void catalog(button);return;}
  if(action.module==='corrections'){
   if(route()==='grading'){
    const trigger=findOriginal('import');if(!trigger||trigger.disabled)return;
    nativeModal(button,'.imn-backdrop:not([hidden]) .imn-dialog');setMenu(false);trigger.click();return;
   }
   corrections(action,button);return;
  }
  if(action.id==='dates'){
   const trigger=findOriginal('dates');if(!trigger||trigger.disabled)return;
   nativeModal(button,'.mdate-overlay .mdate-dialog');setMenu(false);trigger.click();
  }
 }
 function iconBtn(icon,label,fn,disabled=false){
  const b=make('button','mrm-icon-action');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=svg(icon);b.disabled=disabled;b.addEventListener('click',fn);return b;
 }
 async function catalog(button){
  const body=modal('Modules',button);
  const spin=make('div','mrm-loading');spin.setAttribute('role','status');body.append(spin);
  const render=async()=>{
   try{
    const [list,state]=await Promise.all([request('catalog'),request('state')]);
    if(!body.isConnected)return;
    const wrap=make('div','mrm-catalog');
    for(const mod of list.modules){
     const current=state.installed[mod.id];const row=make('div','mrm-catalog-row');
     const text=make('div','mrm-catalog-name');text.append(make('strong','',mod.name),make('span','mrm-version','v'+mod.version));
     const tools=make('div','mrm-catalog-actions');
     const act=(icon,label,action,params)=>tools.append(iconBtn(icon,label,async e=>{
      const control=e.currentTarget;control.disabled=true;
      try{await request(action,params);await refresh();if(body.isConnected)await render();}
      catch(ex){control.disabled=false;const feedback=make('div','mrm-feedback',String(ex.message||ex));feedback.setAttribute('role','alert');row.append(feedback);}
     }));
     // Only the three requested icons; never claim a remote update for a bundled version.
     const addDisabled=(icon,label)=>tools.append(iconBtn(icon,label,()=>{},true));
     if(!current){
      act('download','Instalar '+mod.name,'install',{id:mod.id});
      addDisabled('refresh','Atualização indisponível');
      addDisabled('trash','Não instalado');
     }else{
      addDisabled('download','Já instalado');
      if(current.version!==mod.version)act('refresh','Atualizar '+mod.name,'install',{id:mod.id});
      else if(!current.enabled)act('refresh','Reativar '+mod.name,'install',{id:mod.id});
      else addDisabled('refresh','Módulo atualizado');
      act('trash','Remover '+mod.name,'remove',{id:mod.id});
     }
     row.append(text,tools);wrap.append(row);
    }
    body.replaceChildren(wrap);
   }catch(ex){if(body.isConnected)body.replaceChildren(make('p','mrm-error',String(ex.message||ex)));}
  };
  await render();
 }
 function boot(){
  if(!document.body||document.getElementById(ID))return;
  root=make('div');root.id=ID;root.setAttribute('aria-label','Modules');
  menu=make('div','mrm-items');menu.inert=true;menu.setAttribute('aria-hidden','true');
  toggle=make('button','mrm-toggle');toggle.type='button';toggle.title='Modules';toggle.innerHTML=svg('plus');
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir Modules');
  root.append(menu,toggle);document.body.append(root);
  toggle.addEventListener('click',()=>setMenu(!open));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open&&!overlay){setMenu(false);toggle.focus();}});
  document.addEventListener('pointerdown',e=>{if(open&&!overlay&&!root.contains(e.target))setMenu(false);},true);
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.installedModules)void refresh();});
  chrome.runtime.onMessage.addListener(message=>{if(message?.source==='mrm-host'&&message.action==='openCatalog')void catalog(toggle);});
  const observer=new MutationObserver(records=>{
    const external=records.some(record=>{
      const element=record.target?.nodeType===1?record.target:record.target?.parentElement;
      return element && !element.closest('#moodle-tools-radial,.mrm-overlay');
    });
    if(external)queueRedraw();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden']});
  void refresh();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
