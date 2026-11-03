// Converte a matriz de linhas do arquivo em registros validados. Sem DOM.
// Cabeçalhos: só nomes exatos (após normalizar). Linha inválida NÃO some: vira registro bloqueado com motivo.
(function (root) {
  'use strict';
  const { normalizeText } = root.IMN.text;
  const { parseGrade, scalePercent } = root.IMN.grade;
  const L = root.IMN.limits;

  const COLUMN_ALIASES = {
    nome: ['nome', 'aluno', 'estudante', 'discente', 'nome do aluno', 'nome completo', 'nome do estudante'],
    id: ['id', 'id moodle', 'userid', 'user id', 'id do usuario', 'id do aluno'],
    nota: ['nota', 'grade', 'pontuacao', 'score', 'nota sugerida', 'nota final', 'pontuacao sugerida'],
    desempenho: ['desempenho 0 100', 'desempenho'],
    feedback: ['feedback', 'comentario', 'comentarios', 'comentario de feedback', 'comentarios de feedback', 'observacao', 'retorno', 'devolutiva'],
    situacao: ['situacao', 'status', 'tag', 'classificacao', 'resultado', 'analise', 'diagnostico']
  };

  const SITUATIONS = [
    { value: '', label: 'Sem tag' },
    { value: 'corrigido', label: 'Corrigido' },
    { value: 'erro_arquivo', label: 'Erro no arquivo' },
    { value: 'sem_conteudo_relevante', label: 'Sem conteúdo relevante' },
    { value: 'revisao_necessaria', label: 'Revisão necessária' },
    { value: 'sem_envio_valido', label: 'Sem envio válido' }
  ];

  const SITUATION_SYNONYMS = {
    corrigido: ['corrigido', 'ok', 'satisfatorio', 'concluido', 'atendido'],
    erro_arquivo: ['erro no arquivo', 'arquivo com erro', 'arquivo invalido', 'arquivo corrompido', 'erro arquivo'],
    sem_conteudo_relevante: ['sem conteudo relevante', 'conteudo irrelevante', 'sem conteudo'],
    revisao_necessaria: ['revisao necessaria', 'precisa revisar', 'requer revisao', 'pendente'],
    sem_envio_valido: ['sem envio valido', 'sem entrega', 'nao enviado']
  };

  function situationLabel(value) {
    return (SITUATIONS.find(item => item.value === value) || SITUATIONS[0]).label;
  }

  // Exato apenas: tag desconhecida vira '' (e gera aviso), nunca "parecida".
  function normalizeSituation(value) {
    const raw = normalizeText(value);
    if (!raw) return '';
    for (const [key, synonyms] of Object.entries(SITUATION_SYNONYMS)) {
      if (synonyms.includes(raw)) return key;
    }
    return '';
  }

  function findHeaderIndex(headers, aliases) {
    return headers.findIndex(header => aliases.includes(header));
  }

  function parseRecords(rows, options = {}) {
    const max = Number.isFinite(options.max) ? options.max : null;
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new Error('Arquivo vazio ou sem linhas de dados. Use a coluna nome (ou id) e ao menos uma de nota, feedback ou situacao.');
    }
    if (rows.length - 1 > L.MAX_RECORDS) throw new Error(`O arquivo tem mais de ${L.MAX_RECORDS} registros.`);

    const headers = rows[0].map(normalizeText);
    const col = {};
    for (const key of Object.keys(COLUMN_ALIASES)) col[key] = findHeaderIndex(headers, COLUMN_ALIASES[key]);

    if (col.nome === -1 && col.id === -1) throw new Error('Cabeçalho obrigatório não encontrado: nome (ou id).');
    if (col.nota === -1 && col.desempenho === -1 && col.feedback === -1 && col.situacao === -1) {
      throw new Error('Inclua ao menos uma coluna de ação: nota, feedback ou situacao.');
    }

    const cell = (row, index) => (index === -1 ? '' : String(row[index] ?? '').trim());
    const records = [];
    const warnings = [];

    rows.slice(1).forEach((row, i) => {
      const rowNumber = i + 2;
      if (!row.some(c => String(c ?? '').trim())) return;
      const issues = [];
      const nome = cell(row, col.nome);
      const idText = cell(row, col.id);
      const notaRaw = cell(row, col.nota);
      const desempenhoRaw = cell(row, col.desempenho);
      const feedback = cell(row, col.feedback);
      const situacaoRaw = cell(row, col.situacao);
      const situacao = normalizeSituation(situacaoRaw);

      if (!nome && !idText) issues.push('Sem nome e sem id.');
      if (idText && !/^\d+$/.test(idText)) issues.push(`id "${idText}" não é numérico.`);

      let grade = { ok: true, empty: true, canonical: '', value: null };
      if (notaRaw && desempenhoRaw) {
        issues.push('Linha tem nota e desempenho ao mesmo tempo; use só um.');
      } else if (notaRaw) {
        grade = parseGrade(notaRaw, { max });
        if (!grade.ok) issues.push(`Nota: ${grade.error}`);
      } else if (desempenhoRaw) {
        const pct = parseGrade(desempenhoRaw, { max: 100 });
        if (!pct.ok) issues.push(`Desempenho: ${pct.error}`);
        else if (max === null) issues.push('Desempenho 0–100 exige a nota máxima da atividade, que não foi lida na página.');
        else grade = { ok: true, empty: false, canonical: scalePercent(pct.value, max), value: Number(scalePercent(pct.value, max)), fromPercent: pct.canonical };
      }

      if (grade.empty && !feedback && !situacao && !issues.length) {
        warnings.push(`Linha ${rowNumber}: nada a aplicar (sem nota, feedback ou situação).`);
      }
      if (situacaoRaw && !situacao) warnings.push(`Linha ${rowNumber}: situação "${situacaoRaw}" não reconhecida; tag ignorada.`);

      records.push({
        rowNumber, nome, id: /^\d+$/.test(idText) ? idText : '',
        notaRaw: notaRaw || desempenhoRaw, grade, feedback, situacao,
        situacaoLabel: situationLabel(situacao), issues
      });
    });

    if (!records.length) throw new Error('Nenhum registro encontrado no arquivo.');

    // Duplicatas: quem aparece duas vezes fica bloqueado nas duas linhas (não dá para saber qual vale).
    const seen = new Map();
    for (const record of records) {
      const key = record.id ? `id:${record.id}` : `n:${normalizeText(record.nome)}`;
      if (!record.id && !record.nome) continue;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(record);
    }
    for (const group of seen.values()) {
      if (group.length > 1) {
        const lines = group.map(r => r.rowNumber).join(', ');
        group.forEach(r => r.issues.push(`Aluno repetido no arquivo (linhas ${lines}).`));
      }
    }
    return { records, warnings };
  }

  const GRADE_ISSUE = /^(Nota:|Desempenho|Linha tem nota)/;

  // Aplica correções feitas pela pessoa na prévia. edits: { [rowNumber]: { grade?: texto, feedback?: texto } }.
  // A nota editada passa pela MESMA validação estrita (formato e nota máxima). Editar é pedido explícito para
  // aquela linha: vale mesmo com "sobrescrever" desligado (forceGrade / forceFeedback).
  function applyEdits(records, edits, { max = null } = {}) {
    return records.map(record => {
      const edit = edits && edits[record.rowNumber];
      if (!edit) return record;
      const out = { ...record, issues: [...record.issues], edited: {} };
      if (Object.prototype.hasOwnProperty.call(edit, 'grade')) {
        out.issues = out.issues.filter(issue => !GRADE_ISSUE.test(issue));
        const grade = parseGrade(edit.grade, { max });
        if (!grade.ok) out.issues.push(`Nota: ${grade.error}`);
        out.grade = grade;
        out.notaRaw = String(edit.grade ?? '').trim();
        out.forceGrade = true;
        out.edited.grade = true;
      }
      if (Object.prototype.hasOwnProperty.call(edit, 'feedback')) {
        out.feedback = String(edit.feedback ?? '').trim();
        out.forceFeedback = true;
        out.edited.feedback = true;
      }
      return out;
    });
  }

  root.IMN.records = { parseRecords, applyEdits, normalizeSituation, situationLabel, SITUATIONS, COLUMN_ALIASES };
})(globalThis);
