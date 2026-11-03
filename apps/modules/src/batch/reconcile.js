// Verificação independente da gravação: GET sem cache (mesmo adaptador HTTP do radar),
// sem reutilizar Document/iframe usado no POST. Nunca infere zero a partir de HTML incompleto.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const MAX_PAGES = 12;
  const WAIT_MS = [0, 550, 1200];
  const key = f => `${f.userId}|${f.field}`;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function same(field, actual, intended) {
    return field === 'grade' ? IMN.grade.sameGrade(actual, intended) : clean(actual) === clean(intended);
  }

  function urlFor(job, page, attempt) {
    const url = new URL(job.url);
    url.searchParams.set('action', 'grading');
    url.searchParams.set('perpage', '500');
    url.searchParams.set('page', String(page));
    // A lista deve incluir todos os alunos, não só os que ainda necessitam de nota.
    url.searchParams.set('status', '');
    url.searchParams.set('_imn_fresh', `${Date.now()}-${attempt}-${page}`);
    return url.href;
  }

  // Reutiliza o mesmo fetchDocument do radar: credentials:include, cache:no-store,
  // validação de domínio e detecção de sessão expirada.
  async function readFresh(job, expected, { fetchDoc, governor, maxPages = MAX_PAGES }) {
    const wanted = new Set(expected.map(f => String(f.userId)));
    const found = new Map();
    const run = fn => governor ? governor.run(fn) : fn();
    let validTables = 0;
    let morePages = false;
    const urls = [];
    for (let page = 0; page < maxPages; page++) {
      const requested = urlFor(job, page, validTables);
      urls.push(requested);
      const { doc, finalUrl } = await run(() => fetchDoc(requested));
      const u = new URL(finalUrl);
      if (!/\/mod\/assign\/view\.php$/.test(u.pathname)) throw new Error('O Moodle redirecionou a verificação para outra página.');
      const table = doc.querySelector('table#submissions');
      if (!table) throw new Error('O Moodle não retornou a tabela de avaliação na nova consulta.');
      validTables++;
      for (const row of IMN.moodle.readRows(doc)) {
        if (wanted.has(String(row.userId))) found.set(String(row.userId), row);
      }
      if ([...wanted].every(id => found.has(id))) break;
      morePages = IMN.moodle.pagination(doc).hasMorePages;
      // Se não há próxima página e os alunos não vieram, não presumimos que a nota seja vazia.
      if (!morePages) break;
    }
    // O tema Moodle pode aplicar filtros de sessão mesmo com status vazio.
    // Consultar a listagem de corrigidos para localizar lançamentos recém-salvos.
    if ([...wanted].some(id => !found.has(id))) {
      for (let page = 0; page < maxPages; page++) {
        const gradedUrl = new URL(urlFor(job, page, validTables));
        gradedUrl.searchParams.set('status', 'graded');
        urls.push(gradedUrl.href);
        const { doc, finalUrl } = await run(() => fetchDoc(gradedUrl.href));
        if (!/\/mod\/assign\/view\.php$/.test(new URL(finalUrl).pathname)) throw new Error('Redirecionamento inesperado ao conferir notas.');
        if (!doc.querySelector('table#submissions')) break;
        for (const row of IMN.moodle.readRows(doc)) if (wanted.has(String(row.userId))) found.set(String(row.userId), row);
        if ([...wanted].every(id => found.has(id)) || !IMN.moodle.pagination(doc).hasMorePages) break;
      }
    }
    return { found, urls, validTables, incomplete: [...wanted].some(id => !found.has(id)), truncated: morePages && validTables >= maxPages };
  }

  function classify(expected, read) {
    const fields = expected.map(e => {
      const record = read.found.get(String(e.userId));
      if (!record) return { ...e, after: '', status: 'nao_verificado', reason: 'Aluno não localizado na consulta atual. Não há prova de falha na gravação.' };
      const after = e.field === 'grade' ? record.gradeText : record.feedbackText;
      if (same(e.field, after, e.to)) return { ...e, after, status: 'conferido', reason: '' };
      return { ...e, after, status: 'divergente', reason: 'A consulta atual retornou um valor diferente do enviado.' };
    });
    return fields;
  }

  function outcomeFor(fields) {
    if (fields.some(f => f.status === 'nao_verificado')) return 'nao_verificada';
    if (fields.some(f => f.status === 'divergente')) return 'divergente';
    return 'conferido';
  }

  // Repetir GET é seguro; repetir POST não é. A consulta final só chama algo de
  // divergente quando houve leitura real do campo em duas respostas consecutivas.
  async function verifySaved(job, expected, { fetchDoc, governor, sleep = ms => new Promise(r => setTimeout(r, ms)), attempts = WAIT_MS.length }) {
    if (!expected.length) return { outcome: 'sem_alteracao', fields: [], message: 'Nenhum campo para conferir.' };
    let lastFields = null;
    let priorFields = null;
    let error = '';
    const urls = [];
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt) await sleep(WAIT_MS[Math.min(attempt, WAIT_MS.length - 1)]);
      try {
        const read = await readFresh(job, expected, { fetchDoc, governor });
        urls.push(...read.urls);
        const fields = classify(expected, read);
        if (fields.every(f => f.status === 'conferido')) return { outcome: 'conferido', fields, message: `${fields.length} campo(s) confirmados em consulta independente ao Moodle.`, urls };
        priorFields = lastFields;
        lastFields = fields;
        error = '';
      } catch (e) { error = e.message || String(e); }
    }
    if (!lastFields) {
      return { outcome: 'nao_verificada', fields: expected.map(e => ({ ...e, after: '', status: 'nao_verificado', reason: error || 'Consulta indisponível.' })), message: `Não foi possível reler a atividade: ${error || 'sem resposta válida'}. Nenhum reenvio foi feito.`, urls };
    }
    const previous = new Map((priorFields || []).map(f => [key(f), f]));
    const fields = lastFields.map(f => {
      if (f.status !== 'divergente') return f;
      const before = previous.get(key(f));
      // A condição de consistência é a mesma linha, o mesmo campo e o mesmo valor
      // divergente em duas consultas independentes. Caso contrário, não confirmado.
      if (!before || before.status !== 'divergente' || !same(f.field, f.after, before.after)) {
        return { ...f, status: 'nao_verificado', reason: 'Consultas não coincidiram; é necessário conferir novamente.' };
      }
      return f;
    });
    const outcome = outcomeFor(fields);
    const notOk = fields.filter(f => f.status !== 'conferido').length;
    return { outcome, fields, message: outcome === 'divergente' ? `${notOk} campo(s) diferentes após duas consultas independentes.` : `${notOk} campo(s) ainda sem confirmação; não reenviar automaticamente.`, urls };
  }

  // Só permite reenvio de campos divergentes cujo valor atual continua igual ao
  // valor anterior à primeira tentativa. Nunca repete campo já conferido ou incerto.
  function safeRetryFields(fields) {
    return fields.filter(f => f.status === 'divergente' && typeof f.from === 'string' && same(f.field, f.after, f.from));
  }

  root.IMN.reconcile = { verifySaved, readFresh, classify, same, safeRetryFields, outcomeFor };
})(globalThis);
