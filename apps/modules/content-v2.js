/* Single radial host driven by installed userScripts; not by separately installed Chrome extensions. */
(() => {
  'use strict';
  if(top!==self)return;
  const ID='moodle-tools-radial';
  const icons={
    'file-check':'<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><path d="m9 14 3 3L22 7M8 8h5"/>',
    'calendar-days':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18m5 5h6"/>',
    'puzzle':'<path d="M12 3H3v9h3a2 2 0 1 1 0 4H3v5h9v-3a2 2 0 1 1 4 0v3h5v-9h-3a2 2 0 1 1 0-4h3V3h-5a2 2 0 1 1-4 0Z"/>',
    'settings':'<circle cx="12" cy="12" r="3"/><path d="m19 12 2 1-2 4-2-1-2 1v2H9v-2l-2-1-2 1-2-4 2-1v-2L3 9l2-4 2 1 2-1V3h6v2l2 1 2-1 2 4-2 1Z"/>',
    'plus':'<path d="M12 4v16M4 12h16"/>'
  };
  const svg=name=>'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.puzzle)+'</svg>';
  const route=()=>{
    const u=new URL(location.href);const id=s=>/^[1-9]\d*$/.test(u.searchParams.get(s)||'');
    if(u.pathname==='/course/view.php'&&id('id'))return 'course';
    if(u.pathname==='/course/index.php'&&id('categoryid'))return 'category';
    if(u.pathname==='/mod/assign/view.php'&&u.searchParams.get('action')==='grading')return 'grading';
    return 'other';
  };
  let installed={};
  let opened=false,root,list,toggle;
  const message=(action,extra={})=>chrome.runtime.sendMessage({source:'mrm-host',action,...extra});
  function items(){
    return [...Object.values(installed).filter(m=>m?.enabled===true&&Array.isArray(m.routes)).sort((a,b)=>a.name.localeCompare(b.name)).map(m=>({
      id:m.id,label:m.name,icon:m.icon,active:m.routes.includes(route()),kind:'module'
    })),{id:'manager',label:'Gerenciar Modules',icon:'settings',active:true,kind:'manager'}];
  }
  function positions(index,count){
    const first=4;
    if(index<first){
      const n=Math.min(count,first);
      const angle=(n===1?222:180+(index*(90/(n-1))))*Math.PI/180;
      return [Math.round(Math.cos(angle)*89),Math.round(Math.sin(angle)*89)];
    }
    const n=count-first,offset=index-first;
    const angle=(180+(n===1?45:offset*(90/(n-1))))*Math.PI/180;
    return [Math.round(Math.cos(angle)*153),Math.round(Math.sin(angle)*153)];
  }
  function setOpen(value){
    opened=!!value;
    root.classList.toggle('is-open',opened);
    toggle.setAttribute('aria-expanded',String(opened));
    toggle.setAttribute('aria-label',opened?'Fechar Modules':'Abrir Modules');
    list.inert=!opened;
    list.setAttribute('aria-hidden',String(!opened));
  }
  function redraw(){
    if(!root)return;
    const actions=items();
    list.replaceChildren();
    actions.forEach((item,i)=>{
      const [x,y]=positions(i,actions.length);
      const btn=document.createElement('button');btn.type='button';btn.className='mrm-action';
      btn.dataset.radialAction=item.id;
      btn.style.setProperty('--mrm-x',x+'px');
      btn.style.setProperty('--mrm-y',y+'px');
      btn.style.setProperty('--mrm-delay',i*25+'ms');
      btn.disabled=!item.active;
      const name=item.active?item.label:item.label+' — indisponível nesta página';
      btn.setAttribute('aria-label',name);btn.title=name;
      btn.innerHTML=svg(item.icon);
      const tooltip=document.createElement('span');
      tooltip.className='mrm-tip';tooltip.textContent=name;tooltip.setAttribute('aria-hidden','true');btn.append(tooltip);
      btn.addEventListener('click',async()=>{
        if(btn.disabled)return;
        setOpen(false);
        btn.disabled=true;
        const reply=await message(item.kind==='manager'?'openManager':'activate',{id:item.id})
          .catch(e=>({ok:false,error:String(e)}));
        btn.disabled=!item.active;
        if(!reply?.ok)console.warn('[Modules]',reply?.error||'Falha ao executar módulo');
      });
      list.append(btn);
    });
  }
  async function refresh(){
    try{
      const result=await chrome.storage.local.get('installedModules');
      installed=result.installedModules||{};
      redraw();
    }catch(e){console.error('[Modules] Não foi possível carregar módulos.',e);}
  }
  function boot(){
    if(document.getElementById(ID)||!document.body)return;
    root=document.createElement('div');root.id=ID;root.setAttribute('aria-label','Modules — módulos Moodle');
    list=document.createElement('div');list.className='mrm-items';list.id='moodle-tools-radial-items';list.inert=true;list.setAttribute('aria-hidden','true');list.setAttribute('role','group');
    toggle=document.createElement('button');toggle.className='mrm-toggle';toggle.type='button';toggle.title='Modules';toggle.innerHTML=svg('plus');
    toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',list.id);toggle.setAttribute('aria-label','Abrir Modules');
    root.append(list,toggle);document.body.append(root);
    toggle.addEventListener('click',()=>setOpen(!opened));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened){setOpen(false);toggle.focus();}});
    document.addEventListener('pointerdown',e=>{if(opened&&!root.contains(e.target))setOpen(false);},true);
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.installedModules)refresh();});
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
