// Recupera materiais do Moodle (mesma origem) no momento de criar o pacote de correção.
// Mantém o PDF/DOCX/ODT original; páginas HTML viram texto legível; falhas ficam explícitas.
(function (root) {
  'use strict';
  const MAX_BYTES = 35 * 1024 * 1024;
  const MAX_MATERIALS = 5;
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
  const namePart = value => root.IMN.downloads.sanitizeSegment(value, 'Enunciado').slice(0, 88);
  const mimeExt = {
    'application/pdf': 'pdf', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.oasis.opendocument.text': 'odt', 'application/rtf': 'rtf',
    'text/plain': 'txt', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls', 'application/zip': 'zip', 'image/png': 'png',
    'image/jpeg': 'jpg', 'image/webp': 'webp'
  };
  function assertSameOrigin(url, origin) {
    const resolved = new URL(url, origin);
    if (resolved.origin !== origin || !/^https?:$/.test(resolved.protocol)) throw new Error('Origem diferente do Moodle: acesso não autorizado.');
    return resolved.href;
  }
  function parseFilename(response, url, fallback) {
    const disposition = response.headers.get('content-disposition') || '';
    let match = disposition.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
    let filename = '';
    if (match) { try { filename = decodeURIComponent(match[1].replace(/^['"]|['"]$/g, '')); } catch (_) { /* ignore */ } }
    if (!filename) { match = disposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i); filename = clean(match?.[1] || match?.[2] || ''); }
    if (!filename) { try { filename = decodeURIComponent(new URL(url).pathname.split('/').pop()); } catch (_) { /* ignore */ } }
    if (!filename || /^(view|pluginfile)\.php$/i.test(filename)) filename = namePart(fallback);
    // Nome original pode conter caminhos (ZIP Slip), caracteres especiais ou nomes de diretórios.
    filename = namePart(filename.split(/[\\/]/).pop());
    const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!/\.[a-z0-9]{2,6}$/i.test(filename)) filename += `.${mimeExt[mime] || 'bin'}`;
    return filename;
  }
  function nodeText(node) {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('script,style,form,button,nav,.accesshide,.visually-hidden,.sr-only').forEach(n => n.remove());
    for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
    for (const block of copy.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,div,section,tr')) block.append('\n');
    const text = (copy.textContent || '').replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const links = [...copy.querySelectorAll('a[href]')].map(a => `- ${clean(a.textContent || 'Link')}: ${a.href || a.getAttribute('href')}`);
    return `${text}${links.length ? `\n\nLinks do conteúdo:\n${links.join('\n')}` : ''}`.slice(0, 180000);
  }
  function parseIntro(doc) {
    for (const selector of ['#intro', '.mod_introbox', '.activity-description', '[data-region="activity-description"]', '.box.generalbox']) {
      for (const node of doc.querySelectorAll(selector)) {
        const text = nodeText(node);
        if (text.length >= 25) return text;
      }
    }
    return '';
  }
  function findFileLink(doc, base, origin) {
    const selectors = [
      '.resourceworkaround a[href]', '.resourcecontent a[href]',
      '.resourcecontent iframe[src]', '.resourcecontent embed[src]',
      'a[href*="/pluginfile.php/"]', 'a[href*="/webservice/pluginfile.php/"]',
      'iframe[src*="/pluginfile.php/"]', 'object[data*="/pluginfile.php/"]'
    ];
    for (const selector of selectors) for (const node of doc.querySelectorAll(selector)) {
      const raw = node.getAttribute('href') || node.getAttribute('src') || node.getAttribute('data');
      try {
        const url = assertSameOrigin(new URL(raw, base).href, origin);
        if (url !== base) return url;
      } catch (_) { /* externa ou inválida: não baixamos automaticamente */ }
    }
    return '';
  }
  async function readLimited(response) {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error(`Arquivo maior que ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
    if (!response.body?.getReader) {
      const blob = await response.blob();
      if (blob.size > MAX_BYTES) throw new Error('Arquivo excedeu o limite de tamanho.');
      return blob;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) throw new Error('Arquivo excedeu o limite de tamanho.');
        chunks.push(value);
      }
    } finally { try { await reader.cancel(); } catch (_) { /* concluído */ } }
    return new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
  }
  async function fetchOne(url, { origin, fetchImpl, timeoutMs }) {
    assertSameOrigin(url, origin);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal, headers: { Accept: 'application/pdf,application/octet-stream,text/html,*/*;q=0.8' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const finalUrl = assertSameOrigin(response.url || url, origin);
      const blob = await readLimited(response);
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if ((type.includes('text/html') || type.includes('application/xhtml+xml')) && !response.headers.get('content-disposition')?.toLowerCase().includes('attachment')) {
        const html = await blob.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (root.IMN.pages.looksLikeLogin(new URL(finalUrl), html)) throw new Error('Sessão do Moodle expirada.');
        return { doc, finalUrl, response };
      }
      return { data: blob, filename: parseFilename(response, finalUrl, url.split('/').pop() || 'Enunciado'), finalUrl };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao buscar o enunciado.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function getMaterial(material, ctx) {
    if (material.type === 'label' && material.inlineText) {
      return { data: `Título: ${material.name}\nOrigem: seção do curso, módulo ${material.id}\n\n${material.inlineText}`, filename: `${namePart(material.name)}.txt`, source: material.href };
    }
    const first = await fetchOne(material.href, ctx);
    if (first.data) return { data: first.data, filename: first.filename, source: first.finalUrl };
    if (material.type === 'resource' || material.type === 'folder') {
      const asset = findFileLink(first.doc, first.finalUrl, ctx.origin);
      if (asset) {
        const second = await fetchOne(asset, ctx);
        if (second.data) return { data: second.data, filename: second.filename, source: second.finalUrl };
      }
    }
    const text = parseIntro(first.doc) || nodeText(first.doc.querySelector('.resourcecontent, .mod_page-content, [role="main"] .box.generalbox, #region-main .box.generalbox'));
    if (!text) throw new Error('A página não disponibilizou conteúdo ou arquivo legível.');
    return { data: `Título: ${material.name}\nOrigem: ${material.href}\n\n${text}`, filename: `${namePart(material.name)}.txt`, source: first.finalUrl };
  }
  async function readAssignmentIntro(assignment, ctx) {
    const result = await fetchOne(assignment.href, ctx);
    return result.doc ? parseIntro(result.doc) : '';
  }
  function excerptOf(result) {
    if (typeof result.data === 'string') return result.data.slice(0, 1900);
    return ''; // Não envia bytes de PDF/DOCX para um classificador de texto.
  }
  // Falhas isoladas: os envios permanecem disponíveis mesmo se um material não abrir.
  async function collectForAssignment(assignment, { origin, governor, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
    const ctx = { origin, fetchImpl, timeoutMs };
    const run = fn => governor ? governor.run(fn) : fn();
    const files = [], warnings = [], links = [];
    const selected = (assignment.materials || []).slice(0, MAX_MATERIALS);
    const ambiguous = selected.filter(m => m.role === 'enunciado' && m.confidence === 'revisar');
    const fetched = [];
    for (const m of selected) {
      links.push(`${m.role === 'folha_resposta' ? 'Folha de resposta' : 'Enunciado'}: ${m.name} | módulo ${m.id} | ${m.href} | confiança ${m.confidence}`);
      try {
        const result = await run(() => getMaterial(m, ctx));
        fetched.push({ material: m, result });
      } catch (error) { warnings.push(`${m.name}: ${error.message}`); }
    }
    // A descrição original do envio ajuda a distinguir materiais com nomes quase iguais.
    let assignmentIntro = '';
    try { assignmentIntro = await run(() => readAssignmentIntro(assignment, ctx)); }
    catch (error) { warnings.push(`Descrição da tarefa: ${error.message}`); }
    let ai = { status: 'nao_necessario', id: null };
    if (ambiguous.length > 1 && root.IMN.localAI) {
      const candidates = ambiguous.map(m => {
        const match = fetched.find(f => f.material.id === m.id);
        return { id: m.id, name: m.name, excerpt: match ? excerptOf(match.result) : '' };
      });
      ai = await root.IMN.localAI.chooseStatement(assignment, candidates, { targetText: assignmentIntro });
    }
    const hasAmbiguity = ambiguous.length > 1 && ai.status !== 'classificado';
    const confirmedByAI = ai.status === 'classificado' ? ai.id : null;
    if (ambiguous.length) {
      if (confirmedByAI) warnings.push('IA local utilizada para desempate; confira o vínculo antes de atribuir notas.');
      else if (hasAmbiguity) warnings.push(`Múltiplos candidatos a enunciado, sem desempate seguro (IA local: ${ai.status}). Conferir manualmente.`);
      else warnings.push('Enunciado associado por proximidade; conferir se corresponde à tarefa.');
    }
    for (const { material: m, result } of fetched) {
      const isReview = m.role === 'enunciado' && m.confidence === 'revisar';
      const confirmed = confirmedByAI && m.id === confirmedByAI;
      files.push({ role: isReview && !confirmed ? 'possivel_enunciado' : m.role, title: m.name,
        confidence: confirmed ? 'ia_local_revisar' : m.confidence, moduleId: m.id, ...result });
    }
    // Em muitos cursos o enunciado está na descrição da própria tarefa de envio.
    if (assignmentIntro) files.push({ role: 'orientacoes', title: 'Descrição da tarefa', filename: 'Orientacoes da tarefa.txt',
      data: `Atividade: ${assignment.name}\nOrigem: ${assignment.href}\n\n${assignmentIntro}`, source: assignment.href, confidence: 'direta' });
    const direct = files.some(f => f.role === 'orientacoes' || (f.role === 'enunciado' && f.confidence === 'alta'));
    const aiSelected = files.some(f => f.role === 'enunciado' && f.confidence === 'ia_local_revisar');
    const status = direct ? 'extraido' : aiSelected ? 'revisao_necessaria' :
      files.some(f => f.role === 'possivel_enunciado') ? 'revisao_necessaria' :
      selected.some(m => m.role === 'enunciado') ? 'falha_na_extracao' : 'nao_localizado';
    if (status !== 'extraido') warnings.push('Enunciado não confirmado com segurança. Verifique manualmente no Moodle antes de corrigir.');
    const audit = [
      `ATIVIDADE: ${assignment.name} (módulo ${assignment.assignmentId})`, `Página dos envios: ${assignment.href}`,
      `Status do enunciado: ${status}`, `Modelo de desempate: ${root.IMN.localAI?.MODEL || 'nenhum'}`,
      `Desempate com IA local: ${ai.status}${ai.id ? ` | módulo sugerido ${ai.id}` : ''}${ai.score != null ? ` | similaridade ${ai.score} | diferença ${ai.gap} | dispositivo ${ai.device}` : ''}`, 
      '', 'VÍNCULOS IDENTIFICADOS:', ...(links.length ? links : ['Nenhum módulo de enunciado associado com segurança.']),
      '', 'ARQUIVOS EXTRAÍDOS:', ...(files.length ? files.map(f => `${f.role}: ${f.filename} | ${f.source} | confiança ${f.confidence}`) : ['Nenhum']),
      '', 'AVISOS:', ...(warnings.length ? warnings : ['Nenhum'])
    ].join('\n');
    return { files, warnings, status, audit };
  }
  root.IMN.enunciados = { collectForAssignment, getMaterial, parseIntro, findFileLink, parseFilename, MAX_BYTES };
})(globalThis);
