import { defineExtension } from '../types';
import type { PathPoint } from '../../types';

/** Like "Blobs": organic shapes made of smooth bezier curves (fully editable with the pen). */
export default defineExtension({
  id: 'blob-generator',
  name: 'Blob Generator',
  description: 'Generate a random organic blob shape with smooth bezier curves.',
  icon: '⬮',
  inputs: [
    { key: 'points', label: 'Complexity (points)', type: 'number', default: 6, min: 3, max: 12 },
    { key: 'randomness', label: 'Randomness (0–100)', type: 'number', default: 40, min: 0, max: 100 },
    { key: 'size', label: 'Size', type: 'number', default: 240, min: 20 },
    { key: 'color', label: 'Color', type: 'color', default: '#8b7cf6' },
  ],
  run(api, v) {
    const count = Math.round(Number(v.points) || 6);
    const rnd = (Number(v.randomness) || 0) / 100;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 0.5 * (1 - rnd * 0.6 * Math.random());
      pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r });
    }
    // Catmull-Rom → cubic bezier handles for a smooth closed curve.
    const ring: PathPoint[] = pts.map((p, i) => {
      const prev = pts[(i - 1 + count) % count];
      const next = pts[(i + 1) % count];
      const tx = (next.x - prev.x) / 6;
      const ty = (next.y - prev.y) / 6;
      return { x: p.x, y: p.y, ix: p.x - tx, iy: p.y - ty, ox: p.x + tx, oy: p.y + ty };
    });
    const size = Number(v.size) || 240;
    const c = api.viewportCenter();
    const id = api.create('path', { name: 'Blob', x: c.x - size / 2, y: c.y - size / 2, w: size, h: size, points: ring, closed: true, fill: String(v.color), stroke: null });
    api.select([id]);
  },
});
