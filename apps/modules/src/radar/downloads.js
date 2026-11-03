// Download dos envios pendentes ("Requer notas") como ZIPs do próprio Moodle, organizados em pastas.
// Somente lógica: coleta alunos pendentes, pede o ZIP (operação padrão "Baixar selecionados") e monta nomes seguros.
(function (root) {
  'use strict';
  const P = () => root.IMN.pages;

  const PAGE_SIZE = 500;
  const MAX_PAGES = 50;

  function sanitizeSegment(value, fallback = 'Sem nome') {
    const cleaned = String(value ?? '')
      .replace(/[<>:"\\|?*\u0000-\u001F]/g, ' ')
      .replace(/[\/\\]+/g, ' - ')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 90);
    return cleaned || fallback;
  }

  function buildFilename(rootSegments, activityName, count, assignmentId) {
    const base = `${sanitizeSegment(activityName, `Atividade ${assignmentId}`)} - ${count} ${count === 1 ? 'pendente' : 'pendentes'}.zip`;
    return [...rootSegments.map(s => sanitizeSegment(s)), sanitizeSegment(base)].join('/');
  }

  function gradingUrl(assignment, page, origin) {
    const url = new URL('/mod/assign/view.php', origin);
    url.searchParams.set('id', assignment.assignmentId);
    url.searchParams.set('action', 'grading');
    url.searchParams.set('status', 'requiregrading');
    url.searchParams.set('perpage', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    return url.href;
  }

  // Lê, página a página, quem está com envio pendente. Recusa leitura incompleta (nunca baixa "metade" em silêncio).
  async function collectPending(assignment, expected, { fetchDoc, governor, origin }) {
    const selected = new Set();
    const students = new Map();
    let sesskey = '';
    const maxes = new Set();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { doc } = await governor.run(() => fetchDoc(gradingUrl(assignment, page, origin)));
      sesskey = sesskey || P().extractSesskey(doc);
      const ids = P().extractPendingUserIds(doc);
      const grading = root.IMN.moodle;
      if (grading) {
        grading.readPendingStudents(doc).forEach(s => { if (!students.has(s.userId)) students.set(s.userId, s); });
        maxes.add(grading.readMaxGrade(doc)); // null = a página não mostrou a nota máxima com certeza
      }
      const before = selected.size;
      ids.forEach(id => selected.add(id));
      if (Number.isFinite(expected) && selected.size >= expected) break;
      if (!ids.length || selected.size === before) break;
    }
    if (!sesskey) throw new Error(`Chave de segurança não encontrada em "${assignment.name}".`);
    if (!selected.size) throw new Error(`O Moodle informa pendências em "${assignment.name}", mas o filtro "Requer notas" veio vazio.`);
    if (Number.isFinite(expected) && selected.size < expected) {
      throw new Error(`Leitura incompleta de "${assignment.name}": ${selected.size} de ${expected} pendências identificadas.`);
    }
    const max = maxes.size === 1 ? [...maxes][0] : null; // páginas que discordam ou sem leitura certa: vazio, nunca palpite
    return { userIds: [...selected], sesskey, max, students: [...students.values()].filter(s => selected.has(s.userId)) };
  }

  async function requestArchive(item, { fetchImpl = globalThis.fetch, origin, timeoutMs = 120000 }) {
    const body = new URLSearchParams({
      id: item.assignmentId, action: 'gradingbatchoperation', operation: 'downloadselected',
      selectedusers: item.userIds.join(','), returnaction: 'grading', sesskey: item.sesskey
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL('/mod/assign/view.php', origin).href, {
        method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal,
        headers: { Accept: 'application/zip,application/octet-stream,text/html;q=0.8,*/*;q=0.5' }, body
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (new URL(response.url || origin, origin).origin !== origin) throw new Error('Redirecionamento para outro domínio recusado.');
      const type = (response.headers.get('content-type') || '').toLowerCase();
      const disposition = (response.headers.get('content-disposition') || '').toLowerCase();
      if (type.includes('text/html') && !disposition.includes('attachment')) throw new Error('O Moodle não gerou o ZIP dos alunos selecionados.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('O ZIP retornado pelo Moodle está vazio.');
      return blob;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error(`Tempo limite ao gerar o ZIP de "${item.name}".`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  root.IMN.downloads = { sanitizeSegment, buildFilename, gradingUrl, collectPending, requestArchive, PAGE_SIZE };
})(globalThis);
