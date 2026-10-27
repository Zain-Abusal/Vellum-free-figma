/** Clipboard, delete, nudge, duplicate, copy/paste properties. */
import { cloneSubtree, isFrameLike, moveDeep, removeNode, siblings } from '../doc';
import type { SceneNode } from '../types';
import { S } from './shared';
import { setProps, topLevel } from './selection';

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

export const STYLE_KEYS: (keyof SceneNode)[] = ['fill', 'gradient', 'stroke', 'strokeWidth', 'radius', 'opacity', 'shadow', 'blur', 'blendMode', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textDecoration', 'textAlign'];

export let styleClipboard: Partial<SceneNode> | null = null;

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
