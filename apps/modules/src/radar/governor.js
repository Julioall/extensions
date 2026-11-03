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
