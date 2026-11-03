// Lançamento em lote (várias atividades de uma vez). Sem DOM.
// O CSV traz atividade_id e id do aluno (vindos do manifesto do pacote baixado): o casamento é por id, nunca por nome.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const { normalizeText, csvCell } = IMN.text;
  const L = IMN.limits;

  const ACTIVITY_ALIASES = ['atividade id', 'id da atividade', 'id atividade', 'cmid'];
  const MAX_ACTIVITIES = 30;
  const NO_GRADE_SITUATIONS = ['erro_arquivo', 'sem_envio_valido', 'sem_conteudo_relevante'];

  const isId = value => /^\d+$/.test(String(value ?? '').trim());

  // Separa as linhas do arquivo por atividade. Linha sem atividade_id ou sem id do aluno NÃO some: vai para "rejected".
  function splitByActivity(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('Arquivo vazio ou sem linhas de dados.');
    if (rows.length - 1 > L.MAX_RECORDS) throw new Error(`O arquivo tem mais de ${L.MAX_RECORDS} registros.`);
    const headers = rows[0].map(normalizeText);
    const col = key => headers.findIndex(h => IMN.records.COLUMN_ALIASES[key].includes(h));
    const actCol = headers.findIndex(h => ACTIVITY_ALIASES.includes(h));
    const idCol = col('id');
    if (actCol === -1) throw new Error('Cabeçalho obrigatório não encontrado: atividade_id (veja o manifesto.csv do pacote).');
    if (idCol === -1) throw new Error('Cabeçalho obrigatório não encontrado: id (número do aluno no Moodle).');
    if (['nota', 'desempenho', 'feedback', 'situacao'].every(k => col(k) === -1)) {
      throw new Error('Inclua ao menos uma coluna de ação: nota, feedback ou situacao.');
    }
    const groups = new Map();
    const rejected = [];
    rows.slice(1).forEach((row, i) => {
      const rowNumber = i + 2;
      if (!row.some(c => String(c ?? '').trim())) return;
      const activityId = String(row[actCol] ?? '').trim();
      const studentId = String(row[idCol] ?? '').trim();
      if (!isId(activityId)) { rejected.push({ rowNumber, reason: activityId ? `atividade_id "${activityId}" não é numérico.` : 'Linha sem atividade_id.' }); return; }
      if (!isId(studentId)) { rejected.push({ rowNumber, activityId, reason: studentId ? `id "${studentId}" não é numérico.` : 'Linha sem id do aluno.' }); return; }
      if (!groups.has(activityId)) groups.set(activityId, { activityId, rows: [], lineNumbers: [] });
      const group = groups.get(activityId);
      group.rows.push(row);
      group.lineNumbers.push(rowNumber);
    });
    if (!groups.size) throw new Error('Nenhuma linha com atividade_id e id válidos.');
    if (groups.size > MAX_ACTIVITIES) throw new Error(`O arquivo cobre ${groups.size} atividades; o limite por lote é ${MAX_ACTIVITIES}. Divida o arquivo.`);
    return { header: rows[0], groups: [...groups.values()], rejected };
  }

  // Valida as linhas de UMA atividade com a nota máxima dela. Os números de linha voltam a ser os do arquivo original.
  function parseActivityRecords(group, header, max) {
    const original = local => group.lineNumbers[local - 2];
    const parsed = IMN.records.parseRecords([header, ...group.rows], { max });
    const records = parsed.records.map(record => ({
      ...record,
      rowNumber: original(record.rowNumber),
      issues: record.issues.map(issue => issue.replace(/^(Aluno repetido no arquivo \(linhas )([\d, ]+)\)/, (_, a, list) => `${a}${list.split(',').map(n => original(Number(n.trim()))).join(', ')})`))
    }));
    const warnings = parsed.warnings.map(w => w.replace(/^Linha (\d+):/, (_, n) => `Linha ${original(Number(n))}:`));
    return { records, warnings };
  }

  const gradeValue = record => (record.grade && record.grade.ok && !record.grade.empty ? record.grade.value : null);

  function itemAlerts(item, info, stats) {
    const { record } = item;
    const out = [];
    const value = gradeValue(record);
    if (record.situacao === 'corrigido' && record.grade.empty && info.max !== null) out.push('Situação "Corrigido", mas sem nota.');
    if (NO_GRADE_SITUATIONS.includes(record.situacao) && value !== null && value > 0) out.push(`Situação "${record.situacaoLabel}" com nota ${record.grade.canonical}.`);
    const cited = String(record.feedback || '').match(/\bnota(?:\s+final)?\s*(?:[:=]|é|foi|de)?\s*(\d+(?:[.,]\d+)?)/i);
    if (cited && value !== null && Math.abs(Number(cited[1].replace(',', '.')) - value) > 0.001) out.push(`O feedback cita nota ${cited[1]}, mas a nota lançada é ${record.grade.canonical}.`);
    if (item.row && info.files && info.files.get(String(item.row.userId)) === 0 && value !== null && value > 0) out.push('O Moodle não mostra arquivo enviado por este aluno, mas há nota.');
    if (value !== null && !String(record.feedback || '').trim()) out.push('Nota sem feedback.');
    else if (record.feedback && record.feedback.length < 20) out.push('Feedback muito curto.');
    if (value !== null && stats && stats.sd > 0 && Math.abs(value - stats.mean) > 2 * stats.sd) out.push(`Nota fora do padrão da turma (média ${stats.mean.toFixed(1).replace('.', ',')}).`);
    return out;
  }

  function gradeStats(records) {
    const values = records.map(gradeValue).filter(v => v !== null);
    if (!values.length) return { n: 0, mean: 0, sd: 0, values };
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    return { n: values.length, mean, sd, values };
  }

  // Plano de UMA atividade. info = { rows, max, decimal, files?, error? } lido da página de avaliação.
  function planActivity(parsedRecords, info, { edits = {}, overwriteGrade = false, overwriteFeedback = false } = {}) {
    const records = IMN.records.applyEdits(parsedRecords, edits, { max: info.max });
    const plan = IMN.plan.buildPlan(records, info.rows, { decimal: info.decimal, overwriteGrade, overwriteFeedback });
    const stats = gradeStats(records);
    const gradeStatsForOutliers = stats.n >= 8 ? stats : null;
    for (const item of plan.items) item.alerts = item.status === 'blocked' ? [] : itemAlerts(item, info, gradeStatsForOutliers);
    plan.groupAlerts = [];
    if (stats.n >= 5 && stats.sd === 0) plan.groupAlerts.push(`Todas as ${stats.n} notas são iguais (${records.map(r => r.grade.canonical).find(Boolean)}).`);
    plan.flagged = plan.items.filter(i => i.alerts.length).length;
    return plan;
  }

  function summarize(activities, rejected) {
    const sum = { activities: activities.length, ready: 0, unchanged: 0, blocked: rejected.length, grades: 0, feedbacks: 0, flagged: 0, unavailable: 0, readyActivities: 0 };
    for (const a of activities) {
      if (!a.plan) { sum.unavailable++; sum.blocked += a.group.rows.length; continue; }
      sum.ready += a.plan.summary.ready;
      sum.unchanged += a.plan.summary.unchanged;
      sum.blocked += a.plan.summary.blocked;
      sum.grades += a.plan.summary.grades;
      sum.feedbacks += a.plan.summary.feedbacks;
      sum.flagged += a.plan.flagged;
      if (a.plan.summary.ready > 0) sum.readyActivities++;
    }
    return sum;
  }

  // ---------- Arquivos gerados ----------
  const MANIFEST_HEADER = ['curso_id', 'curso', 'atividade_id', 'atividade', 'nota_maxima', 'id', 'nome', 'arquivos', 'enunciado_status', 'enunciado_arquivos'];
  const maxCell = max => (Number.isFinite(max) ? String(max).replace('.', ',') : '');

  function buildManifestCsv(rows) {
    const lines = [MANIFEST_HEADER.join(';')];
    for (const r of rows) {
      lines.push([r.courseId, r.course, r.activityId, r.activity, maxCell(r.max), r.userId, r.name, r.files === null || r.files === undefined ? '' : r.files, r.statementStatus || '', r.statementFiles || ''].map(v => csvCell(v)).join(';'));
    }
    return lines.join('\r\n');
  }

  const REPORT_HEADER = ['atividade_id', 'atividade', 'id', 'nome', 'campo', 'valor_anterior', 'valor_enviado', 'valor_no_moodle', 'resultado', 'motivo'];
  function buildReportCsv(rows) {
    const lines = [REPORT_HEADER.join(';')];
    for (const r of rows) lines.push(REPORT_HEADER.map(key => csvCell(r[key] ?? '')).join(';'));
    return lines.join('\r\n');
  }

  const BATCH_HEADER = 'atividade_id;id;nome;nota;feedback;situacao';

  const BATCH_PROMPT = [
    'Corrija as entregas do pacote e gere UM ÚNICO ARQUIVO CSV com as notas de todas as atividades.',
    '',
    'Retorne somente o conteúdo do CSV, sem Markdown e sem texto adicional. Use ponto e vírgula como separador.',
    `Cabeçalho: ${BATCH_HEADER}`,
    '',
    'Regras:',
    '- Use o arquivo manifesto.csv do pacote: copie atividade_id e id EXATAMENTE como estão nele. Uma linha por aluno corrigido.',
    '- nome: o mesmo do manifesto (serve só para conferência; quem manda é o id).',
    '- nota: somente o número (por exemplo 45 ou 7,5), entre 0 e a nota máxima da atividade (coluna nota_maxima do manifesto; vazia = não lida, pergunte). Sem "/50", sem texto, sem "%".',
    '- Se não for adequado lançar nota, deixe a coluna nota vazia.',
    '- feedback: curto, claro, acolhedor e individualizado. Sem ponto e vírgula e sem quebras de linha. Não cite a nota no texto.',
    '- Não invente alunos nem atividades que não estejam no manifesto.',
    '- Leia primeiro o enunciado e a folha de resposta que acompanham cada atividade dentro do pacote; confira enunciado_status no manifesto. Se não estiver disponível, solicite o enunciado, não invente critérios.',
    '- Avalie somente com base nas evidências presentes na entrega e nas orientações fornecidas.',
    '',
    'situacao deve usar uma destas tags quando fizer sentido: Corrigido, Erro no arquivo, Sem conteúdo relevante, Revisão necessária, Sem envio válido.'
  ].join('\n');

  const LEIAME_TEXT = [
    'PACOTE DE CORREÇÃO — Importar Notas',
    '',
    'Este pacote contém os envios pendentes e, por atividade, os enunciados e materiais encontrados, além do manifesto.csv e deste arquivo.',
    '',
    'COMO USAR',
    '1. Dentro de cada pasta de atividade, leia o Enunciado e a Folha de resposta, depois abra Envios - ...zip para analisar os alunos.',
    `2. No ChatGPT, envie este ZIP e as instruções do arquivo INSTRUCOES-PARA-CHATGPT.txt para produzir um CSV com o cabeçalho ${BATCH_HEADER}.`,
    '3. No Moodle, abra o curso ou categoria e clique no ícone de upload para importar o CSV corrigido.',
    '4. Confira a prévia, corrija o que quiser na tabela e confirme uma vez.',
    '',
    'POR QUE O MANIFESTO',
    'Ele guarda o id de cada atividade e de cada aluno no Moodle. A extensão casa as notas por id, nunca por nome.',
    'Linha sem atividade_id ou id válido é bloqueada.',
    '',
    'A coluna "nota_maxima" é a nota máxima da atividade, lida da tela de avaliação rápida (vazia = não foi possível ler).',
    'A coluna "arquivos" do manifesto mostra quantos arquivos o aluno enviou (vazio = não foi possível saber).',
    'enunciado_status: extraido, revisao_necessaria, nao_localizado ou falha_na_extracao. enunciado_arquivos: caminhos reais dentro do ZIP.',
    'Cada atividade tem VINCULO-E-AVISOS.txt, com IDs e URLs de origem, materiais encontrados e falhas.',
    'Enunciados não localizados NÃO são inventados. Verifique a atividade no Moodle antes de corrigir.',
    'O MiniLM opcional roda localmente (WebGPU ou WASM), usando apenas enunciados/descrições educacionais para decidir entre candidatos; na primeira vez baixa pesos do Hugging Face para o cache do navegador.',
    'Os envios, notas e dados dos alunos não são enviados à IA nem a serviços externos.'
  ].join('\n');

  root.IMN.batch = {
    MAX_ACTIVITIES, splitByActivity, parseActivityRecords, planActivity, summarize, itemAlerts,
    buildManifestCsv, buildReportCsv, BATCH_PROMPT, BATCH_HEADER, LEIAME_TEXT
  };
})(globalThis);
