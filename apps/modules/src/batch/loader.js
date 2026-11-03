// Lê a tela de avaliação de cada atividade citada no CSV (somente leitura, pelo governador).
(function (root) {
  'use strict';
  const IMN = root.IMN;

  const PAGE_SIZE = 500;

  function activityUrl(cmid, origin) {
    const url = new URL('/mod/assign/view.php', origin);
    url.searchParams.set('id', String(cmid));
    url.searchParams.set('action', 'grading');
    url.searchParams.set('perpage', String(PAGE_SIZE));
    return url.href;
  }

  const text = el => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();

  function titleOf(doc, fallback) {
    for (const selector of ['.page-header-headings h1', '.page-context-header h1', '#page-header h1', '[role="main"] h1', 'h1']) {
      const t = text(doc.querySelector(selector));
      if (t) return t;
    }
    return fallback;
  }

  function courseOf(doc) {
    const link = [...doc.querySelectorAll('.breadcrumb a[href*="/course/view.php"], nav[aria-label] a[href*="/course/view.php"]')].pop();
    return text(link);
  }

  // Devolve { cmid, url, name, course, rows, max, decimal, files, hasMorePages } ou { cmid, url, error }.
  async function loadActivity(cmid, { fetchDoc, governor, origin }) {
    const url = activityUrl(cmid, origin);
    try {
      const { doc, finalUrl } = await governor.run(() => fetchDoc(url));
      const M = IMN.moodle;
      const ready = M.readiness(doc, { href: finalUrl });
      const name = titleOf(doc, `Atividade ${cmid}`);
      if (!ready.isAssign || !ready.isGrading) return { cmid, url, name, error: 'O Moodle não abriu a tela de avaliação desta atividade (id inválido ou sem permissão).' };
      if (!ready.ok) return { cmid, url, name, error: ready.problem };
      return {
        cmid, url, name, course: courseOf(doc), rows: M.readRows(doc), max: M.readMaxGrade(doc), decimal: M.decimalSeparator(doc),
        files: M.readSubmissionFiles(doc), hasMorePages: M.pagination(doc).hasMorePages
      };
    } catch (error) {
      return { cmid, url, error: error && error.message ? error.message : 'Falha ao ler a atividade.' };
    }
  }

  root.IMN.batchLoader = { activityUrl, loadActivity, PAGE_SIZE };
})(globalThis);
