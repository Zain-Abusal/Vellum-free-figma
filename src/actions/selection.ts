/** Selection helpers and Figma-style hit resolution. */
import { ancestry, getPage, isAncestor, siblings } from '../doc';
import type { Doc, SceneNode } from '../types';
import { S } from './shared';

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
