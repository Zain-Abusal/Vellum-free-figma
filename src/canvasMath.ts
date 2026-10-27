/** Pure canvas math: handle positions and smart-guide snapping. */
import { siblings, type Box } from './doc';
import type { Doc, Pt } from './types';

export function handlePos(h: string, b: Box): Pt {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.w : b.x + b.w / 2;
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}

/** Snap a moving box to sibling / parent edges and centres. */
export function snap(doc: Doc, ids: string[], box: Box, dx: number, dy: number, th: number) {
  const first = doc.nodes[ids[0]];
  const parent = first.parentId ? doc.nodes[first.parentId] : null;
  if (parent?.autoLayout) return { dx: 0, dy: 0, gx: null, gy: null };
  const cand: Box[] = [];
  for (const id of siblings(doc, first)) {
    const n = doc.nodes[id];
    if (!ids.includes(id) && n?.visible) cand.push(n);
  }
  if (parent) cand.push(parent);
  const bx = [box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w];
  const by = [box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h];
  let sx: number | null = null, sy: number | null = null, gx: number | null = null, gy: number | null = null;
  for (const c of cand) {
    for (const t of [c.x, c.x + c.w / 2, c.x + c.w])
      for (const a of bx) {
        const diff = t - a;
        if (Math.abs(diff) <= th && (sx === null || Math.abs(diff) < Math.abs(sx))) {
          sx = diff;
          gx = t;
        }
      }
    for (const t of [c.y, c.y + c.h / 2, c.y + c.h])
      for (const a of by) {
        const diff = t - a;
        if (Math.abs(diff) <= th && (sy === null || Math.abs(diff) < Math.abs(sy))) {
          sy = diff;
          gy = t;
        }
      }
  }
  return { dx: sx ?? 0, dy: sy ?? 0, gx, gy };
}
