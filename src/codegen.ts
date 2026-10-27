import type { Doc, SceneNode } from './types';
import { textLines } from './doc';

/*
 * Developer handoff: turn layers into Tailwind classes or a React (JSX) component.
 * Positions are absolute inside the parent, except children of auto layout frames, which flow with flexbox.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
const px = (v: number) => `${r2(v)}px`;

function parentFlows(doc: Doc, n: SceneNode) {
  const p = n.parentId ? doc.nodes[n.parentId] : null;
  return !!p?.autoLayout;
}

function background(n: SceneNode): string | null {
  if (!n.fill || n.type === 'text' || n.type === 'path') return null;
  const g = n.gradient;
  if (!g) return n.fill;
  const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  return g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle + 90}deg, ${stops})`;
}

/** React inline-style object for one layer. */
export function styleFor(doc: Doc, n: SceneNode): Record<string, string | number> {
  const st: Record<string, string | number> = {};
  const p = n.parentId ? doc.nodes[n.parentId] : null;
  if (!parentFlows(doc, n)) {
    st.position = 'absolute';
    st.left = r2(n.x - (p?.x ?? 0));
    st.top = r2(n.y - (p?.y ?? 0));
  }
  if (n.type !== 'text' || n.textAutoResize === 'height') st.width = r2(n.w);
  if (n.type !== 'text') st.height = r2(n.h);
  if (n.autoLayout) {
    const a = n.autoLayout;
    Object.assign(st, {
      position: st.position ?? 'relative',
      display: 'flex',
      flexDirection: a.direction === 'horizontal' ? 'row' : 'column',
      gap: r2(a.gap),
      padding: r2(a.padding),
      alignItems: a.align === 'start' ? 'flex-start' : a.align === 'end' ? 'flex-end' : 'center',
      justifyContent: a.justify === 'between' ? 'space-between' : a.justify === 'center' ? 'center' : a.justify === 'end' ? 'flex-end' : 'flex-start',
    });
  } else if (n.children.length) st.position = st.position ?? 'relative';
  if (n.layoutFill) st.flex = 1;
  if (n.layoutStretch) st.alignSelf = 'stretch';
  const bg = background(n);
  if (bg) st.background = bg;
  if (n.type === 'ellipse') st.borderRadius = '50%';
  else if (n.radii) st.borderRadius = n.radii.map(px).join(' ');
  else if (n.radius) st.borderRadius = r2(n.radius);
  if (n.stroke && n.type !== 'text') st.border = `${px(n.strokeWidth)} ${n.strokeDash ? 'dashed' : 'solid'} ${n.stroke}`;
  if (n.clip && n.children.length) st.overflow = 'hidden';
  if (n.opacity !== 1) st.opacity = r2(n.opacity);
  if (n.rotation) st.transform = `rotate(${r2(n.rotation)}deg)`;
  const shadows: string[] = [];
  const hex = (o: number) => Math.round(o * 255).toString(16).padStart(2, '0');
  if (n.shadow) shadows.push(`${px(n.shadow.x)} ${px(n.shadow.y)} ${px(n.shadow.blur)} ${n.shadow.color}${hex(n.shadow.opacity)}`);
  if (n.innerShadow) shadows.push(`inset ${px(n.innerShadow.x)} ${px(n.innerShadow.y)} ${px(n.innerShadow.blur)} ${n.innerShadow.color}${hex(n.innerShadow.opacity)}`);
  if (shadows.length) st.boxShadow = shadows.join(', ');
  if (n.blur) st.filter = `blur(${px(n.blur / 2)})`;
  if (n.blendMode && n.blendMode !== 'normal') st.mixBlendMode = n.blendMode;
  if (n.type === 'text') {
    Object.assign(st, {
      fontFamily: `'${n.fontFamily}', sans-serif`,
      fontSize: r2(n.fontSize ?? 16),
      fontWeight: n.fontWeight ?? 400,
      lineHeight: `${Math.round((n.lineHeight ?? 1.2) * 100)}%`,
      color: n.fill ?? 'inherit',
      textAlign: n.textAlign ?? 'left',
      whiteSpace: n.textAutoResize === 'height' ? 'normal' : 'pre',
    });
    if (n.letterSpacing) st.letterSpacing = r2(n.letterSpacing);
    if (n.textDecoration && n.textDecoration !== 'none') st.textDecoration = n.textDecoration;
  }
  if (n.type === 'image') st.objectFit = n.imageFit === 'fit' ? 'contain' : 'cover';
  return st;
}

/* ---------- Tailwind ---------- */

const tw = (prefix: string, v: string | number) => `${prefix}-[${String(v).replace(/ /g, '_')}]`;

export function tailwindFor(doc: Doc, n: SceneNode): string {
  const st = styleFor(doc, n);
  const c: string[] = [];
  if (st.position) c.push(String(st.position));
  if (st.left !== undefined) c.push(tw('left', px(+st.left)), tw('top', px(+st.top)));
  if (st.width !== undefined) c.push(tw('w', px(+st.width)));
  if (st.height !== undefined) c.push(tw('h', px(+st.height)));
  if (st.display === 'flex') {
    c.push('flex', st.flexDirection === 'row' ? 'flex-row' : 'flex-col', tw('gap', px(+st.gap)), tw('p', px(+st.padding)));
    c.push({ 'flex-start': 'items-start', 'flex-end': 'items-end', center: 'items-center' }[String(st.alignItems)] ?? '');
    c.push({ 'space-between': 'justify-between', center: 'justify-center', 'flex-end': 'justify-end', 'flex-start': 'justify-start' }[String(st.justifyContent)] ?? '');
  }
  if (st.flex) c.push('flex-1');
  if (st.alignSelf) c.push('self-stretch');
  if (st.background) c.push(String(st.background).startsWith('#') ? tw('bg', st.background) : tw('bg', String(st.background)));
  if (st.borderRadius) c.push(st.borderRadius === '50%' ? 'rounded-full' : tw('rounded', typeof st.borderRadius === 'number' ? px(st.borderRadius) : st.borderRadius));
  if (n.stroke && n.type !== 'text') c.push(tw('border', px(n.strokeWidth)), tw('border', n.stroke), n.strokeDash ? 'border-dashed' : '');
  if (st.overflow) c.push('overflow-hidden');
  if (st.opacity !== undefined) c.push(tw('opacity', st.opacity));
  if (st.transform) c.push(tw('rotate', `${r2(n.rotation)}deg`));
  if (st.boxShadow) c.push(tw('shadow', st.boxShadow));
  if (st.filter) c.push(tw('blur', px((n.blur ?? 0) / 2)));
  if (n.type === 'text') {
    c.push(tw('font', `'${n.fontFamily}'`), tw('text', px(n.fontSize ?? 16)), tw('font', n.fontWeight ?? 400), tw('leading', `${Math.round((n.lineHeight ?? 1.2) * 100)}%`));
    if (n.fill) c.push(tw('text', n.fill));
    if (n.textAlign && n.textAlign !== 'left') c.push(`text-${n.textAlign}`);
    if (n.letterSpacing) c.push(tw('tracking', px(n.letterSpacing)));
    if (n.textDecoration === 'underline') c.push('underline');
    if (n.textDecoration === 'line-through') c.push('line-through');
  }
  return c.filter(Boolean).join(' ');
}

/* ---------- React ---------- */

const ident = (name: string) => {
  const s = name.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join('');
  return /^[A-Za-z]/.test(s) ? s : 'Layer' + s;
};

const esc = (t: string) => t.replace(/[{}<>]/g, (c) => `{'${c}'}`);

function jsxNode(doc: Doc, id: string, depth: number, mode: 'style' | 'tailwind'): string {
  const n = doc.nodes[id];
  if (!n || !n.visible) return '';
  const pad = '  '.repeat(depth);
  const attr = mode === 'tailwind' ? `className="${tailwindFor(doc, n)}"` : `style={${JSON.stringify(styleFor(doc, n))}}`;
  if (n.type === 'text') {
    const lines = textLines(n).map(esc);
    return `${pad}<p ${attr}>${lines.join('<br />')}</p>`;
  }
  if (n.type === 'image') return `${pad}<img ${attr} src="${(n.src ?? '').startsWith('data:') ? `/${ident(n.name)}.png` : n.src}" alt="${n.name.replace(/"/g, '')}" />`;
  if (n.type === 'path') return `${pad}{/* ${n.name}: export as SVG */}\n${pad}<div ${attr} />`;
  const kids = n.children.map((c) => jsxNode(doc, c, depth + 1, mode)).filter(Boolean);
  if (n.type === 'instance') return `${pad}<${ident(doc.nodes[n.componentId ?? '']?.name ?? n.name)} />`;
  return kids.length ? `${pad}<div ${attr}>\n${kids.join('\n')}\n${pad}</div>` : `${pad}<div ${attr} />`;
}

export function reactFor(doc: Doc, n: SceneNode, mode: 'style' | 'tailwind' = 'style') {
  const name = ident(n.name);
  return `export function ${name}() {\n  return (\n${jsxNode(doc, n.id, 2, mode)}\n  );\n}\n`;
}
