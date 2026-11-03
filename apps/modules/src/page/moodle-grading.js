// Adaptador da tela de avaliação do Moodle (mod/assign, action=grading). Único módulo que lê/escreve a tabela.
(function (root) {
  'use strict';
  const { normalizeText } = root.IMN.text;

  const GRADE_SELECTOR = 'input[name^="quickgrade_"]:not([name^="quickgrade_comments_"])';
  const FEEDBACK_SELECTOR = 'textarea[name^="quickgrade_comments_"]';

  function readiness(doc, loc) {
    const url = new URL(loc.href);
    const table = doc.querySelector('table#submissions');
    const isAssign = /\/mod\/assign\/view\.php$/.test(url.pathname);
    const isGrading = url.searchParams.get('action') === 'grading';
    const gradeCount = table ? table.querySelectorAll(GRADE_SELECTOR).length : 0;
    const feedbackCount = table ? table.querySelectorAll(FEEDBACK_SELECTOR).length : 0;
    const quick = quickGradingCheckbox(doc);
    const base = { isAssign, isGrading, hasTable: Boolean(table), gradeCount, feedbackCount, hasQuickOption: Boolean(quick), quickEnabled: Boolean(quick && quick.checked) };
    let problem = '';
    if (!isAssign || !isGrading) problem = 'Abra a tela de avaliação da atividade (Ver/avaliar todos os envios).';
    else if (!base.hasTable) problem = 'Tabela de envios não encontrada nesta página.';
    else if (!base.hasQuickOption) problem = 'Opção "Avaliação rápida" não encontrada nesta página.';
    else if (!base.quickEnabled) problem = 'Marque a opção "Avaliação rápida" para liberar os campos de nota e feedback.';
    else if (!gradeCount && !feedbackCount) problem = 'Nenhum campo de nota ou feedback editável foi encontrado.';
    return { ...base, ok: !problem, problem };
  }

  function quickGradingCheckbox(doc) {
    const direct = doc.querySelector('input[type="checkbox"][name="quickgrading"], input[type="checkbox"][id^="quickgrading"]');
    if (direct) return direct;
    const label = [...doc.querySelectorAll('label')].find(l => normalizeText(l.textContent) === 'avaliacao rapida');
    return label && label.getAttribute('for') ? doc.getElementById(label.getAttribute('for')) : null;
  }

  function studentName(cell) {
    if (!cell) return '';
    const link = cell.querySelector('a[href*="/user/view.php"]') || cell.querySelector('a') || cell;
    const clone = link.cloneNode(true);
    clone.querySelectorAll('img, .userinitials, .accesshide, .visually-hidden, .sr-only').forEach(n => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim()
      || (link.getAttribute('title') || link.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  }

  // Linhas da página: { userId, name, gradeText, feedbackText, row, gradeInput, feedbackTextarea }
  function readRows(doc) {
    const table = doc.querySelector('table#submissions');
    if (!table) return [];
    const out = [];
    const seen = new Set();
    for (const row of table.querySelectorAll('tbody tr')) {
      const gradeInput = row.querySelector(GRADE_SELECTOR);
      const feedbackTextarea = row.querySelector(FEEDBACK_SELECTOR);
      const fieldName = (gradeInput || feedbackTextarea || {}).name || '';
      const userId = (fieldName.match(/^quickgrade_(?:comments_)?(\d+)$/) || [])[1];
      if (!userId || seen.has(userId)) continue;
      const name = studentName(row.querySelector('td.username, td[class~="username"], .cell.username'));
      if (!name) continue;
      seen.add(userId);
      out.push({
        userId, name, row, gradeInput, feedbackTextarea,
        gradeText: gradeInput ? gradeInput.value.trim() : '',
        feedbackText: feedbackTextarea ? feedbackTextarea.value.trim() : ''
      });
    }
    return out;
  }

  const SELECT_BOX = 'input[name="selectedusers"][value], input[id^="selectuser_"]';
  const FILE_LINKS = 'td:not(.username) a[href*="pluginfile.php"]:not([href*="/user/icon"]):not([href*="/user/"])';

  function rowUserId(row) {
    const box = row.querySelector(SELECT_BOX);
    const fromBox = box ? (box.value || box.id.replace(/^selectuser_/, '')) : '';
    if (/^\d+$/.test(fromBox)) return fromBox;
    const field = row.querySelector(`${GRADE_SELECTOR}, ${FEEDBACK_SELECTOR}`);
    return ((field && field.name.match(/^quickgrade_(?:comments_)?(\d+)$/)) || [])[1] || '';
  }

  // Quantos arquivos cada aluno enviou (links de arquivo na linha). null quando a tabela não mostra arquivos em
  // nenhuma linha (atividade de texto online, ou página que não sei ler): nesse caso "0" seria palpite.
  function readSubmissionFiles(doc) {
    const table = doc.querySelector('table#submissions');
    if (!table) return null;
    const counts = new Map();
    let any = false;
    for (const row of table.querySelectorAll('tbody tr')) {
      const id = rowUserId(row);
      if (!id) continue;
      const n = row.querySelectorAll(FILE_LINKS).length;
      if (n) any = true;
      counts.set(id, n);
    }
    return any ? counts : null;
  }

  // Alunos da listagem (inclusive a filtrada por "Requer notas"): { userId, name, files|null }.
  function readPendingStudents(doc) {
    const table = doc.querySelector('table#submissions');
    if (!table) return [];
    const files = readSubmissionFiles(doc);
    const out = [];
    const seen = new Set();
    for (const row of table.querySelectorAll('tbody tr')) {
      const userId = rowUserId(row);
      if (!userId || seen.has(userId)) continue;
      const name = studentName(row.querySelector('td.username, td[class~="username"], .cell.username'));
      if (!name) continue;
      seen.add(userId);
      out.push({ userId, name, files: files ? files.get(userId) ?? 0 : null });
    }
    return out;
  }

  // Nota máxima lida do texto "/ 100" ao lado do campo de nota. null se não houver certeza (nunca chuta 50).
  // Moodle: <div class="w-100"><label>…</label><input name="quickgrade_N">&nbsp;/&nbsp;1</div> (o &nbsp; conta como espaço).
  const MAX_AFTER_SLASH = /\/\s*(\d+(?:[.,]\d+)?)\s*$/m;
  function maxNear(input) {
    for (const box of [input.parentElement, input.closest('td')]) {
      const m = ((box && box.textContent) || '').match(MAX_AFTER_SLASH);
      if (m) return Number(m[1].replace(',', '.'));
    }
    return null;
  }

  function readMaxGrade(doc) {
    const found = new Set();
    for (const input of doc.querySelectorAll(`table#submissions ${GRADE_SELECTOR}`)) {
      const value = maxNear(input);
      if (value !== null && Number.isFinite(value)) found.add(value);
    }
    return found.size === 1 ? [...found][0] : null;
  }

  function decimalSeparator(doc) {
    const values = [...doc.querySelectorAll(`table#submissions ${GRADE_SELECTOR}`)].map(i => i.value).join(' ');
    if (/\d,\d/.test(values)) return ',';
    const cells = [...doc.querySelectorAll('table#submissions td.grade, table#submissions td.c4')].map(c => c.textContent).join(' ');
    return /\d,\d/.test(cells) ? ',' : '.';
  }

  // O Moodle mostra só uma página de alunos por vez; avisa quando houver mais.
  function pagination(doc) {
    const nav = doc.querySelector('nav.pagination, ul.pagination, .paging');
    const pages = nav ? nav.querySelectorAll('a.page-link, .page-item a, .paging a').length : 0;
    const summary = (doc.querySelector('.gradingsummary, .submissionsummarytable') || {}).textContent || '';
    return { hasMorePages: pages > 0, summary: summary.replace(/\s+/g, ' ').trim() };
  }

  function fire(field) {
    const win = field.ownerDocument.defaultView;
    for (const type of ['input', 'change']) field.dispatchEvent(new win.Event(type, { bubbles: true }));
    field.dispatchEvent(new win.Event('blur', { bubbles: true }));
  }

  // Escreve só o que o plano marcou como 'ready'. Retorna quantos campos foram escritos.
  function fillPlan(plan) {
    let written = 0;
    for (const item of plan.items) {
      if (item.status !== 'ready') continue;
      for (const change of item.changes) {
        const field = change.field === 'grade' ? item.row.gradeInput : item.row.feedbackTextarea;
        if (!field) continue;
        field.value = change.to;
        fire(field);
        written++;
      }
    }
    return written;
  }

  const SAVE_TEXTS = ['salvar todas as alteracoes de avaliacao rapida', 'save all quick grading changes'];
  const CONTROL_SELECTOR = 'input[type="submit"], input[type="button"], button[type="submit"], button:not([type])';
  const controlText = el => normalizeText(el.value || el.textContent || el.getAttribute('aria-label') || '');

  // Botão "Salvar todas as alterações de avaliação rápida". Procura por nome, depois pelo texto, depois
  // pelo único botão "salvar" do formulário da tabela. Sem certeza, devolve null (nunca clica num botão errado).
  function saveButton(doc) {
    const byName = doc.querySelector('[name="savequickgrades"]');
    if (byName) return byName;
    const controls = [...doc.querySelectorAll(CONTROL_SELECTOR)];
    const exact = controls.find(c => SAVE_TEXTS.includes(controlText(c)));
    if (exact) return exact;
    const table = doc.querySelector('table#submissions');
    const form = table && table.closest('form');
    if (form) {
      const likely = controls.filter(c => form.contains(c) && /salvar|save/.test(controlText(c)));
      if (likely.length === 1) return likely[0];
    }
    return null;
  }

  // Controles de envio da página (para diagnóstico quando o botão de salvar não é achado).
  function describeControls(doc) {
    return [...doc.querySelectorAll(CONTROL_SELECTOR)].slice(0, 15).map(c => ({
      tag: c.tagName.toLowerCase(), type: c.getAttribute('type') || '', name: c.getAttribute('name') || '', id: c.id || '', text: (c.value || c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    }));
  }

  // Botão "Nota" da barra de ferramentas (abre o avaliador). Nosso botão fica ao lado dele.
  function toolbarAnchor(doc) {
    const main = doc.querySelector('[role="main"], #region-main') || doc;
    const byUrl = main.querySelector('a[href*="action=grader"]');
    if (byUrl) return byUrl;
    return [...main.querySelectorAll('a.btn, button.btn, a[role="button"]')].find(el => ['nota', 'avaliar', 'grade'].includes(normalizeText(el.textContent))) || null;
  }

  root.IMN.moodle = { readSubmissionFiles, readPendingStudents, readiness, readRows, readMaxGrade, decimalSeparator, pagination, fillPlan, saveButton, describeControls, toolbarAnchor, quickGradingCheckbox };
})(globalThis);
