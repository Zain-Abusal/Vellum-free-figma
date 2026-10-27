import { useStore, type Camera } from './store';
import {
  ancestry,
  bbox,
  cloneSubtree,
  descendants,
  detach,
  getPage,
  insert,
  isAncestor,
  isFrameLike,
  makeNode,
  moveDeep,
  moveTo,
  nextName,
  removeNode,
  resizeTo,
  siblings,
  uid,
  type Box,
} from './doc';
import { booleanRings, flipRing, setAbsRings, toPolygons, type BoolOp } from './geometry';
import type { Doc, Pt, SceneNode } from './types';

const S = () => useStore.getState();

/* ---------- camera ---------- */

export const viewport = { w: 1200, h: 800 };

let camAnim = 0;

/** Ease the camera to a target (instant when `animate` is false). */
export function setCamera(target: Camera, animate = true) {
  cancelAnimationFrame(camAnim);
  const s = S();
  if (!animate) return s.set({ camera: target });
  const from = s.camera;
  const t0 = performance.now();
  const dur = 220;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    // Interpolate zoom in log space so it feels linear.
    const z = Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * e);
    const wx = (viewport.w / 2 - from.x) / from.zoom + ((viewport.w / 2 - target.x) / target.zoom - (viewport.w / 2 - from.x) / from.zoom) * e;
    const wy = (viewport.h / 2 - from.y) / from.zoom + ((viewport.h / 2 - target.y) / target.zoom - (viewport.h / 2 - from.y) / from.zoom) * e;
    S().set({ camera: { zoom: z, x: viewport.w / 2 - wx * z, y: viewport.h / 2 - wy * z } });
    if (k < 1) camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}

export function zoomToBox(b: Box | null, max = 1, animate = true) {
  if (!b) return setCamera({ x: viewport.w / 2, y: viewport.h / 2, zoom: 1 }, animate);
  const pad = 80;
  const z = Math.min(max, Math.max(0.02, Math.min((viewport.w - pad * 2) / Math.max(b.w, 1), (viewport.h - pad * 2) / Math.max(b.h, 1))));
  setCamera({ zoom: z, x: viewport.w / 2 - (b.x + b.w / 2) * z, y: viewport.h / 2 - (b.y + b.h / 2) * z }, animate);
}

export function zoomToFit(animate = true) {
  const s = S();
  zoomToBox(bbox(getPage(s.doc, s.pageId).children.map((id) => s.doc.nodes[id]).filter((n) => n?.visible)), 1, animate);
}

export function zoomToSelection() {
  const s = S();
  const b = bbox(s.selection.map((id) => s.doc.nodes[id]).filter(Boolean));
  b ? zoomToBox(b, 8) : zoomToFit();
}

export function zoomBy(f: number, zoomTo?: number) {
  const c = S().camera;
  const z = Math.min(256, Math.max(0.02, zoomTo ?? c.zoom * f));
  const mx = viewport.w / 2;
  const my = viewport.h / 2;
  setCamera({ zoom: z, x: mx - ((mx - c.x) * z) / c.zoom, y: my - ((my - c.y) * z) / c.zoom });
}

export function centerOn(p: Pt) {
  const c = S().camera;
  setCamera({ zoom: c.zoom, x: viewport.w / 2 - p.x * c.zoom, y: viewport.h / 2 - p.y * c.zoom });
}

export function worldCenter(): Pt {
  const c = S().camera;
  return { x: (viewport.w / 2 - c.x) / c.zoom, y: (viewport.h / 2 - c.y) / c.zoom };
}

/* ---------- selection helpers ---------- */

/** Drops ids whose ancestor is also in the list. */
export function topLevel(doc: Doc, ids: string[]) {
  return ids.filter((id) => doc.nodes[id] && !ids.some((o) => o !== id && isAncestor(doc, o, id)));
}

/** Figma-style click target: groups capture clicks until you drill into them. */
export function resolveHit(doc: Doc, id: string, selection: string[]): string | null {
  let chain = ancestry(doc, id);
  const li = chain.findIndex((c) => doc.nodes[c].locked);
  if (li >= 0) chain = chain.slice(0, li);
  if (!chain.length) return null;
  for (let i = 0; i < chain.length - 1; i++) {
    const n = doc.nodes[chain[i]];
    if (n.type === 'group' && !selection.some((s) => isAncestor(doc, n.id, s))) return n.id;
  }
  return chain[chain.length - 1];
}

export function setProps(ids: string[], patch: Partial<SceneNode> | ((n: SceneNode) => void), history = true) {
  S().update((d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      if (typeof patch === 'function') patch(n);
      else Object.assign(n, patch);
    }
  }, history);
}

export function selectAll() {
  const s = S();
  const first = s.doc.nodes[s.selection[0]];
  const ids = first ? siblings(s.doc, first) : getPage(s.doc, s.pageId).children;
  s.select(ids.filter((id) => !s.doc.nodes[id].locked && s.doc.nodes[id].visible));
}

export function escapeSelection() {
  const s = S();
  if (s.vectorEditId) return s.set({ vectorEditId: null });
  if (s.activeComment) return s.set({ activeComment: null });
  const n = s.doc.nodes[s.selection[0]];
  s.select(n?.parentId ? [n.parentId] : []);
}

export function enterSelection() {
  const s = S();
  const n = s.doc.nodes[s.selection[0]];
  if (!n) return;
  if (s.selection.length === 1 && n.type === 'text') return editText(n.id);
  if (s.selection.length === 1 && n.type === 'path') return s.set({ vectorEditId: n.id });
  const kids = s.selection.flatMap((id) => s.doc.nodes[id]?.children ?? []);
  if (kids.length) s.select(kids);
}

export function editText(id: string) {
  const s = S();
  if (s.readOnly) return;
  s.checkpoint();
  s.set({ editingTextId: id, selection: [id], tool: 'select' });
}

/* ---------- edit commands ---------- */

export function deleteSelection() {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (!ids.length) return;
  s.update((d) => ids.forEach((id) => removeNode(d, id)));
  s.select([]);
}

export function nudge(dx: number, dy: number) {
  const s = S();
  const ids = topLevel(s.doc, s.selection).filter((id) => !s.doc.nodes[id].locked);
  if (ids.length) s.update((d) => ids.forEach((id) => moveDeep(d, id, dx, dy)));
}

export function copySelection() {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (ids.length) s.set({ clipboard: { doc: s.doc, ids } });
}

export function paste() {
  const s = S();
  const clip = s.clipboard;
  if (!clip) return;
  const target = s.selection.length === 1 ? s.doc.nodes[s.selection[0]] : null;
  const into = target && isFrameLike(target) && !clip.ids.includes(target.id) ? target.id : null;
  const out: string[] = [];
  s.update((d) => {
    for (const id of clip.ids) {
      const o = clip.doc.nodes[id];
      if (!o) continue;
      let parent = into;
      if (!parent && o.parentId && d.nodes[o.parentId]?.pageId === s.pageId) parent = o.parentId;
      const sameSpot = d.nodes[id] && d.nodes[id].pageId === s.pageId && (parent ?? null) === d.nodes[id].parentId;
      out.push(cloneSubtree(clip.doc, id, d, parent, s.pageId, undefined, sameSpot ? 10 : 0, sameSpot ? 10 : 0));
    }
  });
  s.select(out);
}

export function duplicateSelection() {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  const out: string[] = [];
  s.update((d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      out.push(cloneSubtree(d, id, d, n.parentId, n.pageId, siblings(d, n).indexOf(id) + 1, 10, 10));
    }
  });
  s.select(out);
}

const STYLE_KEYS: (keyof SceneNode)[] = ['fill', 'gradient', 'stroke', 'strokeWidth', 'radius', 'opacity', 'shadow', 'blur', 'blendMode', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textDecoration', 'textAlign'];
let styleClipboard: Partial<SceneNode> | null = null;

export function copyProperties() {
  const s = S();
  const n = s.doc.nodes[s.selection[0]];
  if (!n) return;
  styleClipboard = {};
  for (const k of STYLE_KEYS) if (n[k] !== undefined) (styleClipboard as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(n[k]));
}

export function pasteProperties() {
  const s = S();
  if (!styleClipboard) return;
  const patch = styleClipboard;
  setProps(s.selection, (n) => {
    for (const [k, v] of Object.entries(patch)) {
      if (n.type !== 'text' && k.startsWith('font')) continue;
      (n as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(v));
    }
  });
}

/** Wrap the selection in a new container inserted where the topmost item was. */
function wrap(kind: 'group' | 'frame' | 'component', withAutoLayout = false): string | null {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (!ids.length) return null;
  let wid: string | null = null;
  s.update((d) => {
    const first = d.nodes[ids[0]];
    const parentId = first.parentId;
    const sib = siblings(d, first);
    const ordered = [...ids].sort((a, b) => sib.indexOf(a) - sib.indexOf(b));
    const b = bbox(ids.map((id) => d.nodes[id]))!;
    if (withAutoLayout) {
      const hz = b.w >= b.h;
      ordered.sort((a, c) => (hz ? d.nodes[a].x - d.nodes[c].x : d.nodes[a].y - d.nodes[c].y));
    }
    const idx = Math.max(...ids.map((id) => sib.indexOf(id)));
    const w = makeNode(kind, first.pageId, { name: nextName(d, kind), ...b });
    if (kind !== 'group') w.fill = withAutoLayout || kind === 'component' ? null : '#ffffff';
    if (withAutoLayout) w.autoLayout = { direction: b.w >= b.h ? 'horizontal' : 'vertical', gap: 10, padding: 10, align: 'start' };
    insert(d, w, parentId, idx + 1);
    for (const id of ordered) moveTo(d, id, w.id, first.pageId);
    if (withAutoLayout) moveDeep(d, w.id, -10, -10);
    wid = w.id;
  });
  if (wid) s.select([wid]);
  return wid;
}

export const groupSelection = () => wrap('group');
export const wrapInFrame = () => wrap('frame');

export function ungroupSelection() {
  const s = S();
  const out: string[] = [];
  s.update((d) => {
    for (const id of topLevel(d, s.selection)) {
      const g = d.nodes[id];
      if (!g || !(g.type === 'group' || isFrameLike(g))) continue;
      const kids = [...g.children];
      const idx = siblings(d, g).indexOf(id);
      kids.forEach((c, i) => moveTo(d, c, g.parentId, g.pageId, idx + i));
      removeNode(d, id);
      out.push(...kids);
    }
  });
  if (out.length) s.select(out);
}

export function autoLayoutSelection() {
  const s = S();
  const n = s.selection.length === 1 ? s.doc.nodes[s.selection[0]] : null;
  if (n && isFrameLike(n)) {
    if (n.autoLayout) return;
    s.update((d) => {
      const f = d.nodes[n.id];
      const hz = f.w >= f.h;
      f.children.sort((a, b) => (hz ? d.nodes[a].x - d.nodes[b].x : d.nodes[a].y - d.nodes[b].y));
      f.autoLayout = { direction: hz ? 'horizontal' : 'vertical', gap: 10, padding: 10, align: 'start' };
    });
    return;
  }
  wrap('frame', true);
}

export function createComponent() {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (!ids.length) return;
  const n = s.doc.nodes[ids[0]];
  if (ids.length === 1 && (n.type === 'frame' || n.type === 'group')) {
    s.update((d) => {
      const f = d.nodes[n.id];
      if (f.type === 'group') {
        f.fill = null;
        f.clip = false;
      }
      if (/^(Frame|Group) \d+$/.test(f.name)) f.name = nextName(d, 'component');
      f.type = 'component';
    });
    return;
  }
  if (ids.length === 1 && n.type === 'component') return;
  wrap('component');
}

export function insertInstance(componentId: string, at?: Pt) {
  const s = S();
  const m = s.doc.nodes[componentId];
  if (!m) return;
  const p = at ?? worldCenter();
  const node = makeNode('instance', s.pageId, { name: m.name, componentId, x: Math.round(p.x - m.w / 2), y: Math.round(p.y - m.h / 2), w: m.w, h: m.h });
  s.update((d) => insert(d, node, null));
  s.select([node.id]);
  s.setTool('select');
}

export function detachInstance() {
  const s = S();
  const out: string[] = [];
  s.update((d) => {
    for (const id of s.selection) {
      const n = d.nodes[id];
      const m = n && d.nodes[n.componentId ?? ''];
      if (!n || n.type !== 'instance' || !m) continue;
      const nid = cloneSubtree(d, m.id, d, n.parentId, n.pageId, siblings(d, n).indexOf(id), n.x - m.x, n.y - m.y);
      const c = d.nodes[nid];
      c.name = n.name;
      // Scale contents to the instance's size (group semantics), then make it a plain frame.
      c.type = 'group';
      resizeTo(d, nid, { x: n.x, y: n.y, w: n.w, h: n.h });
      c.type = 'frame';
      removeNode(d, id);
      out.push(nid);
    }
  });
  if (out.length) s.select(out);
}

export function goToMainComponent(instanceId: string) {
  const s = S();
  const m = s.doc.nodes[s.doc.nodes[instanceId]?.componentId ?? ''];
  if (!m) return;
  s.set({ pageId: m.pageId, selection: [m.id] });
  requestAnimationFrame(() => zoomToBox(m, 2));
}

export function reorder(kind: 'forward' | 'backward' | 'front' | 'back') {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (!ids.length) return;
  s.update((d) => {
    const list = kind === 'forward' || kind === 'front' ? [...ids].reverse() : ids;
    for (const id of list) {
      const sib = siblings(d, d.nodes[id]);
      const i = sib.indexOf(id);
      sib.splice(i, 1);
      const ni = kind === 'forward' ? Math.min(i + 1, sib.length) : kind === 'backward' ? Math.max(i - 1, 0) : kind === 'front' ? sib.length : 0;
      sib.splice(ni, 0, id);
    }
  });
}

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export function align(kind: AlignKind) {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (!ids.length) return;
  let box: Box | null;
  if (ids.length === 1) {
    const p = s.doc.nodes[s.doc.nodes[ids[0]].parentId ?? ''];
    if (!p || p.type === 'group') return;
    box = p;
  } else box = bbox(ids.map((id) => s.doc.nodes[id]));
  if (!box) return;
  const b = box;
  s.update((d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      const tx = kind === 'left' ? b.x : kind === 'hcenter' ? b.x + (b.w - n.w) / 2 : kind === 'right' ? b.x + b.w - n.w : n.x;
      const ty = kind === 'top' ? b.y : kind === 'vcenter' ? b.y + (b.h - n.h) / 2 : kind === 'bottom' ? b.y + b.h - n.h : n.y;
      moveDeep(d, id, Math.round(tx - n.x), Math.round(ty - n.y));
    }
  });
}

/** Equal spacing between 3+ layers. */
export function distribute(axis: 'h' | 'v') {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (ids.length < 3) return;
  s.update((d) => {
    const ns = ids.map((id) => d.nodes[id]).sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
    const first = ns[0];
    const last = ns[ns.length - 1];
    const total = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
    const sizes = ns.reduce((t, n) => t + (axis === 'h' ? n.w : n.h), 0);
    const gap = (total - sizes) / (ns.length - 1);
    let cur = axis === 'h' ? first.x : first.y;
    for (const n of ns) {
      if (axis === 'h') moveDeep(d, n.id, Math.round(cur - n.x), 0);
      else moveDeep(d, n.id, 0, Math.round(cur - n.y));
      cur += (axis === 'h' ? n.w : n.h) + gap;
    }
  });
}

function flipNode(d: Doc, id: string, axis: 'h' | 'v', c: number) {
  const n = d.nodes[id];
  if (axis === 'h') n.x = 2 * c - n.x - n.w;
  else n.y = 2 * c - n.y - n.h;
  if (n.rotation) n.rotation = (360 - n.rotation) % 360;
  if (n.type === 'path') {
    if (n.rings) n.rings = n.rings.map((r) => flipRing(r, axis));
    else n.points = flipRing(n.points ?? [], axis);
  }
  if (n.gradient && n.gradient.type === 'linear') n.gradient.angle = axis === 'h' ? 180 - n.gradient.angle : -n.gradient.angle;
  for (const k of n.children) flipNode(d, k, axis, c);
}

export function flipSelection(axis: 'h' | 'v') {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  const b = bbox(ids.map((id) => s.doc.nodes[id]));
  if (!b) return;
  s.update((d) => ids.forEach((id) => flipNode(d, id, axis, axis === 'h' ? b.x + b.w / 2 : b.y + b.h / 2)));
}

/** Boolean ops (destructive, like Figma's "flatten" of a boolean group). Bottom-most layer keeps its style. */
export function booleanOp(op: BoolOp) {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (ids.length < 2) return;
  const first = s.doc.nodes[ids[0]];
  const sib = siblings(s.doc, first);
  const ordered = ids.filter((id) => s.doc.nodes[id].parentId === first.parentId).sort((a, b) => sib.indexOf(a) - sib.indexOf(b));
  const polys = ordered.map((id) => toPolygons(s.doc.nodes[id])).filter((p): p is Pt[][] => !!p);
  if (polys.length < 2) return alert('Boolean operations need at least two closed shapes (rectangles, ellipses, closed vectors).');
  const rings = booleanRings(op, polys);
  const base = s.doc.nodes[ordered[0]];
  let nid = '';
  s.update((d) => {
    const node = makeNode('path', base.pageId, {
      name: op[0].toUpperCase() + op.slice(1),
      closed: true,
      fill: base.fill ?? '#d9d9d9',
      gradient: base.gradient,
      stroke: base.stroke,
      strokeWidth: base.strokeWidth,
      shadow: base.shadow,
      opacity: base.opacity,
    });
    node.rings = [];
    if (rings.length) setAbsRings(node, rings);
    const idx = Math.max(...ordered.map((id) => sib.indexOf(id)));
    insert(d, node, base.parentId, idx + 1);
    for (const id of ordered) removeNode(d, id);
    nid = node.id;
  });
  s.select([nid]);
}

/** Convert shapes to editable vector paths (⌘E). */
export function flattenSelection() {
  const s = S();
  const out: string[] = [];
  s.update((d) => {
    for (const id of topLevel(d, s.selection)) {
      const n = d.nodes[id];
      if (n.type === 'path' && !n.rotation) {
        out.push(id);
        continue;
      }
      const polys = toPolygons(n);
      if (!polys) continue;
      const node = makeNode('path', n.pageId, { name: n.name, closed: true, fill: n.fill, gradient: n.gradient, stroke: n.stroke, strokeWidth: n.strokeWidth, shadow: n.shadow, opacity: n.opacity });
      if (polys.length > 1) node.rings = [];
      setAbsRings(node, polys);
      insert(d, node, n.parentId, siblings(d, n).indexOf(id) + 1);
      removeNode(d, id);
      out.push(node.id);
    }
  });
  if (out.length) s.select(out);
}

/* ---------- layers ---------- */

export function moveLayer(dragId: string, targetId: string, zone: 'above' | 'below' | 'inside') {
  const s = S();
  s.update((d) => {
    if (dragId === targetId || isAncestor(d, dragId, targetId) || !d.nodes[dragId] || !d.nodes[targetId]) return;
    const t = d.nodes[targetId];
    if (zone === 'inside') return moveTo(d, dragId, targetId, t.pageId);
    detach(d, dragId);
    const ti = siblings(d, t).indexOf(targetId);
    moveTo(d, dragId, t.parentId, t.pageId, zone === 'above' ? ti + 1 : ti);
  });
}

/* ---------- pages ---------- */

export function addPage() {
  const s = S();
  const id = uid();
  s.update((d) => {
    d.pages.push({ id, name: `Page ${d.pages.length + 1}`, children: [], bg: '#f5f5f5' });
  });
  s.set({ pageId: id, selection: [] });
}

export function deletePage(id: string) {
  const s = S();
  if (s.doc.pages.length < 2) return;
  s.update((d) => {
    const p = getPage(d, id);
    for (const c of [...p.children]) removeNode(d, c);
    d.pages = d.pages.filter((x) => x.id !== id);
  });
  if (s.pageId === id) S().set({ pageId: S().doc.pages[0].id, selection: [] });
}

/* ---------- comments ---------- */

export function addComment(at: Pt, text: string, author: string) {
  const s = S();
  const id = uid();
  s.update((d) => {
    const p = getPage(d, s.pageId);
    p.comments = [...(p.comments ?? []), { id, x: at.x, y: at.y, resolved: false, thread: [{ id: uid(), author, text, date: Date.now() }] }];
  });
  s.set({ activeComment: id, showComments: true });
}

export function replyComment(commentId: string, text: string, author: string) {
  S().update((d) => {
    for (const p of d.pages) {
      const c = p.comments?.find((x) => x.id === commentId);
      if (c) c.thread.push({ id: uid(), author, text, date: Date.now() });
    }
  });
}

export function setCommentResolved(commentId: string, resolved: boolean) {
  S().update((d) => {
    for (const p of d.pages) {
      const c = p.comments?.find((x) => x.id === commentId);
      if (c) c.resolved = resolved;
    }
  });
}

export function deleteComment(commentId: string) {
  S().update((d) => {
    for (const p of d.pages) if (p.comments) p.comments = p.comments.filter((x) => x.id !== commentId);
  });
  S().set({ activeComment: null });
}

/* ---------- images ---------- */

/** Reads an image, downscaling big photos so files stay small enough to sync and store. */
function readImage(file: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const src = r.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 300;
        const h = img.naturalHeight || 300;
        const vector = file.type === 'image/svg+xml' || file.type === 'image/gif';
        const k = Math.min(1, 1600 / Math.max(w, h));
        if (vector || (file.size < 300_000 && k === 1)) return res({ src, w, h });
        const c = document.createElement('canvas');
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        res({ src: c.toDataURL('image/webp', 0.85), w, h });
      };
      img.onerror = rej;
      img.src = src;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export async function addImageFiles(files: File[], at?: Pt) {
  if (S().readOnly) return;
  const imgs = await Promise.all(files.filter((f) => f.type.startsWith('image/')).map(readImage));
  if (!imgs.length) return;
  const s = S();
  const p = at ?? worldCenter();
  const ids: string[] = [];
  s.update((d) => {
    imgs.forEach((im, i) => {
      const k = Math.min(1, 800 / Math.max(im.w, im.h));
      const w = Math.round(im.w * k);
      const h = Math.round(im.h * k);
      const n = makeNode('image', s.pageId, { name: nextName(d, 'image'), src: im.src, x: Math.round(p.x - w / 2 + i * 24), y: Math.round(p.y - h / 2 + i * 24), w, h });
      insert(d, n, null);
      ids.push(n.id);
    });
  });
  s.select(ids);
  s.setTool('select');
}

/* ---------- prototype ---------- */

/** Top-level frames, including frames inside top-level sections. */
export function topFrames(doc: Doc, pageId: string): SceneNode[] {
  return getPage(doc, pageId)
    .children.map((id) => doc.nodes[id])
    .filter((n) => n && n.visible && isFrameLike(n))
    .flatMap((n) => (n.section ? n.children.map((c) => doc.nodes[c]).filter((c) => c?.visible && isFrameLike(c) && !c.section) : [n]));
}

export function startPresent() {
  const s = S();
  const frames = topFrames(s.doc, s.pageId);
  if (!frames.length) return alert('Add a frame (F) to this page to present it.');
  const sel = s.selection[0] ? ancestry(s.doc, s.selection[0])[0] : null;
  s.set({ presenting: frames.some((f) => f.id === sel) ? sel : frames[0].id, editingTextId: null });
}

/* ---------- identity (comments & multiplayer) ---------- */

const COLORS = ['#f24822', '#ff7262', '#ffa629', '#14ae5c', '#5b4ef0', '#0d9488', '#e93d82', '#0fa958'];

export function getMe(): { name: string; color: string } {
  try {
    const raw = localStorage.getItem('vellum:me');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const me = { name: 'Guest ' + Math.floor(Math.random() * 900 + 100), color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  setMe(me);
  return me;
}

export function setMe(me: { name: string; color: string }) {
  try {
    localStorage.setItem('vellum:me', JSON.stringify(me));
  } catch {
    /* ignore */
  }
}

/* ---------- local styles (linked) ---------- */

const ensureStyles = (d: Doc) => (d.styles ??= { colors: [], texts: [] });

export function createColorStyle(name: string, color: string, applyTo: string[] = []) {
  const id = uid();
  S().update((d) => {
    ensureStyles(d).colors.push({ id, name, color });
    for (const n of applyTo.map((i) => d.nodes[i]).filter(Boolean)) Object.assign(n, { fill: color, gradient: null, fillStyleId: id });
  });
  return id;
}

export function applyColorStyle(ids: string[], styleId: string) {
  S().update((d) => {
    const st = d.styles?.colors.find((c) => c.id === styleId);
    if (!st) return;
    for (const id of ids) if (d.nodes[id]) Object.assign(d.nodes[id], { fill: st.color, gradient: null, fillStyleId: styleId });
  });
}

/** Editing a style updates every layer linked to it. */
export function updateColorStyle(styleId: string, patch: { name?: string; color?: string }, history = true) {
  S().update((d) => {
    const st = d.styles?.colors.find((c) => c.id === styleId);
    if (!st) return;
    Object.assign(st, patch);
    if (patch.color) for (const id in d.nodes) if (d.nodes[id].fillStyleId === styleId) d.nodes[id].fill = patch.color;
  }, history);
}

const TEXT_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const;

export function createTextStyle(name: string, fromId: string) {
  const n = S().doc.nodes[fromId];
  if (!n || n.type !== 'text') return;
  const id = uid();
  S().update((d) => {
    ensureStyles(d).texts.push({ id, name, fontFamily: n.fontFamily ?? 'Inter', fontSize: n.fontSize ?? 16, fontWeight: n.fontWeight ?? 400, lineHeight: n.lineHeight ?? 1.2, letterSpacing: n.letterSpacing ?? 0 });
    d.nodes[fromId].textStyleId = id;
  });
}

export function applyTextStyle(ids: string[], styleId: string) {
  S().update((d) => {
    const st = d.styles?.texts.find((t) => t.id === styleId);
    if (!st) return;
    for (const id of ids) {
      const n = d.nodes[id];
      if (n?.type !== 'text') continue;
      for (const k of TEXT_KEYS) (n as unknown as Record<string, unknown>)[k] = st[k];
      n.textStyleId = styleId;
    }
  });
}

export function updateTextStyle(styleId: string, patch: Partial<Omit<import('./types').TextStyle, 'id'>>) {
  S().update((d) => {
    const st = d.styles?.texts.find((t) => t.id === styleId);
    if (!st) return;
    Object.assign(st, patch);
    for (const id in d.nodes) {
      const n = d.nodes[id];
      if (n.textStyleId === styleId) for (const k of TEXT_KEYS) (n as unknown as Record<string, unknown>)[k] = st[k];
    }
  });
}

export function deleteStyle(kind: 'colors' | 'texts', styleId: string) {
  S().update((d) => {
    if (!d.styles) return;
    if (kind === 'colors') d.styles.colors = d.styles.colors.filter((c) => c.id !== styleId);
    else d.styles.texts = d.styles.texts.filter((t) => t.id !== styleId);
    // Layers keep their current look but are detached.
    for (const id in d.nodes) {
      const n = d.nodes[id];
      if (n.fillStyleId === styleId) n.fillStyleId = undefined;
      if (n.textStyleId === styleId) n.textStyleId = undefined;
    }
  });
}

/* ---------- navigation ---------- */

/** Tab / Shift+Tab: next / previous sibling (Figma). */
export function selectSibling(dir: 1 | -1) {
  const s = S();
  const n = s.doc.nodes[s.selection[0]];
  const list = n ? siblings(s.doc, n) : getPage(s.doc, s.pageId).children;
  if (!list.length) return;
  const i = n ? list.indexOf(n.id) : -1;
  // Layers panel lists top → bottom, which is the reverse of the array.
  const next = list[(i - dir + list.length) % list.length];
  s.select([next]);
}

/** N / Shift+N: zoom to the next / previous top-level frame. */
export function gotoFrame(dir: 1 | -1) {
  const s = S();
  const frames = topFrames(s.doc, s.pageId).sort((a, b) => a.y - b.y || a.x - b.x);
  if (!frames.length) return;
  const cur = s.selection.length ? ancestry(s.doc, s.selection[0])[0] : null;
  const i = frames.findIndex((f) => f.id === cur);
  const f = frames[(i + dir + frames.length) % frames.length] ?? frames[0];
  s.select([f.id]);
  zoomToBox(f, 2);
}

export function startRename() {
  const s = S();
  if (s.selection.length === 1 && !s.readOnly) s.set({ renamingId: s.selection[0] });
}

/* ---------- masks ---------- */

/** ⌃⌘M: the bottom-most selected layer masks the others (wrapped in a "Mask group"). Toggles off on a mask. */
export function useAsMask() {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (!ids.length) return;
  const one = s.doc.nodes[ids[0]];
  if (ids.length === 1 && one.isMask) {
    s.update((d) => {
      d.nodes[one.id].isMask = false;
      const p = one.parentId ? d.nodes[one.parentId] : null;
      if (p?.masked) p.masked = false;
    });
    return;
  }
  if (ids.length < 2) return notifyMsg('Select a shape and the layers to mask (the bottom one becomes the mask).');
  let gid: string | null = null;
  s.update((d) => {
    const first = d.nodes[ids[0]];
    const sib = siblings(d, first);
    const ordered = ids.filter((id) => d.nodes[id].parentId === first.parentId).sort((a, b) => sib.indexOf(a) - sib.indexOf(b));
    const idx = Math.max(...ordered.map((id) => sib.indexOf(id)));
    const g = makeNode('group', first.pageId, { name: 'Mask group', masked: true });
    insert(d, g, first.parentId, idx + 1);
    for (const id of ordered) moveTo(d, id, g.id, first.pageId);
    d.nodes[ordered[0]].isMask = true;
    gid = g.id;
  });
  if (gid) s.select([gid]);
}

/* ---------- eyedropper (I) ---------- */

export async function eyedropper() {
  const s = S();
  const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
  if (!ED) return notifyMsg('Your browser does not support the eyedropper (try Chrome or Edge).');
  try {
    const { sRGBHex } = await new ED().open();
    const hex = sRGBHex.startsWith('#') ? sRGBHex.toLowerCase() : '#' + (sRGBHex.match(/\d+/g) ?? []).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('');
    if (s.selection.length) setProps(s.selection, { fill: hex, gradient: null, fillStyleId: undefined });
    else {
      navigator.clipboard?.writeText(hex).catch(() => undefined);
      notifyMsg(`Picked ${hex.toUpperCase()} (copied)`);
    }
  } catch {
    /* cancelled */
  }
}

/* ---------- frame presets ---------- */

export const FRAME_PRESETS: { group: string; items: [string, number, number][] }[] = [
  { group: 'Phone', items: [['iPhone 16', 393, 852], ['iPhone 16 Pro Max', 440, 956], ['iPhone SE', 375, 667], ['Android Compact', 412, 917], ['Android Medium', 700, 840]] },
  { group: 'Tablet', items: [['iPad mini', 744, 1133], ['iPad Pro 11"', 834, 1194], ['iPad Pro 13"', 1032, 1376], ['Surface Pro', 912, 1368]] },
  { group: 'Desktop', items: [['Desktop', 1440, 1024], ['MacBook Air', 1280, 832], ['MacBook Pro 14"', 1512, 982], ['HD', 1920, 1080], ['Wireframe', 1440, 900]] },
  { group: 'Watch', items: [['Watch 45mm', 198, 242], ['Watch 41mm', 176, 215]] },
  { group: 'Social', items: [['Instagram post', 1080, 1350], ['Instagram story', 1080, 1920], ['X post', 1200, 675], ['LinkedIn post', 1200, 1200], ['YouTube thumbnail', 1280, 720], ['Facebook cover', 820, 312]] },
  { group: 'Paper', items: [['A4', 595, 842], ['A5', 420, 595], ['Letter', 612, 792], ['Tabloid', 792, 1224]] },
  { group: 'Slides', items: [['Slide 16:9', 1920, 1080], ['Slide 4:3', 1024, 768]] },
];

/** Insert a frame preset to the right of existing top-level content (or resize the selected frame). */
export function insertFramePreset(name: string, w: number, h: number) {
  const s = S();
  const sel = s.selection.length === 1 ? s.doc.nodes[s.selection[0]] : null;
  if (sel && isFrameLike(sel) && !sel.section) {
    s.update((d) => resizeTo(d, sel.id, { x: sel.x, y: sel.y, w, h }));
    return;
  }
  const top = getPage(s.doc, s.pageId).children.map((id) => s.doc.nodes[id]).filter(Boolean);
  const b = bbox(top);
  const x = b ? Math.round(b.x + b.w + 100) : Math.round(worldCenter().x - w / 2);
  const y = b ? Math.round(b.y) : Math.round(worldCenter().y - h / 2);
  let id = '';
  s.update((d) => {
    const n = makeNode('frame', s.pageId, { name, x, y, w, h });
    insert(d, n, null);
    id = n.id;
  });
  s.set({ selection: [id], tool: 'select' });
  zoomToBox({ x, y, w, h }, 1);
}

function notifyMsg(message: string) {
  S().set({ toast: message });
  setTimeout(() => S().toast === message && S().set({ toast: null }), 3500);
}
