import { defineExtension } from '../types';

const hexToHsl = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
};

const hslToHex = (h: number, s: number, l: number) => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** Like "Coolors"-style palette plugins: generates a palette as swatches with hex labels. */
export default defineExtension({
  id: 'color-palette',
  name: 'Color Palette',
  description: 'Generate a palette (shades, analogous, complementary, triadic) from a base color.',
  icon: '🎨',
  inputs: [
    { key: 'base', label: 'Base color', type: 'color', default: '#5b4ef0' },
    {
      key: 'scheme',
      label: 'Scheme',
      type: 'select',
      default: 'shades',
      options: [
        { value: 'shades', label: 'Shades (50–900)' },
        { value: 'analogous', label: 'Analogous' },
        { value: 'complementary', label: 'Complementary' },
        { value: 'triadic', label: 'Triadic' },
        { value: 'random', label: 'Random harmonious' },
      ],
    },
  ],
  run(api, v) {
    const [h, s, l] = hexToHsl(String(v.base ?? '#5b4ef0'));
    let colors: string[];
    switch (v.scheme) {
      case 'analogous':
        colors = [-40, -20, 0, 20, 40].map((d) => hslToHex((h + d + 360) % 360, s, l));
        break;
      case 'complementary':
        colors = [hslToHex(h, s, Math.min(90, l + 25)), hslToHex(h, s, l), hslToHex(h, s, Math.max(10, l - 25)), hslToHex((h + 180) % 360, s, l), hslToHex((h + 180) % 360, s, Math.min(90, l + 25))];
        break;
      case 'triadic':
        colors = [0, 120, 240].flatMap((d) => [hslToHex((h + d) % 360, s, l), hslToHex((h + d) % 360, s, Math.min(92, l + 25))]);
        break;
      case 'random': {
        const start = Math.random() * 360;
        colors = [0, 1, 2, 3, 4].map((i) => hslToHex((start + i * 72 * (0.3 + Math.random() * 0.4)) % 360, 55 + Math.random() * 30, 35 + Math.random() * 35));
        break;
      }
      default:
        colors = [96, 90, 80, 70, 60, 50, 40, 30, 20, 12].map((li) => hslToHex(h, s, li));
    }
    const c = api.viewportCenter();
    const size = 96;
    const frame = api.create('frame', {
      name: 'Palette',
      x: Math.round(c.x - (colors.length * (size + 8)) / 2),
      y: Math.round(c.y - 70),
      fill: '#ffffff',
      radius: 12,
      autoLayout: { direction: 'horizontal', gap: 8, padding: 16, align: 'start' },
    });
    for (const color of colors) {
      const card = api.create('frame', { name: color, fill: null, clip: false, autoLayout: { direction: 'vertical', gap: 6, padding: 0, align: 'start' } }, frame);
      api.create('rect', { name: 'Swatch', w: size, h: size, fill: color, radius: 8 }, card);
      api.create('text', { name: 'Hex', text: color.toUpperCase(), fontSize: 12, fontFamily: 'Space Mono' }, card);
    }
    api.select([frame]);
  },
});
