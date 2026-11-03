;
/* Original Corrections: src/core/namespace.js */
// Namespace global compartilhado pelos módulos (sem bundler). Ordem de carga definida no manifest.json.
(function (root) {
  'use strict';
  root.IMN = root.IMN || {};
})(globalThis);


;
/* Original Corrections: src/core/text.js */
// Normalização de texto para comparação. Sem DOM.
(function (root) {
  'use strict';

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’']/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Neutraliza fórmulas de planilha em qualquer CSV gerado pela extensão.
  function csvCell(value, delimiter = ';') {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
      text = `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  root.IMN.text = { normalizeText, escapeHtml, csvCell };
})(globalThis);


;
/* Original Corrections: src/core/limits.js */
// Limites de segurança para arquivos importados. Arquivo acima disso é recusado, nunca truncado em silêncio.
(function (root) {
  'use strict';
  root.IMN.limits = Object.freeze({
    MAX_FILE_BYTES: 5 * 1024 * 1024,
    MAX_RECORDS: 5000,
    MAX_CELLS: 50000,
    MAX_CELL_CHARS: 20000,
    MAX_XLSX_ENTRY_BYTES: 20 * 1024 * 1024,
    MAX_XLSX_TOTAL_BYTES: 40 * 1024 * 1024,
    MAX_XLSX_ENTRIES: 500
  });
})(globalThis);


;
/* Original Corrections: src/core/grade.js */
// Leitura ESTRITA de notas. Nunca "adivinha": se não der para ter certeza, rejeita com motivo.
// Corrige o defeito da versão 0.8.1, que removia caracteres e transformava "8 de 10" em 810.
(function (root) {
  'use strict';

  const MAX_DECIMALS = 5;

  // Retorna { ok, empty, canonical, value, error }.
  // canonical usa "." como decimal e é a forma usada para comparar e gravar (após formatGrade).
  // opts.max: nota máxima da atividade (número) ou null. Aceita "45/50" só se o denominador == max.
  function parseGrade(raw, opts = {}) {
    const max = Number.isFinite(opts.max) ? opts.max : null;
    let text = String(raw ?? '').replace(/[   ]/g, ' ').trim();
    text = text.replace(/^(["'])(.*)\1$/, '$2').trim();
    if (!text) return { ok: true, empty: true, canonical: '', value: null };

    const fraction = text.match(/^(.+?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
    if (fraction) {
      const denominator = Number(fraction[2].replace(',', '.'));
      if (max === null || denominator !== max) {
        return fail(`"${raw}" usa fração; informe só o número (nota máxima da atividade: ${max ?? 'desconhecida'}).`);
      }
      text = fraction[1].trim();
    }

    if (!/^\d[\d.,]*$/.test(text)) return fail(`"${raw}" não é um número válido (use só dígitos, vírgula ou ponto).`);

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let integerPart;
    let decimalPart = '';

    if (lastComma !== -1 && lastDot !== -1) {
      // Os dois separadores: o último é decimal, o outro só pode ser milhar (grupos de 3).
      const decimalIndex = Math.max(lastComma, lastDot);
      const thousandsChar = lastComma > lastDot ? '.' : ',';
      integerPart = text.slice(0, decimalIndex);
      decimalPart = text.slice(decimalIndex + 1);
      if (integerPart.includes(text[decimalIndex])) return fail(`"${raw}" tem separadores ambíguos.`);
      if (!new RegExp(`^\\d{1,3}(\\${thousandsChar}\\d{3})+$`).test(integerPart)) {
        return fail(`"${raw}" tem separadores ambíguos.`);
      }
      integerPart = integerPart.split(thousandsChar).join('');
    } else if (lastComma !== -1 || lastDot !== -1) {
      const sep = lastComma !== -1 ? ',' : '.';
      if (text.split(sep).length > 2) return fail(`"${raw}" tem mais de um separador decimal.`);
      [integerPart, decimalPart] = text.split(sep);
      if (decimalPart === '') return fail(`"${raw}" termina em separador decimal.`);
    } else {
      integerPart = text;
    }

    if (integerPart === '' || decimalPart.length > MAX_DECIMALS) {
      return fail(`"${raw}" tem casas decimais demais (máximo ${MAX_DECIMALS}).`);
    }
    if (integerPart.length > 1 && integerPart.startsWith('0') && !/^0+$/.test(integerPart)) {
      integerPart = integerPart.replace(/^0+/, '') || '0';
    }

    const canonical = decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
    const value = Number(canonical);
    if (!Number.isFinite(value)) return fail(`"${raw}" não é um número válido.`);
    if (max !== null && value > max) return fail(`${canonical} é maior que a nota máxima (${max}).`);
    return { ok: true, empty: false, canonical, value };

    function fail(error) {
      return { ok: false, empty: false, canonical: '', value: null, error };
    }
  }

  // Texto para gravar no campo do Moodle, no separador decimal da página.
  function formatGrade(canonical, decimalSeparator = '.') {
    const text = String(canonical ?? '');
    return decimalSeparator === ',' ? text.replace('.', ',') : text;
  }

  // Converte desempenho 0–100 em nota proporcional à nota máxima (arredonda em 2 casas).
  function scalePercent(percent, max) {
    if (!Number.isFinite(percent) || !Number.isFinite(max)) return null;
    const scaled = Math.round((percent / 100) * max * 100) / 100;
    return String(scaled);
  }

  // Lê "45", "45,0" ou "45.00" da página e compara numericamente (a leitura de volta não pode depender do formato).
  function sameGrade(a, b) {
    const left = parseGrade(a);
    const right = parseGrade(b);
    if (!left.ok || !right.ok) return String(a ?? '').trim() === String(b ?? '').trim();
    if (left.empty || right.empty) return left.empty && right.empty;
    return left.value === right.value;
  }

  root.IMN.grade = { parseGrade, formatGrade, scalePercent, sameGrade, MAX_DECIMALS };
})(globalThis);


;
/* Original Corrections: src/core/csv.js */
// Leitura de CSV/TSV (aspas, delimitador automático). Sem DOM.
(function (root) {
  'use strict';
  const L = root.IMN.limits;

  function detectDelimiter(text) {
    const firstLine = splitFirstLine(text);
    let best = ';';
    let bestCount = 0;
    for (const delimiter of [';', '\t', ',']) {
      const count = countOutsideQuotes(firstLine, delimiter);
      if (count > bestCount) { best = delimiter; bestCount = count; }
    }
    return best;
  }

  function splitFirstLine(text) {
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (!inQuotes && (c === '\n' || c === '\r') ) return text.slice(0, i);
    }
    return text;
  }

  function countOutsideQuotes(line, delimiter) {
    let inQuotes = false;
    let count = 0;
    for (const c of line) {
      if (c === '"') inQuotes = !inQuotes;
      else if (!inQuotes && c === delimiter) count++;
    }
    return count;
  }

  // Retorna matriz de linhas. Lança Error se passar dos limites.
  function parseDelimited(input) {
    const text = String(input ?? '').replace(/^﻿/, '');
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let value = '';
    let inQuotes = false;
    let cells = 0;

    const pushCell = () => {
      if (value.length > L.MAX_CELL_CHARS) throw new Error(`Uma célula passa de ${L.MAX_CELL_CHARS} caracteres.`);
      row.push(value);
      value = '';
      if (++cells > L.MAX_CELLS) throw new Error(`O arquivo passa de ${L.MAX_CELLS} células.`);
    };
    const pushRow = () => {
      pushCell();
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      row = [];
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') { value += '"'; i++; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && char === delimiter) { pushCell(); continue; }
      if (!inQuotes && (char === '\n' || char === '\r')) {
        if (char === '\r' && next === '\n') i++;
        pushRow();
        continue;
      }
      value += char;
      if (value.length > L.MAX_CELL_CHARS) throw new Error(`Uma célula passa de ${L.MAX_CELL_CHARS} caracteres.`);
    }
    if (inQuotes) throw new Error('CSV inválido: aspas abertas sem fechamento.');
    pushRow();
    return rows;
  }

  // Decodifica bytes de CSV: UTF-8 estrito; se não for UTF-8 válido, assume Windows-1252 (Excel em pt-BR).
  function decodeText(buffer) {
    if (buffer.byteLength > L.MAX_FILE_BYTES) throw new Error('O arquivo passa de 5 MB.');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (_) {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  root.IMN.csv = { parseDelimited, detectDelimiter, decodeText };
})(globalThis);


;
/* Original Corrections: src/core/xlsx.js */
// Leitura mínima de XLSX (primeira planilha) com limites de descompressão. Sem DOM (XML por regex + entidades).
(function (root) {
  'use strict';
  const L = root.IMN.limits;

  function decodeEntities(text) {
    return text
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function textOf(xml) {
    const parts = [];
    for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) parts.push(decodeEntities(m[1]));
    return parts.join('');
  }

  function columnIndex(ref) {
    const letters = (String(ref).match(/^[A-Z]+/) || ['A'])[0];
    let index = 0;
    for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
    return index - 1;
  }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]));
  }

  function parseRels(xml) {
    const rels = {};
    if (!xml) return rels;
    for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = (m[1].match(/\bId="([^"]*)"/) || [])[1];
      const target = (m[1].match(/\bTarget="([^"]*)"/) || [])[1];
      if (id && target) rels[id] = target;
    }
    return rels;
  }

  function firstSheetPath(workbookXml, rels) {
    if (!workbookXml) return null;
    const sheet = workbookXml.match(/<sheet\b([^>]*)\/?>/);
    if (!sheet) return null;
    const relId = (sheet[1].match(/\br:id="([^"]*)"/) || sheet[1].match(/\bid="([^"]*)"/) || [])[1];
    const target = rels[relId];
    if (!target) return null;
    return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^xl\//, '')}`;
  }

  function parseSheet(xml, shared) {
    const rows = [];
    let cells = 0;
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        if (++cells > L.MAX_CELLS) throw new Error(`O arquivo passa de ${L.MAX_CELLS} células.`);
        const attrs = cell[1];
        const body = cell[2] || '';
        const ref = (attrs.match(/\br="([^"]*)"/) || [])[1] || '';
        const type = (attrs.match(/\bt="([^"]*)"/) || [])[1];
        let value = '';
        if (type === 'inlineStr') value = textOf(body);
        else {
          const raw = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
          value = type === 's' ? (shared[Number(raw)] ?? '') : decodeEntities(raw);
        }
        if (value.length > L.MAX_CELL_CHARS) throw new Error(`Uma célula passa de ${L.MAX_CELL_CHARS} caracteres.`);
        row[ref ? columnIndex(ref) : row.length] = value;
      }
      const dense = Array.from(row, cell => cell ?? '');
      if (dense.some(cell => String(cell).trim() !== '')) rows.push(dense);
    }
    return rows;
  }

  // Descompressão com teto de bytes: aborta assim que passar do limite (proteção contra zip bomb).
  async function inflateRaw(bytes, maxBytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não oferece DecompressionStream. Use CSV ou um Chrome atualizado.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('O XLSX descomprime para além do limite permitido; arquivo recusado.');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
    return out;
  }

  function readDirectory(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo XLSX inválido: diretório ZIP não encontrado.');
    const total = view.getUint16(eocd + 10, true);
    if (total === 0xffff) throw new Error('XLSX em formato ZIP64 não é suportado. Salve como CSV.');
    if (total > L.MAX_XLSX_ENTRIES) throw new Error('O XLSX tem arquivos internos demais.');
    let ptr = view.getUint32(eocd + 16, true);
    const entries = new Map();
    const decoder = new TextDecoder('utf-8');
    for (let i = 0; i < total; i++) {
      if (ptr + 46 > view.byteLength || view.getUint32(ptr, true) !== 0x02014b50) throw new Error('XLSX corrompido.');
      const flags = view.getUint16(ptr + 8, true);
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const nameLength = view.getUint16(ptr + 28, true);
      const extraLength = view.getUint16(ptr + 30, true);
      const commentLength = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLength));
      entries.set(name, { method, compressedSize, localOffset, encrypted: (flags & 1) === 1 });
      ptr += 46 + nameLength + extraLength + commentLength;
    }
    return { entries, view, bytes, decoder };
  }

  async function readEntry(zip, name, budget) {
    const entry = zip.entries.get(name);
    if (!entry) return null;
    if (entry.encrypted) throw new Error('XLSX protegido por senha não é suportado.');
    const { view, bytes } = zip;
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('XLSX corrompido.');
    const start = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);
    const room = Math.min(L.MAX_XLSX_ENTRY_BYTES, budget.left);
    let out;
    if (entry.method === 0) {
      if (data.byteLength > room) throw new Error('O XLSX passa do limite de tamanho; arquivo recusado.');
      out = data;
    } else if (entry.method === 8) {
      out = await inflateRaw(data, room);
    } else {
      throw new Error(`Método de compressão do XLSX não suportado: ${entry.method}.`);
    }
    budget.left -= out.byteLength;
    return zip.decoder.decode(out);
  }

  // buffer: ArrayBuffer. Retorna matriz de linhas da primeira planilha.
  async function parseXlsx(buffer) {
    if (buffer.byteLength > L.MAX_FILE_BYTES) throw new Error('O arquivo passa de 5 MB.');
    const zip = readDirectory(buffer);
    const budget = { left: L.MAX_XLSX_TOTAL_BYTES };
    const rels = parseRels(await readEntry(zip, 'xl/_rels/workbook.xml.rels', budget));
    const sheetPath = firstSheetPath(await readEntry(zip, 'xl/workbook.xml', budget), rels) || 'xl/worksheets/sheet1.xml';
    const shared = parseSharedStrings(await readEntry(zip, 'xl/sharedStrings.xml', budget));
    const sheetXml = await readEntry(zip, sheetPath, budget);
    if (!sheetXml) throw new Error('Não foi possível localizar a primeira planilha no XLSX.');
    return parseSheet(sheetXml, shared);
  }

  root.IMN.xlsx = { parseXlsx, columnIndex, decodeEntities };
})(globalThis);


;
/* Original Corrections: src/core/records.js */
// Converte a matriz de linhas do arquivo em registros validados. Sem DOM.
// Cabeçalhos: só nomes exatos (após normalizar). Linha inválida NÃO some: vira registro bloqueado com motivo.
(function (root) {
  'use strict';
  const { normalizeText } = root.IMN.text;
  const { parseGrade, scalePercent } = root.IMN.grade;
  const L = root.IMN.limits;

  const COLUMN_ALIASES = {
    nome: ['nome', 'aluno', 'estudante', 'discente', 'nome do aluno', 'nome completo', 'nome do estudante'],
    id: ['id', 'id moodle', 'userid', 'user id', 'id do usuario', 'id do aluno'],
    nota: ['nota', 'grade', 'pontuacao', 'score', 'nota sugerida', 'nota final', 'pontuacao sugerida'],
    desempenho: ['desempenho 0 100', 'desempenho'],
    feedback: ['feedback', 'comentario', 'comentarios', 'comentario de feedback', 'comentarios de feedback', 'observacao', 'retorno', 'devolutiva'],
    situacao: ['situacao', 'status', 'tag', 'classificacao', 'resultado', 'analise', 'diagnostico']
  };

  const SITUATIONS = [
    { value: '', label: 'Sem tag' },
    { value: 'corrigido', label: 'Corrigido' },
    { value: 'erro_arquivo', label: 'Erro no arquivo' },
    { value: 'sem_conteudo_relevante', label: 'Sem conteúdo relevante' },
    { value: 'revisao_necessaria', label: 'Revisão necessária' },
    { value: 'sem_envio_valido', label: 'Sem envio válido' }
  ];

  const SITUATION_SYNONYMS = {
    corrigido: ['corrigido', 'ok', 'satisfatorio', 'concluido', 'atendido'],
    erro_arquivo: ['erro no arquivo', 'arquivo com erro', 'arquivo invalido', 'arquivo corrompido', 'erro arquivo'],
    sem_conteudo_relevante: ['sem conteudo relevante', 'conteudo irrelevante', 'sem conteudo'],
    revisao_necessaria: ['revisao necessaria', 'precisa revisar', 'requer revisao', 'pendente'],
    sem_envio_valido: ['sem envio valido', 'sem entrega', 'nao enviado']
  };

  function situationLabel(value) {
    return (SITUATIONS.find(item => item.value === value) || SITUATIONS[0]).label;
  }

  // Exato apenas: tag desconhecida vira '' (e gera aviso), nunca "parecida".
  function normalizeSituation(value) {
    const raw = normalizeText(value);
    if (!raw) return '';
    for (const [key, synonyms] of Object.entries(SITUATION_SYNONYMS)) {
      if (synonyms.includes(raw)) return key;
    }
    return '';
  }

  function findHeaderIndex(headers, aliases) {
    return headers.findIndex(header => aliases.includes(header));
  }

  function parseRecords(rows, options = {}) {
    const max = Number.isFinite(options.max) ? options.max : null;
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new Error('Arquivo vazio ou sem linhas de dados. Use a coluna nome (ou id) e ao menos uma de nota, feedback ou situacao.');
    }
    if (rows.length - 1 > L.MAX_RECORDS) throw new Error(`O arquivo tem mais de ${L.MAX_RECORDS} registros.`);

    const headers = rows[0].map(normalizeText);
    const col = {};
    for (const key of Object.keys(COLUMN_ALIASES)) col[key] = findHeaderIndex(headers, COLUMN_ALIASES[key]);

    if (col.nome === -1 && col.id === -1) throw new Error('Cabeçalho obrigatório não encontrado: nome (ou id).');
    if (col.nota === -1 && col.desempenho === -1 && col.feedback === -1 && col.situacao === -1) {
      throw new Error('Inclua ao menos uma coluna de ação: nota, feedback ou situacao.');
    }

    const cell = (row, index) => (index === -1 ? '' : String(row[index] ?? '').trim());
    const records = [];
    const warnings = [];

    rows.slice(1).forEach((row, i) => {
      const rowNumber = i + 2;
      if (!row.some(c => String(c ?? '').trim())) return;
      const issues = [];
      const nome = cell(row, col.nome);
      const idText = cell(row, col.id);
      const notaRaw = cell(row, col.nota);
      const desempenhoRaw = cell(row, col.desempenho);
      const feedback = cell(row, col.feedback);
      const situacaoRaw = cell(row, col.situacao);
      const situacao = normalizeSituation(situacaoRaw);

      if (!nome && !idText) issues.push('Sem nome e sem id.');
      if (idText && !/^\d+$/.test(idText)) issues.push(`id "${idText}" não é numérico.`);

      let grade = { ok: true, empty: true, canonical: '', value: null };
      if (notaRaw && desempenhoRaw) {
        issues.push('Linha tem nota e desempenho ao mesmo tempo; use só um.');
      } else if (notaRaw) {
        grade = parseGrade(notaRaw, { max });
        if (!grade.ok) issues.push(`Nota: ${grade.error}`);
      } else if (desempenhoRaw) {
        const pct = parseGrade(desempenhoRaw, { max: 100 });
        if (!pct.ok) issues.push(`Desempenho: ${pct.error}`);
        else if (max === null) issues.push('Desempenho 0–100 exige a nota máxima da atividade, que não foi lida na página.');
        else grade = { ok: true, empty: false, canonical: scalePercent(pct.value, max), value: Number(scalePercent(pct.value, max)), fromPercent: pct.canonical };
      }

      if (grade.empty && !feedback && !situacao && !issues.length) {
        warnings.push(`Linha ${rowNumber}: nada a aplicar (sem nota, feedback ou situação).`);
      }
      if (situacaoRaw && !situacao) warnings.push(`Linha ${rowNumber}: situação "${situacaoRaw}" não reconhecida; tag ignorada.`);

      records.push({
        rowNumber, nome, id: /^\d+$/.test(idText) ? idText : '',
        notaRaw: notaRaw || desempenhoRaw, grade, feedback, situacao,
        situacaoLabel: situationLabel(situacao), issues
      });
    });

    if (!records.length) throw new Error('Nenhum registro encontrado no arquivo.');

    // Duplicatas: quem aparece duas vezes fica bloqueado nas duas linhas (não dá para saber qual vale).
    const seen = new Map();
    for (const record of records) {
      const key = record.id ? `id:${record.id}` : `n:${normalizeText(record.nome)}`;
      if (!record.id && !record.nome) continue;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(record);
    }
    for (const group of seen.values()) {
      if (group.length > 1) {
        const lines = group.map(r => r.rowNumber).join(', ');
        group.forEach(r => r.issues.push(`Aluno repetido no arquivo (linhas ${lines}).`));
      }
    }
    return { records, warnings };
  }

  const GRADE_ISSUE = /^(Nota:|Desempenho|Linha tem nota)/;

  // Aplica correções feitas pela pessoa na prévia. edits: { [rowNumber]: { grade?: texto, feedback?: texto } }.
  // A nota editada passa pela MESMA validação estrita (formato e nota máxima). Editar é pedido explícito para
  // aquela linha: vale mesmo com "sobrescrever" desligado (forceGrade / forceFeedback).
  function applyEdits(records, edits, { max = null } = {}) {
    return records.map(record => {
      const edit = edits && edits[record.rowNumber];
      if (!edit) return record;
      const out = { ...record, issues: [...record.issues], edited: {} };
      if (Object.prototype.hasOwnProperty.call(edit, 'grade')) {
        out.issues = out.issues.filter(issue => !GRADE_ISSUE.test(issue));
        const grade = parseGrade(edit.grade, { max });
        if (!grade.ok) out.issues.push(`Nota: ${grade.error}`);
        out.grade = grade;
        out.notaRaw = String(edit.grade ?? '').trim();
        out.forceGrade = true;
        out.edited.grade = true;
      }
      if (Object.prototype.hasOwnProperty.call(edit, 'feedback')) {
        out.feedback = String(edit.feedback ?? '').trim();
        out.forceFeedback = true;
        out.edited.feedback = true;
      }
      return out;
    });
  }

  root.IMN.records = { parseRecords, applyEdits, normalizeSituation, situationLabel, SITUATIONS, COLUMN_ALIASES };
})(globalThis);


;
/* Original Corrections: src/core/match.js */
// Correspondência registro × aluno da página. REGRA: só id ou nome exato. Aproximações = sugestão, nunca aplicadas.
(function (root) {
  'use strict';
  const { normalizeText } = root.IMN.text;

  function tokens(name) {
    return normalizeText(name).split(' ').filter(Boolean);
  }

  function similarity(a, b) {
    const A = new Set(tokens(a));
    const B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let shared = 0;
    for (const t of A) if (B.has(t)) shared++;
    return shared / (A.size + B.size - shared);
  }

  function suggest(name, pageRows, limit = 3) {
    return pageRows
      .map(row => ({ row, score: similarity(name, row.name) }))
      .filter(item => item.score >= 0.5)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map(item => ({ userId: item.row.userId, name: item.row.name, score: Math.round(item.score * 100) / 100 }));
  }

  // pageRows: [{ userId, name, ... }]. Retorna { status, row?, reason?, suggestions }.
  // status: 'id' | 'name' | 'not_found' | 'ambiguous' | 'conflict'
  function matchRecord(record, pageRows) {
    if (record.id) {
      const row = pageRows.find(r => String(r.userId) === String(record.id));
      if (!row) return { status: 'not_found', reason: `Nenhum aluno com id ${record.id} nesta listagem.`, suggestions: [] };
      if (record.nome && normalizeText(record.nome) !== normalizeText(row.name)) {
        return { status: 'conflict', row, reason: `O id ${record.id} é de "${row.name}", mas o arquivo diz "${record.nome}".`, suggestions: [] };
      }
      return { status: 'id', row, suggestions: [] };
    }
    const target = normalizeText(record.nome);
    const hits = pageRows.filter(r => normalizeText(r.name) === target);
    if (hits.length === 1) return { status: 'name', row: hits[0], suggestions: [] };
    if (hits.length > 1) {
      return { status: 'ambiguous', reason: `${hits.length} alunos com o mesmo nome; use a coluna id.`, suggestions: hits.map(h => ({ userId: h.userId, name: h.name, score: 1 })) };
    }
    return { status: 'not_found', reason: 'Nome não encontrado nesta listagem.', suggestions: suggest(record.nome, pageRows) };
  }

  root.IMN.match = { matchRecord, similarity, suggest };
})(globalThis);


;
/* Original Corrections: src/core/plan.js */
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


;
/* Original Corrections: src/core/batch.js */
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


;
/* Original Corrections: src/core/zip-writer.js */
// Montagem de um ZIP único (sem compressão) a partir de pedaços já prontos. Sem DOM.
// Serve para juntar os ZIPs do Moodle (já comprimidos) e os arquivos de apoio num só pacote sem reler tudo na memória:
// o Blob final referencia os Blobs originais; só o CRC32 percorre os bytes, em blocos.
(function (root) {
  'use strict';
  const MAX_32 = 0xFFFFFFFF;

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();

  async function crc32(blob) {
    let crc = 0xFFFFFFFF;
    const feed = bytes => { for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); };
    if (typeof blob.stream === 'function') {
      const reader = blob.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        feed(value);
      }
    } else if (typeof blob.arrayBuffer === 'function') {
      feed(new Uint8Array(await blob.arrayBuffer()));
    } else {
      throw new Error('Este navegador não consegue ler o arquivo para empacotar.');
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosStamp(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  const toBlob = data => (typeof data === 'string' ? new Blob([new TextEncoder().encode(data)]) : (typeof data.size === 'number' && typeof data.slice === 'function') ? data : new Blob([data]));

  // entries: [{ name: 'Pasta/arquivo.zip', data: Blob | string | Uint8Array }]. Recusa o que não cabe num ZIP simples (4 GB / 65535).
  async function buildStoredZip(entries, { now = new Date() } = {}) {
    if (!entries.length) throw new Error('Nenhum arquivo para empacotar.');
    if (entries.length >= 0xFFFF) throw new Error('Arquivos demais para um único pacote.');
    const enc = new TextEncoder();
    const stamp = dosStamp(now);
    const parts = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const blob = toBlob(entry.data);
      const name = enc.encode(entry.name);
      if (blob.size >= MAX_32) throw new Error(`"${entry.name}" passa de 4 GB: grande demais para um único pacote.`);
      const crc = await crc32(blob);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034B50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, stamp.time, true); local.setUint16(12, stamp.date, true); local.setUint32(14, crc, true);
      local.setUint32(18, blob.size, true); local.setUint32(22, blob.size, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014B50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
      cd.setUint16(12, stamp.time, true); cd.setUint16(14, stamp.date, true); cd.setUint32(16, crc, true);
      cd.setUint32(20, blob.size, true); cd.setUint32(24, blob.size, true); cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      parts.push(local.buffer, name, blob);
      central.push(cd.buffer, name);
      offset += 30 + name.length + blob.size;
      if (offset >= MAX_32) throw new Error('O pacote passaria de 4 GB.');
    }
    const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // Nomes repetidos dentro do pacote ganham " (2)", " (3)"…
  function uniqueName(name, used) {
    if (!used.has(name)) { used.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const stem = dot > name.lastIndexOf('/') ? name.slice(0, dot) : name;
    const ext = dot > name.lastIndexOf('/') ? name.slice(dot) : '';
    for (let n = 2; ; n++) { const candidate = `${stem} (${n})${ext}`; if (!used.has(candidate)) { used.add(candidate); return candidate; } }
  }

  root.IMN.zip = { buildStoredZip, crc32, uniqueName };
})(globalThis);


;
/* Original Corrections: src/page/moodle-grading.js */
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


;
/* Original Corrections: src/ui/dom.js */
// Construtor de DOM seguro: todo texto entra via nó de texto (nunca innerHTML).
(function (root) {
  'use strict';

  function h(doc, tag, props, ...children) {
    const el = doc.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child.nodeType ? child : doc.createTextNode(String(child)));
    }
    return el;
  }

  root.IMN.dom = { h };
})(globalThis);


;
/* Original Corrections: src/ui/icons.js */
// Ícones SVG locais; interface acessível e independente de ícones externos do Moodle.
(function (root) {
  'use strict';
  const svgNS = 'http://www.w3.org/2000/svg';
  const PATHS = {
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35'],
    refresh: ['M20 11a8 8 0 0 0-14.5-4.5L3 9', 'M3 3v6h6', 'M4 13a8 8 0 0 0 14.5 4.5L21 15', 'M21 21v-6h-6'],
    copy: ['M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2', 'M10 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z']
  };

  function make(doc, name) {
    if (!Object.prototype.hasOwnProperty.call(PATHS, name)) throw new Error('Ícone não suportado: ' + name);
    const svg = doc.createElementNS(svgNS, 'svg');
    for (const [key, value] of Object.entries({
      viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.85', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
      class: 'imn-icon imn-icon-' + name
    })) svg.setAttribute(key, value);
    PATHS[name].forEach(d => {
      const p = doc.createElementNS(svgNS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  root.IMN.icons = { make };
})(globalThis);


;
/* Original Corrections: src/ui/dialog.js */
// Acessibilidade compartilhada pelos modais de importação e lançamento em lote.
// Mantém o foco no diálogo e permite fechar com Escape (quando o fluxo não estiver em andamento).
(function (root) {
  'use strict';
  const SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function bind(dialog, { onClose, canClose = () => true }) {
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (canClose()) { event.preventDefault(); event.stopPropagation(); onClose(); }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = [...dialog.querySelectorAll(SELECTOR)]
        .filter(el => !el.hidden && el.getClientRects().length > 0);
      if (!focusables.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && (dialog.ownerDocument.activeElement === first || dialog.ownerDocument.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && dialog.ownerDocument.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
    return dialog;
  }
  root.IMN.dialog = { bind };
})(globalThis);


;
/* Original Corrections: src/radar/governor.js */
// Governador de consultas: fila única, simultaneidade adaptativa (começa em 3, sobe até 4 quando o Moodle responde bem
// e cai pela metade quando há 429/5xx/lentidão), intervalo mínimo, recuo e disjuntor com pausa e retomada.
// Adaptado do Assistente EaD SENAI (content/scan-governor.js, 3.7.17); a adaptação e a pausa com retomada são novas (1.3.0).
(function (root) {
  'use strict';
  const RETRY_STATUS = new Set([429, 502, 503, 504]);
  const NO_RETRY_STATUS = new Set([401, 403, 404]);

  const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const makeError = (message, code, extra = {}) => Object.assign(new Error(message), { code }, extra);

  const isRetriable = (error) => {
    if (!error || error.noRetry) return false;
    if (Number.isFinite(error.status)) return RETRY_STATUS.has(error.status);
    if (error.code === 'CANCELLED' || error.code === 'CIRCUIT_OPEN') return false;
    return error.name === 'TypeError' || error.retriable === true;
  };

  // Fila única: no máximo `maxConcurrent` consultas ao mesmo tempo, intervalo mínimo entre inícios,
  // novas tentativas com recuo, disjuntor após falhas seguidas e pausa com a aba oculta.
  const createGovernor = ({
    maxConcurrent = 4,
    initialConcurrent = 3,
    minIntervalMs = 80,
    retryDelaysMs = [1000, 3000],
    breakerThreshold = 3,
    cooldownMs = 20000,
    maxTrips = 3,
    slowMs = 8000,
    growAfter = 6,
    sleep = defaultSleep,
    now = () => Date.now(),
    // Por padrão a leitura NÃO para com a aba oculta (antes parava e parecia travada). Quem quiser pausar passa isHidden.
    isHidden = () => false,
    isTabHidden = () => Boolean(globalThis.document?.hidden),
    waitUntilVisible = () => new Promise((resolve) => {
      const doc = globalThis.document;
      if (!doc?.addEventListener) return resolve();
      const handler = () => { if (!doc.hidden) { doc.removeEventListener('visibilitychange', handler); resolve(); } };
      doc.addEventListener('visibilitychange', handler);
    }),
    onWarn = (...args) => console.warn(...args),
  } = {}) => {
    const queue = [];
    let limit = Math.max(1, Math.min(initialConcurrent, maxConcurrent));
    let goodStreak = 0;
    let trips = 0;
    let pausedUntil = 0;
    let listener = () => {};
    let active = 0;
    let lastStartAt = -Infinity;
    let consecutiveFailures = 0;
    let openReason = '';
    let cancelled = false;
    let warned = false;
    let epoch = 0;
    const waiters = new Set();
    // Esperas (aba oculta, intervalo, recuo) terminam na hora quando a varredura é cancelada.
    const interruptible = (promise) => new Promise((resolve, reject) => {
      const fail = () => reject(makeError('Varredura cancelada.', 'CANCELLED'));
      waiters.add(fail);
      Promise.resolve(promise).then(resolve, reject).finally(() => waiters.delete(fail));
    });

    const warnOnce = (message) => {
      if (warned) return;
      warned = true;
      onWarn(message);
    };

    const pressure = () => { goodStreak = 0; limit = Math.max(1, Math.floor(limit / 2)); };
    const success = (ms) => {
      if (ms > slowMs) { pressure(); return; }
      goodStreak += 1;
      if (goodStreak >= growAfter && limit < maxConcurrent) { limit += 1; goodStreak = 0; }
    };

    const pump = () => {
      while (active < limit && queue.length) {
        const job = queue.shift();
        active += 1;
        execute(job).finally(() => { active -= 1; pump(); });
      }
    };

    const execute = async (job) => {
      try {
        if (job.epoch !== epoch) throw makeError('Varredura cancelada.', 'CANCELLED');
        if (openReason) throw makeError(openReason, 'CIRCUIT_OPEN');
        while (isHidden()) {
          await interruptible(waitUntilVisible());
          if (job.epoch !== epoch) throw makeError('Varredura cancelada.', 'CANCELLED');
        }
        // Pausa do disjuntor: espera o fim do descanso e depois tenta de novo, uma consulta por vez.
        const rest = pausedUntil - now();
        if (rest > 0) {
          listener({ type: 'pause', resumeAt: pausedUntil, trip: trips, maxTrips });
          await interruptible(sleep(rest));
          if (job.epoch !== epoch) throw makeError('Varredura cancelada.', 'CANCELLED');
          listener({ type: 'resume' });
        }
        const wait = lastStartAt + minIntervalMs - now();
        lastStartAt = Math.max(now(), lastStartAt + minIntervalMs);
        // Com a aba oculta o Chrome atrasa temporizadores; o limite de simultâneas já protege o servidor.
        if (wait > 0 && !isTabHidden()) await interruptible(sleep(wait));
        let attempt = 0;
        for (;;) {
          try {
            const startedAt = now();
            const value = await job.task();
            consecutiveFailures = 0;
            success(now() - startedAt);
            job.resolve(value);
            return;
          } catch (error) {
            if (job.epoch !== epoch) throw makeError('Varredura cancelada.', 'CANCELLED');
            if (isRetriable(error) && attempt < retryDelaysMs.length) {
              pressure();
              await interruptible(sleep(retryDelaysMs[attempt]));
              attempt += 1;
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        if (error?.code !== 'CANCELLED' && error?.code !== 'CIRCUIT_OPEN') {
          // 401, 403 e 404 são respostas definitivas daquela página, não sinal de servidor sobrecarregado.
          if (!NO_RETRY_STATUS.has(error?.status) && !error?.noRetry) consecutiveFailures += 1;
          if (consecutiveFailures >= breakerThreshold && !openReason) {
            trips += 1;
            consecutiveFailures = breakerThreshold - 1; // depois da pausa, uma única falha já reabre o disjuntor
            pressure();
            if (trips >= maxTrips) {
              openReason = `Consultas interrompidas: o Moodle falhou em ${trips} pausas seguidas (${error?.message || 'erro desconhecido'}). O que falta ficou Não verificado; use "Tentar só as não verificadas" mais tarde.`;
              warnOnce(`[Importar Notas] ${openReason}`);
            } else {
              pausedUntil = now() + cooldownMs;
            }
          }
        }
        job.reject(error);
      }
    };

    const run = (task) => new Promise((resolve, reject) => {
      if (openReason) return reject(makeError(openReason, 'CIRCUIT_OPEN'));
      queue.push({ task, resolve, reject, epoch });
      pump();
    });

    // Cancela o que está na fila e o que aguarda recuo; chamadas novas começam do zero.
    const cancel = () => {
      epoch += 1;
      cancelled = true;
      [...waiters].forEach((fail) => fail());
      while (queue.length) queue.shift().reject(makeError('Varredura cancelada.', 'CANCELLED'));
    };

    // Reabre o disjuntor (por exemplo, quando a pessoa clica em atualizar).
    const reset = () => {
      trips = 0;
      pausedUntil = 0;
      goodStreak = 0;
      limit = Math.max(1, Math.min(initialConcurrent, maxConcurrent));
      consecutiveFailures = 0;
      openReason = '';
      warned = false;
      cancelled = false;
    };

    return {
      run,
      cancel,
      reset,
      warnOnce,
      onEvent(fn) { listener = typeof fn === 'function' ? fn : () => {}; },
      get state() { return { active, queued: queue.length, consecutiveFailures, open: Boolean(openReason), reason: openReason, cancelled, concurrency: limit, trips, pausedUntil }; },
    };
  };

  root.IMN.governor = { createGovernor, makeError };
})(globalThis);


;
/* Original Corrections: src/radar/cache.js */
// Cache de contagens em sessionStorage (some ao fechar a aba). Guarda só números e datas, nunca dados de alunos.
(function (root) {
  'use strict';
  const PREFIX = 'imn:pending:';
  const DEFAULT_TTL_MS = 15 * 60 * 1000; // "Atualizar" ignora o cache; este prazo só vale para continuar/repetir sem reler tudo
  const NA = -1; // atividade sem controle de avaliação

  function createCache({ storage, now = () => Date.now(), origin = () => globalThis.location?.origin || '' } = {}) {
    const area = () => {
      try { return storage || globalThis.sessionStorage; } catch (_) { return null; }
    };
    const key = id => `${PREFIX}${origin()}:${id}`;

    return {
      get(id, ttlMs = DEFAULT_TTL_MS) {
        try {
          const raw = area()?.getItem(key(id));
          if (!raw) return null;
          const item = JSON.parse(raw);
          if (!Number.isFinite(item.count) || item.count < NA || !Number.isFinite(item.ts) || now() - item.ts > ttlMs) return null;
          return item.count;
        } catch (_) { return null; }
      },
      set(id, count) {
        try { area()?.setItem(key(id), JSON.stringify({ count, ts: now() })); } catch (_) { /* cache é opcional */ }
      },
      clear(ids) {
        for (const id of ids) { try { area()?.removeItem(key(id)); } catch (_) { /* ignora */ } }
      }
    };
  }

  root.IMN.cache = { createCache, NA };
})(globalThis);


;
/* Original Corrections: src/radar/moodle-pages.js */
// Leitura de páginas do Moodle (cursos, atividades, tela de avaliação) e consultas HTML com segurança.
// Funções de parsing recebem um Document já pronto, para serem testáveis sem rede.
(function (root) {
  'use strict';
  const { normalizeText } = root.IMN.text;
  const MAX_ASSIGNMENTS_PER_COURSE = 120;
  const MAX_COURSES_PER_CATEGORY = 120; // limite por busca, incluindo paginação

  const PENDING_LABELS = ['precisa de avaliacao', 'necessita avaliacao', 'needs grading', 'requires grading'];

  // Contagem "Precisa de avaliação" do resumo da atividade. null = campo não encontrado (nunca vira 0).
  function parsePendingCount(doc) {
    for (const row of doc.querySelectorAll('.gradingsummarytable tr, table.generaltable tr')) {
      const heading = row.querySelector('th, td:first-child');
      if (!PENDING_LABELS.includes(normalizeText(heading ? heading.textContent : ''))) continue;
      const valueCell = row.querySelector('td:last-child');
      const digits = ((valueCell && valueCell.textContent) || '').replace(/\s+/g, '').match(/\d+/);
      return digits ? Number.parseInt(digits[0], 10) : null;
    }
    return null;
  }

  const PARTICIPANT_LABELS = ['participantes', 'participants'];
  // Linha que fala de avaliação mas não é a de "Enviado para avaliação"/rascunho: se existir e não for reconhecida, é leitura incerta.
  const looksLikeGradingRow = label => /avalia|grading|graded/.test(label) && !/^(enviad|submitt|rascunho|draft)/.test(label);

  // Resumo da atividade: { kind: 'count', count } | { kind: 'na' } | { kind: 'unknown' }.
  // 'na' = a tabela de resumo é reconhecida (tem "Participantes") e NÃO tem linha de avaliação (ex.: tarefa sem envio online).
  // Qualquer dúvida (linha de avaliação com rótulo desconhecido, número ausente, sem tabela) é 'unknown' = Não verificado.
  function parsePendingInfo(doc) {
    let recognized = false;
    let gradingLike = false;
    for (const row of doc.querySelectorAll('.gradingsummarytable tr, table.generaltable tr')) {
      const heading = row.querySelector('th, td:first-child');
      const label = normalizeText(heading ? heading.textContent : '');
      if (PENDING_LABELS.includes(label)) {
        const count = parsePendingCount(doc);
        return count === null ? { kind: 'unknown' } : { kind: 'count', count };
      }
      if (PARTICIPANT_LABELS.includes(label)) recognized = true;
      if (looksLikeGradingRow(label)) gradingLike = true;
    }
    return recognized && !gradingLike ? { kind: 'na' } : { kind: 'unknown' };
  }

  function assignmentIdFromHref(href, base) {
    try {
      const url = new URL(href, base);
      return /\/mod\/assign\/view\.php$/.test(url.pathname) ? url.searchParams.get('id') || '' : '';
    } catch (_) { return ''; }
  }

  function courseIdFromHref(href, base) {
    try {
      const url = new URL(href, base);
      return /\/course\/view\.php$/.test(url.pathname) ? url.searchParams.get('id') || '' : '';
    } catch (_) { return ''; }
  }

  function cleanName(node, fallback) {
    if (!node) return fallback;
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.accesshide, .visually-hidden, .sr-only').forEach(n => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim() || fallback;
  }

  // Atividades "assign" de uma página de curso (ou de um Document baixado).
  // Procura primeiro no conteúdo principal (onde o selo será colocado) e depois na página toda:
  // com "uma seção por página" o miolo mostra só a seção atual e as tarefas aparecem apenas no índice do curso.
  function collectAssignments(doc, baseUrl) {
    const found = new Map();
    const main = doc.querySelector('[role="main"], #region-main');
    const insert = (link, { fromIndex = false, sectionNumber = null } = {}) => {
      if (found.size >= MAX_ASSIGNMENTS_PER_COURSE) return;
      const assignmentId = assignmentIdFromHref(link.getAttribute('href'), baseUrl);
      if (!assignmentId || found.has(assignmentId)) return;
      const card = link.closest('li.activity.modtype_assign, li.activity.assign, .modtype_assign, .activity-item') || link.parentElement;
      const name = cleanName(card?.querySelector('.instancename'), cleanName(link, `Atividade ${assignmentId}`));
      found.set(assignmentId, {
        assignmentId, name, href: new URL(link.getAttribute('href'), baseUrl).href,
        card, link, fromIndex, sectionNumber
      });
    };
    // Primeiro usar as atividades reais da seção exibida. O índice lateral contém
    // cópias dos mesmos links, mas essas cópias não possuem as datas e ficam fora
    // do contêiner da seção. Capturá-las primeiro bloqueava o botão Buscar.
    if (main) {
      for (const link of main.querySelectorAll('li.activity.modtype_assign a[href*="/mod/assign/view.php"], li.activity.assign a[href*="/mod/assign/view.php"], .modtype_assign .activityname a[href*="/mod/assign/view.php"]')) {
        if (link.closest('nav, .breadcrumb, .navbar, header')) continue;
        const section = link.closest('.course-section[data-sectionid]');
        insert(link, { sectionNumber: section?.getAttribute('data-sectionid') || null });
      }
    }
    // Nas páginas onetopic, o índice permite descobrir módulos de outras seções.
    // Só deve complementar o miolo, nunca substituir a referência verdadeira.
    for (const section of doc.querySelectorAll('#courseindex .courseindex-section, .courseindex-section[data-for="section"]')) {
      const sectionNumber = section.getAttribute('data-number');
      for (const link of section.querySelectorAll('a[href*="/mod/assign/view.php"]')) {
        insert(link, { fromIndex: true, sectionNumber });
      }
    }
    // Compatibilidade com temas em que não há índice nem modtype_assign.
    if (!found.size) {
      const scope = main || doc;
      for (const link of scope.querySelectorAll('a[href*="/mod/assign/view.php"]')) {
        if (link.closest('nav, .breadcrumb, .navbar, header')) continue;
        if (link.closest('li.activity.modtype_label, li.activity.label, .modtype_label')) continue;
        insert(link);
      }
    }
    return root.IMN.materials ? root.IMN.materials.attachMaterials(doc, baseUrl, [...found.values()]) : [...found.values()];
  }

  // Cursos listados numa página de categoria.
  function collectCourses(doc, baseUrl) {
    const main = doc.querySelector('[role="main"], #region-main') || doc;
    const found = new Map();
    for (const link of main.querySelectorAll('a[href*="/course/view.php"]')) {
      if (link.closest('nav, .breadcrumb, .navbar, .primary-navigation, .secondary-navigation, .pagination')) continue;
      const courseId = courseIdFromHref(link.getAttribute('href'), baseUrl);
      if (!courseId || found.has(courseId)) continue;
      const name = cleanName(link, `Curso ${courseId}`);
      found.set(courseId, { courseId, name, href: new URL(link.getAttribute('href'), baseUrl).href, link });
      if (found.size >= MAX_COURSES_PER_CATEGORY) break;
    }
    return [...found.values()];
  }

  // Endereços das outras páginas da MESMA categoria, sem entrar em subcategorias
  // nem seguir links externos. Respeita o conjunto de páginas que o Moodle exibe.
  function collectCategoryPages(doc, baseUrl) {
    const base = new URL(baseUrl);
    const categoryId = base.searchParams.get('categoryid');
    if (!/^[1-9]\d*$/.test(categoryId || '')) return [];
    const links = new Set();
    for (const link of doc.querySelectorAll('.pagination a[href], .paging a[href], a[rel="next"][href]')) {
      try {
        const next = new URL(link.getAttribute('href'), base);
        const page = next.searchParams.get('page');
        if (next.origin !== base.origin || next.pathname !== base.pathname ||
            next.searchParams.get('categoryid') !== categoryId ||
            !/^\d+$/.test(page || '') || Number(page) > 10000) continue;
        // Preserva os parâmetros de navegação necessários ao tema, mas ignora fragmentos.
        next.hash = '';
        links.add(next.href);
      } catch (_) { /* link inválido */ }
    }
    return [...links];
  }

  function extractSesskey(doc) {
    const input = doc.querySelector('input[name="sesskey"][value]');
    if (input && input.value) return input.value;
    for (const a of doc.querySelectorAll('a[href*="sesskey="]')) {
      try {
        const value = new URL(a.getAttribute('href'), 'https://x.invalid/').searchParams.get('sesskey');
        if (value) return value;
      } catch (_) { /* tenta o próximo */ }
    }
    const html = (doc.documentElement && doc.documentElement.innerHTML) || '';
    const m = html.match(/M\.cfg\.sesskey\s*=\s*["']([^"']+)["']/i) || html.match(/["']sesskey["']\s*:\s*["']([^"']+)["']/i);
    return m ? m[1] : '';
  }

  function extractPendingUserIds(doc) {
    const ids = new Set();
    for (const row of doc.querySelectorAll('table#submissions tbody tr, .gradingtable table tbody tr')) {
      const box = row.querySelector('input[name="selectedusers"][value], input[id^="selectuser_"][value]');
      const raw = box ? box.value || box.id.replace(/^selectuser_/, '') : '';
      if (/^\d+$/.test(raw)) ids.add(raw);
    }
    return [...ids];
  }

  function looksLikeLogin(finalUrl, html) {
    return /\/login\//.test(finalUrl.pathname) || (/name=["']username["']/i.test(html) && /name=["']password["']/i.test(html));
  }

  // Baixa uma página HTML do MESMO domínio. Erros trazem .status para o governador decidir se tenta de novo.
  // Leitura parcial: para de baixar assim que a tabela de resumo termina (o resto da página do Moodle é grande e não interessa).
  const SUMMARY_PARTIAL = Object.freeze({ marker: 'gradingsummary', end: '</table>' });

  async function readBody(response, partial) {
    if (!partial || !response.body || typeof response.body.getReader !== 'function') return response.text();
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let html = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      const start = html.indexOf(partial.marker);
      const end = start === -1 ? -1 : html.indexOf(partial.end, start);
      if (end !== -1) {
        try { await reader.cancel(); } catch (_) { /* já terminou */ }
        return html.slice(0, end + partial.end.length);
      }
    }
    return html + decoder.decode();
  }

  async function fetchDocument(url, { timeoutMs = 20000, partial = null, fetchImpl = globalThis.fetch, parser = html => new DOMParser().parseFromString(html, 'text/html'), origin = globalThis.location?.origin } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal, headers: { Accept: 'text/html,application/xhtml+xml' } });
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      const finalUrl = new URL(response.url || url, origin);
      if (finalUrl.origin !== origin) throw Object.assign(new Error('Redirecionamento para outro domínio recusado.'), { noRetry: true });
      const html = await readBody(response, partial);
      if (looksLikeLogin(finalUrl, html)) throw Object.assign(new Error('Sessão do Moodle expirada. Entre de novo e atualize.'), { noRetry: true, status: 401 });
      return { doc: parser(html), finalUrl: finalUrl.href };
    } catch (error) {
      if (error && error.name === 'AbortError') throw Object.assign(new Error('Tempo limite excedido.'), { retriable: true });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  root.IMN.pages = {
    parsePendingCount, parsePendingInfo, SUMMARY_PARTIAL, collectAssignments, collectCourses, collectCategoryPages, extractSesskey, extractPendingUserIds,
    fetchDocument, looksLikeLogin, assignmentIdFromHref, courseIdFromHref,
    MAX_ASSIGNMENTS_PER_COURSE, MAX_COURSES_PER_CATEGORY
  };
})(globalThis);


;
/* Original Corrections: src/radar/activity-materials.js */
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


;
/* Original Corrections: src/radar/scope.js */
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


;
/* Original Corrections: src/radar/scanner.js */
// Varredura de pendências ("Precisa de avaliação") por atividade, curso e categoria.
// Toda consulta passa pelo governador (máx. 2 simultâneas, recuo, disjuntor). Falha nunca vira zero.
(function (root) {
  'use strict';
  const { makeError } = root.IMN.governor;
  const NA = root.IMN.cache.NA;

  const DEFAULT_BUDGET = 1500; // consultas de rede por varredura (cabem ~12 cursos cheios); o que sobrar fica "não verificado" e o cache permite continuar

  function createScanner({ governor, cache, fetchDoc, pages = root.IMN.pages, budget = DEFAULT_BUDGET }) {
    const inflight = new Map();
    let used = 0;

    const spend = () => {
      if (used >= budget) throw makeError(`Limite de ${budget} consultas por varredura atingido. Clique em "Tentar só as não verificadas" para continuar do ponto onde parou.`, 'BUDGET', { noRetry: true });
      used += 1;
    };
    const resetBudget = () => { used = 0; };

    // Devolve o número de pendências, ou null quando a atividade não tem controle de avaliação (cache guarda -1).
    function pendingCount(assignment, { force = false } = {}) {
      const id = assignment.assignmentId;
      if (!force) {
        const cached = cache.get(id);
        if (cached !== null) return Promise.resolve(cached === NA ? null : cached);
      }
      if (inflight.has(id)) return inflight.get(id);
      const request = governor.run(async () => {
        spend();
        // Primeiro só o começo da página (resumo); se não resolver, lê a página inteira antes de decidir.
        let { doc } = await fetchDoc(assignment.href, { partial: pages.SUMMARY_PARTIAL });
        let info = pages.parsePendingInfo(doc);
        if (info.kind !== 'count') {
          spend();
          ({ doc } = await fetchDoc(assignment.href));
          info = pages.parsePendingInfo(doc);
        }
        if (info.kind === 'unknown') throw makeError('Campo "Precisa de avaliação" não encontrado nesta atividade.', 'PARSE', { noRetry: true });
        return info.kind === 'na' ? null : info.count;
      }).then(count => { cache.set(id, count === null ? NA : count); return count; })
        .finally(() => inflight.delete(id));
      inflight.set(id, request);
      return request;
    }

    // onResult(assignment, { state: 'ok'|'error'|'cancelled', count?, message? }) é chamado a cada atividade.
    async function scanAssignments(assignments, onResult = () => {}, { force = false } = {}) {
      const results = await Promise.all(assignments.map(async assignment => {
        let result;
        try {
          const count = await pendingCount(assignment, { force });
          result = count === null ? { state: 'na', message: 'Esta atividade não mostra "Precisa de avaliação" (sem envio a corrigir).' } : { state: 'ok', count };
        } catch (error) {
          result = { state: error && error.code === 'CANCELLED' ? 'cancelled' : 'error', message: error && error.message ? error.message : String(error) };
        }
        onResult(assignment, result);
        return { assignment, ...result };
      }));
      return { results, summary: summarize(results) };
    }

    async function scanCourse(course, onResult, { force = false, onAssignments = () => {} } = {}) {
      const { doc, finalUrl } = await governor.run(async () => { spend(); return fetchDoc(course.href); });
      const discovered = pages.collectAssignments(doc, finalUrl);
      // Mesmo verificador usado na página do curso. Ao buscar pela categoria, a
      // página inicial do curso pode exibir apenas uma seção; incluir as demais
      // atividades encontradas no índice lateral evita omitir SAPs de outras UCs.
      // Atividades comprovadamente futuras/fechadas continuam excluídas quando
      // há datas visíveis; sem datas, conferimos o resumo e não supomos zero.
      const selection = root.IMN.scope.selectAssignments(discovered, doc, new Date(),
        { restrictSection: false, includeUndated: true, includeIndexUndated: true });
      const assignments = selection.active;
      onAssignments(assignments);
      const scan = await scanAssignments(assignments, onResult, { force });
      return { course, assignments, excludedAssignments: selection.excluded, ...scan };
    }

    return { pendingCount, scanAssignments, scanCourse, resetBudget, get used() { return used; } };
  }

  // Soma só o que foi verificado. errors > 0 significa total PARCIAL (nunca apresentar como completo).
  function summarize(results) {
    const ok = results.filter(r => r.state === 'ok');
    const noControl = results.filter(r => r.state === 'na').length;
    const failed = results.filter(r => r.state !== 'ok' && r.state !== 'na');
    return {
      total: ok.reduce((sum, r) => sum + r.count, 0),
      activitiesPending: ok.filter(r => r.count > 0).length,
      checked: ok.length,
      unverified: failed.length,
      noControl,
      assignmentCount: results.length,
      partial: failed.length > 0
    };
  }

  root.IMN.scanner = { createScanner, summarize, DEFAULT_BUDGET };
})(globalThis);


;
/* Original Corrections: src/radar/downloads.js */
// Download dos envios pendentes ("Requer notas") como ZIPs do próprio Moodle, organizados em pastas.
// Somente lógica: coleta alunos pendentes, pede o ZIP (operação padrão "Baixar selecionados") e monta nomes seguros.
(function (root) {
  'use strict';
  const P = () => root.IMN.pages;

  const PAGE_SIZE = 500;
  const MAX_PAGES = 50;

  function sanitizeSegment(value, fallback = 'Sem nome') {
    const cleaned = String(value ?? '')
      .replace(/[<>:"\\|?*\u0000-\u001F]/g, ' ')
      .replace(/[\/\\]+/g, ' - ')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 90);
    return cleaned || fallback;
  }

  function buildFilename(rootSegments, activityName, count, assignmentId) {
    const base = `${sanitizeSegment(activityName, `Atividade ${assignmentId}`)} - ${count} ${count === 1 ? 'pendente' : 'pendentes'}.zip`;
    return [...rootSegments.map(s => sanitizeSegment(s)), sanitizeSegment(base)].join('/');
  }

  function gradingUrl(assignment, page, origin) {
    const url = new URL('/mod/assign/view.php', origin);
    url.searchParams.set('id', assignment.assignmentId);
    url.searchParams.set('action', 'grading');
    url.searchParams.set('status', 'requiregrading');
    url.searchParams.set('perpage', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    return url.href;
  }

  // Lê, página a página, quem está com envio pendente. Recusa leitura incompleta (nunca baixa "metade" em silêncio).
  async function collectPending(assignment, expected, { fetchDoc, governor, origin }) {
    const selected = new Set();
    const students = new Map();
    let sesskey = '';
    const maxes = new Set();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { doc } = await governor.run(() => fetchDoc(gradingUrl(assignment, page, origin)));
      sesskey = sesskey || P().extractSesskey(doc);
      const ids = P().extractPendingUserIds(doc);
      const grading = root.IMN.moodle;
      if (grading) {
        grading.readPendingStudents(doc).forEach(s => { if (!students.has(s.userId)) students.set(s.userId, s); });
        maxes.add(grading.readMaxGrade(doc)); // null = a página não mostrou a nota máxima com certeza
      }
      const before = selected.size;
      ids.forEach(id => selected.add(id));
      if (Number.isFinite(expected) && selected.size >= expected) break;
      if (!ids.length || selected.size === before) break;
    }
    if (!sesskey) throw new Error(`Chave de segurança não encontrada em "${assignment.name}".`);
    if (!selected.size) throw new Error(`O Moodle informa pendências em "${assignment.name}", mas o filtro "Requer notas" veio vazio.`);
    if (Number.isFinite(expected) && selected.size < expected) {
      throw new Error(`Leitura incompleta de "${assignment.name}": ${selected.size} de ${expected} pendências identificadas.`);
    }
    const max = maxes.size === 1 ? [...maxes][0] : null; // páginas que discordam ou sem leitura certa: vazio, nunca palpite
    return { userIds: [...selected], sesskey, max, students: [...students.values()].filter(s => selected.has(s.userId)) };
  }

  async function requestArchive(item, { fetchImpl = globalThis.fetch, origin, timeoutMs = 120000 }) {
    const body = new URLSearchParams({
      id: item.assignmentId, action: 'gradingbatchoperation', operation: 'downloadselected',
      selectedusers: item.userIds.join(','), returnaction: 'grading', sesskey: item.sesskey
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL('/mod/assign/view.php', origin).href, {
        method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal,
        headers: { Accept: 'application/zip,application/octet-stream,text/html;q=0.8,*/*;q=0.5' }, body
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (new URL(response.url || origin, origin).origin !== origin) throw new Error('Redirecionamento para outro domínio recusado.');
      const type = (response.headers.get('content-type') || '').toLowerCase();
      const disposition = (response.headers.get('content-disposition') || '').toLowerCase();
      if (type.includes('text/html') && !disposition.includes('attachment')) throw new Error('O Moodle não gerou o ZIP dos alunos selecionados.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('O ZIP retornado pelo Moodle está vazio.');
      return blob;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error(`Tempo limite ao gerar o ZIP de "${item.name}".`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  root.IMN.downloads = { sanitizeSegment, buildFilename, gradingUrl, collectPending, requestArchive, PAGE_SIZE };
})(globalThis);


;
/* Original Corrections: src/radar/local-ai.js */
// Desempate semântico local com Xenova/all-MiniLM-L6-v2.
// O script de conteúdo NÃO carrega código remoto: o motor ONNX é empacotado na extensão
// e a inferência acontece no service worker da própria extensão.
(function (root) {
  'use strict';
  const MODEL = 'Xenova/all-MiniLM-L6-v2';
  function chooseStatement(assignment, candidates, { targetText = '', enabled = true } = {}) {
    if (!enabled) return Promise.resolve({ status: 'desativado', id: null });
    if (candidates.length < 2) return Promise.resolve({ status: 'nao_necessario', id: null });
    const evidence = candidates.filter(c => typeof c.excerpt === 'string' && c.excerpt.trim().length >= 45);
    if (evidence.length < 2) return Promise.resolve({ status: 'sem_evidencia_textual', id: null });
    if (!root.chrome?.runtime?.sendMessage) return Promise.resolve({ status: 'indisponivel', id: null });
    const reduced = candidates.slice(0, 4).map(c => ({ id: String(c.id).slice(0, 30), name: String(c.name || '').slice(0, 180), excerpt: String(c.excerpt || '').slice(0, 1800) }));
    return new Promise(resolve => {
      try {
        root.chrome.runtime.sendMessage({ type: 'imn-minilm-rank', assignment: String(assignment.name || '').slice(0, 180),
          targetText: String(targetText || '').slice(0, 1800), candidates: reduced }, response => {
          const err = root.chrome.runtime.lastError;
          if (err) return resolve({ status: 'falha_local', id: null, message: err.message });
          if (!response?.ok) return resolve({ status: response?.status || 'indisponivel', id: null, message: response?.message || '' });
          const result = response.result || {};
          if (result.id && !reduced.some(c => c.id === String(result.id))) return resolve({ status: 'inconclusivo', id: null });
          resolve({ status: result.status || 'inconclusivo', id: result.id ? String(result.id) : null,
            score: result.score, gap: result.gap, device: result.device, model: MODEL });
        });
      } catch (e) { resolve({ status: 'falha_local', id: null, message: e.message }); }
    });
  }
  root.IMN.localAI = { MODEL, chooseStatement };
})(globalThis);


;
/* Original Corrections: src/radar/enunciados.js */
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


;
/* Original Corrections: src/packages/package-service.js */
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


;
/* Original Corrections: src/packages/package-save.js */
// Adaptador de download Chrome: mantém nome em pastas via service worker quando disponível.
(function (root) {
  'use strict';
  async function download(win, doc, blob, filename) {
    const token = (win.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
      .replace(/[^a-z0-9]/gi, '').toLowerCase();
    let registered = false;
    if (win.chrome?.runtime?.sendMessage) {
      registered = await new Promise(resolve => {
        try {
          win.chrome.runtime.sendMessage({ type: 'imn-register-download', token, filename }, response =>
            resolve(Boolean(response && response.ok) && !win.chrome.runtime.lastError));
        } catch (_) { resolve(false); }
      });
    }
    const url = win.URL.createObjectURL(blob);
    const ext = ((filename.match(/\.(zip|csv|txt)$/i) || [])[1] || 'zip').toLowerCase();
    const link = doc.createElement('a');
    link.href = url;
    link.download = registered ? `imn-pending-${token}.${ext}` : (filename.split('/').pop() || `pendentes.${ext}`);
    link.style.display = 'none';
    doc.body.append(link);
    link.click();
    link.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 120000);
    return { registered };
  }
  root.IMN.packageSave = { download };
})(globalThis);


;
/* Original Corrections: src/packages/package-flow.js */
// Fluxo de interface: preparar → revisar → baixar → conferir resultado.
// Nenhuma regra de extração/ZIP aqui. O render usa textContent via IMN.dom.h.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const h = IMN.dom.h;
  const count = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

  function open({ doc, win, bar, deps, entries, unverified = 0, showDetail }) {
    bar.download.disabled = true;
    bar.download.classList.add('imn-downloading');
    bar.download.replaceChildren(IMN.icons.make(doc, 'refresh'));
    bar.el.setAttribute('aria-busy', 'true');
    const report = (progress) => {
      bar.status.textContent = progress.stage === 'prepare'
        ? `Preparando: ${progress.done}/${progress.total}`
        : progress.stage === 'zip' ? 'Criando ZIP…'
          : `Incluindo arquivos: ${progress.done}/${progress.total}`;
    };
    const alertNodes = (errors) => errors.length ? [
      h(doc, 'details', { class: 'imn-warning-details' },
        h(doc, 'summary', {}, `${count(errors.length, 'aviso', 'avisos')} para conferir`),
        h(doc, 'ul', { class: 'imn-warning-list' }, ...errors.map(e => h(doc, 'li', {}, e))))
    ] : [];
    function unlock() {
      bar.download.disabled = false;
      bar.download.classList.remove('imn-downloading');
      bar.download.replaceChildren(IMN.icons.make(doc, 'download'));
      bar.el.setAttribute('aria-busy', 'false');
      bar.status.textContent = deps.lastSummaryText || 'Pronto para uma nova operação.';
    }
    function result(message, errors, tone, needsReview = 0, downloaded = false) {
      unlock();
      if (downloaded) {
        bar.download.classList.add('imn-success');
        bar.el.querySelector('.imn-batch-open')?.classList.add('imn-primary');
        bar.status.textContent = message;
        const token = (bar._imnLogToken || 0) + 1; bar._imnLogToken = token;
        win.setTimeout(() => { if (bar._imnLogToken === token) bar.status.textContent = ''; }, 5000);
        bar.detail.hidden = true;
        return;
      }
      // Somente falhas exigem uma mensagem persistente; sucesso não abre painel.
      showDetail(bar, doc, [h(doc, 'div', { class: `imn-package-outcome ${tone}`, role: 'alert' }, message), ...alertNodes(errors)]);
    }
    return IMN.packages.prepare(entries, { deps, origin: win.location.origin, onProgress: report })
      .then(({ prepared, errors }) => {
        if (!prepared.length) { result('Nenhuma atividade pôde ser preparada.', errors, 'imn-package-danger'); return; }
        // Clique em baixar executa diretamente o preparo e a geração do ZIP.
        const downloadNow = async () => {
          bar.el.setAttribute('aria-busy', 'true');
          bar.detail.hidden = true;
          const built = await IMN.packages.build(prepared,
            { deps, origin: win.location.origin, initialErrors: errors, onProgress: report });
          if (built.blob) {
            try {
              await IMN.packageSave.download(win, doc, built.blob, built.name);
              const s = built.summary;
              result(`Download iniciado · ${count(s.activities, 'atividade', 'atividades')} · ${count(s.students, 'envio', 'envios')}`,
                s.errors, s.errors.length || s.needsReview ? 'imn-package-attention' : 'imn-package-success', s.needsReview, true);
            } catch (error) { result(`Não foi possível iniciar o download: ${error.message}`, built.summary.errors, 'imn-package-danger'); }
            return;
          }
          // Plano de contingência: preserva envios quando o pacote único não couber na memória.
          const failures = [...built.summary.errors, built.error || 'Não foi possível montar o ZIP único.'];
          let downloaded = 0;
          for (const a of built.archives) {
            try {
              const name = deps.downloads.buildFilename([IMN.packages.ROOT_FOLDER, ...a.item.folders],
                a.item.name, a.item.userIds.length, a.item.assignmentId);
              await IMN.packageSave.download(win, doc, a.blob, name);
              downloaded++;
            } catch (error) { failures.push(`${a.item.name}: ${error.message}`); }
          }
          result(`${downloaded} ZIP(s) baixados separadamente. Atenção: sem manifesto e enunciados.`,
            failures, 'imn-package-attention');
        };
        return downloadNow();
      }).catch(error => result(`Não foi possível preparar o pacote: ${error.message}`, [], 'imn-package-danger'));
  }
  IMN.packageFlow = { open };
})(globalThis);


;
/* Original Corrections: src/radar/radar-ui.js */
// Interface do radar de pendências: selos por atividade (curso) ou por curso (categoria), resumo e download.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const h = IMN.dom.h;
  const icon = IMN.icons.make;

  function pageName(doc, fallback) {
    for (const selector of ['.page-header-headings h1', '.page-context-header h1', '#page-header h1', '[role="main"] h1', 'h1']) {
      const text = ((doc.querySelector(selector) || {}).textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return fallback;
  }

  function badgeText(result) {
    if (!result) return 'Verificando…';
    if (result.state === 'ok') return result.count === 0 ? 'Em dia' : `${result.count} pendente${result.count === 1 ? '' : 's'}`;
    if (result.state === 'empty') return 'Não localizado';
    if (result.state === 'na') return 'Sem avaliação';
    return 'Não verificado';
  }
  function badgeTone(result) {
    if (!result) return 'loading';
    if (result.state === 'na') return 'na'; // informativo (azul): não há o que corrigir ali, mas também não é "zero verificado"
    if (result.state !== 'ok') return 'error'; // 'empty' e 'error': âmbar, nunca verde
    return result.count > 0 ? 'pending' : 'clear';
  }

  function setBadge(badge, result, detail) {
    badge.hidden = false;
    badge.textContent = badgeText(result);
    badge.className = `imn-badge imn-badge-${badgeTone(result)}`;
    badge.title = result && result.state !== 'ok' ? (result.message || 'Não foi possível verificar.') : (detail || '');
  }

  function summaryText(summary) {
    if (summary.total > 0) {
      const found = `${summary.total} ${summary.total === 1 ? 'envio pendente' : 'envios pendentes'} em ${summary.activitiesPending} ${summary.activitiesPending === 1 ? 'atividade' : 'atividades'}`;
      return summary.unverified ? `${found} · ${summary.unverified} sem conferir` : found;
    }
    if (summary.unverified) return `Nenhuma pendência confirmada · ${summary.unverified} sem conferir`;
    if (summary.noControl) return `Nenhuma pendência confirmada · ${summary.noControl} sem informação`;
    return 'Nenhum envio pendente';
  }

  function createBar(doc, title) {
    const status = h(doc, 'span', { class: 'imn-bar-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, '');
    const statusIcon = null;
    const detail = h(doc, 'div', { class: 'imn-bar-detail', hidden: true });
    const refresh = h(doc, 'button', {
      type: 'button', class: 'imn-btn imn-primary imn-icon-button imn-refresh',
      title: 'Buscar pendências', 'aria-label': 'Buscar pendências'
    }, icon(doc, 'search'));
    const download = h(doc, 'button', {
      type: 'button', class: 'imn-btn imn-primary imn-icon-button imn-download', disabled: true,
      title: 'Baixar pendentes', 'aria-label': 'Baixar pendentes'
    }, icon(doc, 'download'));
    const el = h(doc, 'section', { class: 'imn-root imn-bar imn-toolbar', 'aria-label': title, 'aria-busy': 'false' },
      h(doc, 'div', { class: 'imn-radar-main' },
        h(doc, 'div', { class: 'imn-bar-row', role: 'group', 'aria-label': 'Ações de correção' }, refresh, download),
        h(doc, 'div', { class: 'imn-radar-status' }, status)),
      detail);
    return { el, status, detail, refresh, download };
  }

  // Na página de curso, usar a mesma área do cabeçalho que o Moodle reserva para ações.
  // Em temas sem cabeçalho, preservar a inserção no conteúdo.
  function mountBar(doc, bar) {
    const header = doc.querySelector('#page-header');
    if (header) { header.append(bar.el); return; }
    const main = doc.querySelector('[role="main"], #region-main') || doc.body;
    main.prepend(bar.el);
  }

  function showDetail(bar, doc, nodes) {
    bar.detail.hidden = false;
    bar.detail.replaceChildren(...nodes.flat().filter(Boolean));
  }

  // Composição: o radar somente apresenta leitura e invoca o caso de uso de pacotes.
  function offerDownloads(context) {
    return IMN.packageFlow.open({ ...context, showDetail });
  }

  // Linha de status que mostra a pausa do disjuntor por cima do progresso (o progresso não apaga o aviso de pausa).
  function makeStatus(deps, bar, progressText) {
    let pausedText = '';
    const refresh = () => { bar.status.textContent = pausedText || progressText(); };
    if (deps.governor.onEvent) {
      deps.governor.onEvent(event => {
        if (event.type === 'pause') {
          const seconds = Math.max(1, Math.round((event.resumeAt - Date.now()) / 1000));
          pausedText = `Moodle ocupado. Retomando em ${seconds} s…`;
        } else pausedText = '';
        refresh();
      });
    }
    return { refresh, clear() { pausedText = ''; } };
  }

  const toastTokens = new WeakMap();
  function flash(bar, message, win) {
    const token = (toastTokens.get(bar) || 0) + 1;
    toastTokens.set(bar, token);
    bar.status.textContent = message;
    win.setTimeout(() => { if (toastTokens.get(bar) === token && bar.el.getAttribute('aria-busy') !== 'true') bar.status.textContent = ''; }, 5000);
  }

  // O mesmo botão alterna entre busca e atualização enquanto a operação está ativa.
  function setSearchBusy(bar, busy) {
    const btn = bar.refresh;
    btn.replaceChildren(icon(btn.ownerDocument, busy ? 'refresh' : 'search'));
    btn.classList.toggle('imn-searching', busy);
    btn.disabled = busy;
    const label = busy ? 'Atualizando pendências' : 'Buscar pendências';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function initCourse(doc, win, deps) {
    const url = win.location.href;
    const discovered = deps.pages.collectAssignments(doc, url);
    if (!discovered.length) return null;
    // Apenas tarefas da seção atual e comprovadamente abertas no Moodle.
    const selection = IMN.scope.selectAssignments(discovered, doc, new Date(), {sectionNumber: new URL(url).searchParams.get('section'), includeUndated: true});
    const assignments = selection.active;
    const bar = createBar(doc, 'Correção de atividades');
    mountBar(doc, bar);
    const badges = new Map();
    for (const a of assignments) {
      const badge = h(doc, 'span', { class: 'imn-badge imn-badge-loading', hidden: true }, 'Verificando…');
      badges.set(a.assignmentId, badge);
      (a.link.parentElement || a.card).append(' ', badge);
    }
    let last = null;
    let finished = 0;
    const progressText = () => `Buscando… ${finished}/${assignments.length}`;
    const status = makeStatus(deps, bar, progressText);
    if (!assignments.length) bar.status.textContent = 'Nenhuma atividade elegível identificada.';
    else if (selection.excluded.undated) bar.status.textContent = `${assignments.length} atividades para conferir · ${selection.excluded.undated} sem datas visíveis.`;

    // Busca manual: somente a lupa dispara a varredura.
    async function scan(force) {
      setSearchBusy(bar, true);
      try {
      bar.refresh.disabled = true; bar.download.disabled = true;
      bar.refresh.classList.remove('imn-primary', 'imn-success');
      bar.download.classList.remove('imn-primary');
      bar.el.querySelector('.imn-batch-open')?.classList.remove('imn-primary');
      bar.detail.hidden = true;
      bar.el.dataset.searched = 'true';
      bar.el.setAttribute('aria-busy', 'true');
      deps.scanner.resetBudget();
      deps.governor.reset();
      if (force) deps.cache.clear(assignments.map(a => a.assignmentId));
      assignments.forEach(a => setBadge(badges.get(a.assignmentId), null));
      finished = 0;
      status.clear(); status.refresh();
      const scan = await deps.scanner.scanAssignments(assignments, (a, r) => { finished += 1; setBadge(badges.get(a.assignmentId), r); status.refresh(); }, { force });
      last = scan;
      status.clear();
      deps.lastSummaryText = `${summaryText(scan.summary)}${selection.excluded.undated ? ` · ${selection.excluded.undated} sem datas visíveis` : ''}`;
      bar.el.setAttribute('aria-busy', 'false');
      flash(bar, deps.lastSummaryText, win);
      bar.refresh.disabled = false;
      bar.download.disabled = !scan.results.some(r => r.state === 'ok' && r.count > 0);
      bar.refresh.classList.add('imn-success');
      (bar.download.disabled ? bar.refresh : bar.download).classList.add('imn-primary');
      return scan;
      } finally {
        setSearchBusy(bar, false);
        bar.el.setAttribute('aria-busy', 'false');
      }
    }

    bar.refresh.disabled = assignments.length === 0;
    bar.refresh.addEventListener('click', () => scan(true)); // Não existe busca automática no carregamento.
    bar.download.addEventListener('click', () => {
      if (!last) return;
      const folder = pageName(doc, 'Curso');
      const entries = last.results.filter(r => r.state === 'ok' && r.count > 0).map(r => ({ assignment: r.assignment, count: r.count, folders: [folder], courseId: new URL(win.location.href).searchParams.get('id') || '', courseName: folder }));
      offerDownloads({ doc, win, bar, deps, entries, unverified: last.summary.unverified });
    });
    return { bar, badges, scan, assignments };
  }

  function initCategory(doc, win, deps) {
    const discovered = deps.pages.collectCourses(doc, win.location.href);
    if (!discovered.length) return null;
    // Busca manual na categoria: conferir todos os cursos listados, mesmo que
    // não exibam um selo 'Em andamento' (o layout do Moodle nem sempre exibe).
    const courses = [...discovered];
    const ids = new Set(courses.map(c => c.courseId));
    const MAX_PAGES = 12;
    let paginationIncomplete = false;
    const bar = createBar(doc, 'Correção de atividades');
    mountBar(doc, bar);
    const badges = new Map();
    for (const c of courses) {
      const badge = h(doc, 'span', { class: 'imn-badge imn-badge-loading', hidden: true }, 'Verificando…');
      badges.set(c.courseId, badge);
      (c.link.parentElement || c.link).append(' ', badge);
    }
    let last = [];
    const progress = { courses: 0, acts: 0, actsDone: 0 };
    const progressText = () => `Buscando… ${progress.courses}/${courses.length} cursos · ${progress.actsDone}/${progress.acts} atividades`;
    const status = makeStatus(deps, bar, progressText);
    if (!courses.length) bar.status.textContent = 'Nenhum curso encontrado nesta categoria.';
    else bar.status.textContent = `${courses.length} cursos encontrados. Clique na lupa para conferir as pendências.`;

    async function scan(force) {
      setSearchBusy(bar, true);
      try {
      bar.refresh.disabled = true; bar.download.disabled = true;
      bar.refresh.classList.remove('imn-primary', 'imn-success');
      bar.download.classList.remove('imn-primary');
      bar.el.querySelector('.imn-batch-open')?.classList.remove('imn-primary');
      bar.detail.hidden = true;
      bar.el.dataset.searched = 'true';
      bar.el.setAttribute('aria-busy', 'true');
      deps.scanner.resetBudget();
      deps.governor.reset();
      Object.assign(progress, { courses: 0, acts: 0, actsDone: 0 });
      // Percorrer paginação apenas depois do clique, sempre na mesma categoria.
      // As páginas são lidas em background e compartilhamos a fila de consultas.
      const collectPages = deps.pages.collectCategoryPages || (() => []);
      const maxCourses = deps.pages.MAX_COURSES_PER_CATEGORY || 120;
      const seenPages = new Set([new URL(win.location.href).href]);
      const pendingPages = collectPages(doc, win.location.href);
      let readPages = 0;
      paginationIncomplete = false;
      while (pendingPages.length && readPages < MAX_PAGES && courses.length < maxCourses) {
        const nextUrl = pendingPages.shift();
        if (seenPages.has(nextUrl)) continue;
        seenPages.add(nextUrl);
        try {
          const { doc: pageDoc, finalUrl } = await deps.governor.run(() => deps.fetchDoc(nextUrl));
          readPages += 1;
          for (const course of deps.pages.collectCourses(pageDoc, finalUrl)) {
            if (ids.has(course.courseId)) continue;
            ids.add(course.courseId);
            if (courses.length >= maxCourses) { paginationIncomplete = true; break; }
            courses.push(course);
          }
          for (const href of collectPages(pageDoc, finalUrl)) {
            if (!seenPages.has(href) && !pendingPages.includes(href)) pendingPages.push(href);
          }
          bar.status.textContent = `${courses.length} cursos identificados na categoria…`;
        } catch (error) {
          // Página indisponível não é equivalente a ausência de pendências.
          paginationIncomplete = true;
        }
      }
      if (pendingPages.length || courses.length >= maxCourses) paginationIncomplete = true;
      status.clear(); status.refresh();
      const done = await Promise.all(courses.map(async course => {
        const badge = badges.get(course.courseId) || null; // curso de outra página
        if (badge) setBadge(badge, null);
        let total = 0; let finishedHere = 0;
        try {
          const r = await deps.scanner.scanCourse(course, () => {
            finishedHere += 1; progress.actsDone += 1;
            if (total && badge) badge.textContent = `Verificando… ${finishedHere}/${total}`;
            status.refresh();
          }, { force, onAssignments: list => { total = list.length; progress.acts += list.length; progress.courses += 1; if (badge) badge.textContent = `Verificando… 0/${total}`; status.refresh(); } });
          const s = r.summary;
          let result;
          let detail = '';
          if (s.assignmentCount === 0) {
            result = { state: 'na', message: 'Nenhuma tarefa comprovadamente em andamento.' };
            r.skipped = true;
          } else if (s.partial && s.total === 0) {
            // total parcial igual a 0 não pode virar "Sem pendências": o que falhou pode ter pendência
            result = { state: 'error', message: `${s.unverified} atividade(s) não verificada(s).` };
          } else if (s.checked === 0 && s.noControl > 0) {
            result = { state: 'na', message: 'Nenhuma atividade deste curso mostra "Precisa de avaliação". Abra o curso se esperava pendências.' };
          } else {
            result = { state: 'ok', count: s.total };
            detail = s.partial ? `${s.unverified} atividade(s) não verificada(s): total parcial.` : `${s.activitiesPending} de ${s.assignmentCount} atividade(s) com pendência.`;
          }
          if (badge) setBadge(badge, result, detail);
          if (badge && s.partial && result.state === 'ok') { badge.textContent += ' · parcial'; badge.title = `${s.unverified} atividades não conferidas.`; }
          return r;
        } catch (error) {
          progress.courses += 1;
          if (badge) setBadge(badge, { state: 'error', message: error.message });
          return { course, assignments: [], results: [], summary: null, error };
        }
      }));
      last = done;
      const sums = done.filter(r => r.summary).map(r => r.summary);
      const agg = {
        total: sums.reduce((s, x) => s + x.total, 0),
        activitiesPending: sums.reduce((s, x) => s + x.activitiesPending, 0),
        noControl: sums.reduce((s, x) => s + (x.noControl || 0), 0),
        unverified: sums.reduce((s, x) => s + x.unverified, 0) + done.filter(r => !r.summary).length
      };
      agg.partial = agg.unverified > 0 || paginationIncomplete;
      status.clear();
      deps.lastSummaryText = `${summaryText(agg)} · ${courses.length} cursos${paginationIncomplete ? ' · lista de cursos incompleta (limite ou página indisponível)' : ''}`;
      bar.el.setAttribute('aria-busy', 'false');
      flash(bar, deps.lastSummaryText, win);
      bar.refresh.disabled = false;
      bar.download.disabled = !done.some(r => r.results.some(x => x.state === 'ok' && x.count > 0));
      bar.refresh.classList.add('imn-success');
      (bar.download.disabled ? bar.refresh : bar.download).classList.add('imn-primary');
      return done;
      } finally {
        setSearchBusy(bar, false);
        bar.el.setAttribute('aria-busy', 'false');
      }
    }

    bar.refresh.disabled = courses.length === 0;
    bar.refresh.addEventListener('click', () => scan(true)); // Não existe busca automática no carregamento.
    bar.download.addEventListener('click', () => {
      const category = pageName(doc, 'Categoria');
      const entries = last.flatMap(r => r.results.filter(x => x.state === 'ok' && x.count > 0).map(x => ({ assignment: x.assignment, count: x.count, folders: [category, r.course.name], courseId: r.course.courseId, courseName: r.course.name })));
      const unverified = last.reduce((s, r) => s + (r.summary ? r.summary.unverified : 1), 0);
      offerDownloads({ doc, win, bar, deps, entries, unverified });
    });
    return { bar, badges, scan, courses };
  }

  function createDeps(win) {
    const governor = IMN.governor.createGovernor();
    const cache = IMN.cache.createCache({ origin: () => win.location.origin });
    const fetchDoc = (url, options = {}) => IMN.pages.fetchDocument(url, { origin: win.location.origin, ...options });
    const scanner = IMN.scanner.createScanner({ governor, cache, fetchDoc });
    win.addEventListener('pagehide', () => governor.cancel());
    return { governor, cache, fetchDoc, scanner, pages: IMN.pages, downloads: IMN.downloads, lastSummaryText: '' };
  }

  root.IMN.radar = { initCourse, initCategory, createDeps, summaryText, badgeText };
})(globalThis);


;
/* Original Corrections: src/batch/loader.js */
// Lê a tela de avaliação de cada atividade citada no CSV (somente leitura, pelo governador).
(function (root) {
  'use strict';
  const IMN = root.IMN;

  const PAGE_SIZE = 500;

  function activityUrl(cmid, origin) {
    const url = new URL('/mod/assign/view.php', origin);
    url.searchParams.set('id', String(cmid));
    url.searchParams.set('action', 'grading');
    url.searchParams.set('perpage', String(PAGE_SIZE));
    return url.href;
  }

  const text = el => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();

  function titleOf(doc, fallback) {
    for (const selector of ['.page-header-headings h1', '.page-context-header h1', '#page-header h1', '[role="main"] h1', 'h1']) {
      const t = text(doc.querySelector(selector));
      if (t) return t;
    }
    return fallback;
  }

  function courseOf(doc) {
    const link = [...doc.querySelectorAll('.breadcrumb a[href*="/course/view.php"], nav[aria-label] a[href*="/course/view.php"]')].pop();
    return text(link);
  }

  // Devolve { cmid, url, name, course, rows, max, decimal, files, hasMorePages } ou { cmid, url, error }.
  async function loadActivity(cmid, { fetchDoc, governor, origin }) {
    const url = activityUrl(cmid, origin);
    try {
      const { doc, finalUrl } = await governor.run(() => fetchDoc(url));
      const M = IMN.moodle;
      const ready = M.readiness(doc, { href: finalUrl });
      const name = titleOf(doc, `Atividade ${cmid}`);
      if (!ready.isAssign || !ready.isGrading) return { cmid, url, name, error: 'O Moodle não abriu a tela de avaliação desta atividade (id inválido ou sem permissão).' };
      if (!ready.ok) return { cmid, url, name, error: ready.problem };
      return {
        cmid, url, name, course: courseOf(doc), rows: M.readRows(doc), max: M.readMaxGrade(doc), decimal: M.decimalSeparator(doc),
        files: M.readSubmissionFiles(doc), hasMorePages: M.pagination(doc).hasMorePages
      };
    } catch (error) {
      return { cmid, url, error: error && error.message ? error.message : 'Falha ao ler a atividade.' };
    }
  }

  root.IMN.batchLoader = { activityUrl, loadActivity, PAGE_SIZE };
})(globalThis);


;
/* Original Corrections: src/batch/reconcile.js */
// Verificação independente da gravação: GET sem cache (mesmo adaptador HTTP do radar),
// sem reutilizar Document/iframe usado no POST. Nunca infere zero a partir de HTML incompleto.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const MAX_PAGES = 12;
  const WAIT_MS = [0, 550, 1200];
  const key = f => `${f.userId}|${f.field}`;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function same(field, actual, intended) {
    return field === 'grade' ? IMN.grade.sameGrade(actual, intended) : clean(actual) === clean(intended);
  }

  function urlFor(job, page, attempt) {
    const url = new URL(job.url);
    url.searchParams.set('action', 'grading');
    url.searchParams.set('perpage', '500');
    url.searchParams.set('page', String(page));
    // A lista deve incluir todos os alunos, não só os que ainda necessitam de nota.
    url.searchParams.set('status', '');
    url.searchParams.set('_imn_fresh', `${Date.now()}-${attempt}-${page}`);
    return url.href;
  }

  // Reutiliza o mesmo fetchDocument do radar: credentials:include, cache:no-store,
  // validação de domínio e detecção de sessão expirada.
  async function readFresh(job, expected, { fetchDoc, governor, maxPages = MAX_PAGES }) {
    const wanted = new Set(expected.map(f => String(f.userId)));
    const found = new Map();
    const run = fn => governor ? governor.run(fn) : fn();
    let validTables = 0;
    let morePages = false;
    const urls = [];
    for (let page = 0; page < maxPages; page++) {
      const requested = urlFor(job, page, validTables);
      urls.push(requested);
      const { doc, finalUrl } = await run(() => fetchDoc(requested));
      const u = new URL(finalUrl);
      if (!/\/mod\/assign\/view\.php$/.test(u.pathname)) throw new Error('O Moodle redirecionou a verificação para outra página.');
      const table = doc.querySelector('table#submissions');
      if (!table) throw new Error('O Moodle não retornou a tabela de avaliação na nova consulta.');
      validTables++;
      for (const row of IMN.moodle.readRows(doc)) {
        if (wanted.has(String(row.userId))) found.set(String(row.userId), row);
      }
      if ([...wanted].every(id => found.has(id))) break;
      morePages = IMN.moodle.pagination(doc).hasMorePages;
      // Se não há próxima página e os alunos não vieram, não presumimos que a nota seja vazia.
      if (!morePages) break;
    }
    // O tema Moodle pode aplicar filtros de sessão mesmo com status vazio.
    // Consultar a listagem de corrigidos para localizar lançamentos recém-salvos.
    if ([...wanted].some(id => !found.has(id))) {
      for (let page = 0; page < maxPages; page++) {
        const gradedUrl = new URL(urlFor(job, page, validTables));
        gradedUrl.searchParams.set('status', 'graded');
        urls.push(gradedUrl.href);
        const { doc, finalUrl } = await run(() => fetchDoc(gradedUrl.href));
        if (!/\/mod\/assign\/view\.php$/.test(new URL(finalUrl).pathname)) throw new Error('Redirecionamento inesperado ao conferir notas.');
        if (!doc.querySelector('table#submissions')) break;
        for (const row of IMN.moodle.readRows(doc)) if (wanted.has(String(row.userId))) found.set(String(row.userId), row);
        if ([...wanted].every(id => found.has(id)) || !IMN.moodle.pagination(doc).hasMorePages) break;
      }
    }
    return { found, urls, validTables, incomplete: [...wanted].some(id => !found.has(id)), truncated: morePages && validTables >= maxPages };
  }

  function classify(expected, read) {
    const fields = expected.map(e => {
      const record = read.found.get(String(e.userId));
      if (!record) return { ...e, after: '', status: 'nao_verificado', reason: 'Aluno não localizado na consulta atual. Não há prova de falha na gravação.' };
      const after = e.field === 'grade' ? record.gradeText : record.feedbackText;
      if (same(e.field, after, e.to)) return { ...e, after, status: 'conferido', reason: '' };
      return { ...e, after, status: 'divergente', reason: 'A consulta atual retornou um valor diferente do enviado.' };
    });
    return fields;
  }

  function outcomeFor(fields) {
    if (fields.some(f => f.status === 'nao_verificado')) return 'nao_verificada';
    if (fields.some(f => f.status === 'divergente')) return 'divergente';
    return 'conferido';
  }

  // Repetir GET é seguro; repetir POST não é. A consulta final só chama algo de
  // divergente quando houve leitura real do campo em duas respostas consecutivas.
  async function verifySaved(job, expected, { fetchDoc, governor, sleep = ms => new Promise(r => setTimeout(r, ms)), attempts = WAIT_MS.length }) {
    if (!expected.length) return { outcome: 'sem_alteracao', fields: [], message: 'Nenhum campo para conferir.' };
    let lastFields = null;
    let priorFields = null;
    let error = '';
    const urls = [];
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt) await sleep(WAIT_MS[Math.min(attempt, WAIT_MS.length - 1)]);
      try {
        const read = await readFresh(job, expected, { fetchDoc, governor });
        urls.push(...read.urls);
        const fields = classify(expected, read);
        if (fields.every(f => f.status === 'conferido')) return { outcome: 'conferido', fields, message: `${fields.length} campo(s) confirmados em consulta independente ao Moodle.`, urls };
        priorFields = lastFields;
        lastFields = fields;
        error = '';
      } catch (e) { error = e.message || String(e); }
    }
    if (!lastFields) {
      return { outcome: 'nao_verificada', fields: expected.map(e => ({ ...e, after: '', status: 'nao_verificado', reason: error || 'Consulta indisponível.' })), message: `Não foi possível reler a atividade: ${error || 'sem resposta válida'}. Nenhum reenvio foi feito.`, urls };
    }
    const previous = new Map((priorFields || []).map(f => [key(f), f]));
    const fields = lastFields.map(f => {
      if (f.status !== 'divergente') return f;
      const before = previous.get(key(f));
      // A condição de consistência é a mesma linha, o mesmo campo e o mesmo valor
      // divergente em duas consultas independentes. Caso contrário, não confirmado.
      if (!before || before.status !== 'divergente' || !same(f.field, f.after, before.after)) {
        return { ...f, status: 'nao_verificado', reason: 'Consultas não coincidiram; é necessário conferir novamente.' };
      }
      return f;
    });
    const outcome = outcomeFor(fields);
    const notOk = fields.filter(f => f.status !== 'conferido').length;
    return { outcome, fields, message: outcome === 'divergente' ? `${notOk} campo(s) diferentes após duas consultas independentes.` : `${notOk} campo(s) ainda sem confirmação; não reenviar automaticamente.`, urls };
  }

  // Só permite reenvio de campos divergentes cujo valor atual continua igual ao
  // valor anterior à primeira tentativa. Nunca repete campo já conferido ou incerto.
  function safeRetryFields(fields) {
    return fields.filter(f => f.status === 'divergente' && typeof f.from === 'string' && same(f.field, f.after, f.from));
  }

  root.IMN.reconcile = { verifySaved, readFresh, classify, same, safeRetryFields, outcomeFor };
})(globalThis);


;
/* Original Corrections: src/batch/runner.js */
// Executa o lote: uma atividade por vez numa aba-fantasma (iframe do mesmo domínio), preenchendo,
// salvando e RELENDO. Se um campo não conferir, o lote PARA na hora. Falha de leitura nunca vira zero.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const h = IMN.dom.h;

  // Driver real: um iframe fora da tela. load(url) e submit(botão) resolvem com o Document recarregado.
  function createIframeDriver(win, doc, { timeoutMs = 60000 } = {}) {
    let frame = null;
    const ensure = () => {
      if (!frame) {
        frame = h(doc, 'iframe', { 'aria-hidden': 'true', tabindex: '-1', title: 'Importar Notas (lote em andamento)', style: 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;border:0;visibility:hidden;pointer-events:none' });
        doc.body.append(frame);
      }
      return frame;
    };
    function waitLoad(trigger) {
      return new Promise((resolve, reject) => {
        const f = ensure();
        const done = fn => value => { win.clearTimeout(timer); f.removeEventListener('load', onLoad); fn(value); };
        const fail = done(reject);
        const ok = done(resolve);
        const timer = win.setTimeout(() => fail(new Error('Tempo limite: o Moodle não terminou de carregar a página.')), timeoutMs);
        function onLoad() {
          try {
            const d = f.contentDocument;
            if (!d || !d.documentElement) throw new Error('vazio');
            ok(d);
          } catch (_) {
            fail(new Error('O Moodle não permite abrir esta tela dentro da extensão. Use "Importar notas" dentro da própria atividade.'));
          }
        }
        f.addEventListener('load', onLoad);
        try { trigger(f); } catch (error) { fail(error); }
      });
    }
    return {
      load: url => waitLoad(f => { f.src = url; }),
      submit: button => waitLoad(() => button.click()),
      close() { if (frame) { frame.remove(); frame = null; } }
    };
  }

  const keyOf = (userId, field) => `${userId}|${field}`;

  // job: { cmid, name, url, records, overwriteGrade, overwriteFeedback, expected: [{userId,name,field,to}] }
  // Resultado: { outcome, message, fields: [{ userId, name, field, from, to, after, status, reason }] }
  //   outcome: conferido | sem_alteracao | nao_lancada (nada foi salvo) | divergente | nao_verificada (salvou, mas não deu para conferir)
  async function runJob(job, { driver, governor, fetchDoc }) {
    const M = IMN.moodle;
    const run = fn => (governor ? governor.run(fn) : fn());
    const out = { cmid: job.cmid, name: job.name, outcome: 'nao_lancada', message: '', fields: [], diagnostic: { requestedUrl: job.url, verificationUrls: [], observations: [] } };
    let idoc;
    try {
      const u = new URL(job.url);
      u.searchParams.set('_imn_edit', String(Date.now()));
      idoc = await run(() => driver.load(u.href));
    } catch (error) { out.message = error.message; return out; }

    out.diagnostic.observations.push('Tela de edição aberta: ' + (idoc.URL || job.url));
    const ready = M.readiness(idoc, { href: job.url });
    if (!ready.ok) { out.message = ready.problem; out.diagnostic.observations.push(ready.problem); return out; }

    const fresh = IMN.plan.buildPlan(job.records, M.readRows(idoc), { decimal: M.decimalSeparator(idoc), overwriteGrade: job.overwriteGrade, overwriteFeedback: job.overwriteFeedback });
    const wanted = new Set(job.expected.map(e => keyOf(e.userId, e.field)));
    const applied = new Set();
    const plan = { ...fresh, items: fresh.items.map(item => {
      if (item.status !== 'ready') return item;
      const changes = item.changes.filter(c => wanted.has(keyOf(item.row.userId, c.field)));
      changes.forEach(c => applied.add(keyOf(item.row.userId, c.field)));
      return { ...item, changes, status: changes.length ? 'ready' : 'unchanged' };
    }) };
    for (const e of job.expected) {
      if (!applied.has(keyOf(e.userId, e.field))) out.fields.push({ userId: e.userId, name: e.name, field: e.field, from: '', to: e.to, after: '', status: 'ignorado', reason: 'A página mudou desde a prévia; este campo não foi gravado.' });
    }
    const expected = IMN.plan.toExpected(plan);
    if (!expected.length) {
      if (job.expected.length && fetchDoc) {
        const check = await IMN.reconcile.verifySaved(job, job.expected, { fetchDoc, governor });
        const checkedKeys = new Set(check.fields.map(f => keyOf(f.userId, f.field)));
        out.fields = out.fields.filter(f => !checkedKeys.has(keyOf(f.userId, f.field)));
        out.fields.push(...check.fields);
        out.outcome = check.outcome;
        out.message = check.message;
      } else {
        out.outcome = job.expected.length ? 'nao_verificada' : 'sem_alteracao';
        out.message = 'Nenhuma alteração aplicada; sem confirmação independente.';
        if (job.expected.length) out.fields.push(...job.expected.map(e => ({ ...e, from: '', after: '', status: 'nao_verificado', reason: out.message })));
      }
      return out;
    }

    const before = new Map();
    for (const item of plan.items) if (item.status === 'ready') for (const c of item.changes) before.set(keyOf(item.row.userId, c.field), c.from);

    // Para reenvios, consultar novamente a origem (GET independente) antes do POST.
    // Se o valor mudou, não sobrescrever. Se já estiver igual ao enviado, não repetir.
    const retryTargets = job.expected.filter(e => Object.hasOwn(e, 'retryFrom'));
    let retryRows = null;
    if (retryTargets.length) {
      if (!fetchDoc) {
        out.outcome = 'nao_verificada';
        out.message = 'Reenvio bloqueado: não foi possível fazer a conferência prévia.';
        out.fields.push(...retryTargets.map(f => ({ ...f, after: '', status: 'nao_verificado', reason: out.message })));
        return out;
      }
      try {
        retryRows = (await IMN.reconcile.readFresh(job, retryTargets, { fetchDoc, governor })).found;
      } catch (error) {
        out.outcome = 'nao_verificada';
        out.message = `Reenvio bloqueado: ${error.message}`;
        out.fields.push(...retryTargets.map(f => ({ ...f, after: '', status: 'nao_verificado', reason: out.message })));
        return out;
      }
    }
    for (const item of plan.items) {
      if (item.status !== 'ready') continue;
      item.changes = item.changes.filter(change => {
        const wanted = job.expected.find(e => keyOf(e.userId, e.field) === keyOf(item.row.userId, change.field));
        if (!wanted || !Object.hasOwn(wanted, 'retryFrom')) return true;
        const actualRow = retryRows.get(String(wanted.userId));
        const current = actualRow ? (change.field === 'grade' ? actualRow.gradeText : actualRow.feedbackText) : null;
        if (current !== null && IMN.reconcile.same(change.field, current, wanted.to)) {
          out.fields.push({ ...wanted, from: wanted.retryFrom, after: current, status: 'conferido', reason: '' });
          return false;
        }
        if (current !== null && IMN.reconcile.same(change.field, current, wanted.retryFrom)) return true;
        out.fields.push({ ...wanted, from: wanted.retryFrom, after: current ?? '', status: 'nao_verificado', reason: 'O valor não coincide mais com o anterior; reenvio bloqueado.' });
        return false;
      });
      if (!item.changes.length) item.status = 'unchanged';
    }
    const safeExpected = IMN.plan.toExpected(plan);
    if (!safeExpected.length) {
      out.outcome = out.fields.some(f => f.status === 'nao_verificado') ? 'nao_verificada' : out.fields.every(f => f.status === 'conferido') && out.fields.length ? 'conferido' : 'sem_alteracao';
      out.message = out.outcome === 'nao_verificada' ? 'Reenvio bloqueado: valores alterados ou não localizados.' : 'Nenhum campo precisa de nova gravação.';
      return out;
    }
    M.fillPlan(plan);
    const button = M.saveButton(idoc);
    if (!button) { out.message = 'Botão de salvar do Moodle não encontrado nesta atividade; nada foi salvo.'; out.diagnostic.observations.push(out.message); return out; }

    // O iframe fez o POST, mas NUNCA é fonte de confirmação: ele pode exibir
    // resposta intermediária, tabela filtrada, estado de navegação ou página em cache.
    // O mesmo fetch sem cache do radar relê os alunos por ID numa consulta separada.
    let submitError = '';
    try { await run(() => driver.submit(button)); }
    catch (error) { submitError = error.message || String(error); }
    // Releitura deve reconciliar TODOS os campos esperados, inclusive os que
    // foram pulados porque já estavam iguais ou mudaram desde a prévia.
    const changes = job.expected.map(e => ({ ...e, from: before.get(keyOf(e.userId, e.field)) ?? e.retryFrom ?? '' }));
    if (!fetchDoc) {
      out.outcome = 'nao_verificada';
      out.message = 'A verificação independente não está disponível.';
      out.fields.push(...changes.map(f => ({ ...f, after: '', status: 'nao_verificado', reason: out.message })));
      return out;
    }
    const verification = await IMN.reconcile.verifySaved(job, changes, { fetchDoc, governor });
    out.diagnostic.verificationUrls = verification.urls || [];
    out.diagnostic.observations.push(verification.message);
    const byKey = new Map(out.fields.map(f => [keyOf(f.userId, f.field), f]));
    verification.fields.forEach(f => byKey.set(keyOf(f.userId, f.field), f));
    out.fields = [...byKey.values()];
    out.outcome = IMN.reconcile.outcomeFor(out.fields.filter(f => f.status !== 'ignorado'));
    out.message = verification.message + (submitError ? ` A navegação do salvamento também relatou: ${submitError}` : '');
    return out;
  }


  function createBatchRunner({ driver, governor, fetchDoc, win, onProgress = () => {}, gapMs = 350 }) {
    let cancelled = false;
    let paused = false;
    let release = null;
    const gate = () => (paused ? new Promise(resolve => { release = resolve; }) : null);

    async function run(jobs) {
      const results = [];
      try {
        for (let i = 0; i < jobs.length; i++) {
          const wait = gate(); if (wait) { onProgress({ type: 'paused', index: i, total: jobs.length }); await wait; }
          if (cancelled) break;
          const job = jobs[i];
          onProgress({ type: 'start', index: i, total: jobs.length, job });
          let result;
          try { result = await runJob(job, { driver, governor, fetchDoc }); }
          catch (error) { result = { cmid: job.cmid, name: job.name, outcome: 'nao_verificada', message: `Falha inesperada: ${error.message}`, diagnostic: { requestedUrl: job.url, observations: [String(error.stack || error.message)], verificationUrls: [] }, fields: job.expected.map(e => ({ ...e, from: '', after: '', status: 'nao_verificado', reason: error.message })) }; }
          results.push(result);
          onProgress({ type: 'done', index: i, total: jobs.length, job, result });
          if (i < jobs.length - 1) await new Promise(r => win.setTimeout(r, gapMs));
        }
        if (cancelled) {
          const done = new Set(results.map(r => String(r.cmid)));
          jobs.filter(j => !done.has(String(j.cmid))).forEach(j => results.push({ cmid: j.cmid, name: j.name, outcome: 'cancelada', message: 'Cancelada por você.', fields: [] }));
        }
        return { results, stopped: false, cancelled };
      } finally {
        driver.close();
      }
    }

    return {
      run,
      pause() { paused = true; },
      resume() { paused = false; if (release) { const r = release; release = null; r(); } },
      cancel() { cancelled = true; paused = false; if (release) { const r = release; release = null; r(); } },
      get isPaused() { return paused; }
    };
  }

  root.IMN.batchRunner = { createIframeDriver, runJob, createBatchRunner };
})(globalThis);


;
/* Original Corrections: src/batch/batch-ui.js */
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


;
/* Original Corrections: src/radar-main.js */
// Entrada do radar: curso (course/view.php) ou categoria (course/index.php?categoryid=). Sem MutationObserver.
(function () {
  'use strict';
  const IMN = globalThis.IMN;
  const url = new URL(location.href);
  const isCourse = /\/course\/view\.php$/.test(url.pathname);
  const isCategory = /\/course\/index\.php$/.test(url.pathname) && url.searchParams.has('categoryid');
  if (!isCourse && !isCategory) return;

  function start(attempt) {
    const deps = IMN.radar.createDeps(window);
    const ui = isCourse ? IMN.radar.initCourse(document, window, deps) : IMN.radar.initCategory(document, window, deps);
    if (ui) {
      if (IMN.batchUi) IMN.batchUi.init(document, window, deps, ui.bar);
      // Iniciar a busca exige clique explícito na lupa.
      return;
    }
    if (attempt < 2) setTimeout(() => start(attempt + 1), 1500); // páginas que montam a lista depois do carregamento
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start(0), { once: true });
  else start(0);
})();

