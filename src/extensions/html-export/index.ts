import { defineExtension } from '../types';
import type { SceneNode } from '../../types';

/** Like "Anima"/"Locofy"-style export: the selected frame as a standalone HTML page. */
export default defineExtension({
  id: 'html-export',
  name: 'Export to HTML',
  description: 'Download the selected frame as a standalone, responsive-centered HTML page.',
  icon: '</>',
  needsSelection: true,
  run(api) {
    const [root] = api.selection();
    const px = (v: number) => `${Math.round(v * 100) / 100}px`;
    const fonts = new Set<string>();
    const el = (n: SceneNode, parent: SceneNode | null): string => {
      if (!n.visible) return '';
      const s: string[] = [];
      const flow = !!parent?.autoLayout;
      if (!parent) s.push('position:relative');
      else if (!flow) s.push('position:absolute', `left:${px(n.x - parent.x)}`, `top:${px(n.y - parent.y)}`);
      else s.push('position:relative');
      if (n.type !== 'text' || n.textAutoResize === 'height') s.push(`width:${px(n.w)}`);
      if (n.type !== 'text') s.push(`height:${px(n.h)}`);
      if (n.fill && n.type !== 'text' && n.type !== 'path') s.push(`background:${n.fill}`);
      if (n.type === 'ellipse') s.push('border-radius:50%');
      else if (n.radii) s.push(`border-radius:${n.radii.map(px).join(' ')}`);
      else if (n.radius) s.push(`border-radius:${px(n.radius)}`);
      if (n.stroke && n.type !== 'text') s.push(`border:${px(n.strokeWidth)} ${n.strokeDash ? 'dashed' : 'solid'} ${n.stroke}`, 'box-sizing:border-box');
      if (n.opacity !== 1) s.push(`opacity:${n.opacity}`);
      if (n.rotation) s.push(`transform:rotate(${n.rotation}deg)`);
      if (n.clip) s.push('overflow:hidden');
      if (n.shadow) s.push(`box-shadow:${px(n.shadow.x)} ${px(n.shadow.y)} ${px(n.shadow.blur)} ${n.shadow.color}${Math.round(n.shadow.opacity * 255).toString(16).padStart(2, '0')}`);
      if (n.autoLayout) {
        const a = n.autoLayout;
        s.push('display:flex', `flex-direction:${a.direction === 'horizontal' ? 'row' : 'column'}`, `gap:${px(a.gap)}`, `padding:${px(a.padding)}`, 'box-sizing:border-box', `align-items:${a.align === 'start' ? 'flex-start' : a.align === 'end' ? 'flex-end' : 'center'}`);
        if (a.justify === 'between') s.push('justify-content:space-between');
      }
      if (n.layoutFill) s.push('flex:1');
      const kids = api.children(n.id).map((c) => el(c, n)).join('');
      if (n.type === 'text') {
        fonts.add(n.fontFamily ?? 'Inter');
        s.push(`font-family:'${n.fontFamily}',sans-serif`, `font-size:${px(n.fontSize ?? 16)}`, `font-weight:${n.fontWeight}`, `line-height:${Math.round((n.lineHeight ?? 1.2) * 100)}%`, `color:${n.fill ?? '#000'}`, `text-align:${n.textAlign ?? 'left'}`, `white-space:${n.textAutoResize === 'height' ? 'normal' : 'pre'}`, 'margin:0');
        const text = (n.text ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
        return `<p style="${s.join(';')}">${text}</p>`;
      }
      if (n.type === 'image') return `<img style="${s.join(';')};object-fit:${n.imageFit === 'fit' ? 'contain' : 'cover'}" src="${n.src}" alt="">`;
      return `<div style="${s.join(';')}">${kids}</div>`;
    };
    const body = el(root, null);
    const fontLink = [...fonts].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;500;600;700`).join('&');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${root.name}</title>
${fonts.size ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontLink}&display=swap">` : ''}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f5}</style>
</head><body>
${body}
</body></html>`;
    api.download(`${root.name.replace(/[^\w-]+/g, '-')}.html`, html, 'text/html');
    return `Exported “${root.name}” to HTML.`;
  },
});
