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
