/* Modules host: one menu, no cross-extension APIs or remote code. */
(() => {
  'use strict';
  if (window.top !== window) return;
  const ID = 'moodle-tools-radial';
  document.documentElement?.setAttribute('data-moodle-modules-master', '1');
  const icons = {
    search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 5 5"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18m8 5h6m-3-3v6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>'
  };
  const actions = [
    {id:'scan',module:'corrections',label:'Corrections · Buscar pendências',icon:'search'},
    {id:'download',module:'corrections',label:'Corrections · Baixar pendentes',icon:'download'},
    {id:'import',module:'corrections',label:'Corrections · Importar notas',icon:'upload'},
    {id:'dates',module:'dates',label:'Dates · Ajustar datas',icon:'calendar'}
  ];
  const svg = key => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[key] + '</svg>';
  let visibility = {corrections:true,dates:true};
  function route() {
    const u = new URL(location.href);
    const id = /^[1-9]\d*$/;
    if (u.pathname === '/course/view.php' && id.test(u.searchParams.get('id')||'')) return 'course';
    if (u.pathname === '/course/index.php' && id.test(u.searchParams.get('categoryid')||'')) return 'category';
    if (u.pathname === '/mod/assign/view.php' && u.searchParams.get('action') === 'grading') return 'grading';
    return 'other';
  }
  function target(item) {
    const scope = route();
    if (!visibility[item.module]) return null;
    if (item.id === 'dates') return scope === 'course' ? document.querySelector('#mod-date-button') : null;
    if (item.id === 'import') {
      if (scope === 'grading') return document.querySelector('.imn-launcher');
      if (scope === 'course' || scope === 'category') return document.querySelector('.imn-root.imn-bar .imn-batch-open');
      return null;
    }
    if (scope !== 'course' && scope !== 'category') return null;
    if (item.id === 'scan') return document.querySelector('.imn-root.imn-bar .imn-refresh');
    if (item.id === 'download') return document.querySelector('.imn-root.imn-bar .imn-download');
    return null;
  }
  function boot() {
    if (!document.body || document.getElementById(ID)) return;
    const root = document.createElement('div');
    root.id = ID;
    root.className = 'mrm-root';
    root.setAttribute('aria-label','Modules — ferramentas Moodle');
    const list = document.createElement('div');
    list.className = 'mrm-items';
    list.id = 'moodle-tools-radial-items';
    list.setAttribute('role','group');
    list.inert = true;
    list.setAttribute('aria-hidden','true');
    const controls = new Map();
    actions.forEach((item,index) => {
      const angle = (180 + index * (96/(actions.length-1))) * Math.PI/180;
      const b = document.createElement('button');
      b.className = 'mrm-action';
      b.type='button';
      b.disabled=true;
      b.dataset.radialAction=item.id;
      b.style.setProperty('--mrm-x', Math.round(Math.cos(angle)*89)+'px');
      b.style.setProperty('--mrm-y', Math.round(Math.sin(angle)*89)+'px');
      b.style.setProperty('--mrm-delay', (index*30)+'ms');
      b.setAttribute('aria-label',item.label);
      b.innerHTML=svg(item.icon);
      const tip=document.createElement('span');
      tip.className='mrm-tip';
      tip.setAttribute('aria-hidden','true');
      b.append(tip);
      b.addEventListener('click', e => {
        e.preventDefault();
        const original=target(item);
        if (b.disabled || !original || !original.isConnected || original.disabled) return;
        setOpen(false);
        original.click(); // synchronous: required by file-input user activation.
      });
      list.append(b);
      controls.set(item.id,{b,tip});
    });
    const toggle=document.createElement('button');
    toggle.className='mrm-toggle';
    toggle.type='button';
    toggle.setAttribute('aria-label','Abrir Modules');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls',list.id);
    toggle.title='Modules — Ferramentas Moodle';
    toggle.innerHTML=svg('plus');
    root.append(list,toggle);
    document.body.append(root);
    function refresh() {
      for (const item of actions) {
        const {b,tip}=controls.get(item.id);
        const el=target(item);
        const enabled=Boolean(el && el.isConnected && !el.disabled);
        if (b.disabled === enabled) b.disabled=!enabled;
        const label=enabled?item.label:item.label+' (indisponível nesta página)';
        if (b.title!==label) b.title=label;
        if (tip.textContent!==label) tip.textContent=label;
        b.setAttribute('aria-label',label);
        b.setAttribute('aria-disabled',String(!enabled));
      }
    }
    function setOpen(value) {
      root.classList.toggle('is-open',value);
      toggle.setAttribute('aria-expanded',String(value));
      toggle.setAttribute('aria-label',value?'Fechar Modules':'Abrir Modules');
      list.inert=!value;
      list.setAttribute('aria-hidden',String(!value));
      if(value) refresh();
    }
    toggle.addEventListener('click',()=>setOpen(!root.classList.contains('is-open')));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && root.classList.contains('is-open')) {setOpen(false);toggle.focus();}
    });
    document.addEventListener('pointerdown',e=>{
      if(root.classList.contains('is-open') && !root.contains(e.target)) setOpen(false);
    },true);
    let pending=false;
    const observer=new MutationObserver(()=>{
      if(pending)return;
      pending=true;
      queueMicrotask(()=>{pending=false;if(root.isConnected)refresh();});
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    chrome.storage.local.get('shortcutVisibility').then(result=>{
      const pref=result.shortcutVisibility;
      if(pref && typeof pref==='object') {
        for(const key of Object.keys(visibility)) if(typeof pref[key]==='boolean')visibility[key]=pref[key];
      }
      refresh();
    }).catch(()=>refresh());
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=='local'||!changes.shortcutVisibility)return;
      const pref=changes.shortcutVisibility.newValue || {};
      for(const key of Object.keys(visibility)) visibility[key]=pref[key]!==false;
      refresh();
    });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
