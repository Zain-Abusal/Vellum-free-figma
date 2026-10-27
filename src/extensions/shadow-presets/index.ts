import { defineExtension } from '../types';
import type { Shadow } from '../../types';

const PRESETS: Record<string, { shadow?: Shadow | null; inner?: Shadow | null }> = {
  none: { shadow: null, inner: null },
  subtle: { shadow: { x: 0, y: 1, blur: 3, color: '#000000', opacity: 0.12 } },
  soft: { shadow: { x: 0, y: 8, blur: 24, color: '#0f172a', opacity: 0.12 } },
  floating: { shadow: { x: 0, y: 24, blur: 48, color: '#0f172a', opacity: 0.18 } },
  hard: { shadow: { x: 6, y: 6, blur: 0, color: '#000000', opacity: 1 } },
  glow: { shadow: { x: 0, y: 0, blur: 32, color: '#7c3aed', opacity: 0.55 } },
  pressed: { shadow: null, inner: { x: 0, y: 2, blur: 6, color: '#000000', opacity: 0.25 } },
  neumorphic: { shadow: { x: 8, y: 8, blur: 20, color: '#a3b1c6', opacity: 0.6 }, inner: { x: -2, y: -2, blur: 6, color: '#ffffff', opacity: 0.8 } },
};

/** Like shadow plugins: one-click, well-tuned elevation styles. */
export default defineExtension({
  id: 'shadow-presets',
  name: 'Shadow Presets',
  description: 'Apply a tuned shadow style (subtle, soft, floating, hard, glow, pressed, neumorphic).',
  icon: '◩',
  needsSelection: true,
  inputs: [{ key: 'preset', label: 'Preset', type: 'select', default: 'soft', options: Object.keys(PRESETS).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })) }],
  run(api, v) {
    const p = PRESETS[String(v.preset)] ?? PRESETS.soft;
    const sel = api.selection();
    for (const n of sel) api.update(n.id, { shadow: p.shadow ?? null, innerShadow: p.inner ?? null });
    return `Applied “${v.preset}” to ${sel.length} layer${sel.length > 1 ? 's' : ''}.`;
  },
});
