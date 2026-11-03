/* Corrections — interface compacta no modal único do Modules. */
(() => {
  'use strict';
  if (top !== self) return;
  const KEY='corrections';
  const m=globalThis.__mrmModules||(globalThis.__mrmModules=Object.create(null));
  function render(body) {
    if(!body) return;
    body.replaceChildren();
    const url=new URL(location.href), category=url.pathname==='/course/index.php'&&url.searchParams.has('categoryid');
    const course=url.pathname==='/course/view.php'&&url.searchParams.has('id');
    const grading=url.pathname==='/mod/assign/view.php'&&url.searchParams.get('action')==='grading';
    const root=document.querySelector('#region-main')||document;
    const patterns=category?['/course/view.php']:course?['/mod/assign/view.php','/mod/quiz/view.php']:
      grading?['/mod/assign/']:[];

    const found=new Map();
    for(const a of root.querySelectorAll('a[href]')){
      let target;
      try{target=new URL(a.href,location.href);}catch{continue;}
      if(target.origin!==location.origin || !patterns.some(path=>target.pathname.includes(path)))continue;
      if(!/^\d+$/.test(target.searchParams.get('id')||'') && !grading)continue;
      const title=(a.getAttribute('data-activityname')||a.textContent||'').trim().replace(/\s+/g,' ').slice(0,130);
      if(!title)continue;
      const key=target.pathname+'?'+target.searchParams.toString();
      if(!found.has(key))found.set(key,{title,url:target.href});
      if(found.size>=80)break;
    }
    if(!found.size){
      const empty=document.createElement('p');
      empty.className='mrm-empty';empty.textContent='Nenhuma atividade encontrada.';
      body.append(empty);return;
    }
    const list=document.createElement('div');list.className='mrm-data-list';
    for(const item of found.values()){
      const row=document.createElement('div');row.className='mrm-data-row';
      const name=document.createElement('span');name.className='mrm-data-name';
      name.textContent=item.title;name.title=item.title;
      const action=document.createElement('a');action.className='mrm-data-action';
      action.href=item.url;action.textContent=category?'Abrir':grading?'Ver':'Abrir';
      row.append(name,action);list.append(row);
    }
    body.append(list);
  }
  m[KEY]={render};
})();
