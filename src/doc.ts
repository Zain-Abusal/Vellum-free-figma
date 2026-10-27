import type { Doc, NodeType, Page, Pt, SceneNode } from './types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export const TYPE_NAMES: Record<NodeType, string> = {
  frame: 'Frame',
  group: 'Group',
  component: 'Component',
  instance: 'Instance',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  path: 'Vector',
  text: 'Text',
  image: 'Image',
};

export const isContainer = (n: SceneNode) => n.type === 'frame' || n.type === 'component' || n.type === 'group';
export const isFrameLike = (n: SceneNode) => n.type === 'frame' || n.type === 'component';

export function makeNode(type: NodeType, pageId: string, props: Partial<SceneNode> = {}): SceneNode {
  const n: SceneNode = {
    id: uid(),
    type,
    name: TYPE_NAMES[type],
    pageId,
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    fill: null,
    stroke: null,
    strokeWidth: 1,
    radius: 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
  if (type === 'frame' || type === 'component') {
    n.fill = '#ffffff';
    n.clip = true;
  }
  if (type === 'rect' || type === 'ellipse') n.fill = '#d9d9d9';
  if (type === 'path') {
    n.stroke = '#1e1e1e';
    n.points = [];
    n.closed = false;
  }
  if (type === 'text') {
    Object.assign(n, { fill: '#1e1e1e', text: '', fontSize: 24, fontWeight: 400, fontFamily: 'Inter', textAlign: 'left', lineHeight: 1.2 });
  }
  return Object.assign(n, props);
}

export function newDoc(): Doc {
  const page: Page = { id: uid(), name: 'Page 1', children: [], bg: '#f5f5f5' };
  return { pages: [page], nodes: {} };
}

export const getPage = (d: Doc, id: string) => d.pages.find((p) => p.id === id) ?? d.pages[0];

export function nextName(d: Doc, type: NodeType) {
  let k = 0;
  for (const id in d.nodes) if (d.nodes[id].type === type) k++;
  return `${TYPE_NAMES[type]} ${k + 1}`;
}

export function siblings(d: Doc, n: SceneNode): string[] {
  return n.parentId ? d.nodes[n.parentId].children : getPage(d, n.pageId).children;
}

export function descendants(d: Doc, id: string, out: string[] = []): string[] {
  for (const c of d.nodes[id]?.children ?? []) {
    out.push(c);
    descendants(d, c, out);
  }
  return out;
}

/** Chain of ids from the root down to `id` (inclusive). */
export function ancestry(d: Doc, id: string): string[] {
  const chain: string[] = [];
  let cur: string | null = id;
  while (cur && d.nodes[cur]) {
    chain.unshift(cur);
    cur = d.nodes[cur].parentId;
  }
  return chain;
}

export function isAncestor(d: Doc, anc: string, id: string): boolean {
  let p = d.nodes[id]?.parentId ?? null;
  while (p) {
    if (p === anc) return true;
    p = d.nodes[p]?.parentId ?? null;
  }
  return false;
}

function depthOf(d: Doc, id: string) {
  let k = 0;
  let p = d.nodes[id].parentId;
  while (p) {
    k++;
    p = d.nodes[p].parentId;
  }
  return k;
}

function place(arr: string[], id: string, index?: number) {
  if (index === undefined || index < 0 || index > arr.length) arr.push(id);
  else arr.splice(index, 0, id);
}

export function detach(d: Doc, id: string): number {
  const s = siblings(d, d.nodes[id]);
  const i = s.indexOf(id);
  if (i >= 0) s.splice(i, 1);
  return i;
}

function setPageDeep(d: Doc, id: string, pageId: string) {
  d.nodes[id].pageId = pageId;
  for (const c of d.nodes[id].children) setPageDeep(d, c, pageId);
}

export function insert(d: Doc, n: SceneNode, parentId: string | null, index?: number) {
  n.parentId = parentId;
  if (parentId) n.pageId = d.nodes[parentId].pageId;
  d.nodes[n.id] = n;
  place(siblings(d, d.nodes[n.id]), n.id, index);
}

export function moveTo(d: Doc, id: string, parentId: string | null, pageId: string, index?: number) {
  detach(d, id);
  const n = d.nodes[id];
  n.parentId = parentId;
  setPageDeep(d, id, parentId ? d.nodes[parentId].pageId : pageId);
  place(siblings(d, n), id, index);
}

export function removeNode(d: Doc, id: string) {
  if (!d.nodes[id]) return;
  detach(d, id);
  for (const k of [id, ...descendants(d, id)]) delete d.nodes[k];
}

export function moveDeep(d: Doc, id: string, dx: number, dy: number) {
  if (!dx && !dy) return;
  const n = d.nodes[id];
  n.x += dx;
  n.y += dy;
  for (const c of n.children) moveDeep(d, c, dx, dy);
}

export function cloneSubtree(src: Doc, id: string, dst: Doc, parentId: string | null, pageId: string, index?: number, dx = 0, dy = 0): string {
  const o = src.nodes[id];
  const n: SceneNode = { ...JSON.parse(JSON.stringify(o)), id: uid(), children: [], x: o.x + dx, y: o.y + dy, pageId };
  insert(dst, n, parentId, index);
  for (const c of [...o.children]) cloneSubtree(src, c, dst, n.id, pageId, undefined, dx, dy);
  return n.id;
}

/** One axis of a child's constraint when its frame goes from (o0, oS) to (n0, nS). */
function constrain(c: string, o0: number, oS: number, n0: number, nS: number, p: number, s: number): [number, number] {
  const rel = p - o0;
  const far = oS - rel - s;
  switch (c) {
    case 'right':
    case 'bottom':
      return [n0 + nS - far - s, s];
    case 'leftright':
    case 'topbottom':
      return [n0 + rel, Math.max(0, nS - rel - far)];
    case 'center':
      return [n0 + nS / 2 + (rel + s / 2 - oS / 2) - s / 2, s];
    case 'scale': {
      const k = oS ? nS / oS : 1;
      return [n0 + rel * k, s * k];
    }
    default:
      return [n0 + rel, s];
  }
}

/** Move/resize a node to a box. Groups scale their contents; frames apply child constraints. */
export function resizeTo(d: Doc, id: string, nb: Box) {
  const n = d.nodes[id];
  const ob = { x: n.x, y: n.y, w: n.w, h: n.h };
  if (n.type === 'group') {
    const sx = ob.w ? nb.w / ob.w : 1;
    const sy = ob.h ? nb.h / ob.h : 1;
    for (const c of descendants(d, id)) {
      const k = d.nodes[c];
      k.x = nb.x + (k.x - ob.x) * sx;
      k.y = nb.y + (k.y - ob.y) * sy;
      k.w *= sx;
      k.h *= sy;
      if (k.type === 'text') k.fontSize = Math.max(1, (k.fontSize ?? 16) * sy);
    }
  } else if (isFrameLike(n) && !n.autoLayout) {
    for (const c of n.children) {
      const k = d.nodes[c];
      const con = k.constraints ?? { h: 'left', v: 'top' };
      const [x, w] = constrain(con.h, ob.x, ob.w, nb.x, nb.w, k.x, k.w);
      const [y, h] = constrain(con.v, ob.y, ob.h, nb.y, nb.h, k.y, k.h);
      if ((w !== k.w || h !== k.h) && k.type !== 'text') resizeTo(d, c, { x, y, w, h });
      else moveDeep(d, c, x - k.x, y - k.y);
    }
  } else if (n.children.length) {
    for (const c of n.children) moveDeep(d, c, nb.x - ob.x, nb.y - ob.y);
  }
  n.x = nb.x;
  n.y = nb.y;
  n.w = Math.max(0, nb.w);
  n.h = Math.max(0, nb.h);
}

export const setSize = (d: Doc, id: string, w: number, h: number) => resizeTo(d, id, { x: d.nodes[id].x, y: d.nodes[id].y, w, h });

export function bbox(ns: Box[]): Box | null {
  if (!ns.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of ns) {
    x1 = Math.min(x1, n.x);
    y1 = Math.min(y1, n.y);
    x2 = Math.max(x2, n.x + n.w);
    y2 = Math.max(y2, n.y + n.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const inside = (p: Pt, b: Box) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;
export const intersects = (a: Box, b: Box) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

/** Absolute polyline → node box + normalised points. */
export function pathFromAbs(pts: Pt[]) {
  const b = bbox(pts.map((p) => ({ ...p, w: 0, h: 0 })))!;
  return {
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    points: pts.map((p) => ({ x: b.w ? (p.x - b.x) / b.w : 0, y: b.h ? (p.y - b.y) / b.h : 0 })),
  };
}

/** Deepest visible frame/component under a point (used for parenting). */
export function frameAt(d: Doc, p: Pt, pageId: string, exclude?: string): string | null {
  const visit = (ids: string[]): string | null => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const n = d.nodes[ids[i]];
      if (!n || !n.visible || n.id === exclude) continue;
      if (isFrameLike(n) && inside(p, n)) return visit(n.children) ?? n.id;
      if (n.type === 'group') {
        const r = visit(n.children);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(getPage(d, pageId).children);
}

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

/** Drop cached text widths (call when web fonts finish loading). */
export const clearTextCache = () => widthCache.clear();

const fontOf = (n: SceneNode) => `${n.fontWeight ?? 400} ${n.fontSize ?? 16}px "${n.fontFamily ?? 'Inter'}", system-ui, sans-serif`;

function lineWidth(font: string, line: string, ls: number) {
  if (typeof document === 'undefined') return line.length * 8;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return line.length * 8;
  const key = font + '|' + line;
  let w = widthCache.get(key);
  if (w === undefined) {
    measureCtx.font = font;
    w = measureCtx.measureText(line).width;
    if (widthCache.size > 5000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w + ls * line.length;
}

/** Visual lines of a text layer: hard breaks, plus word wrapping in fixed-width mode. */
export function textLines(n: SceneNode): string[] {
  const paras = (n.text ?? '').split('\n');
  if (n.textAutoResize !== 'height') return paras;
  const font = fontOf(n);
  const ls = n.letterSpacing ?? 0;
  const out: string[] = [];
  for (const p of paras) {
    const words = p.split(' ');
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (line && lineWidth(font, next, ls) > n.w) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function measureText(n: SceneNode) {
  const lines = textLines(n);
  if (n.textAutoResize !== 'height') {
    const font = fontOf(n);
    const ls = n.letterSpacing ?? 0;
    n.w = Math.ceil(Math.max(1, ...lines.map((l) => lineWidth(font, l, ls))));
  }
  n.h = Math.round(lines.length * (n.fontSize ?? 16) * (n.lineHeight ?? 1.2) * 100) / 100;
}

function layoutAuto(d: Doc, f: SceneNode) {
  const al = f.autoLayout!;
  const hz = al.direction === 'horizontal';
  const P = al.padding;
  let hugMain = al.hugMain !== false;
  let hugCross = al.hugCross !== false;
  // A frame that fills/stretches inside an auto-layout parent gets that axis from the parent:
  // treat it as fixed here, or its content would align to its hug size (and fight the parent every pass).
  const parent = f.parentId ? d.nodes[f.parentId] : null;
  if (parent?.autoLayout) {
    const pHz = parent.autoLayout.direction === 'horizontal';
    const fixedW = (f.layoutFill && pHz) || (f.layoutStretch && !pHz);
    const fixedH = (f.layoutFill && !pHz) || (f.layoutStretch && pHz);
    if (hz ? fixedW : fixedH) hugMain = false;
    if (hz ? fixedH : fixedW) hugCross = false;
  }
  const kids = f.children.map((c) => d.nodes[c]).filter((k) => k && k.visible);
  const mainOf = (k: SceneNode) => (hz ? k.w : k.h);
  const crossOf = (k: SceneNode) => (hz ? k.h : k.w);
  const setSizeAxis = (k: SceneNode, main: number | null, cross: number | null) => {
    const w = hz ? (main ?? k.w) : (cross ?? k.w);
    const h = hz ? (cross ?? k.h) : (main ?? k.h);
    if (w === k.w && h === k.h) return;
    if (k.type === 'text') {
      // Text that fills/stretches horizontally becomes fixed width and wraps.
      if (w !== k.w) {
        k.textAutoResize = 'height';
        k.w = Math.max(1, w);
        measureText(k);
      }
      return;
    }
    resizeTo(d, k.id, { x: k.x, y: k.y, w: Math.max(0, w), h: Math.max(0, h) });
  };

  // Cross axis: hug the largest non-stretch child, or use the fixed size.
  const crossInner = hugCross ? Math.max(0, ...kids.filter((k) => !k.layoutStretch).map(crossOf)) : Math.max(0, (hz ? f.h : f.w) - P * 2);
  for (const k of kids) if (k.layoutStretch) setSizeAxis(k, null, crossInner);

  // Main axis: "fill" children share the leftover space when the frame has a fixed size.
  const fills = kids.filter((k) => k.layoutFill);
  const innerMain = (hz ? f.w : f.h) - P * 2;
  if (!hugMain && fills.length) {
    const fixed = kids.filter((k) => !k.layoutFill).reduce((t, k) => t + mainOf(k), 0);
    const each = Math.max(0, (innerMain - fixed - al.gap * Math.max(0, kids.length - 1)) / fills.length);
    for (const k of fills) setSizeAxis(k, each, null);
  }

  const sizes = kids.reduce((t, k) => t + mainOf(k), 0);
  let gap = al.gap;
  let cur = P;
  if (!hugMain) {
    if (al.justify === 'between' && kids.length > 1) gap = (innerMain - sizes) / (kids.length - 1);
    else {
      const total = sizes + gap * Math.max(0, kids.length - 1);
      const t = al.justify === 'center' ? 0.5 : al.justify === 'end' ? 1 : 0;
      cur = P + (innerMain - total) * t;
    }
  }
  const t = al.align === 'center' ? 0.5 : al.align === 'end' ? 1 : 0;
  for (const k of kids) {
    const off = P + (crossInner - crossOf(k)) * t;
    const tx = hz ? f.x + cur : f.x + off;
    const ty = hz ? f.y + off : f.y + cur;
    moveDeep(d, k.id, tx - k.x, ty - k.y);
    cur += mainOf(k) + gap;
  }
  if (hugMain) {
    const main = kids.length ? cur - gap + P : P * 2;
    if (hz) f.w = main;
    else f.h = main;
  }
  if (hugCross) {
    if (hz) f.h = crossInner + P * 2;
    else f.w = crossInner + P * 2;
  }
}

/**
 * Variables: write bound values into layers (so rendering, export and sync see plain values).
 * The mode comes from the nearest ancestor frame with a `varModes` override, else the collection default.
 */
function resolveVariables(d: Doc) {
  const cols = d.styles?.variables;
  if (!cols?.length) return;
  const byVar = new Map<string, { col: (typeof cols)[number]; v: (typeof cols)[number]['vars'][number] }>();
  for (const col of cols) for (const v of col.vars) byVar.set(v.id, { col, v });
  const modeFor = (n: SceneNode, colId: string, fallback: string) => {
    let cur: SceneNode | undefined = n;
    while (cur) {
      const m = cur.varModes?.[colId];
      if (m) return m;
      cur = cur.parentId ? d.nodes[cur.parentId] : undefined;
    }
    return fallback;
  };
  for (const id in d.nodes) {
    const n = d.nodes[id];
    if (!n.vars) continue;
    for (const [prop, varId] of Object.entries(n.vars)) {
      const hit = varId && byVar.get(varId);
      if (!hit) continue;
      const value = hit.v.values[modeFor(n, hit.col.id, hit.col.defaultMode)] ?? hit.v.values[hit.col.defaultMode];
      if (value === undefined) continue;
      if (prop === 'gap' || prop === 'padding') {
        if (n.autoLayout && n.autoLayout[prop] !== Number(value)) n.autoLayout[prop] = Number(value);
      } else if (prop === 'fill') {
        if (n.fill !== value) n.fill = String(value);
        if (n.gradient) n.gradient = null;
      } else if (prop === 'stroke') {
        if (n.stroke !== value) n.stroke = String(value);
      } else if (prop === 'radius' || prop === 'opacity') {
        if (n[prop] !== Number(value)) n[prop] = Number(value);
      }
    }
  }
}

/** Derived geometry: variables, text auto-size, group bounds, auto layout. Runs after every edit. */
export function layoutAll(d: Doc) {
  resolveVariables(d);
  const list: SceneNode[] = [];
  for (const id in d.nodes) {
    const n = d.nodes[id];
    if (n.type === 'text') measureText(n);
    if (n.type === 'group' || n.autoLayout) list.push(n);
  }
  list.sort((a, b) => depthOf(d, b.id) - depthOf(d, a.id));
  for (const n of list) {
    if (!d.nodes[n.id]) continue;
    if (n.type === 'group') {
      if (!n.children.length) {
        removeNode(d, n.id);
        continue;
      }
      // Mask groups take the mask's bounds.
      Object.assign(n, bbox((n.masked ? n.children.slice(0, 1) : n.children).map((c) => d.nodes[c])));
    } else layoutAuto(d, n);
  }
}
