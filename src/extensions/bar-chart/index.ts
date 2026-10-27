import { defineExtension } from '../types';

/** Like the "Chart" plugin: a quick bar chart from numbers you type. */
export default defineExtension({
  id: 'bar-chart',
  name: 'Bar Chart',
  description: 'Create an editable bar chart from comma-separated values.',
  icon: '📊',
  inputs: [
    { key: 'values', label: 'Values', type: 'text', default: '12, 19, 7, 15, 24, 18' },
    { key: 'labels', label: 'Labels (optional)', type: 'text', default: 'Mon, Tue, Wed, Thu, Fri, Sat' },
    { key: 'color', label: 'Bar color', type: 'color', default: '#0d99ff' },
    { key: 'height', label: 'Chart height', type: 'number', default: 200, min: 40 },
  ],
  run(api, v) {
    const values = String(v.values).split(',').map((s) => parseFloat(s)).filter((n) => isFinite(n));
    if (!values.length) return 'Enter some numbers.';
    const labels = String(v.labels ?? '').split(',').map((s) => s.trim());
    const H = Number(v.height) || 200;
    const bar = 32;
    const gap = 16;
    const max = Math.max(...values, 1);
    const W = values.length * (bar + gap) + gap;
    const c = api.viewportCenter();
    const x0 = Math.round(c.x - W / 2);
    const y0 = Math.round(c.y - H / 2);
    const frame = api.create('frame', { name: 'Bar chart', x: x0, y: y0, w: W, h: H + 28, fill: '#ffffff', radius: 8 });
    values.forEach((val, i) => {
      const h = Math.max(1, Math.round((val / max) * (H - 16)));
      const x = x0 + gap + i * (bar + gap);
      api.create('rect', { name: labels[i] || `Bar ${i + 1}`, x, y: y0 + H - h, w: bar, h, fill: String(v.color), radius: 4, constraints: { h: 'scale', v: 'scale' } }, frame);
      if (labels[i]) api.create('text', { name: 'Label', text: labels[i], x, y: y0 + H + 6, fontSize: 11, fill: '#8c8c8c' }, frame);
    });
    api.select([frame]);
  },
});
