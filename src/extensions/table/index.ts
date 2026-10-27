import { defineExtension } from '../types';

/** Like "Table Creator": a real auto-layout table you can keep editing. */
export default defineExtension({
  id: 'table',
  name: 'Table',
  description: 'Create an auto-layout table with a header row (paste CSV to fill it).',
  icon: '▤',
  inputs: [
    { key: 'rows', label: 'Rows (excluding header)', type: 'number', default: 4, min: 1, max: 50 },
    { key: 'cols', label: 'Columns', type: 'number', default: 3, min: 1, max: 12 },
    { key: 'csv', label: 'CSV data (optional, first line = header)', type: 'textarea', default: '', placeholder: 'Name,Role,Status\nAva,Designer,Active' },
    { key: 'cellWidth', label: 'Cell width', type: 'number', default: 160, min: 40 },
    { key: 'accent', label: 'Header color', type: 'color', default: '#f4f4f5' },
  ],
  run(api, v) {
    const csv = String(v.csv ?? '').trim();
    const data = csv ? csv.split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim())) : null;
    const cols = data ? Math.max(...data.map((r) => r.length)) : Math.round(Number(v.cols) || 3);
    const rows = data ? data.length - 1 : Math.round(Number(v.rows) || 4);
    const W = Number(v.cellWidth) || 160;
    const c = api.viewportCenter();
    const table = api.create('frame', { name: 'Table', x: Math.round(c.x - (cols * W) / 2), y: Math.round(c.y - (rows + 1) * 20), fill: '#ffffff', stroke: '#e4e4e7', radius: 8, autoLayout: { direction: 'vertical', gap: 0, padding: 0, align: 'start' } });
    for (let r = 0; r <= rows; r++) {
      const row = api.create('frame', { name: r === 0 ? 'Header' : `Row ${r}`, fill: r === 0 ? String(v.accent) : '#ffffff', clip: false, autoLayout: { direction: 'horizontal', gap: 0, padding: 0, align: 'start' } }, table);
      for (let k = 0; k < cols; k++) {
        const cell = api.create(
          'frame',
          { name: 'Cell', fill: null, w: W, h: 40, clip: true, autoLayout: { direction: 'horizontal', gap: 0, padding: 12, align: 'center', hugMain: false, hugCross: false } },
          row,
        );
        const text = data ? data[r]?.[k] ?? '' : r === 0 ? `Column ${k + 1}` : `Cell ${r}.${k + 1}`;
        api.create('text', { name: 'Text', text: text || ' ', fontSize: 13, fontWeight: r === 0 ? 600 : 400, fill: r === 0 ? '#18181b' : '#3f3f46' }, cell);
      }
    }
    api.select([table]);
  },
});
