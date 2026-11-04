// Leitura de páginas do Moodle (cursos, atividades, tela de avaliação) e consultas HTML com segurança.
// Funções de parsing recebem um Document já pronto, para serem testáveis sem rede.
(function (root) {
  'use strict';
  const { normalizeText } = root.IMN.text;
  const MAX_ASSIGNMENTS_PER_COURSE = 120;
  const MAX_COURSES_PER_CATEGORY = 120; // limite por busca, incluindo paginação

  const PENDING_LABELS = ['precisa de avaliacao', 'necessita avaliacao', 'needs grading', 'requires grading'];

  // Contagem "Precisa de avaliação" do resumo da atividade. null = campo não encontrado (nunca vira 0).
  function parsePendingCount(doc) {
    for (const row of doc.querySelectorAll('.gradingsummarytable tr, table.generaltable tr')) {
      const heading = row.querySelector('th, td:first-child');
      if (!PENDING_LABELS.includes(normalizeText(heading ? heading.textContent : ''))) continue;
      const valueCell = row.querySelector('td:last-child');
      const digits = ((valueCell && valueCell.textContent) || '').replace(/\s+/g, '').match(/\d+/);
      return digits ? Number.parseInt(digits[0], 10) : null;
    }
    return null;
  }

  const PARTICIPANT_LABELS = ['participantes', 'participants'];
  // Linha que fala de avaliação mas não é a de "Enviado para avaliação"/rascunho: se existir e não for reconhecida, é leitura incerta.
  const looksLikeGradingRow = label => /avalia|grading|graded/.test(label) && !/^(enviad|submitt|rascunho|draft)/.test(label);

  // Resumo da atividade: { kind: 'count', count } | { kind: 'na' } | { kind: 'unknown' }.
  // 'na' = a tabela de resumo é reconhecida (tem "Participantes") e NÃO tem linha de avaliação (ex.: tarefa sem envio online).
  // Qualquer dúvida (linha de avaliação com rótulo desconhecido, número ausente, sem tabela) é 'unknown' = Não verificado.
  function parsePendingInfo(doc) {
    let recognized = false;
    let gradingLike = false;
    for (const row of doc.querySelectorAll('.gradingsummarytable tr, table.generaltable tr')) {
      const heading = row.querySelector('th, td:first-child');
      const label = normalizeText(heading ? heading.textContent : '');
      if (PENDING_LABELS.includes(label)) {
        const count = parsePendingCount(doc);
        return count === null ? { kind: 'unknown' } : { kind: 'count', count };
      }
      if (PARTICIPANT_LABELS.includes(label)) recognized = true;
      if (looksLikeGradingRow(label)) gradingLike = true;
    }
    return recognized && !gradingLike ? { kind: 'na' } : { kind: 'unknown' };
  }

  function assignmentIdFromHref(href, base) {
    try {
      const url = new URL(href, base);
      return /\/mod\/assign\/view\.php$/.test(url.pathname) ? url.searchParams.get('id') || '' : '';
    } catch (_) { return ''; }
  }

  function courseIdFromHref(href, base) {
    try {
      const url = new URL(href, base);
      return /\/course\/view\.php$/.test(url.pathname) ? url.searchParams.get('id') || '' : '';
    } catch (_) { return ''; }
  }

  function cleanName(node, fallback) {
    if (!node) return fallback;
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.accesshide, .visually-hidden, .sr-only').forEach(n => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim() || fallback;
  }

  // Atividades "assign" de uma página de curso (ou de um Document baixado).
  // Procura primeiro no conteúdo principal (onde o selo será colocado) e depois na página toda:
  // com "uma seção por página" o miolo mostra só a seção atual e as tarefas aparecem apenas no índice do curso.
  function collectAssignments(doc, baseUrl) {
    const found = new Map();
    const main = doc.querySelector('[role="main"], #region-main');
    const insert = (link, { fromIndex = false, sectionNumber = null } = {}) => {
      if (found.size >= MAX_ASSIGNMENTS_PER_COURSE) return;
      const assignmentId = assignmentIdFromHref(link.getAttribute('href'), baseUrl);
      if (!assignmentId || found.has(assignmentId)) return;
      const card = link.closest('li.activity.modtype_assign, li.activity.assign, .modtype_assign, .activity-item') || link.parentElement;
      const name = cleanName(card?.querySelector('.instancename'), cleanName(link, `Atividade ${assignmentId}`));
      found.set(assignmentId, {
        assignmentId, name, href: new URL(link.getAttribute('href'), baseUrl).href,
        card, link, fromIndex, sectionNumber
      });
    };
    // Primeiro usar as atividades reais da seção exibida. O índice lateral contém
    // cópias dos mesmos links, mas essas cópias não possuem as datas e ficam fora
    // do contêiner da seção. Capturá-las primeiro bloqueava o botão Buscar.
    if (main) {
      for (const link of main.querySelectorAll('li.activity.modtype_assign a[href*="/mod/assign/view.php"], li.activity.assign a[href*="/mod/assign/view.php"], .modtype_assign .activityname a[href*="/mod/assign/view.php"]')) {
        if (link.closest('nav, .breadcrumb, .navbar, header')) continue;
        const section = link.closest('.course-section[data-sectionid]');
        insert(link, { sectionNumber: section?.getAttribute('data-sectionid') || null });
      }
    }
    // Nas páginas onetopic, o índice permite descobrir módulos de outras seções.
    // Só deve complementar o miolo, nunca substituir a referência verdadeira.
    for (const section of doc.querySelectorAll('#courseindex .courseindex-section, .courseindex-section[data-for="section"]')) {
      const sectionNumber = section.getAttribute('data-number');
      for (const link of section.querySelectorAll('a[href*="/mod/assign/view.php"]')) {
        insert(link, { fromIndex: true, sectionNumber });
      }
    }
    // Compatibilidade com temas em que não há índice nem modtype_assign.
    if (!found.size) {
      const scope = main || doc;
      for (const link of scope.querySelectorAll('a[href*="/mod/assign/view.php"]')) {
        if (link.closest('nav, .breadcrumb, .navbar, header')) continue;
        if (link.closest('li.activity.modtype_label, li.activity.label, .modtype_label')) continue;
        insert(link);
      }
    }
    return root.IMN.materials ? root.IMN.materials.attachMaterials(doc, baseUrl, [...found.values()]) : [...found.values()];
  }

  // Cursos listados numa página de categoria.
  function collectCourses(doc, baseUrl) {
    const main = doc.querySelector('[role="main"], #region-main') || doc;
    const found = new Map();
    for (const link of main.querySelectorAll('a[href*="/course/view.php"]')) {
      if (link.closest('nav, .breadcrumb, .navbar, .primary-navigation, .secondary-navigation, .pagination')) continue;
      const courseId = courseIdFromHref(link.getAttribute('href'), baseUrl);
      if (!courseId || found.has(courseId)) continue;
      const card = link.closest('.dashboard-card, [data-region="course-content"], .coursebox, .course-card, li.course');
      const visibleTitle = card?.querySelector('a.coursename[href*="/course/view.php"], .coursename a[href*="/course/view.php"], .course-title a[href*="/course/view.php"]');
      const titleLink = visibleTitle || link;
      const name = cleanName(titleLink, `Curso ${courseId}`);
      found.set(courseId, { courseId, name, href: new URL(link.getAttribute('href'), baseUrl).href, link: titleLink });
      if (found.size >= MAX_COURSES_PER_CATEGORY) break;
    }
    return [...found.values()];
  }

  // Endereços das outras páginas da MESMA categoria, sem entrar em subcategorias
  // nem seguir links externos. Respeita o conjunto de páginas que o Moodle exibe.
  function collectCategoryPages(doc, baseUrl) {
    const base = new URL(baseUrl);
    const isCategory = base.pathname === '/course/index.php';
    const isSearch = base.pathname === '/course/search.php';
    const categoryId = base.searchParams.get('categoryid');
    if (!isSearch && (!isCategory || !/^[1-9]\d*$/.test(categoryId || ''))) return [];
    const links = new Set();
    for (const link of doc.querySelectorAll('.pagination a[href], .paging a[href], a[rel="next"][href]')) {
      try {
        const next = new URL(link.getAttribute('href'), base);
        const page = next.searchParams.get('page');
        if (next.origin !== base.origin || next.pathname !== base.pathname ||
            !/^\d+$/.test(page || '') || Number(page) > 10000) continue;
        if (isCategory && next.searchParams.get('categoryid') !== categoryId) continue;
        if (isSearch &&
            (next.searchParams.get('search') || next.searchParams.get('q') || '') !==
            (base.searchParams.get('search') || base.searchParams.get('q') || '')) continue;
        next.hash = '';
        links.add(next.href);
      } catch (_) { /* link inválido */ }
    }
    return [...links];
  }

  function extractSesskey(doc) {
    const input = doc.querySelector('input[name="sesskey"][value]');
    if (input && input.value) return input.value;
    for (const a of doc.querySelectorAll('a[href*="sesskey="]')) {
      try {
        const value = new URL(a.getAttribute('href'), 'https://x.invalid/').searchParams.get('sesskey');
        if (value) return value;
      } catch (_) { /* tenta o próximo */ }
    }
    const html = (doc.documentElement && doc.documentElement.innerHTML) || '';
    const m = html.match(/M\.cfg\.sesskey\s*=\s*["']([^"']+)["']/i) || html.match(/["']sesskey["']\s*:\s*["']([^"']+)["']/i);
    return m ? m[1] : '';
  }

  function extractPendingUserIds(doc) {
    const ids = new Set();
    for (const row of doc.querySelectorAll('table#submissions tbody tr, .gradingtable table tbody tr')) {
      const box = row.querySelector('input[name="selectedusers"][value], input[id^="selectuser_"][value]');
      const raw = box ? box.value || box.id.replace(/^selectuser_/, '') : '';
      if (/^\d+$/.test(raw)) ids.add(raw);
    }
    return [...ids];
  }

  function looksLikeLogin(finalUrl, html) {
    return /\/login\//.test(finalUrl.pathname) || (/name=["']username["']/i.test(html) && /name=["']password["']/i.test(html));
  }

  // Baixa uma página HTML do MESMO domínio. Erros trazem .status para o governador decidir se tenta de novo.
  // Leitura parcial: para de baixar assim que a tabela de resumo termina (o resto da página do Moodle é grande e não interessa).
  const SUMMARY_PARTIAL = Object.freeze({ marker: 'gradingsummary', end: '</table>' });

  async function readBody(response, partial) {
    if (!partial || !response.body || typeof response.body.getReader !== 'function') return response.text();
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let html = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      const start = html.indexOf(partial.marker);
      const end = start === -1 ? -1 : html.indexOf(partial.end, start);
      if (end !== -1) {
        try { await reader.cancel(); } catch (_) { /* já terminou */ }
        return html.slice(0, end + partial.end.length);
      }
    }
    return html + decoder.decode();
  }

  async function fetchDocument(url, { timeoutMs = 20000, partial = null, fetchImpl = globalThis.fetch, parser = html => new DOMParser().parseFromString(html, 'text/html'), origin = globalThis.location?.origin } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal, headers: { Accept: 'text/html,application/xhtml+xml' } });
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      const finalUrl = new URL(response.url || url, origin);
      if (finalUrl.origin !== origin) throw Object.assign(new Error('Redirecionamento para outro domínio recusado.'), { noRetry: true });
      const html = await readBody(response, partial);
      if (looksLikeLogin(finalUrl, html)) throw Object.assign(new Error('Sessão do Moodle expirada. Entre de novo e atualize.'), { noRetry: true, status: 401 });
      return { doc: parser(html), finalUrl: finalUrl.href };
    } catch (error) {
      if (error && error.name === 'AbortError') throw Object.assign(new Error('Tempo limite excedido.'), { retriable: true });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  root.IMN.pages = {
    parsePendingCount, parsePendingInfo, SUMMARY_PARTIAL, collectAssignments, collectCourses, collectCategoryPages, extractSesskey, extractPendingUserIds,
    fetchDocument, looksLikeLogin, assignmentIdFromHref, courseIdFromHref,
    MAX_ASSIGNMENTS_PER_COURSE, MAX_COURSES_PER_CATEGORY
  };
})(globalThis);
