/** Grouping, framing, auto layout, ordering, alignment, flipping. */
import { bbox, insert, isFrameLike, makeNode, moveDeep, moveTo, nextName, removeNode, siblings, type Box } from '../doc';
import { flipRing } from '../geometry';
import type { Doc } from '../types';
import { S } from './shared';
import { topLevel } from './selection';

/** Wrap the selection in a new container inserted where the topmost item was. */
export function wrap(kind: 'group' | 'frame' | 'component', withAutoLayout = false): string | null {
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

export function flipNode(d: Doc, id: string, axis: 'h' | 'v', c: number) {
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
