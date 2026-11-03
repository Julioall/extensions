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
