/** Prototype helpers and presentation. */
import { ancestry, getPage, isFrameLike } from '../doc';
import type { Doc, SceneNode } from '../types';
import { S } from './shared';

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
