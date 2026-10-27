import { defineExtension } from '../types';

/** Radial repeat (a popular Figma Draw feature users want in the main editor): copies around a circle. */
export default defineExtension({
  id: 'radial-repeat',
  name: 'Radial Repeat',
  description: 'Repeat the selected layer around a circle, rotating each copy (flowers, dials, loaders).',
  icon: '✺',
  needsSelection: true,
  inputs: [
    { key: 'count', label: 'Copies (including the original)', type: 'number', default: 8, min: 2, max: 72 },
    { key: 'radius', label: 'Radius (distance from centre)', type: 'number', default: 80, min: 0 },
    { key: 'rotate', label: 'Rotate copies to face outward', type: 'checkbox', default: true },
  ],
  run(api, v) {
    const [n] = api.selection();
    const count = Math.max(2, Math.round(Number(v.count) || 8));
    const r = Number(v.radius) || 0;
    // The pivot sits `r` below the layer's centre, so the original stays at the top.
    const pivot = { x: n.x + n.w / 2, y: n.y + n.h / 2 + r };
    const ids = [n.id];
    for (let i = 1; i < count; i++) {
      const a = (i * 2 * Math.PI) / count;
      const cx = pivot.x + Math.sin(a) * r;
      const cy = pivot.y - Math.cos(a) * r;
      const id = api.duplicate(n.id);
      if (!id) continue;
      api.update(id, { x: cx - n.w / 2, y: cy - n.h / 2, ...(v.rotate ? { rotation: (n.rotation + (i * 360) / count) % 360 } : {}) });
      ids.push(id);
    }
    const g = api.group(ids);
    if (g) {
      api.update(g, { name: 'Radial repeat' });
      api.select([g]);
    }
    return `Made ${count} copies.`;
  },
});
