// Relaciona enunciados, folhas de resposta e tarefas de envio no Moodle.
// A chave (SAP/etapa/atividade), a seção e a proximidade são mais confiáveis que IA.
(function (root) {
  'use strict';
  const TYPES = new Set(['resource', 'page', 'url', 'book', 'folder', 'label']);
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const norm = s => clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const significant = s => norm(s).replace(/^(?:enviar|entrega|postagem|envio)\s*[-–:]?\s*/, '')
    .replace(/^(?:folha\s*(?:de\s*)?resposta|modelo\s*(?:de\s*)?resposta|gabarito)\s*[-–:]?\s*/, '')
    .replace(/\b(?:arquivo|tarefa|pagina)\s*$/, '').trim();
  function key(name) {
    const n = significant(name);
    let m = n.match(/\bsap\s*[-.:nº°#]*\s*0*(\d+)\b(?:\s*[-.:/]?\s*(?:etapa|parte|fase)\s*0*(\d+)\b)?/);
    if (m) return { family: 'sap', number: Number(m[1]), part: m[2] ? Number(m[2]) : null };
    m = n.match(/\batividad(?:e|es)\s+extras?\s*[-.:nº°#]*\s*0*(\d+)\b/);
    if (m) return { family: 'extra', number: Number(m[1]), part: null };
    m = n.match(/\bsuperac(?:ao|oes)\s*[-.:nº°#]*\s*([a-z]|\d+)\b/);
    if (m) return { family: 'superacao', number: m[1], part: null };
    m = n.match(/\batividad(?:e|es)\s*[-.:nº°#]*\s*0*(\d+)\b/);
    if (m) return { family: 'atividade', number: Number(m[1]), part: null };
    return { family: 'text', number: n.replace(/[^a-z0-9]+/g, ' ').trim(), part: null };
  }
  const isAnswerSheet = name => /\b(folha\s*(?:de\s*)?resposta|modelo\s*(?:de\s*)?resposta|template|formulario\s*(?:de\s*)?resposta)\b/.test(norm(name));
  const isSubmissionName = name => /^(enviar|envio|postagem|entrega)\b/.test(norm(name));
  const sameTopic = (a, b) => Boolean(a && b && a.family === b.family && a.family !== 'text' && a.number === b.number && (a.part === null || b.part === null || a.part === b.part));
  function moduleType(href, card) {
    const cl = typeof card?.className === 'string' ? card.className : '';
    const m = cl.match(/\bmodtype_([a-z]+)\b/);
    if (m) return m[1];
    const match = String(href || '').match(/\/mod\/([a-z]+)\/view\.php/i);
    return match ? match[1].toLowerCase() : 'label';
  }
  const moduleId = n => String(n?.getAttribute('data-id') || (n?.id || '').replace(/^(?:module-|course-index-cm-)/, '') || '');
  function mainModules(doc, baseUrl) {
    const result = new Map();
    const main = doc.querySelector('[role="main"], #region-main') || doc;
    for (const card of main.querySelectorAll('li.activity[id^="module-"], li.activity[data-id]')) {
      const id = moduleId(card);
      if (!id) continue;
      const link = card.querySelector('.activityname a[href], .activitytitle a[href], a.aalink[href]');
      let href = '';
      if (link) { try { href = new URL(link.getAttribute('href'), baseUrl).href; } catch (_) { /* sem URL */ } }
      const type = moduleType(href, card);
      const title = clean(card.querySelector('[data-activityname]')?.getAttribute('data-activityname') || card.querySelector('.instancename')?.textContent || link?.textContent || '');
      // Labels frequentemente contêm o enunciado integral sem link ou título de módulo.
      const inlineNode = type === 'label' ? card.querySelector('.activity-altcontent, .no-overflow') : null;
      const inlineText = clean(inlineNode?.textContent || '').slice(0, 180000);
      if (!href && !inlineText) continue;
      result.set(id, { id, name: title || (inlineText ? inlineText.slice(0, 100) : 'Conteúdo'), type, href, inlineText });
    }
    return result;
  }
  function collectModules(doc, baseUrl) {
    const main = mainModules(doc, baseUrl);
    const out = [], seen = new Set();
    for (const section of doc.querySelectorAll('.courseindex-section[data-for="section"], #courseindex .courseindex-section')) {
      const sectionId = String(section.getAttribute('data-id') || section.id || '');
      for (const node of section.querySelectorAll('li[data-for="cm"][data-id]')) {
        const id = moduleId(node), link = node.querySelector('a[data-for="cm_name"][href], a.courseindex-link[href]');
        if (!id || !link || seen.has(id)) continue;
        let href;
        try { href = new URL(link.getAttribute('href'), baseUrl).href; } catch (_) { continue; }
        const fromMain = main.get(id);
        // Quando o Moodle mostra "uma seção por página", o índice mantém os links
        // diretos dos recursos mesmo que a seção não esteja no corpo principal.
        out.push({ id, sectionId, position: out.length, name: fromMain?.name || clean(link.textContent),
          href: fromMain?.href || href, type: fromMain?.type || moduleType(href), inlineText: fromMain?.inlineText || '' });
        seen.add(id);
      }
    }
    for (const item of main.values()) if (!seen.has(item.id)) out.push({ ...item, sectionId: 'main-only', position: out.length });
    return out;
  }
  function matchMaterials(modules, assignment) {
    const target = modules.find(m => m.id === String(assignment.assignmentId));
    if (!target) return [];
    const targetKey = key(assignment.name || target.name);
    const candidates = [];
    for (const item of modules) {
      if (item.id === target.id || item.sectionId !== target.sectionId || !TYPES.has(item.type)) continue;
      const distance = target.position - item.position;
      if (distance < -1 || distance > 7) continue;
      const materialKey = key(item.name + ' ' + (item.type === 'label' ? item.inlineText.slice(0, 250) : ''));
      const exactTopic = sameTopic(targetKey, materialKey);
      // Sem numeração, a proximidade só serve para indicar candidato a revisão,
      // nunca para afirmar automaticamente que um material é o enunciado.
      const nearbyFallback = !exactTopic && distance > 0 && distance <= 2 && materialKey.family === 'text' && item.type !== 'url';
      if (!exactTopic && !nearbyFallback) continue;
      const answer = isAnswerSheet(item.name);
      const possiblyMisnamed = isSubmissionName(item.name) && !answer;
      // Alguns cursos rotulam o próprio arquivo do enunciado como 'Enviar - ...'.
      // Só considerar um recurso imediatamente anterior e exigir revisão.
      if (possiblyMisnamed && !(exactTopic && item.type === 'resource' && distance === 1)) continue;
      if (item.type === 'label' && !item.inlineText && !exactTopic) continue;
      const partMatch = targetKey.part !== null && materialKey.part === targetKey.part;
      const score = (exactTopic ? 120 : 35) + (partMatch ? 12 : 0) - Math.abs(distance) * 5 - (distance < 0 ? 20 : 0) - (possiblyMisnamed ? 15 : 0);
      candidates.push({ ...item, role: answer ? 'folha_resposta' : 'enunciado', confidence: exactTopic && !possiblyMisnamed ? 'alta' : 'revisar', score });
    }
    candidates.sort((a, b) => b.score - a.score || a.position - b.position);
    const statements = candidates.filter(c => c.role === 'enunciado');
    const sheets = candidates.filter(c => c.role === 'folha_resposta');
    const out = [];
    if (statements.length) {
      const top = statements[0];
      const possible = statements.filter(c => c.score >= top.score - 12).slice(0, 3);
      if (possible.length > 1) possible.forEach(c => { c.confidence = 'revisar'; c.ambiguous = true; });
      out.push(...possible);
    }
    if (sheets.length) out.push(sheets[0]);
    return out;
  }
  function attachMaterials(doc, baseUrl, assignments) {
    const modules = collectModules(doc, baseUrl);
    return assignments.map(a => ({ ...a, materials: matchMaterials(modules, a) }));
  }
  root.IMN.materials = { key, sameTopic, isAnswerSheet, collectModules, matchMaterials, attachMaterials };
})(globalThis);
