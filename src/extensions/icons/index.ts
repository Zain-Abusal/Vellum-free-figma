import { defineExtension } from '../types';

/** Like the "Iconify" plugin: search 200k+ open-source icons and insert them as SVG. */
export default defineExtension({
  id: 'icons',
  name: 'Icons',
  description: 'Search Material, Lucide, Tabler, Phosphor and more (via Iconify) and insert as SVG.',
  icon: '★',
  inputs: [
    { key: 'size', label: 'Size', type: 'number', default: 48, min: 8, max: 1024 },
    { key: 'color', label: 'Color', type: 'color', default: '#1e1e1e' },
  ],
  picker: {
    placeholder: 'Search icons (e.g. home, arrow, heart)',
    async search(query) {
      const q = query.trim() || 'home';
      const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=60`);
      if (!r.ok) return [];
      const j = (await r.json()) as { icons: string[] };
      return j.icons.map((full) => {
        const [prefix, name] = full.split(':');
        return { label: full, preview: `https://api.iconify.design/${prefix}/${name}.svg?height=32`, value: full };
      });
    },
  },
  async run(api, v) {
    const full = String(v.picked ?? '');
    if (!full) return 'Pick an icon first.';
    const [prefix, name] = full.split(':');
    const color = encodeURIComponent(String(v.color ?? '#1e1e1e'));
    const r = await fetch(`https://api.iconify.design/${prefix}/${name}.svg?height=${Number(v.size) || 48}&color=${color}`);
    if (!r.ok) throw new Error('Icon download failed');
    const id = await api.addSvg(await r.text(), { width: Number(v.size) || 48, name });
    api.select([id]);
  },
});
