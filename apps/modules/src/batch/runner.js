// Executa o lote: uma atividade por vez numa aba-fantasma (iframe do mesmo domínio), preenchendo,
// salvando e RELENDO. Se um campo não conferir, o lote PARA na hora. Falha de leitura nunca vira zero.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const h = IMN.dom.h;

  // Driver real: um iframe fora da tela. load(url) e submit(botão) resolvem com o Document recarregado.
  function createIframeDriver(win, doc, { timeoutMs = 60000 } = {}) {
    let frame = null;
    const ensure = () => {
      if (!frame) {
        frame = h(doc, 'iframe', { 'aria-hidden': 'true', tabindex: '-1', title: 'Importar Notas (lote em andamento)', style: 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;border:0;visibility:hidden;pointer-events:none' });
        doc.body.append(frame);
      }
      return frame;
    };
    function waitLoad(trigger) {
      return new Promise((resolve, reject) => {
        const f = ensure();
        const done = fn => value => { win.clearTimeout(timer); f.removeEventListener('load', onLoad); fn(value); };
        const fail = done(reject);
        const ok = done(resolve);
        const timer = win.setTimeout(() => fail(new Error('Tempo limite: o Moodle não terminou de carregar a página.')), timeoutMs);
        function onLoad() {
          try {
            const d = f.contentDocument;
            if (!d || !d.documentElement) throw new Error('vazio');
            ok(d);
          } catch (_) {
            fail(new Error('O Moodle não permite abrir esta tela dentro da extensão. Use "Importar notas" dentro da própria atividade.'));
          }
        }
        f.addEventListener('load', onLoad);
        try { trigger(f); } catch (error) { fail(error); }
      });
    }
    return {
      load: url => waitLoad(f => { f.src = url; }),
      submit: button => waitLoad(() => button.click()),
      close() { if (frame) { frame.remove(); frame = null; } }
    };
  }

  const keyOf = (userId, field) => `${userId}|${field}`;

  // job: { cmid, name, url, records, overwriteGrade, overwriteFeedback, expected: [{userId,name,field,to}] }
  // Resultado: { outcome, message, fields: [{ userId, name, field, from, to, after, status, reason }] }
  //   outcome: conferido | sem_alteracao | nao_lancada (nada foi salvo) | divergente | nao_verificada (salvou, mas não deu para conferir)
  async function runJob(job, { driver, governor, fetchDoc }) {
    const M = IMN.moodle;
    const run = fn => (governor ? governor.run(fn) : fn());
    const out = { cmid: job.cmid, name: job.name, outcome: 'nao_lancada', message: '', fields: [], diagnostic: { requestedUrl: job.url, verificationUrls: [], observations: [] } };
    let idoc;
    try {
      const u = new URL(job.url);
      u.searchParams.set('_imn_edit', String(Date.now()));
      idoc = await run(() => driver.load(u.href));
    } catch (error) { out.message = error.message; return out; }

    out.diagnostic.observations.push('Tela de edição aberta: ' + (idoc.URL || job.url));
    const ready = M.readiness(idoc, { href: job.url });
    if (!ready.ok) { out.message = ready.problem; out.diagnostic.observations.push(ready.problem); return out; }

    const fresh = IMN.plan.buildPlan(job.records, M.readRows(idoc), { decimal: M.decimalSeparator(idoc), overwriteGrade: job.overwriteGrade, overwriteFeedback: job.overwriteFeedback });
    const wanted = new Set(job.expected.map(e => keyOf(e.userId, e.field)));
    const applied = new Set();
    const plan = { ...fresh, items: fresh.items.map(item => {
      if (item.status !== 'ready') return item;
      const changes = item.changes.filter(c => wanted.has(keyOf(item.row.userId, c.field)));
      changes.forEach(c => applied.add(keyOf(item.row.userId, c.field)));
      return { ...item, changes, status: changes.length ? 'ready' : 'unchanged' };
    }) };
    for (const e of job.expected) {
      if (!applied.has(keyOf(e.userId, e.field))) out.fields.push({ userId: e.userId, name: e.name, field: e.field, from: '', to: e.to, after: '', status: 'ignorado', reason: 'A página mudou desde a prévia; este campo não foi gravado.' });
    }
    const expected = IMN.plan.toExpected(plan);
    if (!expected.length) {
      if (job.expected.length && fetchDoc) {
        const check = await IMN.reconcile.verifySaved(job, job.expected, { fetchDoc, governor });
        const checkedKeys = new Set(check.fields.map(f => keyOf(f.userId, f.field)));
        out.fields = out.fields.filter(f => !checkedKeys.has(keyOf(f.userId, f.field)));
        out.fields.push(...check.fields);
        out.outcome = check.outcome;
        out.message = check.message;
      } else {
        out.outcome = job.expected.length ? 'nao_verificada' : 'sem_alteracao';
        out.message = 'Nenhuma alteração aplicada; sem confirmação independente.';
        if (job.expected.length) out.fields.push(...job.expected.map(e => ({ ...e, from: '', after: '', status: 'nao_verificado', reason: out.message })));
      }
      return out;
    }

    const before = new Map();
    for (const item of plan.items) if (item.status === 'ready') for (const c of item.changes) before.set(keyOf(item.row.userId, c.field), c.from);

    // Para reenvios, consultar novamente a origem (GET independente) antes do POST.
    // Se o valor mudou, não sobrescrever. Se já estiver igual ao enviado, não repetir.
    const retryTargets = job.expected.filter(e => Object.hasOwn(e, 'retryFrom'));
    let retryRows = null;
    if (retryTargets.length) {
      if (!fetchDoc) {
        out.outcome = 'nao_verificada';
        out.message = 'Reenvio bloqueado: não foi possível fazer a conferência prévia.';
        out.fields.push(...retryTargets.map(f => ({ ...f, after: '', status: 'nao_verificado', reason: out.message })));
        return out;
      }
      try {
        retryRows = (await IMN.reconcile.readFresh(job, retryTargets, { fetchDoc, governor })).found;
      } catch (error) {
        out.outcome = 'nao_verificada';
        out.message = `Reenvio bloqueado: ${error.message}`;
        out.fields.push(...retryTargets.map(f => ({ ...f, after: '', status: 'nao_verificado', reason: out.message })));
        return out;
      }
    }
    for (const item of plan.items) {
      if (item.status !== 'ready') continue;
      item.changes = item.changes.filter(change => {
        const wanted = job.expected.find(e => keyOf(e.userId, e.field) === keyOf(item.row.userId, change.field));
        if (!wanted || !Object.hasOwn(wanted, 'retryFrom')) return true;
        const actualRow = retryRows.get(String(wanted.userId));
        const current = actualRow ? (change.field === 'grade' ? actualRow.gradeText : actualRow.feedbackText) : null;
        if (current !== null && IMN.reconcile.same(change.field, current, wanted.to)) {
          out.fields.push({ ...wanted, from: wanted.retryFrom, after: current, status: 'conferido', reason: '' });
          return false;
        }
        if (current !== null && IMN.reconcile.same(change.field, current, wanted.retryFrom)) return true;
        out.fields.push({ ...wanted, from: wanted.retryFrom, after: current ?? '', status: 'nao_verificado', reason: 'O valor não coincide mais com o anterior; reenvio bloqueado.' });
        return false;
      });
      if (!item.changes.length) item.status = 'unchanged';
    }
    const safeExpected = IMN.plan.toExpected(plan);
    if (!safeExpected.length) {
      out.outcome = out.fields.some(f => f.status === 'nao_verificado') ? 'nao_verificada' : out.fields.every(f => f.status === 'conferido') && out.fields.length ? 'conferido' : 'sem_alteracao';
      out.message = out.outcome === 'nao_verificada' ? 'Reenvio bloqueado: valores alterados ou não localizados.' : 'Nenhum campo precisa de nova gravação.';
      return out;
    }
    M.fillPlan(plan);
    const button = M.saveButton(idoc);
    if (!button) { out.message = 'Botão de salvar do Moodle não encontrado nesta atividade; nada foi salvo.'; out.diagnostic.observations.push(out.message); return out; }

    // O iframe fez o POST, mas NUNCA é fonte de confirmação: ele pode exibir
    // resposta intermediária, tabela filtrada, estado de navegação ou página em cache.
    // O mesmo fetch sem cache do radar relê os alunos por ID numa consulta separada.
    let submitError = '';
    try { await run(() => driver.submit(button)); }
    catch (error) { submitError = error.message || String(error); }
    // Releitura deve reconciliar TODOS os campos esperados, inclusive os que
    // foram pulados porque já estavam iguais ou mudaram desde a prévia.
    const changes = job.expected.map(e => ({ ...e, from: before.get(keyOf(e.userId, e.field)) ?? e.retryFrom ?? '' }));
    if (!fetchDoc) {
      out.outcome = 'nao_verificada';
      out.message = 'A verificação independente não está disponível.';
      out.fields.push(...changes.map(f => ({ ...f, after: '', status: 'nao_verificado', reason: out.message })));
      return out;
    }
    const verification = await IMN.reconcile.verifySaved(job, changes, { fetchDoc, governor });
    out.diagnostic.verificationUrls = verification.urls || [];
    out.diagnostic.observations.push(verification.message);
    const byKey = new Map(out.fields.map(f => [keyOf(f.userId, f.field), f]));
    verification.fields.forEach(f => byKey.set(keyOf(f.userId, f.field), f));
    out.fields = [...byKey.values()];
    out.outcome = IMN.reconcile.outcomeFor(out.fields.filter(f => f.status !== 'ignorado'));
    out.message = verification.message + (submitError ? ` A navegação do salvamento também relatou: ${submitError}` : '');
    return out;
  }


  function createBatchRunner({ driver, governor, fetchDoc, win, onProgress = () => {}, gapMs = 350 }) {
    let cancelled = false;
    let paused = false;
    let release = null;
    const gate = () => (paused ? new Promise(resolve => { release = resolve; }) : null);

    async function run(jobs) {
      const results = [];
      try {
        for (let i = 0; i < jobs.length; i++) {
          const wait = gate(); if (wait) { onProgress({ type: 'paused', index: i, total: jobs.length }); await wait; }
          if (cancelled) break;
          const job = jobs[i];
          onProgress({ type: 'start', index: i, total: jobs.length, job });
          let result;
          try { result = await runJob(job, { driver, governor, fetchDoc }); }
          catch (error) { result = { cmid: job.cmid, name: job.name, outcome: 'nao_verificada', message: `Falha inesperada: ${error.message}`, diagnostic: { requestedUrl: job.url, observations: [String(error.stack || error.message)], verificationUrls: [] }, fields: job.expected.map(e => ({ ...e, from: '', after: '', status: 'nao_verificado', reason: error.message })) }; }
          results.push(result);
          onProgress({ type: 'done', index: i, total: jobs.length, job, result });
          if (i < jobs.length - 1) await new Promise(r => win.setTimeout(r, gapMs));
        }
        if (cancelled) {
          const done = new Set(results.map(r => String(r.cmid)));
          jobs.filter(j => !done.has(String(j.cmid))).forEach(j => results.push({ cmid: j.cmid, name: j.name, outcome: 'cancelada', message: 'Cancelada por você.', fields: [] }));
        }
        return { results, stopped: false, cancelled };
      } finally {
        driver.close();
      }
    }

    return {
      run,
      pause() { paused = true; },
      resume() { paused = false; if (release) { const r = release; release = null; r(); } },
      cancel() { cancelled = true; paused = false; if (release) { const r = release; release = null; r(); } },
      get isPaused() { return paused; }
    };
  }

  root.IMN.batchRunner = { createIframeDriver, runJob, createBatchRunner };
})(globalThis);
