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
