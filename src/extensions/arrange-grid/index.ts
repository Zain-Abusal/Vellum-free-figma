import { defineExtension } from '../types';

/** Like "Tidy up": lay out the selection in an even grid. */
export default defineExtension({
  id: 'arrange-grid',
  name: 'Arrange in Grid',
  description: 'Arrange selected layers into rows and columns with even spacing.',
  icon: '▦',
  needsSelection: true,
  inputs: [
    { key: 'columns', label: 'Columns (0 = auto)', type: 'number', default: 0, min: 0 },
    { key: 'gap', label: 'Gap', type: 'number', default: 24, min: 0 },
  ],
  run(api, v) {
    const sel = api.selection().sort((a, b) => a.y - b.y || a.x - b.x);
    const cols = Number(v.columns) || Math.ceil(Math.sqrt(sel.length));
    const gap = Number(v.gap) || 0;
    const cellW = Math.max(...sel.map((n) => n.w));
    const cellH = Math.max(...sel.map((n) => n.h));
    const x0 = Math.min(...sel.map((n) => n.x));
    const y0 = Math.min(...sel.map((n) => n.y));
    sel.forEach((n, i) => api.update(n.id, { x: x0 + (i % cols) * (cellW + gap), y: y0 + Math.floor(i / cols) * (cellH + gap) }));
    return `Arranged ${sel.length} layers in ${cols} columns.`;
  },
});
