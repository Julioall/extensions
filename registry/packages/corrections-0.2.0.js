/* Corrections 0.2.0 — teste da arquitetura: diagnóstico somente leitura. */
(() => {
  'use strict';
  if (top !== self) return;
  const KEY = 'corrections';
  const prefix = 'mrm-module-corrections';
  const path = location.pathname;
  const inCourse = path === '/course/view.php' && /^\d+$/.test(new URL(location.href).searchParams.get('id') || '');
  const inCategory = path === '/course/index.php' && /^\d+$/.test(new URL(location.href).searchParams.get('categoryid') || '');
  const inGrading = path === '/mod/assign/view.php' && new URL(location.href).searchParams.get('action') === 'grading';
  if (!inCourse && !inCategory && !inGrading) return;
  function close() { document.getElementById(prefix)?.remove(); }
  function invoke() {
    close();
    const panel = document.createElement('section');
    panel.id = prefix;
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Corrections — diagnóstico');
    Object.assign(panel.style, {position:'fixed',bottom:'106px',right:'24px',zIndex:'2147481001',width:'min(430px,calc(100vw - 32px))',maxHeight:'70vh',overflow:'auto',border:'1px solid #9ba5b1',background:'var(--bs-body-bg,white)',color:'var(--bs-body-color,#202428)',padding:'18px',borderRadius:'14px',boxShadow:'0 10px 40px #0003',font:'14px/1.5 system-ui,sans-serif'});
    const topRow=document.createElement('div');
    Object.assign(topRow.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'});
    const title=document.createElement('strong'); title.textContent='Corrections — diagnóstico';
    const exit=document.createElement('button');exit.type='button';exit.textContent='Fechar';exit.addEventListener('click',close);
    topRow.append(title,exit); panel.append(topRow);
    const note=document.createElement('p');
    note.textContent='Teste do módulo baixado pelo GitHub. Consulta somente os elementos já carregados nesta página; não modifica notas nem envia dados.';
    panel.append(note);
    let links=[];
    if(inGrading) {
      links=[...document.querySelectorAll('#region-main a[href*="pluginfile.php"], #region-main a[href*="/mod/assign/"]')];
    } else if(inCategory){
      links=[...document.querySelectorAll('#region-main a[href*="/course/view.php?id="], .course-list a[href*="/course/view.php?id="]')];
    } else {
      links=[...document.querySelectorAll('#region-main a[href*="/mod/assign/view.php"], #region-main a[href*="/mod/quiz/view.php"], #course-index a[href*="/mod/assign/view.php"], #course-index a[href*="/mod/quiz/view.php"]')];
    }
    const unique=new Set(links.map(a=>{try{const u=new URL(a.href);return u.origin===location.origin?u.pathname+u.search:null;}catch{return null}}).filter(Boolean));
    const result=document.createElement('p');
    result.textContent = inGrading ? 'Links da atividade encontrados: '+unique.size :
      inCategory ? 'Cursos exibidos nesta página da categoria: '+unique.size :
      'Atividades de tarefa/quiz identificadas no curso: '+unique.size;
    panel.append(result);
    const warning=document.createElement('p');
    warning.textContent='A busca completa de pendências, importação CSV/XLSX e download dos envios serão migrados depois para os serviços seguros do Modules.';
    warning.style.fontSize='12px'; warning.style.opacity='.8'; panel.append(warning);
    document.body.append(panel);exit.focus();
  }
  globalThis.__mrmModules ||= Object.create(null);
  globalThis.__mrmModules[KEY] = {invoke, dispose:close};
})();
