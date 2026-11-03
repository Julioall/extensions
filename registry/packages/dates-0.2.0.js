/* Dates 0.2.0 — teste da arquitetura: levantamento de atividades somente leitura. */
(() => {
  'use strict';
  if (top !== self || location.pathname !== '/course/view.php') return;
  if (!/^\d+$/.test(new URL(location.href).searchParams.get('id') || '')) return;
  const KEY = 'dates';
  const prefix = 'mrm-module-dates';
  function close(){document.getElementById(prefix)?.remove();}
  function invoke(){
    close();
    const panel=document.createElement('section');panel.id=prefix;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Dates — atividades');
    Object.assign(panel.style,{position:'fixed',bottom:'106px',right:'24px',zIndex:'2147481001',width:'min(430px,calc(100vw - 32px))',maxHeight:'70vh',overflow:'auto',border:'1px solid #9ba5b1',background:'var(--bs-body-bg,white)',color:'var(--bs-body-color,#202428)',padding:'18px',borderRadius:'14px',boxShadow:'0 10px 40px #0003',font:'14px/1.5 system-ui,sans-serif'});
    const head=document.createElement('div');Object.assign(head.style,{display:'flex',justifyContent:'space-between',gap:'8px'});
    const label=document.createElement('strong');label.textContent='Dates — atividades do curso';
    const exit=document.createElement('button');exit.type='button';exit.textContent='Fechar';exit.addEventListener('click',close);
    head.append(label,exit);panel.append(head);
    const info=document.createElement('p');
    info.textContent='Módulo instalado pelo catálogo. Localiza atividades disponíveis na página sem alterar datas automaticamente.';
    panel.append(info);
    const anchors=[...document.querySelectorAll('#region-main a[href*="/mod/assign/view.php"], #region-main a[href*="/mod/quiz/view.php"], #course-index a[href*="/mod/assign/view.php"], #course-index a[href*="/mod/quiz/view.php"]')];
    const items=new Map();
    for(const a of anchors){
      try {const u=new URL(a.href);
        if(u.origin!==location.origin)continue;
        if(!/^\/mod\/(assign|quiz)\/view\.php$/.test(u.pathname))continue;
        const id=u.searchParams.get('id');if(!/^\d+$/.test(id||''))continue;
        if(!items.has(id)) items.set(id, {id,label:a.textContent.trim().replace(/\s+/g,' ').slice(0,110) || 'Atividade '+id});
      }catch{}
    }
    const count=document.createElement('p');count.textContent='Atividades identificadas: '+items.size;panel.append(count);
    const list=document.createElement('ul');
    list.style.paddingLeft='24px';
    for(const item of [...items.values()].slice(0,60)){
      const li=document.createElement('li');
      const link=document.createElement('a');
      link.href=location.origin+'/course/modedit.php?update='+encodeURIComponent(item.id)+'&return=1';
      link.textContent=item.label;
      link.title='Abrir edição oficial da atividade no Moodle';
      link.target='_self';
      li.append(link);list.append(li);
    }
    panel.append(list);
    const note=document.createElement('p');
    note.textContent='O ajuste automático com cronograma e gravação de datas depende de migrar o serviço de formulário para o Modules. Esta versão de teste oferece acesso manual ao editor oficial.';
    note.style.fontSize='12px';note.style.opacity='.8';panel.append(note);
    document.body.append(panel);exit.focus();
  }
  globalThis.__mrmModules ||= Object.create(null);
  globalThis.__mrmModules[KEY]={invoke,dispose:close};
})();
