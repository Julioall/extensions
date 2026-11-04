// Entrada do radar: curso (course/view.php) ou categoria (course/index.php?categoryid=). Sem MutationObserver.
(function () {
  'use strict';
  const IMN = globalThis.IMN;
  const url = new URL(location.href);
  const isCourse = /\/course\/view\.php$/.test(url.pathname);
  const isCategory = /\/course\/index\.php$/.test(url.pathname) && url.searchParams.has('categoryid');
  // Moodle Moove shows course search results at /course/search.php.
  const isSearch = /\/course\/search\.php$/.test(url.pathname);
  if (!isCourse && !isCategory && !isSearch) return;

  function start(attempt) {
    const deps = IMN.radar.createDeps(window);
    const ui = isCourse ? IMN.radar.initCourse(document, window, deps) : IMN.radar.initCategory(document, window, deps);
    if (ui) {
      if (IMN.batchUi) IMN.batchUi.init(document, window, deps, ui.bar);
      // Iniciar a busca exige clique explícito na lupa.
      return;
    }
    if (attempt < 2) setTimeout(() => start(attempt + 1), 1500); // páginas que montam a lista depois do carregamento
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start(0), { once: true });
  else start(0);
})();
