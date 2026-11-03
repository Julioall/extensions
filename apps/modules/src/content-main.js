// Ponto de entrada: só inicia o painel quando a página é a tela de avaliação de uma atividade.
(function () {
  'use strict';
  if (!/\/mod\/assign\/view\.php$/.test(location.pathname)) return;
  if (new URL(location.href).searchParams.get('action') !== 'grading') return;
  const start = () => globalThis.IMN.panel.init(document, window);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
