// Interface do radar de pendências: selos por atividade (curso) ou por curso (categoria), resumo e download.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const h = IMN.dom.h;
  const icon = IMN.icons.make;

  function pageName(doc, fallback) {
    for (const selector of ['.page-header-headings h1', '.page-context-header h1', '#page-header h1', '[role="main"] h1', 'h1']) {
      const text = ((doc.querySelector(selector) || {}).textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return fallback;
  }

  function badgeText(result) {
    if (!result) return 'Verificando…';
    if (result.state === 'ok') return result.count === 0 ? 'Em dia' : `${result.count} pendente${result.count === 1 ? '' : 's'}`;
    if (result.state === 'empty') return 'Sem tarefas';
    if (result.state === 'na') return 'Sem contagem';
    return 'Não verificado';
  }
  function badgeTone(result) {
    if (!result) return 'loading';
    if (result.state === 'na') return 'na'; // informativo (azul): não há o que corrigir ali, mas também não é "zero verificado"
    if (result.state !== 'ok') return 'error'; // 'empty' e 'error': âmbar, nunca verde
    return result.count > 0 ? 'pending' : 'clear';
  }

  function setBadge(badge, result, detail) {
    badge.hidden = false;
    badge.textContent = badgeText(result);
    badge.className = `imn-badge imn-badge-${badgeTone(result)}`;
    badge.title = result && result.state !== 'ok' ? (result.message || 'Não foi possível verificar.') : (detail || '');
  }

  function summaryText(summary) {
    if (summary.total > 0) {
      const found = `${summary.total} ${summary.total === 1 ? 'envio pendente' : 'envios pendentes'} em ${summary.activitiesPending} ${summary.activitiesPending === 1 ? 'atividade' : 'atividades'}`;
      return summary.unverified ? `${found} · ${summary.unverified} sem conferir` : found;
    }
    if (summary.unverified) return `Nenhuma pendência confirmada · ${summary.unverified} sem conferir`;
    if (summary.noControl) return `Nenhuma pendência confirmada · ${summary.noControl} sem informação`;
    return 'Nenhum envio pendente';
  }

  function createBar(doc, title) {
    const status = h(doc, 'span', { class: 'imn-bar-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, '');
    const statusIcon = null;
    const detail = h(doc, 'div', { class: 'imn-bar-detail', hidden: true });
    const refresh = h(doc, 'button', {
      type: 'button', class: 'imn-btn imn-primary imn-icon-button imn-refresh',
      title: 'Buscar pendências', 'aria-label': 'Buscar pendências'
    }, icon(doc, 'search'));
    const download = h(doc, 'button', {
      type: 'button', class: 'imn-btn imn-primary imn-icon-button imn-download', disabled: true,
      title: 'Baixar pendentes', 'aria-label': 'Baixar pendentes'
    }, icon(doc, 'download'));
    const el = h(doc, 'section', { class: 'imn-root imn-bar imn-toolbar', 'aria-label': title, 'aria-busy': 'false' },
      h(doc, 'div', { class: 'imn-radar-main' },
        h(doc, 'div', { class: 'imn-bar-row', role: 'group', 'aria-label': 'Ações de correção' }, refresh, download),
        h(doc, 'div', { class: 'imn-radar-status' }, status)),
      detail);
    return { el, status, detail, refresh, download };
  }

  // Na página de curso, usar a mesma área do cabeçalho que o Moodle reserva para ações.
  // Em temas sem cabeçalho, preservar a inserção no conteúdo.
  function mountBar(doc, bar) {
    const header = doc.querySelector('#page-header');
    if (header) { header.append(bar.el); return; }
    const main = doc.querySelector('[role="main"], #region-main') || doc.body;
    main.prepend(bar.el);
  }

  function showDetail(bar, doc, nodes) {
    bar.detail.hidden = false;
    bar.detail.replaceChildren(...nodes.flat().filter(Boolean));
  }

  // Composição: o radar somente apresenta leitura e invoca o caso de uso de pacotes.
  function offerDownloads(context) {
    return IMN.packageFlow.open({ ...context, showDetail });
  }

  // Linha de status que mostra a pausa do disjuntor por cima do progresso (o progresso não apaga o aviso de pausa).
  function makeStatus(deps, bar, progressText) {
    let pausedText = '';
    const refresh = () => { bar.status.textContent = pausedText || progressText(); };
    if (deps.governor.onEvent) {
      deps.governor.onEvent(event => {
        if (event.type === 'pause') {
          const seconds = Math.max(1, Math.round((event.resumeAt - Date.now()) / 1000));
          pausedText = `Moodle ocupado. Retomando em ${seconds} s…`;
        } else pausedText = '';
        refresh();
      });
    }
    return { refresh, clear() { pausedText = ''; } };
  }

  const toastTokens = new WeakMap();
  function flash(bar, message, win) {
    const token = (toastTokens.get(bar) || 0) + 1;
    toastTokens.set(bar, token);
    bar.status.textContent = message;
    win.setTimeout(() => { if (toastTokens.get(bar) === token && bar.el.getAttribute('aria-busy') !== 'true') bar.status.textContent = ''; }, 5000);
  }

  // O mesmo botão alterna entre busca e atualização enquanto a operação está ativa.
  function setSearchBusy(bar, busy) {
    const btn = bar.refresh;
    btn.replaceChildren(icon(btn.ownerDocument, busy ? 'refresh' : 'search'));
    btn.classList.toggle('imn-searching', busy);
    btn.disabled = busy;
    const label = busy ? 'Atualizando pendências' : 'Buscar pendências';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function initCourse(doc, win, deps) {
    const url = win.location.href;
    const discovered = deps.pages.collectAssignments(doc, url);
    if (!discovered.length) return null;
    // Apenas tarefas da seção atual e comprovadamente abertas no Moodle.
    // Tiles and single-section courses can expose tasks only in the index.
    // Verify each grading summary before marking any item as pending.
    const selection = IMN.scope.selectAssignments(discovered, doc, new Date(),
      { restrictSection: false, includeUndated: true, includeIndexUndated: true });
    const assignments = selection.active;
    const bar = createBar(doc, 'Correção de atividades');
    mountBar(doc, bar);
    const badges = new Map();
    for (const a of assignments) {
      const badge = h(doc, 'span', { class: 'imn-badge imn-badge-loading', hidden: true }, 'Verificando…');
      badges.set(a.assignmentId, badge);
      (a.link.parentElement || a.card).append(' ', badge);
    }
    let last = null;
    let finished = 0;
    const progressText = () => `Buscando… ${finished}/${assignments.length}`;
    const status = makeStatus(deps, bar, progressText);
    if (!assignments.length) bar.status.textContent = 'Nenhuma atividade elegível identificada.';
    else if (selection.excluded.undated) bar.status.textContent = `${assignments.length} atividades para conferir · ${selection.excluded.undated} sem datas visíveis.`;

    // Busca manual: somente a lupa dispara a varredura.
    async function scan(force) {
      setSearchBusy(bar, true);
      try {
      bar.refresh.disabled = true; bar.download.disabled = true;
      bar.refresh.classList.remove('imn-primary', 'imn-success');
      bar.download.classList.remove('imn-primary');
      bar.el.querySelector('.imn-batch-open')?.classList.remove('imn-primary');
      bar.detail.hidden = true;
      bar.el.dataset.searched = 'true';
      bar.el.setAttribute('aria-busy', 'true');
      deps.scanner.resetBudget();
      deps.governor.reset();
      if (force) deps.cache.clear(assignments.map(a => a.assignmentId));
      assignments.forEach(a => setBadge(badges.get(a.assignmentId), null));
      finished = 0;
      status.clear(); status.refresh();
      const scan = await deps.scanner.scanAssignments(assignments, (a, r) => { finished += 1; setBadge(badges.get(a.assignmentId), r); status.refresh(); }, { force });
      last = scan;
      status.clear();
      deps.lastSummaryText = `${summaryText(scan.summary)}${selection.excluded.undated ? ` · ${selection.excluded.undated} sem datas visíveis` : ''}`;
      bar.el.setAttribute('aria-busy', 'false');
      flash(bar, deps.lastSummaryText, win);
      bar.refresh.disabled = false;
      bar.download.disabled = !scan.results.some(r => r.state === 'ok' && r.count > 0);
      bar.refresh.classList.add('imn-success');
      (bar.download.disabled ? bar.refresh : bar.download).classList.add('imn-primary');
      return scan;
      } finally {
        setSearchBusy(bar, false);
        bar.el.setAttribute('aria-busy', 'false');
      }
    }

    bar.refresh.disabled = assignments.length === 0;
    bar.refresh.addEventListener('click', () => scan(true)); // Não existe busca automática no carregamento.
    bar.download.addEventListener('click', () => {
      if (!last) return;
      const folder = pageName(doc, 'Curso');
      const entries = last.results.filter(r => r.state === 'ok' && r.count > 0).map(r => ({ assignment: r.assignment, count: r.count, folders: [folder], courseId: new URL(win.location.href).searchParams.get('id') || '', courseName: folder }));
      offerDownloads({ doc, win, bar, deps, entries, unverified: last.summary.unverified });
    });
    return { bar, badges, scan, assignments };
  }

  function initCategory(doc, win, deps) {
    const discovered = deps.pages.collectCourses(doc, win.location.href);
    if (!discovered.length) return null;
    // Busca manual na categoria: conferir todos os cursos listados, mesmo que
    // não exibam um selo 'Em andamento' (o layout do Moodle nem sempre exibe).
    const courses = [...discovered];
    const ids = new Set(courses.map(c => c.courseId));
    const MAX_PAGES = 12;
    let paginationIncomplete = false;
    const bar = createBar(doc, 'Correção de atividades');
    mountBar(doc, bar);
    const badges = new Map();
    for (const c of courses) {
      const badge = h(doc, 'span', { class: 'imn-badge imn-badge-loading', hidden: true }, 'Verificando…');
      badges.set(c.courseId, badge);
      (c.link.parentElement || c.link).append(' ', badge);
    }
    let last = [];
    const progress = { courses: 0, acts: 0, actsDone: 0 };
    const progressText = () => `Buscando… ${progress.courses}/${courses.length} cursos · ${progress.actsDone}/${progress.acts} atividades`;
    const status = makeStatus(deps, bar, progressText);
    if (!courses.length) bar.status.textContent = 'Nenhum curso encontrado nesta categoria.';
    else bar.status.textContent = `${courses.length} cursos encontrados. Clique na lupa para conferir as pendências.`;

    async function scan(force) {
      setSearchBusy(bar, true);
      try {
      bar.refresh.disabled = true; bar.download.disabled = true;
      bar.refresh.classList.remove('imn-primary', 'imn-success');
      bar.download.classList.remove('imn-primary');
      bar.el.querySelector('.imn-batch-open')?.classList.remove('imn-primary');
      bar.detail.hidden = true;
      bar.el.dataset.searched = 'true';
      bar.el.setAttribute('aria-busy', 'true');
      deps.scanner.resetBudget();
      deps.governor.reset();
      Object.assign(progress, { courses: 0, acts: 0, actsDone: 0 });
      // Percorrer paginação apenas depois do clique, sempre na mesma categoria.
      // As páginas são lidas em background e compartilhamos a fila de consultas.
      const collectPages = deps.pages.collectCategoryPages || (() => []);
      const maxCourses = deps.pages.MAX_COURSES_PER_CATEGORY || 120;
      const seenPages = new Set([new URL(win.location.href).href]);
      const pendingPages = collectPages(doc, win.location.href);
      let readPages = 0;
      paginationIncomplete = false;
      while (pendingPages.length && readPages < MAX_PAGES && courses.length < maxCourses) {
        const nextUrl = pendingPages.shift();
        if (seenPages.has(nextUrl)) continue;
        seenPages.add(nextUrl);
        try {
          const { doc: pageDoc, finalUrl } = await deps.governor.run(() => deps.fetchDoc(nextUrl));
          readPages += 1;
          for (const course of deps.pages.collectCourses(pageDoc, finalUrl)) {
            if (ids.has(course.courseId)) continue;
            ids.add(course.courseId);
            if (courses.length >= maxCourses) { paginationIncomplete = true; break; }
            courses.push(course);
          }
          for (const href of collectPages(pageDoc, finalUrl)) {
            if (!seenPages.has(href) && !pendingPages.includes(href)) pendingPages.push(href);
          }
          bar.status.textContent = `${courses.length} cursos identificados na categoria…`;
        } catch (error) {
          // Página indisponível não é equivalente a ausência de pendências.
          paginationIncomplete = true;
        }
      }
      if (pendingPages.length || courses.length >= maxCourses) paginationIncomplete = true;
      status.clear(); status.refresh();
      // Demand-driven queue: inspect at most two courses simultaneously.
      // Start another course only when one of the current two finishes.
      const inspectCourse = async course => {
        const badge = badges.get(course.courseId) || null; // curso de outra página
        if (badge) setBadge(badge, null);
        let total = 0; let finishedHere = 0;
        try {
          const r = await deps.scanner.scanCourse(course, () => {
            finishedHere += 1; progress.actsDone += 1;
            if (total && badge) badge.textContent = `Verificando… ${finishedHere}/${total}`;
            status.refresh();
          }, { force, maxInflight: 1, onAssignments: list => {
            total = list.length;
            progress.acts += list.length;
            if (badge) badge.textContent = `Verificando… 0/${total}`;
            status.refresh();
          } });
          const s = r.summary;
          let result;
          let detail = '';
          if (s.assignmentCount === 0) {
            result = { state: 'empty', message: 'Nenhuma tarefa de envio identificada neste curso.' };
            r.skipped = true;
          } else if (s.partial && s.total === 0) {
            // total parcial igual a 0 não pode virar "Sem pendências": o que falhou pode ter pendência
            result = { state: 'error', message: `${s.unverified} atividade(s) não verificada(s).` };
          } else if (s.checked === 0 && s.noControl > 0) {
            result = { state: 'error', message: `undefined tarefa(s) identificada(s), mas sem resumo de avaliação verificável.` };
          } else {
            result = { state: 'ok', count: s.total };
            detail = s.partial ? `${s.unverified} atividade(s) não verificada(s): total parcial.` : `${s.activitiesPending} de ${s.assignmentCount} atividade(s) com pendência.`;
          }
          if (badge) setBadge(badge, result, detail);
          if (badge && s.partial && result.state === 'ok') { badge.textContent += ' · parcial'; badge.title = `${s.unverified} atividades não conferidas.`; }
          return r;
        } catch (error) {
          if (badge) setBadge(badge, { state: 'error', message: error.message });
          return { course, assignments: [], results: [], summary: null, error };
        } finally {
          progress.courses += 1;
          status.refresh();
        }
      };
      const done = new Array(courses.length);
      let nextCourse = 0;
      const courseWorker = async () => {
        for (;;) {
          const index = nextCourse++;
          if (index >= courses.length) return;
          done[index] = await inspectCourse(courses[index]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, courses.length) }, () => courseWorker()));
      last = done;
      const sums = done.filter(r => r.summary).map(r => r.summary);
      const agg = {
        total: sums.reduce((s, x) => s + x.total, 0),
        activitiesPending: sums.reduce((s, x) => s + x.activitiesPending, 0),
        noControl: sums.reduce((s, x) => s + (x.noControl || 0), 0),
        unverified: sums.reduce((s, x) => s + x.unverified, 0) + done.filter(r => !r.summary).length
      };
      agg.partial = agg.unverified > 0 || paginationIncomplete;
      status.clear();
      deps.lastSummaryText = `${summaryText(agg)} · ${courses.length} cursos${paginationIncomplete ? ' · lista de cursos incompleta (limite ou página indisponível)' : ''}`;
      bar.el.setAttribute('aria-busy', 'false');
      flash(bar, deps.lastSummaryText, win);
      bar.refresh.disabled = false;
      bar.download.disabled = !done.some(r => r.results.some(x => x.state === 'ok' && x.count > 0));
      bar.refresh.classList.add('imn-success');
      (bar.download.disabled ? bar.refresh : bar.download).classList.add('imn-primary');
      return done;
      } finally {
        setSearchBusy(bar, false);
        bar.el.setAttribute('aria-busy', 'false');
      }
    }

    bar.refresh.disabled = courses.length === 0;
    bar.refresh.addEventListener('click', () => scan(true)); // Não existe busca automática no carregamento.
    bar.download.addEventListener('click', () => {
      const category = pageName(doc, 'Categoria');
      const entries = last.flatMap(r => r.results.filter(x => x.state === 'ok' && x.count > 0).map(x => ({ assignment: x.assignment, count: x.count, folders: [category, r.course.name], courseId: r.course.courseId, courseName: r.course.name })));
      const unverified = last.reduce((s, r) => s + (r.summary ? r.summary.unverified : 1), 0);
      offerDownloads({ doc, win, bar, deps, entries, unverified });
    });
    return { bar, badges, scan, courses };
  }

  function createDeps(win) {
    // Category/search page: one request initially, at most two active,
    // 450ms between starts, with retries/backoff. Course page unchanged.
    const path = new URL(win.location.href).pathname;
    const isCourseList = path === '/course/index.php' || path === '/course/search.php';
    const governor = IMN.governor.createGovernor(isCourseList ? {
      maxConcurrent: 2, initialConcurrent: 1, minIntervalMs: 450,
      growAfter: 10, retryDelaysMs: [1500, 4000, 10000],
      isTabHidden: () => false,
    } : {});
    const cache = IMN.cache.createCache({ origin: () => win.location.origin });
    const fetchDoc = (url, options = {}) => IMN.pages.fetchDocument(url, { origin: win.location.origin, ...options });
    const scanner = IMN.scanner.createScanner({ governor, cache, fetchDoc });
    win.addEventListener('pagehide', () => governor.cancel());
    return { governor, cache, fetchDoc, scanner, pages: IMN.pages, downloads: IMN.downloads, lastSummaryText: '' };
  }

  root.IMN.radar = { initCourse, initCategory, createDeps, summaryText, badgeText };
})(globalThis);
