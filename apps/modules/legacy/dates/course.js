/* Modal simplificado seguindo a linguagem do Moodle. */
(() => {
  'use strict';
  const Core = globalThis.CronPlan;
  if (!Core) return;

  const url = new URL(location.href);
  const courseId = Number(url.searchParams.get('id'));
  if (!Number.isSafeInteger(courseId) || courseId <= 0) return;

  const origin = location.origin;
  const KEY = 'modDateJobV13';
  const FIELDS = {
    assign: [
      ['allowsubmissionsfromdate', 'Abertura'],
      ['duedate', 'Entrega'],
      ['cutoffdate', 'Data limite'],
      ['gradingduedate', 'Aviso de correção']
    ],
    quiz: [
      ['timeopen', 'Abertura'],
      ['timeclose', 'Fechamento']
    ]
  };
  const DEFAULT_TIME = {
    allowsubmissionsfromdate: '00:00',
    duedate: '23:59',
    cutoffdate: '23:59',
    gradingduedate: '23:59',
    timeopen: '00:00',
    timeclose: '23:59'
  };

  let overlay = null;
  let view = 'editor';
  let modules = [];
  let job = null;
  let lastSchedule = null;

  const snapshots = new Map();
  const selected = new Set();
  const quick = { start: '', startTime: '00:00', end: '', endTime: '23:59', due: true };

  function e(tag, text, attrs = {}) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  function btn(label, onClick, primary = false) {
    const b = e('button', label, { type: 'button', class: `mdate-btn${primary ? ' mdate-primary' : ''}` });
    b.addEventListener('click', onClick);
    return b;
  }

  function iconSvg() {
    return '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/><path d="M11 15h6m-3-3v6"/></svg>';
  }

  // O gatilho original é mantido como ponte de compatibilidade invisível.
  // Somente o botão "Datas" do menu radial (canto inferior direito) o aciona.
  function mount() {
    if (document.getElementById('mod-date-button')) return;
    const button = e('button', null, {
      id: 'mod-date-button', type: 'button',
      title: 'Editar datas dos módulos', 'aria-label': 'Editar datas dos módulos',
      tabindex: '-1', 'aria-hidden': 'true', hidden: ''
    });
    button.style.display = 'none';
    button.addEventListener('click', openEditor);
    document.body.append(button);
  }

  // O Moodle é carregado em um iframe invisível da própria aba do curso.
  // Não abre nenhuma aba ou janela e preserva a sessão do usuário.
  const HIDDEN_FRAME_ID = 'mdate-background-frame';
  function hiddenFrame() {
    let frame = document.getElementById(HIDDEN_FRAME_ID);
    if (frame) return frame;
    frame = e('iframe', null, {
      id: HIDDEN_FRAME_ID,
      title: 'Consulta de datas Moodle em segundo plano',
      'aria-hidden': 'true',
      tabindex: '-1',
      style: 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;visibility:hidden;border:0;pointer-events:none'
    });
    frame.addEventListener('load', () => {
      let frameUrl;
      try { frameUrl = frame.contentWindow.location.href; } catch { return; }
      if (!frameUrl.startsWith(origin + '/')) return;
      chrome.runtime.sendMessage({
        type: 'MOD_DATE_IFRAME_NAV', courseId, origin, url: frameUrl
      }).catch(() => {});
    });
    document.body.append(frame);
    return frame;
  }
  function removeHiddenFrame() { document.getElementById(HIDDEN_FRAME_ID)?.remove(); }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type === 'MOD_DATE_NAVIGATE' && message.courseId === courseId) {
      try {
        const target = new URL(message.url);
        if (target.origin !== origin || target.pathname !== '/course/modedit.php') throw Error('Endereço da atividade inválido');
        hiddenFrame().src = target.href;
        reply({ok:true});
      } catch (error) { reply({ok:false,error:error.message}); }
      return;
    }
    if (message?.type === 'MOD_DATE_CLOSE_FRAME') {
      removeHiddenFrame();
      reply({ok:true});
    }
  });

  function moduleFromLi(li) {
    const link = li.querySelector('a[href*="/mod/assign/view.php"],a[href*="/mod/quiz/view.php"]');
    const isQuiz = li.classList.contains('modtype_quiz') || li.querySelector('.modtype_quiz');
    const isAssign = li.classList.contains('modtype_assign') || li.querySelector('.modtype_assign');
    let type = isQuiz ? 'quiz' : isAssign ? 'assign' : null;
    if (!type && link) type = link.href.includes('/mod/quiz/') ? 'quiz' : 'assign';
    if (!type) return null;

    let cmid = Number(li.dataset.id || String(li.id || '').replace(/^(module-|course-index-cm-)/, ''));
    if (!Number.isSafeInteger(cmid) || cmid <= 0) {
      try { cmid = Number(new URL(link.href).searchParams.get('id')); } catch { return null; }
    }
    if (!Number.isSafeInteger(cmid) || cmid <= 0) return null;

    const title = li.querySelector('[data-activityname]')?.getAttribute('data-activityname')
      || li.querySelector('.instancename')?.textContent?.trim()
      || li.querySelector('a[data-for="cm_name"]')?.textContent?.trim()
      || link?.textContent?.trim()
      || `Módulo ${cmid}`;

    return { cmid, title: title.replace(/\s+/g, ' ').trim(), type, courseId, ui: {} };
  }

  // Todos os módulos visíveis no conteúdo e no índice completo do curso,
  // sem limitar a identificação à aba/seção atual do formato one-topic.
  function modulesFrom() {
    const map = new Map();
    const main = document.querySelector('#region-main');
    const add = li => {
      const item = moduleFromLi(li);
      if (item && !map.has(item.cmid)) map.set(item.cmid, item);
    };
    main?.querySelectorAll('li.activity.modtype_assign, li.activity.modtype_quiz').forEach(add);
    document.querySelectorAll('#course-index [data-for="cm"]').forEach(add);
    return [...map.values()];
  }

  function schedule() {
    const out = [], problems = [];
    for (const table of document.querySelectorAll('#region-main table')) {
      const trs = [...table.querySelectorAll('tr')];
      const head = table.querySelector('thead tr') || trs[0];
      if (!head) continue;
      const headers = [...head.children].filter(x => /^(TH|TD)$/.test(x.tagName));
      if (headers.length < 3 || headers.some(x => +(x.getAttribute('colspan') || 1) > 1)) continue;
      const rows = trs.filter(x => x !== head).map(tr => [...tr.children].filter(x => /^(TD|TH)$/.test(x.tagName)).map(x => x.textContent.trim()));
      const result = Core.evaluateTable(headers.map(x => x.textContent.trim()), rows);
      if (result.columns.ok && result.valid) out.push(result);
      else if (result.columns.errors.some(t => t.includes('ambígua'))) problems.push(...result.columns.errors);
    }
    out.sort((a, b) => b.score - a.score);
    return { best: out[0] || null, problems };
  }

  function baselineFor(moduleItem, field) {
    const current = snapshots.get(moduleItem.cmid)?.dates?.[field];
    if (current?.enabled) {
      return { enabled: true, date: current.date || '', time: current.time || DEFAULT_TIME[field] };
    }
    return { enabled: false, date: '', time: '' };
  }

  function ensureFieldState(moduleItem, field) {
    if (!moduleItem.ui[field]) {
      const base = baselineFor(moduleItem, field);
      moduleItem.ui[field] = {
        date: base.date,
        time: base.time || DEFAULT_TIME[field],
        dirty: false,
        base
      };
    }
    return moduleItem.ui[field];
  }

  function initModuleUi(moduleItem) {
    for (const [field] of FIELDS[moduleItem.type]) ensureFieldState(moduleItem, field);
  }

  function syncFieldBaselineFromSnapshot(moduleItem, field) {
    const base = baselineFor(moduleItem, field);
    const state = ensureFieldState(moduleItem, field);
    state.base = base;
    if (!state.dirty) {
      state.date = base.date;
      state.time = base.time || DEFAULT_TIME[field];
    }
  }

  function initModules() {
    const prior = new Map(modules.map(m => [m.cmid, m]));
    modules = modulesFrom().map(m => prior.get(m.cmid) || m);
    modules.forEach(initModuleUi);
    selected.clear();
    modules.forEach(m => selected.add(m.cmid));
    lastSchedule = schedule();
  }

  function currentFieldLabel(type, field) {
    return FIELDS[type].find(x => x[0] === field)?.[1] || field;
  }

  function displayDate(d) {
    if (!d) return 'Não consultado';
    return d.enabled ? `${d.date || '—'} ${d.time || ''}`.trim() : 'Desativado';
  }

  function computeFieldOp(moduleItem, field) {
    const state = ensureFieldState(moduleItem, field);
    if (!state.dirty) return null;
    const date = (state.date || '').trim();
    const time = (state.time || '').trim();
    if (!date && !time) return { mode: 'disable' };
    if (!date || !time) return { mode: 'invalid' };
    if (!Core.validDate(date) || !Core.validTime(time)) return { mode: 'invalid' };
    return { mode: 'set', date, time };
  }

  function computeModuleOps(moduleItem) {
    const ops = {};
    for (const [field] of FIELDS[moduleItem.type]) {
      const op = computeFieldOp(moduleItem, field);
      if (op) ops[field] = op;
    }
    return ops;
  }

  function tasksToWrite() {
    return modules
      .filter(m => selected.has(m.cmid))
      .map(m => ({ cmid: m.cmid, title: m.title, type: m.type, courseId, ops: computeModuleOps(m) }))
      .filter(m => Object.keys(m.ops).length);
  }

  function errorFor(tasks) {
    if (!tasks.length) return 'Edite ao menos um campo para salvar.';
    for (const task of tasks) {
      for (const [field, op] of Object.entries(task.ops)) {
        if (op.mode === 'invalid') return `Complete data e hora em ${task.title} · ${currentFieldLabel(task.type, field)}.`;
      }
      const known = structuredClone(snapshots.get(task.cmid)?.dates || {});
      Object.entries(task.ops).forEach(([field, op]) => {
        known[field] = op.mode === 'disable' ? { enabled: false } : { enabled: true, date: op.date, time: op.time };
      });
      const order = task.type === 'quiz' ? ['timeopen', 'timeclose'] : ['allowsubmissionsfromdate', 'duedate', 'cutoffdate'];
      // A data de lembrete de correção é independente do prazo de envio.
      if (!order.some(field => Object.hasOwn(task.ops, field))) continue;
      const active = order.map(key => ({ key, ...known[key] })).filter(v => v.enabled && Core.validDate(v.date) && Core.validTime(v.time));
      for (let i = 1; i < active.length; i++) {
        if ((active[i - 1].date + 'T' + active[i - 1].time) > (active[i].date + 'T' + active[i].time)) {
          return `A ordem das datas está invertida em ${task.title}.`;
        }
      }
    }
    return '';
  }

  function updateScanStatus() {
    const label = document.getElementById('mdate-scan-status');
    if (!label) return;
    const total = modules.length;
    if (!total) { label.textContent = 'Nenhuma atividade encontrada no índice do curso.'; return; }
    if (!job || job.mode !== 'scan' || job.courseId !== courseId) {
      label.textContent = `${total} módulos do curso · Consultando datas atuais…`;
      return;
    }
    const checked = job.results?.length || 0;
    const errors = (job.results || []).filter(r => !r.ok).length;
    const running = job.status === 'running';
    label.replaceChildren(e('span', running
      ? `Consultando datas atuais · ${checked}/${job.tasks.length}`
      : `Datas consultadas · ${checked}/${job.tasks.length}`));
    if (errors) label.append(e('span', ` · ${errors} não consultado(s)`, {class:'mdate-scan-error'}));
    label.classList.toggle('is-running', running);
    label.classList.toggle('has-error', !!errors);
    if (!running && (errors || job.status !== 'done')) {
      const retry = btn('Tentar novamente', () => { void start('scan'); });
      retry.classList.add('mdate-retry');
      label.append(retry);
    }
  }

  function refreshSnapshotCells(cmid) {
    const moduleItem = modules.find(x => x.cmid === cmid);
    if (!moduleItem) return;
    const row = overlay?.querySelector(`tr[data-cmid="${cmid}"]`);
    if (!row) return;
    for (const [field] of FIELDS[moduleItem.type]) {
      const state = ensureFieldState(moduleItem, field);
      const td = row.querySelector(`[data-field="${field}"]`);
      if (!td) continue;
      const current = snapshots.get(cmid)?.dates?.[field];
      if (!state.dirty) {
        const date = td.querySelector('input[type="date"]');
        const time = td.querySelector('input[type="time"]');
        if (date && document.activeElement !== date) date.value = state.date || '';
        if (time && document.activeElement !== time) time.value = state.date ? state.time || '' : '';
        td.querySelector('.mdate-cell-status').textContent = current ? `Atual: ${displayDate(current)}` : 'Não consultado';
      }
    }
  }

  function updateValidation() {
    if (view !== 'editor') return;
    const tasks = tasksToWrite();
    const message = errorFor(tasks);
    const label = document.getElementById('mdate-validation');
    if (label) { label.textContent = message || 'Sem alterações fora dos campos editados. Limpar remove a data do Moodle.'; label.classList.toggle('mdate-error', !!message); }
    const count = document.getElementById('mdate-count');
    if (count) count.textContent = `${modules.length} módulos · ${tasks.length} com alteração`;
    const apply = document.getElementById('mdate-apply');
    if (apply) apply.disabled = !!message || job?.status === 'running';
  }

  function close() {
    const current = overlay;
    overlay = null;
    if (!current) return;
    if (typeof globalThis.__mrmReturnModal === 'function') globalThis.__mrmReturnModal(current);
    else current.remove();
  }
  function openEditor() {
    initModules();
    view = 'editor';
    render();
    // Leitura automática, somente após o usuário abrir o editor.
    // Nunca grava; a confirmação continua obrigatória para salvar.
    if (modules.length) {
      if (job?.status === 'running' && job.mode === 'scan' && job.courseId === courseId && job.origin === origin) {
        updateScanStatus();
      } else {
        void start('scan');
      }
    }
  }

  function applyQuickFill() {
    if (!Core.validDate(quick.start) || !Core.validDate(quick.end) || !Core.validTime(quick.startTime) || !Core.validTime(quick.endTime) || (quick.start + 'T' + quick.startTime) > (quick.end + 'T' + quick.endTime)) {
      alert('Preencha datas e horários válidos para abertura e fechamento.');
      return;
    }
    let changed = 0;
    for (const m of modules) {
      if (!selected.has(m.cmid)) continue;
      const sets = m.type === 'quiz'
        ? [['timeopen', quick.start, quick.startTime], ['timeclose', quick.end, quick.endTime]]
        : [
            ['allowsubmissionsfromdate', quick.start, quick.startTime],
            ...(quick.due ? [['duedate', quick.end, quick.endTime]] : []),
            ['cutoffdate', quick.end, quick.endTime]
          ];
      for (const [field, date, time] of sets) {
        const state = ensureFieldState(m, field);
        state.date = date;
        state.time = time;
        state.dirty = true;
        changed++;
      }
    }
    if (!changed) {
      alert('Selecione ao menos um módulo.');
      return;
    }
    render();
  }

  function applySchedule() {
    const entries = lastSchedule?.best?.entries;
    if (!entries?.size) {
      alert('Nenhum cronograma reconhecido.');
      return;
    }
    let count = 0;
    for (const m of modules) {
      if (!selected.has(m.cmid)) continue;
      const ent = entries.get(Core.identity(m.title));
      if (!ent || ent.ambiguous) continue;
      const pairs = m.type === 'quiz'
        ? [['timeopen', ent.start, ent.startTime], ['timeclose', ent.end, ent.endTime]]
        : [['allowsubmissionsfromdate', ent.start, ent.startTime], ['cutoffdate', ent.end, ent.endTime]];
      for (const [field, date, time] of pairs) {
        const state = ensureFieldState(m, field);
        state.date = date;
        state.time = time;
        state.dirty = true;
      }
      count++;
    }
    if (!count) {
      alert('O cronograma não trouxe correspondências seguras para os módulos selecionados.');
      return;
    }
    render();
  }

  function syncStateDirty(state, field) {
    const date = (state.date || '').trim();
    const time = (state.time || '').trim();
    const baseDate = state.base.enabled ? (state.base.date || '') : '';
    const baseTime = state.base.enabled ? (state.base.time || DEFAULT_TIME[field]) : '';
    if (!date && !time && !state.base.enabled) state.dirty = false;
    else if (date === baseDate && time === baseTime) state.dirty = false;
    else state.dirty = true;
  }

  function makeCell(moduleItem, field, label) {
    const state = ensureFieldState(moduleItem, field);
    const current = snapshots.get(moduleItem.cmid)?.dates?.[field];
    const td = e('td', null, { class: 'mdate-date-cell' + (state.dirty ? ' is-dirty' : ''), 'data-field': field });
    const row = e('div', null, { class: 'mdate-date-controls' });
    const date = e('input', null, { type: 'date', 'aria-label': `${label} — ${moduleItem.title}` });
    date.value = state.date || '';
    const time = e('input', null, { type: 'time', step: '60', 'aria-label': `Horário de ${label} — ${moduleItem.title}` });
    time.value = state.time || '';
    if (!state.date && !state.base.enabled && !state.dirty) time.value = '';
    const clear = e('button', '×', {
      type: 'button', class: 'mdate-cell-clear', title: `Limpar ${label}`,
      'aria-label': `Limpar ${label} — ${moduleItem.title}`
    });
    clear.addEventListener('click', () => {
      state.date = '';
      state.time = '';
      state.dirty = true;
      render();
    });

    const onEdit = (source) => {
      if (source === 'date') {
        // Deixar a data vazia também limpa a hora, para representar
        // inequivocamente desativação no Moodle.
        if (!date.value) time.value = '';
        else if (!time.value) time.value = DEFAULT_TIME[field];
      }
      state.date = date.value;
      state.time = time.value;
      syncStateDirty(state, field);
      td.classList.toggle('is-dirty', state.dirty);
      const status = td.querySelector('.mdate-cell-status');
      if (status) status.textContent = state.dirty ? 'Alterado' : (current ? `Atual: ${displayDate(current)}` : 'Não consultado');
      updateValidation();
      const tableRow = td.closest('tr');
      if (tableRow) tableRow.classList.toggle('has-dirty', Object.keys(computeModuleOps(moduleItem)).length > 0);
    };
    date.addEventListener('input', () => onEdit('date'));
    time.addEventListener('input', () => onEdit('time'));
    row.append(date, time, clear);
    td.append(row);
    td.append(e('small', state.dirty ? 'Alterado' : (current ? `Atual: ${displayDate(current)}` : 'Não consultado'), { class: 'mdate-cell-status' }));
    return td;
  }

  async function start(mode) {
    if (job?.status === 'running') {
      alert('Já existe uma operação em andamento.');
      return;
    }
    const tasks = mode === 'scan'
      ? modules.map(m => ({ cmid: m.cmid, courseId, type: m.type, title: m.title }))
      : tasksToWrite();

    if (!tasks.length) {
      alert(mode === 'scan' ? 'Selecione ao menos um módulo.' : 'Edite ao menos um campo antes de salvar.');
      return;
    }

    if (mode === 'apply') {
      const err = errorFor(tasks);
      if (err) { alert(err); return; }
      if (!confirm(`Salvar alterações em ${tasks.length} módulo(s)?\n\nSó os campos alterados serão enviados.`)) return;
    }

    try {
      const resp = await chrome.runtime.sendMessage({ type: 'MOD_DATE_START', mode, courseId, origin, tasks });
      if (!resp?.ok) throw Error(resp?.error || 'Falha ao iniciar');
      job = resp.job;
      if (mode === 'apply') { view = 'progress'; render(); }
      else updateScanStatus();
    } catch (err) {
      alert('Não foi possível iniciar: ' + err.message);
    }
  }

  async function cancel() { try { await chrome.runtime.sendMessage({ type: 'MOD_DATE_CANCEL', courseId, origin }); } catch {} }

  function titleBar() {
    const header = e('div', null, { class: 'mdate-header' });
    header.append(e('h2', 'Ajustar datas'));
    const x = btn('×', close);
    x.classList.add('mdate-close');
    x.setAttribute('aria-label', 'Fechar');
    header.append(x);
    return header;
  }

  function renderProgress(body, foot) {
    const ended = job.results?.length || 0;
    body.append(e('div', `${job.mode === 'scan' ? 'Consultando' : 'Salvando'} · ${ended}/${job.tasks.length}`, { class: 'mdate-status-line' }));
    const list = e('div', null, { class: 'mdate-progress-list' });
    for (const task of job.tasks) {
      const result = job.results.find(x => x.cmid === task.cmid);
      const row = e('div', null, { class: 'mdate-progress-item' + (result ? (result.ok ? ' ok' : ' fail') : '') });
      row.append(e('span', result ? (result.ok ? '✓' : '!') : '·', { class: 'mdate-progress-icon' }));
      const text = e('div', null, { class: 'mdate-progress-text' });
      text.append(e('strong', task.title));
      text.append(e('small', result?.detail || 'Aguardando...', { class: 'mdate-muted' }));
      row.append(text);
      list.append(row);
    }
    body.append(list);
    if (job.status !== 'running') {
      const failed = (job.results || []).filter(x => !x.ok).length;
      const summaryClass = failed ? 'mdate-warning-box' : 'mdate-success-box';
      body.append(e('div', failed ? `${failed} módulo(s) com divergência. Confira os detalhes acima.` : 'Concluído sem divergências.', { class: summaryClass }));
    }
    if (job.status === 'running') foot.append(btn('Cancelar', cancel));
    foot.append(btn('Voltar', () => { view = 'editor'; render(); }));
  }

  function renderEditor(body, foot) {
    body.append(e('p', 'Edite apenas o necessário. Sem mexer, mantém. Limpar remove a data do Moodle.', { class: 'mdate-description' }));
    body.append(e('div', '', { class: 'mdate-scan-status', id: 'mdate-scan-status', role: 'status', 'aria-live': 'polite' }));

    if (!modules.length) {
      body.append(e('div', 'Não foram encontrados módulos de tarefa ou questionário nesta visualização.', { class: 'mdate-empty' }));
    } else {
      const wrap = e('div', null, { class: 'mdate-table-scroll' });
      const table = e('table', null, { class: 'mdate-table' });
      const thead = e('thead');
      const heads = e('tr');
      for (const name of ['Atividade', 'Abertura', 'Entrega', 'Data limite', 'Aviso de correção']) heads.append(e('th', name, { scope: 'col', ...(name === 'Aviso de correção' ? { title: 'Campo Moodle: Lembre-me de avaliar por' } : {}) }));
      thead.append(heads);
      table.append(thead);
      const tbody = e('tbody');
      for (const moduleItem of modules) {
        const tr = e('tr', null, { 'data-cmid': moduleItem.cmid, class: Object.keys(computeModuleOps(moduleItem)).length ? 'has-dirty' : '' });
        const nameCell = e('td', null, { class: 'mdate-name-cell' });
        const name = e('label', null, { class: 'mdate-module-label' });
        const ck = e('input', null, { type: 'checkbox', 'aria-label': 'Selecionar ' + moduleItem.title });
        ck.checked = selected.has(moduleItem.cmid);
        ck.addEventListener('change', () => { if (ck.checked) selected.add(moduleItem.cmid); else selected.delete(moduleItem.cmid); updateValidation(); });
        name.append(ck, e('span', moduleItem.title));
        nameCell.append(name);
        nameCell.append(e('small', moduleItem.type === 'quiz' ? 'Questionário' : 'Tarefa', { class: 'mdate-type' }));
        tr.append(nameCell);
        for (const [field,label] of [
          ['allowsubmissionsfromdate','Abertura'], ['duedate','Entrega'],
          ['cutoffdate','Data limite'], ['gradingduedate','Aviso de correção']
        ]) {
          const quizField = moduleItem.type === 'quiz' ? (field === 'allowsubmissionsfromdate' ? 'timeopen' : field === 'cutoffdate' ? 'timeclose' : null) : field;
          if (quizField && FIELDS[moduleItem.type].some(([f]) => f === quizField)) {
            tr.append(makeCell(moduleItem, quizField, label));
          } else {
            const dash = e('td', '—', { class: 'mdate-na-cell' });
            tr.append(dash);
          }
        }
        tbody.append(tr);
      }
      table.append(tbody);
      wrap.append(table);
      body.append(wrap);
    }

    const details = e('details', null, { class: 'mdate-quick-details' });
    details.append(e('summary', 'Preenchimento rápido (opcional)'));
    const quickBox = e('div', null, { class: 'mdate-quick-box' });
    const qrow = e('div', null, { class: 'mdate-quick-grid' });
    for (const [label,key,type] of [
      ['Abertura','start','date'],['Hora','startTime','time'],
      ['Fechamento','end','date'],['Hora','endTime','time']
    ]) {
      const wrap=e('label', null, { class:'mdate-mini-field' });
      wrap.append(e('span',label));
      const input=e('input', null, { type, 'aria-label': label });
      input.value=quick[key];
      input.addEventListener('input', () => quick[key]=input.value);
      wrap.append(input);qrow.append(wrap);
    }
    quickBox.append(qrow);
    const due=e('label',null,{class:'mdate-checkline'});
    const dueCheck=e('input',null,{type:'checkbox'});
    dueCheck.checked=quick.due;
    dueCheck.addEventListener('change',()=>quick.due=dueCheck.checked);
    due.append(dueCheck,e('span','Incluir data de entrega'));quickBox.append(due);
    const qactions=e('div',null,{class:'mdate-inline-actions'});
    qactions.append(btn('Aplicar aos selecionados',applyQuickFill));
    const scheduleButton=btn('Usar cronograma',applySchedule);
    scheduleButton.disabled=!lastSchedule?.best?.valid;
    qactions.append(scheduleButton);quickBox.append(qactions);
    details.append(quickBox);body.append(details);
    body.append(e('div', '', { id: 'mdate-validation', class: 'mdate-validation', role: 'status' }));
    foot.append(e('small', 'O Moodle será conferido módulo por módulo após salvar.', { class: 'mdate-muted' }));
    const actions = e('div', null, { class: 'mdate-footer-actions' });
    actions.append(btn('Fechar', close));
    const apply = btn('Salvar alterações', () => start('apply'), true);
    apply.id = 'mdate-apply';
    actions.append(apply);
    foot.append(actions);
  }

  function render() {
    if (!overlay) {
      overlay = e('div', null, { class: 'mdate-overlay' });
      document.body.append(overlay);
    }
    overlay.replaceChildren();
    const dialog = e('section', null, { class: 'mdate-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ajustar datas das atividades' });
    dialog.append(titleBar());
    const body = e('div', null, { class: 'mdate-body' });
    const foot = e('div', null, { class: 'mdate-footer' });
    if (view === 'progress' && job) renderProgress(body, foot); else renderEditor(body, foot);
    dialog.append(body, foot);
    overlay.append(dialog);
    updateValidation();
    if (view === 'editor') updateScanStatus();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    const next = changes[KEY].newValue;
    if (next?.origin !== origin || next?.courseId !== courseId) return;
    job = next;
    if (job.mode === 'scan') {
      // Atualizar módulo a módulo, sem reconstruir o modal e apagar o foco/edição.
      for (const item of job.results || []) {
        if (!item.ok || !item.dates) continue;
        snapshots.set(item.cmid, { dates: item.dates });
        const moduleItem = modules.find(x => x.cmid === item.cmid);
        if (moduleItem) {
          for (const [field] of FIELDS[moduleItem.type]) syncFieldBaselineFromSnapshot(moduleItem, field);
          refreshSnapshotCells(item.cmid);
        }
      }
      updateScanStatus();
      updateValidation();
    } else if (overlay && view === 'progress') {
      render();
    }
  });

  chrome.storage.local.get(KEY).then(async data => {
    const last = data[KEY];
    if (last?.origin === origin && last?.courseId === courseId) {
      if (!job || (last.updatedAt || 0) > (job.updatedAt || 0)) job = last;
      if (last.mode === 'scan' && last.status === 'done') {
        for (const item of last.results) if (item.ok && item.dates) snapshots.set(item.cmid, { dates: item.dates });
      }
    }
  }).catch(() => {});

  mount();
})();
