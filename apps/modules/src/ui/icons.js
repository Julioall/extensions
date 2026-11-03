// Ícones SVG locais; interface acessível e independente de ícones externos do Moodle.
(function (root) {
  'use strict';
  const svgNS = 'http://www.w3.org/2000/svg';
  const PATHS = {
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35'],
    refresh: ['M20 11a8 8 0 0 0-14.5-4.5L3 9', 'M3 3v6h6', 'M4 13a8 8 0 0 0 14.5 4.5L21 15', 'M21 21v-6h-6'],
    copy: ['M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2', 'M10 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z']
  };

  function make(doc, name) {
    if (!Object.prototype.hasOwnProperty.call(PATHS, name)) throw new Error('Ícone não suportado: ' + name);
    const svg = doc.createElementNS(svgNS, 'svg');
    for (const [key, value] of Object.entries({
      viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.85', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
      class: 'imn-icon imn-icon-' + name
    })) svg.setAttribute(key, value);
    PATHS[name].forEach(d => {
      const p = doc.createElementNS(svgNS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  root.IMN.icons = { make };
})(globalThis);
