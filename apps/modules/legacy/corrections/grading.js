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
/* Original Corrections: src/core/templates.js */
// Modelo de arquivo e prompt para correção assistida. Texto puro, sem DOM.
(function (root) {
  'use strict';

  const TEMPLATE_CSV = [
    'nome;nota;feedback;situacao',
    'Nome Completo do Aluno;45;Feedback objetivo e individualizado para o aluno.;Corrigido',
    'Outro Aluno;;Não foi possível avaliar o conteúdo do arquivo enviado.;Erro no arquivo'
  ].join('\n');

  const CORRECTION_PROMPT = [
    'Corrija as atividades dos alunos e gere um ARQUIVO CSV para download e importação no Moodle.',
    '',
    'Retorne somente o conteúdo do CSV, sem Markdown e sem texto adicional.',
    'Use ponto e vírgula como separador.',
    'Cabeçalho: nome;nota;feedback;situacao',
    'A coluna nome é obrigatória (ou a coluna id, com o número do aluno no Moodle, quando houver homônimos).',
    'Inclua ao menos uma destas colunas: nota, feedback ou situacao.',
    '',
    'Regras:',
    '- Preserve o nome do aluno EXATAMENTE como aparece na listagem do Moodle. Nomes parecidos não serão aceitos.',
    '- Não invente alunos ausentes na lista de envios.',
    '- nota: somente o número (por exemplo 45 ou 7,5), entre 0 e a nota máxima da atividade. Sem "/50", sem texto, sem "%".',
    '- Se não for adequado lançar nota, deixe a coluna nota vazia.',
    '- feedback: curto, claro, acolhedor e individualizado. Sem ponto e vírgula e sem quebras de linha.',
    '- Avalie somente com base nas evidências presentes na entrega e nas orientações fornecidas.',
    '',
    'A coluna situacao deve usar uma destas tags quando fizer sentido:',
    '- Corrigido: a atividade foi avaliada normalmente.',
    '- Erro no arquivo: o arquivo está vazio, corrompido ou inacessível.',
    '- Sem conteúdo relevante: o material enviado não atende ao que foi pedido.',
    '- Revisão necessária: a atividade precisa de ajustes importantes.',
    '- Sem envio válido: não há entrega adequada para avaliar.'
  ].join('\n');

  root.IMN.templates = { TEMPLATE_CSV, CORRECTION_PROMPT };
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
/* Original Corrections: src/ui/panel.js */
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


;
/* Original Corrections: src/content-main.js */
// Ponto de entrada: só inicia o painel quando a página é a tela de avaliação de uma atividade.
(function () {
  'use strict';
  if (!/\/mod\/assign\/view\.php$/.test(location.pathname)) return;
  if (new URL(location.href).searchParams.get('action') !== 'grading') return;
  const start = () => globalThis.IMN.panel.init(document, window);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

