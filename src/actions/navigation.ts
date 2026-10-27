/** Keyboard navigation between layers and frames. */
import { ancestry, getPage, siblings } from '../doc';
import { S } from './shared';
import { zoomToBox } from './camera';
import { topFrames } from './prototype';

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
