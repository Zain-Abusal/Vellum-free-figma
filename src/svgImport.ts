import { insert, makeNode, nextName, uid } from './doc';
import { ringsFromAbs } from './geometry';
import type { Doc, PathPoint, Pt, SceneNode } from './types';

/*
 * SVG import as editable vectors (like Figma): paths, rects, circles, ellipses, lines, polylines,
 * polygons, text and images become layers inside a frame. Transforms are applied, arcs and
 * quadratics become cubic beziers, and styles come from the computed style.
 * The SVG is sanitized (no scripts, event handlers or foreignObject) before it touches the DOM.
 */

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
const apply = (m: Matrix, p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

/* ---------- path data → absolute rings with bezier handles ---------- */

function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): [Pt, Pt, Pt][] {
  if (!rx || !ry) return [[{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x2, y: y2 }]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: [Pt, Pt, Pt][] = [];
  const pt = (t: number) => ({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos });
  const dpt = (t: number) => ({ x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos });
  for (let i = 0; i < segs; i++) {
    const a = t1;
    const b = t1 + step;
    const p0 = pt(a);
    const p3 = pt(b);
    const d0 = dpt(a);
    const d3 = dpt(b);
    out.push([{ x: p0.x + k * d0.x, y: p0.y + k * d0.y }, { x: p3.x - k * d3.x, y: p3.y - k * d3.y }, p3]);
    t1 = b;
  }
  return out;
}

export function parsePathData(d: string): { rings: PathPoint[][]; closed: boolean[] } {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const rings: PathPoint[][] = [];
  const closed: boolean[] = [];
  let ring: PathPoint[] | null = null;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastC: Pt | null = null;
  let lastQ: Pt | null = null;
  let cmd = '';
  let i = 0;
  const n = () => parseFloat(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  const begin = (p: Pt) => {
    ring = [{ x: p.x, y: p.y }];
    rings.push(ring);
    closed.push(false);
  };
  const line = (p: Pt) => {
    if (!ring) begin(cur);
    ring!.push({ x: p.x, y: p.y });
    cur = p;
  };
  const cubic = (c1: Pt, c2: Pt, p: Pt) => {
    if (!ring) begin(cur);
    const last = ring![ring!.length - 1];
    last.ox = c1.x;
    last.oy = c1.y;
    ring!.push({ x: p.x, y: p.y, ix: c2.x, iy: c2.y });
    cur = p;
    lastC = c2;
  };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const o = rel ? cur : { x: 0, y: 0 };
    const C = cmd.toUpperCase();
    const prevC = lastC as Pt | null;
    const prevQ = lastQ as Pt | null;
    lastC = null;
    lastQ = null;
    if (C === 'Z') {
      if (ring) {
        closed[closed.length - 1] = true;
        const r: PathPoint[] = ring;
        const f = r[0];
        const l = r[r.length - 1];
        if (r.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) {
          if (l.ix !== undefined) Object.assign(f, { ix: l.ix, iy: l.iy });
          r.pop();
        }
      }
      cur = start;
      ring = null;
      continue;
    }
    if (!isNum()) break;
    switch (C) {
      case 'M': {
        const p = { x: o.x + n(), y: o.y + n() };
        begin(p);
        cur = start = p;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        line({ x: o.x + n(), y: o.y + n() });
        break;
      case 'H':
        line({ x: (rel ? cur.x : 0) + n(), y: cur.y });
        break;
      case 'V':
        line({ x: cur.x, y: (rel ? cur.y : 0) + n() });
        break;
      case 'C': {
        const c1 = { x: o.x + n(), y: o.y + n() };
        const c2 = { x: o.x + n(), y: o.y + n() };
        cubic(c1, c2, { x: o.x + n(), y: o.y + n() });
        break;
      }
      case 'S': {
        const c1 = prevC ? { x: 2 * cur.x - prevC.x, y: 2 * cur.y - prevC.y } : cur;
        const c2 = { x: o.x + n(), y: o.y + n() };
        cubic(c1, c2, { x: o.x + n(), y: o.y + n() });
        break;
      }
      case 'Q':
      case 'T': {
        const q: Pt = C === 'Q' ? { x: o.x + n(), y: o.y + n() } : prevQ ? { x: 2 * cur.x - prevQ.x, y: 2 * cur.y - prevQ.y } : cur;
        const p = { x: o.x + n(), y: o.y + n() };
        const p0 = cur;
        cubic({ x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) }, { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, p);
        lastQ = q;
        break;
      }
      case 'A': {
        const rx = n();
        const ry = n();
        const rot = n();
        const large = n() !== 0;
        const sweep = n() !== 0;
        const p = { x: o.x + n(), y: o.y + n() };
        for (const [c1, c2, end] of arcToCubics(cur.x, cur.y, rx, ry, rot, large, sweep, p.x, p.y)) cubic(c1, c2, end);
        break;
      }
      default:
        i++;
    }
  }
  return { rings: rings.filter((r) => r.length > 1), closed: closed.filter((_, k) => rings[k].length > 1) };
}

/* ---------- elements → layers ---------- */

const toHex = (c: string): string | null => {
  if (!c || c === 'none' || c === 'transparent') return null;
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a] = m[1].split(/[\s,/]+/).map(Number);
    if (a === 0) return null;
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
};

function paintOf(el: Element, prop: 'fill' | 'stroke', root: Element): string | null {
  const v = getComputedStyle(el)[prop];
  const url = v.match(/url\(["']?#([^"')]+)/);
  if (url) {
    const stop = root.querySelector(`#${CSS.escape(url[1])} stop`);
    return stop ? toHex(getComputedStyle(stop).stopColor) ?? '#d9d9d9' : '#d9d9d9';
  }
  return toHex(v);
}

const SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon, text, image';

function shapeToD(el: Element): string {
  const num = (a: string) => parseFloat(el.getAttribute(a) ?? '0') || 0;
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return el.getAttribute('d') ?? '';
    case 'rect': {
      const [x, y, w, h] = [num('x'), num('y'), num('width'), num('height')];
      let rx = num('rx') || num('ry');
      let ry = num('ry') || rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [num('cx'), num('cy')];
      const rx = el.tagName === 'circle' ? num('r') : num('rx');
      const ry = el.tagName === 'circle' ? num('r') : num('ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'line':
      return `M${num('x1')} ${num('y1')}L${num('x2')} ${num('y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      let d = '';
      for (let k = 0; k + 1 < pts.length; k += 2) d += `${k ? 'L' : 'M'}${pts[k]} ${pts[k + 1]}`;
      return d + (el.tagName === 'polygon' ? 'Z' : '');
    }
  }
  return '';
}

function sanitize(svg: Element) {
  svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((e) => e.remove());
  for (const e of [svg, ...svg.querySelectorAll('*')]) for (const a of [...e.attributes]) if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) e.removeAttribute(a.name);
}

export function looksLikeSvg(text: string) {
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);
}

/** Import SVG markup into the doc as a frame of editable layers. Returns the new frame id. */
export function importSvg(d: Doc, text: string, pageId: string, at: Pt, name = 'SVG'): string | null {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = parsed.documentElement;
  if (src.tagName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) return null;
  sanitize(src);
  // Attach off-screen so computed styles and transforms resolve.
  const host = document.createElement('div');
  // Off-screen and transparent, but NOT visibility:hidden (that inherits and would hide every shape).
  host.style.cssText = 'position:absolute;left:-100000px;top:0;opacity:0;pointer-events:none';
  const svg = document.importNode(src, true) as unknown as SVGSVGElement;
  const vb = svg.viewBox?.baseVal;
  const w = parseFloat(svg.getAttribute('width') ?? '') || vb?.width || 300;
  const h = parseFloat(svg.getAttribute('height') ?? '') || vb?.height || 150;
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const frame = makeNode('frame', pageId, { name, x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, fill: null, clip: false });
    insert(d, frame, null);
    const off = { x: frame.x, y: frame.y };
    for (const el of svg.querySelectorAll(SHAPES)) {
      if (el.closest('defs, clipPath, mask, pattern, symbol, marker')) continue;
      const g = el as SVGGraphicsElement;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const ctm = g.getCTM();
      if (!ctm) continue;
      const m: Matrix = { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e + off.x, f: ctm.f + off.y };
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      const opacity = (parseFloat(style.opacity) || 1) * (parseFloat(style.fillOpacity) || 1);
      const fill = paintOf(el, 'fill', svg);
      const stroke = paintOf(el, 'stroke', svg);
      const sw = (parseFloat(style.strokeWidth) || 1) * scale;
      const tag = el.tagName.toLowerCase();
      let node: SceneNode | null = null;

      if (tag === 'text') {
        const p = apply(m, { x: parseFloat(el.getAttribute('x') ?? '0') || 0, y: parseFloat(el.getAttribute('y') ?? '0') || 0 });
        const size = (parseFloat(style.fontSize) || 16) * scale;
        node = makeNode('text', pageId, { text: el.textContent?.trim() || ' ', x: p.x, y: p.y - size * 0.8, fontSize: size, fontWeight: parseInt(style.fontWeight) || 400, fill: fill ?? '#000000', fontFamily: style.fontFamily.split(',')[0].replace(/["']/g, '').trim() || 'Inter' });
      } else if (tag === 'image') {
        const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
        if (!href.startsWith('data:image/')) continue;
        const p = apply(m, { x: parseFloat(el.getAttribute('x') ?? '0') || 0, y: parseFloat(el.getAttribute('y') ?? '0') || 0 });
        node = makeNode('image', pageId, { src: href, x: p.x, y: p.y, w: (parseFloat(el.getAttribute('width') ?? '0') || 100) * scale, h: (parseFloat(el.getAttribute('height') ?? '0') || 100) * scale });
      } else {
        const { rings, closed } = parsePathData(shapeToD(el));
        if (!rings.length) continue;
        const abs = rings.map((r) =>
          r.map((p) => {
            const q: PathPoint = apply(m, p);
            if (p.ix !== undefined) Object.assign(q, (({ x, y }) => ({ ix: x, iy: y }))(apply(m, { x: p.ix, y: p.iy! })));
            if (p.ox !== undefined) Object.assign(q, (({ x, y }) => ({ ox: x, oy: y }))(apply(m, { x: p.ox, y: p.oy! })));
            return q;
          }),
        );
        const isClosed = closed.some(Boolean);
        const r = ringsFromAbs(abs, isClosed);
        node = makeNode('path', pageId, { x: r.x, y: r.y, w: r.w, h: r.h, closed: isClosed, fill: isClosed ? fill : null, stroke, strokeWidth: sw });
        if (r.norm.length > 1) node.rings = r.norm;
        else node.points = r.norm[0];
        if (!node.fill && !node.stroke) node.fill = '#000000';
      }
      if (!node) continue;
      node.id = uid();
      node.name = el.getAttribute('id') || el.getAttribute('aria-label') || nextName(d, node.type);
      if (opacity < 1) node.opacity = Math.round(opacity * 100) / 100;
      insert(d, node, frame.id);
    }
    return frame.id;
  } finally {
    host.remove();
  }
}
