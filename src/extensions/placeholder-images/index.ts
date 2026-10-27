import { defineExtension } from '../types';

/** Like "Unsplash"-style plugins: drops in free placeholder photos (picsum.photos). */
export default defineExtension({
  id: 'placeholder-images',
  name: 'Placeholder Images',
  description: 'Fill selected shapes or frames with random photos, or insert new ones.',
  icon: '🖼',
  inputs: [
    { key: 'count', label: 'Images to insert (when nothing is selected)', type: 'number', default: 3, min: 1, max: 12 },
    { key: 'width', label: 'Width', type: 'number', default: 400, min: 16 },
    { key: 'height', label: 'Height', type: 'number', default: 300, min: 16 },
    { key: 'grayscale', label: 'Grayscale', type: 'checkbox', default: false },
  ],
  async run(api, v) {
    const gray = v.grayscale ? '?grayscale' : '';
    const url = (w: number, h: number) => `https://picsum.photos/seed/${Math.random().toString(36).slice(2, 8)}/${Math.round(w)}/${Math.round(h)}${gray}`;
    const targets = api.selection().filter((n) => ['rect', 'ellipse', 'frame'].includes(n.type));
    if (targets.length) {
      for (const n of targets) {
        if (n.type === 'frame') {
          await api.addImage(url(n.w, n.h), { at: { x: n.x + n.w / 2, y: n.y + n.h / 2 }, width: n.w, parentId: n.id, name: 'Photo' });
        } else {
          const id = await api.addImage(url(n.w, n.h), { at: { x: n.x + n.w / 2, y: n.y + n.h / 2 }, width: n.w, parentId: n.parentId, name: n.name });
          api.update(id, { h: n.h, radius: n.type === 'ellipse' ? Math.min(n.w, n.h) / 2 : n.radius });
          api.remove(n.id);
        }
      }
      return `Added ${targets.length} photo${targets.length > 1 ? 's' : ''}.`;
    }
    const count = Number(v.count) || 1;
    const w = Number(v.width) || 400;
    const h = Number(v.height) || 300;
    const c = api.viewportCenter();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = await api.addImage(url(w, h), { at: { x: c.x + (i - (count - 1) / 2) * (w + 24), y: c.y }, width: w, name: 'Photo' });
      api.update(id, { h });
      ids.push(id);
    }
    api.select(ids);
  },
});
