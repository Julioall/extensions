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
