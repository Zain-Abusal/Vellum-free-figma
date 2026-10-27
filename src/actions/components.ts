/** Components, instances and variants. */
import { bbox, cloneSubtree, insert, makeNode, moveTo, nextName, removeNode, resizeTo, siblings } from '../doc';
import type { Doc, Pt, SceneNode } from '../types';
import { S, notifyMsg } from './shared';
import { worldCenter, zoomToBox } from './camera';
import { topLevel } from './selection';
import { wrap } from './structure';

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

/* Variants: a "component set" frame holds components named like "Size=Small, State=Hover". */

export const parseVariant = (name: string): Record<string, string> =>
  Object.fromEntries(
    name
      .split(',')
      .map((p) => p.split('=').map((x) => x.trim()))
      .filter((kv) => kv.length === 2 && kv[0]),
  );

export function variantSet(doc: Doc, componentId: string) {
  const m = doc.nodes[componentId];
  const set = m?.parentId ? doc.nodes[m.parentId] : null;
  if (!set?.componentSet) return null;
  const variants = set.children.map((id) => doc.nodes[id]).filter((v) => v?.type === 'component');
  const props: Record<string, string[]> = {};
  for (const v of variants)
    for (const [k, val] of Object.entries(parseVariant(v.name))) {
      props[k] ??= [];
      if (!props[k].includes(val)) props[k].push(val);
    }
  return { set, variants, props };
}

/** Combine selected components into a variant set (missing "Prop=Value" names are generated). */
export function combineAsVariants() {
  const s = S();
  const ids = topLevel(s.doc, s.selection).filter((id) => s.doc.nodes[id].type === 'component');
  if (ids.length < 2) return notifyMsg('Select two or more components to combine as variants.');
  const first = s.doc.nodes[ids[0]];
  let sid = '';
  s.update((d) => {
    const b = bbox(ids.map((id) => d.nodes[id]))!;
    const set = makeNode('frame', first.pageId, {
      name: first.name.split(',')[0].split('=')[0].trim() || 'Component set',
      componentSet: true,
      fill: null,
      stroke: '#0d9488',
      strokeDash: 4,
      radius: 6,
      clip: false,
      x: b.x - 20,
      y: b.y - 20,
      autoLayout: { direction: 'horizontal', gap: 20, padding: 20, align: 'start' },
    });
    insert(d, set, first.parentId, siblings(d, d.nodes[first.id]).indexOf(first.id) + 1);
    ids.forEach((id, i) => {
      const c = d.nodes[id];
      if (!c.name.includes('=')) c.name = `Variant=${i === 0 ? 'Default' : c.name.replace(/^Component\s*/, '') || i + 1}`;
      moveTo(d, id, set.id, first.pageId);
    });
    sid = set.id;
  });
  s.select([sid]);
}

/** Swap an instance to the variant matching the changed property (best match on the rest). */
export function switchVariant(instanceId: string, prop: string, value: string) {
  const s = S();
  const inst = s.doc.nodes[instanceId];
  const vs = inst && variantSet(s.doc, inst.componentId ?? '');
  if (!vs) return;
  const want = { ...parseVariant(s.doc.nodes[inst.componentId!].name), [prop]: value };
  let best: SceneNode | null = null;
  let bestScore = -1;
  for (const v of vs.variants) {
    const p = parseVariant(v.name);
    if (p[prop] !== value) continue;
    const score = Object.entries(want).filter(([k, val]) => p[k] === val).length;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  if (!best) return;
  const target = best;
  s.update((d) => {
    const n = d.nodes[instanceId];
    n.componentId = target.id;
    n.w = target.w;
    n.h = target.h;
    n.overrides = undefined;
  });
}
