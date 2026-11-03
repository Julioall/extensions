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
