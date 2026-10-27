import qrcode from 'qrcode-generator';
import { defineExtension } from '../types';

/** Like the "QR Code Generator" plugin: a crisp, editable QR code from any text or URL. */
export default defineExtension({
  id: 'qr-code',
  name: 'QR Code',
  description: 'Generate a QR code (as an editable vector) from a link or text.',
  icon: '▣',
  inputs: [
    { key: 'text', label: 'Link or text', type: 'text', default: 'https://example.com', placeholder: 'https://…' },
    { key: 'size', label: 'Size', type: 'number', default: 200, min: 40 },
    { key: 'color', label: 'Color', type: 'color', default: '#1e1e1e' },
    { key: 'bg', label: 'Background', type: 'color', default: '#ffffff' },
  ],
  run(api, v) {
    const qr = qrcode(0, 'M');
    qr.addData(String(v.text || ' '));
    qr.make();
    const n = qr.getModuleCount();
    const size = Number(v.size) || 200;
    const quiet = 2;
    const cell = size / (n + quiet * 2);
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${(c + quiet) * cell} ${(r + quiet) * cell}h${cell}v${cell}h-${cell}z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="${v.bg}"/><path d="${d}" fill="${v.color}" shape-rendering="crispEdges"/></svg>`;
    return api.addSvg(svg, { width: size, name: 'QR code' }).then((id) => {
      api.select([id]);
    });
  },
});
