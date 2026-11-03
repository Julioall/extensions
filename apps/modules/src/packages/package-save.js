// Adaptador de download Chrome: mantém nome em pastas via service worker quando disponível.
(function (root) {
  'use strict';
  async function download(win, doc, blob, filename) {
    const token = (win.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
      .replace(/[^a-z0-9]/gi, '').toLowerCase();
    let registered = false;
    if (win.chrome?.runtime?.sendMessage) {
      registered = await new Promise(resolve => {
        try {
          win.chrome.runtime.sendMessage({ type: 'imn-register-download', token, filename }, response =>
            resolve(Boolean(response && response.ok) && !win.chrome.runtime.lastError));
        } catch (_) { resolve(false); }
      });
    }
    const url = win.URL.createObjectURL(blob);
    const ext = ((filename.match(/\.(zip|csv|txt)$/i) || [])[1] || 'zip').toLowerCase();
    const link = doc.createElement('a');
    link.href = url;
    link.download = registered ? `imn-pending-${token}.${ext}` : (filename.split('/').pop() || `pendentes.${ext}`);
    link.style.display = 'none';
    doc.body.append(link);
    link.click();
    link.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 120000);
    return { registered };
  }
  root.IMN.packageSave = { download };
})(globalThis);
