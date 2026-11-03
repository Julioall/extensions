// Correspondência registro × aluno da página. REGRA: só id ou nome exato. Aproximações = sugestão, nunca aplicadas.
(function (root) {
  'use strict';
  const { normalizeText } = root.IMN.text;

  function tokens(name) {
    return normalizeText(name).split(' ').filter(Boolean);
  }

  function similarity(a, b) {
    const A = new Set(tokens(a));
    const B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let shared = 0;
    for (const t of A) if (B.has(t)) shared++;
    return shared / (A.size + B.size - shared);
  }

  function suggest(name, pageRows, limit = 3) {
    return pageRows
      .map(row => ({ row, score: similarity(name, row.name) }))
      .filter(item => item.score >= 0.5)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map(item => ({ userId: item.row.userId, name: item.row.name, score: Math.round(item.score * 100) / 100 }));
  }

  // pageRows: [{ userId, name, ... }]. Retorna { status, row?, reason?, suggestions }.
  // status: 'id' | 'name' | 'not_found' | 'ambiguous' | 'conflict'
  function matchRecord(record, pageRows) {
    if (record.id) {
      const row = pageRows.find(r => String(r.userId) === String(record.id));
      if (!row) return { status: 'not_found', reason: `Nenhum aluno com id ${record.id} nesta listagem.`, suggestions: [] };
      if (record.nome && normalizeText(record.nome) !== normalizeText(row.name)) {
        return { status: 'conflict', row, reason: `O id ${record.id} é de "${row.name}", mas o arquivo diz "${record.nome}".`, suggestions: [] };
      }
      return { status: 'id', row, suggestions: [] };
    }
    const target = normalizeText(record.nome);
    const hits = pageRows.filter(r => normalizeText(r.name) === target);
    if (hits.length === 1) return { status: 'name', row: hits[0], suggestions: [] };
    if (hits.length > 1) {
      return { status: 'ambiguous', reason: `${hits.length} alunos com o mesmo nome; use a coluna id.`, suggestions: hits.map(h => ({ userId: h.userId, name: h.name, score: 1 })) };
    }
    return { status: 'not_found', reason: 'Nome não encontrado nesta listagem.', suggestions: suggest(record.nome, pageRows) };
  }

  root.IMN.match = { matchRecord, similarity, suggest };
})(globalThis);
