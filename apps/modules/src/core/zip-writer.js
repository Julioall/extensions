// Montagem de um ZIP único (sem compressão) a partir de pedaços já prontos. Sem DOM.
// Serve para juntar os ZIPs do Moodle (já comprimidos) e os arquivos de apoio num só pacote sem reler tudo na memória:
// o Blob final referencia os Blobs originais; só o CRC32 percorre os bytes, em blocos.
(function (root) {
  'use strict';
  const MAX_32 = 0xFFFFFFFF;

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();

  async function crc32(blob) {
    let crc = 0xFFFFFFFF;
    const feed = bytes => { for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); };
    if (typeof blob.stream === 'function') {
      const reader = blob.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        feed(value);
      }
    } else if (typeof blob.arrayBuffer === 'function') {
      feed(new Uint8Array(await blob.arrayBuffer()));
    } else {
      throw new Error('Este navegador não consegue ler o arquivo para empacotar.');
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosStamp(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  const toBlob = data => (typeof data === 'string' ? new Blob([new TextEncoder().encode(data)]) : (typeof data.size === 'number' && typeof data.slice === 'function') ? data : new Blob([data]));

  // entries: [{ name: 'Pasta/arquivo.zip', data: Blob | string | Uint8Array }]. Recusa o que não cabe num ZIP simples (4 GB / 65535).
  async function buildStoredZip(entries, { now = new Date() } = {}) {
    if (!entries.length) throw new Error('Nenhum arquivo para empacotar.');
    if (entries.length >= 0xFFFF) throw new Error('Arquivos demais para um único pacote.');
    const enc = new TextEncoder();
    const stamp = dosStamp(now);
    const parts = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const blob = toBlob(entry.data);
      const name = enc.encode(entry.name);
      if (blob.size >= MAX_32) throw new Error(`"${entry.name}" passa de 4 GB: grande demais para um único pacote.`);
      const crc = await crc32(blob);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034B50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, stamp.time, true); local.setUint16(12, stamp.date, true); local.setUint32(14, crc, true);
      local.setUint32(18, blob.size, true); local.setUint32(22, blob.size, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014B50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
      cd.setUint16(12, stamp.time, true); cd.setUint16(14, stamp.date, true); cd.setUint32(16, crc, true);
      cd.setUint32(20, blob.size, true); cd.setUint32(24, blob.size, true); cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      parts.push(local.buffer, name, blob);
      central.push(cd.buffer, name);
      offset += 30 + name.length + blob.size;
      if (offset >= MAX_32) throw new Error('O pacote passaria de 4 GB.');
    }
    const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // Nomes repetidos dentro do pacote ganham " (2)", " (3)"…
  function uniqueName(name, used) {
    if (!used.has(name)) { used.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const stem = dot > name.lastIndexOf('/') ? name.slice(0, dot) : name;
    const ext = dot > name.lastIndexOf('/') ? name.slice(dot) : '';
    for (let n = 2; ; n++) { const candidate = `${stem} (${n})${ext}`; if (!used.has(candidate)) { used.add(candidate); return candidate; } }
  }

  root.IMN.zip = { buildStoredZip, crc32, uniqueName };
})(globalThis);
