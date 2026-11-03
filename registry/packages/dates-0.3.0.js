/* Dates — atividades do curso, renderizadas no modal compartilhado do Modules. */
(() => {
  'use strict';
  if(top!==self || location.pathname!=='/course/view.php')return;
  const KEY='dates';
  const m=globalThis.__mrmModules||(globalThis.__mrmModules=Object.create(null));
  function render(body) {
    if(!body)return;
    body.replaceChildren();
    const found=new Map();
    const links=document.querySelectorAll(
      '#region-main a[href*="/mod/assign/view.php"], #region-main a[href*="/mod/quiz/view.php"],'+
      ' #course-index a[href*="/mod/assign/view.php"], #course-index a[href*="/mod/quiz/view.php"]'
    );
    for(const a of links){
      let url;
      try{url=new URL(a.href,location.href);}catch{continue;}
      if(url.origin!==location.origin || !/^\/mod\/(assign|quiz)\/view\.php$/.test(url.pathname))continue;
      const id=url.searchParams.get('id');
      if(!/^[1-9]\d*$/.test(id||'')||found.has(id))continue;
      const title=(a.getAttribute('data-activityname')||a.textContent||'').trim().replace(/\s+/g,' ').slice(0,130);
      found.set(id,{title:title||'Atividade '+id,id});
    }
    if(!found.size){
      const empty=document.createElement('p');
      empty.className='mrm-empty';empty.textContent='Nenhuma atividade encontrada.';
      body.append(empty);return;
    }
    const list=document.createElement('div');list.className='mrm-data-list';
    for(const item of [...found.values()].slice(0,80)){
      const row=document.createElement('div');row.className='mrm-data-row';
      const label=document.createElement('span');label.className='mrm-data-name';label.textContent=item.title;label.title=item.title;
      const link=document.createElement('a');link.className='mrm-data-action';link.textContent='Editar';
      link.href=location.origin+'/course/modedit.php?update='+encodeURIComponent(item.id)+'&return=1';
      row.append(label,link);list.append(row);
    }
    body.append(list);
  }
  m[KEY]={render};
})();
