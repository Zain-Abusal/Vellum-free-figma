/** Boolean operations, flatten and masks. */
import { insert, makeNode, moveTo, removeNode, siblings } from '../doc';
import { liveBooleanRings, setAbsRings, toPolygons, type BoolOp } from '../geometry';
import { S, notifyMsg } from './shared';
import { topLevel } from './selection';

/**
 * Boolean ops create a live (non-destructive) boolean group, like Figma: the children stay editable
 * and the result updates as you move them. Flatten (⌘E) bakes it into a single vector.
 * The bottom-most layer's style becomes the group's paint.
 */
export function booleanOp(op: BoolOp) {
  const s = S();
  const ids = topLevel(s.doc, s.selection);
  if (ids.length < 2) return;
  const one = s.doc.nodes[ids[0]];
  // Changing the operation of an existing boolean group.
  if (ids.length === 1 && one.booleanOp) return s.update((d) => void (d.nodes[one.id].booleanOp = op));
  const first = s.doc.nodes[ids[0]];
  const sib = siblings(s.doc, first);
  const ordered = ids.filter((id) => s.doc.nodes[id].parentId === first.parentId).sort((a, b) => sib.indexOf(a) - sib.indexOf(b));
  const shapes = ordered.filter((id) => toPolygons(s.doc.nodes[id]) || s.doc.nodes[id].booleanOp);
  if (shapes.length < 2) return notifyMsg('Boolean operations need at least two closed shapes (rectangles, ellipses, closed vectors).');
  const base = s.doc.nodes[shapes[0]];
  let gid = '';
  s.update((d) => {
    const idx = Math.max(...shapes.map((id) => sib.indexOf(id)));
    const g = makeNode('group', base.pageId, {
      name: op[0].toUpperCase() + op.slice(1),
      booleanOp: op,
      fill: base.fill ?? '#d9d9d9',
      gradient: base.gradient,
      stroke: base.stroke,
      strokeWidth: base.strokeWidth,
      shadow: base.shadow,
    });
    insert(d, g, base.parentId, idx + 1);
    for (const id of shapes) moveTo(d, id, g.id, base.pageId);
    gid = g.id;
  });
  s.select([gid]);
}

/** Convert shapes to editable vector paths (⌘E). */
export function flattenSelection() {
  const s = S();
  const out: string[] = [];
  s.update((d) => {
    for (const id of topLevel(d, s.selection)) {
      const n = d.nodes[id];
      if (n.booleanOp) {
        // Bake a live boolean group into one vector.
        const rings = liveBooleanRings(d, n);
        const node = makeNode('path', n.pageId, { name: n.name, closed: true, fill: n.fill, gradient: n.gradient, stroke: n.stroke, strokeWidth: n.strokeWidth, shadow: n.shadow, opacity: n.opacity });
        node.rings = [];
        if (rings.length) setAbsRings(node, rings);
        insert(d, node, n.parentId, siblings(d, n).indexOf(id) + 1);
        removeNode(d, id);
        out.push(node.id);
        continue;
      }
      // Never flatten away content: frames with children, images and instances keep their layers.
      if (n.children.length || n.type === 'image' || n.type === 'instance' || n.type === 'text') continue;
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
