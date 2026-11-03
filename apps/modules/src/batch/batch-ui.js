// Tela "Lançar notas (CSV)" das páginas de curso e de categoria: CSV único → prévia por atividade → uma confirmação
// → execução atividade por atividade (salvar + reler) → resultado e relatório.
// Todo texto de arquivo/página entra no DOM via IMN.dom.h (textContent).
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const h = IMN.dom.h;
  const B = IMN.batch;
  const flat = list => list.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function readFile(win, file) {
    return new Promise((resolve, reject) => {
      const reader = new win.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  const OUTCOME_LABEL = {
    conferido: 'salva e conferida', sem_alteracao: 'sem alteração', nao_lancada: 'não lançada', divergente: 'NÃO CONFERE',
    nao_verificada: 'não foi possível conferir', nao_executada: 'não executada', cancelada: 'cancelada'
  };

  function init(doc, win, deps, bar) {
    if (!bar || !bar.el || doc.getElementById('imn-batch-root')) return null;
    const rootEl = h(doc, 'div', { id: 'imn-batch-root', class: 'imn-root' });
    const backdrop = h(doc, 'div', { class: 'imn-backdrop', hidden: true });
    rootEl.append(backdrop);
    // Clique fora do modal não o fecha; somente o botão explícito pode encerrar.
    doc.body.append(rootEl);

    const openButton = h(doc, 'button', {
      type: 'button', class: 'imn-btn imn-icon-button imn-batch-open',
      title: 'Importar CSV ou XLSX', 'aria-label': 'Importar CSV ou XLSX', onclick: () => pickFile()
    }, IMN.icons.make(doc, 'upload'));
    const row = bar.el.querySelector('.imn-bar-row');
    if (row) row.append(openButton); else bar.el.append(openButton);

    const state = {
      phase: 'idle', fileName: '', split: null, activities: [], rejected: [], error: '', edits: {}, overwriteGrade: false, overwriteFeedback: false,
      filter: 'all', loaded: 0, progress: [], runner: null, outcome: null, expanded: new Set(), note: '', advancedOpen: false, reconciling: false, retryConfirm: false
    };
    let lastFocus = null;

    const open = () => { lastFocus = doc.activeElement; backdrop.hidden = false; render(); const c = backdrop.querySelector('.imn-close'); if (c) c.focus(); };
    // O seletor nativo abre diretamente ao clicar no ícone; sem modal intermediário.
    const picker = h(doc, 'input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx', style: 'position:fixed;left:-9999px;opacity:0', 'aria-label': 'Selecionar arquivo de notas' });
    rootEl.append(picker);
    const pickFile = () => {
      if (state.phase === 'running' || state.phase === 'loading') return;
      picker.value = '';
      picker.click();
    };
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      open();
      try { await loadFile(await readFile(win, file), file.name); }
      catch (error) { state.error = error.message; state.phase = 'idle'; render(); }
    });

    const close = () => { if (state.phase === 'running') return; backdrop.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); };

    // ---------- carregar arquivo ----------
    async function loadFile(buffer, name) {
      state.error = ''; state.edits = {}; state.activities = []; state.rejected = []; state.outcome = null; state.progress = []; state.expanded = new Set();
      try {
        const rows = /\.xlsx$/i.test(name) ? await IMN.xlsx.parseXlsx(buffer) : IMN.csv.parseDelimited(IMN.csv.decodeText(buffer));
        state.split = B.splitByActivity(rows);
      } catch (error) {
        state.split = null; state.phase = 'idle'; state.error = error.message; render(); return;
      }
      state.fileName = name;
      state.rejected = state.split.rejected;
      state.phase = 'loading'; state.loaded = 0; render();
      const origin = win.location.origin;
      state.activities = await Promise.all(state.split.groups.map(async group => {
        const info = await IMN.batchLoader.loadActivity(group.activityId, { fetchDoc: deps.fetchDoc, governor: deps.governor, origin });
        state.loaded += 1;
        const status = backdrop.querySelector('.imn-loading');
        if (status) status.textContent = `Lendo as atividades do Moodle… ${state.loaded} de ${state.split.groups.length}`;
        return { cmid: group.activityId, group, info, parsed: null, plan: null, error: info.error || '' };
      }));
      for (const a of state.activities) {
        if (a.error) continue;
        try { a.parsed = B.parseActivityRecords(a.group, state.split.header, a.info.max); }
        catch (error) { a.error = error.message; }
      }
      replanAll();
      state.expanded = new Set(state.activities.filter(a => a.plan && (a.plan.summary.blocked || a.plan.flagged)).map(a => a.cmid));
      if (!state.expanded.size && state.activities[0]) state.expanded.add(state.activities[0].cmid);
      state.phase = 'preview';
      render();
    }

    function replan(a) {
      if (!a.parsed || !a.info || a.info.error) { a.plan = null; return; }
      a.plan = B.planActivity(a.parsed.records, a.info, { edits: state.edits, overwriteGrade: state.overwriteGrade, overwriteFeedback: state.overwriteFeedback });
    }
    const replanAll = () => state.activities.forEach(replan);
    const summary = () => B.summarize(state.activities.map(a => ({ group: a.group, plan: a.plan })), state.rejected);

    // ---------- edição na prévia (atualiza a linha sem recriar os campos) ----------
    const gradeText = (a, record) => (record.grade.empty ? '' : record.grade.ok ? IMN.grade.formatGrade(record.grade.canonical, a.info.decimal) : record.notaRaw);
    const original = (a, rowNumber) => a.parsed.records.find(r => r.rowNumber === rowNumber);
    const editable = item => Boolean(item.row) && item.match.status !== 'conflict';
    const hasGradeIssue = item => item.reasons.some(r => /^Nota:/.test(r));
    const isEdited = item => Boolean(item.record.edited && Object.keys(item.record.edited).length);

    function onEdit(a, item, field, input) {
      const base = original(a, item.record.rowNumber);
      const baseText = field === 'grade' ? gradeText(a, base) : base.feedback;
      const key = item.record.rowNumber;
      const entry = { ...(state.edits[key] || {}) };
      if (input.value.trim() === String(baseText).trim()) delete entry[field]; else entry[field] = input.value;
      if (Object.keys(entry).length) state.edits[key] = entry; else delete state.edits[key];
      replan(a);
      refreshActivity(a);
      refreshTop();
    }

    function fieldNote(item, field) {
      const change = item.changes.find(c => c.field === field);
      const skip = item.skipped.find(c => c.field === field);
      if (change) return h(doc, 'span', {}, 'atual: ', change.from ? h(doc, 'span', { class: 'imn-old' }, change.from) : h(doc, 'span', { class: 'imn-empty' }, '(vazio)'), ' → será gravado');
      if (skip) return h(doc, 'span', { class: 'imn-muted' }, `${skip.reason}. Edite o campo para gravar mesmo assim.`);
      return h(doc, 'span', {}, '');
    }

    function fieldCell(a, item, field) {
      const label = field === 'grade' ? 'Nota' : 'Feedback';
      if (!editable(item)) return h(doc, 'td', { 'data-label': label }, '—');
      const who = item.row.name;
      const isGrade = field === 'grade';
      const input = isGrade
        ? h(doc, 'input', { type: 'text', inputmode: 'decimal', class: 'imn-input imn-input-grade', 'aria-label': `Nota de ${who}`, value: item.record.edited && item.record.edited.grade ? item.record.notaRaw : gradeText(a, item.record), onchange: e => onEdit(a, item, 'grade', e.target) })
        : h(doc, 'textarea', { class: 'imn-input imn-input-feedback', rows: '2', 'aria-label': `Feedback de ${who}`, onchange: e => onEdit(a, item, 'feedback', e.target) }, item.record.feedback);
      if (isGrade) input.setAttribute('aria-invalid', hasGradeIssue(item) ? 'true' : 'false');
      return h(doc, 'td', { 'data-label': label }, input, h(doc, 'div', { class: `imn-note imn-note-${field}` }, fieldNote(item, field)));
    }

    const chip = status => h(doc, 'span', { class: `imn-chip imn-${status}` }, { ready: 'Pronto', unchanged: 'Sem alteração', blocked: 'Bloqueado' }[status]);
    const notes = item => flat([
      item.reasons.map(r => h(doc, 'div', { class: 'imn-reason' }, r)),
      item.alerts.map(t => h(doc, 'div', { class: 'imn-flag' }, `Conferir: ${t}`))
    ]);
    const rowClass = item => `imn-row-${item.status}${isEdited(item) ? ' imn-row-edited' : ''}${item.alerts.length ? ' imn-row-flagged' : ''}`;
    const visible = item => state.filter === 'all' || (state.filter === 'ready' && item.status === 'ready') || (state.filter === 'blocked' && item.status === 'blocked') || (state.filter === 'flag' && item.alerts.length > 0);

    function itemRow(a, item) {
      const who = item.row ? item.row.name : item.record.nome || `id ${item.record.id}`;
      return h(doc, 'tr', { class: rowClass(item), 'data-row': String(item.record.rowNumber), hidden: !visible(item) },
        h(doc, 'td', { 'data-label': 'Aluno' }, h(doc, 'strong', {}, who), h(doc, 'div', { class: 'imn-muted' }, `id ${item.record.id}`), h(doc, 'div', { class: 'imn-reasons' }, ...notes(item))),
        fieldCell(a, item, 'grade'),
        fieldCell(a, item, 'feedback'),
        h(doc, 'td', { 'data-label': 'Status', class: 'imn-status' }, chip(item.status), isEdited(item) ? h(doc, 'div', { class: 'imn-muted' }, 'editado') : null));
    }

    function actChips(a) {
      if (!a.plan) return [h(doc, 'span', { class: 'imn-chip imn-blocked' }, 'Não lida')];
      const s = a.plan.summary;
      return flat([
        h(doc, 'span', { class: 'imn-chip imn-neutral' }, a.info.max === null ? 'nota máx. não lida' : `nota máx. ${String(a.info.max).replace('.', ',')}`),
        s.ready ? h(doc, 'span', { class: 'imn-chip imn-ready' }, plural(s.ready, 'pronto', 'prontos')) : null,
        s.unchanged ? h(doc, 'span', { class: 'imn-chip imn-unchanged' }, `${s.unchanged} sem alteração`) : null,
        s.blocked ? h(doc, 'span', { class: 'imn-chip imn-blocked' }, plural(s.blocked, 'bloqueado', 'bloqueados')) : null,
        a.plan.flagged ? h(doc, 'span', { class: 'imn-chip imn-flagchip' }, `${a.plan.flagged} p/ conferir`) : null
      ]);
    }

    function actWarnings(a) {
      if (!a.info || a.info.error) return [];
      return flat([
        a.info.hasMorePages ? h(doc, 'p', { class: 'imn-warn' }, 'Esta atividade tem mais de uma página de alunos; quem não estiver na primeira aparece como "não encontrado".') : null,
        a.info.max === null ? h(doc, 'p', { class: 'imn-warn' }, 'A nota máxima não foi lida na página: o limite não pôde ser verificado.') : null,
        a.plan ? a.plan.groupAlerts.map(t => h(doc, 'p', { class: 'imn-warn' }, `Conferir: ${t}`)) : null,
        a.parsed ? a.parsed.warnings.slice(0, 3).map(w => h(doc, 'p', { class: 'imn-warn' }, w)) : null
      ]);
    }

    function activitySection(a) {
      const title = `${a.info && a.info.course ? `${a.info.course} › ` : ''}${(a.info && a.info.name) || `Atividade ${a.cmid}`}`;
      const open = state.expanded.has(a.cmid);
      const body = h(doc, 'div', { class: 'imn-act-body', hidden: !open });
      const head = h(doc, 'button', { type: 'button', class: 'imn-act-head', 'aria-expanded': String(open), onclick: () => {
        const now = body.hidden; body.hidden = !now; head.setAttribute('aria-expanded', String(now)); caret.textContent = now ? '▾' : '▸';
        if (now) state.expanded.add(a.cmid); else state.expanded.delete(a.cmid);
      } });
      const caret = h(doc, 'span', { class: 'imn-caret', 'aria-hidden': 'true' }, open ? '▾' : '▸');
      head.append(h(doc, 'strong', {}, title), h(doc, 'span', { class: 'imn-act-chips' }, ...actChips(a)), h(doc, 'span', { class: 'imn-spacer' }), caret);
      if (a.error || !a.plan) {
        body.append(h(doc, 'p', { class: 'imn-alert' }, `Atividade ${a.cmid}: ${a.error || 'não foi possível ler.'} As ${plural(a.group.rows.length, 'linha', 'linhas')} desta atividade não serão lançadas.`));
      } else {
        body.append(...actWarnings(a), h(doc, 'div', { class: 'imn-table-wrap' }, h(doc, 'table', { class: 'imn-table' },
          h(doc, 'thead', {}, h(doc, 'tr', {}, ['Aluno', 'Nota', 'Feedback', 'Status'].map(t => h(doc, 'th', { scope: 'col' }, t)))),
          h(doc, 'tbody', {}, ...a.plan.items.map(item => itemRow(a, item))))));
      }
      return h(doc, 'section', { class: 'imn-act', 'data-cmid': a.cmid }, head, body);
    }

    function refreshActivity(a) {
      const sec = backdrop.querySelector(`section[data-cmid="${a.cmid}"]`);
      if (!sec || !a.plan) return;
      const chips = sec.querySelector('.imn-act-chips');
      if (chips) chips.replaceChildren(...actChips(a));
      for (const item of a.plan.items) {
        const tr = sec.querySelector(`tr[data-row="${item.record.rowNumber}"]`);
        if (!tr) continue;
        tr.className = rowClass(item);
        const reasons = tr.querySelector('.imn-reasons'); if (reasons) reasons.replaceChildren(...notes(item));
        const status = tr.querySelector('.imn-status');
        if (status) status.replaceChildren(...flat([chip(item.status), isEdited(item) ? h(doc, 'div', { class: 'imn-muted' }, 'editado') : null]));
        for (const field of ['grade', 'feedback']) { const n = tr.querySelector(`.imn-note-${field}`); if (n) n.replaceChildren(fieldNote(item, field)); }
        const g = tr.querySelector('.imn-input-grade'); if (g) g.setAttribute('aria-invalid', hasGradeIssue(item) ? 'true' : 'false');
      }
    }

    function counters() {
      const s = summary();
      return [['ready', s.ready, 'Prontos'], ['unchanged', s.unchanged, 'Sem alteração'], ['blocked', s.blocked, 'Bloqueados'], ['flag', s.flagged, 'Para conferir']];
    }
    function refreshTop() {
      const s = summary();
      counters().forEach(([key, value]) => { const el = backdrop.querySelector(`.imn-count-${key} b`); if (el) el.textContent = String(value); });
      const sum = backdrop.querySelector('.imn-summary'); if (sum) sum.textContent = summaryText(s);
      const go = backdrop.querySelector('.imn-go'); if (go) { go.textContent = goLabel(s); go.disabled = s.ready === 0; }
    }
    const summaryText = s => `${state.fileName}: ${plural(state.split.groups.reduce((n, g) => n + g.rows.length, 0) + state.rejected.length, 'linha', 'linhas')} · ${plural(s.activities, 'atividade', 'atividades')}`;
    const goLabel = s => `Lançar ${s.ready} aluno(s) em ${s.readyActivities} atividade(s)`;

    // ---------- execução ----------
    function buildJobs() {
      return state.activities.filter(a => a.plan && a.plan.summary.ready > 0).map(a => ({
        cmid: a.cmid, name: `${a.info.course ? `${a.info.course} › ` : ''}${a.info.name}`, url: a.info.url,
        records: IMN.records.applyEdits(a.parsed.records, state.edits, { max: a.info.max }),
        overwriteGrade: state.overwriteGrade, overwriteFeedback: state.overwriteFeedback, expected: IMN.plan.toExpected(a.plan)
      }));
    }

    const beforeUnload = e => { e.preventDefault(); e.returnValue = ''; };

    async function start() {
      const jobs = buildJobs();
      if (!jobs.length) return;
      state.phase = 'running';
      state.progress = jobs.map(j => ({ cmid: j.cmid, name: j.name, status: 'wait', message: '' }));
      const driver = deps.createBatchDriver ? deps.createBatchDriver() : IMN.batchRunner.createIframeDriver(win, doc);
      state.runner = IMN.batchRunner.createBatchRunner({ driver, governor: deps.governor, fetchDoc: deps.fetchDoc, win, gapMs: deps.batchGapMs ?? 350, onProgress: e => {
        const p = state.progress[e.index];
        if (e.type === 'start' && p) p.status = 'active';
        if (e.type === 'done' && p) { p.status = e.result.outcome; p.message = e.result.message; }
        if (e.type === 'paused') state.note = 'Lote em pausa.';
        renderRunning();
      } });
      win.addEventListener('beforeunload', beforeUnload);
      render();
      let outcome;
      try { outcome = await state.runner.run(jobs); }
      finally { win.removeEventListener('beforeunload', beforeUnload); }
      state.outcome = { ...outcome, jobs };
      state.phase = 'done';
      state.runner = null;
      render();
    }

    function reportRows() {
      const rows = [];
      const results = new Map((state.outcome ? state.outcome.results : []).map(r => [String(r.cmid), r]));
      for (const a of state.activities) {
        const name = a.info && a.info.name ? a.info.name : '';
        if (!a.plan) { rows.push({ atividade_id: a.cmid, atividade: name, resultado: 'atividade_nao_lida', motivo: a.error }); continue; }
        const res = results.get(String(a.cmid));
        const done = new Set();
        if (res) for (const f of res.fields) {
          done.add(`${f.userId}|${f.field}`);
          rows.push({ atividade_id: a.cmid, atividade: name, id: f.userId, nome: f.name, campo: f.field === 'grade' ? 'nota' : 'feedback', valor_anterior: f.from, valor_enviado: f.to, valor_no_moodle: f.after, resultado: f.status, motivo: f.reason });
        }
        for (const item of a.plan.items) {
          const base = { atividade_id: a.cmid, atividade: name, id: item.record.id, nome: item.row ? item.row.name : item.record.nome };
          if (item.status === 'blocked') rows.push({ ...base, resultado: 'bloqueado', motivo: item.reasons.join(' ') });
          else if (item.status === 'unchanged') rows.push({ ...base, resultado: 'sem_alteracao', motivo: item.skipped.map(s => s.reason).join('; ') });
          else if (!res || !item.changes.some(c => done.has(`${item.row.userId}|${c.field}`))) rows.push({ ...base, resultado: res ? res.outcome : 'nao_executada', motivo: res ? res.message : 'O lote não chegou a esta atividade.' });
        }
      }
      for (const r of state.rejected) rows.push({ resultado: 'linha_rejeitada', motivo: `Linha ${r.rowNumber}: ${r.reason}` });
      return rows;
    }

    function downloadReport() {
      const blob = new win.Blob(['﻿', B.buildReportCsv(reportRows())], { type: 'text/csv;charset=utf-8' });
      const url = win.URL.createObjectURL(blob);
      const a = h(doc, 'a', { href: url, download: `relatorio_lote_${new Date().toISOString().slice(0, 10)}.csv`, style: 'display:none' });
      doc.body.append(a); a.click(); a.remove();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    }

    // ---------- telas ----------
    const head = title => h(doc, 'div', { class: 'imn-head' },
      h(doc, 'div', { class: 'imn-title-group' }, h(doc, 'h2', { id: 'imn-batch-title' }, title)),
      h(doc, 'button', { type: 'button', class: 'imn-close', 'aria-label': 'Fechar janela', disabled: state.phase === 'running', onclick: close }, '×'));

    function mountDialog(parts) {
      const elements = flat(parts);
      const dialog = h(doc, 'div', { class: 'imn-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'imn-batch-title', tabindex: '-1' }, ...elements);
      IMN.dialog.bind(dialog, { onClose: close, canClose: () => false });
      backdrop.replaceChildren(dialog);
    }

    function learnerRows() {
      const results = new Map((state.outcome?.results || []).map(r => [String(r.cmid), r]));
      const rows = [];
      for (const a of state.activities) {
        for (const item of (a.plan?.items || [])) {
          if (!item.row || !item.changes?.length) continue;
          const res = results.get(String(a.cmid));
          const entries = (res?.fields || []).filter(f => String(f.userId) === String(item.row.userId));
          const active = state.phase === 'running' && state.progress.some(p => String(p.cmid) === String(a.cmid) && p.status === 'active');
          const status = !res ? (active ? 'running' : 'wait') : entries.length && entries.every(f => f.status === 'conferido') ? 'ok' : res.outcome === 'sem_alteracao' ? 'ok' : 'error';
          const grade = item.changes.find(c => c.field === 'grade');
          const feedback = item.changes.find(c => c.field === 'feedback');
          const body = h(doc, 'div', { class: 'imn-learner-body' },
            h(doc, 'strong', {}, item.row.name || grade?.name || feedback?.name || String(item.row.userId)),
            h(doc, 'div', { class: 'imn-learner-meta' },
              h(doc, 'span', {}, `Nota: ${grade?.to ?? '—'}`),
              h(doc, 'span', { class: 'imn-feedback-preview' }, `Feedback: ${feedback?.to ?? '—'}`)));
          if (status === 'error') {
            const details = h(doc, 'details', { class: 'imn-learner-details' },
              h(doc, 'summary', {}, 'Ver motivo'),
              h(doc, 'div', {}, res.message),
              h(doc, 'div', {}, `Rota: ${res.diagnostic?.requestedUrl || a.info.url || 'indisponível'}`));
            for (const url of res.diagnostic?.verificationUrls || []) details.append(h(doc, 'div', { class: 'imn-route-line' }, `Verificação: ${url}`));
            for (const f of entries.filter(f => f.status !== 'conferido')) details.append(h(doc, 'div', {}, `${f.field === 'grade' ? 'Nota' : 'Feedback'}: ${f.reason} · Moodle: ${f.after || '(não localizado)'}`));
            body.append(details);
          }
          rows.push(h(doc, 'div', { class: 'imn-learner-row', role: 'listitem' },
            h(doc, 'span', { class: `imn-learner-status imn-learner-${status}`, 'aria-label': status === 'ok' ? 'Conferido' : status === 'error' ? 'Não confirmado' : 'Aguardando' }, status === 'ok' ? '✓' : status === 'running' ? '◌' : status === 'error' ? '!' : '·'), body));
        }
      }
      return h(doc, 'div', { class: 'imn-learner-list', role: 'list', 'aria-label': 'Notas e feedbacks' }, ...rows);
    }

    function renderMain() {
      const parts = [head('Confirmar importação')];
      if (state.phase === 'idle') parts.push(h(doc, 'p', { class: 'imn-muted' }, 'Não foi possível ler o arquivo. Selecione novamente no botão de upload.'));
      if (state.note) parts.push(h(doc, 'p', { class: 'imn-ok' }, state.note));
      if (state.error) parts.push(h(doc, 'p', { class: 'imn-alert', role: 'alert' }, state.error));
      if (state.phase === 'loading') {
        parts.push(h(doc, 'p', { class: 'imn-loading imn-muted', role: 'status' }, `Lendo as atividades do Moodle… ${state.loaded} de ${state.split.groups.length}`));
      }
      if (state.phase === 'preview' || state.phase === 'confirm') {
        const s = summary();
        parts.push(h(doc, 'p', { class: 'imn-summary' }, summaryText(s)));
        // Totais são apresentados numa linha, sem painel de métricas redundante.
        parts.push(h(doc, 'details', { class: 'imn-advanced', open: state.advancedOpen, ontoggle: e => { state.advancedOpen = e.target.open; } },
          h(doc, 'summary', {}, 'Opções avançadas'),
          h(doc, 'div', { class: 'imn-options imn-details-content' },
            h(doc, 'label', {}, h(doc, 'input', { type: 'checkbox', checked: state.overwriteGrade, onchange: e => { state.overwriteGrade = e.target.checked; replanAll(); render(); } }), ' Sobrescrever notas existentes'),
            h(doc, 'label', {}, h(doc, 'input', { type: 'checkbox', checked: state.overwriteFeedback, onchange: e => { state.overwriteFeedback = e.target.checked; replanAll(); render(); } }), ' Sobrescrever feedbacks existentes'))));
        if (state.rejected.length) {
          parts.push(h(doc, 'div', { class: 'imn-alert' }, h(doc, 'strong', {}, `${plural(state.rejected.length, 'linha rejeitada', 'linhas rejeitadas')} (sem atividade_id ou id válido):`), ...state.rejected.slice(0, 8).map(r => h(doc, 'div', {}, `Linha ${r.rowNumber}: ${r.reason}`)), state.rejected.length > 8 ? h(doc, 'div', {}, `…e mais ${state.rejected.length - 8}. Veja o relatório.`) : null));
        }
        parts.push(learnerRows());
        const foot = [];
        foot.push(h(doc, 'button', { type: 'button', class: 'imn-btn imn-primary imn-confirm', disabled: s.ready === 0, onclick: start }, `Confirmar ${plural(s.grades + s.feedbacks, 'alteração', 'alterações')}`));
        foot.push(h(doc, 'button', { type: 'button', class: 'imn-btn', onclick: close }, 'Cancelar'));
        parts.push(h(doc, 'div', { class: 'imn-foot' }, ...foot));
      }
      mountDialog(parts);
    }

    function progressList() {
      return h(doc, 'div', { class: 'imn-progress' }, ...state.progress.map((p, i) => {
        const tone = p.status === 'conferido' || p.status === 'sem_alteracao' ? 'ok' : p.status === 'active' ? 'active' : p.status === 'wait' ? 'wait' : p.status === 'nao_executada' || p.status === 'cancelada' ? 'wait' : 'bad';
        const text = p.status === 'wait' ? 'aguardando' : p.status === 'active' ? 'salvando e conferindo…' : OUTCOME_LABEL[p.status] || p.status;
        return h(doc, 'div', { class: `imn-step imn-step-${tone}` }, h(doc, 'span', { class: 'imn-step-dot', 'aria-hidden': 'true' }, tone === 'ok' ? '✓' : String(i + 1)),
          h(doc, 'div', {}, h(doc, 'strong', {}, `${p.name} · ${text}`), p.message ? h(doc, 'div', {}, p.message) : null));
      }));
    }

    function renderRunning() {
      if (state.phase !== 'running') return;
      const finished = state.progress.filter(p => !['wait', 'active'].includes(p.status)).length;
      mountDialog([head('Lançando notas'),
        h(doc, 'p', { class: 'imn-summary', role: 'status' }, `${finished} de ${state.progress.length} atividades`),
        h(doc, 'div', { class: 'imn-bar-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(state.progress.length), 'aria-valuenow': String(finished) },
          h(doc, 'i', { style: `width:${Math.round(100 * finished / Math.max(1, state.progress.length))}%` })),
        learnerRows(),
        h(doc, 'div', { class: 'imn-foot' },
          h(doc, 'button', { type: 'button', class: 'imn-btn', onclick: () => state.runner.cancel() }, 'Cancelar restantes'))]);
    }

    const fieldKey = field => `${field.userId}|${field.field}`;
    const impacted = r => r.fields.filter(f => f.status === 'divergente' || f.status === 'nao_verificado');
    const resultJob = r => (state.outcome.jobs.find(j => String(j.cmid) === String(r.cmid)) || null);

    // Confere novamente SEM repetir POST e sem reaproveitar iframe, DOM ou cache.
    async function recheckResults() {
      if (state.reconciling || !state.outcome) return;
      state.reconciling = true;
      state.retryConfirm = false;
      render();
      try {
        for (const r of state.outcome.results) {
          if (!['divergente', 'nao_verificada'].includes(r.outcome)) continue;
          const job = resultJob(r);
          if (!job) continue;
          const targets = impacted(r);
          if (!targets.length) targets.push(...job.expected.map(e => ({ ...e, from: '', after: '', status: 'nao_verificado' })));
          const check = await IMN.reconcile.verifySaved(job, targets, { fetchDoc: deps.fetchDoc, governor: deps.governor });
          const updates = new Map(check.fields.map(f => [fieldKey(f), f]));
          r.fields = (r.fields.length ? r.fields : targets).map(f => {
            const got = updates.get(fieldKey(f));
            return got ? { ...f, after: got.after, status: got.status, reason: got.reason } : f;
          });
          r.outcome = IMN.reconcile.outcomeFor(r.fields.filter(f => f.status !== 'ignorado'));
          r.message = check.message;
        }
      } catch (error) { state.note = `Não foi possível conferir: ${error.message}`; }
      finally { state.reconciling = false; render(); }
    }

    // A segunda tentativa é MANUAL e limitada aos campos realmente diferentes
    // cujo valor ainda coincide com o que vimos antes da primeira gravação.
    function retryCandidates() {
      if (!state.outcome) return [];
      return state.outcome.results.flatMap(r => {
        const job = resultJob(r);
        if (!job) return [];
        const safe = IMN.reconcile.safeRetryFields(r.fields);
        return safe.length ? [{ ...job, expected: safe.map(f => ({
          userId: f.userId, name: f.name, field: f.field, to: f.to, retryFrom: f.from
        })) }] : [];
      });
    }

    async function retryVerifiedFailures() {
      const jobs = retryCandidates();
      if (!jobs.length || state.reconciling || !state.retryConfirm) return;
      state.retryConfirm = false;
      state.phase = 'running';
      state.progress = jobs.map(j => ({ cmid: j.cmid, name: j.name, status: 'wait', message: '' }));
      const driver = deps.createBatchDriver ? deps.createBatchDriver() : IMN.batchRunner.createIframeDriver(win, doc);
      state.runner = IMN.batchRunner.createBatchRunner({ driver, governor: deps.governor, fetchDoc: deps.fetchDoc, win,
        gapMs: deps.batchGapMs ?? 350, onProgress: e => {
          const p = state.progress[e.index];
          if (e.type === 'start' && p) p.status = 'active';
          if (e.type === 'done' && p) { p.status = e.result.outcome; p.message = e.result.message; }
          renderRunning();
        }
      });
      win.addEventListener('beforeunload', beforeUnload);
      render();
      let retry;
      try { retry = await state.runner.run(jobs); }
      finally { win.removeEventListener('beforeunload', beforeUnload); }
      const updates = new Map(retry.results.map(r => [String(r.cmid), r]));
      for (const r of state.outcome.results) {
        const next = updates.get(String(r.cmid));
        if (!next || next.outcome === 'nao_executada') continue;
        const revised = new Map(next.fields.map(f => [fieldKey(f), f]));
        r.fields = r.fields.map(f => {
          const changed = revised.get(fieldKey(f));
          if (!changed) return f;
          if (changed.status === 'ignorado') return { ...f, status: 'nao_verificado', reason: changed.reason };
          return { ...f, after: changed.after, status: changed.status, reason: changed.reason };
        });
        r.outcome = IMN.reconcile.outcomeFor(r.fields.filter(f => f.status !== 'ignorado'));
        r.message = next.message;
      }
      state.runner = null;
      state.phase = 'done';
      render();
    }

    async function continuePending() {
      if (!state.outcome || state.reconciling) return;
      const undone = new Set(state.outcome.results.filter(r => r.outcome === 'nao_executada').map(r => String(r.cmid)));
      const jobs = state.outcome.jobs.filter(j => undone.has(String(j.cmid)));
      if (!jobs.length) return;
      state.phase = 'running';
      state.progress = jobs.map(j => ({ cmid: j.cmid, name: j.name, status: 'wait', message: '' }));
      const driver = deps.createBatchDriver ? deps.createBatchDriver() : IMN.batchRunner.createIframeDriver(win, doc);
      state.runner = IMN.batchRunner.createBatchRunner({ driver, governor: deps.governor, fetchDoc: deps.fetchDoc, win,
        gapMs: deps.batchGapMs ?? 350, onProgress: e => {
          const p = state.progress[e.index];
          if (e.type === 'start' && p) p.status = 'active';
          if (e.type === 'done' && p) { p.status = e.result.outcome; p.message = e.result.message; }
          renderRunning();
        }
      });
      win.addEventListener('beforeunload', beforeUnload);
      render();
      let result;
      try { result = await state.runner.run(jobs); }
      finally { win.removeEventListener('beforeunload', beforeUnload); }
      const byCmid = new Map(result.results.map(r => [String(r.cmid), r]));
      state.outcome.results = state.outcome.results.map(r => byCmid.get(String(r.cmid)) || r);
      state.outcome.stopped = result.stopped;
      state.outcome.cancelled = result.cancelled;
      state.runner = null;
      state.phase = 'done';
      render();
    }

    function resultDetails(out, problems) {
      const jobs = out.jobs;
      const entries = out.results.map(r => {
        const job = jobs.find(j => String(j.cmid) === String(r.cmid));
        const errored = impacted(r);
        const status = OUTCOME_LABEL[r.outcome] || r.outcome;
        const name = (job && job.name) || r.name || `Atividade ${r.cmid}`;
        return h(doc, 'div', { class: 'imn-result-row' },
          h(doc, 'span', { class: `imn-result-indicator imn-result-${r.outcome}` , 'aria-hidden': 'true' }, r.outcome === 'conferido' ? '✓' : r.outcome === 'sem_alteracao' ? '–' : '!'),
          h(doc, 'div', { class: 'imn-result-row-info' },
            job && job.url ? h(doc, 'a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, name) : h(doc, 'strong', {}, name),
            h(doc, 'small', { class: 'imn-muted' }, `${status}${errored.length ? ` · ${errored.length} campo(s)` : ''}`)));
      });
      const problemRows = problems.map(f => h(doc, 'tr', {},
        h(doc, 'td', { 'data-label': 'Aluno' }, f.name),
        h(doc, 'td', { 'data-label': 'Campo' }, f.field === 'grade' ? 'Nota' : 'Feedback'),
        h(doc, 'td', { 'data-label': 'Enviado' }, h(doc, 'div', { class: 'imn-value-cell' }, f.to)),
        h(doc, 'td', { 'data-label': 'Atual' }, h(doc, 'div', { class: 'imn-value-cell' },
          f.status === 'nao_verificado' ? 'Não verificado' : (f.after || '(vazio)')))));
      const problemTable = problems.length ? h(doc, 'details', { class: 'imn-result-details' },
        h(doc, 'summary', {}, `Diferenças por aluno (${problems.length})`),
        h(doc, 'div', { class: 'imn-table-wrap' },
          h(doc, 'table', { class: 'imn-table' },
            h(doc, 'thead', {}, h(doc, 'tr', {}, ...['Aluno', 'Campo', 'Enviado', 'Atual'].map(t => h(doc, 'th', { scope: 'col' }, t)))),
            h(doc, 'tbody', {}, ...problemRows)))) : null;
      return h(doc, 'details', { class: 'imn-result-details imn-result-full' },
        h(doc, 'summary', {}, `Detalhes das atividades (${out.results.length})`),
        h(doc, 'div', { class: 'imn-result-list' }, ...entries), problemTable);
    }

    function renderDone() {
      const fields = state.outcome.results.flatMap(r => r.fields);
      const checked = fields.filter(f => f.status === 'conferido').length;
      const problems = fields.filter(f => f.status !== 'conferido');
      mountDialog([head('Resultado da importação'),
        h(doc, 'p', { class: 'imn-summary' }, `${checked} campos conferidos · ${problems.length} precisam de atenção`),
        learnerRows(),
        h(doc, 'div', { class: 'imn-foot' },
          problems.length ? h(doc, 'button', { type: 'button', class: 'imn-btn imn-primary', disabled: state.reconciling, onclick: recheckResults }, state.reconciling ? 'Verificando…' : 'Verificar novamente') : null,
          h(doc, 'button', { type: 'button', class: 'imn-btn', onclick: close }, 'Fechar'))]);
    }

    function render() {
      if (state.phase === 'running') renderRunning();
      else if (state.phase === 'done') renderDone();
      else renderMain();
    }

    return { open, close, pickFile, loadFile, state, backdrop, openButton, start, render, reportRows, downloadReport };
  }

  root.IMN.batchUi = { init };
})(globalThis);
