// Painel de importação: arquivo → prévia (atual → novo) → preencher → confirmar → salvar → releitura.
// Todo texto vindo do arquivo ou da página entra no DOM via textContent (nunca innerHTML).
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const M = IMN.moodle;
  const VERIFY_KEY = 'imn_verify_v1';
  const VERIFY_TTL_MS = 15 * 60 * 1000;

  const h = IMN.dom.h;

  function readFile(win, file) {
    return new Promise((resolve, reject) => {
      const reader = new win.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function store(win) {
    try { return win.sessionStorage; } catch (_) { return null; }
  }
  const verifyId = win => `${win.location.pathname}?id=${new win.URL(win.location.href).searchParams.get('id') || ''}`;

  function init(doc, win) {
    if (doc.getElementById('imn-root')) return null;
    const entry = M.readiness(doc, win.location);
    if (!entry.isAssign || !entry.isGrading || !entry.hasTable) return null;

    const state = { fileName: '', records: [], warnings: [], plan: null, filled: false, expected: [], overwriteGrade: false, overwriteFeedback: false, confirming: false, error: '', edits: {}, advancedOpen: false, helpOpen: false };
    const rootEl = h(doc, 'div', { id: 'imn-root', class: 'imn-root' });
    const launcher = h(doc, 'button', { type: 'button', class: 'imn-launcher', onclick: () => open() }, 'Importar notas');
    const banner = h(doc, 'div', { class: 'imn-banner', role: 'status', hidden: true });
    const backdrop = h(doc, 'div', { class: 'imn-backdrop', hidden: true });
    rootEl.append(banner, backdrop);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    doc.body.append(rootEl);

    // O botão fica ao lado do "Nota" (nunca flutuando sobre o botão de salvar do Moodle).
    function placeLauncher() {
      launcher.classList.add('imn-inline');
      const anchor = M.toolbarAnchor(doc);
      if (anchor) { anchor.insertAdjacentElement('afterend', launcher); return; }
      const table = doc.querySelector('table#submissions');
      const host = (table && (table.closest('.table-responsive, .gradingtable, form') || table)) || null;
      if (host) host.insertAdjacentElement('beforebegin', launcher);
      else rootEl.prepend(launcher);
    }
    placeLauncher();

    let lastFocus = null;

    function open() {
      lastFocus = doc.activeElement;
      backdrop.hidden = false;
      render();
      const close = backdrop.querySelector('.imn-close');
      if (close) close.focus();
    }
    function close() {
      backdrop.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    async function loadFromBuffer(buffer, name) {
      state.error = '';
      state.filled = false;
      state.confirming = false;
      state.edits = {};
      try {
        const max = M.readMaxGrade(doc);
        const rows = /\.xlsx$/i.test(name)
          ? await IMN.xlsx.parseXlsx(buffer)
          : IMN.csv.parseDelimited(IMN.csv.decodeText(buffer));
        const parsed = IMN.records.parseRecords(rows, { max });
        state.fileName = name;
        state.records = parsed.records;
        state.warnings = parsed.warnings;
        replan();
      } catch (error) {
        state.records = [];
        state.plan = null;
        state.error = error.message;
      }
      render();
    }

    function replan() {
      const pageRows = M.readRows(doc);
      const records = IMN.records.applyEdits(state.records, state.edits, { max: M.readMaxGrade(doc) });
      state.plan = IMN.plan.buildPlan(records, pageRows, {
        decimal: M.decimalSeparator(doc),
        overwriteGrade: state.overwriteGrade,
        overwriteFeedback: state.overwriteFeedback
      });
    }

    function fill() {
      if (!state.plan || state.plan.summary.ready === 0) return;
      state.expected = IMN.plan.toExpected(state.plan);
      M.fillPlan(state.plan);
      state.filled = true;
      state.confirming = false;
      render();
    }

    function save() {
      // A conferência vale também quando a pessoa salva à mão: guarda o esperado antes de tudo.
      const s = store(win);
      if (s) s.setItem(VERIFY_KEY, JSON.stringify({ id: verifyId(win), at: Date.now(), expected: state.expected }));
      const button = M.saveButton(doc);
      close();
      if (!button) {
        showBanner('info', 'Campos preenchidos. Falta salvar no Moodle', [
          'Não achei o botão de salvar com segurança. Clique em "Salvar todas as alterações de avaliação rápida" no fim da tabela.',
          'Depois que a página recarregar, a conferência aparece sozinha (vale por 15 minutos).'
        ]);
        return;
      }
      button.click();
    }

    function chip(status) {
      const label = { ready: 'Pronto', unchanged: 'Sem alteração', blocked: 'Bloqueado' }[status];
      return h(doc, 'span', { class: `imn-chip imn-${status}` }, label);
    }

    // Legenda sob o campo editável: o que acontece com este campo (atual → novo, ou por que não será aplicado).
    function fieldNote(item, field) {
      const change = item.changes.find(c => c.field === field);
      const skip = item.skipped.find(c => c.field === field);
      if (change) return h(doc, 'span', {}, 'atual: ', change.from ? h(doc, 'span', { class: 'imn-old' }, change.from) : h(doc, 'span', { class: 'imn-empty' }, '(vazio)'), ' → será gravado');
      if (skip) return h(doc, 'span', { class: 'imn-muted' }, `${skip.reason}. Edite o campo para gravar mesmo assim.`);
      return h(doc, 'span', { class: 'imn-muted' }, '');
    }

    const editable = item => Boolean(item.row) && item.match.status !== 'conflict';
    const hasGradeIssue = item => item.reasons.some(r => /^Nota:/.test(r));

    function onEdit(item, field, input) {
      const original = field === 'grade' ? originalGradeText(item) : item.record.feedback;
      const key = item.record.rowNumber;
      const entry = { ...(state.edits[key] || {}) };
      if (input.value.trim() === String(original).trim()) delete entry[field]; else entry[field] = input.value;
      if (Object.keys(entry).length) state.edits[key] = entry; else delete state.edits[key];
      replan();
      refreshRows();
    }

    // Texto original do arquivo (sem edição) para saber se o campo foi mudado.
    function originalGradeText(item) {
      const base = state.records.find(r => r.rowNumber === item.record.rowNumber);
      return base ? (base.grade.empty ? '' : base.grade.ok ? IMN.grade.formatGrade(base.grade.canonical, M.decimalSeparator(doc)) : base.notaRaw) : '';
    }

    function gradeFieldValue(item) {
      const g = item.record.grade;
      if (item.record.edited && item.record.edited.grade) return item.record.notaRaw;
      return g.empty ? '' : g.ok ? IMN.grade.formatGrade(g.canonical, M.decimalSeparator(doc)) : item.record.notaRaw;
    }

    function fieldCell(item, field) {
      if (!editable(item)) return h(doc, 'td', { 'data-label': field === 'grade' ? 'Nota' : 'Feedback' }, '—');
      const who = item.row.name;
      const isGrade = field === 'grade';
      const input = isGrade
        ? h(doc, 'input', { type: 'text', inputmode: 'decimal', class: 'imn-input imn-input-grade', 'aria-label': `Nota de ${who}`, value: gradeFieldValue(item), disabled: state.filled, onchange: e => onEdit(item, 'grade', e.target) })
        : h(doc, 'textarea', { class: 'imn-input imn-input-feedback', rows: '2', 'aria-label': `Feedback de ${who}`, disabled: state.filled, onchange: e => onEdit(item, 'feedback', e.target) }, item.record.feedback);
      if (isGrade) input.setAttribute('aria-invalid', hasGradeIssue(item) ? 'true' : 'false');
      return h(doc, 'td', { 'data-label': isGrade ? 'Nota' : 'Feedback' }, input, h(doc, 'div', { class: `imn-note imn-note-${field}` }, fieldNote(item, field)));
    }

    function reasonsNodes(item) {
      const sug = (item.match.suggestions || []).map(x => `${x.name} (id ${x.userId})`);
      return [
        item.reasons.map(n => h(doc, 'div', { class: 'imn-reason' }, n)),
        sug.length ? h(doc, 'div', { class: 'imn-muted' }, `Sugestão (não aplicada): ${sug.join('; ')}`) : null
      ];
    }

    function rowClass(item) {
      return `imn-row-${item.status}${item.record.edited && Object.keys(item.record.edited).length ? ' imn-row-edited' : ''}`;
    }

    function previewTable() {
      const { items } = state.plan;
      const head = h(doc, 'tr', {}, ['Aluno', 'Nota', 'Feedback', 'Situação', 'Status'].map(t => h(doc, 'th', { scope: 'col' }, t)));
      const body = items.map(item => {
        const who = item.row ? item.row.name : item.record.nome || `id ${item.record.id}`;
        const sub = item.row && item.match.status === 'id' ? `id ${item.row.userId}` : '';
        return h(doc, 'tr', { class: rowClass(item), 'data-row': String(item.record.rowNumber) },
          h(doc, 'td', { 'data-label': 'Aluno' }, h(doc, 'strong', {}, who), sub ? h(doc, 'div', { class: 'imn-muted' }, sub) : null, h(doc, 'div', { class: 'imn-reasons' }, ...reasonsNodes(item).flat().filter(Boolean))),
          fieldCell(item, 'grade'),
          fieldCell(item, 'feedback'),
          h(doc, 'td', { 'data-label': 'Situação' }, item.record.situacaoLabel === 'Sem tag' ? '—' : item.record.situacaoLabel),
          h(doc, 'td', { 'data-label': 'Status', class: 'imn-status' }, chip(item.status), item.record.edited && Object.keys(item.record.edited).length ? h(doc, 'div', { class: 'imn-muted' }, 'editado') : null));
      });
      return h(doc, 'div', { class: 'imn-table-wrap' }, h(doc, 'table', { class: 'imn-table' }, h(doc, 'thead', {}, head), h(doc, 'tbody', {}, body)));
    }

    // Atualiza só o que mudou (status, motivos, legendas), sem recriar os campos: o cursor e o Tab não se perdem.
    function refreshRows() {
      for (const item of state.plan.items) {
        const tr = backdrop.querySelector(`tr[data-row="${item.record.rowNumber}"]`);
        if (!tr) continue;
        tr.className = rowClass(item);
        const reasons = tr.querySelector('.imn-reasons');
        if (reasons) reasons.replaceChildren(...reasonsNodes(item).flat().filter(Boolean));
        const status = tr.querySelector('.imn-status');
        if (status) status.replaceChildren(chip(item.status), ...(item.record.edited && Object.keys(item.record.edited).length ? [h(doc, 'div', { class: 'imn-muted' }, 'editado')] : []));
        for (const field of ['grade', 'feedback']) {
          const note = tr.querySelector(`.imn-note-${field}`);
          if (note) note.replaceChildren(fieldNote(item, field));
        }
        const gradeInput = tr.querySelector('.imn-input-grade');
        if (gradeInput) gradeInput.setAttribute('aria-invalid', hasGradeIssue(item) ? 'true' : 'false');
      }
      const s = state.plan.summary;
      const summary = backdrop.querySelector('.imn-summary');
      if (summary) summary.textContent = summaryText(s);
      const fillBtn = backdrop.querySelector('.imn-fill');
      if (fillBtn) { fillBtn.textContent = `Preencher ${s.ready} alunos`; fillBtn.disabled = s.ready === 0 || !M.readiness(doc, win.location).ok; }
    }

    const summaryText = s => `${s.ready} prontos · ${s.unchanged} sem alteração · ${s.blocked} bloqueados`;

    function render() {
      const max = M.readMaxGrade(doc);
      const page = M.readRows(doc);
      const pag = M.pagination(doc);
      const info = `${page.length} alunos nesta página · Nota máxima: ${max === null ? 'não identificada' : max}`;
      const parts = [];
      parts.push(h(doc, 'div', { class: 'imn-head' },
        h(doc, 'div', { class: 'imn-title-group' }, h(doc, 'h2', { id: 'imn-title' }, 'Importar notas'),
          h(doc, 'p', { class: 'imn-muted' }, info)),
        h(doc, 'button', { type: 'button', class: 'imn-close', 'aria-label': 'Fechar janela', onclick: close }, '×')));
      const now = M.readiness(doc, win.location);
      if (!now.ok) parts.push(h(doc, 'p', { class: 'imn-alert' }, now.problem));
      if (pag.hasMorePages) parts.push(h(doc, 'p', { class: 'imn-warn' }, 'Há mais de uma página de alunos. Só os desta página serão importados; os demais aparecem como "não encontrado". Para importar todos de uma vez, exiba todos os alunos na página.'));

      parts.push(h(doc, 'div', { class: 'imn-actions imn-import-actions' },
        h(doc, 'label', { class: 'imn-file' }, 'Arquivo CSV ou XLSX',
          h(doc, 'input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx', onchange: async e => { const f = e.target.files[0]; if (f) await loadFromBuffer(await readFile(win, f), f.name); } }))));
      parts.push(h(doc, 'details', { class: 'imn-help', open: state.helpOpen, ontoggle: e => { state.helpOpen = e.target.open; } },
        h(doc, 'summary', {}, 'Modelo para correção'),
        h(doc, 'div', { class: 'imn-actions imn-details-content' },
          h(doc, 'button', { type: 'button', class: 'imn-btn', onclick: () => downloadTemplate() }, 'Baixar modelo'),
          h(doc, 'button', { type: 'button', class: 'imn-btn', onclick: copyPrompt }, 'Copiar instruções para ChatGPT'))));
      parts.push(h(doc, 'details', { class: 'imn-advanced', open: state.advancedOpen, ontoggle: e => { state.advancedOpen = e.target.open; } },
        h(doc, 'summary', {}, 'Opções avançadas'),
        h(doc, 'div', { class: 'imn-options imn-details-content' },
          h(doc, 'label', {}, h(doc, 'input', { type: 'checkbox', checked: state.overwriteGrade, disabled: state.filled, onchange: e => { state.overwriteGrade = e.target.checked; replan(); render(); } }), ' Sobrescrever notas existentes'),
          h(doc, 'label', {}, h(doc, 'input', { type: 'checkbox', checked: state.overwriteFeedback, disabled: state.filled, onchange: e => { state.overwriteFeedback = e.target.checked; replan(); render(); } }), ' Sobrescrever feedbacks existentes'))));

      if (state.error) parts.push(h(doc, 'p', { class: 'imn-alert', role: 'alert' }, state.error));
      state.warnings.forEach(w => parts.push(h(doc, 'p', { class: 'imn-warn' }, w)));

      if (state.plan) {
        const s = state.plan.summary;
        parts.push(h(doc, 'div', { class: 'imn-preview-heading' },
          h(doc, 'div', {}, h(doc, 'h3', {}, 'Conferir notas'), h(doc, 'p', { class: 'imn-muted imn-filename' }, state.fileName))));
        parts.push(h(doc, 'div', { class: 'imn-counts imn-import-counts', role: 'group', 'aria-label': 'Resumo da importação' },
          h(doc, 'div', { class: 'imn-count imn-count-ready' }, h(doc, 'b', {}, String(s.ready)), 'Prontos'),
          h(doc, 'div', { class: 'imn-count imn-count-unchanged' }, h(doc, 'b', {}, String(s.unchanged)), 'Sem alteração'),
          h(doc, 'div', { class: 'imn-count imn-count-blocked' }, h(doc, 'b', {}, String(s.blocked)), 'Bloqueados')));
        parts.push(previewTable());
        if (state.plan.missingFromFile.length) parts.push(h(doc, 'p', { class: 'imn-muted' }, `${state.plan.missingFromFile.length} aluno(s) desta página não estão no arquivo e não serão alterados.`));

        const foot = [];
        if (!state.filled) {
          foot.push(h(doc, 'button', { type: 'button', class: 'imn-btn imn-primary imn-fill', disabled: s.ready === 0 || !now.ok, onclick: fill }, `Preencher ${s.ready} alunos`));
          foot.push(h(doc, 'span', { class: 'imn-muted' }, 'Confira no Moodle antes de salvar.'));
        } else if (!state.confirming) {
          foot.push(h(doc, 'span', { class: 'imn-ok' }, 'Campos preenchidos.'));
          foot.push(h(doc, 'button', { type: 'button', class: 'imn-btn imn-primary', onclick: () => { state.confirming = true; render(); } }, 'Salvar notas'));
        } else {
          foot.push(h(doc, 'strong', {}, `Confirmar ${state.expected.length} alterações?`));
          foot.push(h(doc, 'button', { type: 'button', class: 'imn-btn imn-primary', onclick: save }, 'Confirmar e salvar'));
          foot.push(h(doc, 'button', { type: 'button', class: 'imn-btn', onclick: () => { state.confirming = false; render(); } }, 'Voltar'));
        }
        parts.push(h(doc, 'div', { class: 'imn-foot' }, foot));
      }

      const dialog = h(doc, 'div', { class: 'imn-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'imn-title', tabindex: '-1' }, parts);
      IMN.dialog.bind(dialog, { onClose: close });
      backdrop.replaceChildren(dialog);
    }

    function downloadTemplate() {
      const blob = new win.Blob(['﻿', IMN.templates.TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
      const url = win.URL.createObjectURL(blob);
      const a = h(doc, 'a', { href: url, download: 'modelo_importacao.csv' });
      doc.body.append(a); a.click(); a.remove();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    }
    async function copyPrompt() {
      try { await win.navigator.clipboard.writeText(IMN.templates.CORRECTION_PROMPT); state.error = ''; }
      catch (_) { state.error = 'Não foi possível copiar automaticamente; o navegador bloqueou a área de transferência.'; }
      render();
    }

    function showBanner(kind, title, lines) {
      banner.hidden = false;
      banner.className = `imn-banner imn-banner-${kind}`;
      banner.replaceChildren(
        h(doc, 'strong', {}, title),
        lines.map(l => h(doc, 'div', {}, l)),
        h(doc, 'button', { type: 'button', class: 'imn-btn', onclick: () => { banner.hidden = true; } }, 'Fechar'));
    }

    // Releitura depois do recarregamento causado pelo "Salvar": nada é dado como certo sem conferir.
    function verifyAfterSave() {
      const s = store(win);
      if (!s) return null;
      let saved;
      try { saved = JSON.parse(s.getItem(VERIFY_KEY) || 'null'); } catch (_) { saved = null; }
      if (!saved) return null;
      s.removeItem(VERIFY_KEY);
      if (saved.id !== verifyId(win) || Date.now() - saved.at > VERIFY_TTL_MS) return null;
      const back = new Map(M.readRows(doc).map(r => [r.userId, r]));
      const problems = IMN.plan.verifyExpected(saved.expected, back);
      if (!problems.length) showBanner('ok', 'Salvo e conferido', [`${saved.expected.length} campo(s) relidos do Moodle e iguais ao enviado.`]);
      else showBanner('error', `Atenção: ${problems.length} campo(s) não conferem — revise manualmente`,
        problems.map(p => `${p.name} (${p.field === 'grade' ? 'nota' : 'feedback'}): enviado "${p.to}", Moodle mostra "${p.actual}". ${p.reason}`));
      return problems;
    }

    const verification = verifyAfterSave();
    return { open, close, loadFromBuffer, state, verification, fill, save, render, backdrop, banner, launcher };
  }

  root.IMN.panel = { init };
})(globalThis);
