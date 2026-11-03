/* Menu radial compartilhado entre duas extensões Chrome independentes.
 * NÃO utiliza APIs da outra extensão: os botões originais, já ligados a suas
 * funções, são acionados diretamente apenas quando a rota e a UI permitem.
 * O mesmo arquivo é incluído nas duas extensões; o ID único impede duplicação.
 */
(() => {
  'use strict';
  if (window.top !== window) return; // nenhuma ferramenta sobre os iframes de consulta
  const ID = 'moodle-tools-radial';
  if (document.getElementById(ID)) return;

  const items = [
    { id: 'scan', title: 'Corrections · Buscar pendências', selector: '.imn-root.imn-bar .imn-refresh', path: 'radar', icon: 'search' },
    { id: 'download', title: 'Corrections · Baixar envios pendentes', selector: '.imn-root.imn-bar .imn-download', path: 'radar', icon: 'download' },
    { id: 'import', title: 'Corrections · Importar notas', path: 'import', icon: 'upload' },
    { id: 'dates', title: 'Dates · Ajustar datas dos módulos', selector: '#mod-date-button', path: 'course', icon: 'calendar' }
  ];
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 5 5"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18m8 5h6m-3-3v6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>'
  };
  function svg(name) {
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
  }
  function validRoute(type) {
    const u = new URL(location.href);
    const course = u.pathname === '/course/view.php' && /^[1-9]\d*$/.test(u.searchParams.get('id') || '');
    const category = u.pathname === '/course/index.php' && /^[1-9]\d*$/.test(u.searchParams.get('categoryid') || '');
    if (type === 'course') return course;
    if (type === 'radar') return course || category;
    if (type === 'grading') return u.pathname === '/mod/assign/view.php' && u.searchParams.get('action') === 'grading';
    if (type === 'import') return course || category || validRoute('grading');
    return false;
  }
  // Uma única opção: no curso/categoria importa lote; na avaliação abre a atividade.
  // Uma rota sem a ferramenta correspondente mantém a opção cinza/desabilitada.
  function getTarget(item) {
    if (item.id === 'import') {
      if (validRoute('grading')) return {
        element: document.querySelector('.imn-launcher'),
        title: 'Corrections · Importar notas da atividade'
      };
      if (validRoute('radar')) return {
        element: document.querySelector('.imn-root.imn-bar .imn-batch-open'),
        title: 'Corrections · Importar CSV/XLSX'
      };
      return { element: null, title: item.title };
    }
    return {
      element: validRoute(item.path) ? document.querySelector(item.selector) : null,
      title: item.title
    };
  }
  function create() {
    if (document.getElementById(ID) || !document.body) return;
    const root = document.createElement('div');
    root.id = ID;
    root.className = 'mrm-root';
    root.setAttribute('aria-label', 'Modules — Ferramentas Moodle');
    const list = document.createElement('div');
    list.className = 'mrm-items';
    list.id = 'moodle-tools-radial-items';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Atalhos dos módulos Corrections e Dates');
    list.setAttribute('aria-hidden', 'true');
    list.inert = true;
    // Leque no quadrante superior esquerdo para não extrapolar o viewport.
    const radius = 89; // 50% mais próximo do botão principal (antes: 177 px)
    items.forEach((item, index) => {
      const angle = (180 + index * (96 / (items.length - 1))) * Math.PI / 180;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mrm-action';
      button.dataset.radialAction = item.id;
      button.setAttribute('aria-label', item.title);
      button.title = `${item.title} (indisponível nesta página)`;
      button.disabled = true;
      button.style.setProperty('--mrm-x', `${Math.round(Math.cos(angle) * radius)}px`);
      button.style.setProperty('--mrm-y', `${Math.round(Math.sin(angle) * radius)}px`);
      button.style.setProperty('--mrm-delay', `${index * 30}ms`);
      button.innerHTML = svg(item.icon) + `<span class="mrm-tip" aria-hidden="true">${item.title}</span>`;
      button.addEventListener('click', event => {
        event.preventDefault();
        if (button.disabled || !validRoute(item.path)) return;
        const { element: original } = getTarget(item);
        if (!original || original.disabled || !original.isConnected) return;
        close();
        // Clique sincronizado: preserva a ativação do usuário para file input.
        original.click();
      });
      list.append(button);
    });
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mrm-toggle';
    toggle.id = 'moodle-tools-radial-toggle';
    toggle.title = 'Modules — Ferramentas Moodle';
    toggle.setAttribute('aria-label', 'Abrir Modules — ferramentas Moodle');
    toggle.setAttribute('aria-controls', list.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = svg('plus');
    root.append(list, toggle);
    document.body.append(root);

    function setOpen(isOpen) {
      root.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Fechar Modules — ferramentas Moodle' : 'Abrir Modules — ferramentas Moodle');
      list.setAttribute('aria-hidden', String(!isOpen));
      list.inert = !isOpen;
      if (isOpen) refresh();
    }
    function close() { setOpen(false); }
    toggle.addEventListener('click', () => setOpen(!root.classList.contains('is-open')));
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !root.classList.contains('is-open')) return;
      close(); toggle.focus();
    });
    document.addEventListener('pointerdown', event => {
      if (root.classList.contains('is-open') && !root.contains(event.target)) close();
    }, true);

    function refresh() {
      for (const item of items) {
        const button = list.querySelector(`[data-radial-action="${item.id}"]`);
        const target = getTarget(item);
        const original = target.element;
        const enabled = Boolean(original && original.isConnected && !original.disabled);
        if (button.disabled !== !enabled) button.disabled = !enabled;
        const title = enabled ? target.title : `${item.title} (indisponível nesta página)`;
        if (button.title !== title) button.title = title;
        button.setAttribute('aria-label', title);
        const tip = button.querySelector('.mrm-tip');
        if (tip.textContent !== title) tip.textContent = title;
        button.setAttribute('aria-disabled', String(!enabled));
      }
    }
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (root.isConnected) refresh(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', create, { once: true });
  else create();
})();
