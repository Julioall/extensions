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
