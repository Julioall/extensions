// Escopo de leitura: nunca buscar todos os cursos/atividades por padrão.
// Conservador: itens sem estado comprovável ficam FORA da consulta e são contabilizados como ignorados.
(function (root) {
  'use strict';
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const MONTHS = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};
  const ENGLISH = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  function parseDate(raw) {
    const value = norm(raw);
    // ISO 8601 presente em <time datetime> ou microdados.
    if (/^\d{4}-\d\d-\d\d/.test(value)) {
      const dt = new Date(value);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const br = value.match(/\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s+(\d{4})(?:\s*,?\s*(\d{1,2}):(\d{2}))?/);
    if (br) return new Date(+br[3], MONTHS[br[2]], +br[1], +(br[4] || 0), +(br[5] || 0));
    const compact = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (compact) return new Date(+compact[3], +compact[2] - 1, +compact[1], +(compact[4] || 0), +(compact[5] || 0));
    const en = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s*,?\s*(\d{1,2}):(\d{2}))?/);
    if (en) return new Date(+en[3], ENGLISH[en[1]], +en[2], +(en[4] || 0), +(en[5] || 0));
    return null;
  }

  function dateState(element, now) {
    if (!element) return 'unknown';
    let opened = null, closed = null;
    const chunks = [...element.querySelectorAll('[data-region="activity-dates"] > div, .activity-dates > div, .activity-dates time, time[datetime]')];
    for (const node of chunks) {
      const text = norm(node.textContent);
      const date = parseDate(node.getAttribute('datetime') || text);
      if (!date) continue;
      if (/^(aberto|abre em|disponivel desde|open|available from)/.test(text)) opened = date;
      if (/^(fechado|fecha|fechamento|data limite|cut.off|closed|close|until)/.test(text)) closed = date;
    }
    if (opened && now < opened) return 'future';
    if (closed && now > closed) return 'closed';
    if (opened || closed) return 'active';
    return 'unknown';
  }

  function activityState(assignment, doc, now = new Date()) {
    const link = assignment.link;
    // A data costuma estar no .activity-item, não no link/instancename.
    const card = link?.closest('li.activity') || link?.closest('.activity-item') || assignment.card;
    if (!card) return 'unknown';
    const text = norm(card.textContent);
    if (/\b(encerrad[ao]s?|fechad[ao]s?|not available|indisponivel)\b/.test(text) && !card.querySelector('.activity-dates')) return 'closed';
    if (/\b(ainda nao (?:esta )?disponivel|not yet available)\b/.test(text)) return 'future';
    const dated = dateState(card, now);
    if (dated !== 'unknown') return dated;
    if (/\b(em andamento|in progress|disponivel agora|aberta? para envios)\b/.test(text)) return 'active';
    return 'unknown';
  }

  function selectAssignments(assignments, doc, now = new Date(), { restrictSection = true, sectionNumber = null, includeUndated = false, includeIndexUndated = false } = {}) {
    const main = doc.querySelector('[role="main"], #region-main');
    const sections = [...(main?.querySelectorAll('.single-section li.course-section[data-sectionid]') || [])];
    const section = sectionNumber !== null
      ? sections.find(s => s.getAttribute('data-sectionid') === String(sectionNumber)) || null
      : sections.at(-1) || null;
    // O índice lateral é separado do miolo da página. Usar o número da seção
    // como alternativa, em vez de descartar tarefas visíveis como "fora da seção".
    const visible = restrictSection && (section || sectionNumber !== null)
      ? assignments.filter(a =>
          (section && section.contains(a.link)) ||
          (a.fromIndex && a.sectionNumber !== null && String(a.sectionNumber) === String(sectionNumber ?? section?.getAttribute('data-sectionid')))
        )
      : assignments;
    const excludedSection = assignments.length - visible.length;
    const active = [], excluded = { future: 0, closed: 0, unknown: 0, section: excludedSection, undated: 0 };
    for (const assignment of visible) {
      const state = activityState(assignment, doc, now);
      if (state === 'active') active.push(assignment);
      else if (state === 'unknown' && includeUndated && (!assignment.fromIndex || includeIndexUndated)) {
        // Um módulo sem datas não pode ser tratado como inativo. Na categoria,
        // também aceitamos módulos presentes apenas no índice lateral, pois a
        // página de curso pode mostrar uma única seção por vez. A consulta à
        // página da atividade verificará a contagem real de envios pendentes.
        active.push(assignment);
        excluded.undated += 1;
      } else excluded[state] = (excluded[state] || 0) + 1;
    }
    return { active, excluded, total: assignments.length };
  }

  function courseState(course, now = new Date()) {
    const card = course.link?.closest('.coursebox, .dashboard-card, .course-card, [data-region="course-card"], .card.course, .course-info-container, li.course') || course.link?.parentElement;
    if (!card) return 'unknown';
    // Dados explícitos da data de início/fim ou status do cartão; não classificar pelo nome do curso.
    const statusNode = card.querySelector('[data-course-status], .course-status, [data-region="course-status"], .course-progress-status');
    const status = norm(statusNode?.getAttribute('data-course-status') || statusNode?.textContent || '');
    if (/\b(em andamento|in progress|ongoing)\b/.test(status)) return 'active';
    if (/\b(concluido|finalizado|encerrado|not started|nao iniciado|past|future|completed)\b/.test(status)) return 'inactive';
    const start = card.querySelector('time[data-start], [data-course-start], [data-startdate]');
    const end = card.querySelector('time[data-end], [data-course-end], [data-enddate]');
    const startDate = parseDate(start?.getAttribute('datetime') || start?.getAttribute('data-course-start') || start?.getAttribute('data-startdate') || '');
    const endDate = parseDate(end?.getAttribute('datetime') || end?.getAttribute('data-course-end') || end?.getAttribute('data-enddate') || '');
    if (startDate && now < startDate) return 'inactive';
    if (endDate && now > endDate) return 'inactive';
    if (startDate && endDate) return 'active';
    // Alguns cartões não têm nó de status, mas apresentam uma etiqueta textual específica.
    const label = [...card.querySelectorAll('.badge, .badge-pill, .coursecategory, .status')].map(n => norm(n.textContent));
    if (label.some(s => /^(em andamento|in progress)$/.test(s))) return 'active';
    if (label.some(s => /^(concluido|encerrado|finalizado|nao iniciado|not started)$/.test(s))) return 'inactive';
    return 'unknown';
  }

  function selectCourses(courses, now = new Date()) {
    const active = []; const excluded = { inactive: 0, unknown: 0 };
    for (const course of courses) {
      const state = courseState(course, now);
      if (state === 'active') active.push(course);
      else excluded[state] += 1;
    }
    return { active, excluded, total: courses.length };
  }
  root.IMN.scope = { parseDate, dateState, activityState, selectAssignments, courseState, selectCourses };
})(globalThis);
