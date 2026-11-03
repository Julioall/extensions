// Fluxo de interface: preparar → revisar → baixar → conferir resultado.
// Nenhuma regra de extração/ZIP aqui. O render usa textContent via IMN.dom.h.
(function (root) {
  'use strict';
  const IMN = root.IMN;
  const h = IMN.dom.h;
  const count = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

  function open({ doc, win, bar, deps, entries, unverified = 0, showDetail }) {
    bar.download.disabled = true;
    bar.download.classList.add('imn-downloading');
    bar.download.replaceChildren(IMN.icons.make(doc, 'refresh'));
    bar.el.setAttribute('aria-busy', 'true');
    const report = (progress) => {
      bar.status.textContent = progress.stage === 'prepare'
        ? `Preparando: ${progress.done}/${progress.total}`
        : progress.stage === 'zip' ? 'Criando ZIP…'
          : `Incluindo arquivos: ${progress.done}/${progress.total}`;
    };
    const alertNodes = (errors) => errors.length ? [
      h(doc, 'details', { class: 'imn-warning-details' },
        h(doc, 'summary', {}, `${count(errors.length, 'aviso', 'avisos')} para conferir`),
        h(doc, 'ul', { class: 'imn-warning-list' }, ...errors.map(e => h(doc, 'li', {}, e))))
    ] : [];
    function unlock() {
      bar.download.disabled = false;
      bar.download.classList.remove('imn-downloading');
      bar.download.replaceChildren(IMN.icons.make(doc, 'download'));
      bar.el.setAttribute('aria-busy', 'false');
      bar.status.textContent = deps.lastSummaryText || 'Pronto para uma nova operação.';
    }
    function result(message, errors, tone, needsReview = 0, downloaded = false) {
      unlock();
      if (downloaded) {
        bar.download.classList.add('imn-success');
        bar.el.querySelector('.imn-batch-open')?.classList.add('imn-primary');
        bar.status.textContent = message;
        const token = (bar._imnLogToken || 0) + 1; bar._imnLogToken = token;
        win.setTimeout(() => { if (bar._imnLogToken === token) bar.status.textContent = ''; }, 5000);
        bar.detail.hidden = true;
        return;
      }
      // Somente falhas exigem uma mensagem persistente; sucesso não abre painel.
      showDetail(bar, doc, [h(doc, 'div', { class: `imn-package-outcome ${tone}`, role: 'alert' }, message), ...alertNodes(errors)]);
    }
    return IMN.packages.prepare(entries, { deps, origin: win.location.origin, onProgress: report })
      .then(({ prepared, errors }) => {
        if (!prepared.length) { result('Nenhuma atividade pôde ser preparada.', errors, 'imn-package-danger'); return; }
        // Clique em baixar executa diretamente o preparo e a geração do ZIP.
        const downloadNow = async () => {
          bar.el.setAttribute('aria-busy', 'true');
          bar.detail.hidden = true;
          const built = await IMN.packages.build(prepared,
            { deps, origin: win.location.origin, initialErrors: errors, onProgress: report });
          if (built.blob) {
            try {
              await IMN.packageSave.download(win, doc, built.blob, built.name);
              const s = built.summary;
              result(`Download iniciado · ${count(s.activities, 'atividade', 'atividades')} · ${count(s.students, 'envio', 'envios')}`,
                s.errors, s.errors.length || s.needsReview ? 'imn-package-attention' : 'imn-package-success', s.needsReview, true);
            } catch (error) { result(`Não foi possível iniciar o download: ${error.message}`, built.summary.errors, 'imn-package-danger'); }
            return;
          }
          // Plano de contingência: preserva envios quando o pacote único não couber na memória.
          const failures = [...built.summary.errors, built.error || 'Não foi possível montar o ZIP único.'];
          let downloaded = 0;
          for (const a of built.archives) {
            try {
              const name = deps.downloads.buildFilename([IMN.packages.ROOT_FOLDER, ...a.item.folders],
                a.item.name, a.item.userIds.length, a.item.assignmentId);
              await IMN.packageSave.download(win, doc, a.blob, name);
              downloaded++;
            } catch (error) { failures.push(`${a.item.name}: ${error.message}`); }
          }
          result(`${downloaded} ZIP(s) baixados separadamente. Atenção: sem manifesto e enunciados.`,
            failures, 'imn-package-attention');
        };
        return downloadNow();
      }).catch(error => result(`Não foi possível preparar o pacote: ${error.message}`, [], 'imn-package-danger'));
  }
  IMN.packageFlow = { open };
})(globalThis);
