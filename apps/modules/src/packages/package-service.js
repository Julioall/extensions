// Caso de uso de pacotes. Não manipula DOM ou botões: pode ser testado com dependências falsas.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const ROOT_FOLDER = 'Moodle - Pendentes de correção';

  async function prepare(entries, { deps, origin, onProgress = () => {} }) {
    let finished = 0;
    const results = await Promise.all(entries.map(async entry => {
      try {
        const info = await deps.downloads.collectPending(entry.assignment, entry.count,
          { fetchDoc: deps.fetchDoc, governor: deps.governor, origin });
        return { item: { ...entry, userIds: info.userIds, max: info.max ?? null,
          students: info.students || [], sesskey: info.sesskey, name: entry.assignment.name,
          assignmentId: entry.assignment.assignmentId } };
      } catch (error) {
        return { failure: `${entry.assignment.name}: ${error.message}` };
      } finally { onProgress({ stage: 'prepare', done: ++finished, total: entries.length }); }
    }));
    return {
      prepared: results.filter(x => x.item).map(x => x.item),
      errors: results.filter(x => x.failure).map(x => x.failure),
    };
  }

  async function build(prepared, { deps, origin, initialErrors = [], onProgress = () => {} }) {
    const D = deps.downloads;
    const used = new Set();
    const parts = [];
    const archives = [];
    const manifestRows = [];
    const errors = [...initialErrors];
    let statements = 0;
    let needsReview = 0;
    let attachments = 0;
    for (let i = 0; i < prepared.length; i++) {
      const item = prepared[i];
      onProgress({ stage: 'download', done: i, total: prepared.length, name: item.name });
      try {
        const blob = await D.requestArchive(item, { origin });
        const folder = [...item.folders, `${D.sanitizeSegment(item.name)} [${item.assignmentId}]`].map(x => D.sanitizeSegment(x)).join('/');
        const inner = IMN.zip.uniqueName(`${folder}/Envios - ${item.userIds.length} pendentes.zip`, used);
        parts.push({ name: inner, data: blob });
        archives.push({ item, blob });
        let detail;
        try {
          detail = await IMN.enunciados.collectForAssignment(item.assignment,
            { origin, governor: deps.governor });
        } catch (error) {
          detail = { status: 'falha_na_extracao', files: [], warnings: [error.message],
            audit: `Atividade: ${item.name}\nEnunciado: falha na extração\n${error.message}` };
        }
        if (detail.status === 'extraido') statements++;
        else needsReview++;
        const docPaths = [];
        const roleNames = { enunciado: 'Enunciado', possivel_enunciado: 'Possivel enunciado - REVISAR',
          folha_resposta: 'Folha de resposta', orientacoes: 'Orientacoes' };
        for (const attachment of detail.files) {
          const path = IMN.zip.uniqueName(`${folder}/${roleNames[attachment.role] || 'Material'} - ${D.sanitizeSegment(attachment.filename)}`, used);
          parts.push({ name: path, data: attachment.data });
          docPaths.push(path);
          attachments++;
        }
        parts.push({ name: IMN.zip.uniqueName(`${folder}/VINCULO-E-AVISOS.txt`, used), data: detail.audit });
        for (const message of detail.warnings) errors.push(`${item.name}: ${message}`);
        for (const student of item.students) manifestRows.push({
          courseId: item.courseId, course: item.courseName, activityId: item.assignmentId,
          activity: item.name, max: item.max, userId: student.userId, name: student.name, files: student.files,
          statementStatus: detail.status, statementFiles: docPaths.join(' | ')
        });
      } catch (error) { errors.push(`${item.name}: ${error.message}`); }
      onProgress({ stage: 'download', done: i + 1, total: prepared.length, name: item.name });
    }
    const summary = { activities: archives.length, students: archives.reduce((n, a) => n + a.item.userIds.length, 0),
      statements, needsReview, attachments, errors };
    if (!archives.length) return { blob: null, archives, summary, error: 'Nenhum envio foi baixado.' };
    if (IMN.batch) {
      const bom = value => `\ufeff${value}`;
      parts.push({ name: 'manifesto.csv', data: bom(IMN.batch.buildManifestCsv(manifestRows)) });
      parts.push({ name: 'LEIA-ME.txt', data: bom(IMN.batch.LEIAME_TEXT) });
      parts.push({ name: 'INSTRUCOES-PARA-CHATGPT.txt', data: bom(IMN.batch.BATCH_PROMPT) });
    }
    try {
      onProgress({ stage: 'zip', done: 0, total: 1 });
      const blob = await IMN.zip.buildStoredZip(parts);
      const name = D.buildFilename([ROOT_FOLDER], `Pacote de correção - ${prepared[0]?.folders[0] || 'Moodle'}`,
        summary.students, 'pacote');
      onProgress({ stage: 'zip', done: 1, total: 1 });
      return { blob, name, archives, summary };
    } catch (error) {
      return { blob: null, archives, summary, error: `Falha na montagem do ZIP único: ${error.message}` };
    }
  }
  IMN.packages = { prepare, build, ROOT_FOLDER };
})(globalThis);
