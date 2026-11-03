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
