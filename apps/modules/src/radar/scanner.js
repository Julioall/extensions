// Varredura de pendências ("Precisa de avaliação") por atividade, curso e categoria.
// Toda consulta passa pelo governador (máx. 2 simultâneas, recuo, disjuntor). Falha nunca vira zero.
(function (root) {
  'use strict';
  const { makeError } = root.IMN.governor;
  const NA = root.IMN.cache.NA;

  const DEFAULT_BUDGET = 1500; // consultas de rede por varredura (cabem ~12 cursos cheios); o que sobrar fica "não verificado" e o cache permite continuar

  function createScanner({ governor, cache, fetchDoc, pages = root.IMN.pages, budget = DEFAULT_BUDGET }) {
    const inflight = new Map();
    let used = 0;

    const spend = () => {
      if (used >= budget) throw makeError(`Limite de ${budget} consultas por varredura atingido. Clique em "Tentar só as não verificadas" para continuar do ponto onde parou.`, 'BUDGET', { noRetry: true });
      used += 1;
    };
    const resetBudget = () => { used = 0; };

    // Devolve o número de pendências, ou null quando a atividade não tem controle de avaliação (cache guarda -1).
    function pendingCount(assignment, { force = false } = {}) {
      const id = assignment.assignmentId;
      if (!force) {
        const cached = cache.get(id);
        if (cached !== null) return Promise.resolve(cached === NA ? null : cached);
      }
      if (inflight.has(id)) return inflight.get(id);
      const request = governor.run(async () => {
        spend();
        // Primeiro só o começo da página (resumo); se não resolver, lê a página inteira antes de decidir.
        let { doc } = await fetchDoc(assignment.href, { partial: pages.SUMMARY_PARTIAL });
        let info = pages.parsePendingInfo(doc);
        if (info.kind !== 'count') {
          spend();
          ({ doc } = await fetchDoc(assignment.href));
          info = pages.parsePendingInfo(doc);
        }
        if (info.kind === 'unknown') throw makeError('Resumo da avaliação não confirmou pendências; tarefa encontrada, mas não verificada.', 'PARSE', { noRetry: true });
        return info.kind === 'na' ? null : info.count;
      }).then(count => { cache.set(id, count === null ? NA : count); return count; })
        .finally(() => inflight.delete(id));
      inflight.set(id, request);
      return request;
    }

    // onResult(assignment, { state: 'ok'|'error'|'cancelled', count?, message? }) é chamado a cada atividade.
    async function scanAssignments(assignments, onResult = () => {}, { force = false, maxInflight = Infinity } = {}) {
      const checkOne = async assignment => {
        let result;
        try {
          const count = await pendingCount(assignment, { force });
          result = count === null ? { state: 'na', message: 'Esta atividade não mostra "Precisa de avaliação" (sem envio a corrigir).' } : { state: 'ok', count };
        } catch (error) {
          result = { state: error && error.code === 'CANCELLED' ? 'cancelled' : 'error', message: error && error.message ? error.message : String(error) };
        }
        onResult(assignment, result);
        return { assignment, ...result };
      };
      let results;
      if (Number.isFinite(maxInflight) && maxInflight >= 1) {
        // Demand-driven: do not enqueue every activity of every course.
        results = new Array(assignments.length);
        let cursor = 0;
        const worker = async () => {
          for (;;) {
            const index = cursor++;
            if (index >= assignments.length) return;
            results[index] = await checkOne(assignments[index]);
          }
        };
        await Promise.all(Array.from({ length: Math.min(maxInflight, assignments.length) }, () => worker()));
      } else {
        results = await Promise.all(assignments.map(checkOne));
      }
      return { results, summary: summarize(results) };
    }

    async function scanCourse(course, onResult, { force = false, maxInflight = Infinity, onAssignments = () => {} } = {}) {
      const { doc, finalUrl } = await governor.run(async () => { spend(); return fetchDoc(course.href); });
      const discovered = pages.collectAssignments(doc, finalUrl);
      // Mesmo verificador usado na página do curso. Ao buscar pela categoria, a
      // página inicial do curso pode exibir apenas uma seção; incluir as demais
      // atividades encontradas no índice lateral evita omitir SAPs de outras UCs.
      // Atividades comprovadamente futuras/fechadas continuam excluídas quando
      // há datas visíveis; sem datas, conferimos o resumo e não supomos zero.
      const selection = root.IMN.scope.selectAssignments(discovered, doc, new Date(),
        { restrictSection: false, includeUndated: true, includeIndexUndated: true });
      const assignments = selection.active;
      onAssignments(assignments);
      const scan = await scanAssignments(assignments, onResult, { force, maxInflight });
      return { course, assignments, excludedAssignments: selection.excluded, ...scan };
    }

    return { pendingCount, scanAssignments, scanCourse, resetBudget, get used() { return used; } };
  }

  // Soma só o que foi verificado. errors > 0 significa total PARCIAL (nunca apresentar como completo).
  function summarize(results) {
    const ok = results.filter(r => r.state === 'ok');
    const noControl = results.filter(r => r.state === 'na').length;
    const failed = results.filter(r => r.state !== 'ok' && r.state !== 'na');
    return {
      total: ok.reduce((sum, r) => sum + r.count, 0),
      activitiesPending: ok.filter(r => r.count > 0).length,
      checked: ok.length,
      unverified: failed.length,
      noControl,
      assignmentCount: results.length,
      partial: failed.length > 0
    };
  }

  root.IMN.scanner = { createScanner, summarize, DEFAULT_BUDGET };
})(globalThis);
