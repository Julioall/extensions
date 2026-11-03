// Plano de importação: compara "atual → novo" e decide o que pode ser aplicado. Sem DOM.
(function (root) {
  'use strict';
  const { matchRecord } = root.IMN.match;
  const { formatGrade, sameGrade } = root.IMN.grade;

  const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim();

  // options: { overwriteGrade=false, overwriteFeedback=false, decimal='.' }
  function buildPlan(records, pageRows, options = {}) {
    const decimal = options.decimal || '.';
    const items = [];
    const targetCount = new Map();

    for (const record of records) {
      const match = matchRecord(record, pageRows);
      const item = { record, match, row: match.row || null, changes: [], skipped: [], status: 'blocked', reasons: [...record.issues] };
      if (!match.row) item.reasons.push(match.reason);
      else if (match.status === 'conflict') item.reasons.push(match.reason);
      else targetCount.set(match.row.userId, (targetCount.get(match.row.userId) || 0) + 1);
      items.push(item);
    }

    for (const item of items) {
      if (item.reasons.length || !item.row || item.match.status === 'conflict') continue;
      if (targetCount.get(item.row.userId) > 1) {
        item.reasons.push('Mais de uma linha do arquivo aponta para o mesmo aluno da página.');
        continue;
      }
      const { record, row } = item;

      if (!record.grade.empty) {
        const to = formatGrade(record.grade.canonical, decimal);
        if (sameGrade(row.gradeText, record.grade.canonical)) item.skipped.push({ field: 'grade', reason: 'já está com este valor' });
        else if (clean(row.gradeText) && !options.overwriteGrade && !record.forceGrade) item.skipped.push({ field: 'grade', reason: `já tem nota (${clean(row.gradeText)}); sobrescrita desligada` });
        else item.changes.push({ field: 'grade', from: clean(row.gradeText), to });
      }
      if (record.feedback) {
        if (clean(row.feedbackText) === clean(record.feedback)) item.skipped.push({ field: 'feedback', reason: 'já está com este texto' });
        else if (clean(row.feedbackText) && !options.overwriteFeedback && !record.forceFeedback) item.skipped.push({ field: 'feedback', reason: 'já tem feedback; sobrescrita desligada' });
        else item.changes.push({ field: 'feedback', from: clean(row.feedbackText), to: record.feedback });
      }
      item.status = item.changes.length ? 'ready' : 'unchanged';
    }

    const summary = { total: items.length, ready: 0, unchanged: 0, blocked: 0, grades: 0, feedbacks: 0 };
    for (const item of items) {
      summary[item.status]++;
      for (const change of item.changes) summary[change.field === 'grade' ? 'grades' : 'feedbacks']++;
    }
    const matched = new Set(items.filter(i => i.row).map(i => i.row.userId));
    const missingFromFile = pageRows.filter(r => !matched.has(r.userId)).map(r => ({ userId: r.userId, name: r.name }));
    return { items, summary, missingFromFile };
  }

  // Lista serializável do que foi pedido para gravar (guardada entre o clique em Salvar e o recarregamento).
  function toExpected(plan) {
    const expected = [];
    for (const item of plan.items) {
      if (item.status !== 'ready') continue;
      for (const change of item.changes) {
        expected.push({ userId: String(item.row.userId), name: item.row.name, field: change.field, to: change.to });
      }
    }
    return expected;
  }

  // Leitura de volta: compara o pedido com o que o Moodle mostra depois de salvar.
  // readBack: Map userId -> { gradeText, feedbackText }. Retorna divergências; vazio = tudo confere.
  function verifyExpected(expected, readBack) {
    const problems = [];
    for (const want of expected) {
      const seen = readBack.get(String(want.userId));
      if (!seen) {
        problems.push({ ...want, actual: '', reason: 'Aluno não encontrado na releitura (outra página ou filtro?).' });
        continue;
      }
      const actual = want.field === 'grade' ? seen.gradeText : seen.feedbackText;
      const ok = want.field === 'grade' ? sameGrade(actual, want.to) : clean(actual) === clean(want.to);
      if (!ok) problems.push({ ...want, actual: clean(actual), reason: 'O valor salvo é diferente do enviado.' });
    }
    return problems;
  }

  const verifyPlan = (plan, readBack) => verifyExpected(toExpected(plan), readBack);

  root.IMN.plan = { buildPlan, toExpected, verifyExpected, verifyPlan };
})(globalThis);
