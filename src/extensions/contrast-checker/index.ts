import { defineExtension } from '../types';
import type { SceneNode } from '../../types';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** Like "Stark"/"Contrast": WCAG contrast of text against what's behind it. */
export default defineExtension({
  id: 'contrast-checker',
  name: 'Contrast Checker',
  description: 'Check WCAG contrast of selected text (or every text on the page) against its background.',
  icon: '◐',
  run(api) {
    let texts = api.selection().filter((n) => n.type === 'text');
    if (!texts.length) texts = api.pageNodes().filter((n) => n.type === 'text');
    if (!texts.length) return 'No text layers to check.';
    const bgOf = (n: SceneNode) => {
      let p = n.parentId ? api.get(n.parentId) : undefined;
      while (p) {
        if (p.fill && p.type !== 'group' && !p.gradient) return p.fill;
        p = p.parentId ? api.get(p.parentId) : undefined;
      }
      return api.page().bg;
    };
    const fails: string[] = [];
    let pass = 0;
    for (const t of texts) {
      if (!t.fill) continue;
      const a = lum(t.fill);
      const b = lum(bgOf(t));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = (t.fontSize ?? 16) >= 24 || ((t.fontSize ?? 16) >= 18.66 && (t.fontWeight ?? 400) >= 700);
      if (ratio >= (large ? 3 : 4.5)) pass++;
      else fails.push(`“${t.name}” ${ratio.toFixed(2)}:1`);
    }
    if (fails.length) api.select(texts.filter((t) => fails.some((f) => f.includes(`“${t.name}”`))).map((t) => t.id));
    return fails.length ? `${fails.length} fail WCAG AA (selected): ${fails.slice(0, 3).join(', ')}${fails.length > 3 ? '…' : ''}` : `All ${pass} text layers pass WCAG AA ✓`;
  },
});
