import { defineExtension } from '../types';

const STYLES = ['notionists', 'avataaars', 'lorelei', 'micah', 'personas', 'adventurer', 'bottts', 'thumbs', 'shapes'];

/** Like avatar plugins: drops in illustrated avatars (DiceBear, free & open source). */
export default defineExtension({
  id: 'avatars',
  name: 'Avatars',
  description: 'Fill selected circles/rectangles with illustrated avatars, or insert a row of them.',
  icon: '☺',
  inputs: [
    { key: 'style', label: 'Style', type: 'select', default: 'notionists', options: STYLES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
    { key: 'count', label: 'Avatars to insert (when nothing is selected)', type: 'number', default: 5, min: 1, max: 20 },
    { key: 'size', label: 'Size', type: 'number', default: 64, min: 16 },
    { key: 'bg', label: 'Background', type: 'color', default: '#e0e7ff' },
  ],
  async run(api, v) {
    const url = () => `https://api.dicebear.com/9.x/${v.style}/svg?seed=${Math.random().toString(36).slice(2, 9)}&backgroundColor=${String(v.bg).slice(1)}`;
    const targets = api.selection().filter((n) => n.type === 'ellipse' || n.type === 'rect' || n.type === 'frame');
    if (targets.length) {
      for (const n of targets) {
        const id = await api.addImage(url(), { at: { x: n.x + n.w / 2, y: n.y + n.h / 2 }, width: Math.min(n.w, n.h), name: 'Avatar', parentId: n.parentId });
        api.update(id, { radius: n.type === 'ellipse' ? n.w / 2 : n.radius });
        api.remove(n.id);
      }
      return `Added ${targets.length} avatars.`;
    }
    const size = Number(v.size) || 64;
    const count = Number(v.count) || 5;
    const c = api.viewportCenter();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = await api.addImage(url(), { at: { x: c.x + (i - (count - 1) / 2) * (size + 12), y: c.y }, width: size, name: 'Avatar' });
      api.update(id, { radius: size / 2 });
      ids.push(id);
    }
    api.select(ids);
  },
});
